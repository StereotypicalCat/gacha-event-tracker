# Built-ins on longer cycles — design

Sub-project 2 of the owner's "usual repeatable events" request. Sub-project 1 (weekly and monthly
built-ins, per-item tracking) is in the [built-in routines spec](2026-10-14-built-in-routines-design.md),
whose § Scope item 2 holds the in-game readings this design starts from.

## Problem

Many endgame modes and reward pools run on a cycle that is neither a week nor a month: Star Rail's
three endgame modes every six weeks, ZZZ's Shiyu Defense and Deadly Assault every two weeks, Wuthering
Waves' Tower of Adversity every 28 days, NTE's Beyond the Rails and Tycoon Incentive Fund every 14
days. A period today is `{ unit: "week" }` or `{ unit: "month" }` (`src/shared/period.ts`), so none
of them can be a built-in, and a reader cannot set one up as their own task either.

## Decisions

Approved by the owner in conversation on 2026-10-16.

1. **A third period kind: every N days from a dated start.**
   `{ unit: "cycle", days: 2–366, from: "YYYY-MM-DD" }`, where `from` is a game-day key on which a
   cycle began. `periodOf` finds the cycle holding today as `from + k·days` for the whole number
   `k` that puts today inside it — before `from` as well as after, so an anchor need not be the
   first cycle ever. It works on day keys like the other two, so each game's per-server reset
   carries over unchanged: a Monday anchor rolls at Monday's reset on every server.
2. **Readers get it too** (owner chose "Built-ins + form"). *Add a task* gains a third choice,
   **Every N days**, with the length and a start date. *Make it mine* already copies a built-in's
   period, so the form must be able to show and edit one anyway.
3. **A cycle can follow another server's clock — built-ins only.** `Routine` gains
   `clock?: Region` (code only, never stored, like `pulls`). When set, the item's day key, its reset
   countdown and its catch-up days are cut on that server's reset instead of the reader's. Beyond
   the Rails uses `clock: "asia"`: the owner, on Europe, read it ending Wednesday 21:00 UTC, which is
   Asia's Thursday 05:00 UTC+8 reset, and GameWith's route tables end at 04:59 UTC+8. America is
   unverified — TODO.md holds the check. *Make it mine* drops `clock`, since a reader's task has no
   such field: a copied Beyond the Rails rolls on the reader's own reset, about six hours later on
   Europe. Giving reader tasks a clock is not worth a stored field for one entry.
4. **Tick once unless a figure is stated.** An endgame mode with no single fixed target (Pure
   Fiction, Memory of Chaos, Apocalyptic Shadow, Shiyu Defense, Deadly Assault, Tower of
   Adversity, Beyond the Rails) is `measure: { kind: "days", required: 1 }`, as Spiral Abyss is
   (sub-project 1, decision 2). Stars would rest on our reading of a target that changes.
5. **The Tycoon Incentive Fund ships with the base cap and a note** (owner chose "Base + note").
   1,000,000 fons is the figure the game's guide and allthings.how state; the real cap is higher
   for most players (Puka Membership Program), so the note says so and points at *Make it mine*.
6. **Its own switch.** New pref `showCycleTasks`, on by default and normalised like
   `showWeeklyTasks` (an absent value reads as on). Offered in *What you see* and the strip's Edit
   panel only once a cycle task exists, like the other two. The settings group keeps growing; a
   rework with mockups is in TODO.md (owner, 2026-10-16).
7. **Star Rail's Divergent Universe / Currency Wars points are weekly, not a cycle.** Research
   found the shared pool weekly since 4.2 (Fandom *Version/4.2*: "will restore its weekly
   rotation"; *Simulated Universe*: "reset every week on Monday at 4:00"). The two pages still
   saying "every two weeks" are left over from 3.7. So it ships as an ordinary weekly built-in,
   with the owner's 18,000 cap (in game, 2026-10-14).
8. **Fixed lengths only.** Whimpering Wastes ("the last Monday of each month" in one source,
   "about 26–28 days" in another), Infinity Nikki's Pinnacle Contest (the 1st and 16th of each
   month) and Merit Arena (no page states it) are not every-N-days and are not shipped; see
   § Not shipped.
9. **Entries wait on the owner's in-game check**, as in sub-project 1: the entry commit is last on
   its branch and the branch is not merged until the owner has confirmed § Entries, game by game.

## Shape and surfaces

- `src/shared/period.ts` — the `cycle` member of `PeriodSchema`; `periodOf` for it.
- `src/shared/goal.ts` — `GoalStatus.scope` gains `"cycle"`. Long forms read "this cycle" /
  "done this cycle". The chip's short count, which is `1/1 wk` for a week, becomes `1/1 · 9d` for
  a cycle — the days left in it (`open`), since "cy" means nothing.
- `src/shared/task.ts` — `taskStatus` takes an optional `clock`; `taskCaption` reads "every 14
  days from 16 Oct 2026".
- `src/shared/routines.ts` — `clock`, the entries; `mineFrom` unchanged (it already picks fields).
- `src/client/components/Dailies.tsx` — `cadence` gains `"cycle"`; an item carries its `clock`
  for its day key, countdown and catch-up; the lower row's heading names the periods it holds
  ("This week", "This week & month", "This week, month & cycle", …) instead of always "This week
  & month"; the header tally and the footer count cycles as a third bucket; Catch up says "Last
  cycle:".
