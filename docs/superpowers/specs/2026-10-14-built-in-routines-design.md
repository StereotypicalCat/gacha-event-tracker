# More built-in routines, and tracking any one of them — design

Date: 2026-10-14. Status: **shipped 2026-10-16** (`612e0a2..23924db`, merged to `main`), every
entry verified in game by the owner except the two open in TODO.md. Sub-project 1 of 3 — see
§ Scope; sub-projects 2 and 3 shipped the same day — the [cycle routines spec](2026-10-16-cycle-routines-design.md)
and the [pass windows spec](2026-10-16-pass-windows-design.md).

## Problem

The owner asked for "the usual repeatable events" — weekly events, battle pass, shop resets — for
Genshin, Star Rail, ZZZ, Endfield, Infinity Nikki and NTE, and then Wuthering Waves. The app has one place these fit without
a new shape: built-in routines (`src/shared/routines.ts`, PRD F17), which shipped with two entries.

While designing it the owner added a second requirement: a reader must be able to **track or stop
tracking any single item** — not just a whole game's built-ins — and the same for every other thing
the dailies strip carries: a game's standing chore and repeating events such as Genshin's “To
Temper Thyself and Journey Far”. Their example: Endfield's weekly items, but not its Stock
Redistribution.

## Scope

The request split into three sub-projects, built in this order, each with its own spec and plan:

1. **This one** — more built-in weekly and monthly routines, sourced; per-item Track / Stop
   tracking; copy generalised from "weekly" to "weekly and monthly".
