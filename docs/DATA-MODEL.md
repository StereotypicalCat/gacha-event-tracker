# Data Model

`src/shared/schema.ts` is the single source of truth. TypeScript types are derived with
`z.infer<>` — never hand-write an interface that duplicates a schema.

## The Event

```ts
import { z } from "zod";

export const GameId = z.enum([
  "genshin", "hsr", "zzz", "wuwa", "arknights", "endfield", "nte",
]);

export const EventType = z.enum([
  "banner",       // limited character/weapon rate-up
  "story",        // main or side story chapter, limited-time
  "rerun",        // returning event
  "challenge",    // combat/endgame cycle (Abyss, Memory of Chaos, ...)
  "login",        // login rewards / check-in
  "shop",         // limited shop or exchange window
  "maintenance",  // server downtime
  "other",
]);

export const Region = z.enum(["asia", "america", "europe"]);

/** How much we actually know about a boundary timestamp. */
export const Precision = z.enum([
  "exact",        // sourced to the minute
  "day",          // date known, time-of-day inferred from the game's reset
  "unknown",      // genuinely not announced — endsAt is null
]);

export const GachaEvent = z.object({
  id: z.string(),                       // `${game}:${slug}:${YYYY-MM-DD}` — see Stability below
  game: GameId,
  title: z.string().min(1).max(200),
  type: EventType,
  summary: z.string().max(500).nullable(),

  startsAt: z.string().datetime(),      // UTC ISO 8601, always
  startPrecision: Precision,
  endsAt: z.string().datetime().nullable(),
  endPrecision: Precision,

  /** True when the end time follows each region's daily reset rather than a global instant. */
  regionScoped: z.boolean(),
  /** Populated only when regionScoped; per-region resolved UTC instants. */
  regionEnds: z.record(Region, z.string().datetime()).nullable(),

  sourceUrl: z.string().url(),
  sourceId: z.string(),                 // which adapter/source produced this

  status: z.enum(["published", "delisted"]),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["parser", "manual"]),

  version: z.number().int().positive(),
  firstSeenAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GachaEvent = z.infer<typeof GachaEvent>;
```

### Field notes that matter

**`endsAt: null` is a first-class state, not an error.** Many events are announced with "duration
TBD" or "until the next version update". The correct representation is `endsAt: null` with
`endPrecision: "unknown"`. The extractor is instructed to produce this and the UI renders it
distinctly (PRD F1). Filling in a plausible date instead is the single worst bug this codebase can
ship.

