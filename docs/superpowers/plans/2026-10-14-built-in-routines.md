# Built-in routines and per-item tracking — plan

Spec: `docs/superpowers/specs/2026-10-14-built-in-routines-design.md`. Branch `feat/built-in-routines`.

**Done 2026-10-16.** The owner verified the entries game by game in the game itself, then signed
off; the split below was applied as written (`612e0a2..9d5b473`, changelog `23924db`), each commit
tested on its own, fast-forwarded into `main` and pushed. Two in-game checks remain open in TODO.md.

## Tasks

1. **Hide one built-in (model).** `activeRoutines(rule, copiedFrom, hidden?)` and
   `hiddenAfter(hidden, id, track)` in `src/shared/routines.ts`; `routinesHidden?` on `Prefs` and in
   `restorePrefsValue`'s list sanitiser. Tests first in `test/routines.test.ts`. ✅
2. **Track one built-in (prefs).** `trackRoutinePatch(prefs, routine, track)` in `usePrefs.ts`:
   stop → hide; track with game on → unhide; track with game off → game on via `setFor`, recorded
   as asked, siblings hidden. Tests first. ✅
3. **Edit panel.** `StripStanding` and `standing` / `onTrack` on `StripEditor`; `laneGroups`
   generic; per game: chore, built-ins, events; *Stop tracking* on each; *Track · N* over all three
   kinds; rename *Remove from dailies* / *Add an event*. Tests first in `test/edit-dailies.test.tsx`. ✅
4. **App wiring.** Strip tasks exclude hidden built-ins; `standing` built from the strip's games
   (chore unless a reader's own game, then that game's built-ins less copied ones); `onTrack` writes
   `choresOn`/`choresOff` or `trackRoutinePatch`. ✅
5. **Your own.** Every built-in of the games that are on, *Not tracked* marked, Track / Stop
   tracking beside *Make it mine*. Test in `test/custom-ui.test.tsx`. ✅
6. **Copy.** "weekly tasks" → "weekly and monthly tasks" for built-ins in `Dailies.tsx`,
   `Controls.tsx`, `YourOwn.tsx`; per-game tooltip quotes the oldest source date. Tests updated. ✅
7. **Entries.** Add the spec's § Entries to `ROUTINES`; correct Ridu Weekly to 2,100 with its new
   source; per-game table test pinned to the spec. ✅
8. **Review.** schema-guardian on the new pref — no blocking findings. ✅
9. **Docs.** PRD F12 (Edit panel) and F17, DATA-MODEL prefs block and built-in paragraph. ✅
10. **Browser check** of the Edit panel and *Your own* on a fresh port (AGENTS.md § Commands). ✅
11. **Owner verification** of § Entries and § Not shipped — then apply any corrections to both the
    entries and the spec table together. ✅ (Endfield Focus Commissions and Nikki Realm of
    Breakthrough still to confirm — TODO.md)
12. **Changelog** — entry in a follow-up `chore(changelog)` commit naming the feature commit, then
    `bun run scripts/check-changelog.ts`. ✅
13. **Standard-banner pulls** (spec decision 10, owner 2026-10-16). Tests first: twin per standard
    line, `activeRoutines` leaves standard out unless asked, `standardPulls` restore, Settings
    switch. Then `pulls` on `RoutineSchema` and `offered()`; premium lines tagged; four standard
    lines; `standardPulls` pref; App and Controls wiring; schema-guardian; PRD F17, DATA-MODEL. ✅
    Browser check with task 10. ✅

## Commits (after sign-off)

1. `feat(routines): let a reader stop tracking one built-in` — tasks 1–2.
2. `feat(dailies): track or stop tracking anything in the strip from Edit` — tasks 3–5.
3. `feat(routines): say "weekly and monthly" for built-ins` — task 6.
4. One `feat(routines): …` commit per game for task 7 — Genshin, Star Rail, ZZZ (including the
   Ridu correction, as its own `fix(routines)` commit), Endfield (with the reset-hour evidence in
   `games.ts`), NTE, Wuthering Waves, Infinity Nikki — each with its rows of the test table.
5. `feat(routines): let a reader add standard-banner pulls beside the premium ones` — task 13,
   after the per-game commits: it carries the `pulls` field, the `pulls: "premium"` tags on the
   existing shop lines, and the four standard lines, so each per-game commit stays green without it.
6. `docs: …` — spec, plan, PRD, DATA-MODEL, and TODO.md's open checks.
7. `chore(changelog): …` — task 12.
8. Separately, if the owner agrees: `fix(games): …` moving NTE's Europe server to UTC+2 (TODO.md).
