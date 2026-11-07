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
Character Test Runs row in the initially inspected snapshot covered a different
banner phase from the current Skirk / Escoffier trial, so those runs must not be
fused. After the automated refreshes through `4faf3c9`, Game8's row instead
starts 2026-10-13 and ends 2026-11-03, matching Fandom's named Skirk / Escoffier
phase. The owner reported both on the live server after the classification
release. This is now a confirmed same-phase duplicate: merge matches the two
source-identified trial families under its existing start guard and preserves
the absorbed ID through `mergedIds`. Different-phase fixture rows stay separate.

Next session should inspect how the current client handles expiration, existing
cycle/pass windows, and the consequences of a separate Miliastra lane. Game and
event IDs are persisted identities: moving rows between games must preserve
reader progress and existing IDs or supply an explicit migration. Discuss
approaches before implementing; no lane split, date change, state migration or
broader matching rule has been implemented or approved by this audit.

## Follow-up: lane check after Version 7.2 (2026-11-07)

The owner asked whether the Miliastra split held once a new version shipped: no
Genshin event under Miliastra, no Miliastra event under Genshin. **It held. No
row is in the wrong lane.** No code, data or date changed as a result of this
check; the open items below have no approved design.

Checked against the 2026-11-06 17:28 UTC refresh (`4bf4f01`), the first covering
7.2. The feed built from it, the deployed feed and the running app with Miliastra
on all agree: 15 live rows, Genshin 12, Miliastra 3. The eight other Genshin rows
in the feed had ended and were not shown.

| Lane | Rows | Evidence |
|---|---|---|
| Miliastra | Chronicle of Polyphony, Raiment Collection: Radiance Ablaze | Fandom type label and Fandom's `Miliastra Wonderland/Events` index; owner confirmed both in game |
| Miliastra | Starlight Voyage: Spontaneous Composition | Fandom type label and index; not started on 2026-11-07 |
| Genshin | Sacred Spirit Chronicle | Fandom `Battle Pass` label; owner confirmed in game |
| Genshin | To Temper Thyself Cycle 6, Test Run, The Forge Realm's Temper: Endless Swarm, Hour of Ruin, The Grand Defense, Where Kristall Roots Run Deep, Stygian Onslaught | Fandom type labels; not on the Miliastra index |
| Genshin | Encounter: Interlude of the Long Journey, Stress Block Smashing Project, Frames of Fierce Splendor | Labels do not settle the lane, so the articles were read: none mentions Miliastra. All three are stubs, and the last two are marked upcoming and may change |
| Genshin | Ley Line Overflow | Plain `In-Game` label; not on the Miliastra index |

The index lists exactly the three Miliastra rows above for 7.2, which is what
rules out a Miliastra event misfiled under Genshin or missing from the feed.
Dated rows in the Fandom snapshot history since 2026-10-15 also show no
disagreement between type label and article path. The owner stopped the in-game
walk here because it is slow to navigate, so the other Genshin rows have no
in-game confirmation.

### Open items, none fixed

1. **Day-precision ends can be hours wrong, in both directions.** Fandom's event
   table prints dates only, so the app resolves an end to that game-day's reset.
   The article pages publish the exact instant:

   | Row | App resolves to | Article states | Result (Europe) |
   |---|---|---|---|
   | Chronicle of Polyphony | 14 Dec 03:00 UTC | 14 Dec 03:59 server, 02:59:59 UTC | Correct |
   | Raiment Collection: Radiance Ablaze | 16 Dec 03:00 UTC | 16 Dec 05:59 GMT+8 on every server, 15 Dec 21:59:59 UTC | **About 5h late** |
   | Encounter: Interlude of the Long Journey | 15 Dec 03:00 UTC | 15 Dec 14:59 server, 13:59:59 UTC | About 11h early |

   The late direction is the harmful one: a reader leaving it to the last hours
   sees time remaining after the event has closed. The owner's in-game readings
   (37d 2h for both passes, 38d 21h for Raiment) agree with the articles. They
   remain rounded observations and must not be used to mint timestamps. The
   likely fix is reading exact times from article pages, which adds requests per
   refresh and so needs its own design and a look at § Scraping conduct.
2. **Wonderland Treasures has no row in either lane.** In game, `Wonderland
   Treasures - Polyphonic Harmony` appears in Genshin's event tab, 38d 13h 47m
   remaining around 00:12 UTC on 2026-11-07. It is probably the 7.2 counterpart of
   `Wonderland Treasures: Moonlight After the Rain`, which the owner placed under
   Miliastra above; that link is inferred from the shared name. If tracked it
   belongs in Miliastra despite where the game lists it. Neither source's event
   page names it. `Frosty Court`, which the owner read as a premium pull with the
   same time remaining, is also absent from both pages. Track or leave out: undecided.
3. **`Across the Frozen Wilds, Honing One's Edge` (2026-11-04 – TBA) is not in the
   feed.** The Fandom parser skips a row `parseFullRange` cannot date, and this
   range returns `null`. It is also not in the owner's event tab, so it may have
   been claimed already, or the wiki row may be wrong or early. Neither is
   established, so this is not yet a confirmed missing event. Recheck on a later
   refresh before changing the parser, which could also admit other TBA rows.
4. **A Game8-only Miliastra event would land under Genshin.** Game8 rows carry no
   lane label and this page mentions Miliastra only in its navigation menu. Every
   live Game8 row is currently also on Fandom and correctly placed, so nothing is
   affected today.
