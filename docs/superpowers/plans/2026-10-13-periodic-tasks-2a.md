# Weekly and Monthly Tasks (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the reader add their own weekly and monthly tasks per game — ticked N days per period, or a number against a target (`1900 / 2100`) — shown beside the dailies, and let an event's check-in goal be a number too.

**Architecture:** One status shape for everything periodic: `GoalStatus` (from `goal.ts`) gains month scope, an `amount` measure and the period's start key, and `taskStatus` returns it. That lets the Dailies chip, its count, label and tallying serve chores, events and tasks alike. Two new stores: `tasks` (raw records kept, validated for display only) and `amounts` (a value per item per period). Both travel in the export.

**Tech Stack:** Bun, TypeScript, React 19 (static-render tests), Zod 3, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-13-periodic-tasks-design.md` (phase 2a), building on `docs/superpowers/specs/2026-10-03-check-in-goals-design.md`.

## Global Constraints

- No change to `GachaEvent`, event IDs, day-log keys or existing storage keys. New keys: `gacha-tracker:v1:tasks`, `gacha-tracker:v1:amounts`.
- Never drop a stored record on load: the task store keeps raw records and filters for display; the amount store never prunes a period.
- Import merges and never removes: tasks by id, later `updatedAt` wins; amounts per item **and** period, later `at` wins; malformed incoming entries are skipped.
- `Task.game` is `z.string()`, never `GameId` (AGENTS.md § retirement rule).
- `mytask` joins `RESERVED_ID_SEGMENTS` (and `routine`, reserved now for 2b).
- A chip is one target: an amount chip opens an editor, it never ticks.
- The header's `Today's dailies · n/total` counts day-cadence items only; weekly and monthly tasks get their own counts; only a real tick today celebrates.
- All calculations pure, `now` explicit. Commits: one coherent change each, green, pathspec, one command per Bash call.

## Review Focus

1. **A task record a later version wrote** (unknown measure) — hidden, never removed from storage, and survives export/import.
2. **An amount typed as `1,900`, `1900.5`, empty or negative** — amounts are whole numbers: separators are stripped, decimals rounded, empty or unreadable is mid-edit (Save disabled), negative refused.
3. **A monthly task with start day 31 in a 30-day month** — period boundaries from `periodOf`'s clamping; the amount key is the clamped start.
4. **Importing an older backup onto a device whose amount for the same week is newer** — the newer value stays.
5. **A task on a game the reader has hidden or isn't focused on** — not shown; its data untouched.

## Tasks

Each task: write the named tests first and watch them fail, implement, run `bun test` + `bun run typecheck`, commit by pathspec.

### Task 1: Amount goals and month scope in the goal model
**Files:** `src/shared/goal.ts`, `test/goal.test.ts`
**Produces:**
- `GoalSchema` adds `{ period: "week", measure: "amount", target: number (>0, ≤1e9), weekStartsOn }` and `{ period: "event", measure: "amount", target }`.
- `type AmountLog = Record<string /*periodStart*/, { value: number; at: string }>`.
- `GoalStatus` gains `measure: "days" | "amount"`, `periodStart: string`, and `scope: "week" | "month" | "event"`.
- `goalStatus` input gains `amounts?: AmountLog`. For amount: `count = amounts[periodStart]?.value ?? 0`, `required = target`, `open` = remaining days in scope (null for an unknown-end event), `shortfall = false`. `periodStart` = the week's start, or the event's first game-day for event scope.
- Copy: `goalCaption` amount → `1,900 of 2,100 this week · 200 to go`, met → `2,100 of 2,100 · Done this week`; `goalCount` amount → `1,900/2,100` (+` wk`/` mo`); month scope → `this month` / `mo` / `done this month`. Numbers via `toLocaleString("en-US")`.
- `goalRequired(goal): number` (required or target) for callers that showed `goal.required`.

**Tests:** amount week counts the stored value for this week only; last week's value ignored; met at ≥ target; event-scope amount keyed by first game-day; captions/count/label for amount and month; `readGoal` accepts amount shapes and still rejects `{measure:"amount"}` without target.

### Task 2: The task model
**Files:** create `src/shared/task.ts`, `test/task.test.ts`; modify `src/shared/custom.ts` (`RESERVED_ID_SEGMENTS` += `"mytask"`, `"routine"`).
**Produces:**
- `TaskId = z.string().regex(/^mytask:[a-z0-9]{6,32}$/)`, `mintTaskId(random = Math.random): string`.
- `MeasureSchema` = `{ kind: "days", required: 1–31 }` | `{ kind: "amount", target: >0 ≤1e9, unit?: string ≤24 }`.
- `TaskSchema` = `{ id, game: z.string().min(1), title: 1–80 trimmed, period: PeriodSchema, measure, from?: string, at, updatedAt }`, `type Task`.
- `taskStatus({ task, region, now, logged, amounts }): GoalStatus` — scope = `period.unit`; days: distinct ticks in `periodOf(...)` ≤ today; amount: value at the period start; `open` = period days ≥ today unticked (days) or remaining (amount); `required` for days capped at the period length.
- `taskCaption(task): string` — `every week from Monday · tick 1 day` / `every month from the 1st · reach 2,100 points`.

**Tests:** weekly days task done once this week; monthly amount task reads its month's key with 31→30 clamping; per-region boundary at reset (Genshin Europe); reserved segments include `mytask` (extend the existing `custom.test.ts` loop expectation if needed); caption strings.

