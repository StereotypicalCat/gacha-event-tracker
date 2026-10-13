# Event check-in goals

**Date:** 2026-10-03, revised and approved 2026-10-13

**Status:** approved; spec 1 of 2. Spec 2 is
`2026-10-13-periodic-tasks-design.md`, which reuses the period engine defined here.

## Request and intended outcome

Some events require a fixed number of check-ins rather than participation every day.
The owner's example is Genshin's “To Temper Thyself and Journey Far”: five completions
out of seven days in a week. The event must stay in Dailies while unfinished, show how
many check-ins the week needs, and distinguish meeting this week's requirement from
finishing the event.

Checked against the feed: the event runs Monday 2026-08-10 to Monday 2026-11-02, twelve
whole weeks, and Game8 describes it as “Daily and Weekly Training Goals”. Genshin's week
rolls on Monday at the server's daily reset. So weeks that start on a chosen weekday at
the game's reset fit it. The required count is not published in our sources, which is
one reason a goal is reader input rather than parsed.

## Decisions taken

| Question | Answer |
|---|---|
| Who sets a goal? | The reader, per event, in the detail sheet. Nothing is inferred from a title or source |
| Modes | **Each week**: N distinct game-days per week. **Across the event**: N distinct game-days in the whole window |
| Week boundary | A chosen ISO weekday, at the game's server reset for the reader's region. Defaults to the weekday of the event's first game-day |
| Numeric targets (`1900 / 2100`) | The goal carries `measure` from day one. This spec ships `measure: "days"` only; spec 2 adds `"amount"` and its store |
| Does meeting a goal finish the event? | Never. Only the reader marks an event done |
| Does a met week stay in Dailies? | Yes, as done-this-week, until the reader marks the event done |
| `GachaEvent`, IDs, day-log keys, storage keys | Unchanged |

## The period engine — `src/shared/period.ts`

Pure, takes `now` explicitly, and works in **day-key space** like `streakOf` and
`catchUpDays`: every day is a `YYYY-MM-DD` key already cut on the game's reset clock by
`dayKey`, so period boundaries inherit each game's per-region reset with no new clock.

```ts
type Period =
  | { unit: "week"; startsOn: 1 | 2 | 3 | 4 | 5 | 6 | 7 }   // ISO weekday
  | { unit: "month"; startsOn: number };                     // 1–31, used by spec 2

/** The period containing `today`, as its first key and its day keys, oldest first. */
periodOf(period: Period, today: string): { start: string; days: string[] };
```

- **Week:** the ISO weekday of a key is its UTC weekday (keys are dates, not instants).
  Step back `(weekday − startsOn + 7) % 7` days from `today`; take seven keys.
