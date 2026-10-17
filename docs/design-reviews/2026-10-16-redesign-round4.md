# Routine redesign: Round 4 review

This records the owner's decisions from three mockup rounds and the subsequent review on
2026-10-16. These are proposed product changes, **not shipped behaviour**. The implementation spec
and migration plan come after review of this combined prototype.

## Review artifact

Open [the standalone Round 4 prototype](../../design/mockups/round4/converged.html) in a browser.
The review copy is also placed in `~/gacha-mockups/round4/converged.html`, linked from the existing
Samba index. Earlier rounds remain intact there.

The prototype extends the Round 3 archive variant, keeping its ruled timetable visual language and
routine library. It is deliberately separate from the production app. Its storage namespace is
`event-clock:mockup:round4:v1`, never a production `gacha-tracker` key. Reset demo restores sample
state; reloading otherwise keeps density, choices and progress where browser storage is available.

## Decisions to preserve

- Checklist and Timeline retain their names. Routines and Archive have their own tabs, as does
  Settings. Settings uses a sidebar with General first.
- Routines owns follows, individual editing and independent Checklist/Timeline pins. Built-ins do
  not appear under Your own events and games. The library puts Create your own routine first.
- Checklist keeps compact per-game routine summaries in its rail. Focusing a game expands its
  routines; All collapses them. Remove the unrelated Your own events callout from the rail.
- The main event list has two densities: Standard by default, with wrapping titles, breathing room
  and supporting copy, and Compact using the dense table. Density is remembered and independent of
  routine pins, filters, sort order and Timeline. Both densities open the same event detail.
- Game setup offers composable Events / Dailies / Weeklies & monthlies / Cycles shortcuts; individual
  follows remain editable in Routines. Events is a visibility choice, rather than a routine.
- Each game can have multiple servers, with separate routine and daily progress. An additional
  server starts with events only and fresh routine choices; it does not copy the first server's
  follows, pins or ticks.
- Onboarding begins with events only. Explain each type in plain language, especially cycles:
  routines following the game's own cadence, such as a mode resetting every fourteen days. Ask
  whether Checklist or Timeline should open first. Defer pin placement until readers have seen the
  views.
- Returning readers receive an introduction to the new layout in either main view, with existing
  choices and progress preserved. Changelog remains accessible afterward.
- Codes and About live beside Setup in the game's settings area. In-app notices appear in both
  main views. New means discovered since the reader last viewed that game's codes, not unredeemed.
  Viewing clears the new indicator without marking redemption. Redemption is separate per server.
- Archive defaults to per-game groups, with the ledger's story panel and small statistics above
  them. History timeline is an additional view. Records remain in the save, with description,
  source and progress available after the live source changes.
- Done and Ignore immediately save an archive record, then retain the active row for about 1.5
  seconds with Completed/Ignored · Moved to Archive before fading and closing the gap. Undo remains
  available afterward; Restore also lives in Archive. Reduced motion keeps the confirmation delay
  and removes the fade. Unknown end dates stay unknown in archived records.
- Expired unfinished events belong in Archive as unfinished, rather than silently disappearing.
- Timeline uses full rows for routines. It offers Ending soonest and By game. Separate reset strips
  are optional and sit directly below their own game's events on the same axis. In separate-strip
  mode, Ending soonest orders game groups by their next deadline to preserve this adjacency.

## What to review

1. Compare the same 21 events in Standard and Compact; focus Genshin and inspect its routine rail.
2. Complete or ignore an event, observe confirmation/fade, Undo, then open its saved Archive detail
   and Restore it. Try an event with no announced end.
3. Follow/unfollow a routine from the library and pin it independently to each view.
4. Add a server in game settings and confirm the other server's choices and ticks stay separate.
5. Open Codes, mark one redeemed on a single server, and simulate a new arrival from the demo bar.
6. Compare the per-game Archive with History timeline, and check both timeline reset layouts.
7. Walk through New user, then Returning user with Timeline as the default.

## Owner's feedback after Round 4

The combined prototype was received positively. Further requirements:

- Restore the richer statistics from Round 3 H's Ledger with a story. Round 4 reduced that panel
  to completed/ignored/unfinished counts, which lost what the owner liked. Keep the per-game
  archive as the default body, but restore the completion percentage for the current month with
  an overall comparison, current/best completion run, logged event check-in days, and unfinished
  events with near-miss detail. Retain the compact per-game outcome breakdown from that panel.
  Ignored events must not be counted as failures in the completion percentage. Definitions and
  scope labels must be explicit: recorded archive history is not all play history, event check-in
  totals are not unique calendar days, and incomplete/unknown progress cannot support a fabricated
  near-miss claim. These statistics should use saved progress and dates, not invented telemetry.

- Keep the colophon, potentially in Settings, and add an app-level About section distinct from a
  game's About tab. Preserve source/studio credits, author and contributor acknowledgements and
  useful project links. Moving credits must not hide the feed-age and stale-source disclosures
  that readers need while looking at deadlines.
- The grouped routine summaries are easier to scan but add friction to ticking daily chores.
  Explore a separate daily panel with directly available one-click ticks, selectable as an
  alternative to grouping dailies with the other routines. Keep server progress separate and
  avoid showing the same tick in both panels. Placement and default are not yet settled.
