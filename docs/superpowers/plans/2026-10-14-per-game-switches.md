# Per-game switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily chores and built-in weekly tasks each get a global switch plus per-game exceptions, set from a *Choose games* disclosure in *What you see*.

**Architecture:** A pure `PerGame` rule (`src/shared/perGame.ts`) — global answer, on-list, off-list — is the one place visibility is decided. Prefs gain optional exception lists; `routineGames` becomes the built-ins' on-list unchanged. Consumers (`dailyGroups`, `activeRoutines`, `routineToAsk`, `Controls`) read the rule through `choreRule` / `routineRule`.

**Tech Stack:** Bun 1.3, React 19, TypeScript strict, Tailwind, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-14-per-game-switches-design.md`

## Global Constraints

- No migration: every existing stored pref keeps its meaning; absent means unanswered.
- `showRoutines` absent is treated as off (built-ins stay opt-in).
- No new dependency; colours are tokens or game hues only (AGENTS.md § Conventions).
- Commits wait to be asked (AGENTS.md § Conventions); each task ends green and stage-ready, split
  model → store → UI → docs.

## Review Focus

- Reader with `routineGames: ["zzz"]`, nothing else → ZZZ built-ins still shown (Task 2 carry-over test).
- Reader flips global chores off with an exception on Genshin → Genshin's chore stays (Task 1, Task 3).
- Global built-ins answered → strip stops asking (Task 2).
- Hand-edited storage with a game in both lists → shown (Task 1).
- Garbage in new prefs (`choresOff: "x"`, `showRoutines: 1`) → sanitised to absent (Task 2).

---

### Task 1: The `PerGame` rule

**Files:** Create `src/shared/perGame.ts`; Test `test/per-game.test.ts`

**Produces:** `type PerGame`, `shownFor(rule, game): boolean`, `setFor(rule, game, value): { on: string[]; off: string[] }`, `exceptionLine(rule, games, name): string`.

- [ ] Write tests: truth table (no lists → `all`; on-list → true under `all:false`; off-list → false under `all:true`; both lists → true); `setFor` adds only differences, removes from the other list, removes when value equals `all`; `exceptionLine` cases `Every game`, `All but Genshin Impact`, `All but 3 games`, `No game`, `Only Zenless Zone Zero`, `Only 3 games`, counting only games in the given list.
- [ ] Run `bun test test/per-game.test.ts` → FAIL (module missing).
- [ ] Implement:

```ts
export interface PerGame {
  all: boolean;
  on?: readonly string[] | undefined;
  off?: readonly string[] | undefined;
}
export function shownFor(rule: PerGame, game: string): boolean {
  if (rule.on?.includes(game)) return true;
  if (rule.off?.includes(game)) return false;
  return rule.all;
}
export function setFor(rule: PerGame, game: string, value: boolean): { on: string[]; off: string[] } {
  const on = (rule.on ?? []).filter((g) => g !== game);
  const off = (rule.off ?? []).filter((g) => g !== game);
  if (value !== rule.all) (value ? on : off).push(game);
  return { on, off };
}
export function exceptionLine(rule: PerGame, games: readonly string[], name: (g: string) => string): string {
  const odd = games.filter((g) => shownFor(rule, g) !== rule.all);
  if (odd.length === 0) return rule.all ? "Every game" : "No game";
  const which = odd.length === 1 ? name(odd[0]!) : `${odd.length} games`;
  return rule.all ? `All but ${which}` : `Only ${which}`;
}
```

- [ ] Run → PASS; `bun run typecheck`.

### Task 2: Prefs and routines read the rule

**Files:** Modify `src/client/state/usePrefs.ts` (Prefs interface, `restorePrefsValue`), `src/shared/routines.ts` (`activeRoutines`, `routineToAsk`), `src/client/App.tsx` (call sites); Test `test/routines.test.ts`, `test/prefs.test.ts`

**Consumes:** Task 1. **Produces:** `Prefs.choresOn?`, `choresOff?`, `showRoutines?`, `routinesOff?`; `choreRule(p): PerGame`, `routineRule(p): PerGame` (in `usePrefs.ts`); `activeRoutines(rule: PerGame, copiedFrom)`; `routineToAsk(visible, rule: PerGame, asked, answered: boolean)`.

- [ ] Tests: carry-over (`routineRule({...defaults, routineGames:["zzz"]})` → `activeRoutines` gives ZZZ only; `showRoutines: true` gives both; `routinesOff:["zzz"]` under true gives Endfield only); `routineToAsk` returns null when `answered`, skips effectively-on games; restore sanitises the three new arrays and keeps `showRoutines` only when boolean.
- [ ] Run → FAIL.
- [ ] Implement:

```ts
export function choreRule(p: Prefs): PerGame {
  return { all: p.showChores, on: p.choresOn, off: p.choresOff };
}
export function routineRule(p: Prefs): PerGame {
  return { all: p.showRoutines ?? false, on: p.routineGames, off: p.routinesOff };
}
```

  Extend the array-sanitising loop to `choresOn`, `choresOff`, `routinesOff`; `showRoutines` → `undefined` unless boolean. `activeRoutines` filters `shownFor(rule, r.game)`; `routineToAsk` returns null if `answered`, skips `shownFor(rule, game)` or asked. App: `activeRoutines(routineRule(prefs), copiedFrom)`, `routineToAsk(visible, routineRule(prefs), prefs.routinesAsked, prefs.showRoutines !== undefined)`; Yes writes `routineGames: setFor(rule, game, true).on, routinesOff: …off`.
- [ ] Run full suite and typecheck → PASS.

### Task 3: Chores per game in the strip

**Files:** Modify `src/client/components/Dailies.tsx` (`dailyGroups`, `Dailies` prop), `src/client/App.tsx`; Test `test/views.test.tsx`

- [ ] Test: `dailyGroups(["genshin","hsr"], [], NOW, "europe", meta, startOf, (lane) => lane === "genshin")` → only `dailies:genshin`.
- [ ] Run → FAIL (type/behaviour).
- [ ] Implement: param `showChores: boolean | ((lane: LaneId) => boolean) = true`; check `typeof showChores === "function" ? showChores(lane) : showChores`. Same type on the `Dailies` prop. App passes `(lane) => shownFor(choreRule(prefs), lane)`.
- [ ] Run → PASS.

### Task 4: The disclosure in *What you see*

**Files:** Modify `src/client/components/Controls.tsx`; Test `test/controls.test.tsx`

- [ ] Tests: chores line `Every game` by default and `All but Honkai: Star Rail` with `choresOff:["hsr"]`; `Choose games` button present, chips absent until opened (static render); global `Show built-in weekly tasks` checkbox offered when a listed game has built-ins, reads `showRoutines`, line `Only Zenless Zone Zero` for `routineGames:["zzz"]`; no `Built-in weekly tasks for` text anywhere; weekly-task switch offered when routines effectively on via `showRoutines: true`.
- [ ] Run → FAIL.
- [ ] Implement `PerGameSwitch` component: the `Check`, then a faint line `exceptionLine(...) · <button aria-expanded>Choose games</button>`; when open, a `flex flex-wrap gap-1.5` of chip buttons (`aria-pressed`, hue border/text when on, `title` passed per chip). Chores: games = enabled, non-custom lanes; writes `{choresOn, choresOff}` from `setFor`. Built-ins: games with routines; writes `{routineGames: on, routinesOff: off, routinesAsked: [...asked minus g, g]}`; global writes `{showRoutines}`. Replace the per-game routine checkboxes; base `taskPeriods` on `shownFor(routineRule(prefs), g)` across `games`.
- [ ] Run full suite + typecheck → PASS.
- [ ] Browser check (AGENTS.md § Commands): build shell, serve on a fresh port, open settings → *What you see*, open both disclosures; screenshot at 390px and 1280px in dark and light.

### Task 5: Docs and changelog

**Files:** `docs/DATA-MODEL.md`, `docs/PRD.md` F17, `README.md`, `docs/DESIGN.md`, `TODO.md`, `src/shared/changelog.ts` (in a follow-up commit once the feature commit's hash exists).

- [ ] Update each sentence the change made false; tick the TODO with a spec link.
- [ ] `bun test`, `bun run typecheck`.
