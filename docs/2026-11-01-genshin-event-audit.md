# Genshin event audit — owner walkthrough

Recorded 2026-11-01. Research and owner confirmations only; no implementation or
deduplication design approved during the walkthrough. The owner subsequently
resumed work, chose source-driven classification, and requested a Genshin About
toggle for TCG events. The proposed implementation design is
`superpowers/specs/2026-11-01-content-classification-design.md`; approval of that
design was subsequently approved; implementation and verification are recorded
in that design and its linked plan.

## Confirmed Genshin matches

The owner read these from the game, confirming the following tracker matches.

| In-game event | Tracker entry | Notes |
|---|---|---|
| Tabletop Troupe: A Gathering on Adventure's Eve | Free Limited 5-Star Anniversary Selector | Tartaglia, Nilou, Varesa and others; requires completing the new story. |
| Overflowing Favor | Overflowing Favor | Double rewards. |
| Carefree Snowball Fight | Carefree Snowball Fight | Same name. |
| Stygian Onslaught — Luminous Battlefront | Stygian Onslaught | Named season of the current run. |
| To Temper Thyself and Journey Far | To Temper Thyself and Journey Far | The other source calls this run Cycle 5. |
| Across the Frozen Wilds, Honing One's Edge | Free Standard 5-Star Anniversary Selector | Jean, Dehya, Mona and others; separate from the limited selector. |
| Test Run — Skirk, Escoffier, etc. | Test Run - Skirk, Escoffier, Dahlia, Candace, Mika | Trials change with the featured character banners. |
| The Godforsaken Frostlands | The Godforsaken Frostlands | New-region exploration rewards. |
| A Rekviem for the Underworld | A Rekviem for the Underworld | Archon Quest completion rewards; owner saw 2d 11h remaining. Separate from the selector unlocked by that quest. |
| The Forge Realm's Temper — Clever Stratagems | The Forge Realm's Temper: Clever Stratagems | TCG event; owner saw 2d 20h remaining. |

Rainbow's End: Resplendent Starlight is **not confirmed**: the owner thinks it
probably appeared and was already claimed. Do not turn this into a confirmed
completion mark or use it to remove the event.

The owner found the name **Moontrace** through Battle Pass → bottom-left icon,
with 1d 0h remaining. They want battle passes represented under cycles rather
than duplicated as event tasks. Inspect the existing pass/cycle implementation
before designing this change. Rounded remaining times above are observations,
not exact UTC boundaries; they must not be used to mint end timestamps.

**Travelers' Tales: Snowstride Chapter** appears to the owner to be an update to
existing content rather than a timed event. No timed-event match was established.

## Miliastra Wonderland separation

The owner wants Miliastra Wonderland tracked separately from Genshin, potentially
as its own game/lane, and confirmed these belong there:

- Wonderland Treasures: Moonlight After the Rain
- Starlit Gala
- Silvery Moonlight Chronicle
- Starlight Voyage: Heart Unbound
- Raiment Collection: Warmth of a Sunny Day

Wonderland Treasures has no established one-to-one tracker match; it may be an
umbrella notice. Starlit Gala and Starlit Gala: Wonderland Selects have **not**
been confirmed as duplicates. Do not merge them based on their shared name.

## Findings and remaining work

The local built feed inspected during research was generated on 2026-10-22.
Parsing the cached sources already folds the two selector pairs, the Stygian
season and the To Temper cycle into their respective survivors. Moontrace's
Battle Pass prefix was addressed by the previous parser change. See
`superpowers/specs/2026-10-14-genshin-duplicates-design.md` and
`../src/ingest/merge.ts` for that work.

This walkthrough established no additional duplicate pair requiring a new merge
rule. It identified content classification and potentially stale display issues:
Miliastra content under Genshin, pass placement, and older event rows. The older
Character Test Runs row covers a different banner phase from the current Skirk /
Escoffier trial, so those two runs must not be fused.

Next session should inspect how the current client handles expiration, existing
cycle/pass windows, and the consequences of a separate Miliastra lane. Game and
event IDs are persisted identities: moving rows between games must preserve
reader progress and existing IDs or supply an explicit migration. Discuss
approaches before implementing; no lane split, date change, state migration or
broader matching rule has been implemented or approved by this audit.
