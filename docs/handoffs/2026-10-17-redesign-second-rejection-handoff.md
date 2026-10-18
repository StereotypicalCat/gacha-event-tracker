# Redesign handoff: second implementation rejected

Date: 2026-10-17. Repository: `/home/user/gacha-event-tracker`.

## Start here: launch the current server, then ask the owner

**Explicit owner instruction for the next agent:** launch the current server, make it accessible
on `0.0.0.0`, give the owner its browse URL, **then ask the owner for the biggest differences from
the mockup**. Get that feedback before making more UI changes. Do not begin another broad visual
rewrite or substitute your own audit for this conversation.

Suggested question after the server is reachable:

> The current build is running at [URL]. What are the biggest differences you see compared with
> the approved mockup? Which screen and interface should we fix first?

The owner has not yet identified the specific screen, viewport or visual differences behind this
second rejection. Do not guess that it is Checklist, Structured, a font-loading problem, or stale
cache. An optional screen/layout question was sent, but the owner instead requested this handoff.

At the handoff, the current build was running at **http://10.20.20.2:41908**, listening on all
interfaces (`*:41908`), Bun PID **2536610**. `/api/health` responded successfully. The process may
not survive the session; check rather than assuming it is running. `serve.ts` uses `Bun.serve`'s
all-interface default even though its log prints `localhost`. Verify the actual listener.

If it needs restarting, from the repository root:

```bash
PORT=41908 bun run serve.ts
```

If that port is occupied by the current server, reuse it; do not kill unknown processes. If the
shell is rebuilt, use a fresh port to avoid a previous service worker serving an old shell.
For a missing/stale build, rebuild only the shell, preserving the existing feed:

```bash
bun run build:css && bun run build:js && bun run build:static
PORT=<fresh-port> bun run serve.ts
```

Use the machine's reachable network address in the URL, not `0.0.0.0` as a destination. The owner
uses WireGuard `10.20.20.2`. Binding may require command escalation in the agent sandbox. Do not
fetch community sources just to start the UI.

## Current acceptance and scope

The owner asked for a faithful implementation of the already-approved mockups, then explicitly
said: **“Also make the structure layout the default.”** Structured is now the absent-preference
and new-setup default; an explicitly saved Relaxed choice is preserved.

After this agent claimed the correction was complete and started the build for the owner, the owner
said:

> “This is still not even close to the mockup.”

The owner then stopped further implementation and requested a handover specification. **The current
implementation is rejected. The previous completion claim and visual-review verdict do not establish
acceptance.** This handoff turn makes documentation changes only, retaining two audit screenshots
captured by a browser inspection that had already started when the owner asked to stop.

The unrelated request about sorting PDF-export examples was explicitly withdrawn as a message meant
for another agent. It is not part of this repository's task.

## Approved visual authority

1. Latest owner feedback, including the launch-and-ask instruction above.
2. `design/mockups/round7/converged.html` — Relaxed.
3. `design/mockups/round6/b-rail.html` — Structured, specifically B.
4. Approved functional/state requirements in
   `docs/superpowers/specs/2026-10-16-ui-redesign-design.md`.

Read `AGENTS.md`, relevant product/design/domain docs, and the previous handoff
`docs/handoffs/2026-10-16-redesign-fidelity-handoff.md`. The earlier handoff remains useful for the
first failure, reference-file anchors and invariants. This document supersedes its current-status
and next-action instructions. Historical statements that Relaxed is the default are superseded by
the owner's Structured-default instruction.

The reference HTML files contain multiple generations of render functions and CSS overrides. The
fully rendered final file is the reference, not the first function with a matching name. Preserve
composition, proportions, hierarchy, typography, controls, density, responsive behavior and page
organization when translating HTML into React. Do not treat the reference as inspiration.

Necessary authorized adaptations remain narrow: focus pills in both interfaces, real data and
account-aware state, independent placements and servers, and the copy “Event data may be out of
date.” Never ship the prototype's fixed clock, synthetic events/history, demo toolbar or demo state.

## What this attempt changed

This is an inventory, **not a list of accepted presentation decisions**:

- `src/client/ReaderApp.tsx`: central shared UI composition, navigation counts, release notice,
  settings routing, dedicated checklist components, archive-detail routing.
- `components/redesign/ChecklistEvent.tsx`: new event rows and `NextDeadline`, replacing old
  `EventRow`/`NextUp` usage in the active Checklist.
- `FocusPicker.tsx`, `DailyPanel.tsx`, `RoutineGroup.tsx`: rail and direct progress controls.
- `RoutinesPage.tsx`, `RoutineEditor.tsx`: reset/game grouping, table columns, progress bars,
  library, independent pin controls and native custom-routine drawer.
- `TimelinePage.tsx`: shared time grid for events and routine periods, sticky names, progress fill,
  resets, zoom and mixed deadline queue. Sticky bar labels were repaired after review.
- `ArchivePage.tsx`, `ArchiveStory.tsx`, `ArchiveDetail.tsx`: outcome story/filter/sidebar/list/history
  and a saved-record dialog. The archive dialog reads recorded progress rather than today's live
  event state.
- `SettingsLayout.tsx`, `GameSettings.tsx`, `AppearancePage.tsx`, `TrackingChoices.tsx`: individual
  game navigation, separate settings pages, interface/scheme controls, tracking/server/colour/reset
  groups. The final profile uses tabs to choose which server's tracking choices are edited.
- `SetupWizard.tsx`, `EventDetail.tsx`: modified setup/detail presentation, retaining much existing
  form content.
- `src/client/redesign.css`: large stylesheet, with initial rules plus later overrides. It is about
  2,900 lines and contains repeated selectors and superseded layout rules.
- `state/usePrefs.ts`, `state/appearance.ts`, `index.html`: Structured default and interface grounds.
- Tests and docs were updated. No change in this attempt intentionally reminted event/account IDs.

Component shorthand above resolves to `src/client/components/redesign/`, except `EventDetail.tsx`,
which is `src/client/components/EventDetail.tsx`. `state/` shorthand resolves under `src/client/`.
`AppNavigation.tsx` was also changed: live counts and Settings placement. The new component files
introduced by this attempt were `ChecklistEvent.tsx`, `FocusPicker.tsx`, `RoutineEditor.tsx` and
`ArchiveDetail.tsx`; many other untracked files were already present from the preceding agent.

Additional implementation details worth retaining:

- `prefs.routineGroup` is a new optional stored preference: absent/`reset` means By reset; `game`
  means By game. It uses the existing permissive preferences envelope, with no new storage key.
- `appearance.ts` applies Structured Slate grounds/surfaces separately from Relaxed, while keeping
  contrast adjustment and existing custom palettes. The CSS and runtime tokens must be examined
  together: runtime variables can override apparent reference values in the stylesheet.
- `TimelinePage` exports `routinePeriod`, also used for Routines reset countdowns. It uses resolved
  reader clocks, not guessed UTC boundaries. Custom timeline occurrences respect account event intent.
- `placementAccounts` in `RoutinesPage` combines bulk pin changes per account. Reverting to one stale
  full-account write per row can silently undo an earlier row's placement.
- `ArchiveDetail` displays the stored outcome/date/note/check-ins/amounts; Restore uses the existing
  reducer. Already-ended records can be reconciled back into history. It is intentionally separate
  from the live `ReaderDetail` adapter.
- `RoutineControl` keeps a numeric draft during editing so a transient empty input is usable.
  Game colour previews use the rendered, contrast-adjusted game metadata.
- The profile server tabs are an implementation adaptation, not a separately approved owner design.
  The reviewer accepted them within its narrow follow-up; the owner's overall rejection supersedes
  that. Revisit them if they are among the differences the owner identifies.

