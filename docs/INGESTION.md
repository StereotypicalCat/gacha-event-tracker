# Ingestion Pipeline

Six stages, run per source. Every stage writes its outcome to `ingest_runs` so a failure two days
ago can be diagnosed without re-running.

```
fetch → parse → merge → validate → reconcile → gate → publish
                                                  │
                                                  └──► quarantine
```

## No LLM

Event data is extracted by deterministic code only. There is no model call anywhere in this
pipeline, no API key, and no per-run cost.

This is a deliberate constraint, not an omission:

- A source that cannot be parsed deterministically **does not get an adapter.** Report it rather
  than reaching for inference.
- Parser output is reproducible — the same fixture always yields the same events, which is what
  makes the fixture tests meaningful.
- Iterating is free and offline: `bun run parse <adapter-id> <fixture>`.

If a source's markup is too unstable to parse, the answer is a different source, not a model.

## Three layers: parsers, adapters, merge

The layering is what makes a second, third, or tenth source cheap.

| Layer | Answers | Lives in | Scope |
|---|---|---|---|
| **Parser** | "How is this *site* laid out?" | `src/ingest/parsers/` | One site template, many games |
| **Adapter** | "Which URL, for which game, via which parser?" | `src/ingest/adapters/index.ts` | One page |
| **Merge** | "These sources disagree — now what?" | `src/ingest/merge.ts` | One game, many sources |

Consequences worth internalising:

- Adding a source for a site already parsed = **one entry in `SOURCES`**. No new parsing code.
- Adding a new *site* = one parser module + its `PARSERS` entry, then adapters as above.
- A game may have any number of sources. `parseGame(game, documents, now)` runs them all and
  merges.

### Parsers in the tree

| Parser | Site | Sources using it |
|---|---|---|
| `game8` | game8.co article calendars | Genshin, Star Rail, Wuthering Waves, ZZZ, Endfield, NTE, Infinity Nikki, Persona 5: The Phantom X |
| `wikigg` | wiki.gg MediaWiki `mp-event` templates | Endfield |
| `akwiki` | arknights.wiki.gg's `mrfz-wtable` "Ongoing/upcoming" table | Arknights |

`wikigg` is the better shape by a distance: it emits ISO timestamps with one timer per server
region, so its events carry exact precision and real `regionEnds`. Prefer a source like that over a
prose wiki when both exist, and give it a higher `priority`.

`akwiki` shares a host family with `wikigg` and nothing else — arknights.wiki.gg has no `mp-event`
cards, so the two are separate modules rather than one parser with a branch. Two things about that
page shape are worth knowing before touching it:

- **Every row states two schedules, CN and Global, about five months apart.** Only Global is
  published. A row with no Global line yields no event rather than borrowing the CN one.
- **Only the next boundary is machine-readable.** The countdown sits on the end while an event runs
  and on the start while it is still upcoming, so one side is exact and the other is the table's
  date — and which is which flips when the event goes live. An exact instant is therefore accepted
  only when it falls on the same UTC day as the date beside it, because `startsAt.slice(0, 10)` is
  part of the event ID and a start that moved a day would orphan every completion mark on the
  morning the event began.

### Date formats understood

All live in `src/ingest/dates.ts`, each returning null rather than inferring anything:

| Function | Shape | Seen on |
|---|---|---|
| `parseMonthDayYear` | `August 12, 2026` | Genshin detail rows |
| `parseMonthDayRange` | `August 12 - September 21, 2026` (year on the end only) | Genshin, NTE |
| `parseFullRange` | `Aug. 14, 2026 - Aug. 24, 2026` (a year each side) | Star Rail, Wuthering Waves |
| `parseShortSlashRange` | `08/09/26 - 08/30/26` | Endfield |
| `parseSlashDateTimeRange` | `2021/01/16 04:00 - 2021/01/31 03:59` | Genshin past events |
| `parseLabelledStartEnd` | `Start: January 24, 2025 End: Permanent` | Infinity Nikki |
| `parseAdjacentFullRange` | `July 30, 2026 August 13, 2026` (halves split by an `<hr>`) | Persona 5: The Phantom X |
| `parseYearFirstSlashRange` | `2026/07/30 – 2026/08/20` (year first, so field order is not inferred) | Arknights |
| `parseOrdinalDateTimeRange` | `November 9th, 05:00 - December 4th, 2023, 04:59 (UTC-5)` (ordinal days, stated offset) | Reverse: 1999 |
| `parseOpenRange` | `Jul. 24, 2026 - End of 4.6`, `July 10, 2026 - Permanent` | Star Rail, Wuthering Waves |

