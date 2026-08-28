# Event Clock

Live and upcoming events across your gacha games, sorted by what expires next.

You play three or four gacha games. Each has its own calendar, none of them talk to each other, and
the only question that actually matters — *what runs out first?* — takes four browser tabs to
answer. This does it in one screen.

No account. No login. What you've finished, what you're partway through, how much work you reckon
each event is, and which day of a daily you've ticked off are saved in your browser and never leave
your device.

## Status

Usable, and mostly keeping itself up to date. The parsing pipeline and the interface work end to
end, a scheduled job refreshes the wiki sources twice a day, and the whole thing builds, serves,
containerises and deploys. The Game8 lanes still need a manual refresh — see below. The database and
review queue are specified but not built.

| Piece | State |
|---|---|
| Event schema, date parsing, Game8 parser | Built, tested |
| Twenty sources across nineteen games | Built, tested |
| Your own games and events, one-off or repeating | Built, tested |
| Cross-source merge and conflict detection | Built, tested |
| Input sanitization at the ingest boundary | Built, tested |
| Scheduled refresh — robots, snapshots, commit-on-change | Built, tested offline |
| Web interface, daily checklists, offline support | Built |
| Static server, Docker image, GitHub + GitLab CI | Built |
| SQLite, review queue | Specified in `docs/`, not built |

The feed is still a static JSON file rather than a database read: the refresh job commits the raw
pages it fetched, CI rebuilds the feed from them, and a clean checkout with no snapshots falls back
to the checked-in fixtures — so the build stays offline and reproducible either way.

**The scheduled refresh does not reach every source.** game8.co answers the GitHub Actions runner
with a bot-management `202` instead of the page, so the nine Game8 sources only move when someone
runs `bun run refresh` by hand from an address it will talk to. The wiki sources refresh on schedule
as intended. `docs/SOURCES.md` records which hosts answer the runner and which do not; the footer
shows when each lane was last refreshed, so a stale one is visible rather than silent.

## Try it

Live at **<https://stereotypicalcat.github.io/gacha-event-tracker/>**, deployed from `main` by the
Pages job below.

Or run it yourself:

```bash
bun install
bun run dev        # build, then serve on :3000
```

Then open <http://localhost:3000>.

Or with Docker:

```bash
docker build -t event-clock .
docker run --rm -p 3000:3000 event-clock
```

The image build runs typecheck and tests, and parses only checked-in fixtures — no network, so it is
reproducible and a wiki being down never breaks it.

## Commands

```bash
bun test                  # full suite, offline, no network
bun run typecheck         # tsc --noEmit
bun run build             # feed + css + js + html into public/
bun run build:feed        # regenerate public/data/events.v1.json from snapshots, else fixtures

# Fetch the sources. Makes real requests, so read "Conduct" first.
bun run refresh --dry-run             # plan only: no requests, no writes
bun run refresh --only genshin-game8-events

# Run one source against its fixture and print what it yields
bun run parse genshin-game8-events fixtures/genshin/game8-events-2026-08-14.html
bun run parse nte-game8-events     fixtures/nte/game8-events-2026-08-14.html --json
```

## How it works

```
game wikis ─► fetch ─► parse ─► sanitize ─► merge ─► validate ─► gate ─► feed ─► browser
               │         │         │          │                   │                 │
          robots, 6h, per-site  untrusted  per-game        hold anything    localStorage:
          conditional,  parser    text     corroboration   uncertain for   what you've done,
           snapshots            bounded    and conflicts   human review    day by day if it
                                                                            repeats daily
```

**Parsers are deterministic code.** There is no LLM anywhere in the pipeline — no API key, no
inference, no per-run cost. A source that cannot be parsed reliably does not get an adapter, rather
than getting a model that guesses at it.

**Three layers, so sources multiply cheaply.** A *parser* understands one site template (one Game8
parser serves every Game8 page). An *adapter* binds a URL and a game to a parser. *Merge* reconciles
several sources for the same game. Adding a source for a site already covered is one registry entry.

