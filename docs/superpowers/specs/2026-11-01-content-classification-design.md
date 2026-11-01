# Source classifications, Miliastra and battle-pass cycles

Date: 2026-11-01. Status: approved by the owner; implemented and verified.

## Intent and evidence

The owner reported Genshin duplicates, then compared the tracker against the
game. The walkthrough is recorded in `../../2026-11-01-genshin-event-audit.md`.
It confirmed ten timed Genshin activities, one probably claimed anniversary
reward, Moontrace as a battle pass, and five named Miliastra items. It established
no additional duplicate pair requiring broader fuzzy matching.

The cached Genshin Fandom table already states:

- Moontrace: `In-Game, Battle Pass`.
- Silvery Moonlight Chronicle: `In-Game, Miliastra Pass, Miliastra Wonderland`.
- Raiment Collection, Starlit Gala: Wonderland Selects and Starlight Voyage:
  `In-Game, Miliastra Wonderland`.
- Starlit Gala: `Web, Miliastra Wonderland`.

The parser currently reduces these labels to `EventType` and loses the useful
distinctions. Cross-source merge already folds the selector, Stygian and
To Temper pairs. ReaderApp already filters ended rows and reconciles previously
seen ones into Archive: old rows in the feed do not establish a display bug.

The owner chose source-driven classification over a maintained title table, and
requested a show/track TCG toggle in Genshin's About tab.

## Approaches

1. **Preserve classifications from sources (selected).** Labels route new
   Miliastra activities and passes without editing a list every patch. Costs an
   additive feed field, shared classification rules and progress-safe routing.
2. **A title-to-category table.** Smaller initially, but new poetic titles need
   continual upkeep and unknown titles silently return to the wrong section.

Use reviewed family/link mappings only where the source's category vocabulary
needs interpretation. They are deterministic, evidenced rules, never a fuzzy
title classifier or a replacement for source labels.

## Goals, boundaries and constraints

- Miliastra Wonderland is an independently selectable built-in lane.
- Source-dated battle passes are tracked through Cycles, once per pass window.
- Genshin's About tab controls whether its TCG events are tracked.
- Notes, completion, ignores, daily logs, amounts, history and clock references
  survive reclassification, import/restore and repeated application.
- Keep IDs, source URLs, source IDs, dates, precision and the current matching
  threshold unchanged. No additional fetches or dependencies are needed.
- Reader-created games, events and routines are not classified automatically.
- Do not invent schedules for missing content or create a row for an umbrella
  notice. Wonderland Treasures: Moonlight After the Rain remains unpaired.
- Do not merge Starlit Gala and Wonderland Selects. Their source classifies one
  as Web and the other as In-Game; similar names do not establish duplicate work.
- Do not turn the owner's rounded countdowns into precise timestamps, or their
  probable Rainbow's End claim into completion state.

## Classification and compatibility

Add optional structured classification to `GachaEvent`: destination lane,
battle-pass activity, and TCG tag. Exact property names are the builder's call;
the distinctions and compatibility below are required. The original `game`
remains the source/identity game in the wire feed. For example a Miliastra row
continues to carry `game: genshin` and its existing `genshin:...` ID, with an
additive destination of `miliastra`.

This separation is deliberate: changing the wire `game` to a new enum value
would cause old cached clients to reject the entire feed. Old clients strip
optional metadata and continue their previous behavior; new clients resolve a
logical destination for rendering and tracking. Old cached feeds still parse.
Register Miliastra's metadata for the new client without emitting a new game
value in old wire fields. Do not alter `slugify` or `eventId`.

Parsers preserve stated classifications, including established pass-only source
registrations (Nameless Honor, City Fund and Mira Journey). Merge retains
classification supplied by either matched source even when the identity winner
lacks it; date and title selection do not change. Explicit incompatible
classifications are reported and left unresolved rather than guessed. Absent
classification is not evidence against a stated classification.

For older feeds and saved event snapshots, a shared deterministic resolver may
recognize established source article paths and the owner-confirmed families.
Keep each rule's evidence beside it. Unknown content stays in its original lane
and ordinary-event category. The new parser metadata is the ongoing mechanism;
the compatibility rules protect cached/offline readers and existing history.

## Miliastra lane and saved state

Miliastra can be enabled, hidden, focused and ordered separately from Genshin.
It uses Genshin's established server/reset defaults; do not invent a different
clock. No standing daily task or new Miliastra routine is invented. Sources and
freshness reflect the same underlying Genshin source(s) that supply its rows;
there is no second request and no claim of a fresh independent source.

Like other newly added lanes, it arrives off for existing readers and is
available in setup for new readers. This lane setting takes precedence over
preserving a relocated pass's visibility: Silvery Moonlight Chronicle stays
hidden until Miliastra is enabled, with its follow/pin preferences and progress
retained. Enabling the lane restores its eligible placements. Genshin's About tab includes a short pointer
to Miliastra's settings so the relocated activities are discoverable.

Reclassification resolves storage as well as presentation. Use a persisted
origin-to-destination account mapping, one Miliastra counterpart for each
Genshin account whose identified Miliastra state must move. Preserve region and
clock history when establishing that counterpart, including historical revision
IDs referenced by logs; do not relabel day keys or remint event IDs. Distinct
origin accounts remain distinct even when their current region matches.
Mapped counterparts subsequently have independent settings and clocks.

Only classified source-authored Miliastra records move: progress, ignores,
daily/amount logs, seen/unread state, seen snapshots and Archive records. Leave
unrelated Genshin data and reader-created content alone. Historical archived
snapshots retain the meaning of their saved clocks and resolved boundaries.
Retired origins with moved history get a retired counterpart, not a new active
subscription. Empty counterparts need not be created until tracking is enabled.