- Appearance should support colour schemes in addition to dark/light/system. The choice between
  curated palettes and reader-edited colours remains open. Any scheme must preserve game identity,
  urgency meanings, and readable contrast in both modes.
- Each game's Settings → Setup includes a custom game-colour control, a preview and Reset to
  default. Remember the override and apply it consistently wherever that game appears, including
  Checklist, Timeline, Routines and Archive. It belongs to the game, shared across its servers,
  separately from the global interface colour scheme. Use the existing readable-hue approach to
  preserve legibility in dark and light appearances without changing the reader's saved base
  colour. Game colour expresses identity; urgency colours retain their meaning. Export/import
  must retain these overrides in the eventual implementation.
- Clarify the additional-server action as simultaneous account tracking. Use “Track another
  server” with helper text: “Play on more than one server? Add your other server to track both
  accounts separately.” Keep changing the existing server as a distinct control. The added-server
  setup still starts with fresh routine choices and separate progress, as previously agreed.
- Standard event rows without descriptions currently feel too empty. Size rows to their actual
  content: reserve no description line when absent, reduce vertical padding for title-only rows,
  and keep the countdown/meter stack from imposing a description-sized minimum height. Preserve
  wrapping titles and comfortable tap targets; Standard remains roomier than Compact without
  forcing every event to the same tall height. Do not invent fallback description text to fill
  the space.
- Region & time must let the reader select their display timezone. Automatic, using the browser's
  timezone, is the default; a manual selection is remembered and can be returned to Automatic.
  Display named IANA zones with their current UTC offsets, so daylight-saving changes follow the
  selected zone rather than a fixed offset. This affects displayed dates/times, not the server
  clocks that determine deadlines, reset boundaries and stored game-day keys. Reader-authored
  event entry must explicitly identify the timezone used to interpret its input.
- In onboarding's What do you want to track step, all type choices stay selectable even when a
  game has no current matching routines or windows. Explain the empty state beside the choice;
  distinguish no current active window from no supported built-in routine. An empty result is not
  a disabled control. Retain the reader's selected tracking intent rather than deriving it solely
  from which routines happen to exist today. The implementation spec must reconcile this intent
  with the earlier shortcut-only composition model and define how newly supported routines are
  offered without silently expanding what existing readers track.
- Initial setup also asks for default game server, preferred appearance and whether to show
  events that have not started. The selected server initializes game setup and individual games
  can override it. Appearance includes Dark / Light / System and the agreed colour-scheme choices
  once those are settled. Upcoming events remain off initially, consistent with the existing
  default, until the reader selects otherwise. The previously agreed Checklist/Timeline default
  question remains. Present these as a short preferences step rather than crowding the tracking
  matrix with unrelated controls.

## Prototype boundaries and implementation work still ahead

- “Now” and reset clocks are fixed for review. The final app must use the existing per-game reset
  rules and actual region-specific end times.
- Most event content was carried over from the earlier prototypes. Codes, historical archive
  records, version groups and some descriptions are illustrative. No new source fetch runs here.
  Live-list source links are matched by title against the existing local feed; unmatched sample
  events receive no invented source URL.
  Game8's supplied Genshin code page is a source-shape reference, not an implemented adapter.
- Only in-app code notices are proposed. Push, email and background notifications remain outside
  the product scope.
- Some inherited controls remain placeholders: backup and portions of own-event/routine editing.
- The archive snapshot works within this prototype's save. Production needs an explicit snapshot
  retention/export format and a policy for capturing events before they drop from the feed.
- Production needs a reviewed migration for existing progress into per-server storage; no existing
  event ID, daily ID or day key may be changed casually. The archive and code state also need a
  documented export/import contract. This artifact is not a storage implementation to copy.
- `docs/PRD.md`, `docs/DATA-MODEL.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and the matching
  AGENTS guidance must be updated with the eventual implementation. They describe the shipped app
  today, so this review record does not rewrite them as though the redesign had landed.

## Verification

Browser verification and screenshots are performed with scratch-installed puppeteer-core and
Chrome, at 1440px and 390px. The prototype needs no Bun build or production feed changes. The test
journeys cover density parity, navigation, completion/ignore delay and Undo, archived detail and
Restore, separate code visibility/redemption, server setup, reset-strip adjacency, onboarding,
returning users, persistence, reduced motion and unknown end dates.

Both width passes completed with no JavaScript errors and no page-level horizontal overflow in
the checked screens. The initial mobile pass caught a confirmation notice intercepting Archive
row taps; informational notice surfaces now let pointer events through while Undo remains a real
button. An early verification-script failure also tried to open a Star Rail event after onboarding
had selected only Genshin; the scenario now resets sample state before testing an unknown end.

Impeccable's mechanical detector reports palette, typography and size differences against the
**shipped** DESIGN.md, plus inherited stripe treatments. The new Barlow timetable appearance is
intentional and selected in earlier rounds; this prototype does not rewrite the shipped design
reference or add detector suppressions. Its visual language remains subject to this review.