**Nothing is guessed.** Every date function returns null rather than inventing a missing year or
end date. Sources really do publish "July 10, 2026 - Permanent" and "Jul. 24, 2026 - End of 4.6";
those keep their real start and report no end, rendered distinctly from an event ending far away —
never filled in with a plausible-looking date.

That last rule is the whole product. A missing event sends you to a wiki; a confidently wrong end
date makes you miss content. Given the choice, this ships nothing rather than a guess.

## Games

| Game | Source |
|---|---|
| Genshin Impact | Game8 |
| Honkai: Star Rail | Game8 |
| Wuthering Waves | Game8 |
| Zenless Zone Zero | Game8 |
| Neverness to Everness | Game8 |
| Persona 5: The Phantom X | Game8 |
| Chaos Zero Nightmare | Game8 |
| Umamusume: Pretty Derby | Game8 |
| Arknights: Endfield | Game8 + wiki.gg |
| Arknights | arknights.wiki.gg |
| Blue Archive | bluearchive.wiki |
| Reverse: 1999 | Fandom |
| Fate/Grand Order | Fandom |
| Goddess of Victory: Nikke | Fandom |
| Infinity Nikki | Fandom |
| Girls' Frontline 2 | IOP Wiki |
| hololive Dreams | holodori.wiki |
| Stella Sora | stellasora.miraheze.org |
| Honkai Impact 3rd | arustats.com |

No event counts here on purpose: they change every refresh, and a number in
this file that nobody updates is a number that lies. The app's header counts
what is live right now. Infinity Nikki currently yields nothing — its source
page has not moved in over a year — which is why the header says eighteen
games rather than nineteen.

Honkai Impact 3rd is the one estimated lane. arustats.com publishes a version
grid rather than dated events, so its events carry a much lower confidence than
a date-stating source, and any real HI3 source outranks it the moment one is
added.

Game8 uses a different page template for almost every game — label/value detail tables, column
tables, rowspan Start/End pairs — and four different date formats between them. One parser handles
all of it; each game costs a registry entry.

Endfield is the first game with two sources. wiki.gg publishes machine-readable ISO timestamps with
one timer per server region, so its events carry exact times and per-region ends — it outranks Game8
and wins when they disagree. Merge caught two real disagreements between them, each 70 hours apart on
the end date; those are flagged rather than averaged.

Its Game8 page yields only two events because most of it genuinely has no dates — every `Duration`
row reads "Permanently Available" and its version grid shows `07/16` with no year. The two dated
events hide in a combined cell (`Period: 08/09/26 - 08/30/26 During the event...`), which is where
the `MM/DD/YY` parser earns its place.

Endfield is still the only game with two sources; the rest have one each.

## Adding a source

1. Check `robots.txt` and the site's terms. If automated access is forbidden, stop — find another
   source.
2. Capture the page once into `fixtures/<game>/<source>-<YYYY-MM-DD>.html`.
3. Reuse an existing parser if the site is already covered; otherwise write one implementing
   `SourceParser`.
4. Add an entry to `SOURCES` in `src/ingest/adapters/index.ts`.
5. Write the expected output and a test. Then check a few events against the live page by hand — a
   passing test only proves the parser agrees with a file you wrote yourself.

Full walkthrough in `docs/INGESTION.md`, or run the `add-game-source` skill.

## Dailies

Some things are not one job with a deadline. A login campaign is twenty small jobs on twenty
separate deadlines, and a day you miss is gone whatever you do afterwards — which a single "done"
tick cannot express.

So events that repeat get a checklist instead: today's tick, a strip of every day in the run showing
what you got and what you missed, your streak, and how many chances are left. Past days stay
editable, because people tick up later and a checklist you can't correct stops being trusted after
the first mistake.

Alongside them sits **today's dailies** — commissions, sanity, daily training — one tick per game.
No wiki publishes those, so they are a fixed list in the app rather than scraped data, and they are
the only thing on the page that expires tonight rather than next patch.

Both roll over at **04:00 server time** in your region, not midnight, because that is when the games
roll over. Finishing at 02:00 still counts as yesterday.

Repeating events are recognised from what the source actually printed — a login event type, or
wording like "daily", "check-in", "7-day". Nothing is assumed from a game's habits, and an event
whose end was never announced gets a day count rather than a checklist of invented length.

