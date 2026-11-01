# Content Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Separate Miliastra, represent sourced passes as cycles, and let readers disable Genshin TCG tracking without losing state.

**Architecture:** Preserve source/identity game and IDs in the feed; optional classification metadata supplies the destination lane, battle-pass family and TCG tag. A shared resolver handles old feeds and saved snapshots. Reader normalization routes identified Miliastra state atomically and preserves account clocks; pass presentation reuses event progress rather than creating another task store.

**Tech Stack:** Bun, TypeScript, React 19, Zod; existing dependencies only.

**Spec:** `docs/superpowers/specs/2026-11-01-content-classification-design.md`

## Global Constraints

- Work on main in this checkout per AGENTS.md. No commits or pushes without request.
- Keep every event ID, date, source ID and source URL unchanged.
- Preserve old feed validation: classification is additive; wire game stays the identity game.
- Miliastra arrives off; TCG defaults on across Genshin accounts.
- No guessed recurrence, dates, classification or completion; reader-created content is excluded.

## Review Focus

- Legacy imports/late writes after a move must honor destination deletion timestamps.
- Multiple accounts with equal regions must retain distinct ownership and clock history.
- Old cached feeds and remembered snapshots must classify consistently without causing startup failure.
- Pass-only tracking and independent pins must not create duplicate rows or unrelated cycle follows.
- Hidden TCG must leave history intact and disappear from all live instructions, including event dailies.

### Task 1: Shared classification and parser evidence

**Files:** `src/shared/schema.ts`, `src/shared/classification.ts` (new), `src/shared/games.ts`, `src/ingest/parsers/{fandom,fandomTable,versionTable}.ts`, `src/ingest/merge.ts`, `test/classification.test.ts` (new), affected adapter expectations.

**Interfaces:** `classificationFor(event): EventClassification`, `displayGameFor(event): string`, `passFamilyFor(event): string | null`, `isTcgEvent(event): boolean`. Metadata is optional `{ lane?: "miliastra", activity?: "battle-pass", family?: string, tags?: string[] }`. Recognize established article families and source registrations for cached feeds; parser reads stated type labels. Register `miliastra` for current clients but keep existing wire game fields unchanged.

- [x] Write tests for source categories, cached source paths, custom exclusion, source winner lacking metadata, and unknown fallback; run and observe failure.
- [x] Add schema/resolver, parser labels and merge retention; preserve fixture IDs and dates. Cite reviewed TCG family evidence.
- [x] Run `bun test test/classification.test.ts test/merge.test.ts test/adapters/game8.test.ts test/adapters/fandomTable.test.ts test/adapters/versionTable.test.ts`; regenerate only intentionally changed expectation fields.

### Task 2: Atomic routing and compatibility

**Files:** `src/client/state/reader/contentRouting.ts` (new), `store.ts`, `reducer.ts`, `export.ts`, `schema.ts` as needed; `test/reader-content-routing.test.ts` (new).

**Interfaces:** `routeReaderContent(state: ReaderState): ReaderState` is pure and idempotent, driven by the shared classifier. A persisted `contentRoutes` record maps original accounts to Miliastra counterparts. Counterpart identity is derived deterministically from the existing account ID; it is not a reminted identity. Copy original clock revisions and unknown account fields, preserve retired status, and append Miliastra to known games while hiding it on first introduction.

Rebase account-scoped `fieldTimes` paths for classified IDs, preserving the latest timestamp at either path and retaining origin tombstones. Route incoming old-account actions before conflict checks. Destination values win timestamp ties; progress fields merge by latest field time, day logs by union subject to day tombstones, amounts by period timestamp, ignores by saved timestamps. Archive/seen records keep original clock/resolved end and event ID but use logical game Miliastra. Do not reuse an unrelated same-region account. Normalize startup, dispatch and imports/restores so old-tab/backup deltas route consistently. No source-state transfer is repeated after clearing a mark.

- [x] Add failing tests for two same-region origins, clock revisions, all record collections, idempotence, source/destination clears, late actions and import/restore.
- [x] Implement pure normalization and wire locked save/import paths; create empty destination data only for actual moved state or explicit account use.
- [x] Run `bun test test/reader-content-routing.test.ts` and existing reader store/export/migration tests; expect no state validation failures.

### Task 3: Classified reader rows and Miliastra settings

**Files:** `src/client/state/reader/{eventRows,routines,migration,onboarding}.ts`, `src/client/ReaderApp.tsx`, `src/client/components/redesign/{GameSettings,SetupWizard}.tsx`, `src/shared/feed.ts`, tests for reader rows and views.

