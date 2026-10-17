# Event Clock redesign: Relaxed and Structured

Date: 2026-10-16. Status: approved requirements; both the initial implementation and the 2026-10-17 fidelity correction were rejected by the owner. Current continuation instructions: `docs/handoffs/2026-10-17-redesign-second-rejection-handoff.md`. Launch the current server, then ask the owner for the biggest differences before further UI changes.

Owner amendment, 2026-10-17: Structured is the default; preserve explicit saved Relaxed.

## Intent and approval record

Make several games' events and routines easier to scan and act on, while retaining trustworthy
deadlines and every existing reader choice. The owner approved the Round 7 visual direction,
then explicitly chose **two UIs**, reversing the preceding single-UI decision. The second is
**Round 6 B**, confirmed in conversation. Both have the same capabilities and data.

Visual references:

- [Relaxed: Round 7](../../../design/mockups/round7/converged.html)
- [Structured: Round 6 B](../../../design/mockups/round6/b-rail.html)
- [Accumulated review decisions](../../design-reviews/2026-10-16-redesign-round4.md),
  [Round 5](../../design-reviews/2026-10-16-redesign-round5.md),
  [Round 6](../../design-reviews/2026-10-16-redesign-round6.md),
  [Round 7](../../design-reviews/2026-10-16-redesign-round7.md)

The prototypes are visual/interaction references, not production code. Sample codes, archive
history, source failures and backups must never become real reader data.

## Product choices

Settings → Appearance offers **Interface: Relaxed / Structured**, with preview thumbnails and
short descriptions. Relaxed is the proposed default for new and upgraded installs; existing
Dark/Light/System choices remain intact. Relaxed uses Round 7's separated panels, softer surfaces,
Bricolage Grotesque/Figtree typography and generous gutters. Structured uses Round 6 B's ruled
layout and Barlow typography. Both put the current-style game focus pills first in the left rail.
Switch immediately, remember the choice, and preserve the current page, focus and progress.

Interface, Dark/Light/System, colour scheme and Standard/Compact event rows are independent
preferences. Standard is the default row density. Content determines row height: missing
descriptions reserve no blank line and receive no fabricated replacement text.

Use a shared component hierarchy with interface-specific tokens and narrowly scoped styles.
Duplicating the app's React tree or maintaining two separate stores would double behavioural
maintenance. A spacing-only switch would not reproduce the two approved visual directions.

## Navigation, settings and updates

Main pages: Checklist, Timeline, Routines, Archive, Settings. Preserve the existing stored
Checklist view id `soon` and Timeline id `timeline`. Visiting a utility page must not overwrite
the preferred main view. Settings has its own navigation, beginning with General, and includes
Your games, Appearance, Lists, Region & time, Data & sources, Backup, About and Changelog.

Keep game focus behaviour from `GameFocus.tsx`: All/game pills, outstanding counts, tap the
selected game to return to All, Next through games and back to All. Hide the picker for one game.
Focus never changes followed games. Game ordering remains the reader's order, otherwise A–Z.

Checklist and Timeline share a compact updates area. New code notices, events new since the
reader's last visit, release news and source-age notices have distinct labels and state. Do not
clear one by acknowledging another. Omit empty update kinds and the entire area when empty.

Replace **Older schedules** with **Event data may be out of date**. Supporting copy names the
affected followed games: “For games you track: Genshin Impact, …”. **Details & reasons** opens
Data & sources. Show this row only when `freshness()` reports an affected followed game;
temporary focus does not narrow it. Do not add a large warning banner or repeat it on every row.

Reuse the real 48-hour freshness rule and oldest-source-per-game semantics. The footer always
states feed age from source data, never `generatedAt`, with Check for new data. The button requests
the published feed; it cannot force wiki scraping. Source details retain last successful data,
last confirmed check, content-change time, source links and known reasons. A recent check with
unchanged content is different from an overdue check. If no failure reason is recorded, say
“The reason for the delay is unavailable”; do not infer blocking or network failure. Offline
status is distinct from source age.

About retains the colophon, Lucas Winther attribution, contributor acknowledgements, all source
communities and studios, reset-clock reference, disclaimer and project links. Credits are not
filtered by followed games. Changelog is a Settings page, with no footer link or About button.
Existing release notices link to that page.

## Routines and game setup

Routines owns follow/unfollow, built-ins, Create your own routine, Make it mine, editing and
independent Checklist/Timeline pins. A follow controls tracking; a pin controls placement.
Stopping a routine preserves its history. Reader-authored games, events and task forms remain
fully functional; prototype placeholders do not satisfy this requirement.

Routines → Checklist display controls Separate daily panel / Grouped with routines, also exposed
in Appearance as the same preference. Separate is the proposed default. A daily tick appears in
one place, is reachable with one action, and remains distinct per tracked server.

Routine group choices: Collapsed by default, Expanded by default, Always expanded. Default is
Collapsed. A single-game focus expands its groups; returning to All restores the chosen policy.
Always expanded removes collapse controls. Numeric inputs retain native steppers and `step=1`.

