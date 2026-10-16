# TODO

- [ ] Make it clear which game each *This week & month* chip belongs to (owner, 2026-10-16: "it can
  become a bit unclear"). With built-ins for seven games, that row now holds many chips whose
  titles do not name their game — "Weekly Routine", "Weekly Challenge", "City Stamina",
  "Realm of Breakthrough" — and today only the chip's hue says which game it is
  (`Dailies.tsx`, the `longer` row; the comment above `today` explains why the strip has no
  per-game headings: they would push *next to expire* down the page). Hue alone is weak — some
  games' hues are close, and colour cannot be the only carrier of meaning for accessibility.
  Options to weigh in a short design: the game's short name before the title on each chip
  (as *Your own* already does), one compact game label per run of chips (the row is already in
  game order), or grouping by game only in this row. Keep the row short, check it in a browser at
  phone width, and keep the chip's accessible name naming the game (it already does).
- [ ] **Sub-project 2 of the "usual repeatable events" request: N-week cycles.** Built-ins today
  repeat weekly or monthly; many endgame modes run on longer fixed cycles. Add a period unit anchored
  to a known start (every N weeks or days from a dated reset). It is a stored-shape change, so it
  gets its own brainstorm → spec → plan (owner's process: once a design is approved, carry it
  through with no extra review stops, and report decisions at the end), and a schema-guardian
  review. Entries are verified by the owner in game, game by game, before anything is committed —
  the same hold sub-project 1 used.
  - **Facts already gathered** are in the [sub-project 1 spec](docs/superpowers/specs/2026-10-14-built-in-routines-design.md)
    § Scope item 2, each with the owner's in-game reading and its UTC instant: Star Rail's Pure
    Fiction / Forgotten Hall / Apocalyptic Shadow (six-week cycles two weeks apart, ending 19 Oct,
    2 Nov, 16 Nov 2026), Divergent Universe + Currency Wars (one 18,000-point cap per two-week
    period, ending 19 Oct), ZZZ's Shiyu Defense and Deadly Assault (Fridays, a week apart: 16 and
    23 Oct), Wuthering Waves' Tower of Adversity (28 days, 9 Nov) and Whimpering Wastes (26 Oct),
    NTE's Beyond the Rails (14 days, "typically", ending 21 Oct 21:00 UTC — an Asia-server
    instant, possibly the same for every server) and Tycoon Incentive Fund (14 days, 26 Oct; the
    cap differs per player through the Puka Membership Program — base 1,000,000).
  - **Still to source:** cycle lengths for ZZZ's two modes and Whimpering Wastes (a timer read
    just after each reset gives them); Infinity Nikki's Pinnacle Contest (half-month periods) and
    Merit Arena (from earlier research: a new arena each Monday, six per version — no wiki page,
    and its weekly caps change per version).
  - **Design questions to settle:** a cycle that ends at one instant for every server (Beyond the
    Rails) vs one per server reset; a target that differs per player (the Incentive Fund) — the
    reader sets it, or ship the base with a note; whether "typically every 14 days" is safe to
    model as fixed.
