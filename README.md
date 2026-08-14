# Event Clock

Live and upcoming events across your gacha games, sorted by what expires next.

You play three or four gacha games. Each has its own calendar, none of them talk to each other, and
the only question that actually matters — *what runs out first?* — takes four browser tabs to
answer. This does it in one screen.

No account. No login. Your completed events are saved in your browser and never leave your device.

## Status

Early, but usable. The parsing pipeline and the interface work end to end against checked-in
fixtures, and the whole thing builds, serves, containerises and deploys. The database, refresh
scheduler and review queue are specified but not built, so the feed is generated offline rather than
refreshing itself.

| Piece | State |
|---|---|
| Event schema, date parsing, Game8 parser | Built, tested |
| Six game sources | Built, tested |
| Cross-source merge and conflict detection | Built, tested |
| Web interface, offline support, first-run picker | Built |
| Static server, Docker image, GitHub + GitLab CI | Built |
| SQLite, refresh scheduler, review queue | Specified in `docs/`, not built |

Today the feed is generated offline from fixtures. That is deliberate: it let the interface be built
against real parsed data, and it produces exactly the shape the server will serve.

## Try it

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
bun run build:feed        # regenerate public/data/events.v1.json from fixtures

# Run one source against its fixture and print what it yields
bun run parse genshin-game8-events fixtures/genshin/game8-events-2026-08-14.html
bun run parse nte-game8-events     fixtures/nte/game8-events-2026-08-14.html --json
```

## How it works

```
game wikis ──► fetch ──► parse ──► merge ──► validate ──► gate ──► feed ──► browser
                          │          │                     │                  │
                    per-site      per-game            hold anything    localStorage:
                     parser      corroboration        uncertain for      what you've
                                 and conflicts        human review        finished
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

| Game | Source | Events |
|---|---|---|
| Genshin Impact | Game8 | 9 |
| Honkai: Star Rail | Game8 | 6 |
| Wuthering Waves | Game8 | 10 |
| Zenless Zone Zero | Game8 | 12 |
| Neverness to Everness | Game8 | 13 |
| Arknights: Endfield | Game8 + wiki.gg | 6 |

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

Arknights is defined in the schema and awaiting a source.

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

## Offline

The app works with no network. A service worker caches the shell and webfonts, and serves the last
feed it downloaded when the network is gone — countdowns keep running off your device clock. Being
offline is shown in the header and above the footer, because stale data must never look current.

It installs to a home screen as a standalone app.

## Conduct

Sources are community wikis, treated as a guest would: `robots.txt` honoured, a descriptive
`User-Agent`, one request per source per six hours, conditional requests, and raw snapshots cached
so iteration never re-fetches. Every event links back to its source.

## Documentation

| Document | Covers |
|---|---|
| `CLAUDE.md` | Working agreements, domain rules, conventions |
| `docs/PRD.md` | What this is, who for, what's out of scope |
| `docs/ARCHITECTURE.md` | Process shape, routes, deployment |
| `docs/DATA-MODEL.md` | Event schema, SQLite tables, client storage |
| `docs/INGESTION.md` | Parser/adapter/merge layers, pipeline stages, review gate |

## CI

Both `.github/workflows/ci.yml` and `.gitlab-ci.yml` run the same gates on every push — typecheck,
tests, and a feed sanity check — then build and publish a container image from the default branch.
GitHub Actions additionally deploys to Pages.

The feed job fails if the event count collapses. A source that quietly stops yielding events is the
failure mode a parser-only pipeline is most prone to, and nothing else would surface it. Everything
runs offline against checked-in fixtures, so a red pipeline always means the code changed rather
than a wiki being down.

### Hosting under a subpath

Assets resolve against a `<base href>` that the build substitutes, so the app works at a domain root
and under a subpath alike:

```bash
BASE_PATH=/gacha-event-tracker/ bun run build
```

The Pages job sets this automatically. Without it, a subpath deploy 404s on every asset.

## Licence

Not yet chosen. Event data belongs to the sources it came from and is linked back on every event.
