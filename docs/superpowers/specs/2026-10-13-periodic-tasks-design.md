# Weekly and monthly tasks, with numeric targets

**Date:** 2026-10-13

**Status:** implemented 2026-10-13 (2a and 2b). Spec 2 of 2. The per-game switch lives in *What
you see* beside the daily-chores switch rather than on each game row, and *Make it mine* is in
settings only. Builds on `2026-10-03-check-in-goals-design.md` (the
period engine and goals) and ships after it, in two phases.

## Request and intended outcome

Games have chores that roll weekly or monthly rather than daily — earning ZZZ's weekly
activity points, completing Endfield's weekly routine. The reader wants to set these up
per game, see them beside the dailies, and track either a plain “done this period” or a
number against a target: `1900 / 2100`.

The owner's direction on where they come from: **reader-authored as the base**; the app
can also ship known tasks per game; when the reader turns a game on, the app asks whether
to use that game's automatic weekly and monthly tasks, and a toggle governs it; and a
built-in task can be copied into the reader's own tasks to edit.

The recurring-events spec (2026-08-27) deferred “weekly task lists” to its Phase C. This
is that phase for the reader's side; it adds no `GachaEvent` field and nothing to ingest.

## Decisions taken

| Question | Answer |
|---|---|
| What is a task? | A per-game chore with a period (week or month) and a measure (days or amount). Not an event: no window, no end, no status |
| Measures | `days`: N distinct game-days ticked in the period (N = 1 is “done this period”). `amount`: a number the reader enters against a `target` |
| Where amounts live | A new store, one value per item per period |
| Where ticks live | The existing day log, keyed by the task id — union merge and export already work |
| Reader-authored ids | `mytask:<random>` |
| Built-in ids | `routine:<gameId>:<slug>` |
| Built-ins on by default? | No. Per-game opt-in, asked once when the game is turned on, and a toggle in settings |
| Editing a built-in | Not in place. “Make it mine” copies it to a reader task and hides the original |
| Amount goals on events | Yes: spec 1's goal gains `measure: "amount"` variants, using the same store and editor |
| Phasing | **2a** reader tasks, amounts, amount goals. **2b** built-in routines, opt-in prompt and toggle, make-it-mine |

## Model

`src/shared/task.ts`, Zod as source of truth:

```ts
const MeasureSchema = z.union([
  z.object({ kind: z.literal("days"), required: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("amount"), target: z.number().positive(),
             unit: z.string().max(24).optional() }),            // "points", "activity"
]);
const TaskSchema = z.object({
  id: z.string(),                         // mytask:<random>
  game: z.string(),                       // LaneId; z.string() for the retirement rule
  title: z.string().min(1).max(80),
  period: PeriodSchema,                   // from period.ts: week+startsOn | month+startsOn
  measure: MeasureSchema,
  from: z.string().optional(),            // routine id this was copied from (2b)
  at: z.string(), updatedAt: z.string(),
});
```

`game` is `z.string()`, not `GameId`, for the reason `CustomEvent.game` is: narrowing it
arms every future game removal to delete reader rows on load. `days.required` is capped by
the period's length when edited (7 for a week).

`taskStatus({ task, region, now, logged, amounts })` returns `{ periodStart, count?,
value?, met, needed }` from `periodOf` and the stores. Pure; `now` explicit.

Spec 1's `GoalSchema` gains two variants: `{ period: "week", measure: "amount", target,
weekStartsOn }` and `{ period: "event", measure: "amount", target }`. An event-scoped
amount uses the event's first game-day as its period key.

## Storage

| Key | Shape | Merge on import |
|---|---|---|
| `gacha-tracker:v1:tasks` | `{ [mytask id]: Task }` | By id, later `updatedAt` wins; never removes |
| `gacha-tracker:v1:amounts` | `{ [itemKey]: { [periodStartKey]: { value, at } } }` | Per item **and** period, later `at` wins; never removes |
| `daily` (existing) | task ticks under the task id | Existing union of days |
| `prefs.routineGames` (2b) | `string[]` — games whose built-ins are on | Prefs rules as today |
| `prefs.routinesAsked` (2b) | `string[]` — games already asked about | Prefs rules as today |

- `itemKey` is a task id or an event id. A new period starts at no value; old periods are
  never pruned. Deleting a task removes the task record only — its ticks and amounts stay,
  as every log in this app does.
- Loading reads through a `validRecords`-style filter **for display only**; a task that
  fails its schema is not shown but is not dropped from storage.
- `tasks` and `amounts` are additive export keys: older exports lack them and import
  unchanged; `parseImportData` passes them through for validation by the stores.
- `mytask` and `routine` become reserved first segments alongside `dailies`, `mygame`,
  `myevent`; the existing test that no reserved segment is a `GameId` covers them.

## What the reader sees

**Dailies strip.** Weekly and monthly items sit in their game's group, after that game's
dailies, keeping the rule that a game's items stay together and that grouping never
re-sorts.

- `days` chip: tap ticks today, like a daily. Label `Weekly boss · 1/1 wk`, or `3/5 wk`.
- `amount` chip: `ZZZ activity · 1900/2100`, with a thin progress underline in the hue.
  A chip is one target, so tapping it **opens an inline editor under the strip** —
  `Activity points this week: [1900] / 2100 · Save` — rather than ticking. Enter saves,
  Escape cancels; the value is where the reader is now, not an increment.
- Met: the spec 1 met state, `2100/2100 · Done this week` / `· Done this month`.
- Header: `Today's dailies · 3/7` keeps counting dailies only; weekly and monthly items get
  their own count beside it (`Weekly 1/2 · Monthly 0/1`, each shown only when present).
  The celebration stays about today's dailies.