Tests changed during this attempt:

| File under `test/` | Change |
| --- | --- |
| `appearance.test.ts` | Structured default and retained explicit Relaxed distinction |
| `prefs.test.ts` | Default/fallback expectations and saved Relaxed normalization |
| `reader-store.test.ts`, `reader-restore.test.ts` | Test choices adjusted so writes/restores still change the now-Structured default |
| `redesign-timeline.test.tsx` | Routine resets participate in mixed Ending soonest order |
| `redesign-routines.test.tsx` | Bulk placement combines per account and preserves the other view's pin |
| `game-settings.test.tsx` | Updated expected guidance for independent server progress |

Documentation touched by this attempt includes `AGENTS.md`, `docs/PRD.md`, `DATA-MODEL.md`,
`DESIGN.md`, `ARCHITECTURE.md`, the approved spec/plan, the first handoff, the correction report,
and `.superpowers/sdd/2026-10-16-ui-redesign/progress.md`. Other dirty docs and ingestion files may
belong to the earlier agent; do not attribute all of `git diff HEAD` to this attempt. There is no
clean per-agent commit boundary. The real changed code remains in the working tree.

## What went wrong

### 1. Translation remained approximate

The first rejected agent had wrapped old presentation with new CSS. This agent replaced more actual
markup, but still recreated the reference piecemeal instead of establishing a complete translation
of the final reference structure. It retained old form internals and filled gaps with implementation
choices, then added CSS overrides until selected screenshots looked closer.

Concrete examples caught during this attempt's review were substituted Settings navigation, a
routine Cycle column and missing live summary, invisible timeline bar text, and game colour above
tracking with repeated tall account blocks. Those particular defects were subsequently corrected.
**Their correction is not proof that the remaining screens or overall design are faithful.** The
owner's latest rejection requires a fresh understanding of the gaps, starting with their feedback.

### 2. Comparison fixtures made the evidence narrower than the claim

`docs/design-reviews/fidelity-capture.mjs` freezes the clock, intercepts the event-feed request with
mockup events, and seeds disposable routine/archive state. That can isolate visual differences, but
it is not the app the owner browsed. For Checklist it explicitly hides `.updates-panel` and
`.release-update` to align the first viewport. The comparison's event/account counts also differ
from the prototype, and the custom prototype routine was not seeded.

A real-feed capture after the rejection shows two prominent notice bands above Running now, many
short title-only events, and much different content density. A fixture-based image with hidden
notices did not validate that real first impression. Do not suppress production UI in an acceptance
capture. If fixture comparison remains useful, label it as a separate diagnostic and also capture
the exact normal-use state the owner is judging.

### 3. Functional checks became a proxy for the visual task again

Tests, no-overflow checks, correct IDs, working locks and successful actions are necessary. They
cannot certify fidelity. This attempt's final response led with rebuilt screens and test success
and reported that review cleared the issues. That was too strong for the evidence and the owner's
actual experience.

### 4. The independent review's scope was stretched

The reviewer found a finite list of material issues, then scored fixes to that list. Its final
verdict was **“ship the reviewed corrections”**, explicitly limited to those findings, not blanket
acceptance. Subsequent passes were instructed not to reopen a wider hunt. That process could verify
local repairs while leaving broader divergence undiscovered. The owner rejected the result anyway.

Do not continue from the review's ship verdict. Treat the supplied user feedback as the next primary
input, then review the whole affected composition against the rendered reference.

### 5. Documentation presented implementation as the design truth

`docs/DESIGN.md` and the 2026-10-17 correction report describe the implemented design confidently.
They are records of what was built, not evidence that it is approved. Earlier failure had the same
pattern. Keep requirements, current implementation, functional verification and owner acceptance
separate. Do not rewrite the spec to make the implementation look compliant.

## Evidence and limits

- Historical correction report and staged comparison images:
  `docs/design-reviews/2026-10-17-redesign-fidelity.md` and its linked assets.
  These now carry a rejection warning. They document a rejected attempt, not new visual goldens.
- Fresh real-feed audit image:
  `docs/design-reviews/assets/2026-10-17-second-rejection/current-structured-checklist.png`.
- Fresh first-visit setup image:
  `docs/design-reviews/assets/2026-10-17-second-rejection/current-structured-setup.png`.

The two fresh images used Chrome at 1440×1000 on `http://10.20.20.2:41908`. The setup was a clean
browser context. For Checklist, that disposable context was marked onboarded and limited to
Genshin/HSR/ZZZ/Wuwa; the actual feed and notices were retained, with no request interception.
**These are not screenshots of the owner's browser or stored preferences.** The browser reported
Structured and loaded Barlow/Barlow Condensed. This rules out missing fonts in that test context
only; it does not identify the owner's complaint or prove their environment matches it.

One observable item for later inspection: the actual audit showed a Checklist header count of 46
and Focus All count of 60. They currently count different row sets. Do not claim this is the owner's
main concern without asking. Likewise, correct shorter rows without descriptions are an approved
requirement, so do not fabricate summaries merely to match fixture density.

## Preserve the working state and domain work

HEAD remained `ee41389`. The checkout is dirty on `main`; the last status had 89 modified/untracked
entries including work that predates this agent. No commit, push, PR or deployment was made. Running
a local preview server was explicitly authorized. Do not reset, clean untracked files, discard the
reader implementation or create a new branch/worktree without a new reason/owner instruction.

Preserve, or carefully test any necessary changes to:

- v2 reader envelope, migration/recovery, unchanged IDs and legacy bytes;
- account-specific progress, saved clocks and archive snapshots;
- Web Locks plus IndexedDB serialization fallback, save failures and cross-tab synchronization;
- backup/export/import/recovery and independent code seen/redemption state;
- unknown-end/date-precision semantics and community-source conduct;
- insecure HTTP identity generation using `crypto.getRandomValues`, not `crypto.randomUUID`;
- new Structured default and explicit saved Relaxed preference;
- useful fixes from this attempt: bulk routine placements saved together per account, row keys
  containing account+routine, and archived details using saved snapshots.

The most recent successful checks before handoff were 1,594 tests passing, TypeScript passing,
production build `a28021bbe1a8`, ordinary HTTP migration/setup/server/reset/backup checks, numeric
progress and routine creation, completion/Undo/archive Restore, and separate concurrent/offline
browser checks. The Docker-equivalent file layout passed 1,593 tests with one intentional skip;
no Docker image was built. This is functional evidence only, not visual acceptance.

## Recommended continuation after owner feedback

1. Write down the owner's biggest differences in their words, with the relevant interface, screen
   and viewport. Launch-and-ask comes before implementation.
2. Render that exact approved reference state and current app state. Compare actual content,
   visible notices and first-visit/returning conditions as appropriate. Record differences in
   topology, dimensions, type hierarchy and controls, not just a list of CSS values.
3. Repair that bounded surface by translating the final reference markup and styles into the real
   component tree. Replace rejected structure when needed; avoid another stylesheet of corrective
   overrides over structurally different elements.
4. Keep an explicit list of necessary real-data/accessibility adaptations, with reasons. Ask the
   owner when an adaptation changes a visible product decision instead of silently choosing it.
5. Show the normal running build to the owner at the chosen checkpoint. A fixture capture, passing
   detector or subagent approval cannot substitute for checking their reported differences.
6. Then carry accepted treatment across the remaining screens, checking both interfaces and mobile,
   with functional regression checks proportional to the change. Correct docs only to reflect what
   has actually been established.

No further UI implementation was performed after the owner requested this handoff.


## New-session continuity checklist