The routing operation runs through the reader's lock/reducer/save path and is
idempotent. A failed save changes no visible ownership. Carry field timestamps
and deletion tombstones so reopening, old-tab writes, importing old backups or
clearing a migrated mark cannot resurrect data. Transfers are moves, not copies
repeated on every load. Export/import and restore retain the account mapping;
newly encountered legacy records for a mapped activity use that mapping. Never
route an old import into an arbitrary same-region account. The implementation
plan must spell out field-path rebasing and collision rules before coding.

## Pass windows in Cycles

This supersedes the ordinary-event presentation chosen in the 2026-10-16
pass-windows design; its date discipline and source coverage still apply.

Represent a pass as a feed-backed cycle window, preserving the event's existing
ID and account-scoped progress. Its sourced start/end and precision govern its
deadline. Do not express it as a fixed 42-day recurrence or reset it from a
version estimate. A new run is another sourced window, never an inferred one.

Passes are available in Routines under Cycles and follow existing independent
Checklist/Timeline placement controls. They can participate in next-deadline
guidance when followed and pinned to Checklist; a timeline-only pin does not
create a Checklist instruction. An ordinary event row for that same pass must
not render as well. Done/ignored/notes/history still use the existing pass ID;
there is no duplicate task ID or second progress store.

Follow/pin preferences belong to the pass family per account, so the next sourced
window inherits the choice while each window retains its own progress. Weekly
Battle Pass EXP remains a separate weekly routine. For existing readers who
track events, preserve pass visibility in enabled lanes by following/pinning
their existing pass family during the transition, without enabling other cycle
routines. Hidden lanes remain hidden, including newly offered Miliastra. New
readers follow passes through Cycles. An account can follow passes with ordinary
Events turned off. Silvery Moonlight Chronicle is a pass under Miliastra.

## Genshin About: TCG switch

Use the existing settings control style, with label **Track TCG events** and
supporting copy **Show Genius Invokation TCG events in your lists and timeline.**
This is a game-wide preference across the reader's Genshin servers; other
tracking controls can remain per account. Absent means on, preserving existing
coverage. Save immediately through the existing prefs action; display save
failure and restore the saved switch position when persistence fails.

Off removes classified TCG events from live Checklist, Timeline, next-deadline
guidance, focus counts and event-derived daily/check-in instructions. It does
not mark them ignored/done, archive them merely for being hidden, delete data,
or erase existing history. On restores eligible unfinished rows with all their
progress. It is a tracking preference, not an Archive filter; existing history
stays readable. No generic event-type filter or Miliastra setting changes.

Recognize TCG from explicit source categories, or an evidenced mapping from the
source's named TCG families/article paths. The owner's Forge Realm confirmation
is one such record. Broad words such as card, battle or challenge are not enough.
Apply the same resolver to saved snapshots so a cached copy cannot bypass the
switch. Reader-authored content is unaffected.

## Expiration and remaining deduplication

Reproduce the audited old rows through the current client, including remembered
seen-event snapshots and regional reset boundaries. Verify they are absent from
live guidance after their resolved ends and that previously seen events retain
history. Repair a demonstrated failure only; don't drop unknown-end events,
retire on raw UTC-midnight placeholders or remove historical records.

Keep current cross-source matching and `mergedIds` carry-forward. Add regression
coverage for the confirmed selector pairs and differently named seasons, and
for separate Starlit Gala activities and consecutive character trials. A
classification change does not itself establish event equivalence.

## Validation and delivery

Plan implementation in independently verifiable parts: additive classification
and merge; progress-safe lane routing; feed-backed pass cycles; TCG control;
expiration verification and documentation. State protection ships before its
dependent presentation changes. No commits or pushes unless asked.

Required checks include:

- Fixture parsing preserves all existing IDs/dates and extracts the stated labels;
  the identity winner retains the loser's classification.
- Old feeds remain readable; every wire game value remains accepted by the old
  feed contract. Unknown classifications preserve ordinary-event fallback.
- Multi-account lane routing preserves clocks, progress, logs, notes, history,
  tombstones and unknown fields across reload, import/restore and late writes;
  repeated routing and failed saves do not duplicate or lose records.
- Pass completion survives relocation; future sourced windows inherit follow
  and pins, not completion; Events off / Cycles on works; no duplicate row.
- TCG on/off/reload/failed-save behavior affects every live surface, preserves
  history and applies to remembered source rows, with independent Genshin servers.
- Browser checks at desktop/mobile sizes, both themes, and an ordinary HTTP
  hostname cover startup, migration and writes. Use fresh build origins per
  AGENTS.md. Shell-only builds must not refresh source snapshots.
- Appropriate targeted tests, full suite and typecheck. Feed before/after diff
  accounts for every changed field and confirms no ID or date moved.

Update PRD, DATA-MODEL, INGESTION, DESIGN and relevant prior specs when their
behavior changes; record the pass-window decision's supersession and source
identity versus destination-lane semantics. Reader-visible changes receive the
repository's changelog treatment when committed.

## Proposed defaults to review

The owner chose source-driven routing and requested the TCG control. The
following are design proposals: TCG defaults on and applies across Genshin
servers; Miliastra arrives off like other new lanes; existing followed pass
visibility in enabled lanes is preserved during its transition to Cycles. A fresh
builder review found the conflict between this default and Miliastra arriving
off; the proposal above explicitly gives the lane setting precedence. The owner approved these defaults before implementation.