`parseOpenRange` is tried last because it is the most permissive — it accepts any leading full date
and reports no end.

The last two are anchored at both ends and require a year on each half, which is what keeps them from
eating prose. `August 12, 2026 Day 3 rewards are doubled` would otherwise read "Day 3" as an end, and
`June 25, 2026 July 16/30, 2026` names *two* candidate ends — so it takes neither, and the leftover is
not shown as a summary either (a date the parser refused to trust must not reappear dressed as
information).

### The parser interface

```ts
export interface SourceParser {
  id: string;                                   // "game8"
  label: string;                                // "Game8"
  canParse(html: string): boolean;              // structural sanity check
  parse(html: string, ctx: ParseContext): GachaEvent[];
}
```

`canParse` is the redesign tripwire. Without it, a site rewrite makes every selector miss and the
parser returns zero events — which reads downstream as "this game has no events" rather than as a
failure. The adapter throws when `canParse` is false, so the run fails loudly and the previously
published events stay put.

Keep `canParse` structural, not content-based, and **do not over-fit it**. Game8's own pages differ
in attribute quote style (`class="a-table"` on Genshin, `class='a-table'` on NTE), which is exactly
the kind of variation a naive check gets wrong. Every regex in `html.ts` is attribute-agnostic for
the same reason.

### The adapter registry

```ts
const SOURCES: SourceSpec[] = [
  { id: "genshin-game8-events", game: "genshin",
    url: "https://game8.co/games/Genshin-Impact/archives/301601", parserId: "game8" },
  { id: "nte-game8-events", game: "nte",
    url: "https://game8.co/games/Neverness-to-Everness/archives/592073", parserId: "game8" },
];
```

`priority` (default 0) breaks ties when two sources disagree and neither is clearly better — give
official feeds a higher number than community wikis. Adapter ids are `"<game>-<site>-<page>"` and
are recorded on every event as `sourceId`, so any row in the feed traces back to the source that
produced it.

### Assessing a new source

| Source shape | Verdict |
|---|---|
| JSON API, or an HTML table with consistent headers | Good — write the adapter |
| Label/value or column tables with full dates including a year | Good — an existing parser may already handle it |
| Dates without a year, or no end date at all | **Unsupportable** — yields nothing rather than guessing |
| Free-form prose with no table structure | Find a different source |

Game8 uses at least four page templates and a game's page may use any of them:

1. **Label/value detail tables** — `Event Start` / `Event End` rows under a per-event `h3`, full
   dates with year. *(Genshin Impact)*
2. **Column tables** — `Event | Duration | Event Details | Rewards`, one row per event, under a
   section heading. *(Neverness to Everness)*
3. **Image-grid schedules** — a bare `MM/DD`, no year, no end date. **Unsupportable.**
4. **Combined cells** — one cell holding label, range and blurb
   (`Period: 08/09/26 - 08/30/26 During the event...`). *(Arknights: Endfield)*
5. **Rowspan Start/End pairs** — the event name spans two rows, so a flat cell reader sees
   `[title, "Start", date]` then `["End", date]`. *(Zenless Zone Zero)*
6. **Labelled cells** — one cell holding `Start: <date>` and `End: <date>` split by a `<br>`, where
   the end half is often the word `Permanent`. *(Infinity Nikki)*