- **Month** (spec 2's consumer, built and tested here because it is the same function):
  the most recent key whose day-of-month is `startsOn`, clamped to the month's last day
  when the month is shorter (31 → 30 Sep, 28/29 Feb). The period runs to the day before
  the next start.
- Callers get `today` from `dayKey(now, region, game)`, so “immediately before reset”
  and “at reset” fall in different periods exactly where the game's day rolls.

## Goals — `src/shared/goal.ts`

Zod is the source of truth for the type:

```ts
// A plain union, not discriminatedUnion("period"): spec 2 adds amount variants that
// share a period with these, so no single field discriminates.
const GoalSchema = z.union([
  z.object({ period: z.literal("week"),  measure: z.literal("days"),
             required: z.number().int().min(1).max(7),
             weekStartsOn: z.number().int().min(1).max(7) }),
  z.object({ period: z.literal("event"), measure: z.literal("days"),
             required: z.number().int().min(1).max(366) }),
]);
type Goal = z.infer<typeof GoalSchema>;

/** A stored value as a Goal, or undefined when absent or unreadable. Never throws. */
readGoal(stored: unknown): Goal | undefined;

goalStatus(input: {
  goal: Goal; startsMs: number; endsMs: number | null;
  region: Region; game: LaneId; now: number; logged: readonly string[];
}): GoalStatus;

interface GoalStatus {
  scope: "week" | "event";
  required: number;
  count: number;          // distinct ticked keys in scope, never later than today
  met: boolean;           // count >= required
  needed: number;         // max(0, required - count)
  open: number | null;    // unticked days in scope from today on; null when unknowable
  shortfall: boolean;     // open !== null && needed > open
}
```

Counting rules:

- **Scope.** Week: `periodOf` for today, intersected with the event's days — `dailyDays`
  when the end is known, otherwise every key from the event's first game-day. Event:
  `dailyDays`; with an unknown end, every key from the first game-day to today, and
  `open` is null rather than a guess.
- **One per game-day**, from the existing day log. A key later than today never counts.
  A tick outside scope never counts and is never removed.
- **A short first or last week keeps its target.** If too few days remain, `shortfall`
  says so; the target is not lowered and no day is invented.
- Catch-up and corrections need no special handling: status is recomputed from the log on
  every render, so backfilling a previous week cannot move this week's count.

**Validated where used, never stripped from storage.** `readGoal` returns undefined for a
missing or unreadable goal and the record is left exactly as stored. Dropping an invalid
field on load would delete it from the device on the next write — the hazard AGENTS.md
§ Events the reader entered themselves describes — and the likeliest unreadable goal is a
newer shape (spec 2's `amount`) read by an older cached bundle. Setting a goal in the UI
overwrites whatever was there.

## Storage

`Progress` gains `goal?: unknown` in storage, read through `readGoal`. Concretely:

- `isEmpty` treats a present `goal` as recorded, so a goal-only record survives.
- Export and import need no new key: goals ride `progress`, and `mergeProgress` already
  keeps the later-edited record whole. Old backups lack the field and remain valid.
- No ID, day-log key, game-day format, reset mapping or localStorage key changes.

## Dailies eligibility

- An event whose `readGoal` is defined is a daily, whatever detection or `progress.daily`
  says. App computes `daily = goal !== undefined || resolveDaily(...)`.
- **Setting a goal** clears a stored `daily: false` (the two would contradict) and leaves
  any other `daily` value alone, so removing the goal later restores exactly the earlier
  detection and override behaviour.
- **“This isn't a daily event”** clears the goal in the same patch, and its confirmation
  copy says so when a goal is set. No conflicting state is left hidden in storage.
- `outstanding` is unchanged: done or ignored events leave the strip regardless of display
  preferences; undoing either restores the event with its goal and ticks.

## What the reader sees

**Detail sheet — “Check-in goal”** under the daily checklist, and offered on non-daily
events too (setting one makes the event a daily). Three choices in the style of the
existing status and effort controls: **Off** · **Each week** `[5] days, weeks start
[Monday]` · **Across the event** `[5] days`. Weekly `required` is 1–7; event-wide is
capped at the known number of days when the end is known.

**Checklist caption** when a goal is set replaces the “missed” wording, because an
unticked past day is not a failure when every day was never required:

- Weekly: `3 of 5 this week · 2 needed · 4 days left this week`
- Event-wide: `3 of 5 · 2 needed · 9 days left`, or `3 of 5 · 2 needed` with an unknown end
- Shortfall: `2 needed, 1 day left this week`
- Met: `5 of 5 · Done this week` / `5 of 5 · Goal reached`. An event-wide goal reached
  shows **Mark event done** beside it, which uses the existing status control.

Past days stay editable after a target is reached; removing a tick can unmeet it.

**Dailies chip.** Gains a short count: `3/5 wk` or `3/5`. Tapping still ticks today.
Three visually distinct states:

| State | Look | Accessible label suffix |
|---|---|---|
| Not done today, goal unmet | Outstanding chip as now, plus count | `, not done today, 3 of 5 this week` |
| Goal met, not ticked today | Full-strength hue border and check, outstanding background | `, done this week` / `, goal reached` |
| Ticked today | Done chip as now, plus count | `, done today` |

**Header count and celebration.** In `Today's dailies · n/total`, an item is complete when
ticked today **or** its goal is met — no tick is fabricated. The burst fires only when the
number of items **ticked today** rises and everything is complete, so meeting a week by
backfilling an earlier day completes the strip quietly, as backfilling does today.

## Testing

- `period.ts`: week starts for every `startsOn`, across month and year ends; month starts
  with clamping; Genshin keys immediately before and at reset for Asia, America and
  Europe, and a game with a reset override (`resetHourLocal`).
- `goal.ts`: acceptance cases 1–7 below as pure tests, including future ticks, ticks
  outside scope, partial first and last weeks, shortfall and unknown ends; `readGoal` on
  missing, malformed and future-shaped values.
- Progress: goal-only records survive `patch`; `mergeProgress` keeps the later record's
  goal; export → import round trip keeps goals; an old export imports unchanged.
- Dailies: `dailyGroups`/item completion with goals; the burst rule; labels.
- Full offline suite and typecheck; inspect the built page in headless Chrome.

## Acceptance checks

1. A five-per-week event with detection off appears in Dailies; three distinct ticks read
   `3/5 wk`.
2. Five non-consecutive days meet the week: still visible, labelled done this week, not
   marked done, counted complete in the header.
3. The next week boundary offers the event again; earlier ticks are unchanged.
4. Backfilling a previous week never moves this week's count; removing a current tick
   below target restores the unmet state.
5. A five-day event-wide goal in a seven-day window is reached on the fifth day and waits
   for an explicit Mark event done.
6. Done and ignored events stay excluded; undoing either restores goal and ticks.
7. Partial weeks, unknown ends, future ticks, regional resets and reset overrides count
   correctly with no invented date and no deleted history.
8. Goal-only progress survives reload and export/import; old backups import; an
   unreadable goal leaves the record intact and behaves as no goal.
9. Events with no goal behave exactly as before.
10. Accessible labels distinguish done today, done this week and goal reached.

## Docs that change with it

PRD F12 (check-in goals paragraph); DATA-MODEL § Client-side storage `progress` table and
key comment, § Daily checklists, § Export format; AGENTS.md § Events that repeat daily (a
goal makes an event a daily; meeting one never marks it done); DESIGN.md for the
goal-met chip state and the goal control.
