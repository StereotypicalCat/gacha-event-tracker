# Routines that reset with the game's version — design

Date: 2026-10-22. Status: **shipped** on branch `feat/version-routines` (`34ebc40..5896819`), approved by the owner 2026-10-22.

## Problem

Wuthering Waves' shop sells gacha pulls with a limit of 7 Radiant Tide, 7 Forging Tide and 7
Lustrous Tide per version, and the stock refills when the next version arrives (owner, 2026-10-22).
The in-game timer read **19d 20h** at about 14:30 UTC on 2026-10-22, which puts the restock at
about 10:30 UTC on 11 November 2026. That matches the owner's reading of 16 October ("resets each
version, 11 Nov ~10–11 UTC", built-in routines spec § Scope item 3) and the community estimates for
3.8's launch (Game8, u7buy: 11–12 November).

No built-in period can express "until the next version". Weeks and months are fixed, and a
`cycle` assumes every version has the same length. This change adds version timers as a concept,
so routines can follow them. The owner asked for exactly that: "We should start tracking version
timers to allow routines to follow after them."

## Decisions

The owner's, from the conversation on 2026-10-22:

1. **Track version timers per game**, so that a routine can reset when a version ends.
2. **When the current version's end is unknown**, the routine says *Resets with next version
   (&lt;number&gt;)* and gives an estimate.
3. **The estimate is shown only.** A routine resets only at an end that is recorded in the table.
   Until someone records the current version's end, the count stays where it is, however far past
   the estimate. This follows AGENTS.md's rule against acting on an invented date.
4. **A version timer is shown in two places**: through the routines that follow it, and on the
   game's page under Settings → *Your games*. It gets no row in the list, no headline, and no
   timeline marker.
5. **The first three routines** are WuWa's shop pulls: 7 Radiant Tide, 7 Forging Tide and
   7 Lustrous Tide each version.

The builder's, marked as such (the owner may overrule them while reading):

6. **Versions are a hand-kept table in code**: `src/shared/versions.ts`, held to the same bar as
   `ROUTINES`. Each entry needs a cited page, and figures the owner read in game say so
   ("Confirmed in game, YYYY-MM-DD."). No feed source dates WuWa's versions today: Fandom's
   `Version` table stops at 3.5, and Game8 gives both 11 and 12 November (pass windows spec § Not
   shipped). A scraped source can replace entries later; this change does not build one.
7. **A version ends at an instant, not at a daily reset.** `end` is a UTC timestamp: the moment
   the new version's stock appears, the same on every server. WuWa's daily reset (04:00 server
   time) would roll 11 Nov's game-day at 20:00 UTC on 10 Nov on Asia, about 14 hours before the
   restock. A reader there would see 0/7 when they can't buy yet, and pulls bought that evening
   would be filed under 3.8. The instant comes from the owner's in-game timer, accurate to about
   an hour.
8. **The version period exists only for built-ins.** `Routine.period` accepts
   `{ unit: "version" }`, but the stored `PeriodSchema` (and so `TaskSchema`, the
   `gacha-tracker:v1:tasks` records and the export format) stays unchanged. An older cached bundle
   never sees an unknown period. *Make it mine* is hidden on a version routine; a reader's own
   version task is a follow-up (§ Not in this change).
9. **Version routines count amounts only.** A "days ticked" measure needs the list of game-days in
   the period, and an open-ended version has no last day. A test enforces this.
10. **A version period shows with the cycles.** For grouping it is a `cycle`: the Dailies cadence,
    the *Cycles* group on the routines page, the `GoalStatus.scope`, and the `n/7 · 19d` chip.
    Only the caption differs (§ Display). A fifth cadence would touch every tally in `Dailies.tsx`
    for three rows.
11. **The estimate is the version's start plus the game's usual version length.** For WuWa that
    is 42 days: 3.7 ran 30 Sep → 11 Nov, and AGENTS.md puts patch cycles at about six weeks. The
    estimate is computed when shown and never stored.
12. **Shop lines use the existing `pulls` flag.** Radiant Tide (limited character) and Forging
    Tide (limited weapon) are `premium`. Lustrous Tide is `standard`, so it is offered only with
    `prefs.standardPulls`, like Paimon's Bargains' Acquaint Fates.

## Shape

### `src/shared/versions.ts` (new)

```ts
export interface GameVersion {
  game: GameId;
  number: string;        // "3.7": a label, never parsed as a number (3.8 may be followed by 4.0)
  start: string;         // ISO UTC instant the version's stock appeared
  end?: string;          // ISO UTC instant the next version's stock appears; absent when unknown
  next?: string;         // the next version's number, when a page or the owner names it
  source: string;        // https page
  checked: string;       // YYYY-MM-DD
  note?: string;         // "Confirmed in game, 2026-10-22." and similar
}
export const VERSIONS: readonly GameVersion[];
/** Usual length in days, per game, with where the figure comes from in a comment. */
export const VERSION_DAYS: Partial<Record<GameId, number>>;
```

Plus one pure function, tested at fixed `now`:

```ts
versionWindow(game, now: number) → {
  number: string | undefined;     // the version holding now; undefined if not named
  key: string;                    // the period key amounts are stored under
  start: number;                  // ms
  end: number | undefined;        // ms, only when recorded
  estimate: number | undefined;   // ms, start + VERSION_DAYS, when end is not recorded
  nextNumber: string | undefined;
} | undefined                     // the game has no versions at all
```

Rules, with the newest entry's ends resolved in order:

- If `now` falls inside a listed version with a recorded `end`, that version is the window.
- If the newest listed version has no `end` and `now` ≥ its `start`, the window is that version,
  open-ended, with `estimate = start + VERSION_DAYS`.