7. **`<hr>`-separated pairs** — a `Event | Duration` table whose two dates are divided by a rule
   rather than a dash, so a tag-stripping reader sees only whitespace between them. The same page
   repeats each live event under its own `h3` with `Start Date` / `End Date` rows and a paragraph of
   prose; those corroborate the dates and supply the blurb the flat table lacks.
   *(Persona 5: The Phantom X)*

Shapes 1, 2, 4, 5, 6 and 7 are handled. Before assuming a new Game8 page will work, dump its heading/table
structure and check which shape it uses — and check **every** table, not just the obvious one.
Endfield was written off as undatable on a first pass that only inspected its `Duration` rows; its
two real events were in a table further down.

**Check what ends a section, too.** Headings decide inclusion and the level is not consistent: Persona
5 puts its whole finished back catalogue behind an `<h4>Finished Events</h4>` inside a collapsed
accordion, so a reader that ignores `h4` publishes fifty dead events. Genshin uses `h4` the opposite
way — for sub-headings *within* one event ("Availability Period") — so an unrecognised `h4` gates the
section but must never claim the event title.

## Stage 1 — fetch

- Send `If-None-Match` / `If-Modified-Since` from `sources.etag` / `last_modified`. A `304` ends
  the run as `skipped_unchanged`.
- `User-Agent: gacha-event-tracker/1.0 (+https://github.com/<owner>/gacha-event-tracker)`.
- Honor `robots.txt`; cache parsed robots per host for 24h. **Fail closed** — a `robots.txt` that
  5xxs or times out means "do not fetch", because a permission we could not read is not a
  permission we have. A 404 means no restrictions.
- 20s timeout. **No retries**: a retry is a second request, and AGENTS.md § Scraping conduct says
  one per source per cycle. A failed source waits for the next cycle instead.
- **Only `200` is a page** (plus `304` for "unchanged"). Not `response.ok` — that admits the whole
  2xx range, and `202 Accepted` is what an edge bot-manager answers with while it serves a challenge
  instead of the wiki. Admitting it fed that challenge page to the parser, which reported "yielded 0
  events" — the symptom, with the status that explained it unmentioned. `204` has no body and `206`
  is a fragment; none of them is a document.
- **Space requests to a host we have already asked this cycle** — the host's `Crawl-delay` if it
  states one, else `DEFAULT_HOST_GAP_MS` (2s). The wait is taken after the interval and robots gates,
  so a source we then skip costs nothing.
- Store raw bytes in `snapshots/<source-id>.html`, with hash/ETag/Last-Modified alongside it.

On failure: increment the failure streak, leave published events untouched, end as `failed`. A
source being down never mutates the feed. A non-`ok` status also records what turned us away — the
`Server` header, whether a `CF-Ray` was present, any `Retry-After` — because a bare `HTTP 403` reads
identically whether the page moved behind a login or a CDN decided the runner is a bot farm.

**The failure streak is read, not just written.** `consecutiveFailures` reaching
`BROKEN_AFTER_FAILURES` (3, so ~36h at two cycles a day) promotes a source from "down" to `broken`:
annotated on the run page, listed in the job summary with its status code, and counted in the
`broken` step output that `refresh.yml` fails on *after* committing. See AGENTS.md § Scraping
conduct for why that ordering is load-bearing.

**Built: `scripts/refresh-sources.ts`** (`bun run refresh`), scheduled by
`.github/workflows/refresh.yml`. It takes its adapters, store, robots gate, fetch and clock by
injection, so the whole runner is tested offline against a fake fetch. A fetched body is *rejected*
— the previous snapshot survives — when it fails `canParse`, throws, or yields zero events; storing
an empty parse would make the feed build prefer it over the fixture and silently empty a game's
calendar. One source down is a warning and exit 0; every source failing is exit 1, so CI never
commits a cycle that learned nothing.

## Stage 2 — parse

Hash the raw body (sha256) → `content_hash`. **If it matches `sources.content_hash`, end as
`skipped_unchanged`** and do no further work.

Otherwise call `adapter.parse(html, ctx)`, which runs `canParse` and then the parser. Because
parsers are pure, this stage is fully reproducible offline against the stored snapshot:

