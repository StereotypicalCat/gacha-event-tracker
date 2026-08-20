# Game order, grouped dailies, and catching up a missed day

**Date:** 2026-08-20
**Status:** implemented, 2026-08-20

Three changes that share one primitive. Read `AGENTS.md` first — every rule cited below is already
written down there, and the citations are load-bearing rather than decorative.

## Why

Three complaints, one root:

1. **Nothing decides the order games appear in.** The focus bar, the settings chips and the timeline
   lanes all render `games` from `App.tsx`, which is
   `[...new Set([...allRows.map(r => r.event.game), ...custom.lanes])]` — *whichever game happened to
   hold the first event row*. That is arbitrary, it shifts as events come and go, and it is the same
   problem already fixed on the first-run picker (`docs/PRD.md` F8).
2. **A game's dailies are scattered.** `Dailies.tsx` builds `[...chores, ...repeating]`, so Genshin's
   standing chore and Genshin's login event are separated by every other game on the page. The reader
   thinks in games; the strip thinks in kinds.
3. **A day you did but did not tick cannot be recorded.** Three surfaces, and only one of them works:

   | Surface | Backfill today? |
   |---|---|
   | Event with an announced end, in the detail sheet | **Yes** — every day in `dailyDays` is a pip button, only future days disabled |
   | Event with `endsAt: null` | **No** — `days === null` renders no pips at all, so only today is reachable |
   | A game's standing chore (`dailies:<game>`) | **No, and there is no history UI at all** — one `TickChip` wired to today |

   The third is the one the code itself calls "the most-missed thing in every one of these games".

The store is already capable: `toggleDay(id, day)` takes any day key and `streakOf` reads whatever is
logged. This is UI reach, not a data-model change — **nothing here touches an event ID, a `dailies:`
key or a `dayKey` format.**

## Decisions taken

| Question | Answer |
|---|---|
| Whose order is it? | The reader's, stored in `prefs.gameOrder` |
| Where is it edited? | Settings only. The live surfaces are never draggable |
| How? | A drag handle **and** ↑↓ buttons, both always visible |
| Default before they touch it | Alphabetical by display name |
| A game added later | Lands after everything hand-placed; not auto-appended to the order |
| Which surfaces obey it | Focus bar, Today's dailies, settings games list, timeline lanes |
| Chore catch-up window | 14 days |
| Undated-event catch-up window | Its start day → today, capped at 14 days back |

The live surfaces stay drag-free because the dailies strip is the fastest tap target on the page —
the code calls it the part "answerable in ten seconds" — and a drag target on top of a tick target
costs a streak when it misfires. `AGENTS.md` § Conventions ("a list row is one target") is the same
worry.

## 1. `src/client/state/gameOrder.ts` — new, pure, no React

```ts
export function orderGames(
  lanes: readonly LaneId[],
  stored: readonly LaneId[] | undefined,
  nameOf: (id: LaneId) => string,
): LaneId[]

/** Move one entry. Out-of-range indices are a no-op. */
export function moveGame(order: readonly LaneId[], from: number, to: number): LaneId[]
```

`orderGames`, in priority order:

1. **`stored` absent → every lane alphabetical by `nameOf`, via `localeCompare`.** Absent means *the
   reader has never placed a game*, exactly as an absent `knownGames` means unrecorded rather than
   "offered nothing" (`usePrefs.ts` § `adoptNewLanes`). Every existing install is in this state on
   day one, and this default is what the first-run picker already does.
2. **`stored` present → the lanes it names, in its order, filtered to lanes that exist; then every
   unnamed lane, alphabetical, appended.**
3. **The result is always a permutation of `lanes`.** Never drops one, never invents one, never
   duplicates one even if `stored` does. This is the safety property: a game missing from the focus
   bar or from settings is indistinguishable from a game the reader switched off, and their fix for
   that — switch it back on — would do nothing.
4. **Total.** An unknown lane still gets a name (`metaFor` answers "Unknown game"), so a `mygame:`
   lane, or an import carrying an event whose game did not come with it, sorts rather than throws.
5. **A retired game keeps its slot.** Filter on output; never prune `stored`. A source that goes away
   and comes back returns to where the reader put it — `AGENTS.md` § "Retiring a game, a source or a
   page must never cost the reader a row they typed", applied to a preference.

`localeCompare`, not `<`: `hololive Dreams` is the one lowercase name in `games.ts` and a code-point
sort files it after every capitalised game. Sort on the **name**, never the `LaneId` — `hsr` is
Honkai: Star Rail, `nikke` is Goddess of Victory: Nikke.

