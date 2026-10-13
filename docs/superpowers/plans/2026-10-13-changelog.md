# In-app Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Short "What's new" entries shown once after a new version loads, and fuller release notes in a footer sheet — every item tied to a git ref and date.

**Architecture:** `src/shared/changelog.ts` holds Zod schemas, the hand- or agent-written `ENTRIES` and `NOTES`, and pure helpers (`unseen`, `launchWindow`, URL builders). `prefs.changelogSeen` records the newest dismissed id. A `WhatsNew` card sits atop the main column; a `ChangelogSheet` opens from the footer.

**Spec:** `docs/superpowers/specs/2026-10-13-changelog-design.md`

## Global Constraints

- Entries ship in the bundle; nothing fetched. No runtime LLM.
- `changelogSeen` absent = unrecorded: first run seeds it silently; an onboarded reader without it sees the launch window once.
- Refs are checked for shape in tests and for existence by `scripts/check-changelog.ts` (CI is shallow).
- Card: main column, never the rail; never modal; at most five entries.

## Review Focus

1. An onboarded reader upgrading with no `changelogSeen` — sees the last 14 days once, then never again after Got it.
2. A recorded id that no longer exists — launch window, not the whole history.
3. A brand-new reader — no card after first-run setup.
4. Import all of an old prefs file — `changelogSeen` junk sanitised.
5. More than five unseen — five shown, "See all" opens the sheet.

## Tasks

1. **Model and data** — `src/shared/changelog.ts`, `test/changelog.test.ts`, `scripts/check-changelog.ts`. Backfill from the drafted history; add entries for today's built-ins and refresh button.
2. **Seen state** — `usePrefs.ts` field + sanitising; first-run seeding in App's Welcome confirm; tests in `test/prefs.test.ts`/`test/changelog.test.ts`.
3. **What's new card** — `src/client/components/WhatsNew.tsx`, App wiring; static-render tests.
4. **Changelog sheet** — `src/client/components/ChangelogSheet.tsx`, footer link in `Colophon.tsx`, App state; tests.
5. **Docs, convention, look** — PRD F18, DATA-MODEL, AGENTS.md convention, DESIGN.md; follow-up `chore(changelog)` entry for the changelog itself; browser check.