- Start the new session in **this same checkout**. All implementation files, reference HTML,
  screenshots, plans and handoffs are on disk, including untracked files. A fresh clone of HEAD
  will NOT contain this work; no commit/push was authorized or performed.
- This handoff plus the linked spec, previous handoff and review records contain the material
  decisions and continuation context. They are not a verbatim chat transcript. The owner's exact
  visual objections beyond “not even close” are deliberately marked unknown because they were
  never supplied; the next session must ask, not reconstruct them from guesses.
- The latest user instruction is to pause implementation for handoff, then have the next agent
  launch the current server and ask about the biggest differences. No new design was approved
  after either rejection. No permission to commit/publish was given.
- `public/` and `public/data/` are ignored build artifacts. Keep the current feed when starting;
  if it is absent, use the documented offline feed build, not a network refresh. A changed port
  is a different browser origin, so it will not automatically carry the owner's saved progress.
  Do not clear or migrate the owner's browser storage merely to obtain a clean screenshot.
- Durable reproduction entry: `docs/design-reviews/fidelity-capture.mjs`, with reference fixtures
  beside its images. Its staged-state limitations are described above. Chrome is at
  `/usr/bin/google-chrome-stable`; install/use Puppeteer in scratch, not project dependencies.
- `/tmp/fidelity-http-final.mjs`, `/tmp/fidelity-journeys.mjs`, `/tmp/fidelity-matrix.mjs` and logs
  were scratch functional checks, not durable requirements. They may still exist, but have fixed
  ports and scratch imports; do not assume they survive or run unchanged. Standard test commands,
  checked-in test sources and the recorded browser scenarios are the durable verification contract.
- Preview/mockup processes may survive: this run used app ports 41902–41908 and mockup41901.
  Inspect before starting/stopping; never `pkill -f serve.ts`. PID2536610 was the owner preview at
  recording time, not a permanent identity. Do not treat old port numbers or tool session IDs as
  proof of the build currently being served.
- No UI edits were made in the handoff/continuity-check turns. The second-rejection warnings in
  the older report, plan and design documentation exist to prevent another agent mistaking their
  earlier positive wording for owner acceptance.

## Session 3 (2026-10-17): owner feedback on new-user setup, and the rebuild

The owner chose to start with new-user setup, against Round 6 (`b-rail.html`, final `onboarding()`).
Their differences, in their words, summarised:

1. Screen 1: “The margin/padding, sizing and placement of buttons is off.”
2. Screen 2: “The games are way too big, and not grouped together, not shown with colors, no
   choose all games instead. The back button does work better though.”
3. Screen 3: no table to choose events/dailies/weeklies; instead the per-game subscription block
   was “copy pasted” for every game. “Show events that haven't started” was “a random, flowing
   button”; in the mockup it sits between dividers with a description.
4. Screen 4: “a weird checklist-timeline switch, instead of the drawing and descriptions the
   mockup has.”

What changed: `SetupWizard.tsx` was rewritten as a translation of the rendered mockup markup
(`.ob`, `.preference-grid`, `.gpick`, `.type-guide`, `.availability`, `.mtx`/`.tg` with a
“Same for all” row and mixed state, `.upcoming-choice`, `.vcard` previews, `.ob-foot`), and the
scattered `.setup-wizard` overrides in `redesign.css` were replaced by one block at the end of the
file translated from the mockup's rules. Game order follows `GAMES`; colours use the app's
contrast-adjusted `meta`.

Deliberate deviations, for the owner to confirm:

- The Interface select and the “Everything stays in this browser” line were removed from step 1:
  neither is in the mockup or the spec's setup list. New installs still get Structured, and
  Interface remains in Settings → Appearance.
- The back link reads “Back” on every step (the mockup says “Preferences” on step 2), because the
  owner said the current back button works better.
- The tracking table's row headers are `<th scope="row">` rather than `<td>`, for screen readers.

Evidence is functional and side-by-side capture only (1440 and 390, dark, fresh browser, real
feed, no interception). **Owner acceptance of these screens is still pending.**

### Setup accepted as “much better”; Checklist requests (same session)

The owner then asked, for the Checklist: “Add the time left bar to the compact screen. Make the
pill menu smaller. Let users sleep/dismiss the event data may be out of date for up to 7 days.”

- Compact rows now show the time-left meter on every row, in a fixed 120px column left of the
  time (under the time on phones). Standard rows are unchanged: the meter only accompanies a
  description.
- Focus pills are smaller (24px high, 11.5px text, tighter gaps), kept at 30px on coarse pointers.
- The source-age notice offers “Hide for 1 day / 3 days / 7 days”. It stores
  `prefs.staleSnooze = { until, games }` in the existing permissive prefs envelope (no new storage
  key). It returns when the time passes, when a game outside the snoozed set goes stale, or if the
  saved value is malformed or more than seven days ahead. Settings → Source status and the
  per-event detail notice are not snoozed.

### Checklist follow-up (same session)

Owner: “In compact view, there needs to be some more air, like there is in the mockup compact
view. In standard view, the space between the bottom of the Running now [heading] and the first
event in the list is too big. The Next to expire is too small, compared to the easier to read one
in the mockup, and it doesn't show the next 3 ones to expire, like it does in the mockup.”

- Compact is now a translation of the Round 6 B ledger (`table.led`): column headings Game /
  Event / Time left / Ends in, a 3px game stripe with the short name, 15px titles, a 34%-wide
  meter and a 20px condensed time, in 51px rows. It is drawn as a CSS grid over the existing
  `<li>` rows (`LedgerColumns`, `ChecklistEvent compact`) so archive fade/confirm transitions keep
  working. Under 860px the game column hides, the game name moves above the title and the meter
  spans the row. This replaced the earlier compact `.event-entry` rules entirely.
- Note on references: Round 6 **B** and Round 7 render but hide the rail's “then” list
  (`.rail .then{display:none}`); Round 6 **A** shows it with a 30px title and 64px countdown. The
  owner asked for the mockup's larger rail with the next three, so the rail head now follows A's
  proportions (52px under 1050px; the phone sizes and hidden list at 700px are unchanged).
- `.list-heading` bottom padding 22px → 8px (Relaxed 18px → 8px).
- Relaxed was not visually captured for these changes.
- Rail routines heading (owner): title is “Routines” with “Showing only pinned” as its subtext;
  the “Focus on a game to open its routines.” hint was removed as not worth the text (groups still
  auto-open on focus).

### Timeline (same session)

Owner: the implemented Timeline resembles the mockup well, but lost the liked resemblance to the
paimon.moe-style board on the live site; keep the new design and add a switch between the looks.
The scroll-following bar text of the new look is liked. Dailies should not be on the timeline. Add
a checkbox for time left vs end date. Add a divider where routines start when they have their own
section, and rename “Separate reset strips” to “Show routines in own section”. Later: in new-user
setup, when Timeline is chosen, show both designs and ask.

Owner's answers to clarifying questions: default look **New**; switch in the **Timeline controls
bar**; classic **reproduced as production** (no added scroll-following text); routines in classic
go in **their own section** under a divider.

What was built:

- `prefs.timelineLook` (`"new"` default | `"classic"`) and `prefs.timelineLabel` (`"left"` default
  | `"end"`), both in the permissive prefs envelope. The classic look reuses the production board
  (`components/Timeline.tsx`) with its own By game / Ending soonest, zoom and Jump to today
  controls; the new look keeps its controls. The look switch sits first in the options bar.
- Classic gained an optional `routines` section (`ClassicRoutine`): a divider labelled Routines,
  then per-game lanes of dashed-edge bars in the board's style, clamped to the board's window and
  with names pinned like its event bars.