**A reorder is always applied to the list as displayed, and the whole result is stored.** Both halves
matter, and an earlier draft of this spec had a separate `seedOrder` helper for the second one before
noticing the first: the indices a drag or an arrow produces are positions *on screen*, so applying
them to a stored order naming only some lanes would move the wrong game — and storing only the moved
id would leave rule 2 reading "that game, then everything else alphabetically", which is not what
dragging one row one notch means. Writing back what the reader is looking at gets both right, and
needs no helper.

### `prefs.gameOrder`

```ts
/** The reader's own game order. Absent means they have never placed one — see orderGames. */
gameOrder?: LaneId[];
```

Optional and **absent from `defaults()`**, deliberately: a stored `[]` would mean "an order that
names nothing", which is indistinguishable from absent under rule 2 but invites a future reader of
the code to treat it as meaningful. "Reset to A–Z" writes `gameOrder: undefined`, which
`JSON.stringify` drops.

No new key space and no migration — one more field in the single `prefs` blob, like `timelineGroup`.
It rides the export for free (`exportProgress` already writes `prefs`).

**Known asymmetry, not fixed here:** `importProgress` restores progress, daily, ignored and custom
but **never prefs**, so an imported file does not restore a game order. That is pre-existing and
applies equally to region, theme and view. Do not fix it as a side effect of this work; it deserves
its own decision about merge semantics.

## 2. The surfaces follow the order

`App.tsx` computes it once, next to `games`:

```ts
const ordered = useMemo(
  () => orderGames(games, prefs.gameOrder, (id) => gameMeta(id).name),
  [games, prefs.gameOrder, gameMeta],
);
const enabled = useMemo(
  () => ordered.filter((g) => !prefs.hiddenGames.includes(g)),
  [ordered, prefs.hiddenGames],
);
```

**`games` itself does not change.** It stays the lane-identity list that `adoptNewLanes` diffs and
`knownGames` is seeded from. Reordering it at source would entangle a display preference with the
logic that decides which of a reader's games get switched off — a reordering bug would become a
*game silently hidden* bug.

Then: focus bar gets `enabled` (already does — it just becomes ordered), `Dailies` gets ordered games,
`Controls` gets `ordered`, and `timelineLanes` gains lane ordering:

```ts
timelineLanes(rows, mode, split, order?: readonly LaneId[])
```

Applied to the **lanes**, never to the rows inside one — `lanes.ts` already states that grouping is
not a licence to re-sort within a group. A lane whose game is absent from `order` sorts after the
placed ones, keeping the function total. The merged `"ending"` mode is untouched: it is deliberately
not per-game.

`Welcome.tsx` drops its local comparator and calls `orderGames(available, undefined, nameOf)` — the
picker precedes any stored order, so it always gets the alphabetical rule. One rule, not a fifth copy.

## 3. The settings reorder editor

The Games chip row in `Controls.tsx` becomes one row per game:

```
∷   ● Genshin Impact        3 of 14   ↑ ↓   [on]
```

- Drag handle (`draggable` + `dragover`/`drop`, no dependency — the only runtime dep is `zod`) **and**
  ↑↓ buttons, both always visible. **Touch does not fire drag events**, so ↑↓ is the real mechanism
  and drag is the desktop fast path. Say so in the UI copy.
- ↑↓ are ordinary buttons, so keyboard and screen-reader support come free:
  `aria-label="Move Genshin Impact up"`, and the row states its position so it is audible.
- A reorder writes `moveGame(games, from, to)` — the list as displayed — as the whole new
  `gameOrder`.
- "Reset to A–Z" writes `gameOrder: undefined`.
- **The row is not itself a target.** The handle, two arrows and the on/off toggle are four explicit
  controls and nothing else is clickable, which is why this does not breach "a list row is one
  target" — that rule exists because a full-bleed row target plus an inner control is a mis-tap.

## 4. Dailies: grouping, and catching up

### Grouping

Replace `[...chores, ...repeating]` with a pure exported function in the component module — the
pattern `Timeline.tsx` already uses for `boardWindow` / `splitAt` / `startMarkers`, so it is tested
directly with no rendering:

```ts
export function dailyGroups(
  games: readonly LaneId[],       // already in the reader's order
  events: readonly DisplayEvent[],
  now: number,
  region: Region,
): DailyGroup[]                    // { game, chore | null, events }
```