- [ ] **Rework the settings, with mockups first** (owner, 2026-10-16: "we will have to do a
  settings rework of some kinds with some mockups"). *What you see* keeps gaining switches —
  dailies, built-ins globally and per game, standard-banner pulls, weekly / monthly tasks, and
  with N-week cycles a third task switch (`showCycleTasks`). Start with mockups the owner can
  compare (the brainstorming visual companion), not code; keep every pref's stored meaning
  (`docs/DATA-MODEL.md` § Client-side storage — an absent pref still means never answered).
  Code: `src/client/components/Controls.tsx`, `src/client/state/usePrefs.ts`.
- [ ] Find out whether NTE's *Beyond the Rails* ends at one instant for every server. On
  2026-10-16 the owner, on Europe, read it ending Wednesday 2026-10-21 at 21:00 UTC — the Asia
  server's Thursday 05:00 UTC+8 reset, not Europe's 03:00 UTC. The built-in therefore rolls on
  Asia's clock for every reader (`clock: "asia"`, sub-project 2). A timer read from the America
  server (and one from Asia, to be sure) settles it; if America rolls on its own reset, the
  clock is per server and the entry needs changing.
- [ ] **Sub-project 3: dated battle pass and shop windows as feed events.** Source and parser work
  (AGENTS.md § the ingest pipeline; the `adapter-author` agent and `add-game-source` skill), not
  built-ins. **Check the feed first**: Genshin's battle pass is already a feed event (`Battle Pass
  - Moontrace`, de-duplicated against Fandom's `Moontrace` on 2026-10-14), so a new source must not
  add a third copy. A local `build:static` on 2026-10-16 still showed both names — probably the
  locally staged feed predating that fix; confirm against the live feed.
  - **Candidate sources** (from research, 2026-10-14): Genshin Fandom lists Battle Pass /
    Moontrace and the Miliastra Pass; endfield.wiki.gg mentions the Protocol Pass.
  - **End dates the owner read in game**, in the sub-project 1 spec § Scope item 3: Endfield
    Protocol Pass (~15 Oct 00:00 CEST), Genshin Battle Pass (2 Nov 03:00 UTC), Wuthering Waves'
    Oscillated Coral shop (resets each version, 11 Nov ~10–11 UTC), ZZZ City Fund season (19 Oct
    03:00 UTC), Infinity Nikki Mira Journey (29 Oct ~20:00 UTC). Never invent a date: an event is
    built only from a source that states it; these readings are for checking a parser.
- [ ] Give Genshin's *To Temper Thyself and Journey Far* a check-in goal by default, so a reader
  need not set it by hand. The owner asked on 2026-10-16 to "mark it as a 4/5 wk event"; earlier
  the same day they described it as five days out of seven, and the [check-in goals spec](docs/superpowers/specs/2026-10-03-check-in-goals-design.md)
  says five of seven — **confirm the count with the owner before building**. Today the goal is
  the reader's own (`progress[id].goal`), set from the event's checklist; with it set, a met week
  stays done in the strip for the rest of the week (checked in a browser on 2026-10-16). A default
  must not overwrite a goal the reader already set, and the event's id changes each cycle
  (`…:2026-08-10`), so it should match by title or source, not id.
- [x] Move NTE's Europe server to UTC+2. `games.ts` rolls it at 05:00 UTC+1 (04:00 UTC), per
  Game-Time-Master and GameWith, but the game disagrees. On 2026-10-16 the owner read: a weekly
  timer of 3d 2h at 00:40 UTC (→ Monday 2026-10-19 **03:00 UTC**); Realm of Greed's own text, "Gold
  Heist resets every Monday at 5:00"; and the Tycoon Incentive Fund at 10d 2h at 00:43 UTC (→
  Monday 2026-10-26 **03:00 UTC**, the day after the clocks change). Only 05:00 on a fixed UTC+2
  fits all three — 03:00 UTC all year, not a server that follows daylight saving. Fix: set
  `resetOffsets.europe: 2` for `nte` with a test, as a day-key change under AGENTS.md § Event IDs,
  and update `docs/DATA-MODEL.md`'s reset table and Game-Time-Master's place as the source. One
  NTE timer read after 2026-10-25 would confirm it (it should still land on 03:00 UTC). See the
  [built-in routines spec](docs/superpowers/specs/2026-10-14-built-in-routines-design.md).
  Done 2026-10-16 (`resetOffsets.europe: 2`); a timer read after 2026-10-25 would still confirm it.
- [ ] Confirm Infinity Nikki's *Realm of Breakthrough* in game: still two Phantom Trials (Wish
  Master Chigda, Guardian Beast Whirls), once a week each, renewed at the Monday reset? The owner
  could not check on 2026-10-16 ("insufficient story progress" — it unlocks after *Showdown with
  Chigda!*). Until then the entry stands on infinity-nikki.fandom.com/wiki/Realm_of_Breakthrough
  (as of 2026-01-01), whose "currently there are two Trials" is the oldest claim in the Nikki
  list. If it differs, correct `routine:nikki:realm-of-breakthrough` in `src/shared/routines.ts`
  and its row in the [spec](docs/superpowers/specs/2026-10-14-built-in-routines-design.md)
  § Entries together, with the note `Confirmed in game, YYYY-MM-DD.`
- [ ] Confirm Endfield's *Etchspace Salvage: Focus Commissions* in game: still 3 commissions a
  week, and does it reset on Monday with the *Weekly Routine* (EU: Monday 11:00 CEST, confirmed
  2026-10-14)? The owner could not check on 2026-10-14 ("due to mission progress"). Until then the entry stands on endfield.wiki.gg/wiki/Etchspace_Salvage (as of
  2026-09-01), whose "weekly" is read as Monday from the wiki's own weekly-reset box. If either
  is wrong, correct `routine:endfield:focus-commissions` in `src/shared/routines.ts` and its row
  in the [spec](docs/superpowers/specs/2026-10-14-built-in-routines-design.md) § Entries
  together, with the note `Confirmed in game, YYYY-MM-DD.`
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