- Dailies (`cadence === "day"`) never appear on either look (`onTimeline`). The Routines page shows
  a dash instead of a Timeline pin for dailies, and hides bulk “pin to Timeline” on daily-only bands.
- “Show end dates instead of time left” switches new-look bar text to “Ends 20 Oct” and routine
  bars to “resets <date time>”. It does not change the classic look, which shows titles only.
- New-look divider: a dashed rule with a sticky ROUTINES label before each game's routine rows
  when “Show routines in own section” is on.
- Setup step 4: choosing Timeline reveals “Which timeline design?” with drawn New / Classic cards;
  `SetupDraft.timelineLook` is saved only when the reader starts on Timeline.

### Timeline follow-up: shared pill header, look in Settings, focus bar setting

Owner: the options (By game / Ending soonest, routines in own section, end dates) must work in the
classic look too; the classic board's small pill toggles look better than the big options bar; the
New/Classic switch belongs in Settings. Then: the focus bar moves under the pill header on the
Timeline, with a Settings option to show it on the Checklist and/or Timeline.

- `BoardHeader` and `TogglePill` (exported from `components/Timeline.tsx`) are the one header for
  both looks: stacking pills, “Show routines in own section” and “Show end dates” toggle pills,
  small −/+ and Jump to today. The old `.timeline-options` bar and its CSS are gone.
- Classic now honours both options: `routinesInline` (off → routines at the end of each game's
  lane; on → own section under the divider) and `label` (time left / end date shown inside the
  pinned name, after the title, shrinking before the title does; omitted on bars under 150px).
- Settings → Appearance: “Timeline design” (New / Classic) and “Focus bar” with “Show on the
  Checklist” / “Show on the Timeline” (`prefs.focusBar = { checklist, timeline }`, absent = both).
  A view whose focus bar is hidden ignores `focusGame`, so a focus chosen elsewhere can never
  filter a page with no visible way to clear it. `TimelinePage` now receives `focus` and
  `focusBar` from `ReaderApp` instead of reading `focusGame` itself.
- The classic board keeps its header and focus bar when it has nothing to plot, and draws the
  board when only routines exist.
- Setup copy now points to Settings → Appearance for switching designs.

### Timeline polish (same session)

Owner: focus bar needs one row on large screens and no “Focus” text; By game / Ending soonest
should share an outline; the two options need an off affordance (checkboxes); routine items could
not be opened, so progress could not be tracked; the classic NOW chip was almost unreadable; open
far enough back / zoomed out so most text shows; always prefer the title over time left / end date.

- Header: the stacking pair is one rounded outline with the chosen side filled; the options are
  small checkboxes (`ToggleOption`, replacing `TogglePill`).
- Timeline focus row (`.timeline-focus`): pills and Next on one row, heading hidden; wraps on
  phones.
- Routines open a modal dialog (`RoutineDetail` in `TimelinePage.tsx`) from both looks: game and
  server, title, reset time, and the shared `RoutineControl` for progress. It replaced the
  off-screen `.timeline-routine-detail` section.
- Opening position (`openingLeft`, both looks; also Jump to today): back to the median running
  start, with now kept between 25% and 50% across. The default zoom (32px/day) is unchanged;
  readers who already zoomed keep their saved width.
- Classic NOW chip: inline critical background and ground-coloured bold text (`.eyebrow` had been
  overriding the text colour with faint ink).
- Classic labels: shown only when `labelFits` estimates room for the whole title and the label.
- **Deferred by the owner:** an option, per routine or for all routines, to show routine dates
  only without tracking progress.
- Footer (owner: “sometimes sticky… should not stick and take up space unless you've scrolled all
  the way down”): the footer was never sticky. The Timeline boards scrolled inside a pane capped at
  72vh, so the page bottomed out early and left the footer on screen while the board scrolled.
  Both panes (`.timeline-scroller`, classic `.scroll-pane`) are now capped at `100dvh`: with the
  board filling the window the footer is below the fold, and appears only past the board's end.

### NOW chip, server names, labels (same session)

Owner: make “now” even more readable; drop “europe” unless a game has two regions; if title and
end date cannot both be shown in full, drop the end date rather than truncating it.

- Classic NOW chip: 12px bold display caps, white on a fixed `#d42a47` (≈5:1), 2px ground ring.
- `state/reader/servers.ts`: `manyServers` / `serverSuffix`. Reading views (Checklist rows, Next to
  expire, dailies, rail routine groups, Routines table, both Timeline looks, routine dialog,
  updates, archive list/detail) name a server only when the game has more than one active account
  (archives also count retired ones). Settings views still name servers, where they are the subject.
  The “New since you last looked” row now names the game instead of the server.
- Classic bar names are one-line wrapping rows with overflow hidden: the title truncates only when
  it alone is too long; labels (and routine progress) never shrink and simply wrap out of view
  when they do not fit whole. `labelFits` was removed.
- Header options are now three either/or pill pairs (`PillChoice`, which also draws the stacking
  pair): By game / Ending soonest, Show time left / Show end dates, Group routines and events / Show
  routines in own section. `ToggleOption` (checkboxes) was removed.

### Routines view (same session)

Owner: Timeline accepted (“looking good now”). Routines: the Checklist/Timeline pin icons are not
centred and look odd against the mockup; text does not sit together as in the mockup; keep the
game colour bars; an always-open editor adds clutter — match the mockup, but show that progress
is editable and let the reader enter their own.

- The table is now a translation of Round 6 B `table.rt`: quiet 11px headings with the list/bars
  icons on the pin columns, `.gcell` colour bar + short name (server only when several), 15px/500
  titles muted when met, `.pin` 34×28 icon buttons (plain when off; near-tinted outline when on),
  and a `.kebab` “⋯” summary for the existing menu.
- `RoutineProgress.tsx` replaces `RoutineControl` in this table only: `.tick` (Done / To do, or
  “n of m days”) and `.amt` (bar + “**2** / 3 runs”, unit from the task or built-in). Amounts read
  as text; a pencil (brightens, number gets a dashed underline on hover/focus) signals they are
  editable. Click opens an inline number field + Save; Enter saves, Escape or leaving cancels.
  `RoutineControl` still serves the Checklist daily panel and the Timeline routine dialog.
- All `.routine-table`/`.routine-pin`/`.routine-progress`/`.progress-track`/`.rtitle` rules
  (51, including phone variants) were removed rather than overridden; a single `.rt` block holds
  the replacement. On phones, hidden Routine/Progress headings keep their cells so pin headings
  stay aligned.
- Owner follow-up: pins fade (150ms colour/background/border, skipped under reduced motion), and a
  pinned pin previews “unpin” on hover (thinner tint, dashed outline). Ticks no longer carry
  “To do / Done” text; multi-day routines keep “n of m days”, and the aria-label keeps the state.

### Library and create shelves (same session)

Owner: Routines accepted. Library and Create “lack a lot from the mockup… they are shelves in the
mockup, where they are weird in the live”. Owner chose to add all four missing create fields now
(Every day, Another hour, Note, Link) rather than defer the data changes.

- `RoutineDrawer.tsx`: one right-docked modal `<dialog>` (580px, dimmed backdrop, Escape) with two
  panes translated from Round 6 B `libraryDrawer` / `createDrawer`:
  - Library: Create-your-own card, intro, search, “New follows also show in Checklist/Timeline”,
    per-game sections (“n of m followed · k servers”, Follow all weeklies/monthlies/cycles/
    everything), rows with “Every Monday at 04:00 · 3 runs · Community wiki, checked 14 Oct 2026”
    and a Follow/Following button, or one button per server (EU/NA/Asia) when several.
  - Create/Edit: examples (mockup's five), What is it, Game, Server (select when several, note
    otherwise), Repeats (day/week/month/N days + its detail row), Resets at (game reset / another
    hour), Done when (once / several days / a number), Note, Link, Also show in (Timeline disabled
    for dailies), live Preview, Create and follow / Cancel with a “Still needed” line.
