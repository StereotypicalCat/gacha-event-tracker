---
name: add-game-source
description: End-to-end workflow for adding a new game (or a new source for an existing game) to the event tracker — legal check, fixture capture, adapter, tests, registration, and first ingest run. Use when asked to add a game, add a second source, or wire up a data source for the calendar.
---

# Adding a game source

The design goal is that a new game costs an adapter, a fixture, and a test — **no schema change and
no client change.** If you find yourself editing `src/shared/schema.ts` or a React component to make
a game fit, stop: either the data model is wrong (raise it) or the game is being forced into a shape
it does not have.

Read `docs/INGESTION.md` and `docs/DATA-MODEL.md` before starting.

## 1. Legal and conduct check — a hard gate

Before anything else:

- Fetch `<host>/robots.txt`. Confirm the target path is not disallowed.
- Skim the site's terms for a prohibition on automated access or scraping.
- Prefer an official API or a community wiki with a permissive license over scraping an official
  site directly.

If the source forbids automated access, **stop and report it.** Do not write the adapter and do not
look for a workaround. Suggest an alternative source instead.

## 2. Register the game

If this is a new game rather than a new source for an existing one, add it to `GameId` in
`src/shared/schema.ts` and give it a display name and lane color in the games registry. This is the
only schema edit a new game should require. If it needs more, that is a finding worth reporting.

## 3. Capture a fixture

Fetch the source page **once** and save the raw HTML:

```
fixtures/<game>/<site>-events-<YYYY-MM-DD>.html
```

The `<site>` prefix is load-bearing: `build-feed` picks fixtures by site within the game directory,
so a game with two sources whose files share a prefix will hand one site's page to the other's
parser.

Everything after this point works offline against that file. Do not re-fetch while iterating on the
parser.

## 4. Build the adapter

Delegate to the **adapter-author** agent, or do it inline for a simple table source. Either way the
requirements are the same:

- `parse` is pure over its input — no network, no `Date.now()`. Time comes from `ctx.now`.
- Reuse an existing parser from `src/ingest/parsers/` if the site is already covered — most new
  sources are a single entry in `SOURCES`, with no new parsing code.
- Source-timezone → UTC, region offsets, and ID construction happen in the parser's event builder.

**The three domain rules that break new adapters**, from `AGENTS.md`:

1. Everything stored as UTC ISO 8601.
2. Banners are usually one global end instant; story and login events usually end at each region's
   daily reset. Set `regionScoped` and `regionEnds` accordingly.
3. An unstated end date is `endsAt: null` with `endPrecision: "unknown"`. **Never derive a plausible
   end from typical patch length.** A confidently wrong end date is the failure this product exists
   to prevent.

## 5. Test it

Write `fixtures/<game>/<source-id>-<YYYY-MM-DD>.expected.json` with the exact expected
`GachaEvent[]`, and a test asserting deep equality with a pinned `ctx.now`.

Run `bun test`. It must pass with no network access.

Then **hand-check three or four events against the live page.** The test only proves the parser
agrees with an expected file you wrote yourself; it does not prove either is right. Say in your
report that you did this.

## 6. Wire it up

- Add a `SourceSpec` entry to `SOURCES` in `src/ingest/adapters/index.ts`: id, game, url,
  `parserId`, and optionally `priority` (higher wins when sources disagree).
- Insert the matching `sources` row: id, game, url, parser_id, priority, `min_interval_ms`.

## 7. Rebuild the feed

```
bun run build:feed     # regenerates public/data/events.v1.json
bun run dev            # build and serve on :3000
```

Check the event count and any conflicts the merge reports. A game with two sources will surface
disagreements — those are the gate working, not a bug.

The scheduler, quarantine table and `/review` queue described in `docs/INGESTION.md` are **not built
yet**; today the feed is generated offline from fixtures.

## Checklist

- [ ] robots.txt and ToS permit it
- [ ] Game registered in `GameId` (new games only)
- [ ] Fixture captured, page fetched exactly once
- [ ] Adapter implemented; `parse` pure, no clock access
- [ ] Timestamps UTC; `regionScoped` correct; unstated ends are `null`
- [ ] Expected-output file + passing test, offline
- [ ] Manually spot-checked against the live page
- [ ] Registered in `SOURCES` and the `sources` table
- [ ] Dry run inspected, then real run, then quarantine reviewed

## When something does not fit

Report it rather than working around it. A game with a fourth server region, an event type the enum
lacks, or a source that publishes only relative dates ("starts next Tuesday") are all real
possibilities the current model does not cover. Those are design questions, not adapter bugs — say
what you found and what it would take.
