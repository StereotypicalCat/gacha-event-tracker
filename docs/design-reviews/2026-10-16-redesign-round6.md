# Routine redesign: three quieter layouts

Review artifacts, not a production release. This round responds to the owner's concern that
Round 5's focus toolbar and stale-data notice occupied too much space, and incorporates the
additional feedback received while building the alternatives.

Open [the comparison index](../../design/mockups/round6/index.html). The shared copy lives at
`~/gacha-mockups/round6/index.html`; earlier rounds stay available. Each design is a complete
standalone HTML prototype with the same sample event data and the shared features below.

## The alternatives

- **A — Inline desk:** retains the left routine/daily rail. Game focus is a small selector beside
  the event heading, and freshness is a single understated line. Source reasons are one click away.
- **B — Game desk:** puts game focus, daily ticks and a short source-status report in the rail.
  There is no full-width freshness or focus band above the event list. It reserves more attention
  for the list; its tradeoff is a more populated rail that stacks before events on mobile.
- **C — Open ledger:** replaces the rail with a full-width event list, a brief next-deadline row,
  direct daily ticks in a horizontal strip, and a disclosure for other pinned routines. Game focus
  and a short freshness report sit with the event heading. It gives titles the most width; the
  routine controls scroll with the list.

The chosen timetable appearance is preserved. These compare structure and interaction rather than
asking the owner to pick a new visual identity again.

## Shared decisions implemented for review

- **Changelog is its own Settings page.** The owner explicitly chose this over a main app tab,
  and explicitly declined a footer link. Remove the awkward Changelog button from About, remove
  it from the footer, and render release notes in the page rather than the old overlay. Existing
  returning-reader news links lead to that Settings page.
- **Freshness remains honest and available.** Keep the full data timestamp and age in the footer,
  scope warnings to selected games, and expose successful-check/content-change times and reasons
  in Data & sources. Older source data is also explained in the event's detail. Unknown causes
  remain unreported, not invented. The review bar's Data selector tests the illustrative scenarios.
- **Dailies on Checklist belongs in Routines as well.** Routines → Checklist display controls the
  same preference as the daily panel shortcut and Appearance. Choose Separate panel or Grouped
  with routines. Independent pins still govern whether a routine appears.
- **Checklist routine groups have three behaviours:** Collapsed by default, Expanded by default
  (still collapsible), and Always expanded (no collapse buttons). Focusing a game expands its
  routines. The wide layout also honours this for its enclosing routine section.
- **Numeric fields show the native stepper.** Browser increase/decrease controls remain visible
  and use step one, as requested. They are not replaced by a separate custom spinner.
- **Appearance includes Custom.** Edit background, surface, text and interface accent separately
  for light and dark. Stored choices are retained while preview text/surfaces are adjusted for
  contrast. Game identities and deadline urgency remain separate from the custom interface accent.
  Individual game colours retain their own control and reset.
- **Reset timing can be overridden per game/server.** Game Setup and Region & time expose Automatic
  versus a custom server-local hour/minute, with Revert to Automatic. The prototype applies the
  override consistently to daily/routine periods and reset summaries. Reader-authored routines
  with their own explicit reset retain it. The automatic source clocks remain simplified here;
  this is not a production reset migration.
- **A game's About names its sources.** Links come from that game's entries in the existing local
  feed, including separate event/banner/pass sources. Use readable schedule labels and thank the
  editors. This differs from the global About's full, unfiltered colophon.
- **Remove Done and ignored events from Lists.** That row only linked to Archive and was not a
  setting. Archive keeps its own main navigation tab.
- **Backup rows say View backup.** They open a preview headed Backup from [date], showing the
  snapshot's contents. Restore this backup is the explicit action there; the current state is
  preserved as a recovery copy. The seven-day/four-week/six-month history is retained.
- **Returning readers get a guided introduction.** The review bar's Returning user control opens
  a short welcome in whichever view is preferred, with Take the quick tour and Keep browsing.
  Four steps visit Routines, Checklist, Archive and Settings. Back and Skip are available; finishing
  returns to the preferred view. Games, follows and progress remain intact. Production will bind
  this to a saved release marker, so it is offered once rather than every load.
- **Upcoming events moves to What do you want to track?** It is no longer in the initial preference
  step. The initial preferences retain default server, appearance and timezone; all type choices
  remain selectable and explained even when no matching built-in exists.

Standard/Compact density, richer Archive statistics and the history timeline, separate server
progress, code-newness versus redemption, completion confirmation/fade/Undo, timezone and the
existing routine library/create form remain available in every alternative.

## Boundaries

Each alternative uses its own `event-clock:mockup:round6:<letter>:v1` browser namespace. No production
keys, parsers or feed data are changed. Source-health states, codes, archived history and historical
backups are illustrative. Clock overrides affect the demo's period calculations, not any real stored
game-day keys. Production must review migration and the preservation of historical ticks before
introducing reader overrides. These are disposable prototypes, not code to transplant into the app.

## Verification record

The browser pass checks all three designs at 1440px and 390px: focus and daily controls, native
numeric stepping, all disclosure modes, source reasons in event detail, the Changelog page and its
absence from About/footer, custom-palette contrast, reset override/revert, per-game source credits,
Lists cleanup, backup labels, the moved upcoming option, and the returning-user tour preserving
progress. Screenshots cover each main layout plus the new shared pages.

The first mobile pass found a backup-preview smooth scroll continuing after navigation, allowing a
subsequent automated tap to hit the fixed review bar. The preview now scrolls instantly, avoiding a
pending animation against a different screen.

The confirming pass completed all six combinations of design and viewport with no JavaScript
errors or page-level horizontal overflow in the checked screens. Custom-palette checks included
equal chosen background/text colours and confirmed the rendered text was adjusted to at least
4.5:1. Per-server override checks exercised 05:30, verified the 90-minute change from 04:00, then
returned to Automatic. The tour returned a Timeline-default reader to Timeline with saved games,
follows and progress unchanged.

Design-hook triage: retain the owner-selected Barlow typography. Narrow value exceptions for that
font are scoped to `design/mockups/round6/index.html` only, with evidence in `.impeccable/config.json`.
No whole-file or whole-rule exclusions are added. The shipped DESIGN.md remains the production
reference; prototype differences in palette/size and inherited archive treatments remain review
findings rather than being suppressed broadly.