For each game in order: its standing chore first, then that game's repeating events **in the order
they arrived**. Grouping is not a licence to re-sort inside a group. A `mygame:` lane contributes
events but no chore (`isCustomGameId` — there is no routine we could name on a reader's behalf).

**Collapsed, grouping is adjacency only — no per-game headings.** Chips stay one wrapping row; a
game's chore and its events simply become neighbours, and they already share a hue. Headings would
make the ten-second strip the tallest block on the page, above "next to expire", which is the answer
the reader came for. Headings appear only in the expanded state, where there is vertical room.

The `2/4` counter, `soonest` and the mixed-reset line are computed over the same items and are
unaffected: grouping only reorders. Per-game reset clocks stay per-game — Endfield's European day can
still be yesterday's (`Dailies.tsx:46-48`).

### `catchUpDays` — `src/shared/daily.ts`, beside `dailyDays`

```ts
export const CATCH_UP_DAYS = 14;

export function catchUpDays(
  now: number,
  region: Region,
  game: LaneId | undefined,
  notBefore: number | null,
): string[]
```

Day keys oldest → today inclusive: at most `CATCH_UP_DAYS`, never earlier than `notBefore`'s day,
**never past today**. Pure, clock as an argument, like everything else in that module.

- A **chore** passes `notBefore: null` — no start exists — and gets the last 14 days.
- An **undated event** passes its `startsMs`, so the strip begins at its real start, capped at 14 back.
  That cap is what stops a login campaign that opened in March from rendering 180 pips.

### The two strips

- `Dailies` gains a `Catch up ▾` disclosure: `useState(false)`, **per-visit, never stored** — the same
  argument the repo already makes for "show all N" (`AGENTS.md` § "Truncating a list is not
  re-sorting it"): it is something a reader does while reading, not a statement about how the app
  should work. Expanded, each group renders its game heading and a pip row per item.
- `DailyChecklist`'s `days === null` branch gains the same strip, replacing a sentence that currently
  offers nothing to click. Dated events keep the full `dailyDays` strip they already have.
- `DayPip` moves out of `DailyChecklist.tsx` into `src/client/components/DayPip.tsx` so both surfaces
  share one pip instead of growing two that drift.

### Four guard rails

1. **Future days are never rendered** in a catch-up strip — not rendered-and-disabled. A tick claims
   you did it. The dated checklist keeps its dimmed future pips: there the run's length is published
   and the strip is a forecast, whereas catch-up is explicitly about the past.
2. **The window bounds display, never data.** A tick from five weeks ago stays logged, keeps counting
   in `streakOf` and in the `logged` total, and is simply off-screen. `toggleDay` only ever touches the
   exact day tapped — `AGENTS.md`: "a tick is never removed except by the reader".
3. **Every call passes `game`.** Anything reading or writing a tick must, or it writes under one clock
   and reads under another. Chores pass their game id, events pass `event.game`. Endfield's European
   reset is 09:00 UTC, so this is not theoretical.
4. **Catch-up cannot resurrect a finished event.** Expanded rows come from the same items the collapsed
   strip uses, which `App` already filters through `outstanding` — an event the reader marked done has
   no line left to tick. True by construction; pinned by a test anyway.

The completion **fireworks** fire on `complete > was.complete` at equal `total`. Backfilling yesterday
leaves today's count alone, so no burst — correct. Ticking today from inside the expanded strip does
burst, also correct.

## Testing

| File | Pins |
|---|---|
| `test/game-order.test.ts` | `orderGames` is a permutation in every case (absent / present / retired / unknown / duplicate-bearing `stored`); alphabetical by name and not by id; `localeCompare` and the lowercase name; unplaced lanes trail placed ones; `moveGame` records the whole displayed list, never loses an entry, and is a no-op off either end |
| `test/daily.test.ts` | `catchUpDays`: the 14-day cap, the `notBefore` clip, never past today, a per-game reset offset (Endfield europe UTC-5) |
| `test/daily.test.ts` | A tick older than the window survives and still counts toward the streak |
| `test/views.test.tsx` | `dailyGroups` keeps a chore adjacent to its game's events, preserves within-game order, and yields no row for a done event; `Welcome` still orders alphabetically through the shared rule |
| `test/controls.test.tsx` | The reorder rows render both affordances; ↑ on the first row is inert |
| `test/prefs.test.ts` | `gameOrder` absent survives a load; reset writes it away |

Tests must not need build output, and must run offline.

## Docs to update in the same change

- `docs/PRD.md` — the game order as reader-facing behaviour (F4/F8 neighbourhood), and catch-up under
  the dailies feature.
- `docs/DATA-MODEL.md` — `prefs.gameOrder`, and that absent means unplaced.
- `AGENTS.md` § Conventions — the ordering rule, and that catch-up bounds display and never data.

## Commit split

Four commits, each typechecking and passing tests on its own, per `AGENTS.md` § Conventions:

1. `gameOrder` module + `prefs.gameOrder` + tests. Nothing renders differently.
2. The four surfaces follow the order; `Welcome.tsx` converted to the shared rule.
3. The settings reorder editor.
4. Dailies grouping + `catchUpDays` + `DayPip` extraction + both strips.