Game settings contains Setup, Codes and About. Setup offers Events / Dailies / Weeklies &
monthlies / Cycles, plus individual routine choices. These types compose; events are visibility,
not a routine. Save type intent separately from current follows. Unsupported or currently empty
types remain selectable with an explanation. New built-ins matching saved intent are offered
for review, never silently followed on an established install.

“Track another server” explains: “Play on more than one server? Add your other server to track
both accounts separately.” It creates fresh choices with Events selected initially, and asks
all tracking questions again. It copies no ticks, follows or pins. Changing an existing server
is a different action and preserves that account's recorded history.

Game colour is shared across its servers, editable with picker/hex/preview/Reset to default.
About lists every registered data source for that game with links and thanks to its editors,
including event, banner and pass sources even when a source currently contributes no events.

## Appearance and clocks

Slate, Warm, Plum and Custom schemes are available in each interface. Custom edits background,
surface, text and interface accent separately for light and dark. Retain chosen base colours;
derive readable rendered text, game hues and semantic colours against their actual surfaces.
Keep game identity distinct from urgency. Small text must clear 4.5:1 in both modes and UIs.
Fonts must have usable offline fallback; do not make rendering depend on Google Fonts loading.

Display timezone defaults to Automatic, resolved from the browser. Allow searchable named IANA
zones and Revert to Automatic. Display timezone changes formatting, never server periods or
stored day keys. Custom event entry states the timezone in which its date/time is interpreted.

Per tracked game/server, reset timing defaults to Automatic and permits a custom server-local
hour/minute, with Revert to Automatic. Reuse real game/server offsets, regional hours and
built-in clock overrides. Explicit timestamps, `regionEnds` and reader-entered instants remain
authoritative; only reset-based/day-precision boundaries use the resolved reset clock. A routine
with its own explicit clock keeps it. No change to the global games table is needed for reader
overrides.

Reset changes are effective from their saved timestamp. Preserve a clock revision history per
tracked account and attach the revision to new logs. Previously stored day/period labels are
never re-keyed or silently interpreted under a different clock. Legacy logs belong to the initial
automatic-clock revision. Historical summaries must retain access to all revisions; transition
overlap is displayed as recorded history rather than merging or dropping ticks. Reverting to
Automatic starts another revision and preserves earlier records. Test the boundary immediately
before and after a change, including a change that moves the current game-day backward.

## Onboarding

New-user setup starts with events only. Ask default game server, appearance and timezone, then
games and What do you want to track?, then preferred Checklist/Timeline. **Show events that
haven't started** belongs in the tracking step and begins off. Explain types inline, especially
cycles: routines repeating on a game's cadence, such as every fourteen days. Explain “no active
window” separately from “no supported built-in”. Initial setup may follow currently supported
items deliberately selected by type; subsequent additions require review. Defer pin decisions
until readers can see the views. Do not change old installs to the new-install defaults.

Returning readers receive a one-time release-specific welcome, available in either main view,
with Take the quick tour / Keep browsing. The tour visits Routines, Checklist, Archive and
Settings, with Back and Skip, then returns to the reader's preferred main view. Persist a marker
separate from changelogSeen. Opening or skipping the tour changes no games, routines or progress.

## Archive and statistics

On Done or Ignore, persist the outcome and event snapshot immediately. Show “Completed · Moved
to Archive” or “Ignored · Moved to Archive” in the row for about 1.5 seconds, then fade/collapse.
Keep Undo for about eight seconds. Reduced motion removes the fade, retaining the confirmation.
Archive Restore is always available; restoring an ended event restores its recorded status,
but does not pretend it is running again.

Retain event metadata, description, source, dates/precision, region-specific ends, account,
progress and outcome timestamp. Unknown end dates remain null. Cache snapshots of seen events
before feed replacement so expired unfinished events can be recorded when they leave the live
feed. Missing from a feed is not proof of expiry: retain an outstanding snapshot until its known
deadline passes; unknown-end events remain unresolved and must not become unfinished by guess.
Only archive events for tracking periods the reader actually followed, not hidden catalogue games.

Default Archive body is per-game, with version groups only where the source states a version.
History timeline is an optional alternate body. The story panel shows monthly and overall
completion rate, current/best completion run, event check-ins, unfinished counts and per-game
outcome bars. Rates use done / (done + ended unfinished), excluding ignored and unresolved.
Use outcome time for done and resolved end time for unfinished when grouping by month. Completion
runs order those eligible outcomes by that time; ignored entries neither extend nor break them.
Event check-ins sum recorded distinct days per event/account, not unique calendar days of play.
Near-miss detail reports an actually recorded goal shortfall, only where a known target exists;
no invented threshold or estimated play progress. Label all statistics as recorded archive history.

Old marks whose events are no longer available remain preserved but cannot acquire fabricated
titles, deadlines or descriptions. Explain that earlier history may be incomplete.

## Persistent state, migration and backup

