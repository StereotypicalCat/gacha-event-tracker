# Redesign fidelity correction — 2026-10-17

> **Owner rejected this implementation after browsing it:** “This is still not even close to the
> mockup.” The completion claim is withdrawn. Screenshots and review verdicts below are historical
> evidence of the rejected attempt, not acceptance. Continue from
> [the second-rejection handoff](../handoffs/2026-10-17-redesign-second-rejection-handoff.md):
> launch the current server, then ask the owner for the biggest differences before further UI edits.

The owner asked to repair the rejected implementation against Round 7 Relaxed and Round 6 B
Structured, then explicitly made **Structured the default**. Existing saved Relaxed choices remain
valid. This correction is uncommitted in the existing checkout; no branch, publication or data-source
refresh was performed.

## What changed

- Checklist uses dedicated reference-shaped event rows and next-deadline panel, with separate copy,
  countdown, supporting date, segmented meter and detail chevron. Header counts and Settings placement
  follow the reference. Both interfaces retain the owner-approved focus pills.
- Routines has By reset/By game bands, aligned game/routine/progress/view-pin/menu columns, live totals,
  direct daily status, amount bars/inputs, library and a native custom-routine drawer. Bulk pins combine
  writes per account. Multi-server row identity includes both account and routine.
- Timeline plots event spans and routine periods on one axis with frozen labels, progress fill and
  reset markers. In-progress bar labels remain visible after scrolling. Deadline ordering includes
  routine resets, and separate reset strips remain available.
- Settings restores separate Default view and Your own events and games pages, game profiles, tracking
  summaries and Other games. Profiles follow tracking → servers → colour → reset timing. A server
  selector above tracking keeps choices independent without duplicating tall account panels.
- Archive restores the story, interactive outcome bars, game sidebar, saved rows and history timeline.
  Its detail dialog reads saved metadata, original clock region, notes, days and amounts. It does not
  open the live progress editor or replace historical state with the current clock.
- Structured defaults agree across prepaint, normalization, setup and applied appearance. No IDs,
  localStorage key spaces, migrations or ingestion rules were changed by this correction.

## Reference comparisons

Images are in [the evidence directory](assets/2026-10-17-fidelity/). Representative matched views:

| View | App | Approved reference |
| --- | --- | --- |
| Structured Checklist | [Desktop](assets/2026-10-17-fidelity/app-structured-dark-1440.png) | [Desktop](assets/2026-10-17-fidelity/reference-structured-dark-1440.png) |
| Relaxed Checklist | [Desktop](assets/2026-10-17-fidelity/app-relaxed-dark-1440.png) | [Desktop](assets/2026-10-17-fidelity/reference-relaxed-dark-1440.png) |
| Relaxed mobile | [390px](assets/2026-10-17-fidelity/app-relaxed-dark-390.png) | [390px](assets/2026-10-17-fidelity/reference-relaxed-dark-390.png) |
| Routines | [Structured](assets/2026-10-17-fidelity/app-structured-routines.png) | [Structured](assets/2026-10-17-fidelity/reference-structured-routines.png) |
| Timeline | [Structured](assets/2026-10-17-fidelity/app-structured-timeline.png) | [Structured](assets/2026-10-17-fidelity/reference-structured-timeline.png) |
| Game Setup | [Relaxed](assets/2026-10-17-fidelity/app-relaxed-settings.png) | [Relaxed](assets/2026-10-17-fidelity/reference-relaxed-settings.png) |
| Archive | [Structured](assets/2026-10-17-fidelity/app-structured-archive.png) | [Structured](assets/2026-10-17-fidelity/reference-structured-archive.png) |

Additional captures cover both themes at 1440px/390px, populated mobile utility pages, compact rows,
event/archive details, custom-routine drawers, archive history and the Settings pages.

The comparison harness freezes time at 2026-10-16 12:00 UTC and intercepts the event-feed request
with the prototype's **synthetic demonstration events**. It seeds disposable browser storage with
matching routine choices and 38 archive snapshots. These fixtures are review evidence only: they
are not imported by production, copied into public, or written into source snapshots. Actual setup,
HTTP migration and offline checks use the built app and its real feed separately.

Expected semantic differences: real account rows include Asia events, so totals differ from the
prototype's game-only event list. One prototype custom task was not seeded. Production has no
version metadata for archive events, so it groups saved records without inventing version names.
Real reset clocks and available routines govern progress. Code/release notices reflect actual data;
Checklist comparisons hide these notices to align the first viewport. The Structured prototype's
filter dropdown is intentionally superseded by the owner's focus-pill decision.

Reproduce with [fidelity-capture.mjs](fidelity-capture.mjs), from the repository root, setting
`PUPPETEER_MODULE` to the scratch installation's ESM entry and `APP_URL` / `MOCKUP_URL` to fresh
running origins. Chrome is `/usr/bin/google-chrome-stable`; the harness maps event-clock.test to
loopback. Rebuild CSS/JS/static without fetching the feed, and use a new app port after each rebuild.

## Independent review

The first reviewer invocation hit a session usage limit; a retry succeeded. Its initial material
findings were invisible scrolled timeline labels, substituted Settings navigation, routine column/
status hierarchy, multi-account row-key collisions, and insufficient populated Archive evidence.
One follow-up also required correcting the game-profile hierarchy. Each finding was fixed and the
same screenshot paths recaptured. Final independent verdict: **“ship the reviewed corrections.”**
All reported material findings were resolved. This verdict is scoped to the compared screens and
reported fixes; it is not owner acceptance or blanket proof of every interaction.

The Impeccable detector ran once and returned `[]` (no findings).

## Verification

Final browser build: `a28021bbe1a8`, production React/JSX transform, 117 bundled modules.

- TypeScript passes. Full offline suite: **1,594 passed, 0 failed**, 5,410 assertions.
- Docker-equivalent copied file layout, without docs/design/public: 1,593 passed, one intentional
  docs-dependent skip, no failures. This validates the COPY-layout assumption; no Docker image was built.
- Eight interface/theme/width combinations: no document overflow or page exceptions. Both densities,
  reduced motion/effective 200% viewport, custom palette and timezone selection checked.
- Ordinary insecure HTTP hostname: new setup, existing v1 migration, daily writes, second server,
  reset override/revert, backup and reload pass; original legacy bytes retained. Structured is the
  missing-choice default and saved Relaxed survives reload.
- Real two-tab simultaneous writes with Web Locks disabled pass using the existing IndexedDB lock.
  Offline reload passes on localhost's service-worker-capable origin.
- Final-build interaction checks: multi-server bulk pins preserve the other view's placement; numeric
  edits and custom-routine creation persist; completion, Undo, archive detail, Restore and Escape pass.
  Final profile's server/reset controls were rechecked on insecure HTTP after layout changes.
- `git diff --check` passes. No new runtime dependency, source fetch, commit or publication.

The earlier rejection is preserved in the 2026-10-16 report. Passing tests did not establish its
visual fidelity; the side-by-side evidence and scoped review above are the correction's design record.