```
bun run parse <adapter-id> fixtures/<game>/<source>-<date>.html
```

**Watch the event count.** A source that changes date format or table shape makes events vanish with
no error — the parser simply matches nothing. Compare each run's `events_seen` against the previous
run and flag a large drop. A source that went from 13 events to 2 has broken, not quieted down.
This is the most likely real failure mode of a parser-only pipeline, and nothing else surfaces it.

### Stage 2.5 — sanitize

Everything a parser returns came from a page we do not control, and it is about to become React
text, JSON on disk, a `localStorage` key and eventually a SQLite row. `src/ingest/sanitize.ts` is
the trust boundary, applied in `toAdapter()`'s `parse` wrapper in `src/ingest/adapters/index.ts` —
the one seam every source passes through, so a source added tomorrow is sanitized without its
author doing anything and no parser can opt out. It runs after `canParse` and before validation.

What it does: removes script/style/comment content and residual tags; decodes entities **to a fixed
point** so `&amp;lt;script&amp;gt;` cannot resurrect as markup in a later decoder; NFKC-normalizes;
strips control, zero-width and bidi-override characters (an RTL override visually spoofs a title);
collapses whitespace; truncates to the schema's own caps at a word boundary; and requires
`sourceUrl` to be absolute http(s), falling back to the source's registered URL rather than
dropping the event.

Three constraints it holds:

- **It never touches a date.** Not a timestamp, not a precision, not `regionEnds`. Dates are the
  product's promise and the sanitizer's job stops at prose and URLs.
- **It cleans rather than drops.** The only drop is a title that sanitizes to nothing, and every
  repair and drop emits a note whose default sink is `console.warn` — silence is not something a
  future caller gets for free (§ Silent drops).
- **It does not move event IDs.** An ID is recomputed only when sanitizing actually changed the
  title *and* the incoming ID was minted the standard way. All seven fixtures pass through with
  zero repairs and byte-identical output, which is the regression guard: IDs are localStorage keys
  and moving one orphans a reader's marks with no server-side recovery.

## Stage 3 — merge

Only meaningful when a game has more than one source; a single-source game passes straight through.

`mergeEvents(groups)` compares events across sources:

1. **Same ID** → same event; keep the higher-confidence copy.
2. **Near match** — same game, title similarity ≥ 0.80, starts within 24h — → same event under
   different titles; keep the higher-confidence copy.
3. **Otherwise** → distinct events; keep both.

Title similarity alone would merge a rerun with its original, since reruns reuse the name. The
start-date proximity check is the actual guard; the title threshold is deliberately loose (0.80) so
that "Stygian Onslaught" and "Stygian Onslaught Event" collapse into one row rather than showing
the user a duplicate.

**Agreement raises confidence (+0.10) only across different `sourceId`s.** The same row seen twice
in one document is not corroboration.

**Disagreement is surfaced, never averaged.** Two sources whose `endsAt` differ by more than 24
hours produce a `conflicts` entry; the pipeline routes those to quarantine. Splitting the difference
between two dates would produce a value neither source asserts — the worst possible answer for a
product whose promise is date accuracy.

## Stage 4 — validate

Zod parse against `GachaEvent`, then calendar sanity rules. Anything failing a hard rule goes to
quarantine with `reason: 'sanity_failed'` — never to the feed.

**Hard rules (reject):**

| Rule | Rationale |
|---|---|
| `endsAt` after `startsAt` when both present | A backwards interval is always a parse error |
| Duration under 180 days | Patch cycles are ~6 weeks; longer means a misread year |
| `startsAt` within [now − 2y, now + 1y] | Catches century typos and relative-date misreads |
| `endsAt` null exactly when `endPrecision` is `"unknown"` | The two fields must agree |
| `regionEnds` non-null exactly when `regionScoped` | Same |
| All `regionEnds` values within 24h of each other | Region resets differ by hours, not days |
| `title` non-empty, ≤ 200 chars, not a placeholder | Catches header rows scraped as events |

Rules 1, 4, and 5 are enforced by `GachaEvent` itself in `src/shared/schema.ts`, so they cannot be
bypassed by constructing an event object directly.

