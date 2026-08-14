# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web app that aggregates live and upcoming events across popular gacha games, plots them on a
calendar, sorts them by end date, and lets a user mark events completed.

**Status: working app, no live refresh.** Schema, two parsers, seven sources across six games, the
full interface, offline support, a static server, a Docker image and CI all exist and are tested.
The SQLite layer, the refresh scheduler and the review queue are specified in `docs/` but not built,
so the feed is generated offline from checked-in fixtures.

## Three constraints that shape everything

1. **No accounts, no logins, no user records.** Completion state lives in the browser's
   `localStorage`, keyed by event ID. There is no user table and no session. Any request implying
   "sync across devices" is solved with export/import JSON, not a server-side user.
2. **No LLM in the pipeline.** Event data is extracted by deterministic code-based parsers only.
   There is no Anthropic dependency, no API key, and no per-run inference cost. A source that
   cannot be parsed deterministically does not get an adapter — see `docs/INGESTION.md` § No LLM.
3. **A server is allowed** (Bun) and owns fetching, parsing, and SQLite. The client only ever calls
   this app's own `/api/*`.

## Stack

| Layer | Choice |
|---|---|
| Runtime / server / bundler / test runner | Bun 1.3 (`Bun.serve`, `bun:sqlite`, `bun test`, `bun build`) |
| UI | React 19 + TypeScript (strict) + Tailwind |
| Storage | SQLite via `bun:sqlite` (gitignored — `*.sqlite`) |
| Validation | Zod — one schema module shared by server and client |

The only runtime dependency is `zod`. Do not add a bundler, test runner, HTTP client, or HTML
parsing library — Bun covers all four. `tsconfig.json` runs `strict` plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## Commands

```bash
bun install
bun test                      # full suite, offline, no network, no build needed
bun run typecheck             # tsc --noEmit
bun run dev                   # build then serve on :3000
bun run build                 # feed + css + js + static into public/

# Run one source against its fixture (offline, free)
bun run parse genshin-game8-events fixtures/genshin/game8-events-2026-08-14.html
bun run parse endfield-wikigg-events fixtures/endfield/wikigg-events-2026-08-15.html --json

# Single test file / single test
bun test test/dates.test.ts
bun test --test-name-pattern "year-less"

# Hosting under a subpath (GitHub Pages)
BASE_PATH=/gacha-event-tracker/ bun run build
```

**Tests must never need build output.** They run before `bun run build` in CI; anything reading
`public/` must create its own fixture tree instead.

`bun run parse ... --json` is also how `.expected.json` fixtures are regenerated after an
intentional parser change. Regenerating them makes the test self-consistent, not correct — always
re-verify a sample against the live page afterward.

## Current state of the code

```
src/shared/       schema.ts (the contract), time.ts, games.ts, feed.ts
src/ingest/       html.ts, dates.ts (six formats), merge.ts
  parsers/        game8.ts, wikigg.ts — keyed by SITE, not game
  adapters/       index.ts — SOURCES registry binding url+game+parser
src/client/       React app, service worker, manifest
scripts/          build-feed.ts, parse-fixture.ts (both offline)
serve.ts          static server + /api/health
test/             112 tests
fixtures/<game>/  raw HTML + .expected.json per source
```

Not yet built: the SQLite layer, the ingest scheduler, the review UI.

## Domain rules that are not obvious from the code

These come from how gacha games actually schedule things, and they cause most bugs here:

- **Store every timestamp as UTC ISO 8601.** Sources publish in a mix of UTC+8, server-local, and
  "after maintenance".
- **Banner ends are usually global and simultaneous; event ends are usually per-region.** Character
  banners end at one instant worldwide; story/login events end at each region's daily reset (Asia /
  America / Europe differ by hours). `regionScoped` and `regionEnds` exist for this — do not
  collapse them into one timestamp.
- **`endsAt: null` is a correct, expected value.** An event whose end is genuinely unannounced gets
  `endsAt: null` and `endPrecision: "unknown"`. **Never invent a plausible date to satisfy a
  non-null type.** This is the worst failure mode this codebase has, because the user's entire
  reason for visiting is trusting the end date.
- **Patch cycles are ~6 weeks.** Any event over 180 days is a parse error, not a long event. The
  validator and the tests both reject it.

## Working on parsers

- **Parsers are pure.** No network, no `Date.now()`, no randomness — time arrives as `ctx.now`.
  This is what makes fixture tests meaningful; a parser that reads the clock cannot be tested.
- **Skip, never guess.** Every function in `dates.ts` returns `null` rather than inferring a missing
  year, month, or end. `readColumnTable` drops a row it cannot date. An omitted event is a
  recoverable disappointment; a confidently wrong date is the failure this product exists to prevent.
- **Parsers are keyed by site, not game.** One `game8` parser serves six sources; `wikigg` serves
  one. Adding a source for a known site is one `SOURCES` entry; a new site is a parser module.
- **Game8 has no single template.** Five shapes are known and a page may mix them: label/value
  detail tables, column tables, image-grid schedules (unsupportable), combined label+range+blurb
  cells, and rowspan Start/End pairs. Full table in `docs/INGESTION.md`. Before assuming a new
  Game8 page will work, dump its structure and check **every** table — Endfield was written off as
  undatable on a pass that only inspected its `Duration` rows, and its real events were further
  down the page.
- **Prefer a source that states machine-readable times.** wiki.gg emits ISO timestamps with a timer
  per server region, which is the only reason `regionEnds` carries real data anywhere.
- **Silent drops are the dangerous failure.** A date format the parser does not recognise makes
  events vanish with no error. Abbreviated months (`Apr. 29 - May 13, 2026`) are supported for
  exactly this reason. When adding a source, compare the parser's event count against an
  independent count of the page.

## Event IDs are localStorage keys

```
`${game}:${slugify(title)}:${startsAt.slice(0, 10)}`
→ "genshin:mutual-aid-in-bloom-into-the-frostlands:2026-08-12"
```

Changing `slugify` or `eventId` in `src/shared/schema.ts` — including seemingly cosmetic changes to
the slug rules — **silently orphans every completion mark every user has, with no server-side
recovery**, because the server never had the data. If it must change, ship a client-side migration
that remaps old keys and keep it for at least a year. Use the **schema-guardian** agent on any such
change.

## Scraping conduct

Sources are community wikis. Treat them as a guest would:

- Honor `robots.txt`; set a descriptive `User-Agent` with a contact URL.
- One request per source per refresh cycle, minimum 6 hours apart.
- Send `If-None-Match` / `If-Modified-Since`; treat `304` as "skip, unchanged".
- Cache raw snapshots so re-parsing never re-fetches. **Iterate against fixtures, not the network.**
- Record `sourceUrl` on every event and surface attribution in the UI.

Note that game8.co disallows `GPTBot` and `Google-Extended` in `robots.txt` — it has opted out of
AI-training crawlers. Our use is a low-rate personal aggregator with attribution and no model
training, and no `User-agent: *` rule applies to our paths. Keep it that way: do not raise the fetch
rate, and do not add an LLM that consumes page content.

A source whose ToS forbids automated access does not get an adapter. Flag it and ask.

## Conventions

- **Zod schemas are the single source of truth for types.** Derive with `z.infer<>`; never
  hand-write an interface that duplicates a schema.
- Every adapter ships a fixture in `fixtures/<game>/` and a test asserting parsed output. This is
  how a source silently changing shape gets caught.
- Keep old fixtures when a source changes shape — the old one is the regression test proving the
  parser still handles the previous format.
