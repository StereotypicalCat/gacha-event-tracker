# Event Clock

Live and upcoming events across your gacha games, sorted by what expires next.

You play three or four gacha games. Each has its own calendar, none of them talk to each other, and
the only question that actually matters — *what runs out first?* — takes four browser tabs to
answer. This does it in one screen.

No account. No login. Your completed events are saved in your browser and never leave your device.

## Status

Early. The parsing pipeline and the interface work end to end against checked-in fixtures; the
server, database and scheduler are specified but not built.

| Piece | State |
|---|---|
| Event schema, date parsing, Game8 parser | Built, tested |
| Five game sources (Genshin, Star Rail, Wuthering Waves, ZZZ, NTE) | Built, tested |
| Cross-source merge and conflict detection | Built, tested |
| Web interface, offline support | Built |
| Bun server, SQLite, refresh scheduler, review queue | Specified in `docs/`, not built |

Today the feed is generated offline from fixtures. That is deliberate: it let the interface be built
against real parsed data, and it produces exactly the shape the server will serve.

## Try it

```bash
bun install
bun run build      # parse fixtures → feed, then compile CSS and JS
bunx serve public  # or any static file server
```

Then open <http://localhost:3000>.

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
| Arknights: Endfield | — | No usable source, see below |

Game8 uses a different page template for almost every game — label/value detail tables, column
tables, rowspan Start/End pairs — and four different date formats between them. One parser handles
all of it; each game costs a registry entry.

**Endfield has no adapter on purpose.** Its Game8 page carries no usable dates: every duration reads
"Permanently Available", and the schedule is an image grid showing `07/16` with no year and no end
date. Supporting it would mean inventing both. It needs a different source.

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

## Licence

Not yet chosen. Event data belongs to the sources it came from and is linked back on every event.