Keep existing event IDs, daily IDs, task IDs and day-key formats. Introduce stable tracked-account
identities around game/server choices; do not turn a region change into a different event ID.
Legacy progress, daily logs, ignores, task amounts and routine choices are associated once with
each game's initial account at the reader's saved region. A migration marker records the mapping.
Retain legacy key spaces and unknown/unreadable records; migration is idempotent and does not
duplicate logs on reload. Additional accounts get independent state. Existing global preferences,
game visibility/order, custom content and view survive. Migration must work for readers returning
after months and for old exports, not only the current developer browser.

New state includes account configurations/logs, routine follows/pins and tracking intent, archive
snapshots, reset revisions, appearance/timezone preferences, update-seen markers and code
redemptions. Document concrete schemas and keys in DATA-MODEL with the storage implementation.
Use a validated versioned full-state envelope for backup and restore; accept existing version-1
exports through a tested legacy reader. Preserve the existing distinction between progress import
and Import all. A new export must carry all new reader-owned state. Do not recursively include
backup history inside each backup.

Automatic backups run on app use and after settled data changes. Use a stable UTC calendar basis,
independent of display timezone. Keep latest snapshot per UTC day for today and the six previous
days; older snapshots fold into four consecutive seven-day windows; older snapshots then fold
into six calendar-month buckets measured backward from the oldest weekly window. Buckets are
disjoint; retain the newest snapshot in each and discard anything older. A partially covered
calendar month at the weekly boundary retains only eligible older snapshots. Maximum seventeen
retained snapshots, plus one pre-restore recovery copy. Never invent snapshots for unused days.

Backup rows say **View backup**. Preview shows date and contents; **Restore this backup** is the
explicit action. Validate the entire payload before changing live state, save current data as a
recovery copy, and support Undo last restore. Make multi-key restore recoverable using a prepared
transaction envelope; startup must resolve an interrupted restore before normal store writes.
Storage writes must report success/failure rather than relying on today's silently failing
`writeJson`. If persistence/quota prevents a recovery copy or complete restore, leave current
data intact and offer export. Failed backup retention writes must not delete the last good copy.
Explain that browser-local backups disappear if browser storage is cleared; export is the copy
outside this browser. No accounts or remote sync.

## Codes and source boundaries

Codes belong in game settings and notify in-app in both main views. Discovery/newness is per game
and independent from redemption per tracked account. Viewing a game's codes clears its new
indicator, never redemption. Only declare a code new when present in a successfully read feed,
not because its redemption checkbox is clear. Preserve first-observed metadata across builds.

The supplied Genshin Game8 codes URL is a source candidate, not a shipped feed. A deterministic
codes source is a separate ingestion sub-project with its own source/robots review, fixture,
parser/schema and refresh integration. It must follow existing scraping rules and publish only
source-stated code/reward/expiry facts; unknown expiry stays unknown. The UI implementation
includes a real empty/unavailable state and never ships sample codes as real. Integrating this
source is required to finish the codes feature, but must not delay validating the shared UI shell.

## Implementation boundaries and delivery order

Use production React components, pure state/selectors and existing Bun tooling. Extract page
coordination from App and settings from Controls as needed for the actual new page boundaries;
avoid unrelated refactors. No added runtime dependencies, accounts, push service, SQLite work,
parser rewrites or prototype JavaScript transplanted into production.

Deliver in independently verifiable stages:

1. Shared shell, both interfaces, settings/navigation, typography and responsive layouts.
2. Validated state/envelope, account migration and reset revision machinery with recovery tests.
3. Routines, game setup, independent pins, direct dailies and clock-aware views.
4. Archive retention/outcomes/statistics and automatic backup/restore.
5. Onboarding, shared updates/source details, credits/Changelog, themes/timezone/custom colours.
6. Deterministic code ingestion and real code notices/redemption, then complete end-to-end review.

The detailed implementation plan must define file-level tasks and concrete storage schemas before
stage 2. Each stage preserves a runnable app and documents what has actually landed. No staged
delivery is a claim that the complete redesign is finished.

## Verification and documentation

Test migrations from realistic legacy saves and exports, idempotence, independent account progress,
reset changes/reverts at boundaries, null ends, vanished feed rows, archive denominator/ordering,
backup folding across calendar boundaries, quota failures and interrupted restores. Test code
newness independently from redemption and source-age scope independently from focus. Existing
date/parser/ID tests must remain green. Tests create their own fixtures and never require public
build output, repository docs or network.

Run typecheck and the full offline suite; build CSS/JS/static shell with production JSX settings.
Check actual built app in Chrome on a new port for each rebuild at phone and desktop widths,
both interfaces, both themes, Standard/Compact, keyboard/focus, reduced motion and 200% zoom.
Exercise custom palette contrast on all used surfaces, no horizontal page overflow, one-action
dailies, timeline reset adjacency, both onboarding paths, archive Undo/Restore and backup recovery.
Verify offline reopening and the real update flow without losing progress.

Update PRD, DATA-MODEL, ARCHITECTURE, DESIGN, PRODUCT and affected AGENTS guidance with each
implemented stage. Source integration also updates INGESTION/SOURCES. The shipped documents
continue to describe shipped behaviour until that implementation exists. Add changelog/release
notes under the repository's normal commit workflow when authorized; do not commit or push merely
because this specification has been written.
