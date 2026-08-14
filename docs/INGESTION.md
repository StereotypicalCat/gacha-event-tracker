# Ingestion Pipeline

Seven stages, run per source. Every stage writes its outcome to `ingest_runs` so a failure two days
ago can be diagnosed without re-running or re-paying.

```
fetch → clean → parse|extract → validate → reconcile → gate → publish
                                                        │
                                                        └──► quarantine
```

## The adapter contract

An adapter is the only per-game code. Everything downstream of `parse` is shared.

```ts
export interface Adapter {
  id: string;                    // 'genshin-wiki-events'
  game: GameId;
  url: string;
  strategy: "parser" | "llm" | "parser_then_llm";
  minIntervalMs?: number;        // default 6h

  /** Narrow the cleaned document to just the region containing event data. */
  select?(cleaned: string): string;

  /**
   * Deterministic parse. Return null to fall through to LLM extraction
   * (only meaningful when strategy is 'parser_then_llm').
   * Pure over its input — no network, no clock, no randomness. This is what
   * makes fixture tests possible.
   */
  parse?(cleaned: string, ctx: ParseContext): RawEvent[] | null;

  /** Extra instructions appended to the shared extraction prompt. */
  extractionHints?: string;

  /** Game-specific normalization: reset times, region offsets, patch cadence. */
  normalize(raw: RawEvent, ctx: ParseContext): GachaEvent;
}

export interface ParseContext {
  now: string;                   // injected, never Date.now() — keeps parse pure and testable
  sourceUrl: string;
  sourceId: string;
  game: GameId;
}
```

**`parse` must not read the clock.** It takes `now` from `ctx`. This is what lets a fixture test
assert exact output for a page captured last March.

### Choosing a strategy

| Source shape | Strategy |
|---|---|
| JSON API, or a stable HTML table with consistent headers | `parser` |
| Free-form patch notes, announcement prose, inconsistent markup | `llm` |
| Mostly-stable markup that occasionally changes | `parser_then_llm` |

Prefer `parser`. It is free, deterministic, and instantly testable. The LLM exists for sources that
genuinely cannot be parsed reliably, not as the default. A source with a clean API that goes through
the model is a bug.

## Stage 1 — fetch

- Send `If-None-Match` / `If-Modified-Since` from `sources.etag` / `last_modified`. A `304` ends
  the run as `skipped_unchanged` with zero further cost.
- `User-Agent: gacha-event-tracker/1.0 (+https://github.com/<owner>/gacha-event-tracker)`.
- Honor `robots.txt`. Cache the parsed robots per host for 24h.
- 20s timeout; retry twice with exponential backoff on 5xx and network errors; never retry 4xx.
- Store the raw bytes in `snapshots`.

On failure: increment `consecutive_failures`, leave published events untouched, end the run as
`failed`. A source being down never mutates the feed.

## Stage 2 — clean

Reduce the document before it costs anything. This stage is the second-biggest cost lever after the
content-hash skip.

- Drop `<script>`, `<style>`, `<svg>`, `<noscript>`, comments, nav, header, footer, and known
  wiki chrome (edit links, category boxes, reference lists).
- Collapse whitespace; convert tables to pipe-delimited text; keep headings as `#` markers so
  section structure survives.
- Apply `adapter.select()` if present to isolate the event region.
- Hash the result (sha256) → `content_hash`.

**If `content_hash` matches `sources.content_hash`, end the run as `skipped_unchanged`.** This is
the check that keeps a 6-hourly schedule from costing anything on a quiet week — most runs should
end here.

A typical wiki page goes from ~15k tokens raw to ~5k cleaned. Verify with `messages.count_tokens`
when tuning, not by guessing.

## Stage 3 — parse or extract

Per strategy. `parse` produces `RawEvent[]` directly. `extract` sends the cleaned text to
`claude-opus-5` with a structured-output schema — see `docs/LLM-EXTRACTION.md` for the request
shape, prompt, and cost rules.

`parser_then_llm` calls `parse` first and falls through to `extract` only when it returns `null`.
When that fallthrough happens, log it loudly: it means the source changed shape and the parser needs
updating. A `parser_then_llm` source that is silently always falling through is paying LLM prices
for a parser that no longer works.

## Stage 4 — validate

Zod parse against `GachaEvent`, then calendar sanity rules. Anything failing a hard rule goes to
quarantine with `reason: 'sanity_failed'` — never to the feed.

**Hard rules (reject):**