- The library page mode and `RoutineEditor.tsx` (+ `.routine-editor` CSS) were removed. New
  routines now follow on the chosen server only, with the chosen pins; edits keep placements.
- Data: `PeriodSchema` + `{unit:"day"}`; `TaskSchema` + optional `resetHour`, `note`, `link`
  (http/https only); `GoalStatus.scope` + "day"; a task's `resetHour` swaps only the hour on its
  row clock (same revision key). Notes show under the title in the table; links feed the menu's
  Source item. Page summary no longer counts dailies as timeline pins.
- schema-guardian review of the routine format change: no blocker. Nothing stored is dropped or
  re-keyed; the HEAD build keeps unreadable tasks raw and carries unknown fields through edits, so
  new-format routines survive (a `day` routine is just invisible there). Fixed its two should-fix
  items: the edit form warns when a reset-hour change will move which day logged ticks count for,
  and `RoutineHistory` computes “today” and the catch-up window from a routine's own reset hour.
  Notes left as-is: legacy `Dailies.tsx`/`migration.ts` paths cannot meet `day` routines today
  (no caller for the legacy strip filter; legacy data cannot contain `day`).
- Owner accepted the create shelf. Library Follow/Following buttons now fade (150ms, skipped under
  reduced motion), matching the Routines pins.

### Top bar (same session)

Owner: the logo and the tabs sit at different heights, so the bar feels off-centre. Measured: the
logo's text baseline was 3px above the tab labels' (38 vs 41px; the mockup bottom-aligns boxes,
which reads the same way with a 20px logo beside 15px tabs). Structured `.reader-ui .top` now uses
`align-items: baseline` and `.mark` has no bottom padding, so logo, tabs and Settings share one
baseline at the same 57px header height. Relaxed keeps `center` (its tabs are rounded pills).
- Owner: “the logo still looks higher than the tabs”. A shared baseline still left the logo's 15px
  capitals centred 2px above the tabs' 11px capitals. `.mark` now also has `position: relative;
  top: 0.1em` (half the cap-height difference), so both sets of capitals centre at the same line
  (measured 35.5px). Reset to 0 in Relaxed and on phones, where the logo is not beside the tabs.

### Settings: About and Data & sources (same session)

Owner: dates and event-data refresh do not belong in About; move them to Data & sources, and make
the implemented pages look more like the mockup.

- `AboutPage.tsx` (replaces the `Colophon` render in Settings): the Round 6 B single-column
  `.about-prose` — intro, Made by (author, GitHub, source code / report a problem / request a
  feature / support), source editors (derived from every feed source via Colophon's `siteFor`),
  Game-Time-Master, studios, idea credits, Unofficial and unaffiliated, and a “See data freshness
  and source status” button. No dates or freshness.
- `DataSourcesPage.tsx`: intro (incl. which timezone dates use), Check for new data (shares the
  footer's handler, now `refreshFeed` in ReaderApp), “Event data last refreshed … · ago”, a stale
  warning naming the affected games, and one `.source-row` per game with each source's last
  successful check, last content change, a status sentence in the mockup's four cases
  (`sourceReason`) and Check source page. `.source-record` CSS removed.
- Every settings title now sits on the mockup's `.ptitle` rule.
- `Colophon.tsx` is no longer rendered by the reader app; its exported constants and `siteFor`
  are reused.
- Owner follow-up: About's “The studios and games” lists every game again in its own (contrast-
  adjusted) colour after the studios; the “See data freshness” button was removed from About.

### Changelog (same session)

Owner: make the changelog look like the mockup, keeping the commit history, spec links and the
New / Games & sources / Fixed kinds. `ChangelogPage.tsx` now renders its own Round 6 B
`.changelog-page .rel` markup (the sheet still uses `ChangelogContent`): an uppercase date line
with the note's kinds, a 26px condensed title, summary paragraphs, the covered commits as a bullet
list each ending in a coloured kind tag and its hash link, then “Commits a…b” and “Spec: …” links;
loose commits follow under “Other changes” by month.

### Reload keeps your place (same session)

Owner: refreshing always returned to the default view. The page was React state only
(`useState(prefs.view)`). `state/route.ts` now maps the page, the Settings section and a game's
settings page to the address hash (`#checklist`, `#timeline`, `#routines`, `#archive`,
`#settings/<section>`, `#settings/games/<game>`). ReaderApp starts from a valid hash, keeps it in
sync with `history.replaceState` (no history entry per click) once onboarded, follows manual hash
edits, and rewrites an unknown hash to the current page. No hash still opens the default view.
Browser-checked: Timeline, Settings → Changelog, a game page and Archive all survive a reload.

### Region & time (same session)

Owner: timezone search did not seem to work; is it needed, or should the full list just appear?
Cause: the search box filtered the options of a closed select (no visible effect until opened)
and matched raw IANA ids only. Decision: removed the search. `TimezoneSelect.tsx` is one native
select — Automatic (device zone + offset) first, then every zone grouped by region (`optgroup`),
named by city (“Buenos Aires, Argentina · GMT-3”); typing in the open list jumps to a city. Used by
Settings and new-user setup. `TimeSettings.tsx` now follows Round 6 B: intro, Default game server
as a segmented control, Your timezone with a “Currently displaying …” note, and Reset timing for
your games — one row per server with its automatic/custom reset, your local time and countdown,
and a Reset timing select (Automatic or a whole hour) that appends a clock revision like the game
page's override (earlier progress kept). Rows resolve the clock at max(now, real time) so a just-
saved revision shows immediately.

### Default view moved into Appearance (same session)

Owner: move Default view under Appearance and match the mockup's iconography. The separate
“general” settings section is gone; Appearance has a Default view group with the Round 6 B drawn
view cards (`ViewCards.tsx`, shared with new-user setup), the mockup's copy, and Replay the
introduction. `#settings/general` and a bare `#settings` now open Appearance. The view-card CSS was
un-scoped from `.setup-wizard` (with its border token defined on `.viewpick`).
- Owner: Lists options move into Data & sources. The “lists” settings section is gone; Data &
  sources ends with an “In your lists” group (Show events that haven't started; Detect daily
  events from source descriptions), each with a one-line explanation. `#settings/lists` opens Data
  & sources. Appearance's menu subtitle is now “Theme, colours & default view”.
- Owner: list options belong before the long source list. “In your lists” now sits directly under
  the refresh line and stale warning, above the per-game source rows.
- Owner: “In your lists” goes even before the source explanation. It is now the first group
  under the title; everything about sources follows under a matching “Sources” heading.

### Backup (same session)

