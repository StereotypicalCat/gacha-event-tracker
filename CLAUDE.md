# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web app that aggregates live and upcoming events across popular gacha games (Genshin Impact,
Honkai: Star Rail, Zenless Zone Zero, Wuthering Waves, Arknights, Arknights: Endfield), plots them
on a calendar, sorts them by end date, and lets a user mark events completed.

**Status: specification only.** No application code exists yet. `docs/` is the source of truth for
what to build; everything below describes the intended system, not an existing one. When you write
the first code, follow `docs/ARCHITECTURE.md` and update this file's Commands section with the real
commands.

## Two constraints that shape everything

1. **No accounts, no logins, no user records.** Completion state lives in the browser's
   `localStorage`, keyed by event ID. There is no user table and no session. Any feature request
   that implies "sync across devices" must be solved with export/import JSON, not a server-side
   user.
2. **A server is allowed, and is where all secrets live.** The Bun server owns scraping, LLM
   extraction, and the SQLite database. `ANTHROPIC_API_KEY` never reaches the browser. The client
   only ever calls this app's own `/api/*`.

## Stack

| Layer | Choice |
|---|---|
| Runtime / server / bundler / test runner | Bun (single dependency — `Bun.serve`, `bun:sqlite`, `bun test`, `bun build`) |
| UI | React 19 + TypeScript (strict) + Tailwind |
| Storage | SQLite via `bun:sqlite` (file is gitignored — `*.sqlite`) |
| Validation | Zod — one schema module shared by server and client |
| LLM | Anthropic TypeScript SDK (`@anthropic-ai/sdk`), model `claude-opus-5` |

TypeScript runs `strict: true` **and** `noUncheckedIndexedAccess`. Do not add a bundler, test
runner, or process manager — Bun covers all three.

## Architecture in one paragraph

A scheduled job inside the Bun process runs one **adapter** per game. Each adapter fetches a source
page, cleans it, and hands it to a **deterministic parser** when the source has a stable shape, or
to **Claude structured extraction** when it doesn't. Results are validated with Zod plus calendar
sanity rules, then either published to the `events` table or held in `events_quarantine` for human
review at an unauthenticated `/review` route bound to `127.0.0.1`. The React client fetches
`/api/events`, renders a calendar and an ends-soonest list, and stores completion ticks in
`localStorage`. Full detail: `docs/ARCHITECTURE.md`.

The important consequence: **the LLM runs at ingestion time, never in a request path.** A page load
must never trigger an API call to Anthropic. If you find yourself adding one, the design is wrong.

## Reading order for a new task

| Task | Read |
|---|---|
| Anything at all | `docs/ARCHITECTURE.md` |
| Adding/changing an event field | `docs/DATA-MODEL.md` — the schema is versioned and the client depends on it |
| Adding a game, fixing a broken adapter | `docs/INGESTION.md`, then invoke the `add-game-source` skill |
| Touching prompts, extraction, or cost | `docs/LLM-EXTRACTION.md` |
| Product questions (what does the calendar show?) | `docs/PRD.md` |

## Domain rules that are not obvious from the code

These come from how gacha games actually schedule things, and they are the source of most bugs in
this kind of app:

- **Store every timestamp as UTC ISO 8601. Never store a local wall-clock time.** Sources publish
  in a mix of UTC+8, server-local, and "after maintenance".
- **Banner ends are usually global and simultaneous; event ends are usually per-region.** Genshin
  and HSR character banners end at the same instant worldwide, while story/login events end at each
  region's daily reset (Asia / America / Europe are offset by hours). The `regionScoped` flag and
  the optional `regionEnds` map exist for exactly this — do not collapse them into one timestamp.
- **"Ends after maintenance" and "TBD" are real values.** An event whose end is genuinely unknown
  gets `endsAt: null` and `endPrecision: "unknown"`. Never invent a plausible date to satisfy a
  non-null type — that is the single worst failure mode for this app, because the user's whole
  reason for visiting is trusting the end date.
- **Version 1.x patch cycles are ~6 weeks (42 days), split into two banner phases.** Any extracted
  event with a duration over 180 days is almost certainly a parse error, not a long event. The
  validator rejects it.

## Working with the LLM extraction layer

Read `docs/LLM-EXTRACTION.md` before editing any prompt or request. The rules that will actually
bite you:

- **Model is `claude-opus-5`.** That is the exact, complete ID — never append a date suffix.
- **Use structured outputs, not prompt-and-parse.** `client.messages.parse()` with
  `zodOutputFormat(EventExtractionSchema)` from `@anthropic-ai/sdk/helpers/zod`. Read
  `response.parsed_output`. Do not write a JSON-repair or regex-extraction fallback — if the schema
  is right, there is nothing to repair.
- **Never set `temperature`, `top_p`, or `top_k`.** They are removed on `claude-opus-5` and return
  a 400. Steer with the prompt.
- **Never set `thinking: {type: "enabled", budget_tokens: N}`.** Removed — returns 400. Thinking is
  on by default; control depth with `output_config.effort`.
- **Deterministic parsers come first.** The LLM is for sources whose markup is unstable. A source
  with a clean JSON API or a stable table must not go through the model.
- **Skip unchanged sources by content hash.** This is the main cost lever — most refresh cycles
  should make zero API calls.

## Cost discipline

Every ingestion run should be able to answer "why did this cost anything?" Extraction is billed at
`claude-opus-5` rates ($5/MTok input, $25/MTok output). Three levers, in order of impact:

1. **Content-hash skip** — unchanged source, no call at all.
2. **HTML pre-cleaning** — strip `<script>`, `<style>`, nav, and footer before sending. Cuts a
   typical wiki page from ~15k to ~5k tokens.
3. **Batch API for scheduled runs** — 50% off, results within an hour, which is fine for a 6-hour
   cadence. Use the synchronous API only for the manual `refresh --now` path.

Prompt caching applies to the shared extraction system prompt (`cache_control: {type: "ephemeral"}`,
1-hour TTL). The minimum cacheable prefix on `claude-opus-5` is **512 tokens** — the system prompt
is deliberately above it. If you shorten the system prompt below 512 tokens, caching silently stops
working and nothing errors; check `usage.cache_read_input_tokens` after any prompt edit.

## Scraping conduct

Sources are community wikis and official news pages. Treat them as a guest would:

- Honor `robots.txt`; set a descriptive `User-Agent` with a contact URL.
- One request per source per refresh cycle, minimum 6 hours apart. No parallel hammering.
- Send `If-None-Match` / `If-Modified-Since` and treat `304` as "skip, unchanged".
- Cache raw snapshots locally so re-running extraction never re-fetches.
- Record `sourceUrl` on every event and surface attribution in the UI.

A new source that forbids automated access in its ToS does not get an adapter. Flag it and ask.

## Conventions

- **Zod schemas are the single source of truth for types.** Derive TypeScript types with
  `z.infer<>`; never hand-write an interface that duplicates a schema.
- **Event IDs are stable and deterministic**: `${gameId}:${slugify(title)}:${startsAt.slice(0,10)}`.
  They are the localStorage keys, so **changing the ID scheme silently wipes every user's completion
  state.** If you must change it, ship a migration in the client that remaps old keys.
- **Adapters are pure over their input.** `fetch` is separate from `parse` so parsers can be tested
  against checked-in HTML fixtures with no network.
- Every adapter ships a fixture in `fixtures/<game>/` and a test asserting the parsed output. This
  is how a source silently changing shape gets caught.
