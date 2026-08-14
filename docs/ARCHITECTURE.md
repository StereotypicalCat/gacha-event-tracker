# Architecture

## Shape

One Bun process serves the static React build, exposes a read-only JSON API, and runs the
ingestion scheduler on a timer. SQLite is the only datastore. There is no auth layer because there
are no users.

```
                    ┌──────────────────────────────────────────────┐
   game wikis  ───► │  Bun process                                 │
   news pages       │                                              │
                    │   scheduler (every 6h)                       │
                    │        │                                     │
                    │        ▼                                     │
                    │   ingest pipeline                            │
                    │   fetch → parse → validate                   │
                    │        → reconcile → gate → publish          │
                    │        │                    │                │
                    │        │                    └──► quarantine  │
                    │        ▼                          │          │
                    │   ┌─────────────┐                 │          │
                    │   │  SQLite     │◄────────────────┘          │
                    │   └─────────────┘      /review (127.0.0.1)   │
                    │        │                                     │
                    │        ▼                                     │
                    │   GET /api/events        static React build  │
                    └────────┬─────────────────────────┬───────────┘
                             │                         │
                             ▼                         ▼
                        browser fetch            browser render
                                  │
                                  ▼
                        localStorage: completions,
                        filters, region  ← never leaves the device
```

The pipeline makes no third-party API calls beyond fetching source pages. There is no inference
anywhere, at ingest time or in a request path.

## Layout

```
src/
  server/
    index.ts            Bun.serve entry: static + API + scheduler bootstrap
    routes/
      events.ts         GET /api/events, /api/events.json
      games.ts          GET /api/games
      review.ts         /review UI + approve/reject (localhost-bound)
      health.ts         GET /api/health
    db/
      client.ts         bun:sqlite handle, WAL, pragmas
      migrations/       NNN-name.sql, applied in order at boot
      queries.ts        all SQL lives here — no SQL in route handlers
  ingest/
    scheduler.ts        timer + jitter + per-source lock          [not built]
    pipeline.ts         the 6 stages, orchestration only          [not built]
    html.ts             flat-table HTML reader (no dependency)    ✓ built
    dates.ts            deterministic date parsing                ✓ built
    validate.ts         zod parse + calendar sanity rules         [not built]
    reconcile.ts        diff vs published, confidence, conflicts  [not built]
    adapters/
      types.ts          Adapter interface, ParseContext           ✓ built
      game8.ts          shared Game8 parser (2 table shapes)      ✓ built
      index.ts          registry: adapter id → Adapter            ✓ built
  shared/
    schema.ts           zod schemas — the contract, both sides    ✓ built
    time.ts             region reset math, duration formatting    [not built]
  client/
    main.tsx
    App.tsx
    views/
      Timeline.tsx      F1
      EndingSoon.tsx    F2
      EventDetail.tsx
    state/
      completions.ts    localStorage read/write + export/import
      prefs.ts          region, filters
    api.ts              typed fetch of /api/events
fixtures/<game>/        checked-in raw HTML + expected parse output
docs/
```

## Request paths

| Route | Purpose | Notes |
|---|---|---|
| `GET /` + assets | React SPA | Served from the `bun build` output |
| `GET /api/events?from&to&game` | Filtered feed | `ETag` + `Cache-Control: public, max-age=300` |
| `GET /api/events.json` | Whole published feed | Cheap; the client mostly uses this and filters locally |
| `GET /api/games` | Game metadata: id, name, color, lastUpdatedAt | Drives the freshness badges (F7) |
| `GET /api/health` | Per-source last-success, quarantine depth | For an operator, not the UI |
| `GET /review` | Quarantine review UI | **Bound to `127.0.0.1` only** |
| `POST /api/review/:id/approve` \| `/reject` | Promote or discard a quarantined event | Same binding |

### Why `/review` needs no auth

`Bun.serve` runs two listeners: the public one on `0.0.0.0:PORT` with the SPA and `/api/*`, and a
second on `127.0.0.1:ADMIN_PORT` with `/review` and `/api/review/*`. The review routes are not
registered on the public listener at all — they are unreachable from off-box, so there is nothing
to authenticate. This is the mechanism that satisfies "no logins" without leaving an open admin
endpoint on the internet.

**This is load-bearing.** If someone later puts a reverse proxy in front of the admin port, or
merges the two listeners "to simplify", the review UI becomes a public write endpoint. Any change
in that area needs an explicit auth story first.

## Data flow, concretely

1. **Scheduler** wakes every 6h (± jitter). For each source not fetched within its `minIntervalMs`,
   it acquires a per-source lock row and enqueues a run.
2. **Pipeline** executes the seven stages in `docs/INGESTION.md`. Every stage writes to
   `ingest_runs` so a failure is diagnosable after the fact without re-running.
3. **Publish** upserts into `events` by stable ID, bumping `version` and `updatedAt` when any field
   changed. Events that vanish from a source are *not* deleted — they are marked
   `status = 'delisted'` so a source outage cannot silently empty the calendar.
4. **Client** fetches the feed, merges the completion set from `localStorage` by event ID, and
   renders. Merge is a client-side join; the server never learns what the user completed.

## Concurrency and failure

- One in-flight run per source, enforced by a lock row with a stale-lock timeout of 15 minutes.
- A source that fails keeps its previously published events. A failed run never deletes or blanks
  data — worst case, the game's lane goes stale and gets a warning badge (F7).
- Three consecutive failures for one source raises its `health` to `failing` in `/api/health`. It
  does not stop the schedule; a wiki being down for a day is normal.
- Raw snapshots are cached by content hash, so a parser change is always evaluated offline against
  stored pages rather than by re-fetching.

## Deployment

Single process, single SQLite file, no external services at all.

```
PORT=3000
ADMIN_PORT=3001            # bound to 127.0.0.1
DATABASE_PATH=./data/events.sqlite
INGEST_INTERVAL_MS=21600000
INGEST_ENABLED=true        # false for local UI work — never hits the network or the API
CONFIDENCE_THRESHOLD=0.8
```

`INGEST_ENABLED=false` is the default for local development. Frontend work should run against a
seeded SQLite file and cost nothing.

## Deliberate non-choices

- **No ORM.** `bun:sqlite` plus hand-written SQL in `queries.ts`. The schema is six tables.
- **No Redis / job queue.** The scheduler is a timer and a lock row. Restarting the process resumes
  cleanly because state is in SQLite.
- **No server-side rendering.** The feed is small and cacheable; a static SPA is enough.
- **No websockets.** Events change on a scale of hours; a 5-minute cache is more than adequate.
