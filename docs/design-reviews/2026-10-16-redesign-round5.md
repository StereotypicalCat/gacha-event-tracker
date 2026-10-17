# Routine redesign: Round 5 review

This is a review prototype, not a production release or an approved implementation spec. It
combines the owner's feedback after Round 4, recorded in
[the preceding review](2026-10-16-redesign-round4.md), and the subsequent freshness, backup and
focus-bar requests.

Open [Round 5](../../design/mockups/round5/converged.html), or its copy at
`~/gacha-mockups/round5/converged.html` through the shared index. Earlier rounds remain unchanged.

## What changed

- **One-click dailies:** an optional panel exposes daily ticks directly, separately per server.
  The alternative groups dailies with the routine summaries. A daily appears in only one place;
  pins still decide which dailies appear. The separate panel is the prototype's starting choice,
  to test the owner's request for immediate access; this default remains reviewable.
- **Focus alternatives:** a labelled game toolbar is the starting choice. The review bar's Focus
  selector also offers a compact game switcher and a picker at the top of the Checklist rail.
  Each changes the same focus state and counts, and preserves auto-expanding focused routines.
  Timeline retains a visible toolbar/switcher rather than acquiring a Checklist rail.
- **Content-sized Standard rows:** events lacking descriptions use less vertical padding and
  omit the segmented meter. They retain a wrapping title, countdown and tap target. No filler
  descriptions are added.
- **About and colophon:** Settings → About Event Clock retains the author, source communities,
  studio credits, acknowledgements, reset-clock reference, disclaimer and project links. The
  footer links there. Source credits come from the existing local feed, not the selected games.
- **Freshness:** Checklist and Timeline visibly state data age and warn about older schedules for
  the games switched on. Source breakdown distinguishes last successful check from last content
  change and explains unchanged pages, overdue pulls and never-fetched data. Unknown causes are
  described as unreported, not invented. Settings → Data & sources exposes the same information.
  The review bar offers Current / Some stale / All stale / Never fetched / Offline. These are
  labelled illustrative states; no real fetch runs. Check for new data demonstrates a no-newer-feed
  result and is disabled offline. The headline data timestamp covers the demo feed as a whole;
  warnings and named source rows cover selected games. No build timestamp is used.
- **Appearance:** Dark / Light / System plus three curated scheme previews, Slate / Warm / Plum.
  This answers the palette request for review, not the unresolved possibility of a fully editable
  interface palette. Semantic deadline colours remain separate from game identity.
- **Game colour:** Setup adds a colour picker, hex input, preview and Reset to default. An override
  applies to all the game's servers and all its views. The stored base colour remains unchanged
  while its rendered colour is adjusted for contrast in the chosen appearance.
- **Timezone:** Automatic is the default; named zones can be selected and searched in Region &
  time. Dates use the selected zone, including daylight saving, without changing server reset
  boundaries. The prototype's per-game reset clocks remain simplified.
- **Additional servers:** “Track another server” explains simultaneous separate account tracking.
  Added servers still start with fresh routine choices and progress.
- **Onboarding:** initial preferences now ask default server, mode/scheme, timezone and whether
  upcoming events should appear. Game selection, tracking types and Checklist/Timeline default
  follow. All tracking types remain selectable even if no matching built-in exists. Availability
  is explained, and selected intent is saved separately from actual follows. The no-matching-types
  message does not incorrectly call that selection events only. New supported built-ins are
  described as offers for review rather than automatic extra work for existing readers.
- **Archive story:** restores monthly/overall completion percentages, current/best completion
  run, logged event check-ins and unfinished/near-miss counts, plus per-game outcome bars, above
  the default per-game archive. Ignored events are excluded from completion-rate denominators.
  Progress and statistics derive from illustrative saved archive records, and scope is labelled.
  History timeline remains an alternate view.
- **Automatic backup history:** Backup shows seven daily, four weekly and six monthly snapshots,
  with latest-per-period compression. The retained historical examples are labelled sample; today's
  snapshot updates from the demo's own state. Restore previews game/routine/archive/progress counts
  and preserves current data as a recovery copy first. Undo last restore is available. Manual
  Back up now and demo JSON export/import live alongside the automatic history.

## Backup semantics used for this review

The most recent seven days retain one latest snapshot per day. Older snapshots fold into four
consecutive seven-day windows. Older records then fold into six calendar-month buckets, keeping
the latest snapshot in each. This is up to seventeen retained snapshots, plus a recovery copy from
the last restore. No snapshot is invented for a day the reader never opened the app.

The demo clock is fixed and its bucket calculations use UTC. Production needs to settle and
document the stable calendar basis independently of display-timezone changes, handle storage
capacity/failures, validate restore files, and use the real export contract. Backups are browser
local and are created while the app is used; they cannot be promised for days when it stays closed.
Export remains the way to keep a copy outside that browser or move to another device.

## How to inspect

1. Compare focus options in the review bar. Focus Genshin; tick EU and Asia dailies separately.
2. Compare Standard/Compact, especially rows without descriptions, and switch the daily layout.
3. Use the Data selector to inspect every freshness state, then expand Why the data is older.
4. Open About, Data & sources, Region & time and Appearance. Change timezone, scheme and game colour.
5. Open Archive to inspect richer stats and History timeline.
6. Open Backups, review a monthly sample, restore it, then Undo last restore. Demo export files are
   separate from the production app's format and storage.
7. Open New user. Choose preferences and Genshin, then select Cycles despite no matching built-in.
8. Set Timeline as the default and use Returning user to check the introduction appears there.

## Verification and boundaries

Chrome journeys at 1440px and 390px exercised direct daily ticks, layout choices, focus alternatives,
freshness variants, credits, timezone persistence, light/dark/system and schemes, game-colour reset,
fresh server setup, Archive stats, backup restore/recovery, onboarding with an empty type,
returning-reader introduction and completion/Undo. Both passes had no JavaScript errors and no
page-level horizontal overflow in the checked screens. A follow-up checked latest-per-period
retention across 400 simulated days, all-games empty-type toggles, and desktop sticky toolbar/rail
separation.

The mechanical design detector reports 30 findings, chiefly differences from the shipped palette,
Barlow typography and size/radius ramp, plus inherited archive stripe treatments. These are review
artifacts in the owner-selected replacement visual direction; no production design reference or
detector suppression was changed to make the prototype appear to match the shipped app.

An inherited Round 4 Reset handler initially discarded the new state fields. Round 5 now owns
reset initialization and its browser check passes. The active prototype data namespace is
`event-clock:mockup:round5:v1`; production localStorage keys and progress are untouched.

The existing demo library/create form, independent pins, completion confirmation/fade/Undo,
Archive restore and code-newness/redemption distinctions remain. Some inherited own-event editors
are still placeholders. Codes, old Archive history, backup history and source health are sample
content. Real parsers, source refreshes, app storage migrations and production backup machinery are
not implemented by this artifact. The shipped specification and design documents remain about the
shipped app until the redesign's spec and implementation are reviewed.