2. **N-week cycles** — a period unit anchored to a known start (Star Rail's endgame modes on a
   six-week rotation two weeks apart; ZZZ's two-week Shiyu Defense / Deadly Assault). A new stored
   shape, so it needs its own schema review.
   Facts in hand for it: Star Rail's Divergent Universe and Currency Wars share one points cap of
   18,000 per period (owner, in game, 2026-10-14), and at 03:49 CEST that day the period read
   5d 1h left — ending Monday 2026-10-19 at 05:00 CEST, the EU reset the app already uses.
   The period's length (two weeks per the wiki research) is what sub-project 2 must still source.
   Star Rail's three endgame modes, read in game by the owner at 01:52 UTC on 2026-10-14, each
   ending at a Monday reset (03:00 UTC) two weeks after the last:
   - Pure Fiction — 5d 1h → 2026-10-19
   - Forgotten Hall (Memory of Chaos) — 19d 1h → 2026-11-02, which agrees with the wiki's next
     Memory of Chaos opening `2026/11/02 04:00:00` server time (Forgotten Hall/Stages/4.6)
   - Apocalyptic Shadow — 33d 1h → 2026-11-16
   That is the six-week rotation staggered two weeks apart, with one anchor per mode.
   Wuthering Waves' Whimpering Wastes, read in game by the owner at 00:10 UTC on 2026-10-16:
   "Respawning Waters" refreshes in 10d 2h — Monday 2026-10-26 at the 03:00 UTC reset. The info
   box says only that the challenges and rewards of Respawning Waters: Chasm and Torrents "reset
   periodically", so the period's length is still to be sourced.
   Its Tower of Adversity Hazard Zone, read the same night: resets in 24d 2h — Monday 2026-11-09
   at the 03:00 UTC reset, which agrees with the 28-day chain found in research (Oct 12, Nov 9).
   ZZZ's endgame modes, read in game by the owner at 00:22 UTC on 2026-10-16:
   - Shiyu Defense — 2h 37m → Friday 2026-10-16 at 03:00 UTC, the reset to the minute
   - Deadly Assault — "7d" (no hours shown) → Friday 2026-10-23, presumably at 03:00 UTC
   - "Periodic Conquest" — 3d 2h → Monday 2026-10-19 at 03:00 UTC, so a weekly reset within it
   Both modes roll on Fridays, a week apart; that agrees with the "Friday every two weeks" source
   over the "every 15 days" one. Cycle lengths are still to be sourced — a reading after each
   reset would give them directly.
   NTE's Beyond the Rails, read in game by the owner at 00:34 UTC on 2026-10-16: "time remaining
   5d 20h 26m", and the game's own text says special routes "typically reset every 14 days". That
   ends Wednesday 2026-10-21 at 21:00 UTC — not the EU reset (04:00 UTC) but 05:00 UTC+8, the Asia
   server's reset on Thursday. So this cycle may end at one instant for every server, which
   sub-project 2 must model rather than assume a per-server Monday. "Typically" means the 14 days
   can bend; this settles the 14-days-vs-once-per-version conflict in favour of 14 days.
   NTE's Tycoon Incentive Fund, read in game by the owner on 2026-10-16: one pool shared by Pink
   Paws Heist, the Weekly Match in Volley Star, and idle earnings from Display Case exhibitions in
   the Going, Going, Gone collectibles warehouse. The in-game "Incentive Fund Guide" says it
   provides "up to 1000000 fons every 14 days", and the owner's pool reads 1,050,000. The owner
   then found why: the cap is raised by progress in the "Puka Membership Program", to at least
   1,100,000; the game does not show the maximum. So the target differs per player — 1,000,000 is
   the base, not the cap — and sub-project 2 must either let the reader set it or ship the base
   with a note saying so. allthings.how (2026-05-06) instead calls Pink Paws' 1,000,000 a weekly
   cap. Its timer, read at 00:43 UTC on 2026-10-16: "10d 2h / 14d" — a 14-day cycle ending Monday
   2026-10-26 at 03:00 UTC.
3. **Dated battle pass and shop windows** as feed events — source and parser work.
   One fact in hand: on 2026-10-14 at 03:45 CEST the owner read Endfield's current Protocol Pass
   as ending in 20h 15m — about 2026-10-15 00:00 CEST (2026-10-14 22:00 UTC), to the minute the
   countdown shows. A source still has to state it before an event is built from it.
   A second: at 01:55 UTC on 2026-10-14 the owner read Genshin's current Battle Pass as expiring in
   19d 1h — 2026-11-02 between 02:55 and 03:55 UTC, so most likely the 03:00 UTC (04:00 server)
   reset that Monday. The same holds: a source has to state it.
   A third: at 00:09 UTC on 2026-10-16 the owner read Wuthering Waves' Oscillated Coral shop, which
   stocks gacha pulls and resets with the version update, as resetting in 26d 10h — 2026-11-11
   between 10:09 and 11:09 UTC, a Wednesday, which reads as the next version's maintenance.
   A fourth: at 00:17 UTC on 2026-10-16 the owner read ZZZ's New Eridu City Fund season as ending
   in 3d 2h — Monday 2026-10-19 between 02:17 and 03:17 UTC, so the 03:00 UTC reset that day.
   A fifth: at 00:47 UTC on 2026-10-16 the owner read Infinity Nikki's current Mira Journey as ending
   in 13d 19h — Thursday 2026-10-29 between 19:47 and 20:47 UTC; not the Europe server's reset
   (02:00 UTC), so likely a version-wide end such as 20:00 UTC (04:00 UTC+8).

## Decisions

1. **Entries are added to `ROUTINES` in place.** No new module, no data file. The existing bar is
   kept without exception: each entry cites an `https` page that **states** the figure and the
   reset, with the date that page gives for itself (`asOf`, the wiki's last-edited date) and the
   day we read it (`checked`). An item no page states is not shipped and is listed in § Not shipped
   so nobody searches for it again.
   **Confirmed in game** (owner, 2026-10-14): when no page states an item the owner has checked in
   the game, it may still ship. It links the best page there is, and its `note` reads `Confirmed in
   game, YYYY-MM-DD.` — the figure is then visibly ours rather than the page's.
2. **A reset-only item is ticked once a period.** Spiral Abyss and Imaginarium Theater pages state
   the reset day and no completion target, so they are `measure: { kind: "days", required: 1 }` —
   "done this cycle" — rather than a star count we would be inventing.
3. **Ridu Weekly's target is corrected, its id kept.** 1,300 → 2,100 points, source moved from
   Game8 (2 Dec 2025, still says 1,300) to the Fandom page (31 Aug 2026), whose history shows the
   change on 2026-01-05. Ticks and numbers are stored under the id and the period start, so nothing
   stored moves; a reader at 1,500 this week now reads as short of the target, which is true.
4. **Per-item tracking — one new pref, `routinesHidden?: string[]`**, routine ids the reader stopped
   tracking one by one. Absent means none. It **narrows** the per-game rule and never widens it:
   a built-in is on the strip when its game is on (`routineRule`) and its id is not hidden. Hiding
   moves nothing the game's switch says, and a built-in shipped later for that game still arrives.
   Ticks and numbers stay stored.
5. **Tracking one built-in of a game whose built-ins are off turns the game on with only that
   one** (`trackRoutinePatch`): the game joins `routineGames` (via `setFor`), is recorded in
   `routinesAsked` so the strip does not ask again, and its siblings are added to `routinesHidden`.
   The reader asked for one item, not the game's list.
6. **One control for everything the strip carries — the strip's Edit panel.** Per game it lists the
   standing chore, then built-ins, then repeating events, each with **Stop tracking**; under each
   game **Track · N** lists what the game could carry and does not. Nothing new is stored for a
   chore (it writes `choresOn` / `choresOff` through `setFor`) or an event (the existing
   `progress.daily` override, goal removed with it as before). *Remove from dailies* and *Add an
   event* are renamed **Stop tracking** and **Track** so the three kinds read alike.
7. **Settings keeps every built-in reachable.** *Your own* lists every built-in of the games that
   are on, hidden ones included (marked *Not tracked*), each with Track / Stop tracking beside *Make
   it mine*. Without that list a hidden built-in of a game the reader has focused away from would
   be off with no way back.
8. **Copy says "weekly and monthly"** wherever built-ins are named: the strip's question, the
   settings switch and its per-game chips, *Your own*'s heading. "and", not "&", so markup and
   aria-labels read the same. The per-game tooltip quotes the **oldest** source date, since a game
   now has several.
9. **Readers who said yes to every game's built-ins get the new ones without being asked** — that
   is what the global switch says. Games with their first built-ins (Genshin, Star Rail, Wuthering Waves, NTE) are
   asked once, by the existing one-line question.
10. **Standard-banner pulls are one switch, off by default** (owner, 2026-10-16: "Users should be
    able to choose between only premium, or both"; the single switch chosen over per-item opt-out
    and a per-game switch). A shop that sells pulls gets two built-ins: its premium (limited) line,
    `pulls: "premium"`, offered like any other, and its standard line, `pulls: "standard"`, offered
    only when the new pref `standardPulls?: boolean` is true — absent is false, so an existing
    install gains nothing until it asks. `offered()` applies it below the game rule and per-item
    tracking: the Edit panel, *Your own* and the strip all see only what is offered, and Settings
    shows the switch (*Include standard-banner pulls*, nested under the built-ins switch) only when
    a listed game has a standard line, naming those lines in its hint. A test pins that every
    standard line has a premium twin in its game on the same period. `trackRoutinePatch` still
    hides every sibling, standard ones included, when a reader tracks one item of a game that is
    off: they asked for one item, so a later *Include* does not bring that game's standard line
    back on its own. Boopons count as premium — they pay for Bangboo pulls (owner, 2026-10-16).

## Entries

Weekly entries roll with the game's Monday reset (`startsOn: 1`) on the reader's server.

| Id | Title | Period | Measure | Source (as of) | Owner check |
|---|---|---|---|---|---|
| `routine:genshin:weekly-bosses` | Weekly Bosses | week | 3 runs | genshin-impact.fandom.com/wiki/Weekly_Boss (2026-08-21) | 3 cost-halving runs and "every Monday 4AM GMT+1" (EU) confirmed in game by the owner, 2026-10-16 |
| `routine:genshin:battle-pass-exp` | Battle Pass weekly EXP | week | 10,000 EXP | …/wiki/Battle_Pass (2026-01-08) | 10,000 confirmed in game by the owner, 2026-10-14 |
| `routine:genshin:bounties` | Reputation Bounties | week | 3 bounties | …/wiki/Bounties (2026-06-13) | 3 a week, counted apart from Requests, and a Monday reset ("next refresh in 3 days" on Thursday) confirmed in game by the owner, 2026-10-16 |
| `routine:genshin:requests` | Reputation Requests | week | 3 requests | …/wiki/Request (2026-06-13) | 3 a week, counted apart from Bounties, confirmed in game by the owner, 2026-10-16 |
| `routine:genshin:realm-depot` | Realm Depot: Realm Treasures | week | ticked once | …/wiki/Serenitea_Pot/Realm_Depot (2026-10-12) | page says weekly; the **Monday confirmed in game** by the owner, 2026-10-16 ("refreshes in 3 days 3 hours 3 minutes" at 23:57 UTC on 15 Oct → Monday 03:00 UTC) — decision 1; a shape, not a figure (decision 2) |
| `routine:genshin:paimons-bargains` | Paimon's Bargains: Intertwined Fates | month, 1st | 5 fates | …/wiki/Paimon%27s_Bargains (2026-08-23) | stock 5 and "refreshes in 16d" on 16 Oct (→ 1 Nov) confirmed in game by the owner, 2026-10-16 |
| `routine:genshin:paimons-bargains-acquaint` | Paimon's Bargains: Acquaint Fates | month, 1st | 5 fates (**standard**, decision 10) | …/wiki/Paimon%27s_Bargains (2026-08-23) | page: Acquaint Fate stock 5 for Masterless Stardust, beside the Intertwined line |
| `routine:genshin:spiral-abyss` | Spiral Abyss | month, 16th | ticked once | …/wiki/Spiral_Abyss (2026-08-29) | measure is a shape (decision 2); 3h to reset at 23:5x UTC on 15 Oct (→ the 16th) confirmed in game by the owner, 2026-10-16 |
| `routine:genshin:imaginarium-theater` | Imaginarium Theater | month, 1st | ticked once | …/wiki/Imaginarium_Theater (2026-09-01) | measure is a shape (decision 2); 16d 3h to reset (→ 1 Nov) confirmed in game by the owner, 2026-10-16 |
| `routine:hsr:echo-of-war` | Echo of War | week | 3 runs | honkai-star-rail.fandom.com/wiki/Echo_of_War (2025-10-17) | page is a year old; 3 runs and the Monday reset confirmed in game by the owner, 2026-10-14 |
| `routine:hsr:nameless-honor-exp` | Nameless Honor weekly EXP | week | 8,000 EXP | …/wiki/Nameless_Honor (2026-08-26) | **confirmed in game** by the owner, 2026-10-14 (decision 1): the page states no cap; Monday from Echo of War's page |
| `routine:hsr:embers-exchange` | Embers Exchange: Star Rail Special Pass | month, 1st | 5 passes | …/wiki/Embers_Exchange (2026-07-12) | page says monthly; the **1st confirmed in game** by the owner, 2026-10-14 (decision 1) |
| `routine:hsr:embers-exchange-standard` | Embers Exchange: Star Rail Pass | month, 1st | 5 passes (**standard**, decision 10) | …/wiki/Embers_Exchange (2026-07-12) | page: stock 5, `refresh=m`; the 1st as for the Special Pass line |
| `routine:zzz:ridu-weekly` | Ridu Weekly | week | **2,100** points (was 1,300) | zenless-zone-zero.fandom.com/wiki/Ridu_Weekly (2026-08-31) | decision 3; 2,100 and the Monday reset (3d 2h on Friday 00:17 UTC) confirmed in game by the owner, 2026-10-16 |
| `routine:zzz:bounty-commissions` | Bounty Commissions (was "Lost Void Bounty Commissions") | week | 8,000 points | …/wiki/Hollow_Zero/Bounty_Commission (2025-03-21) | page is old; Lost Void page (2026-04-05) still says weekly; 8,000 shared by Lost Void and Enigma of the Labyrinth, Monday reset (3d 2h at 00:2x UTC Friday), confirmed in game by the owner, 2026-10-16 — title and unit follow the game |
| `routine:zzz:notorious-hunt` | Notorious Hunt | week | 3 runs | …/wiki/Notorious_Hunt (2026-02-26) | page states 3 a week, no day — Monday from Ridu Weekly's page; "up to 3 times per week" confirmed in game by the owner, 2026-10-16 |
| `routine:zzz:city-fund-exp` | New Eridu City Fund weekly EXP | week | 10,000 EXP | …/wiki/New_Eridu_City_Fund (2026-09-04) | **confirmed in game** by the owner, 2026-10-16 (decision 1): the page states no cap; Monday from Ridu Weekly's page |
| `routine:zzz:signal-shop-tapes` | Signal Shop: Encrypted Master Tapes | month, 1st | 5 tapes | …/wiki/Signal_Shop (2026-09-09) | page says monthly; the **1st confirmed in game** by the owner, 2026-10-16 ("refresh in 16d" at 00:19 UTC → 1 Nov) — decision 1 |
| `routine:zzz:signal-shop-master-tapes` | Signal Shop: Master Tapes | month, 1st | 5 tapes (**standard**, decision 10) | …/wiki/Signal_Shop (2026-09-09) | page: Fading Signal stock 5, `refresh=m`; the 1st as for the Encrypted line |
| `routine:zzz:signal-shop-boopons` | Signal Shop: Boopons | month, 1st | 5 Boopons | …/wiki/Signal_Shop (2026-09-09) | Bangbuck section, `refresh=m`; the owner confirmed in game, 2026-10-16, that Boopons sit there and asked for them as a second monthly target (they pay for Bangboo pulls); the monthly limit is on the discounted 20-Bangbuck line, "restock in 16d" (→ 1 Nov), confirmed in game by the owner, 2026-10-16 |
| `routine:endfield:weekly-routine` | Weekly Routine | week | 10 points | endfield.wiki.gg/wiki/Weekly_Routine (2026-04-11) | unchanged; title, target and the EU Monday reset hour confirmed in game by the owner, 2026-10-14 |
| `routine:endfield:focus-commissions` | Etchspace Salvage: Focus Commissions | week | 3 commissions | endfield.wiki.gg/wiki/Etchspace_Salvage (2026-09-01) | Monday from the wiki's own weekly-reset box, not this page; not yet confirmable in game (owner, 2026-10-14) — see TODO.md |
| `routine:wuwa:weekly-challenge` | Weekly Challenge | week | 3 claims | game8.co/games/Wuthering-Waves/archives/453471 (2026-09-30) || 3 a week ("3/3") confirmed in game by the owner, 2026-10-16 |
| `routine:wuwa:pioneer-podcast-exp` | Pioneer Podcast weekly EXP | week | **12,000** EXP (the wiki says 10,000) | wutheringwaves.fandom.com/wiki/Pioneer_Podcast/2026-02-05 (2026-07-03) | the v3.1 season page, the wiki's newest, is stale: **12,000 confirmed in game** by the owner, 2026-10-16 (decision 1) |
| `routine:wuwa:weekly-activities` | Weekly Activities | week | 6,000 points | game8.co/games/Wuthering-Waves/archives/605757 (2026-06-18) | 6,000 is the top milestone, not a stated cap; 6,000 max and the two modes (Fantasies of the Thousand Gateways, Phantasma Dreamland Rhapsoda) confirmed in game by the owner, 2026-10-16 |
| `routine:nikki:mira-journey-exp` | Mira Journey weekly EXP | week | 8,000 Journey EXP | infinity-nikki.fandom.com/wiki/Mira_Journey (2026-09-24) | the wiki answers again (2026-10-16); 8,000 confirmed in game by the owner, 2026-10-16 |
| `routine:nikki:realm-of-breakthrough` | Realm of Breakthrough | week | 2 trials | …/wiki/Realm_of_Breakthrough (2026-01-01) | two trials, once a week each; not yet confirmable in game (owner, 2026-10-16: story progress) — see TODO.md |
| `routine:nikki:resonance-revelation` | Resonance Store: Revelation Crystals | month, 1st | 5 crystals | …/wiki/Tranquility_Droplet (2025-12-26) | page marks the stock monthly; "monthly limit of 5" and "resets in 16d" (→ 1 Nov) **confirmed in game** by the owner, 2026-10-16 (decision 1) |
| `routine:nikki:resonance-resonite` | Resonance Store: Resonite Crystals | month, 1st | 5 crystals (**standard**, decision 10) | …/wiki/Tranquility_Droplet (2025-12-26) | page: stock 5, `refresh=m`; the 1st as for the Revelation line |
| `routine:nte:season-pass-exp` | Season Pass weekly EXP | week | 12,000 EXP | gamewith.net/nte/74371 (2026-09-03) || 12,000 confirmed in game by the owner, 2026-10-16 |
| `routine:nte:anomaly-pilgrimage` | Anomaly Pilgrimage | week | 3 claims | allthings.how/nte-weekly-activities-guide-every-reset-task-in-neverness-to-everness/ (2026-05-06) | sources conflicted (Game8's boss list, 2026-10-10: "once per week" per boss); **3 in total confirmed in game** by the owner, 2026-10-16 |
| `routine:nte:city-stamina` | City Stamina | week | 700 stamina | allthings.how/…-neverness-to-everness/ (2026-05-06) | page says "full bar to spend", no figure; **700 a week confirmed in game** by the owner, 2026-10-16 (decision 1) |
| `routine:nte:realm-of-greed` | Realm of Greed | week | ticked once | allthings.how/…-neverness-to-everness/ (2026-05-06) | owner asked for it, 2026-10-16; payout scales, so a shape (decision 2); the weekly reset confirmed in game ("Gold Heist resets every Monday at 5:00"), 2026-10-16; one payout a week is the guide's |
| `routine:nte:special-city-commission` | Special City Commission | week | ticked once | same page | owner asked for it; one claim a week and the weekly timer confirmed in game, 2026-10-16 |

The sentence each figure rests on:

- Weekly Bosses — "spend 30 Resin to claim the rewards from the first three weekly bosses …
  reset at 4 AM server time every Monday."
- Battle Pass — "There is a weekly cap of 10000 EXP that can be obtained from daily and weekly
  missions which resets on 4 AM server time each Monday."
- Bounties — "A total of 3 bounties can be completed each week"; Requests — "A total of 3
  requests across all nations can be completed each week." Monday: genshin-impact.fandom.com/wiki/Reset.
- Realm Depot — Realm Treasures: "This shop refreshes weekly"; the stock totals 13,100 Realm Currency.
  The day is the owner's in-game timer.
- Paimon's Bargains — "It resets on the 1st day of each month"; Intertwined Fate stock 5.
- Spiral Abyss — "will reset once a month, occurring on the 16th of each month."
- Imaginarium Theater — "The first day of every month, the Imaginarium Theater will automatically reset".
- Echo of War — "three times a week … refresh every Monday at 04:00 AM (Server Time)."
- Nameless Honor — no page states the cap; the owner read 8,000 weekly EXP in game on 2026-10-14.
  The page says only that 'players can complete various weekly and "This Period" missions'.
- Embers Exchange — the stock table marks Star Rail Special Pass (stock 5) `refresh=m`, monthly; no
  day. The owner's in-game countdown on 2026-10-14 (03:51 CEST, 18d 1h) ends 1 Nov 02:51–03:51 UTC,
  around Star Rail's EU reset at 03:00 UTC — the 1st.
- Echo of War, in game — the owner read 3 attempts and 5d 1h to reset at 03:49 CEST, 2026-10-14:
  Monday 05:00 CEST.
- Ridu Weekly — "A total of 2,100 points can be accumulated each week … refreshing each Monday with server reset."
- Bounty Commissions — "refresh every Monday at 04:00"; table tops out at 8,000.
- Notorious Hunt — "a total of 3 challenges can be completed at no Battery Charge cost per week"; in
  game, "You can earn Notorious Hunt rewards up to 3 times per week" (owner, 2026-10-16).
- New Eridu City Fund — no page states the cap; the owner read 10,000 weekly EXP in game on 2026-10-16.
  The page's only 10,000 is the Premium Plan's bonus City Fund EXP, which is unrelated.
- Signal Shop — Fading Signal: "the monthly limits reset at the same time as other exchanges"; Encrypted
  Master Tape stock 5, `refresh=m`. No day; the owner's in-game timer gives the 1st.
  Bangbuck: Boopon (20 Bangbuck) stock 5, `refresh=m`; a second, unlimited Boopon line costs 40.
- Weekly Routine — "reset at 4:00 server time every Monday"; fixed tasks "always amount to 10 points total".
- Focus Commissions — "3 Focus Commissions will be available every week".
- Weekly Challenge — "You can only claim rewards from Weekly Challenges up to 3 times per week …
  The weekly limit is reset every Monday at 4AM of your server time."
- Pioneer Podcast — "Weekly Highlights reset on Monday at 4:00 AM (Server Time)"; "Podcast EXP from
  'Seasonal Specials' quests do not count towards the 10,000 weekly cap."
  The owner read 12,000 in game on 2026-10-16; the page's 10,000 is from v3.1 and no newer page exists.
- Weekly Activities — "Every Monday at 4:00 AM (Server Reset)"; "you can earn 6000 points by
  completing stage 13".
- Mira Journey — "Players can earn up to a limit of 8000 Journey EXP a week." Reset — "The Weekly
  Reset occurs every Monday at 04:00 (4:00 AM) server time", renewing "Mira Journey weekly tasks"
  and "Realm of Breakthrough challenge refresh".
- Realm of Breakthrough — "Currently there are two Trials … Players can challenge Wish Master Chigda
  & Guardian Beast Whirls once per week".
- Resonance Store — Tranquility Droplet inventory: Revelation Crystal, price 100 (`discount=40`), stock 5,
  `refresh=m`. No day; the owner's in-game timer gives the 1st.
- NTE Season Pass — "There is a strict cap of 12,000 Experience Points per week … this cap only
  applies to Daily and Weekly quests"; "Weekly quests reset every Monday at 5:00 AM Server Time."
- Anomaly Pilgrimage — "The reward pool is shared, so you get three reward claims total per week, not
  three per boss"; "The window closes at the Monday reset." The owner confirmed 3 in total in game.
- Realm of Greed — "pays out a large Fons lump sum once per week"; overview table: "1 reward claim".
- Special City Commission — "The Old Mailbox in your second apartment delivers a once-per-week Fons
  bounty"; "The reward is gated to a single claim per week."
- City Stamina — overview table: "Full bar to spend"; "If it has refilled to its full cap, the weekly
  reset has already triggered". The owner read 700 weekly in game, 2026-10-16.
- All of these: "a tight weekly loop that resets every Monday at 5:00 AM server time".

## Not shipped

Looked for on 2026-10-14 and not shipped. Each is a candidate the owner may know a source for.

| Game | Item | Why |
|---|---|---|
| Genshin | Stygian Onslaught | Tied to version releases, not a week or month |
| Star Rail | Forgotten Hall (Memory of Chaos), Pure Fiction, Apocalyptic Shadow | Six-week rotations, not weeks or months → sub-project 2; the owner's in-game end dates are in § Scope. **Shipped 2026-10-16** as cycle built-ins ([cycle routines spec](2026-10-16-cycle-routines-design.md)) |
| Star Rail | Divergent Universe / Currency Wars points | **Shipped 2026-10-16 as a weekly built-in**: the pool has been weekly since 4.2, and the "two weeks" was left over from 3.7 ([cycle routines spec](2026-10-16-cycle-routines-design.md), decision 7). Originally read as a two-week period, not a week → sub-project 2. Owner, in game, 2026-10-14: the two modes share one cap of 18,000 points per period, and the current period ends Monday 2026-10-19 at Star Rail's EU reset (05:00 CEST) |
| Endfield | Stock Redistribution | "Some items may also refresh weekly" — no figure |
| Endfield | Protocol Pass weekly missions | Missions change every week; no fixed target or EXP cap stated, and the owner found none in game (2026-10-14) |
| Endfield | Algorithmic Memories, Credit Store, Arsenal Exchange | No figure; Beta-era; daily store; a shop rotation, not a chore |
| Nikki | Merit Arena, Pinnacle Contest | No wiki page (2026-10-16); Merit Arena's weekly caps change per version and only a fan account gives numbers; Pinnacle Contest runs in half-month periods → sub-project 2 |
| ZZZ | Shiyu Defense, Deadly Assault | Multi-week cycles → sub-project 2; the owner's in-game dates are in § Scope. **Shipped 2026-10-16** as two-week cycle built-ins ([cycle routines spec](2026-10-16-cycle-routines-design.md)) |
| Wuwa | Oscillated Coral exchange (gacha pulls) | Resets with each version update, not a week or month — the owner confirmed this in game, 2026-10-16. A dated window → sub-project 3 (§ Scope) |
| Wuwa | Afterglow Coral exchange, Souvenir Stores, Tactical Hologram shops | No limit, or no stated reset |
| Wuwa | Simulation Training, Forgery | Cost Waveplates; no weekly cap |
| Wuwa | Tower of Adversity Hazard Zone (28 days), Whimpering Wastes | Multi-week → sub-project 2; the owner's in-game dates for both are in § Scope. **Tower of Adversity shipped 2026-10-16** as a 28-day cycle; Whimpering Wastes has no fixed length and stays unshipped ([cycle routines spec](2026-10-16-cycle-routines-design.md) § Not shipped) |
| NTE | Tycoon Incentive Fund (Pink Paws Heist, Volley Star weekly match, Display Case idle earnings) | A 14-day cycle by the game's own guide, not a week → sub-project 2 (§ Scope). The guide this branch cites calls Pink Paws' cap weekly; the game disagrees. The cap also differs per player (Puka Membership Program). **Shipped 2026-10-16** at the base cap with a note ([cycle routines spec](2026-10-16-cycle-routines-design.md), decision 5) |
| NTE | Lost Exchange | Single launch-era source; nothing to count |
| NTE | Beyond the Rails | 14-day cycle → sub-project 2; the owner's in-game date is in § Scope. **Shipped 2026-10-16**, on Asia's clock ([cycle routines spec](2026-10-16-cycle-routines-design.md), decision 3) |

**One finding outside this change:** Game8's NTE boss page (2026-10-10) says the weekly timer
resets "every Monday at 4AM", while `games.ts` has NTE on 05:00 (Game-Time-Master, neverness.gg,
GameWith). If 04:00 is right, NTE's day keys are off by an hour. That needs checking in the game,
and changing it is a day-key change under AGENTS.md § Event IDs. Not touched here.
Re-checked 2026-10-16: Game-Time-Master's `game-data.js` (last changed 2026-10-10) still has NTE
Europe at `dailyReset: "05:00"`, `Etc/GMT-1`, as `ccc4eb6` took it; it lists daily resets only.
GameWith's season-pass page, which the NTE entry already cites, puts the *weekly* quests on
"every Monday at 5:00 AM Server Time". So Game8 stands alone, and 05:00 stays.
**Overturned by the game, 2026-10-16.** At 00:40 UTC on Friday the owner read the Special City
Commission's weekly timer as 3d 2h. A reset at 04:00 UTC (what `games.ts` has for Europe) would
have read 3d 3h; the reading lands on **Monday 03:00 UTC** — 05:00 CEST. Two explanations fit and
agree until the clocks change on 2026-10-25: (1) Game8's 04:00 on a fixed UTC+1, or (2) 05:00 on a
Europe server that follows Central European summer time, which allthings.how hints at ("Europe
uses BST or CET equivalents") and Game-Time-Master's fixed `Etc/GMT-1` would miss. After 25 Oct a
weekly timer tells them apart: (1) puts the reset at 03:00 UTC still, (2) at 04:00 UTC. Not
changed with the built-ins — it re-labels logged ticks (AGENTS.md § Event IDs) — but in its own
`fix(games)` commit on this branch.
The game's own text leans to (2): Realm of Greed says "Gold Heist resets every Monday at 5:00"
(owner, 2026-10-16). With the reset seen at 03:00 UTC, that 5:00 is UTC+2 — Central European
summer time — where (1) would print 4:00. One reading after 2026-10-25 still confirms it.
**Then the fund's timer ruled (2) out, 2026-10-16.** At 00:43 UTC the Tycoon Incentive Fund read
10d 2h, ending Monday 2026-10-26 at **03:00 UTC** — the day *after* the clocks change, where (2)
would put 04:00 UTC (10d 3h). The one reading that fits every observation — both timers and the
game's "5:00" — is (3): **05:00 on a Europe server fixed at UTC+2**, i.e. 03:00 UTC all year, as
Infinity Nikki's Europe server already is in `games.ts`. That is a one-number change
(`resetOffsets.europe: 2` for `nte`), still a day-key change and still outside this branch.

## Testing

- `test/routines.test.ts`: every entry parses and cites a dated `https` page (existing); a per-game
  table pins each title, period and measure to § Entries; hiding narrows the rule and moves
  nothing else; `hiddenAfter` and `trackRoutinePatch`, including tracking one of an off game;
  `routinesHidden` survives `restorePrefsValue` with junk dropped.
- Standard pulls (decision 10): every standard line has a premium twin on the same period; standard
  lines are left out of `activeRoutines` unless asked for, and nothing else moves; `standardPulls`
  survives `restorePrefsValue` with junk dropped. `test/controls.test.tsx`: the switch is offered
  beside the built-ins switch, names the lines, reads its pref, and is absent when no listed game
  has a standard line.
- `test/edit-dailies.test.tsx`: chore, built-ins and events listed per game in that order, each
  with Stop tracking; Track · N counts all three kinds; a game with only standing items gets a group.
- `test/custom-ui.test.tsx`: a hidden built-in stays listed in *Your own*, marked and trackable.

## Docs

PRD F17 (built-ins list and tracking), PRD F12's Edit panel paragraph (renamed controls),
DATA-MODEL (`routinesHidden` and `standardPulls` in the prefs block and the built-in tasks paragraph), and a changelog
entry once the commit exists.