**Soft rules (reduce confidence, do not reject):**

- Duration under 1 hour or over 60 days → −0.2
- Title very similar to another event in the same batch → −0.15 (likely a duplicate row)

## Stage 5 — reconcile

Diff validated candidates against currently published events.

1. **Exact ID match** → compare fields. Unchanged: no-op. Changed: update.
2. **Near match** → update the existing event, **keeping the existing ID**. This is what survives a
   wiki renaming an event without orphaning every user's completion mark.
3. **No match** → new event.
4. **Published event absent from this run** → mark `status = 'delisted'`. Never delete.

**Conflict detection.** A candidate moving an already-published `endsAt` by more than 24 hours is a
`date_conflict`. The user may have planned around the old date, so route it to quarantine regardless
of confidence.

### Scoring

Confidence records how firmly the sources pinned an event down, so the gate can hold back weak
cases. The parser assigns a base score; merge and reconcile adjust it.

```
base                                          0.95
−0.05  a boundary is day-precision rather than exact
−0.15  the end date is unknown (endsAt null)
+0.10  an independent source corroborates
+0.15  identical event parsed in a previous run
−0.20  any soft rule fired
−0.30  a date_conflict against a published event
```

Clamp to [0, 1]. `CONFIDENCE_THRESHOLD` (default 0.8) is the gate. Under the current parser a
day-precision event with a known end scores 0.85 and publishes, while one with an unknown end
scores 0.75 and is held — the intended bias.

## Stage 6 — gate and publish

| Condition | Destination |
|---|---|
| Confidence at or above threshold, no conflict | publish |
| Confidence below threshold | quarantine, `low_confidence` |
| Cross-source or cross-run date disagreement | quarantine, `date_conflict` |
| Failed a hard rule | quarantine, `sanity_failed` |
| Shape the schema does not recognise | quarantine, `novel_shape` |

A quarantined event does not block its siblings — if eight pass and two are held, the eight publish.

Publish upserts by ID in a transaction. Bump `version` and `updatedAt` only when a field actually
changed, or the freshness badge (PRD F7) becomes meaningless. Update `sources.content_hash`,
`etag`, `last_success_at`, and reset `consecutive_failures`.

## The review gate

Quarantined events surface at `GET /review` on the admin listener (`127.0.0.1:ADMIN_PORT`). See
`docs/ARCHITECTURE.md` § Why `/review` needs no auth.

- `POST /api/review/:id/approve` — writes to `events` with `extraction_method: 'manual'`,
  `confidence: 1.0`. Approving with edits is supported; the corrected value publishes.
- `POST /api/review/:id/reject` — stamps resolution only. The candidate is held again next run if
  the source has not changed, which is intended.

**Quarantine depth is the pipeline's health signal.** A growing queue means a source changed shape.
`/api/health` exposes the count.

## Testing

Every adapter ships:

1. `fixtures/<game>/<source>-<YYYY-MM-DD>.html` — a real captured page.
2. `fixtures/<game>/<source>-<YYYY-MM-DD>.expected.json` — the exact `GachaEvent[]` it produces.
3. A test running `parse` against the fixture with a pinned `ctx.now`, asserting deep equality.

`bun test` must pass with no network access.

**Regenerating `.expected.json` from the parser makes the test self-consistent, not correct.** After
an intentional change, re-verify a sample against the live page — and ideally extract the same data
a second way (a throwaway script over the fixture) to confirm counts and dates independently. That
independent check is what caught the exact event counts for both current adapters.

When a source changes shape, capture a new fixture **alongside** the old one and keep both — the old
fixture is the regression test proving the parser still handles the previous format.

`test/dates.test.ts` covers the cases that matter most: a missing year returns null rather than
guessing, impossible calendar dates are rejected, ranges crossing New Year roll the start year back,
and abbreviated months parse. `test/merge.test.ts` covers cross-source agreement, disagreement, and
rerun disambiguation. These are the last line of defense before a wrong date reaches a user.
