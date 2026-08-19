# SOURCES.md — event sources for the games still missing

A source assessment for the games named in `docs/FEEDBACK.md` § P1 that still have no adapter.
Written 2026-08-18. **Acted on 2026-08-19**: four of the games below were built, one turned out to be
blocked rather than merely awkward, and the rest were declined. Each section keeps its original
reconnaissance and carries its outcome at the top, because the reasoning is what stops the next pass
re-deriving it.

What changed on 2026-08-19, in one paragraph. **Built:** Girls' Frontline 2 (`iopwiki`, new parser),
Stella Sora (`stellasorawiki`, new parser), Chaos Zero Nightmare (`game8`, no parser work) and
Umamusume (`game8`, after widening its section and column vocabulary). **Built on 2026-08-19 after the
permission was read in a browser:** Nikke, whose `robots.txt` turned out to be the standard Fandom
file. **Declined:** Punishing: Gray Raven, Guardian Tales, Azur Lane and
Aether Gazer, all as proposed. One thing not on the original list also came out of the pass: the
**Infinity Nikki source is stale** and has no reachable replacement — see § 11.

Verdicts here are proposals. Once one is acted on — built or declined — the *decision* belongs in
`AGENTS.md` § Scraping conduct, whose table exists so a source is not re-litigated every pass and
which `.github/ISSUE_TEMPLATE/feature_request.yml` points readers at. This file is the working, not
the ruling.

## Method

Every page below was fetched from this machine with the refresh runner's own `User-Agent`
(`gacha-event-tracker/1.0 (+https://github.com/StereotypicalCat/gacha-event-tracker)`), one or two
requests per host, `robots.txt` first. No browser-shaped headers, no proxy, no JS execution —
anything that only answers a browser is treated as closed, per the `uma.moe` precedent. Where an
existing parser could plausibly read a page, it was run against the fetched bytes offline
(`src/ingest/parsers/index.ts`) rather than guessed at.

Two things this method cannot tell you, and both matter:

- **Whether a host answers the GitHub Actions runner.** game8.co does not (`AGENTS.md` § Scraping
  conduct). The only hard evidence we hold is what CI has actually committed: `git log` on
  `snapshots/` shows `github-actions[bot]` landing **arknights.wiki.gg**, **endfield.wiki.gg** and
  **bluearchive.wiki** (Miraheze). Fandom sources have never refreshed in CI, because `robots.txt`
  itself is challenged from a datacentre address and the gate fails closed — and as of 2026-08-19
  that challenge covers every Fandom wiki from *any* address tried here, not just CI's.
  Of the 2026-08-19 additions, **Stella Sora** is Miraheze and so is the one likely to refresh in CI;
  **IOP Wiki** is permissive but unproven; **Chaos Zero Nightmare** and **Umamusume** are game8 and
  therefore blind in CI by construction.
- **Whether a page will still look like this in six weeks.** Each recommendation below names the
  assertion `canParse` should make, so a redesign fails the source loudly instead of emptying a lane.

## Where P1 stands

| Game | Status |
|---|---|
| Arknights, Reverse: 1999, Blue Archive, Persona 5X | **Built** (2026-08-17/18) |
| **Girls' Frontline 2, Stella Sora, Chaos Zero Nightmare, Umamusume** | **Built** (2026-08-19) |
| Nikke | **Built** (2026-08-19), once the `robots.txt` was read in a browser — see § 3 |
| Azur Lane | Declined on conduct (`azurlane.koumakan.jp` `ai-input=no`), and both Fandom alternatives are dead archives |
| Punishing: Gray Raven, Guardian Tales, Aether Gazer | Declined — see §§ 6, 7, 9 |
| Silver Palace | Unreleased |

## Summary of findings