**Interfaces:** Reader event rows use logical destination game and existing IDs. Shared category filtering excludes TCG when `prefs.genshinTcg === false`. Retain classified snapshots for migration and source-backed pass rows even when ordinary Events is off. Freshness/source lookup maps logical Miliastra to supplying Genshin sources.

- [x] Add failing tests for lane independence, hidden-lane policy, cached snapshots, source attribution and unchanged Genshin rows.
- [x] Route row rendering and lane discovery; offer Miliastra independently without synthetic dailies; point to its settings from Genshin About.
- [x] Run focused reader/view tests and typecheck.

### Task 4: Feed-backed battle-pass cycles

**Files:** `src/client/state/reader/{routines,contentRouting}.ts`, `src/client/components/redesign/{RoutinesPage,RoutineDrawer,RoutineProgress,TimelinePage,GameSettings,SetupWizard}.tsx`, `src/client/ReaderApp.tsx`, `test/reader-pass-cycles.test.ts` (new).

**Interfaces:** Feed cycle rows carry `event` and a stable family placement key while retaining per-window event ID for progress. Family placements are persisted in `account.routines`; next window inherits pins, not completion. Existing event followers gain pass-family placements once, without following unrelated routines. New accounts derive pass following from Cycles intent. Event-backed routine controls dispatch existing event outcome/progress actions.

- [x] Add failing tests for old-reader transition, pass-only tracking, next-window completion isolation, independent pins, Miliastra pass off until lane enabled, and no second ordinary-event row.
- [x] Implement family placements and dynamic rows using sourced event clocks; extend library, progress controls, checklist guidance and timeline windows. Never render a predicted recurrence/reset.
- [x] Run `bun test test/reader-pass-cycles.test.ts` plus affected routine/timeline tests and typecheck.

### Task 5: Genshin TCG switch

**Files:** `src/client/components/redesign/GameSettings.tsx`, `src/client/state/reader/eventRows.ts`, `routines.ts`, `test/reader-tcg.test.tsx` (new).

**Interfaces:** `prefs.genshinTcg` absent means true. Genshin About renders Track TCG events, supporting copy from spec, immediate save and failure rollback. All live surfaces use the shared reader classification predicate; history remains readable.

- [x] Add failing tests for default/on/off/cached snapshot behavior, multiple accounts, saved-history preservation and rejected save.
- [x] Implement existing-style accessible toggle and shared filtering; no ignored/completed writes.
- [x] Run focused TCG and reader row tests.

### Task 6: Verification and documentation

**Files:** PRD, DATA-MODEL, INGESTION, DESIGN, ARCHITECTURE where changed; prior pass spec and audit; focused expiration regressions; browser scratch files only under /tmp.

- [x] Verify audited ended trials cannot re-enter live rows through remembered state; verify regional day-precision ends without changing stored timestamps. Test existing behavior before proposing repairs.
- [x] Compare parsed/built before/after IDs and dates offline. Update docs for implemented classification, routing and cycle behavior; record any plan rulings in the ledger.
- [x] Run `bun run typecheck`, full `bun test`, `git diff --check`. Build only css/js/static shell; use a separately generated temporary feed if needed for deterministic browser data.
- [x] Browser-check desktop/mobile, both themes, ordinary HTTP hostname startup/writes, old-state migration, TCG off/reload/on, pass-only and Miliastra isolation. Run Impeccable detector once over changed UI files.
- [x] Fresh-context final review; fix material findings with regression tests; report checks and any remaining limitations. Leave work uncommitted per AGENTS.md.

## Verification record

Completed 2026-11-01. Full suite: 1748 pass, 0 fail; typecheck and diff check pass.
The baseline required HTTP test binding outside the sandbox. Browser checks used
Chrome on an ordinary HTTP hostname at fresh build origins: migration, TCG
off/reload/failure/on, pass completion/undo, Miliastra enabling and retained pass
following, new-reader startup, and desktop/mobile dark/light layouts with no page
errors or horizontal overflow. Impeccable detector returned no findings.
Offline comparison against HEAD covered 25 sources / 197 parsed rows and every
merged game: IDs, dates, titles and source identities unchanged; only category
metadata changed. The old feed schema accepts the new parsed output.
Fresh code review produced five material findings, all fixed with failing-then-
passing regressions (backup tombstones, legacy ignores, late-created pass
following, inventory precedence and unrelated imported origins). Additional
regressions cover the new-reader placeholder and already-routed import mapping.
Implemented on main. The follow-up changelog commit records the implementation
range under the repository convention.
