# Battle pass windows as feed events — design

Date: 2026-10-16. Status: **shipped 2026-10-16** for Star Rail, ZZZ and Infinity Nikki
(`40d0dbe..c2cc685`, merged to `main`); see § Outcome for what changed from the plan, and TODO.md
for Endfield, Wuthering Waves and NTE. Sub-project 3 of 3.

Sub-project 3 of the owner's "usual repeatable events" request (sub-project 1: the
[built-in routines spec](2026-10-14-built-in-routines-design.md), whose § Scope item 3 holds the
owner's in-game readings; sub-project 2: the [cycle routines spec](2026-10-16-cycle-routines-design.md)).

## Problem

A battle pass runs for a dated window and its rewards are lost when it ends, so the reader wants
"ends in 3 days" in *Next up* and on the timeline. Only Genshin's pass reaches the feed today
(`Moontrace`, from Game8 and Fandom's event pages). The other games' event pages link to a pass
guide and state no dates (checked against every stored snapshot, 2026-10-16), so this is new
sources, not a parser fix.

## Decisions

Approved by the owner in conversation on 2026-10-16.

1. **An event per pass window**, start to end (owner chose "When it ends"), not a reset marker
   and not a version event.
2. **No new event type.** A pass is `other`, as `Moontrace` already is. A `pass` type would change
   `EventType`, the feed contract, and an older cached bundle would refuse the feed until it
   updated.
3. **Only dates a page states.** Five sources, each one page (§ Sources). Where a page dates a
   *version* rather than the pass, the event takes the version's window only when the link is
   stated — by the wiki (Endfield: "available until end of version") or by the owner in game
   (Infinity Nikki, below). Nothing else is inferred.
4. **A version stands in only where confirmed** (owner chose "Only where confirmed"). Infinity
   Nikki's Mira Journey has no dated page, and its `Version` table's 2.10 row ends October 29 —
   the day the owner read the pass ending (2026-10-16, "13d 19h" at 00:47 UTC). The event's summary
   says it follows the version and that this was confirmed in game.
5. **Not shipped** (§ Not shipped): Wuthering Waves' Pioneer Podcast and Oscillated Coral, NTE's
   Circle Bounty. Genshin's Battle Pass gets no third source.
6. **Past rows never reach the calendar.** The pass pages are histories; a row that ended before
   `ctx.now` is skipped, as the Fandom event parsers already do.
7. **Each source goes through the `add-game-source` path**: robots read and recorded in the
   `SOURCES` entry's comment, a fixture pinned with its `.expected.json`, the parse count checked
   against an independent count of the page, and a `docs/SOURCES.md` entry.

## Sources

| Source id | Page (all via `api.php?action=parse` on Fandom) | Emits |
|---|---|---|
| `hsr-fandom-nameless-honor` | honkai-star-rail.fandom.com `Nameless_Honor` | "Nameless Honor", each current or upcoming row — today 2026-09-28 → 2026-11-09 (4.6) |
| `zzz-fandom-city-fund` | zenless-zone-zero.fandom.com `New_Eridu_City_Fund` | "New Eridu City Fund" — today 2026-09-09 → 2026-10-19 (3.2) |
| `genshin-fandom-miliastra-pass` | genshin-impact.fandom.com `Miliastra_Pass` | "Miliastra Pass: <name>" — today "Silvery Moonlight Chronicle", 2026-09-23 → 2026-11-02 |
| `endfield-wikigg-protocol-pass` | endfield.wiki.gg, a stable version page (`Version` or its equivalent; never a per-version URL, which changes each patch) | "Protocol Pass" for the current version's window — today 2026-10-15 → 2026-11-25 (UTC+8) |
| `nikki-fandom-mira-journey` | infinity-nikki.fandom.com `Version` | "Mira Journey" for the current version's window — today 2.10, 2026-09-23 → 2026-10-29 |

Research quotes, page dates and robots findings, 2026-10-16:

- Nameless Honor: "Nameless Honor 2026-09-28 | September 28, 2026 | November 9, 2026 | 4.6"
  (page 2026-08-26; rows for June–September 2026, so kept per pass).
- City Fund: "New Eridu City Fund | September 9, 2026 | October 19, 2026 | 3.2" (page
  2026-09-04). Agrees with the owner's in-game end, Monday 2026-10-19.
- Miliastra Pass: "Silvery Moonlight Chronicle | September 23, 2026 | November 2, 2026" (page
  2026-06-16; rows transcluded, so newer than the page date).
- Endfield: the Protocol Pass page (2026-10-15) says "Protocol Pass: Ink Scroll is available until
  end of version"; the version is "2026/10/15 12:00 – 2026/11/25 06:00 (UTC+8)" and
  "2026/10/14 23:00 – 2026/11/24 17:00 (UTC-5)". The previous version, Dreamscape, ran to
  2026-10-14, which matches the pass the owner read ending then. The feed's "Season of Phantasia"
  is an Echoes of War season, not the pass.
- Nikki: "The Feather of Justice | 2.10 | September 23, 2026 | October 29, 2026 | 36 Days" (rows
  current to 2.10).
- Fandom's robots allow `/api.php?action=` for `*` (as recorded for the existing Fandom sources);
  endfield.wiki.gg's allow `/` for `*`. Each is re-read at build time and recorded in its entry.

**Precision.** Where the page gives a date and no time, the event is day-precise (Fandom's
tables). Where it gives times per server (Endfield's version window, UTC+8 and UTC-5), the event
is exact and carries `regionEnds`, as the Endfield wiki.gg source already does.

**Titles and IDs.** A title is the pass's name as the page gives it ("Nameless Honor",
"New Eridu City Fund", "Miliastra Pass: <name>") or, for a version-bound pass, the pass's name plus
nothing invented ("Protocol Pass", "Mira Journey"). Event IDs are game + title + start, so each
period is its own event and no existing ID moves. None of these titles occurs in the live feed
today, so `mergeEvents` has nothing to pair them with.

## Outcome (2026-10-16)

Three of the five shipped: `hsr-fandom-nameless-honor` and `zzz-fandom-city-fund` (parser
`fandomtable`) and `nikki-fandom-mira-journey` (parser `fandomversion`). Two did not:

- **Genshin's Miliastra Pass was already in the feed.** Fandom's Event page, an existing source,
  lists "Silvery Moonlight Chronicle" with the same window, and `mergeEvents` folded the new copy
  into it. The feed was unchanged, so the source was reverted rather than kept as a second copy —
  the same reason Genshin's Battle Pass got no new source. This section's claim that no title
  occurred in the live feed was wrong for this one.
- **Endfield's Protocol Pass has no stable dated page.** endfield.wiki.gg's robots disallow
  `/api.php` for `*` (a second `User-agent: *` group), so only `/wiki/` pages are open. On
  2026-10-16 `/wiki/Version` stopped at Dreamscape (ended 2026-10-14), the main page gave only
  Asia's start for Sanctuary of Ink, and the per-version page changes URL every patch. A start-only
  event cannot say when the pass ends, which is this feature's whole point, so it waits (TODO.md).
  The Protocol Pass page's own words are "Protocol Pass: Ink Scroll is now available until the end
  of this version" (its changelog), not the wording quoted above.

The ZZZ wiki's `robots.txt` answers our client with Fandom's challenge; the owner read it in a
browser on 2026-10-16 (standard Fandom file), recorded in the source's comment.

## Shape in code

Parsers are keyed by site template (AGENTS.md § Working on parsers). Two new templates:

- **A dated history table** on Fandom (name, start, end, version columns), read by one function
  that serves the three pass pages. It lives beside the other Fandom templates, recognised in
  `canParse` by its structure (the table's headings), never by finding a row.
- **A version table** (Fandom for Nikki; wiki.gg for Endfield), whose current row becomes one event
  titled by the source. The title and the stated link are per source — a small table in the
  parser module keyed by source id, each entry with its evidence (the wiki's sentence, or the
  owner's in-game confirmation and date) — so the claim "this pass follows the version" is written
  down once, beside the code that relies on it.

The plan settles module boundaries after dumping each page's structure; `fandom.ts` is already
1,069 lines, so a new template goes in its own module if it shares nothing with the event pages.

## Not shipped

| Game | Item | Why (research, 2026-10-16) |
|---|---|---|
| Wuwa | Pioneer Podcast | Fandom's `Pioneer_Podcast` stops at the pass starting 2026-02-05; Game8's guide has no dates |
| Wuwa | Oscillated Coral (resets with the version, owner in game) | No reliable version end: Game8's 3.7 page says "until November 11, 2026", its 3.8 page "Sep 30 – Nov 12"; Fandom's `Version` table stops at 3.5 |
| NTE | Circle Bounty | No page dates the pass; Fandom's `Version/1.4` dates the version, but the 1.2 pass ended hours before its version (playnews.gg), so the version is not a stand-in |
| Genshin | Battle Pass from Fandom's `Battle_Pass` | Already in the feed once, as `Moontrace` |

## Testing

- One fixture per source under `fixtures/<game>/`, with `.expected.json`, asserted byte-identical
  at a pinned `now`; past rows absent, the current row present with the dates quoted above.
- `canParse` true on each fixture and false on the other Fandom/wiki.gg fixtures (a template change
  fails loudly rather than reading zero).
- The Endfield event carries per-server ends; the Nikki event's summary names the confirmation.
- `bun run build:feed` against the fixtures adds exactly these five events and moves no other ID.

## Docs

`docs/SOURCES.md` (a section per source), `docs/INGESTION.md` (the two templates), AGENTS.md's
parser list where it counts parsers, TODO.md (sub-project 3 done; the not-shipped three as
follow-ups), a changelog entry in a follow-up commit.
