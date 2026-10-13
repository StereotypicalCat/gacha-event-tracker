# Built-in Weekly Tasks (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sourced weekly tasks per game (ZZZ Ridu Weekly, Endfield Weekly Routine), offered once when a game is on and governed by a per-game toggle, with "Make it mine" to copy one into the reader's own editable tasks.

**Architecture:** `routines.ts` holds sourced templates shaped like tasks; `taskStatus` and the Dailies strip accept anything task-shaped, so a routine renders exactly like a reader's task under its own `routine:` id. Two prefs record which games have built-ins on and which games were asked. Making one theirs is additive: a `mytask:` copy with `from`, plus a copy of its ticks and numbers.

**Spec:** `docs/superpowers/specs/2026-10-13-periodic-tasks-design.md` § Phase 2b.

## Global Constraints

- Every routine carries a source URL and the date that source states; a test refuses one without.
- Built-ins are off unless the reader says yes; asked once per game; never a modal.
- Nothing is removed by switching off or making a copy: ticks and numbers under `routine:` ids stay.
- `routineGames` / `routinesAsked` absent means *none* (opt-in), and restore validates them.
- Commits green, pathspec, one command per Bash call.

## Review Focus

1. A game turned off after saying yes — its built-ins hidden, its toggle remembered, numbers kept.
2. "Make it mine" twice — the second press must not make a second copy while the first exists.
3. Deleting the copy — the built-in comes back with its own (original) numbers.
4. A focused single game — the prompt only asks about games on screen.
5. An imported prefs file with junk in the new arrays — sanitised, not crashing.

## Tasks

### Task 1: Routine templates
`src/shared/routines.ts`, `src/shared/task.ts`, `test/routines.test.ts`.
`TaskShape = Pick<Task, "id" | "game" | "title" | "period" | "measure">`; `taskStatus` takes `task: Omit<TaskShape, "id" | "title">`-compatible input. `RoutineSchema` = TaskShape fields with `id: /^routine:[a-z0-9]+:[a-z0-9-]+$/`, `game: GameId`, plus `source: url`, `asOf: YYYY-MM-DD`, `checked: YYYY-MM-DD`, `note?`. `ROUTINES` (the two in the spec). `routinesFor(game)`. Tests: all parse, ids unique, id's game segment equals `game`, every source https.

### Task 2: Prefs and selection
`src/client/state/usePrefs.ts`, `src/shared/routines.ts`, `test/prefs.test.ts`, `test/routines.test.ts`.
`Prefs.routineGames?: LaneId[]`, `Prefs.routinesAsked?: LaneId[]` (sanitised in `restorePrefsValue`). Pure: `activeRoutines(routineGames, copiedFrom: ReadonlySet<string>)`; `routineToAsk(visibleGames, routineGames, asked): GameId | null` (first visible game with routines not yet asked and not already on).

### Task 3: In the strip, and the question
`src/client/components/Dailies.tsx`, `src/client/App.tsx`, `test/views.test.tsx`.
`Dailies` `tasks` accepts `TaskShape[]`; App passes reader tasks plus `activeRoutines(...)`. A `RoutinePrompt` line at the top of the strip: `Track Zenless Zone Zero's weekly tasks? Yes · No thanks` (both record asked; Yes adds to `routineGames`); the strip renders for the prompt alone. Routine items' `title` attribute carries `Source: <host>, as of <date>`.

### Task 4: Settings — toggle, list, make it mine
`src/client/components/Controls.tsx` (games group row), `src/client/components/YourOwn.tsx`, `src/client/App.tsx`, `test/custom-ui.test.tsx`, `test/controls.test.tsx`.
Games row: `Weekly tasks` checkbox on games with routines. Your own: "Built-in weekly tasks" list of active routines — title, caption, `source as of Dec 2025` link, `Make it mine`. App `makeItMine(routine)`: refuses if a task with `from === routine.id` exists; else `addTask({...shape, from})`, `daily.merge({[newId]: log})`, `amounts.merge({[newId]: raw})`. `useTasks.addTask` accepts `from`.

### Task 5: Docs and a look
PRD F17 (built-ins paragraph replaces "not built yet"), DATA-MODEL (prefs fields, `routine:` written now), DESIGN (prompt line, toggle), spec status. Browser: prompt, chips, settings list.