| Game | Best source found | Parser | Refreshes in CI? | Verdict |
|---|---|---|---|---|
| Girls' Frontline 2 | `iopwiki.com/wiki/GFL2_Events` | new (`iopwiki`) | likely (permissive robots, unproven) | **BUILT** 2026-08-19 — best data quality of anything here |
| Stella Sora | `stellasora.miraheze.org/wiki/Main_Page` | new (`stellasorawiki`) | yes (Miraheze proven) | **BUILT** 2026-08-19 — banners only, from the main page |
| Nikke | `nikke-…-international.fandom.com/api.php?…page=Event` | `fandom`, third template | **no** — Fandom robots fails closed | **BUILT** 2026-08-19 — story events *and* dated pickup banners, with an evidenced reset clock |
| Chaos Zero Nightmare | `game8.co/games/Chaos-Zero-Nightmare/archives/559899` | **existing** `game8` | **no** — game8 202s the runner | **BUILT** 2026-08-19 — no parser work, fixture-only lane |
| Umamusume | `game8.co/games/Umamusume-Pretty-Derby/archives/536311` | `game8` + section and column vocabulary | **no** | **BUILT** 2026-08-19 — cost more than "two header words"; see § 5 |
| Punishing: Gray Raven | `grayravens.com/wiki/Events` | — | — | **Decline for now** — one dated string on the whole page |
| Guardian Tales | `guardian-tales.fandom.com/wiki/Events` | — | — | **Decline** — wiki stopped dating events in 2025 |
| Azur Lane | none | — | — | **Still declined** — the Fandom alternatives are 2021 archives |
| Aether Gazer | — | — | — | **Do not build. The game is shutting down.** |
| Silver Palace | — | — | — | Unreleased; beta only |

---

## 1. Girls' Frontline 2: Exilium — BUILT 2026-08-19