That guess is only a starting point. Open any event and you can say **it repeats daily** — the
grind whose page never prints the word still gets a checklist — or dismiss one the wording caught
by mistake. If you would rather it never guessed, **Spot daily events automatically** in the
settings turns detection off and leaves only what you marked yourself; it discards nothing, so your
ticks and streaks are still there if you turn it back on. Anything you mark joins today's dailies at the top of the page, so ticking it off is one
tap rather than a trip back into the event.

## Your own games and events

No calendar covers everything, and a source misses things. So you can add a
game the app does not track, and events under it or under any game it does.

Your dates are yours: they are never presented as coming from a wiki, they
carry no source link because there is no page to send a sceptic to, and they
travel in your export. Like everything else here, your browser holds the only
copy.

### How often it comes round

An event you add states its **cadence** — asked before any date, because the
answer decides which dates are even worth asking for:

| | What it asks for |
|---|---|
| **one-off** | a start, and an end you are allowed not to know |
| **daily / weekly / monthly** | a start, and nothing else |
| **custom** | a start, an end, and how it repeats |

A preset carries no window. Weekly means the week *is* the window — each one
runs until the next opens — so there is no end date to type and no ignorance to
admit. That is the whole reason the presets exist: a weekly reset has no end
date, and a form that asks anyway is asking something with no honest answer.

Under **custom** you say whether it starts again the moment it ends, or after a
wait, and the cycle length is measured from the dates you already gave rather
than asked for a second time. State it yourself if the first window does not
describe the rest.

One rule is stored; the occurrences are worked out as they are needed. Each one
is an ordinary event everywhere in the app — its own countdown, its own tick,
its own checklist and streak — so clearing this fortnight's Abyss does not mark
next fortnight's. The lists show the one running and the one after it; the
timeline draws the whole rhythm.

**An occurrence does not have to state its end.** With none, it runs until the
next one opens — a boundary entailed by the interval you typed, not a date the
app invented to fill a field. That distinction is what lets a repeating event
count down at all instead of sitting there permanently live.

Changing a schedule you have already ticked against strands those ticks: the
occurrences are keyed by their own dates, and moving the dates moves the keys.
Nothing is rewritten behind you, and nothing is deleted — the form counts what
would be stranded and says so before you save. Renaming costs nothing.

## Sorting

Two orders, and the toggle sits with the list rather than in settings:

- **Ending soonest** — the default, and the reason this app exists.
- **Doing first** — what you're partway through, floated to the top. Ticking a daily counts as
  "doing it" without your having to say so twice.

Sorting only ever *groups*. Deadline order survives inside every group, so choosing an order can
never cost you the one thing you came for.

## Offline

The app works with no network. A service worker caches the shell and webfonts, and serves the last
feed it downloaded when the network is gone — countdowns keep running off your device clock. Being
offline is shown in the header and above the footer, because stale data must never look current.

It installs to a home screen as a standalone app.

## Updates

Because the shell is cached, a tab left open keeps running the version it loaded — so when a newer
one has been fetched and is ready, the app says so and offers to reload. You choose the moment: the
only thing a reload costs is your place on the page. Everything you have marked, typed or ticked
lives in your browser, not in the bundle, so it survives untouched. Dismiss it and the offer comes
back next time you open the app.

## Conduct

Sources are community wikis, treated as a guest would: `robots.txt` honoured, a descriptive
`User-Agent` with a contact URL, one request per source per six hours, conditional requests, and raw
snapshots cached so iteration never re-fetches. Every event links back to its source.

`bun run refresh` enforces all of that in code rather than leaving it to good intentions: the
six-hour floor is checked per source, there are no retries (a retry is a second request), and a
`robots.txt` that cannot be read means *do not fetch* rather than *assume yes*. Text scraped from a
page is sanitized at the ingest boundary before it reaches the feed, the browser or your disk.

## Found a problem, or want something?

