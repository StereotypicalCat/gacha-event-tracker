# Per-game switches for chores and built-in tasks — design

Date: 2026-10-14. Status: approved (repository owner, 2026-10-14). TODO.md item 2.

## Problem

*What you see* governs two things the app supplies on a game's behalf, and governs them two
different ways:

- **Daily chores** — one global switch, `prefs.showChores` (default on). No per-game control: a
  reader who plays Genshin daily and HSR casually cannot drop only HSR's chore.
- **Built-in weekly tasks** — per-game opt-in only, `prefs.routineGames` (absent = none), drawn as
  one checkbox per game that has any. No global answer, and the checkbox list grows with every game
  and every built-in we add.

Wanted: one pattern for both — a global switch, and per-game exceptions reachable without a
checkbox per game in the group.

## Decisions

1. **One rule: a global answer and two exception lists.** For each game,
   on-list → shown; off-list → hidden; otherwise the global answer. Pure, in
   `src/shared/perGame.ts`:

   ```ts
   type PerGame = { all: boolean; on?: readonly string[] | undefined; off?: readonly string[] | undefined };
   shownFor(rule: PerGame, game: string): boolean
   setFor(rule: PerGame, game: string, value: boolean): { on: string[]; off: string[] }
   ```

   `setFor` removes the game from both lists, then adds it to the one matching `value` **only if
   `value` differs from `all`** — an exception is a difference, not a restatement. A game in both
   lists (only reachable by hand-edited storage) resolves to the on-list.

2. **Storage — nothing migrated, every current answer keeps its meaning.**

   | Pref | Meaning | Absent |
   |---|---|---|
   | `showChores` (exists) | global chores answer | `true`, as today |
   | `choresOn?`, `choresOff?` (new) | games that differ | none |
   | `showRoutines?` (new) | global built-ins answer | unanswered → treated as **off** (opt-in kept) |
   | `routineGames?` (exists) | built-ins **on** for these games — now the on-exception list | none |
   | `routinesOff?` (new) | built-ins off for these games | none |
   | `routinesAsked?` (exists) | games the strip has asked about | none |

   A reader with `routineGames: ["zzz"]` and nothing else sees exactly what they saw before: global
   off, ZZZ on. An older tab still running the cached shell reads `routineGames` and shows the
   same games. Rejected: one override map per feature with a load-time migration (an older tab would
   lose the reader's built-ins); one exception list whose meaning inverts when the global flips
   (flipping one switch would silently redefine every exception).

3. **Exceptions survive a global flip.** Changing the global switch rewrites nothing else; a game
   the reader singled out stays singled out. Discards nothing, like every switch in this group.

4. **The strip's question still answers the same setting.** `routineToAsk` asks only while
   `showRoutines` is absent (the reader has never answered globally), about a game on screen that is
   effectively off and not yet in `routinesAsked`. **Yes** writes `routineGames` via `setFor` (which,
   with the global off, adds the game) and records `routinesAsked`; **No thanks** records
   `routinesAsked` only. Once the reader answers the global switch, the strip stops asking — they
   have stated an answer for every game at once. A chip flip in settings also records the game in
   `routinesAsked`, as the per-game checkbox did.

5. **UI — a disclosure under each global switch** (owner's choice of the three placements offered).
   In *What you see*:
   - `Show each game's own daily chores` keeps its checkbox. Under it, a faint line states the
     exceptions and a **Choose games** text button opens a wrap of game chips (closed by default,
     per-visit state like *show all N*).
   - `Show built-in weekly tasks` is a new global checkbox, offered only when some game on the list
     has built-ins, replacing the per-game checkboxes. Same line and disclosure; its hint keeps the
     source-and-date disclosure per game in each chip's `title`.
   - The line reads off the rule: global on → `Every game` / `All but Genshin Impact` /
     `All but 3 games`; global off → `No game` / `Only Zenless Zone Zero` / `Only 3 games`.
     Derived at render, never stored.
   - Chips are `<button aria-pressed>` in the game-focus chip style (hue when on, faint when off),
     in the reader's game order, wrapping at phone width. Chore chips list the reader's enabled
     tracked games (a hidden game draws no chore anyway; a reader's own `mygame:` lanes have none).
     Built-in chips list every game on the list that has built-ins, as the checkboxes did.
   - The strip's Edit panel keeps its single `Daily chores` switch, bound to the global answer.

6. **Consumers read the rule, not the raw pref.**
   - `dailyGroups`' `showChores` parameter accepts `boolean | ((lane) => boolean)`; App passes
     `(lane) => shownFor(choreRule(prefs), lane)`. `Dailies` takes the same.
   - `activeRoutines(rule, copiedFrom)` and `routineToAsk(visible, rule, asked, answered)` take the
     `PerGame` rule. `Controls`' weekly/monthly switch availability uses the effective rule.
   - `usePrefs.ts` exports `choreRule(prefs)` and `routineRule(prefs)` so nothing assembles a rule
     from fields by hand.

## Out of scope

Monthly built-ins (none exist); per-game control of the reader's own tasks (they are already per
game by construction); changing the Edit panel.

## Testing

- `perGame`: the truth table of `shownFor`; `setFor` writes only differences and clears the other
  list; both-lists resolves on.
- Carry-over: prefs with only `showChores` / `routineGames` give the same chores and built-ins as
  before.
- `restorePrefsValue`: new arrays sanitised like `routineGames`, `showRoutines` kept only if
  boolean, absent stays absent.
- `routineToAsk`: no question once `showRoutines` is set; skips effectively-on games.
- `dailyGroups`: a per-lane predicate drops one game's chore and keeps the other's.
- `Controls`: the exception line for each case; no per-game checkboxes; the built-in switch reads
  `showRoutines`; chips render only when opened (static render: closed).
- Browser: the group opened, both disclosures expanded, at 390px and desktop width, both themes.

## Docs

`docs/DATA-MODEL.md` prefs keys, `docs/PRD.md` F17 built-ins paragraph, `README.md` chores
sentence, `docs/DESIGN.md` component entry for the disclosure, `TODO.md` ticked, changelog entry.