**Source:** `https://iopwiki.com/wiki/GFL2_Events` (IOP Wiki, the Girls' Frontline universe wiki)

**Conduct.** `robots.txt` is two lines — `User-agent: *` / `Crawl-Delay: 20` — with no `Disallow`
anywhere and no named-agent block. No `Content-Signal` header. Our 6-hour floor is three orders of
magnitude inside a 20s crawl delay. The response carries `Last-Modified`, so `If-Modified-Since`
will do real work here.

**Shape.** An `<h3>` per event, each followed by `<table class="gf-table event-period">`. All 46 of
those tables share one header row, exactly:

```
Title | Period (start/end) | Server | Type | Comment
```

Cells look like this, and this is the best date material in the project after wiki.gg:

```
Amidst Wings of Gray | 2025-01-16 17:00 - 2025-02-06 02:59 (UTC) | EN | Character Event | …
```

Explicit UTC, exact precision on **both** boundaries, no timezone inference anywhere. Each period
cell also carries an ICS widget with `icsStart` / `icsEnd` in `YYYYMMDDTHHMMSS` — a second,
independently generated copy of the same instants, useful for cross-checking a parser rather than as
the primary read.

**Coverage.** 145 rows, of which 51 are `Server: EN`. A naive regex parsed **every** EN period cell —
zero unparsed, which is the count check `AGENTS.md` § Silent drops asks for. Latest EN rows:

| Event | Start | End |
|---|---|---|
| Dawnforger — Part 2 | 2026-07-16 13:00 | 2026-08-05 22:59 |
| Unto the Radiance | 2026-07-16 13:00 | 2026-08-05 22:59 |
| **Moonshroud Requiem** | **2026-08-06 13:00** | **2026-08-26 22:59** (live today) |

**Hazards, and what to do about them.**

- **CN and JP rows sit in the same tables as EN.** This is the `akwiki` CN-column problem verbatim:
  the Chinese schedule runs a year ahead and a CN date on a Global calendar is a confidently wrong
  date. The `Server` column decides — publish `EN`, skip everything else. Servers seen on the page:
  `CN`, `EN`, `JP`.
- **`Betas` is a section, not an event type.** The page's `<h2>`s are `Main Events`, `Minor Events`,
  `Betas`, `References`. Closed beta rows are dated and would parse cleanly into a calendar of things
  nobody can do. Fence on the heading.
- **Titles are localised per row.** The `Title` cell on a CN row is Chinese; on the EN row it is the
  English name. Because we only take EN rows this resolves itself, but a parser that took the section
  heading as the title would inherit the CN/EN slash pair (`Exotic Cadence/Amidst Wings of Gray`).
  Take the title from the EN row's own cell.
- **`canParse` should assert the header row** — `Title` + `Period (start/end)` + `Server` — so a
  template change fails the source rather than emptying the lane.

**Work:** new parser module `src/ingest/parsers/iopwiki.ts`, a `gfl2` `GameId`, a `GAMES` entry, one
`SOURCES` entry, a fixture and a test. `Type` maps onto our `EventType` reasonably —
`Character Event` → banner, `Combat Event` / `Special Event` / `Main Story Event` → event,
`Popularity Contest` → other.

---

## 2. Stella Sora — BUILT 2026-08-19, from the main page and not the banner list

**Source:** `https://stellasora.miraheze.org/` — a Miraheze wiki, so the same call as Blue Archive and
hololive Dreams: `/wiki/` is the surface `*` is allowed, `/w/` and `/*?action=` are disallowed. CC
BY-SA 4.0, no `Content-Signal`, no `Crawl-delay` for us. Miraheze is the one host family we have
proof answers the CI runner.

Three pages, and the difference between them is the whole finding:

- **`/wiki/Events`** — a list of event names with **no dates at all**. Useless on its own.
- **`/wiki/Banner_List`** — two clean tables, `Image | Name | Start | End`, with full wall clocks:
  `2026-08-18 03:00:00` → `2026-09-08 02:59:00`. 28 and 29 rows, current. **But the page states no
  timezone anywhere** — no `UTC`, no offset, nothing. This is the `bluearchive.wiki` hazard exactly
  (`AGENTS.md` § Blue Archive, third bullet): reading a bare wall clock as UTC invents the fact that
  matters, and rounding to a day does not save it because the start's day is half an event ID.
- **`/wiki/Main_Page`** — a `Current Banners` module that emits the same instants as real
  `<time datetime="2026-08-03T21:00-07:00">` elements. Zone stated, machine-readable, `exact`
  precision.

The two agree: `2026-08-03T21:00-07:00` is `2026-08-04T04:00Z`, and `Banner_List` prints exactly
`2026-08-04 04:00:00` for that banner. That is strong evidence the list is UTC — and it is still an
inference, not a statement, so the honest source is the **main page module**, at the cost of covering
only the four live banners instead of the full history.

**Caveats.** Banners only; the wiki dates no story events. Sourcing a wiki's main page is more fragile
than sourcing an article, so `canParse` should assert the `stellasora-home-current__banners` container
and the presence of `<time datetime>` children, and fail loudly if either goes. Note also that some
banner names link to red links (`/wiki/A_Breezy_Romance/2026-08-03?action=edit&redlink=1`) — a
`?action=` URL this wiki's robots.txt disallows, so the same rule `holodori.ts` follows applies:
refuse a href with a query and fall back to the page URL.

**Worth asking:** if the wiki's editors state the zone on `Banner_List`, that page becomes the better
source immediately — full coverage, no template dependency.

---

## 3. Nikke — BUILT 2026-08-19

> **Outcome: built.** The precondition this section set — read the wiki's `robots.txt` in a browser —
> was met on 2026-08-19, and it is the standard Fandom file: no `Disallow: /` for `*`,
> `/api.php?action=` explicitly allowed, and only `Special:`, `User:`, `User_talk:`, `Template:`,
> `Template_talk:`, `Help:` and `UserProfile:` refused. The AI crawlers it names (`GPTBot`, `CCBot`,
> `OAI-SearchBot`, `ImagesiftBot`) are not us. Recorded in `AGENTS.md` § Fandom.
>
> Three notes for whoever touches it next, all of them corrections or additions to what follows:
>
> - **The 403 is on `robots.txt` only.** `api.php?action=parse` answers our own User-Agent with a
>   `200` from a datacentre address; it is the robots file that is challenged. So the adapter could
>   be written and fixture-backed from here, and what it cannot do is pass the gate at refresh time.
> - **The zone is in the column header, not the cell** — `Start(UTC+9)` / `End(UTC+9)`. That makes
>   the header load-bearing: a table that stops naming its zone is refused rather than read as UTC.
> - **Story-event starts carry no clock, only their ends do.** The start keeps the day the page
>   printed rather than being shifted nine hours into the previous one, which is the FGO rule applied
>   to the opposite gap. Pickup banners carry a clock on both sides and convert fully.
>
> The `resetOffsets` / `resetHourLocal` win this section predicted was real and shipped with the
> game: UTC+9 for every region, rolling at 05:00.

## 4. Chaos Zero Nightmare — BUILT 2026-08-19; the cheapest adapter available, and a ninth blind source

**Source:** `https://game8.co/games/Chaos-Zero-Nightmare/archives/559899` ("List of All Events")

Among the games still missing, **only Umamusume and CZN have a Game8 wiki hub at all** — probes of
`game8.co/games/{Goddess-of-Victory-Nikke, Nikke, Girls-Frontline-2-Exilium, Punishing-Gray-Raven,
Azur-Lane, Guardian-Tales, Stella-Sora, Aether-Gazer}` all returned 404. Those games exist on Game8
only as news article hubs, which are not schedules.

**The existing parser already reads it.** Run offline against the fetched bytes:

```
parser game8 canParse: true
events: 4
 - Following the Fox's Footsteps      2026-05-27 → 2026-06-17  (day/day)
 - Beach Cafe Festival                2026-07-29 → 2026-09-30  (day/day)
 - Chasing the Remanants of Light     2026-07-29 → 2026-09-08  (day/day)
 - Virtual Tactical Simulation Hilde  2026-07-29 → 2026-08-19  (day/day)
```

The page lists six current events; the two the parser skips (`Full-Scale Offensive Season 3`,
`Virtual Tactical Simulation - Yuki`) both print `Start Date: -`. No start means no event ID, so
skipping them is the rule working, not a silent drop. Page last updated 2026-08-11.

So this is a `SOURCES` entry, a `czn` `GameId`, a fixture and a test — no parser work at all.

**The cost is honest and should be stated in the commit:** it becomes the ninth game8 source, and
game8 returns `202` with a bot-management body to the Actions runner, so this lane will be built from
a checked-in fixture in CI from day one and will go stale within a patch cycle unless the user runs
`bun run refresh` themselves. `freshness()` will say so in the footer, which is what that disclosure
is for — but adding a game that can only ever be as fresh as someone's last manual run is a decision,
not a detail. It also worsens the per-host arithmetic in § Scraping conduct: nine game8 pages per
cycle to one host.

Alternatives checked and worse: `gamewith.net/chaoszeronightmare/71099` has the right table shape but
is stale (its "latest events" are April–May 2026); `czn.gg` is a WordPress site whose
`/category/current-events/` is a blog feed, not a schedule, and whose `robots.txt` disallows
`anthropic-ai` and `Claude-Web` by name (not us, but a signal about the site's posture).

---

## 5. Umamusume — built, and the estimate below was wrong

> **Outcome (2026-08-19): BUILT**, off the stable `List of All Banners` page as recommended. Two
> corrections to what follows, both worth having before the next Game8 page is assessed:
>
> - **"A few characters" was wrong.** Teaching `COL_TITLE` the word `Banner` and `COL_RANGE` the word
>   `Availability` gets you **zero events**. The page's schedule sits under `List of All Banners` →
>   `All Current Banners`, which the *section* vocabulary did not match either, and its back
>   catalogue sits under `Previous Banners`, which `previous events` does not match — so without
>   that exclusion the finished rows would have gone straight onto the calendar. Beyond that, the
>   current-banners table lays the Standard and Paid schedules side by side inside one `<table>`
>   under a spanning label row, and that row is *plausible* enough to resolve both columns at
>   indices no data row has. `readColumnTable` now decides the header by what it produces, trying
>   row 1 only when row 0 produced nothing.
> - **The blast radius was measurable, and it was zero.** The worry below — that widening a parser
>   eight sources share starts matching tables it currently ignores — is right in principle and was
>   settled by measurement rather than by regenerating `.expected.json` until the tests agreed: every
>   pinned fixture *and* every live snapshot was parsed before and after, and no existing source's
>   output changed by a single event. Do that diff on any future change to `game8.ts`; it costs one
>   script and it is the only thing that distinguishes a safe widening from a silent one.



`uma.moe` stays declined; nothing about the Turnstile gate has changed. Two other surfaces exist.

**gametora.com** (`/umamusume/events/story-events`) — cleared in `AGENTS.md` already. The page embeds
`__NEXT_DATA__` with a clean per-server dataset:

```json
{"id":1018,"url_name":"story-event-18","name_en":"Days Flying By","start_en":1787090400, …}
```

53 events, `start_en` epoch seconds, current through **2026-08-18** (today's event). Deterministic,
no HTML parsing at all. But there is **no end timestamp in the payload** — every event would land
`endsAt: null`, `endPrecision: "unknown"`. That is a correct value, not a wrong one, but a lane of
start-only events answers none of the questions this app exists for.

**game8.co/games/Umamusume-Pretty-Derby/archives/536311** ("List of All Banners") is a stable URL —
unlike the monthly `August 2026 Release Schedule` pages (`613161`), whose URL changes every month and
which a static `SOURCES` registry cannot follow. It carries:

```
Banner | Rating | Availability
Seeking the Pearl (Rocket☆Star) | ★★★★☆ | 8/12/2026 - 8/21/2026
```

Our `game8` parser returns **0 events** from it, and the reason is narrow: `COL_TITLE` is
`/^(.*\b)?events?$/i` so `Banner` misses, and `COL_RANGE` knows `availability period` but not bare
`Availability` or `Availability (UTC)`. Teaching it those two words is a few characters — but
`game8.ts` serves eight live sources, so widening its column vocabulary can start matching tables on
Genshin, HSR, ZZZ, WuWa, NTE, Nikki, P5X and Endfield that it currently ignores. If it is done, it is
its own commit, with every existing `.expected.json` regenerated **and re-verified against the live
pages**, not just regenerated to make the tests agree with the new behaviour.

Add the game8 CI blindness on top and this is a "yes, but not next" — worth doing after GFL2 and
Stella Sora, and worth doing as two commits (parser vocabulary, then the source).

---

## 6. Punishing: Gray Raven — decline for now

`grayravens.com` is a Miraheze wiki and the community's officially supported fansite; conduct is fine
(`/wiki/` allowed, `/w/` and `?action=` disallowed, `Crawl-delay` only for named bots). The data is
the problem.

`/wiki/Events` is a single patch guide — "Ongoing Events" is one version's content, written as prose.
Stripped of markup, the **entire 626 KB page contains exactly one date range**:

```
Duration: July 17th to August 18th 2026.
```

Ordinal day, year on the second boundary only, one event per six-week patch. `/wiki/PGR_Roadmap` adds
a `Patch | Est. Release | …` table — an estimate, and a start with no end. The Fandom wiki is worse:
`Events` does not exist, `Upcoming Content` is 2025-era and says its dates are "ESTIMATED", and the
search API returns nothing for `intitle:Event`.

An adapter here would publish one guessed-ish event per patch. Decline, and recheck if grayravens
ever puts the schedule in a table.

---

## 7. Guardian Tales — decline

`guardian-tales.fandom.com/wiki/Events` fetches and parses fine. It contains **no 2026 date at all** —
the newest dated entry across `Events` and `Guardian_Tales/Version_history` is 2025, and the wiki's
own front page advertises 8 active users. This is the `bluearchive.fandom.com` failure in
`AGENTS.md` § Scraping conduct: a source that parses cleanly to nothing live, which would put an
empty lane on the calendar and report a broken source forever.

The official site (`guardiantales.com`) serves no `robots.txt` (404, so no restriction) but is a
Next.js SPA carrying `<meta name="robots" content="noindex">` with no schedule surface in the HTML.

---

## 8. Azur Lane — still no source

The two Fandom wikis the community points at as alternatives to the declined `azurlane.koumakan.jp`
are both dead:

- **`blhx.fandom.com`** ("the authoritative database on Azur Lane's EN server"). `robots.txt` served
  `200` and allows `/api.php?action=`, so conduct is clear — but `Event_Calendar` and
  `Event_Information` both stop in **2021**. The newest event on the calendar is "Ying Swei's Spring
  Travels, Feb 04 2021".
- **`azurlane-archive.fandom.com/wiki/Events`** has `Current Events` / `Upcoming Events` /
  `Previous Events` headings with nothing under any of them.

The live schedule is on koumakan, which said `ai-input=no`. Nothing found here changes that verdict —
worth a row in `AGENTS.md` recording that the Fandom alternatives were checked and are archives, so
the next person does not check them again.

---

## 9. Aether Gazer — do not build; the game is ending

Game8, published 2026-07-09, reporting the developer's own Bilibili statement:

> Aether Gazer developer YongShi shared an official statement on Bilibili confirming that the game
> will receive no further content updates once Version 5.2 rolls out on July 23, 2026.

with a dated wind-down: refunds for unused Transfer Flowers 6 Aug – 6 Sep 2026, a final "With You"
update 17 Sep 2026, and **store listings and download access removed 17 Oct 2026**. Global keeps
updating only until it catches up with CN.

The wiki matches. `aethergazer.miraheze.org/wiki/Event_Guide_List` is an image gallery of guide links
with **no dates on it at all** — the unsupportable image-grid shape — the site was last edited 12 July
2026, and its main page carries a note from the owner about the wiki's uncertain future.

A lane that will be empty by winter, built on a wiki that does not publish dates. Skip it, and record
why so the request does not come back.

---

## 10. Silver Palace — unchanged

Still unreleased. The Dichotomy Beta ran 23 July – 13 August 2026; no launch date announced;
projections point at late 2026 / early 2027. Nothing to scrape, as `docs/FEEDBACK.md` already says.

---

## 11. Infinity Nikki — a live source exists, and one fact is missing from it

This game already has an adapter, which is why it was not assessed on 2026-08-18. It should have
been. `game8.co/games/Infinity-Nikki/archives/487445` fetches, parses, and passes every test — and
the page itself says `Last updated on: August 31, 2025`, with **zero** occurrences of the string
`2026`. Seven events parse out of it, five with `endsAt: null`, which the app renders as
live-with-unknown-end indefinitely. A year-old event presented as current is precisely the failure
this product exists to prevent, and it arrives through a source that looks perfectly healthy to the
runner: a stale page is not a broken one.

**A live replacement was found on 2026-08-19, and it is nearly right.**
`infinitynikki.fandom.com` 301s to `infinity-nikki.fandom.com`, whose `robots.txt` was read in a
browser and is the standard Fandom file — same permission as Nikke (§ 3). The wiki is maintained:
pages edited as recently as 2026-08-17, and its `Event` page mentions 2026 seven hundred and
thirty-one times. The page is shaped exactly as we would want:

```
Current Events / Upcoming Events / Permanent Events / Past Events   (h2 headings)
<table class="article-table">  Event | Duration | Description | Type
   Deep Breakthrough    July 20, 2026 04:00 – August 10, 2026 03:49   ...   Double Rewards
```

Full dates with the year on both sides, a wall clock on both sides, a description, and the source's
own event type. Better material than the Game8 page has ever carried.

**The missing fact is the timezone, and it is missing in an interesting way.** The Duration column
names no zone. What the page *does* say, elsewhere and in prose:

- version launches are dated `(UTC-7)` — "Version 2.1 goes live on January 29 (UTC-7)";
- `Rewards reset daily at 04:00 (Server Time)`;
- and the durations themselves run `04:00` → `03:59`, which only lands on a reset boundary if the
  column is server-local.

That is a strong circumstantial case for UTC-7 and it is still circumstantial. It matters more than
usual because the offset moves the *day*: `July 16, 2026 20:00` read as UTC-7 is
`2026-07-17T03:00Z`, and the start's day is half of every event ID this game will ever have.

**Four options, and this is the repository owner's call:**

| Option | What it costs |
|---|---|
| **(a) Leave the Game8 lane** | A knowingly stale lane, carried only by the footer's freshness disclosure. The status quo, and the worst of these |
| **(b) Build the Fandom source at day precision**, taking the printed date and dropping the clock | Loses a stated clock; invents nothing. Treats the cells exactly as every Game8 date is already treated. **Recommended** |
| **(c) Build it at exact precision, assuming UTC-7** | Almost certainly correct, and an assumption we would be unable to falsify from the page. If wrong, every date is hours out and some days are wrong |
| **(d) Retire the game** | Drops a `GameId` that prefixes every completion key its readers hold, with no server-side recovery |

**(b) has a precedent tension worth stating rather than glossing.** `AGENTS.md` § Blue Archive
rules that unzoned wall clocks are "deliberately unparsed", and that "rounding to a day does not save
it". That ruling was made about tables which additionally *did not say which server they described*.
Here the wiki is the Global one for a game with a single global service, and the printed date is
being taken at face value in exactly the way `game8` dates already are — Game8 states no zone either,
and the whole day-precision mechanism in `clockFor` exists to resolve such a boundary on the reader's
own server. If (b) is chosen, that rule needs amending to say which case it governs, because as
written the two conflict.

Asking the wiki's editors to state the zone on the Duration column would settle it outright, and is
cheaper than any of the above.

## What every one of these costs, beyond the source

Adding a game is never only a `SOURCES` entry:

- a `GameId` in `src/shared/schema.ts` — an enum value that becomes the first segment of every
  completion key for that game, forever;
- a `GAMES` entry in `src/shared/games.ts` (name, short, hue, studio, `dailyTasks`), plus
  `resetOffsets` / `resetHourLocal` **only where the source states the clock** — Nikke's is evidenced,
  Stella Sora's is not stated on the page we would read;
- a fixture in `fixtures/<game>/` and a test asserting parsed output, one commit per game
  (`docs/FEEDBACK.md` P1 step 4);
- the lane arriving switched off for existing readers via `adoptNewLanes`, which is automatic but
  worth remembering when checking the app after a build.

## Recommended order

Steps 1 through 5 were done on 2026-08-19, and step 6's declines are now written into `AGENTS.md`
§ Scraping conduct. What is left is not a queue of sources any more — it is two decisions:

1. **Infinity Nikki** (§ 11) — choose between four options for a lane whose current source is a year
   stale and whose live replacement states no timezone on its schedule column. Not a research task;
   the research is done and the recommendation is option (b).

Below that, in descending order of value: re-check `grayravens.com` if it ever puts its schedule in
a table, and re-check Azur Lane if `koumakan` ever drops `ai-input=no`. Neither is worth a pass
until something changes upstream.

## Appendix — reproducing the checks

```bash
UA='gacha-event-tracker/1.0 (+https://github.com/StereotypicalCat/gacha-event-tracker)'

# conduct
curl -sS -A "$UA" https://iopwiki.com/robots.txt
curl -sS -A "$UA" -D - -o /dev/null https://stellasora.miraheze.org/wiki/Main_Page   # Content-Signal?

# the pages
curl -sS -A "$UA" https://iopwiki.com/wiki/GFL2_Events                > gfl2.html
curl -sS -A "$UA" https://stellasora.miraheze.org/wiki/Main_Page      > stellasora.html
curl -sS -A "$UA" 'https://nikke-goddess-of-victory-international.fandom.com/api.php?action=parse&page=Event&prop=text&formatversion=2&format=json' > nikke.json
curl -sS -A "$UA" https://game8.co/games/Chaos-Zero-Nightmare/archives/559899 > czn.html

# does an existing parser read it? (offline, once a source id exists)
bun run parse czn-game8-events czn.html --json
```

Facts stated above that a future reader may want to re-check, with how they were established:

| Claim | How it was checked |
|---|---|
| game8 has no wiki hub for Nikke, GFL2, PGR, Azur Lane, Guardian Tales, Stella Sora, Aether Gazer | `HEAD https://game8.co/games/<Name>` → 404 for each, 200 for Umamusume-Pretty-Derby and Chaos-Zero-Nightmare |
| The `game8` parser already reads the CZN page | ran `game8Parser.parse` against the fetched bytes: 4 events, 2 correctly skipped for a missing start |
| `fandom.ts`, `akwiki`, `wikigg`, `bawiki`, `holodori` cannot read the new pages | `canParse` returned `false` for every combination tried |
| CI can fetch wiki.gg and Miraheze | `git log --name-only -- snapshots/` — `github-actions[bot]` commits carry `arknights-akwiki`, `endfield-wikigg`, `ba-bawiki` |
| A Fandom `robots.txt` 403 means the source is skipped, not failed | `src/ingest/robots.ts` `RobotsCache.load` — `status >= 400` other than 404/410 → `usable: false` |