- If `now` is past the newest recorded `end`, the window is the version that began at that
  `end` (number = that entry's `next`, possibly undefined). It is open-ended, with an estimate
  from that start. Its start is real data, so amounts stored under its key stay where they are
  when the owner adds its entry.
- The window never rolls on an estimate (decision 3). Past the estimate, it still shows that
  version, and the caption says the end is overdue (§ Display).
- No `VERSION_DAYS` → no estimate; the caption omits it.

**The key** is `` `v${start date in UTC, YYYY-MM-DD}` ``, or the bare `YYYY-MM-DD` if the amounts
store's key schema requires a date. The builder checks `AmountLog`'s key rule and records which
one. It depends only on the start instant, so adding the next entry later never moves it.

`VERSIONS` is validated by a test: entries per game do not overlap, `end` > `start`, each recorded
`end` equals the next entry's `start` where both exist, every source is `https`, and both instants
parse.

### First entry

| game | number | start | end | next | source | note |
|---|---|---|---|---|---|---|
| wuwa | 3.7 | 2026-09-30 (instant per page or owner) | 2026-11-11T10:30:00Z | 3.8 | game8.co/games/Wuthering-Waves/archives/629904 (Version 3.8 Banners and Release Date) | The page estimates 11–12 Nov; the end is the owner's in-game timer, 19d 20h on 22 Oct. Confirmed in game, 2026-10-22. |

The builder checks 3.7's start against a page before committing. If no page states it, the builder
uses 30 Sep (42 days before the end, matching the six-week cycle) and says so in `note`. The start
affects only the period key.

### `Routine` and the period

- `RoutineSchema.period` becomes `PeriodSchema.or(z.object({ unit: z.literal("version") }))`.
  `Routine`'s intersection with `TaskShape` has to allow it; the builder decides how (for
  example, a `RoutinePeriod` type).
- Every consumer of a routine's period (`taskStatus`, `periodOf` callers in `Dailies.tsx`,
  `TimelinePage.tsx`, `RoutineDrawer.tsx`, `taskCaption`, the cadence in
  `state/reader/routines.ts`) handles `version` by going through `versionWindow` with `now`. The
  type checker will list them. In `taskStatus`, an amount version routine reads
  `amounts[window.key]`, and `daysLeft` / `open` are the whole days to `end`, or `null` when no end
  is recorded.
- `routineToTask` / *Make it mine* is not offered for a version routine.

### Display

- **Routine caption** (`taskCaption` and the drawer's period line):
  - recorded end: `resets with 3.8 · 11 Nov`
  - no recorded end: `resets with next version (3.9) · expected ~23 Dec`, without the number when
    unknown: `resets with next version · expected ~23 Dec`
  - past the estimate: `resets with next version (3.9) · expected ~23 Dec, not yet confirmed`
- **Chip**: the cycle form, `n/7 · 19d` with a recorded end, and `n/7` alone without one.
- **Your games → game → About**: one row under the reset rows, shown only for a game with versions:
  - `Version 3.7 · ends 11 Nov 2026, 11:30 (in 19d)` in the reader's display timezone, with the
    source linked and its `note` beneath it.
  - No recorded end: `Version 3.8 · next version expected ~23 Dec 2026 (estimate)`.

## Entries

| id | title | period | measure | pulls |
|---|---|---|---|---|
| `routine:wuwa:shop-radiant-tide` | Shop: Radiant Tide | version | amount 7 Radiant Tide | premium |
| `routine:wuwa:shop-forging-tide` | Shop: Forging Tide | version | amount 7 Forging Tide | premium |
| `routine:wuwa:shop-lustrous-tide` | Shop: Lustrous Tide | version | amount 7 Lustrous Tide | standard |

Each has `source` set to a page that describes the shop's pull stock, preferring one that names the
shop and the currency (the builder finds it). The title names the shop if that page does. Each
`note` ends "Confirmed in game, 2026-10-22." The limit of 7 per version is the owner's reading.

## Not in this change

- A scraped version source for WuWa, or wiring `versionTable.ts` / Nikki's `Version` page into
  `VERSIONS`. The table is shaped so that work can fill it later.
- Version periods on a reader's own tasks, and *Make it mine* for version routines.
- Version markers on the timeline, or a version row in the list or *Next up*.
- Moving existing routines (Pioneer Podcast and others) onto the version period.

## Upkeep

When a version's end is announced or read in game, add it to `VERSIONS` with the next version's
entry. Until then, version routines hold their count (decision 3). AGENTS.md gets a bullet saying
so, and TODO.md gets a standing item for 3.8's end.

## Testing

- `versions.test.ts`: the table invariants; `versionWindow` at 3.7's start, inside it, one minute
  before 2026-11-11T10:30Z, at that instant (3.8, open-ended, estimate 23 Dec), well past the
  estimate (still 3.8, same key), and for a game with no versions. An entry with no `end` gives an
  estimate from its own start.
- `task.test.ts`: `taskStatus` for a version amount routine with 3/7 entered under 3.7's key (it
  appears; `daysLeft` 20 on 22 Oct), and at 11 Nov 10:30Z (back to 0/7, `daysLeft` null).
- `routines.test.ts`: the existing invariants pass for the three entries; Lustrous Tide is
  `standard`; every version routine is an amount measure.
- Caption and chip strings for a recorded end, no end, and past the estimate.
- A browser check of the routine rows and the About row, at the real date.

## Docs

`docs/DATA-MODEL.md` (no stored change; note that the version period exists only for built-ins and
the key it stores amounts under), `docs/PRD.md` F17 (routines can follow a version), AGENTS.md (one
bullet: versions are hand-kept and cited, estimates are shown and never acted on), TODO.md (the
Oscillated Coral item is partly addressed; the follow-ups above; 3.8's end), and a changelog entry
in a follow-up commit, following the repo's habit.