### Task 3: Task and amount stores
**Files:** create `src/client/state/useTasks.ts`, `src/client/state/useAmounts.ts`, `test/tasks-store.test.ts`; modify `src/client/state/storage.ts` (KEYS `tasks`, `amounts`).
**Produces:**
- `mergeTasks(current: Record<string, unknown>, incoming: unknown): Record<string, unknown>` — validates incoming with `TaskSchema`, skips bad ones, keeps current records (even unreadable), later `updatedAt` wins.
- `visibleTasks(raw: Record<string, unknown>): Task[]` — the parseable ones, sorted by game then title.
- `useTasks()` → `{ tasks: Task[], addTask(draft), editTask(id, draft), removeTask(id), merge(incoming: unknown) }` with `type TaskDraft = { game, title, period, measure }`.
- `mergeAmounts(current: AmountLogMap, incoming: unknown): AmountLogMap` — per item and period, finite numbers only, later `at` wins, never removes.
- `useAmounts()` → `{ amounts: AmountLogMap, amountsFor(key): AmountLog, setAmount(key, periodStart, value: number | undefined), merge(incoming: unknown) }`. `setAmount(undefined)` removes that one period's entry (reader's own action).

**Tests:** unreadable stored task kept by merge and hidden by `visibleTasks`; merge later-wins both directions; amounts merge per period (older backup cannot roll back a newer week; a period only on one side survives; strings/NaN skipped).

### Task 4: Tasks and amounts in export and import
**Files:** `src/client/state/export.ts`, `src/client/App.tsx`, `test/progress.test.ts`.
**Produces:** `ExportData.tasks?`, `ExportData.amounts?`; `buildExportData(..., own: { games, events, tasks?, amounts? }, prefs?)` writes them when given; `ParsedImport.tasks: unknown`, `ParsedImport.amounts: unknown`; `importProgress` gains `mergeExtra(tasks, amounts)` before `restorePrefs`.
**Tests:** round trip keeps tasks (including an unreadable one) and amounts; an export without the keys parses with both `undefined`.

### Task 5: Tasks and amounts in the Dailies strip
**Files:** `src/client/components/Dailies.tsx`, create `src/client/components/AmountEditor.tsx`, `src/client/App.tsx`, `test/views.test.tsx`.
**Produces:**
- `DailyItem` gains `cadence: "day" | "week" | "month"` and `period?: Period` (tasks). Chores and events are `"day"`.
- `dailyGroups(..., goalFor, tasks: readonly Task[] = [], taskStatusFor: (t: Task) => GoalStatus = …)` appends a lane's tasks after its events, **only for lanes in `games`** (no stragglers: a hidden game's tasks stay hidden).
- `dailyTally` returns `{ total, complete, tickedToday, week: { total, complete }, month: { total, complete } }`, where `total/complete` count `"day"` items only.
- An item whose `goal.measure === "amount"` renders as an amount chip: label, `1,900/2,100`, a 2px underline in the hue at `count/required` width; click opens `AmountEditor` under the strip (`<label>{title} this week: <input> / 2,100 <unit>` · Save · Cancel; Enter saves, Escape cancels; empty or invalid disables Save; negative refused; integers).
- Header: `Today's dailies · n/total` then, when present, `· Weekly a/b · Monthly c/d`.
- Catch up: a days task gets `catchUpDays` pips as a chore does; an amount task gets an `AmountEditor` for the previous period.
- `Dailies` props: `tasks?`, `taskStatusFor?`, `onSetAmount?: (key, periodStart, value) => void`, `amountFor?: (key, periodStart) => number | undefined`.
**Tests:** task placement after events; hidden-lane tasks absent; separate counts; amount chip renders `1,900/2,100` with no `aria-pressed`; `chipLabel` for amount and month (`…, 1,900 of 2,100 this week`, `…, done this month`); `AmountEditor` static render with value and target.

### Task 6: Amount goals on events in the detail sheet
**Files:** `src/client/components/GoalControl.tsx`, `src/client/components/EventDetail.tsx`, `src/client/components/DailyChecklist.tsx` (none if the caption already handles amount), `src/client/App.tsx`, `test/views.test.tsx`, `test/custom-ui.test.tsx`.
**Produces:** `GoalControl` shows, once a goal is set, a measure toggle **Days · Points**; Points shows `[2100] points each week` / `in total` with its own draft field. `chooseGoal` keeps the measure when switching period. `EventDetail` gets `amount?: number`, `onSetAmount(id, periodStart, value)`, and renders an `AmountEditor` (always open, inline) under the goal control for an amount goal.
**Tests:** `chooseGoal` keeps measure; switching Days→Points carries a sensible default target (100); sheet renders the editor with the current value.

### Task 7: Your tasks in settings
**Files:** create `src/client/components/TaskForm.tsx`; modify `src/client/components/YourOwn.tsx`, `src/client/components/Controls.tsx` only if props pass-through needs it, `src/client/App.tsx`, `test/custom-ui.test.tsx`.
**Produces:** "Your weekly and monthly tasks" list in the Your own group (game short name, title, `taskCaption`, Edit, Delete) and **Add a task**. `TaskForm`: game (select of lanes by name), title, Every week (weekday select, default Monday) / Every month (day 1–31, default 1), Tick it off (`[1]` days) / Reach a number (`[target]` + optional unit). Save disabled until valid against `TaskSchema`.
**Tests:** form renders defaults; list shows caption; empty state shows the add button.

### Task 8: Docs and a look
PRD new feature entry (F17 — weekly and monthly tasks); DATA-MODEL keys, shapes, merge rules, reserved segments, export keys; AGENTS.md § Events the reader entered themselves (tasks join the reader's spaces; task store never drops on load); DESIGN.md amount chip + editor; spec status; recurring-events spec Phase C pointer. Build and screenshot the strip with a weekly amount task and a monthly tick task, and the settings form, dark and light, on a fresh port.
