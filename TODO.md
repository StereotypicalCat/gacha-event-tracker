# TODO

- [x] Support check-in goals for events that require only some of the available days
  (for example, five check-ins per week). Keep unfinished events in Dailies, show progress
  against the required count, and distinguish finishing a week from finishing the event.
  Shipped 2026-10-13 — see the [spec](docs/superpowers/specs/2026-10-03-check-in-goals-design.md).
- [x] Rework how the *What you see* settings group handles its toggles, so that the daily chores
  and the built-in weekly tasks can each be switched **globally and per game**, without adding a
  new checkbox for every game.
  Shipped 2026-10-14 — see the [spec](docs/superpowers/specs/2026-10-14-per-game-switches-design.md).
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
- [x] hololive Dreams has not refreshed in three weeks — find out why, or find it a new source.
  Resolved 2026-10-14: the wiki lapsed after 19 Sep (still answering, still parsing, nothing
  current), and no replacement can be fetched. The source is recorded as `lapsed` — see
  `docs/SOURCES.md` § 16.
  - Still open: run 317 reported `last confirmed never` for it, while the committed meta says
    2026-09-22. The CI state in the Actions cache appears to have lost that date, perhaps by
    restoring from a chain that never held it. It is cosmetic (the message only), but worth a
    look if another source shows it.
  The footer says (2026-10-13): *"Of the games you have switched on, this one has not refreshed in
  over two days, so some end dates may have moved: hololive Dreams (21d 7h ago)."*
  - What the repo shows: `snapshots/holodori-holodoriwiki-events.meta.json` was last confirmed
    2026-09-22T17:28Z (content last changed 2026-09-22T05:28Z, one event parsed), and no
    snapshot commit has touched it since. A `304` would still have stamped a confirmation, so every
    cycle since then has either failed or skipped this host. The committed `.state.json` is older
    (2026-09-12) because CI keeps live state in the Actions cache, not the repo.
  - First: read the step summary and annotations of a recent `refresh.yml` run on Gitea for
    `holodori-holodoriwiki-events` — its `lastStatus` and whether it was `skipped_robots`, failing
    (and `broken` after three cycles), or parsing to zero. If needed, one manual dispatch with
    `only: holodori-holodoriwiki-events` and dry-run off answers it (`--dry-run` makes no requests).
  - Then, by cause: robots or an access block from the runner → AGENTS.md § Scraping conduct (no
    workarounds; a manual refresh or another source). The wiki changed shape → repair
    `src/ingest/parsers/holodori.ts` against a new fixture, keeping the old one. The wiki stopped
    being maintained (`holodori.wiki` is a Miraheze wiki) → find another source; assess it in
    `docs/SOURCES.md` as the others are.
- [x] Give *Add an event* and *Add a task* easy-to-use templates, and give both forms a UI/UX pass.
  Done 2026-10-14 as *examples to start from* — see PRD F13 and
  `docs/superpowers/specs/2026-10-14-form-examples-design.md`.
  - Templates: one tap fills the common shapes so the reader only adjusts the details — for
    example a weekly points task, a monthly shop reset, a login event, a banner with a known end.
    A template only pre-fills fields; nothing is saved until the reader saves, and no figure is
    presented as sourced unless it is (the bar `src/shared/routines.ts` holds built-ins to).
  - UI/UX pass: both forms grew field by field (`src/client/components/CustomForms.tsx`
    `EventForm`, `src/client/components/TaskForm.tsx`). Review them as a reader would — field
    order, defaults, copy, validation messages, how a cadence and a measure are chosen, phone
    width — against `docs/DESIGN.md` and `docs/PRODUCT.md`.
