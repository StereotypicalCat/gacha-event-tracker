# In-app changelog

**Date:** 2026-10-13

**Status:** implemented 2026-10-13; spec 3. The card and sheet landed together; three same-day
fix entries for bugs no reader ever saw were left out of the backfill. Independent of specs 1 and 2, and announces them.

## Request and intended outcome

The owner wants the app to say what has changed: short summaries of updates, and a fuller record a
reader can browse. Two tiers, both tied to git:

- **Short entries** — one reader-facing line each, shown as **What's new** after a new version
  loads. Each carries the commit it shipped in and its date.
- **Release notes** — a few summarised paragraphs per feature or milestone, written from the git
  history and the spec documents: less than git's detail, more than a one-liner. Each carries the
  commit range it covers, its date, and the specs it summarises. The footer's **Changelog** lists
  them.

Coverage: **new features and fixes**, and **games and sources** (a game added, a source retired, a
reset clock corrected). Not data refreshes — the footer already states the data's age, and they
happen twice a day.

## Decisions taken

| Question | Answer |
|---|---|
| Who writes entries? | A person or an agent, at development time, in reader-facing language. Never an LLM at runtime (AGENTS.md constraint 2) |
| Where do they live? | In the app bundle, `src/shared/changelog.ts`. Works offline; ships with the version it describes |
| When does What's new show? | After the reload, in the new version. The update notice (F14) is unchanged |
| Who sees What's new? | Readers with unseen entries. A brand-new reader is marked up to date at first run |
| Existing readers when this ships | Shown the entries of the last 14 days once, so the launch is announced |
| Git link | Commit and compare links on `REPO_URL` (the public GitHub mirror) |
| Data refreshes, notifications | Out of scope |

## Model — `src/shared/changelog.ts`

Zod as the source of truth:

```ts
const Ref = z.string().regex(/^[0-9a-f]{7,40}$/);          // a commit, abbreviated or full
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const EntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),               // stable; what "seen" records
  date: Day,
  kind: z.enum(["feature", "fix", "games"]),               // New · Fixed · Games & sources
  title: z.string().min(1).max(90),
  body: z.string().max(280).optional(),
  ref: Ref,                                                 // the commit it shipped in
  note: z.string().optional(),                              // a release note's id
});

const NoteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  date: Day,                                                // the last commit's date
  title: z.string().min(1).max(90),
  summary: z.array(z.string().min(1)).min(1).max(6),        // paragraphs, plain text
  from: Ref, to: Ref,                                       // the range it covers
  specs: z.array(z.string()).default([]),                   // repo paths under docs/
});

export const ENTRIES: Entry[];   // newest first
export const NOTES: Note[];      // newest first
```

Pure helpers: `unseen(entries, seenId | undefined, today)` and `launchWindow(entries, today, 14)`;
`commitUrl(ref)`, `compareUrl(from, to)`, `specUrl(path)` built on `REPO_URL`.

A test pins: every entry and note parses; ids are unique; both lists are newest-first; every
`entry.note` names a note; every `note.specs` path exists on disk. **Refs are checked for shape,
not existence** — CI checks out shallowly, so a test asking git would fail there; existence is
checked by `scripts/check-changelog.ts`, run by hand or by the agent writing entries.

## Seen state

`prefs.changelogSeen?: string` — the newest entry id the reader has dismissed. **Absent means
unrecorded**, the `knownGames` distinction again:

- A reader finishing first-run setup gets it set to the newest id: nothing to announce.
- An onboarded reader with it absent (everyone, the day this ships) sees `launchWindow` once.
- Otherwise What's new shows the entries newer than the recorded id.

Dismissing writes the newest id. An id that no longer exists (an entry renamed) falls back to the
launch window rather than replaying everything.

## What the reader sees

**What's new card** — top of the main column, above the lists; never in the rail, which holds
instructions. Eyebrow `What's new`, up to five entries (`New` / `Fixed` / `Games & sources` tag,
title, date), `See all` (opens the changelog) and `Got it`. More than five reads `See all (3 more)`. Dismissible, never modal, never shown on first run.

**Changelog sheet** — a `Changelog` link in the footer beside *Source code* opens a sheet
in the detail sheet's style. Release notes, newest first, each with title, date, summary
paragraphs, `commits from…to` (compare link) and spec links; the short entries a note covers listed
under it with commit links. Entries with no note are listed by month at the end.

## Conventions this adds

AGENTS.md § Conventions gains: **a change a reader can see adds a short entry**, in a follow-up
`chore(changelog)` commit naming the change's commit — a commit cannot contain its own hash. A feature that spans several commits
gets a release note when it lands, summarising its spec and range.

## Backfill

Entries and notes for reader-visible work since August 2026, written from `git log` and
`docs/superpowers/specs/`: recurring custom events, game order, per-server reset clocks, games
added, check-in goals, weekly and monthly tasks, this changelog.

## Testing

Schema and ordering test above; `unseen`/`launchWindow` pure tests including the absent and
renamed-id cases; the card renders at most five and hides with nothing unseen; the sheet renders a
note with compare and spec links; first-run seeding; `scripts/check-changelog.ts` passes on the
backfill. Browser check of card and sheet, dark and light.

## Docs that change with it

PRD: F18 — the changelog; DATA-MODEL: `prefs.changelogSeen`; AGENTS.md: the convention above;
DESIGN.md: the card and the sheet.
