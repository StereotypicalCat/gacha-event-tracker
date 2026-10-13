# TODO

- [x] Support check-in goals for events that require only some of the available days
  (for example, five check-ins per week). Keep unfinished events in Dailies, show progress
  against the required count, and distinguish finishing a week from finishing the event.
  Shipped 2026-10-13 — see the [spec](docs/superpowers/specs/2026-10-03-check-in-goals-design.md).
- [ ] Rework how the *What you see* settings group handles its toggles, so that the daily chores
  and the built-in weekly tasks can each be switched **globally and per game**, without adding a
  new checkbox for every game.
  - Today the two are inconsistent: the daily chores have one global switch
    (`prefs.showChores`) and no per-game control, while the built-in weekly tasks have only
    per-game switches (`prefs.routineGames`), one checkbox per game that has any. With more
    games and more built-ins, that list of checkboxes grows without bound.
  - Wanted: one pattern for both — a global switch, with per-game exceptions reachable without
    a checkbox per game in the group (for example, from each game's row in the games list, or
    a compact per-game control that only appears when asked for).
  - Keep the existing data meaning: a reader's current answers must carry over, and an absent
    pref still means "never answered" (AGENTS.md § Conventions on `knownGames`, and
    `docs/DATA-MODEL.md` § Client-side storage). The strip's one-time question about a game's
    built-ins should keep answering the same setting.
  - Code: `src/client/components/Controls.tsx` (*What you see*), `src/client/state/usePrefs.ts`,
    `src/shared/routines.ts` (`activeRoutines`, `routineToAsk`), `src/client/components/Dailies.tsx`.