- **[Report a problem](https://github.com/StereotypicalCat/gacha-event-tracker/issues/new?template=bug_report.yml)**
  — a wrong date, a missing event, a lost tick, anything the app got wrong.
- **[Request a feature](https://github.com/StereotypicalCat/gacha-event-tracker/issues/new?template=feature_request.yml)**
  — including a game it does not cover yet, which is the most common ask by a distance.

Both are forms rather than a blank box, for one reason: nothing you mark, type or tick ever leaves
your browser, so there is no account and no server-side record for anyone to look up afterwards.
Whatever the report says is all there is. The bug form arrives with the footer's "event data last
refreshed" line already filled in, because a stale calendar and a genuinely wrong date look
identical from the outside and only that line tells them apart.

If a date looks wrong, **open the event and check its source link first.** This app rearranges what a
wiki published; it does not compile schedules. When the wiki says the same thing, the fix belongs
there — though it is still worth reporting, since a game with a consistently wrong source may need a
better one.

Blank issues are still open for anything that fits neither form. The templates themselves live in
[`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE).

## Documentation

| Document | Covers |
|---|---|
| `AGENTS.md` | Working agreements, domain rules, conventions (`CLAUDE.md` points here) |
| `docs/PRD.md` | What this is, who for, what's out of scope |
| `docs/ARCHITECTURE.md` | Process shape, routes, deployment |
| `docs/DATA-MODEL.md` | Event schema, SQLite tables, client storage |
| `docs/INGESTION.md` | Parser/adapter/merge layers, pipeline stages, review gate |

## CI

Both `.github/workflows/ci.yml` and `.gitlab-ci.yml` run the same gates on every push — typecheck,
tests, and a feed sanity check — then build and publish a container image from the default branch.
GitHub Actions can also deploy to Pages, but that needs two one-time steps it cannot do for itself —
the default `GITHUB_TOKEN` is not allowed to create a Pages site:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables:** add `DEPLOY_PAGES` = `true`.

Until then the `pages` job is skipped and the pipeline stays green. Pages is unavailable for private
repositories on the free plan. Both steps are done here, and the deploy lands at
<https://stereotypicalcat.github.io/gacha-event-tracker/>.

The feed job fails if the event count collapses. A source that quietly stops yielding events is the
failure mode a parser-only pipeline is most prone to, and nothing else would surface it. Tests run
offline against checked-in fixtures, so a red pipeline always means the code changed rather than a
wiki being down.

### Refreshing the data

GitHub Actions only — the GitLab pipeline still runs the gates, but nothing there fetches.
`.github/workflows/refresh.yml` runs `bun run refresh` twice a day (and on demand, with a dry-run
input). It fetches each source at most once per cycle, and **commits only when a page's bytes
actually changed** — a `304`, an identical body, or a fetch that fails to parse all leave the
working tree clean and produce no commit. When something did change it commits the raw snapshots and
dispatches `ci.yml`, which typechecks, tests, rebuilds the feed and deploys through the path that
already existed; none of that logic is duplicated.

A body that yields zero events is rejected and the previous snapshot kept, so a wiki redesign shows
up as a stale timestamp rather than an empty calendar. One source being down is a warning; every
source being down fails the run, so a bad cycle never gets committed.

The schedule is off for forks (it is pinned to this repository) — a fork owner can still dispatch it
by hand and take responsibility for the traffic.

### Hosting under a subpath

Assets resolve against a `<base href>` that the build substitutes, so the app works at a domain root
and under a subpath alike:

```bash
BASE_PATH=/gacha-event-tracker/ bun run build
```

The Pages job sets this automatically. Without it, a subpath deploy 404s on every asset.

## Licence

MIT — see [LICENSE](LICENSE). It covers the code: server, client, parsers, and the build and refresh
scripts.

It does not cover the event data. The schedules under `fixtures/` and `snapshots/`, and the feed
built from them, were compiled by the editors of the sites they came from and describe events run by
the publishers; every event links back to the page it came from. Fork the code freely — the data you
obtain and attribute yourself. [NOTICE](NOTICE) spells this out and travels with the licence, and the
app's own colophon says the same thing to readers.

Unofficial and unaffiliated. Game names, event names and trademarks belong to their respective
owners.
