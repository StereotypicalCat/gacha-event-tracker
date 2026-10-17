# Approved redesign — implementation review, 2026-10-16

**Status: rejected by the owner for substantial divergence from the approved Round 7 markup.**
The completion claims below describe the earlier implementation report and are withdrawn as
evidence of design acceptance. Functional tests and overflow checks did not establish visual or
interaction fidelity. A faithful markup-to-component correction is still required.

The approved [spec](../superpowers/specs/2026-10-16-ui-redesign-design.md) and
[16-task plan](../superpowers/plans/2026-10-16-ui-redesign.md) are implemented in the working tree.
Execution was Native. Nothing has been committed, pushed or published.

## Delivered

Relaxed (Round 7, default) and Structured (Round 6 B rail) share one reader/component tree; Appearance
switches between them independently of theme, palette and Standard/Compact density. The redesign
includes Routines and view pins, direct daily ticks, configurable grouping, multi-server progress,
reset override/revert with accessible clock history, game colours/source credits, custom palettes,
Automatic/IANA timezone, new and returning onboarding, compact source/new-event/code notices,
Archive/story statistics, timed Done/Ignore/Undo, local rolling backups and recoverable restore.
Settings About preserves the colophon; Changelog has its own page and no footer link.

The codes feed contains ten real Genshin codes from the pinned Game8 capture. Source fetching remains
deterministic and shares the existing conduct gates; no additional community requests were needed
while implementing or reviewing. Unstated expiry stays unknown. Codes newness and per-server
redemption are separate. Manual refresh checks both feeds and discloses partial code-feed failure.

## Verification

- **1,587 tests pass**, zero failures, across 74 files. Strict TypeScript and whitespace checks pass.
- The suite also runs without `public/` or `docs/` in the Docker COPY layout: 1,586 pass, one
  intentional README-only skip, zero failures. No tests depend on a preceding build.
- Full offline build passes: 209 events across 20 games, ten codes, production JS/CSS/static shell.
  Final shell build `f5b25675010f` was loaded on a fresh origin (port 41880).
- Chrome checks cover both interfaces, both themes, 1440/390 widths, Standard/Compact, reduced motion
  and an effective 200% CSS viewport. No horizontal page overflow or page errors in that matrix.
- Browser journeys pass for migration, saved preferred Timeline, events-only setup, selectable empty
  tracking kinds, upcoming placement, isolation from unselected games, extra server with fresh state,
  direct ticks, reset override/revert/history, per-server redemption, Done/Ignore/Undo, unknown-end
  custom creation, real export download/upload/restore, backup preview/restore/Undo, custom palette,
  timezone selection/search, offline reload and the real service-worker update/reload handshake.
- Two real browser tabs save concurrently with Web Locks explicitly disabled: IndexedDB serialization
  preserves both edits. Unit regressions cover stale progress fields and independent routine pins.
- A fresh independent reviewer completed whole-change review and focused re-reviews. All important
  findings were fixed with reproductions; final review reports no remaining important findings.

## Review fixes and durable decisions

Deleted custom definitions no longer reappear from seen snapshots. Progress imports preserve local
active reset configuration, retain imported clocks as history, and reuse those revisions on repeated
imports. Opaque extensions survive subsequent transfers without duplicate accumulation. Timeline
focus applies to routines as well as events; Ending soonest uses one global queue when reset strips
are off. The browser fallback uses an IndexedDB transaction rather than unlocked whole-envelope
writes. Account rebase preserves independent routine/pin edits and explicit retirement removal.

Original v1 bytes remain available after migration. Restore validates account/clock references and
saves recovery before replacement. Setup completes before seen-history capture. Source diagnostics
state what the feed records; absent failure reasons are described as unavailable, never guessed.

## Practical limits

Backups are browser-local and created while the app is used; they cannot recover storage a reader
clears. Older completion IDs whose metadata was never retained remain recoverable raw data, but
cannot produce invented archive descriptions or historical statistics. Codes currently have one
registered game/source. External fonts have system fallbacks offline. Calendar-date code expiry is
shown as a date without an invented instant. No accounts, remote sync or push notifications added.

## Captures inspected

[Relaxed, light, desktop](assets/2026-10-16-redesign/relaxed-light-1440.png) ·
[Structured, dark, desktop](assets/2026-10-16-redesign/structured-dark-1440.png) ·
[Structured, dark, phone](assets/2026-10-16-redesign/structured-dark-390.png)

Additional transient browser logs and captures are in `/tmp/redesign-browser-*` and
`/tmp/redesign-final-*`; the facts above and representative images are recorded here for handoff.


## Follow-up: first-visit HTTP/WireGuard startup failure

The owner reported the recovery screen on first visit through WireGuard `10.20.20.2`. The precise
failure reproduced in Chrome at an ordinary HTTP hostname: `crypto.randomUUID` was undefined,
initial account minting threw, and initialization returned the generic unavailable/saved-data error.
Localhost-only verification had missed this because localhost is a browser secure context.

All reader ID consumers now use 128-bit `crypto.getRandomValues` through `state/reader/ids.ts`.
Three new regressions failed before the fix and pass afterwards. Browser verification on an actual
insecure HTTP origin passes both existing-save migration and fresh setup, ordinary edits, adding a
server, reset override/revert, backups and reload; the original v1 bytes remain unchanged. Focused
independent review found no important issues. The full suite now passes **1,590 tests** across 75
files. Typecheck, production rebuild and whitespace checks pass. Rebuilt shell: `9752bd6bf1d2`.

The existing preview serves the rebuilt files; hard-refreshing bypasses the browser's cached JS.
No storage deletion or identity remapping was performed.


## Owner rejection: markup fidelity

Direct comparison confirms substantial divergence despite matching outer gutters/panels/fonts:

- Round 7's event-entry structure separates event content, a large deadline with supporting text,
  and chevron. Production reused EventRow's prior internal structure and decorated it with CSS.
- Round 7's Routines uses game bands and aligned columns for progress, cycle/reset, pins and menus.
  Production renders a flattened library with checkbox options and no equivalent table structure.
- Round 7's settings sidebar includes individual game entries with descriptions, leading into their
  profiles. Production substitutes a generic Your games page and game selector.
- Round 7's Timeline places routine periods/progress/reset markers on the shared time axis.
  Production appends ordinary routine controls below event timelines and uses textual reset strips.
- Round 7's Archive story includes interactive per-game outcome breakdowns. Production substitutes
  per-game text totals.
- The approved header has navigation counts and a dedicated Settings placement. Production uses
  the simpler generic navigation and a different header summary.

References: design/mockups/round7/converged.html (final CSS from line 1003 onward and final renderer
overrides); production ReaderApp.tsx, EventRow.tsx, TimelinePage.tsx, RoutinesPage.tsx,
SettingsLayout.tsx, GameSettings.tsx, ArchiveStory.tsx. Earlier render functions/CSS in the mockup
are superseded by later overrides and must not be used in isolation.

Root delivery error: the implementation preserved/reused existing presentation components and
added selected reference styling instead of faithfully translating the approved rendered markup.
Verification checked functionality and overflow without comparing equivalent reference/production
screens and interactions. The final review concentrated on data preservation and did not close that
design-fidelity gap. The owner should not have had to identify it after a completion claim.

No implementation edits or data resets were made during this rejection audit. Existing storage and
HTTP fixes remain in place. Required correction: use the approved rendered markup, hierarchy and
interactions as the presentation contract, then connect real reader data and compare matching states.