| Rule | Rationale |
|---|---|
| `endsAt > startsAt` when both present | A backwards interval is always a parse error |
| Duration ≤ 180 days | Patch cycles are ~6 weeks; 180d means a year was misread as a range |
| `startsAt` within [now − 2y, now + 1y] | Catches century typos and relative-date misreads |
| `endsAt` null ⟺ `endPrecision === "unknown"` | The two fields must agree |
| `regionEnds` non-null ⟺ `regionScoped` | Same |
| All `regionEnds` values within 24h of each other | Region resets differ by hours, not days |
| `title` non-empty, ≤ 200 chars, not a placeholder ("TBD", "Event", "Unknown") | Catches header rows scraped as events |

**Soft rules (reduce confidence, do not reject):**

- Duration under 1 hour or over 60 days → −0.2
- `startPrecision` or `endPrecision` is `"day"` → −0.1
- Title very similar to another event in the same batch → −0.15 (likely a duplicate row)

## Stage 5 — reconcile

Diff the validated candidates against currently published events for this source.

1. **Exact ID match** → compare fields. Unchanged: no-op. Changed: candidate update.
2. **Near match** — same game, date windows overlap, title similarity ≥ 0.85 — → treat as an update
   to the existing event, **keeping the existing ID**. This is what survives a wiki renaming an
   event without orphaning every user's completion mark.
3. **No match** → new event.
4. **Published event absent from this run's candidates** → mark `status = 'delisted'`. Do not
   delete.

**Conflict detection.** A candidate that changes an already-published `endsAt` by more than 24 hours
is a `date_conflict`. This is the case worth being paranoid about: the user may have already planned
around the old date, and a silent shift is exactly the failure the product exists to prevent. Route
it to quarantine regardless of confidence.

### Scoring

Confidence is computed here, from evidence — **not** taken from the model's self-report. A model
saying "confidence: 0.95" is a token prediction, not a measurement.

```
base            parser → 0.95        llm → 0.70
+0.15  the same event was extracted identically from a previous run
+0.10  both timestamps have precision "exact"
+0.10  a second source for the same game corroborates within 1 hour
−0.20  any soft rule fired
−0.30  this is a date_conflict against a published event
```

Clamp to [0, 1]. `CONFIDENCE_THRESHOLD` (default 0.8) is the gate.

## Stage 6 — gate

| Condition | Destination |
|---|---|
| `confidence >= CONFIDENCE_THRESHOLD` and no conflict | publish |
| `confidence < CONFIDENCE_THRESHOLD` | quarantine — `low_confidence` |
| `date_conflict` | quarantine — `date_conflict`, with `conflicts_with` set |
| failed a hard rule | quarantine — `sanity_failed` |
| new event type or field the schema does not recognize | quarantine — `novel_shape` |

A quarantined event does not block its siblings. If eight events in a run pass and two are held, the
eight publish.

## Stage 7 — publish

Upsert by ID inside a transaction. Bump `version` and `updatedAt` only when a field actually
changed — an unchanged run must not churn `updatedAt`, or the freshness badge (PRD F7) becomes
meaningless. Update `sources.content_hash`, `etag`, `last_success_at`, and reset
`consecutive_failures`.

## The review gate

Quarantined events surface at `GET /review` on the admin listener (`127.0.0.1:ADMIN_PORT`). See
`docs/ARCHITECTURE.md` § Why `/review` needs no auth — the routes are simply not registered on the
public listener.

The review UI shows, per held event: the parsed fields, the reason and detail, the conflicting
published event side-by-side when applicable, a link to the source, and the exact cleaned text
excerpt the extraction came from. A reviewer needs to answer "is this date right?" without leaving
the page.

- `POST /api/review/:id/approve` — writes to `events` with `extraction_method: 'manual'` and
  `confidence: 1.0`, and stamps `resolved_at` / `resolution`.
- `POST /api/review/:id/reject` — stamps resolution only. The event is not published, and the same
  candidate will be re-held on the next run if the source has not changed.

Approving with edits is supported: the reviewer can correct a date before approving. That corrected
value is the one that publishes.

**Quarantine depth is the health signal for the whole pipeline.** A growing queue means a source
changed shape or the prompt regressed. `/api/health` exposes the count; watch it.

## Testing

Every adapter ships:

1. `fixtures/<game>/<source>-<YYYY-MM-DD>.html` — a real captured page.
2. `fixtures/<game>/<source>-<YYYY-MM-DD>.expected.json` — the exact `GachaEvent[]` it should
   produce.
3. A test running `parse` + `normalize` against the fixture with a pinned `ctx.now`, asserting
   deep equality.

`bun test` must pass with no network access. When a source changes shape, capture a new fixture
alongside the old one and keep both — the old fixture is the regression test proving the parser
still handles the previous format.

Validator rules get their own unit tests with deliberately broken inputs: backwards intervals,
1000-year durations, `endsAt` set with `endPrecision: "unknown"`. These rules are the last line of
defense before a wrong date reaches a user; test them like it.
