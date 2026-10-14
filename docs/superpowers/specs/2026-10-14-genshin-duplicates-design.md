# Genshin's battle pass listed twice — design

Date: 2026-10-14. Status: approved in conversation (widen merge, strip the prefix in the parser,
build the remap). The anniversary-selector duplicate is a separate decision, open below.

## Problem

A reader reported duplicate Genshin events. Building the feed from the current snapshots puts one
event on the calendar twice:

| Source | Title | ID | Dates |
|---|---|---|---|
| `genshin-game8-events` | `Battle Pass - Moontrace` | `genshin:battle-pass-moontrace:2026-09-23` | 09-23 → 11-02 |
| `genshin-fandom-events` | `Moontrace` | `genshin:moontrace:2026-09-23` | 09-23 → 11-02 |

The pinned fixtures show the same pair for the previous pass (`Battle Pass - Frostfarer` /
`Frostfarer`, 08-12 → 09-21), so every battle pass has been on the calendar twice since the Fandom
source landed on 2026-09-12. The "11 net-new events" AGENTS.md recorded for that source counted one
of these duplicates as new.

## Root cause

Game8 names the event's category in front of its name; Fandom puts the category in its `Type(s)`
column. `mergeEvents` fuses a cross-source pair on title similarity ≥ 0.8 or on `titleExtends`, and
neither fires: Dice similarity is 2·1/(3+1) = 0.5, and `titleExtends` only accepts words *appended*
to a base of at least two words, while here one word was *prepended* to a base of one.

## Decisions

1. **The Game8 parser strips a leading `Battle Pass -` from a title.** The category is not the
   event's name, and both copies then mint the same ID, so merge rule 1 (same ID) fuses them with
   no fuzzy matching. Only Genshin's Game8 page has ever used this label (git history of
   `snapshots/` and `fixtures/`: Frostfarer and Moontrace only).
2. **`titleExtends` also accepts words prepended**, under the same two-word floor. It is the general
   form of the same mistake — a source qualifier at the front instead of the back — and the floor is
   kept because a one-word base would fuse half a patch day. This rule does not catch Moontrace on
   its own; decision 1 does.
3. **Readers' marks follow the ID.** Decision 1 moves Game8's two IDs, so a client-side remap moves
   `progress`, `daily` and `ignored` entries from each retired ID to its replacement, on every load
   and on every import. It is an explicit table, not a pattern, and stays until at least 2027-10-14.
   - **Move, not copy.** The localStorage *key* is untouched; the entry changes its id inside it. A
     copy that kept the old entry would re-create a mark the reader cleared on every load after.
   - **When both ids hold an entry, the store's own import merge decides** — progress: later `at`
     wins; daily: union of days; ignored: earlier mark. A reader who marked both duplicate rows
     loses nothing.
   - Idempotent: once moved, the retired id is absent and the remap does nothing.

## The anniversary selectors

Fandom lists the two anniversary 5-star selectors under their event names
(`Tabletop Troupe: A Gathering on Adventure's Eve`, `Across the Frozen Wilds, Honing One's Edge`),
both typed `Anniversary 5-Star Character Selection`, both 09-23 → 11-03. Game8 lists them as
`Free Limited 5-Star Anniversary Selector` and `Free Standard 5-Star Anniversary Selector`. No title
rule can pair them, and the dates cannot tell the two apart.

Approved: the owner establishes the pairing and it is recorded. They did, on 2026-10-14 — Game8's own
summaries name the Fandom events (limited → Tabletop Troupe, standard → Frozen Wilds), and Fandom's
articles agree (event-exclusive vs Standard Wish).

4. **`src/ingest/aliases.ts` records each pair by event ID**, with its evidence; `isSameEvent`
   accepts a recorded pair as similar and still applies the start-date guard. Keyed by ID so a record
   covers one run and lapses on its own; next year needs a new entry rather than inheriting a guess.
5. **Game8's copy survives** (priority, as everywhere in this lane), so Fandom's two IDs join the
   retired table and move onto Game8's.

## Not changing

`slugify`, `eventId`, the feed schema, priority, and every other source's IDs. Verified by diffing
the built feed before and after: 217 → 214 events, and the only IDs that stop being published are
Game8's Moontrace and Fandom's two selectors — each in the retired table, each onto a row still on
the calendar. No other game moved.

## Part 2 — so the next one needs nobody

Approved in conversation the same day: automate the two manual steps the selectors needed.

6. **A summary that names the other copy's title is evidence they are one event.** In
   `isSameEvent`, cross-source as ever: starts *and* ends within 24h, and one copy's summary contains
   the other's whole title as a contiguous run of at least two words. Game8's selector summaries
   ("…the annual 5-star selector, Across the Frozen Wilds, Honing One's Edge!") are the case. Measured
   on every two-source page held (Genshin and Endfield, fixtures and snapshots): it fires on both
   selector pairs and otherwise only on pairs already matched, and on none of the ~25 distinct pairs
   sharing a window. Dates alone are refused: patch day puts ~20 different Genshin events on one
   window, so a same-dates rule or detector would be ten-to-one noise.
7. **Merge records what it absorbed, and the feed carries it.** The surviving event gets
   `mergedIds` — every other id fused into it. Optional in `GachaEvent`, so an old cached feed still
   validates and an old shell strips it unread.
8. **The client moves marks off absorbed ids on its own.** When a feed arrives, every `mergedIds`
   entry not itself published as an event becomes a carry-forward pair for `progress`, `daily` and
   `ignored`, under the same move/merge rules as `RETIRED_IDS`. A future fusion — from any rule —
   then needs no hand-edited table. `RETIRED_IDS` stays for ids a *parser* change moved, which no
   feed can describe because the old id is never produced again.
9. **`aliases.ts` stays as the fallback** for copies with no shared word and no prose linking them,
   and its two selector entries come out: rule 6 now finds them from the pages, and two answers to
   one question is how rules drift. Fandom's two selector ids leave `RETIRED_IDS` for the same reason.

Verification: the built feed is unchanged at 214 events, the three survivors carry `mergedIds`, and a
browser load moves a seeded Fandom-selector mark onto Game8's id via the feed.