**`regionScoped` + `regionEnds`.** Character banners end at one global instant — `regionScoped:
false`, `regionEnds: null`. Story and login events end at each region's daily reset — `regionScoped:
true`, with `regionEnds` carrying the three resolved UTC instants. The client picks one using the
user's stored region (PRD F5). Collapsing these into a single timestamp loses up to 13 hours of
accuracy and will make the countdown wrong for two thirds of users.

**`confidence`** is assigned by the parser and adjusted during merge and reconciliation — see
`docs/INGESTION.md` § Scoring. It records how firmly the sources pinned the event down.

**`status: "delisted"`** means the event stopped appearing at its source. It is never deleted,
because a source outage would otherwise silently empty the calendar. Delisted events are excluded
from the API feed but retained for debugging and for the case where a source flickers.

### ID stability — read before changing

```
`${game}:${slugify(title)}:${startsAt.slice(0, 10)}`
→ "genshin:windblume-festival:2026-03-14"
```

**Event IDs are the localStorage keys for completion state.** Changing the scheme orphans every
completion mark every user has ever made, silently, with no error and no way to recover it
server-side (the server never had the data). If the scheme must change, ship a client-side
migration that reads the old keys and remaps them, and keep that migration for at least a year.

The date suffix disambiguates reruns of the same event. Title is slugified from the *source's*
title, so a wiki renaming an event creates a new ID — reconciliation detects this as a near-match
(same game, overlapping dates, high title similarity) and treats it as an update rather than a new
event, preserving the original ID.

## SQLite schema

```sql
-- Published feed. One row per event.
CREATE TABLE events (
  id                TEXT PRIMARY KEY,
  game              TEXT NOT NULL,
  title             TEXT NOT NULL,
  type              TEXT NOT NULL,
  summary           TEXT,
  starts_at         TEXT NOT NULL,
  start_precision   TEXT NOT NULL,
  ends_at           TEXT,
  end_precision     TEXT NOT NULL,
  region_scoped     INTEGER NOT NULL DEFAULT 0,
  region_ends       TEXT,               -- JSON object or NULL
  source_url        TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'published',
  confidence        REAL NOT NULL,
  extraction_method TEXT NOT NULL,      -- 'parser' | 'manual'
  version           INTEGER NOT NULL DEFAULT 1,
  first_seen_at     TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_events_ends   ON events (ends_at) WHERE status = 'published';
CREATE INDEX idx_events_game   ON events (game, starts_at);
CREATE INDEX idx_events_window ON events (starts_at, ends_at);

-- Candidates held back by the review gate. Same shape plus why.
CREATE TABLE events_quarantine (
  id             TEXT PRIMARY KEY,
  payload        TEXT NOT NULL,        -- full GachaEvent JSON
  reason         TEXT NOT NULL,        -- 'low_confidence' | 'date_conflict' | 'sanity_failed' | 'novel_shape'
  detail         TEXT NOT NULL,        -- human-readable explanation for the reviewer
  conflicts_with TEXT,                 -- events.id, when reason = 'date_conflict'
  run_id         TEXT NOT NULL REFERENCES ingest_runs(id),
  created_at     TEXT NOT NULL,
  resolved_at    TEXT,
  resolution     TEXT                  -- 'approved' | 'rejected' | NULL
);
CREATE INDEX idx_quarantine_open ON events_quarantine (created_at) WHERE resolved_at IS NULL;

-- One row per configured source.
CREATE TABLE sources (
  id               TEXT PRIMARY KEY,   -- '<game>-<site>-<page>', e.g. 'genshin-game8-events'
  game             TEXT NOT NULL,
  url              TEXT NOT NULL,
  parser_id        TEXT NOT NULL,      -- parser template id, e.g. 'game8'
  priority         INTEGER NOT NULL DEFAULT 0,
  min_interval_ms  INTEGER NOT NULL DEFAULT 21600000,
  etag             TEXT,
  last_modified    TEXT,
  content_hash     TEXT,               -- sha256 of cleaned content; the skip check
  last_success_at  TEXT,
  last_attempt_at  TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  health           TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'degraded' | 'failing'
  lock_holder      TEXT,
  lock_expires_at  TEXT
);

-- One row per pipeline execution. The audit trail.
CREATE TABLE ingest_runs (
  id              TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES sources(id),
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  outcome         TEXT,               -- 'published' | 'skipped_unchanged' | 'quarantined' | 'failed'
  stage_failed    TEXT,
  error           TEXT,
  events_seen     INTEGER DEFAULT 0,
  events_changed  INTEGER DEFAULT 0,
  events_held     INTEGER DEFAULT 0
);

-- Cached raw snapshots so re-parsing never re-fetches.
CREATE TABLE snapshots (
  content_hash TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  raw          BLOB NOT NULL,
  cleaned      TEXT NOT NULL
);
```

`region_ends` and `payload` hold JSON as TEXT; parse them through the Zod schema on read so a
malformed row surfaces at the boundary rather than deep in the UI.

## Client-side storage

Namespaced, versioned, and small. Nothing here ever goes to the server.

```ts
"gacha-tracker:v1:progress"     // { [eventId]: { status?, effort?, note?, at } }
"gacha-tracker:v1:ignored"      // { [eventId]: { at } }  — "stop showing me this"
"gacha-tracker:v1:prefs"        // { region, hiddenGames[], showCompleted, showIgnored,
                                //   regionConfirmed, onboarded }
"gacha-tracker:v1:completions"  // SUPERSEDED — read once to migrate, never written
```

`progress` is everything the reader says about an event themselves:

| Field | Values | Meaning |
|---|---|---|
| `status` | `"doing"` \| `"done"` \| absent | Where they are with it |
| `effort` | `"quick"` \| `"short"` \| `"long"` \| `"grind"` \| absent | How much work they reckon it is |
| `note` | free text | Anything worth remembering |

An entry with none of the three set is deleted rather than kept, so the store stays a set of things
the reader actually said something about.

**`effort` is load-bearing, not decorative.** Combined with the time remaining it answers "can I
still finish this?" — the same two days is comfortable for a `quick` event and hopeless for a
`grind`. See `src/shared/effort.ts`; the runway heuristic assumes about an hour of play a day, is
stated as a guess in the UI, and never hides or reorders anything.

**An event with no recorded effort never gets a warning.** Inferring an estimate in order to warn
about it would be fabricating the reader's own input.

Ignores stay in a separate store because they mean something different: a done event is dimmed and
still counted, an ignored one disappears from both views.

### Migration from `completions`

`completions` used membership to mean "done", which cannot express "started". `progress` replaces it
and is seeded from it once, on first load, mapping each entry to `status: "done"`.

**The old key is never written to and never deleted.** Someone who last opened the app six months
ago still has their marks under it, these live only in the browser, and nothing else holds a copy to
restore from. Exports produced before the change are still accepted on import and mapped forward the
same way.

Offline caching is the service worker's job, not localStorage's — it caches the feed response
itself, so there is no second copy of the events to keep in sync.

The `v1` segment is the migration hook. On boot, the client checks for keys at older versions and
migrates them forward before reading. **Never delete an old-version key until the migration has
shipped and run** — a user who has not opened the app in six months still has their data under the
old key.

### Export format (PRD F6)

```json
{
  "format": "gacha-tracker-export",
  "version": 1,
  "exportedAt": "2026-08-14T12:00:00.000Z",
  "progress": {
    "genshin:windblume-festival:2026-03-14": { "status": "done", "at": "..." },
    "hsr:garden-of-plenty:2026-08-14": { "status": "doing", "effort": "grind", "at": "..." }
  },
  "ignored": { "zzz:some-event-i-skip:2026-08-19": { "at": "..." } },
  "prefs": { "region": "europe", "hiddenGames": [], "onboarded": true }
}
```

Import **merges** both sets: a mark present in either the file or the current device survives, and
import never removes one. Losing a user's marks to a bad import is unrecoverable, so the merge is
deliberately one-directional. A file whose `format` is unrecognised is refused outright rather than
partly applied.

## Schema versioning

`/api/events` responses carry `{ schemaVersion: 1, generatedAt, events: [...] }`. The client
refuses to render a `schemaVersion` it does not know and shows a "refresh the page" prompt instead
of guessing at unfamiliar fields. Additive fields do not bump the version; removing or retyping a
field does.