- `src/client/components/TaskForm.tsx` — the third choice: a length in days (2–366) and a start
  date (a plain date input, read as the game's day key). "Days needed" is capped at the cycle
  length and 31, the measure's own bound.
- `src/client/state/usePrefs.ts`, `Controls.tsx`, `EditPanel.tsx`, `App.tsx` — `showCycleTasks`.

**Stored shape.** `gacha-tracker:v1:tasks` records may now hold `period.unit: "cycle"`, and
`gacha-tracker:v1:prefs` gains `showCycleTasks`. Nothing existing is migrated or reinterpreted.
An older cached bundle reading a cycle task fails `TaskSchema` and skips it on display; `useTasks`
never deletes what it cannot parse, so the task returns when the bundle updates. Ticks stay in
`daily` under the task id and numbers in `amounts` under the cycle's start key, as for any period.
Reviewed by the schema-guardian agent before merge.

## Entries

Anchors are the first game-day of a cycle, from the owner's in-game end dates (built-in routines
spec § Scope item 2). All `checked: 2026-10-16`.

| id | Period | Measure | Source (`asOf`) |
|---|---|---|---|
| `routine:hsr:pure-fiction` | cycle 42, from 2026-10-19 | tick once | honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Treasures_Lightward (2026-08-15): "each update every six weeks … spaced two weeks apart" |
| `routine:hsr:memory-of-chaos` | cycle 42, from 2026-11-02 | tick once | same |
| `routine:hsr:apocalyptic-shadow` | cycle 42, from 2026-11-16 | tick once | same |
| `routine:hsr:points` | week, Monday | 18,000 points | honkai-star-rail.fandom.com/wiki/Version/4.2 (2026-09-07); the cap is the owner's, in game 2026-10-14 |
| `routine:zzz:shiyu-defense` | cycle 14, from 2026-10-16 | tick once | zenless-zone-zero.fandom.com/wiki/Shiyu_Defense/Critical_Node (2026-01-02): "Every 14 days at 04:00" |
| `routine:zzz:deadly-assault` | cycle 14, from 2026-10-23 | tick once | zenless-zone-zero.fandom.com/wiki/Deadly_Assault (2026-07-31): "refresh every two weeks" |
| `routine:wuwa:tower-of-adversity` | cycle 28, from 2026-11-09 | tick once | gamemarket.gg Tower of Adversity guide (2026-08-25): "a cycle of roughly 28 days" |
| `routine:nte:beyond-the-rails` | cycle 14, from 2026-10-22, `clock: "asia"` | tick once | gamewith.net/nte/74216 (2026-08-13): "updated every 14 days" |
| `routine:nte:tycoon-fund` | cycle 14, from 2026-10-26 | 1,000,000 fons | allthings.how Tycoon Encouragement Fund (2026-08-15): "1,000,000 Fons per two-week period" |

The modes' order agrees with the wiki: modes that *update* Apocalyptic Shadow → Pure Fiction →
Memory of Chaos, two weeks apart, also *end* in that order, and the owner's ends run PF 19 Oct,
MoC 2 Nov, AS 16 Nov. Shiyu's page also says "every 15 days" in one place; the Friday dates the
owner read a week apart rule that out. Tower of Adversity's "roughly" goes in its note.

**Owner checks before merge:** the three Star Rail modes as one tick per cycle; the 18,000 cap still
rolling each Monday; Shiyu Defense's new cycle reading about 14 days; Tower of Adversity at about
24 days.

## Not shipped

| Game | Item | Why |
|---|---|---|
| Wuwa | Whimpering Wastes (Respawning Waters) | Not a fixed length: gurugamer (2025-09-04) "the last Monday of each month", lootbar (2025-12-26) "roughly 4 weeks (about 26–28 days)" |
| Nikki | Pinnacle Contest | The 1st and 16th of each month (infinity-nikki.fandom.com/wiki/Mira_Crown, 2025-12-08) — a half-month, not every N days |
| Nikki | Merit Arena | No page states its cycle (Fandom *Mira Crown Merit Arena*, 2026-07-09, says only that arenas "open sequentially") |

## Testing

- `period.test.ts`: a cycle's start and days on the anchor, inside, on the last day, the day after,
  and before the anchor; lengths 2 and 366.
- `task.test.ts`: `taskStatus` for a cycle, with and without `clock` — the Beyond the Rails case at
  Wednesday 20:59 and 21:01 UTC for a Europe reader.
- `goal.test.ts`: the cycle's labels and short count.
- `routines.test.ts`: the existing per-entry checks cover the new entries; `clock` only on cycles.
- `Dailies.test.tsx`: the row heading by cadence, the third tally bucket, a clocked item's day key.
- `TaskForm.test.tsx`: the third choice round-trips, and its bounds.
- `usePrefs.test.ts`: `showCycleTasks` absent reads as on.
- Browser check on a fresh port at phone width: a cycle chip, the heading, the form.

## Docs

`docs/DATA-MODEL.md` (the period shape and the new pref), `docs/PRD.md` F17 and the tasks section,
TODO.md (sub-project 2 done; Whimpering Wastes and the half-month as follow-ups), changelog entries
in a follow-up commit.