- Catch up: a `days` task shows its current and previous period's days as pips; an
  `amount` task shows last period's value as an editable field.
- Accessible labels: `ZZZ activity points, 1900 of 2100 this week`, `…, done this week`.

**Amount goals on events.** The detail sheet's goal control gains “Points” beside days:
`[2100] points each week` or `in total`; the checklist area shows the value and the same
editor.

**Settings — “Your own”.** A tasks list beside your games and events: add, edit, delete.
Fields: game, title, every week (start weekday) or every month (start day), and either
“tick N days” or “reach a number” (target, optional unit). Weekly start defaults to
Monday; monthly to the 1st.

### Phase 2b — built-in routines

- `src/shared/routines.ts`: per-game templates with the same fields plus `source` (URL)
  and `checked` (date). **Only a task a cited source documents ships**, the bar
  `dailyTasks` in `games.ts` is held to. The owner's first figures (ZZZ 2,100, Endfield 10) were
  checked on 2026-10-13 against sources the owner supplied; the first two built-ins are:

  | Game | Task | Measure | Week | Source (as checked) |
  |---|---|---|---|---|
  | ZZZ | Ridu Weekly | 1,300 points (last milestone) | Monday, at reset | game8.co/games/Zenless-Zone-Zero/archives/484723 (updated 2025-12-02) |
  | Endfield | Weekly Routine | 10 points (last milestone; unlocks at Authority Level 15) | Monday, at reset | endfield.wiki.gg/wiki/Weekly_Routine (edited 2026-04-11) |

  The Game8 page is ten months old; its figure ships with its `checked` date shown, so a stale
  number is visibly dated rather than presented as current.
- **Asking.** When a game with built-ins becomes visible — first-run picker, or switched on
  in settings — and is not in `routinesAsked`, a one-line card at the top of the dailies
  strip asks: `Track Zenless Zone Zero's built-in weekly tasks? Yes · No thanks`. Either
  answer records the game in `routinesAsked`; Yes also adds it to `routineGames`. Never a
  modal, and never asked twice.
- **Toggle.** *What you see* shows a “Built-in weekly tasks for <game>” switch, beside the daily
  chores switch, for each game that has built-ins, writing `routineGames` (and answering the
  strip's question). Off hides the chips; their ticks and amounts stay. Each built-in shows the
  date its source gives (`asOf`), not the date we read it.
- **Make it mine.** From the settings list: copies the template
  into a `mytask:` record with `from` set, and copies the built-in's ticks and amounts to
  the new id (additive; the originals stay). A built-in whose id is some task's `from` is
  hidden; deleting that copy brings it back.

## Testing

- `task.ts`: status for days and amounts, week and month, at period boundaries per region.
- Stores: merge rules per table above; tasks failing schema are hidden, not dropped;
  export/import round trip including old exports.
- Dailies: placement after a game's dailies, separate weekly/monthly count, editor
  save/cancel, no celebration from weekly items.
- 2b: prompt asked once per game, toggle, make-it-mine copying and hiding, routine data has
  a source on every entry (a test).
- Full suite, typecheck, browser inspection.

## Docs that change with it

PRD: a new feature entry for weekly and monthly tasks; DATA-MODEL: the two keys, the prefs
fields, reserved segments and export keys; AGENTS.md § Events the reader entered
themselves (tasks join the reader-authored spaces) and the dailies grouping rule; DESIGN.md
for the amount chip and editor; the 2026-08-27 spec's Phase C note pointing here.