Owner: Backup must match the mockup much more closely. `BackupPage.tsx` keeps every action and its
logic (back up now, export/import all, progress-only export/import, undo last restore, restore
preview) in the Round 6 B layout: intro, a 7 days / 4 weeks / 6 months policy strip, the note,
outlined actions (Back up now solid; file inputs hidden behind their labels, still focusable),
then Daily / Weekly / Monthly sections (“n snapshots · span”) whose rows show the date, a summary
of that snapshot's tracked games, followed routines and archived events, and View backup.
`backupTier` (state/reader/backups.ts) classifies snapshots with the same windows
`retainBackups` keeps, tested against it. Old `.backup-*`/`.file-button` CSS was replaced.
Restore itself was not exercised in the browser (it reloads); its logic is unchanged.
- Owner: Back up now must not overwrite the day's automatic snapshot, and manual backups must be
  deletable. New key `READER_KEYS.manualBackups` (`gacha-tracker:v2:manual-backups`), with
  `readManualBackups` / `saveManualBackup` / `deleteManualBackup`; never pruned by
  `retainBackups`, outside exports (only v1 keys are captured) and untouched by restore/undo.
  Capped at 20 copies and ~1.5MB so the shared origin quota keeps room for the reader's own save;
  entries are parsed one by one so a damaged entry does not discard the rest. The page shows a
  “Your backups” list (View backup, Delete with inline confirm) above “Automatic history”.
  schema-guardian: no blockers; its quota should-fix is the size cap above. Left as notes: the
  error screen's raw recovery download includes every `gacha-tracker:` key, so it now also carries
  manual backups (large but read-only).

### Your games: tracking saves on click (2026-10-18)

Owner: “Apply tracking choices” should not exist; choices apply when the panels are clicked. The
button is gone; `AccountSetup` in GameSettings saves the account on each change. It now changes
only the routines of the kind that was toggled (dailies, weeklies & monthlies, or cycles; Events
touches no routines), so a click never resets pins the reader set on the Routines tab — the old
Apply rewrote every kind's placements from the draft. A failed save reverts the panel. Browser-
checked, including a Checklist unpin on Weekly Bosses surviving an Events toggle.
- Owner: the rest of Your games should follow the mockup more closely (padding, margins, dividers,
  structure). The Setup tab is now the Round 6 B structure: `.ptitle` (game name in its hue,
  studio, Stop following game → hides the game), Codes tab “n new” badge, `.grp` sections with
  inline descriptions on a rule — What to track (`.comp` cards with status lines: Shown/Hidden,
  “n built in”, dashed “Some, fine-tuned” when partly followed — a click follows the rest — and
  dimmed “none built in” that stays selectable per the spec), “Fine-tune in Routines →”; Servers
  (`.srvrow` MAIN/ALSO with reset, local time and countdown; Remove only on extra servers); Game
  colour (swatch, hex, Reset, preview chip, contrast note); Reset timing (one `ResetTimingRow` per
  server, shared with Region & time, replacing the hour/minute editor). `TrackingChoices.tsx` and
  30 unused CSS rules were removed; its test now checks the cards. Browser-checked.
- Owner: a game's About tab should match the mockup. It now follows Round 6 B `aboutPage`: “About
  <game>”, fact rows (Studio; each server's next reset in your time · automatic/custom override),
  then Data sources — each source linked by host with “Event / Banner / Battle pass schedule”,
  the editors' thanks, and a “Source status and freshness” button to Data & sources.
- Owner: games under “Other games” should be greyed out like the mockup. Unfollowed rows carry
  `data-off`; the name is muted and the colour bar faded to 25% (the mockup's `.srow.off`).
- Owner: “Manage games & order” opened a legacy-looking page that also showed the first game's
  full configuration. Then: reorder by drag and drop in the sidebar instead. Now:
  - Followed games in Settings → Your games are draggable (HTML5 drag; drop indicator), and
    Alt+↑/↓ moves a focused row. Saved as the existing `prefs.gameOrder` (followed games in the new
    order, then hidden ones), via `SettingsLayout`'s new `onReorder`. A “Sort A–Z” link replaces
    “Manage games & order” and appears only when a custom order exists.
  - A game page's title button is “Follow game” for an unfollowed game (switching its events on if
    nothing was tracked), “Stop following game” otherwise.
  - `#settings/games` without a game now shows only a games-and-order list (follow checkbox, name
    linking to the game's page, ↑/↓, Reset to A–Z), never a game's configuration. It is no longer
    linked from the sidebar.
  - Known gap: HTML5 drag does not work on touch screens; phones can reorder only via that list.
- Owner reversed the drag-and-drop idea (weak affordance, hard to see). Removed: sidebar drag and
  Alt+↑/↓, its CSS, the sidebar “Sort A–Z”, and the games-and-order list page. Settings →
  Appearance now has a “Game order” section listing only tracked games (not hidden; events or a
  followed routine) with 40×36 ↑/↓ buttons (disabled at the ends), working for mouse, touch and
  keyboard, and “Sort A–Z” when a custom order exists. Saves `prefs.gameOrder` as tracked games
  in the new order followed by the rest in their previous order. `#settings/games` without a game
  opens Appearance. Browser-checked at 1440 (click) and 390 (tap).
- Owner: in Appearance, “Dailies on Checklist” and “Routine groups” looked odd on their own
  background. `ChecklistDisplay` gained a `plain` variant (just the fields); Appearance now has a
  “Checklist” settings group with Event rows, Dailies on Checklist and Routine groups side by side
  (stacked on phones) and the note below. The Routines page keeps the mockup's shaded band.
- The “Offer standard-banner pulls in the library” switch (`prefs.standardPulls`) had no control
  in the redesigned app (only the unmounted legacy `Controls.tsx`). Owner: put it in Data &
  sources with the other list options. It is now the third “In your lists” checkbox, with the
  mockup's note “Premium pulls are always offered.” Browser-checked: ticking it makes the library
  offer Genshin's “Paimon's Bargains: Acquaint Fates”.
- Owner: the settings sidebar needs the mockup's hover. Unselected rows now take the surface
  colour and ink text on hover (the mockup's `.srow:hover`), a step lighter than the selected
  row's raised background, with a 120ms fade (skipped under reduced motion). Plain `:hover`, as in
  the mockup; headless Chrome cannot emulate `(hover: hover)`, so a guarded rule was unverifiable.

### Round: logo, upcoming heading, routine band names (2026-10-18)

- The EVENTCLOCK logo is a button once the reader is onboarded; it opens the default view
  (`changePage(prefs.view)`). Hover shows only the pointer cursor; the owner rejected an underline. During setup it stays plain text.
- The Checklist's "Upcoming events" `h2` had no styles. It is now a second `.list-heading`, "Not started yet",
  with an "N events in G games" sub-line. That mirrors "Running now". The sub-line doesn't say "sorted by…",
  because the Doing-first sort orders upcoming rows differently. In compact, the ledger header for this
  section reads "Duration / Starts in" (`LedgerColumns upcoming`), not "Time left / Ends in".
- Routines bands (By reset) are named Dailies, Weeklies, Monthlies and Cycles, not Today, This week and
  This month. A test covers this in `test/redesign-routines.test.tsx`. The checklist rail's `DailyPanel`
  still says "Today · …", because it describes the current period rather than naming a group.
- Follow-up: the owner found "Not started yet" easy to miss. The section now has a 48px gap above it and a
  2px rule in the accent colour (`--color-near`). Its heading sits on a full-width raised band
  (`--color-raised`) with a "Coming up" eyebrow, and the heading is the same 28px as "Running now".

### Round: ticking today's dailies should feel rewarding (2026-10-18)

The owner found ticking a daily in the redesign "way less satisfying" than the live strip. They asked to keep
the live fireworks. `DailyPanel` (the Checklist rail) now works like this:

- **Tap target:** the whole row is the button (`.daily-hit`, `aria-pressed`), as the live pill is, not a
  small checkbox at the edge. Rows that measure an amount keep their number field.
- **Done state:** a done row washes in the game's hue (`--g`), and its box fills with the hue. A streak
  ("3-day streak", from `streakOf`) shows from day 2, as live shows "3d".
- **Tick animation:** only on a tick made in this session (`data-fresh`), so a reload doesn't replay it.
  The box pops (an overshoot scale), the check draws in, and a ring glows out from the row.
  All of it is off under reduced motion.
- **Progress:** a pip bar in each game's colour and "N of M done" sit under the heading. The last tick
  turns them to "All done for today" and flashes the pips (`data-burst`).
- **Fireworks:** the live `Fireworks` component, under the live rule. They fire only when a tick made now
  completes the list. A shorter list (focusing a game) or arriving already done never fires them.
- **Tests:** `test/redesign-daily-panel.test.tsx`.
- Follow-up: events with a check-in goal, such as "To Temper Thyself and Journey Far" at 5 days a week,
  looked unticked and had no count. The panel read only today's tick, so a week whose goal was met
  without today's tick read as not done. `DailyPanel` now counts these as live does:
  - **Done:** a row is done when it's ticked today or its goal is met (`hasGoal` and `status.met`).
    A met row that isn't ticked draws a dotted check (`data-met`), as the live chip does. Nothing is
    ticked on its behalf, so `aria-pressed` stays on today's tick.
  - **Counter:** a goal row shows its goal count (`goalCount`: "5/5 wk", "3/5", "12/20 · 6d") in place of
    the streak, one counter per row as on live. Its spoken label comes from live's `chipLabel`.
  - **Checked:** in the browser with the real Genshin event, a met goal reads done, a tick makes it
    "3/3 wk", and the tick survives a reload. Tests are in `test/redesign-daily-panel.test.tsx`.

### Round: pinned routines complete like dailies (2026-10-18)

The owner asked that routines with a target be marked complete like dailies, with fireworks, and that
the completion can be edited or undone. The Checklist rail's pinned routines now use
`redesign/PinnedRoutine.tsx` instead of `RoutineControl`, which still serves the Timeline routine dialog.

- **Look:** the same card language as the daily rows. A met routine washes in the game's colour and reads
  "Done this week · resets in 1d 3h".
- **Check-ins** (Realm Depot, Spiral Abyss): the box ticks today. Unticking a met routine removes the
  latest tick in the current period (`lastDayInPeriod`), which may be from an earlier day.
- **Amounts** (Weekly Bosses 3 runs, Battle Pass 10,000 EXP), when not met:
  - the box completes the routine in one click by setting the amount to the target;
  - "+1" steps the amount;
  - the count, with a small bar and a pencil, opens an editor.
- **Amounts, auto-complete:** typing a value at or over the target completes the routine without Save,
  once typing pauses for `AUTO_COMPLETE_MS` (450ms), so "10000" isn't cut short.
- **Undo for amounts:** unticking puts back the amount from before the completing action, when this
  session saw it. After a reload that value isn't known, so the box opens the editor instead.
  Nothing is guessed.
- **Completion animation:** only for an action taken in the row; arriving complete never fires. It is
  staged: the bar fills from its previous value (`--from`), the row warms, the box pops at about 280ms
  and the check draws, then the live `Fireworks` sparks fire at about 300ms. Reduced motion drops all of
  it.
- **Tests:** `test/redesign-pinned-routine.test.tsx`. The auto-complete timer and the undo paths were
  checked in the browser, not in unit tests, because the suite renders static markup only.

### Round: time-left bars on every standard row (2026-10-18)

Round 6 B hid the meter on Standard rows without a description
(`.event-entry.no-description .meter{display:none}`, b-rail.html:837). The owner asked why
those rows had no timing bar and chose to show it on every row, a deliberate departure from the mockup.
`ChecklistEvent` now always renders the meter. Rows without a description keep their tighter padding and
grow by the meter's height, about 20px.

### Round: the live urgency ramp (2026-10-18)

The owner asked for live's urgency colours: grey for a week or more, blue under a week, yellow under 3
days, red under a day. The redesign had derived them from the theme: "under a week" was the accent, and
"a week+" was the general muted text grey, which read nearly white. The ramp is now its own token set,
`--color-urgency-{calm,near,soon,critical}`:

- **Values:** `urgencyTokens` in `state/appearance.ts` sets live's dark or light values. Each is nudged
  only to 3:1 contrast on the scheme's surfaces, the large-text bar; the default dark grey and light grey
  move slightly. A custom accent no longer changes urgency.
- **Wiring:** `URGENCY_COLOR` (Meter.tsx) reads `var(--color-urgency-X, var(--color-X))`. The live UI never
  sets the urgency tokens, so it falls back to its own unchanged values.
- **No CSS defaults:** none are declared in redesign.css, because that file is imported into the live
  stylesheet too.
- **Scope:** `--color-near`, `--color-soon` and `--color-critical` keep their other jobs (accent,
  warnings, NOW chip).

### Round: urgency colours editable, game strips, legend, scroll on tab change (2026-10-18)

- **Urgency colours in Settings → Appearance.** A new group sits under Colour scheme with the four steps
  for the dark and light themes, a small bar sample per step, and "Use the default colours".
  - It works with every scheme, not only Custom.
  - Choices are stored in a new pref, `prefs.urgencyPalette`, shaped `{ dark: {calm, near, soon,
    critical}, light: {…} }` with hex values.
  - `urgencyChoice` reads it; unset or invalid steps keep live's values. `urgencyTokens` applies the
    3:1 readability nudge.
  - **Schema-guardian:** no risk. Prefs are `z.record(z.unknown())`, patches are shallow merges, and
    the pref survives export, backup and restore. One existing behaviour applies to every pref: a v2
    import merge keeps the current prefs.
- **Game colour strip on Standard event rows.** `.event-entry::before`, 3px, in the game hue, sits in the
  list's side padding, as live's row rail does. It's faded to 55% and comes to full strength with a
  glow on hover. Compact rows already had the `.gcell` bar.
- **Live's legend under "Running now"** (`UrgencyLegend` in ChecklistEvent.tsx): "bars = time left ·
  colour = ends in a week+ / under a week / under 3 days / under a day". It reuses live's `STEPS`, now
  exported from Legend.tsx, and `URGENCY_COLOR`, so it follows the reader's urgency colours.
- **Bug fixed:** changing tab kept the previous page's scroll, so leaving a scrolled Settings page opened
  the Checklist part-way down and its rail looked empty. ReaderApp now scrolls to the top when `page`
  changes. It skips the first render, so a reload's restored scroll is kept.
- Follow-up: the legend first sat inside the title block. That widened the block, so the sort and density
  buttons wrapped under it and the heading looked cluttered. The owner wants one row. The legend is now
  the last child of `.list-heading` (`flex-basis: 100%`, a 12px row gap), on its own line under the title
  and the buttons. Title and buttons share a row down to 700px. At phone width the buttons wrap as they
  always did.
- Follow-up 2: the owner wanted the legend on the same line as "35 events in 4 games · sorted by what
  ends first". The Running now heading (`.running-heading`) is now a two-row grid:
  - **Row 1:** the title, with the sort and density buttons on the right.
  - **Row 2:** `.heading-meta` spans the full width, with the count on the left and the legend on the
    right (`space-between`).
  - **Narrower screens:** the legend wraps onto its own line under the count only when the line can't
    fit, around 1100px. Below 700px the grid is one column, with the buttons left-aligned.

### Round: a grand celebration for finishing a section (2026-10-18)

The owner asked for a bigger celebration when a whole section is done: all of today's dailies, or every
routine in a game's group in the Checklist rail.

- **`Fireworks grand`:** seven bursts in two waves across the section, 14 sparks each, wider reach, 4px
  sparks, 1.4s. With `hue` the game's colour joins the sparks. Called without props, it is unchanged for
  the live strip and the single-row bursts.
- **`useSectionCelebration(total, done)`** (redesign/useSectionCelebration.ts) is the live strip's rule,
  shared by `DailyPanel` and `RoutineGroup`. A section celebrates only when it becomes complete with more
  done than a moment ago and the same total. A shorter list or arriving already complete never fires it.
- **Extras on a celebrating section:**
  - a sweep of light across it (`section-sweep`, in the group's colour for routines);
  - the "All done" line pops (`section-pop`): "All done for today" for dailies, and for routine groups
    the summary, which now reads "All N done" when every routine is met (set in ReaderApp), not "N of N
    completed".
  - A complete group's summary stays bold in the game's colour.
- **Reduced motion and tests:** all motion is off under reduced motion. Tests are in
  `test/redesign-routines.test.tsx`.

### Round: the returning-user tour (2026-10-18)

The owner walked through the tour on the reachable build (Settings → Appearance → Replay the
introduction) and asked for three things:

- **Back no longer takes Continue's place.** It used to appear where Continue had been, so clicking
  through could land on it. Continue is now always first, in the same spot on every step. Back follows
  it from step 2, and "Skip tour" sits apart at the far right. There's also a "2 of 6" counter.
- **The Timeline comes right after the Checklist.**
- **A codes step.** It opens the Codes tab of the first tracked game that has codes, or the Checklist
  when none do.

The order is Routines → Checklist → Timeline → Redeem codes → Archive → Settings, which now opens on
Appearance. The welcome reads "Welcome back. A little has moved." Steps live in `TOUR_STEPS`, and
`ReturningTour` reports `onStep(stop)` to ReaderApp, which opens the page. Tests are in
`test/redesign-onboarding.test.tsx`.
- Follow-up: "Replay the introduction" now starts the tour itself. It used to only bring back the welcome
  banner on the Settings page. `AppearancePage` takes `onReplayTour`, and ReaderApp sets `tourAutoStart`,
  so `ReturningTour autoStart` opens on step 1 (Routines). Finishing or skipping clears it. A returning
  reader seeing the tour for the first time still gets the welcome first. Checked twice in a row in
  the browser.

### Round: focus pills with live's feel (2026-10-18)

The owner found the redesign's focus pills harsh ("scissors on a blackboard") next to live's chips.
They were cramped: 24px tall, 11.5px text, a 9.5px count and 5px gaps. They also snapped between states
with no easing, and hover only tinted the background.

`.focus-pill` now follows live's `.hue-chip` / GameFocus `Chip`:
- **Size:** 30px tall, 6px 12px padding, 12px text, a 10px tabular count at 70%, 6px gaps.
- **Colour:** an unpressed border in the game's hue at 30%; pressed, it's the full hue with a 14% wash.
- **Motion:** 130ms eased colour, border, background and shadow changes. Hover adds a 1px ring in the
  hue and, where motion is allowed, a 1px lift, and an unpressed label brightens to ink. A press
  scales to 0.96.
- **Empty games:** a game with nothing outstanding dims to 50% (`data-empty`).

The same pills appear in the Timeline's focus row, where they still fit on one line.
- Follow-up (Checklist rows): the owner found the "›" arrow too far from the time and date. It inherited
  the row's 24px column gap (22px in Relaxed, 16px under 1050px). A negative margin on `.event-entry > svg`
  now leaves 10px at every width and in both interfaces, measured in the browser.

### Round: closer to the screen edge, a wider rail (2026-10-18)

The owner found the content "weirdly far away" from the screen edge. The page was capped and centred at
1480px (1400px in Relaxed), which left 220px empty bands each side at 1920px.

- **Page width:** `.reader-ui` max-width is now 1920px; Relaxed is 1840px with 20px side padding instead
  of 28px. At 2560px the page still centres, with 320px bands.
- **Checklist edges:** the list and its heading use 24px side padding instead of 32px, matching the
  rail.
- **The rail** (Next to expire, dailies, routines) is wider, as the owner suggested: 300→360px in
  Structured, 320→380px in Relaxed, and at medium widths 240→280px and 280→300px.
- **Checked:** Checklist in both interfaces at 1440, 1920 and 2560px, plus Timeline, Routines, Archive
  and Settings at 1920px. Settings keeps its readable column width.
- Follow-up: the owner meant the inset between the content and the page's outer edge, about 24px
  (32px on the update rows). It's now two tokens on `.reader-ui`: `--edge: 16px` for outer edges and
  `--gutter: 24px` for the gap where a side column meets the content, which the owner asked to keep.
  - **Full-width parts** use the edge on both sides: header, footer, Timeline and Routines headers,
    the Routines table, Archive.
  - **Side columns** use the edge outside and the gutter inside: the Checklist rail, the Settings nav,
    the Archive sidebar.
  - **The main Checklist column** mirrors that: updates, headings, list, ledger, foot.
  - **At ≤700px**, where the columns stack, everything uses the edge, and the game strip moves to
    `left: -9px` so it doesn't touch the screen edge.
  - **Checked:** measured in the browser at 1920px and 390px, with no horizontal scroll.
- Follow-up (focus bar): the "Focus" label above the pills looked off-centre and off in weight. Cause:
  `.reader-ui h2` comes later than `.focus-heading h2` with the same specificity, so it swapped in the
  condensed display face at 13px. It also sat beside an 11px regular "Next: …" button and was centred
  by box, not text. It's now Barlow 500 12px in muted grey, like the rail's "Next to expire"
  (`.game-focus .focus-heading h2`), and `.focus-heading` aligns to the text baseline.

### Shipped as the initial redesign (2026-10-18)

The owner accepted the build: "I think this is ready to be shipped as the initial redesign." Before
committing:
- **Migration review:** a full schema-guardian review of the v1→v2 migration found no blockers. Its
  low-severity gaps are in TODO.md.
- **Image check:** the suite ran as the image runs it, without docs (typecheck clean, 1642 pass,
  build OK).
- **Docs:** `docs/DESIGN.md`'s redesign section now describes the shipped system.

The owner chose to commit and push, including `design/`, the redesign docs, `docs/design-reviews/` and
`.superpowers/`. The changelog entry and note follow in their own commit, because they must name the
redesign commit.

### After shipping: Settings width, redeem links, more code sources (2026-10-18)

- **Settings on large screens.** Content was capped at 900px (760px on game, backup and data pages),
  and the menu's rule stopped partway down. Content now uses up to 1320px; the changelog keeps its
  reading column. The menu runs the full height.
- **Codes tab.** It gains "Redeem on the official site ↗" where the publisher has a web page (Genshin,
  Star Rail, ZZZ), and the in-game route for every game with codes (`src/shared/redeem.ts`).
  A redeemed checkbox names the server only when there is more than one.
- **Code sources.** Eight more games come from Game8: `parseGame8CodeTable`, with fixtures, expected
  files and tests. Infinity Nikki is skipped because its page is stale, and ten games have no Game8
  page. See docs/SOURCES.md § Redeem codes for eight more games.
- **Owner's TODO:** let readers try Relaxed/Structured and the new/classic Timeline live, including
  returning readers who've done the tour.

## Round: the forced tour and trying the looks (2026-10-18)

The owner asked for every reader, new and returning, to be put through the tour before they can use
the app, and for returning readers to start on Relaxed. "Pick a layout" (Checklist) and the Timeline
step switch the page behind in place, and the selected look is kept. See `docs/DESIGN.md` → "The tour"
and `docs/DATA-MODEL.md` for the `redesignTourSeen` values.

Schema review: no data-loss or stuck-state path. Accepted, by the owner's rule: a returning reader who
had picked Structured on purpose is moved to Relaxed once, and the previous value isn't kept. The tour's
layout step puts it back in one click. Left as is (low): a stale second tab can re-force the tour
once, and a save-error banner shown during a forced tour can be read but not clicked.
