# Event Clock Redesign Implementation Plan

> **2026-10-17: second implementation rejected by owner.** The later correction/review statements
> below do not mean acceptance. Resume from `docs/handoffs/2026-10-17-redesign-second-rejection-handoff.md`.
> Launch the current server and ask the owner for the biggest differences before further UI changes.

> **Acceptance withdrawn:** the owner rejected the implementation for substantial divergence from
> the approved markup. Completed checkboxes below are historical, not design acceptance.
> Presentation/fidelity gates reopen. Read
> [the replacement-agent handoff](../../handoffs/2026-10-16-redesign-fidelity-handoff.md) first.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execution method: **Native**, selected by the owner. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the approved redesign with Relaxed (Round 7) and Structured (Round 6 B) interfaces, shared functionality, and preserved reader data.

**Architecture:** Keep one React application and one set of domain selectors; interface tokens change presentation. Introduce an account-aware reader-state envelope with explicit migration and reset revisions before connecting new tracking controls. Separate source ingestion from presentation and keep all user state browser-local.

**Tech Stack:** Bun 1.3, React 19, strict TypeScript, Tailwind, Zod; existing dependencies only. Bun tests for domain/storage and server-rendered semantics; scratch Puppeteer and Chrome for built-app interaction and appearance.

**Spec:** [Approved redesign specification](../specs/2026-10-16-ui-redesign-design.md).

## Global Constraints

- Two interfaces: **Relaxed / Structured**, using Round 7 / Round 6 B respectively; Relaxed default.
- Interface, Dark/Light/System, colour scheme and Standard/Compact event rows are independent preferences.
- Keep existing event IDs, daily IDs, task IDs and day-key formats.
- No added runtime dependencies, accounts, push service, SQLite work or prototype JavaScript transplanted into production.
- Unknown end dates remain null. Explicit timestamps, `regionEnds` and reader-entered instants remain authoritative.
- **Event data may be out of date** replaces **Older schedules**; warnings cover followed games, independently of focus.
- Backup retention: seven daily, four weekly, six monthly snapshots, plus one recovery copy; stable UTC basis.
- Changelog is a Settings page, with no footer link or About button.
- Small text must clear 4.5:1 in both modes and UIs.
- Work in the current checkout on `main`, per AGENTS.md. Do not create a branch, commit, push or publish without a separate owner instruction. This overrides skill worktree/commit defaults.
- Update shipped docs alongside implemented behaviour; preserve earlier review artifacts and unrelated untracked files.

## Review Focus

1. Two open tabs edit different progress fields: preserve both edits rather than last whole-envelope write winning (Task 3).
2. An interrupted migration/restore or quota failure: retain recoverable data and prevent startup effects overwriting it (Tasks 3, 10).
3. Reset changes move today's date backward: keep old ticks reachable without marking the new period completed by accident (Tasks 4, 6).
4. A source disappears while a future/unknown-end event remains outstanding: do not declare it expired or lose its detail (Task 8).
5. Old exports and unreadable future fields: preserve what this build cannot interpret; never claim a partial import fully restored data (Tasks 2, 10).

## Structure and shared contracts

Existing entry points stay `App.tsx`, `main.tsx`, `api.ts` and the current feed. New UI lives under
`src/client/components/redesign/`; reader state under `src/client/state/reader/`. Keep shared date
logic in `src/shared/`, without importing browser storage into shared modules.

The following contracts belong to `src/client/state/reader/schema.ts` and are consumed by later
tasks. Implement Zod schemas as `.passthrough()` for records with forward-compatible fields;
validate known fields without stripping unknown ones.

- `AccountId`: opaque `account:<random>` identity, minted once, unrelated to mutable region.
- `ClockRevision`: `{ id: string; effectiveAt: string; region: Region; reset: null | { hour: number; minute: number }; automaticBase: { offsetUtc: number; hour: number; minute: number } }`.
  Capture automaticBase when creating a revision; later game metadata updates start a new revision
  for current Automatic clocks rather than changing the historical one.
- `TrackingIntent`: `{ events: boolean; dailies: boolean; weeklyMonthly: boolean; cycles: boolean }`.
- `RoutinePlacement`: `{ followed: boolean; checklist: boolean; timeline: boolean }`.
- `Account`: `{ id: AccountId; game: LaneId; region: Region; intent: TrackingIntent; routines: Record<string, RoutinePlacement>; clocks: ClockRevision[]; retiredAt?: string }`.
- `AccountData`: `{ progress: Record<string, unknown>; ignored: Record<string, unknown>; daily: Record<string, Record<string, unknown>>; amounts: Record<string, Record<string, unknown>> }`.
  `daily` and `amounts` are keyed first by revision id, then by the original item id. Inside each
  item retain existing day/period log shapes. Revision ids never become event ids.
- `ArchiveRecord`: `{ accountId: AccountId; event: DisplayEvent; outcome: "done" | "ignored" | "unfinished"; outcomeAt: string; resolvedEnd: number | null; clockRevision: string; progress: unknown; days: string[]; amounts: Record<string, unknown> }`.
- `SeenEvent`: `{ accountId: AccountId; event: DisplayEvent; firstSeenAt: string; lastSeenAt: string; clockRevision: string }`.
- `ReaderState`: `{ version: 2; revision: number; migratedAt: string; legacyDigest: string; accounts: Record<string, Account>; data: Record<string, AccountData>; archive: Record<string, ArchiveRecord>; seenEvents: Record<string, SeenEvent>; prefs: Record<string, unknown>; customGames: Record<string, unknown>; customEvents: Record<string, unknown>; tasks: Record<string, unknown>; codeSeen: Record<string, string[]>; codeRedeemed: Record<string, Record<string, string>>; eventSeen: Record<string, string[]> }`.
  Keys of archive/seenEvents are `JSON.stringify([accountId, event.id])`, preventing collisions
  without altering the domain id. `codeSeen` stores known ids per game; redemption stores code ids
  per account. `eventSeen` records event ids per account after the relevant main view is visited.
- `ReaderAction`: discriminated operations to edit a specific account, progress field, day tick,
  amount, follow/pin, preference, archive outcome or seen marker. Actions carry `at` and an opaque
  operation id for conflict/replay handling; do not expose arbitrary whole-state replacement.
- `ReaderStore`: `{ getSnapshot(): ReaderState; subscribe(listener: () => void): () => void; dispatch(action: ReaderAction): Promise<SaveResult> }`.
  Async dispatch permits Web Lock serialization; UI event callbacks await or explicitly void it,
  and the store publishes save failures through its hook rather than dropping rejected writes.
- `SaveResult`: `{ ok: true } | { ok: false; reason: "unavailable" | "quota" | "invalid" | "conflict" }`.

Browser keys: `gacha-tracker:v2:reader`, `gacha-tracker:v2:migration-recovery`,
`gacha-tracker:v2:restore-pending`, `gacha-tracker:v2:backups`, `gacha-tracker:v2:restore-recovery`.
Never delete the existing `gacha-tracker:v1:*` keys. A backup contains reader state and legacy raw
values, excluding these backup/recovery keys and service-worker caches.

## Tasks

### Task 1: Shared navigation and the two interface shells

**Files:** Create `src/client/components/redesign/AppNavigation.tsx`, `SettingsLayout.tsx`,
`ChangelogPage.tsx`, `src/client/redesign.css`; modify `App.tsx`, `styles.css`,
`state/usePrefs.ts`, `components/ChangelogSheet.tsx`, `scripts/build-static.ts`; test
`test/redesign-shell.test.tsx`, `test/prefs.test.ts`.

**Interfaces:** Export `AppPage = "soon" | "timeline" | "routines" | "archive" | "settings"`
and `SettingsPage = "general" | "games" | "appearance" | "lists" | "time" | "sources" | "backup" | "about" | "changelog"`.
`AppNavigation({ page, onPage })` and `SettingsLayout({ page, onPage, children })` use native buttons.
Add normalized optional prefs `interface: "relaxed" | "structured"` and `density: "standard" | "compact"`.

- [x] Add failing semantic/prefs tests: missing/invalid interface reads Relaxed, stored Structured survives; navigating to Settings does not overwrite `prefs.view`; Changelog renders as a page without modal semantics.
- [x] Run `bun test test/redesign-shell.test.tsx test/prefs.test.ts`; expect failure for new behaviour.
- [x] Implement shared navigation/settings shell. Extract changelog content for page and retained legacy-sheet test compatibility. Scope layout/type tokens by `data-interface`; carry actual Round 7/6 B proportions and offline font fallbacks. Show settings only on its page, not below every list.
- [x] Run named tests and `bun run typecheck`; expect pass. Browser-check both shells at 390/1440px before later features. Update DESIGN/ARCHITECTURE for landed shell only.

### Task 2: Reader schemas, legacy migration and full-state export

**Files:** Create `state/reader/schema.ts`, `migration.ts`, `export.ts`; modify `state/export.ts`;
test `test/reader-migration.test.ts`, `test/reader-export.test.ts`.

**Interfaces:** `migrateLegacy(raw: Record<string, string>, games: readonly LaneId[], at: string, mint: () => AccountId): ReaderState`;
`parseReaderExport(value: unknown): ReaderState | null`; `buildReaderExport(state: ReaderState, legacy: Record<string, string>, at: string): object`.
Export format `gacha-tracker-export`, version `2`, full-state field `reader`, raw preservation field
`legacy`; existing version-1 exports remain accepted by a legacy conversion path.

- [x] Add failing tests from representative v1 saves: completion-only migration, daily/routine/task amounts, hidden games/order/region/theme/view, custom recurrence, unknown goal/task fields and orphan ids. Assert no id/day label changes and no routines enabled beyond the old effective rules.
- [x] Run `bun test test/reader-migration.test.ts test/reader-export.test.ts`; expect missing-feature failure.
- [x] Implement schemas/contracts above and deterministic mapping of each game's old state to one initial account in saved region. Default pins reproduce existing visible routines. Migrate all game identities referenced by logs/tasks/custom records, including games missing from today's feed. Retain unattributable records in legacy raw storage, with no guessed game.
- [x] Test repeat startup uses saved migration result without minting identities again; v2 export round-trip retains unreadable extra fields; malformed known fields reject without writes. Run named tests and typecheck; expect pass. Document schemas/keys in DATA-MODEL.

### Task 3: Persisted reader store and concurrency

**Files:** Create `state/reader/reducer.ts`, `store.ts`, `useReader.ts`; modify `state/storage.ts`,
`main.tsx`, `App.tsx`; test `test/reader-store.test.ts`.

**Interfaces:** `reduceReader(state: ReaderState, action: ReaderAction): ReaderState`;
`createReaderStore(storage: Storage, initial: ReaderState): ReaderStore`;
`useReader(): { state: ReaderState; dispatch: ReaderStore["dispatch"]; saveError: SaveResult | null }`.
Add `tryWriteJson(storage: Storage, key: string, value: unknown): SaveResult` without breaking old `writeJson` callers.

- [x] Write failing tests for two stores sharing storage: different progress-field edits both survive; stale same-field edit reports conflict; repeated operation is idempotent; removal is a timestamped operation, not a missing-key merge. Inject throwing/quota storage.
- [x] Run `bun test test/reader-store.test.ts`; expect failure.
- [x] Implement read-latest/rebase operations under a Web Lock when available, a revision check/retry fallback otherwise, and storage-event synchronization. Expose conflict instead of silently overwriting. Persist migration recovery before the first reader write. Bootstrap recovery before mounting React; prevent old hook effects writing migrated data. Reconcile post-migration v1 changes by recorded timestamps on next startup, retain deletions in new-state tombstones and preserve raw old values.
- [x] Bind App to the store with `useSyncExternalStore`; retain domain helpers from legacy hooks, remove their mounted persistence effects when v2 is active. Test failed migration write leaves legacy bytes identical and does not mark migration complete. Run named tests, all existing store tests and typecheck; expect pass.

### Task 4: Revision-aware reset clocks and timezone formatting

**Files:** Create `src/shared/readerClock.ts`, `state/reader/clock.ts`,
`state/displayTime.ts`; modify `shared/time.ts`, `daily.ts`, `goal.ts`, `task.ts`;
test `test/reader-clock.test.ts`, `test/display-time.test.ts`.

**Interfaces:** `resolveReaderClock(account: Account, at: number): { revision: string; region: Region; resetHour: number; resetMinute: number; offsetUtc: number }`;
`appendClockRevision(account: Account, reset: ClockRevision["reset"], region: Region, at: string, id: string): Account`;
`formatInZone(instant: number | string, withTime: boolean, zone: string | null): string`.
Pass an optional resolved clock through existing date helpers; absent preserves every old result.

- [x] Write failing tests for Automatic parity across all registered game/server clocks, 05:30 override, revert, explicit `regionEnds`, day-precision starts/ends, custom instants, built-in `clock` and custom task timing. Check two ticks with the same day label in different revisions remain independent/reachable when reset moves backward.
- [x] Run `bun test test/reader-clock.test.ts test/display-time.test.ts`; expect failure.
- [x] Implement injected clock context, leaving stored ids and historical labels unchanged. Revision selection uses action timestamp for logs and the current clock for current deadlines. Capture resolved offsets in history if automatic metadata changes, so past readings stay reproducible. Formatting uses Intl IANA zones, invalid stored zone falls back to Automatic without altering day keys.
- [x] Run named tests plus `test/time.test.ts`, `daily.test.ts`, `goal.test.ts`, `task.test.ts`, `period.test.ts`; expect pass. Document reset revision semantics and displayed-time separation.

### Task 5: Account-aware game settings and real source credits

**Files:** Create `components/redesign/GameSettings.tsx`, `TrackingChoices.tsx`,
`state/reader/accounts.ts`; modify `App.tsx`; test `test/reader-accounts.test.ts`, `test/game-settings.test.tsx`.

**Interfaces:** `createAccount(game: LaneId, region: Region, at: string, id: AccountId): Account`;
`GameSettings({ accounts, sources, onAction, gameMeta })`; `TrackingChoices({ intent, availability, onChange })`.
Source credits consume `EventFeed.sources`, not event rows; never import ingestion adapters into the client bundle.

- [x] Add failing tests: added server begins events-only with empty logs/pins; changing an account region retains its identity/history; duplicate same game/server setup is explained; retiring a server preserves its history. All type choices stay enabled when unavailable and explain why.
- [x] Run `bun test test/reader-accounts.test.ts test/game-settings.test.tsx`; expect failure.
- [x] Implement Setup/Codes/About tabs, default-server selection, fresh server tracking flow and reset hour/minute/Automatic/revert. Colour control edits the game, not an account. Source links include every matching health entry with thanks, including zero-event sources. Codes tab initially shows an honest unavailable state.
- [x] Run named tests and typecheck; expect pass. Browser-check adding a second server without copying the first account's marks.

### Task 6: Routine library, independent pins and direct dailies

**Files:** Create `components/redesign/RoutinesPage.tsx`, `RoutineGroup.tsx`,
`DailyPanel.tsx`, `state/reader/routines.ts`; modify `Dailies.tsx`, `EditPanel.tsx`,
`YourOwn.tsx`, `TaskForm.tsx`, `AmountEditor.tsx`, `App.tsx`; test `test/reader-routines.test.ts`,
`test/redesign-routines.test.tsx`.

**Interfaces:** `routineRows(state: ReaderState, accountId: AccountId, now: number): RoutineRow[]`;
`RoutineRow` contains original item id, account id, title, cadence, current GoalStatus, source,
placement and resolved clock revision. Follow/pin changes dispatch ReaderAction.

- [x] Add failing tests for stop/re-follow preserving logs; independent Checklist/Timeline pins; Make it mine copies the selected account's history only; selected type intent survives empty availability; new built-ins are offered, never automatically followed.
- [x] Run `bun test test/reader-routines.test.ts test/redesign-routines.test.tsx`; expect failure.
- [x] Implement library/Create your own, active routine rows, daily panel/grouped choice and three disclosure policies. Share one display preference between Routines and Appearance. Focus expands groups without saving a different policy. Native numeric inputs use step one and visible browser steppers. Keep custom event/game editing separate from built-in routine management.
- [x] Test the same daily appears exactly once; Always expanded has no collapse button; focus-All restores policy; old-revision history remains accessible in catch-up. Run named tests, existing tasks/dailies/forms tests and typecheck; expect pass. Browser-check one-action daily ticks for two accounts.

### Task 7: Account-aware Checklist and Timeline

**Files:** Create `state/reader/eventRows.ts`, `components/redesign/ChecklistPage.tsx`,
`TimelinePage.tsx`, `RoutineTimelineRows.tsx`; modify `EventRow.tsx`, `EventDetail.tsx`,
`Timeline.tsx`, `NextUp.tsx`, `App.tsx`; test `test/reader-event-rows.test.ts`, `test/redesign-timeline.test.tsx`.

**Interfaces:** `ReaderEventRow = RowEvent & { accountId: AccountId; region: Region; clockRevision: string }`;
`readerEventRows(state: ReaderState, events: readonly DisplayEvent[], now: number): ReaderEventRow[]`.
Use composite React keys/open-selection `{ accountId, eventId }`, preserving the original event id for domain state.

- [x] Add failing tests for simultaneous regions with different end times, per-account Done/Ignore and goals, custom repeated occurrences, outstanding headline/counts and focus. Standard/Compact contain identical event ids/order. Title-only Standard rows omit description-sized decoration.
- [x] Run `bun test test/reader-event-rows.test.ts test/redesign-timeline.test.tsx`; expect failure.
- [x] Extract view coordination from App; retain existing sort/zoom/recurrence semantics. Implement routine full rows and optional reset strips immediately beneath their game's events. With strips and Ending soonest, order game groups by next deadline, maintaining adjacency; without strips retain existing ending queue.
- [x] Run named tests, `test/views.test.tsx`, `lens.test.ts`, `sort.test.ts`, `zoom.test.ts`, `recurrence.test.ts`; expect pass. Browser-check both interfaces, densities, long titles, empty scope, unknown ends and Timeline scrolling.

### Task 8: Durable archive, completion confirmation and restoration

**Files:** Create `state/reader/archive.ts`, `components/redesign/ArchivePage.tsx`,
`ArchiveDetail.tsx`, `state/useArchiveTransition.ts`; modify view/detail wiring;
test `test/reader-archive.test.ts`, `test/archive-ui.test.tsx`.

**Interfaces:** `captureSeen(state: ReaderState, rows: readonly ReaderEventRow[], at: string): ReaderState`;
`reconcileArchive(state: ReaderState, events: readonly DisplayEvent[], now: number): ReaderState`;
`archiveOutcome(state: ReaderState, accountId: AccountId, eventId: string, outcome: ArchiveRecord["outcome"], at: string): ReaderState`.

- [x] Add failing tests: save Done/Ignore immediately; Undo restores prior progress/ignore state; expired unfinished snapshots retain descriptions/source/logs; missing-but-unexpired and unknown-end events remain outstanding; hidden/unfollowed catalogue events do not produce history. Retired accounts remain inspectable.
- [x] Run `bun test test/reader-archive.test.ts test/archive-ui.test.tsx`; expect failure.
- [x] Capture feed events on successful reads before feed replacement, reconcile known expiry, and resolve missing live details from seen snapshots. Implement 1.5-second row confirmation then fade/collapse and eight-second Undo, using cancellable timers. Reduced motion removes animation. Archive Restore does not make an expired event live.
- [x] Test legacy marks with no metadata are preserved and labelled incomplete, unknown ends remain null, repeated Done is idempotent, repeated custom occurrences archive separately. Run named tests and typecheck; expect pass. Browser-verify timing, navigation during delay and Undo.

### Task 9: Archive story statistics and history timeline

**Files:** Create `state/reader/archiveStats.ts`, `components/redesign/ArchiveStory.tsx`,
`ArchiveTimeline.tsx`; modify ArchivePage; test `test/archive-stats.test.ts`.

**Interfaces:** `archiveStats(records: readonly ArchiveRecord[], now: number): ArchiveStats`;
`ArchiveStats` includes monthly/overall eligible/done/rate, current/best completion run, check-ins,
unfinished, known target shortfalls and per-game outcome totals.

- [x] Add failing tests with done/ignored/unfinished/unresolved records, equal timestamps, absent goals, multi-account same dates and empty history. Assert done/(done+unfinished), ignored excluded, no NaN or invented near-miss values.
- [x] Run `bun test test/archive-stats.test.ts`; expect failure.
- [x] Implement pure totals with stable account/event tie-breaks for equal timestamps. Group done by outcomeAt and unfinished by resolved end; future/unknown ends are ineligible. Sum distinct check-ins per event/account; do not label that unique play days. Default body per-game; only real source versions get version labels. Add optional history timeline.
- [x] Run named tests and typecheck; expect pass. Browser-check compact story panel in both interfaces/themes with small and empty archives.

### Task 10: Backup retention, validated restore and recovery

**Files:** Create `state/reader/backups.ts`, `restore.ts`, `components/redesign/BackupPage.tsx`;
modify bootstrap/export wiring; test `test/reader-backups.test.ts`, `test/reader-restore.test.ts`.

**Interfaces:** `retainBackups(snapshots: readonly BackupSnapshot[], now: number): BackupSnapshot[]`;
`BackupSnapshot = { id: string; at: string; payload: object }`;
`prepareRestore(storage: Storage, payload: unknown, at: string): SaveResult`;
`finishPendingRestore(storage: Storage): SaveResult`; `undoRestore(storage: Storage): SaveResult`.
Use Task 2 export validation. Recovery and pending transaction keys are excluded from payload recursion.

- [x] Add failing retention tests spanning 400 simulated days: disjoint seven daily/four seven-day/six calendar-month buckets, month/year/leap boundaries, latest-per-bucket, missing days and timezone changes. Assert at most seventeen retained snapshots.
- [x] Add failing restore tests for malformed/unknown-version exports, quota at each write, interrupted startup, current-state recovery, undo and reader state with unreadable preserved fields. Run both named files; expect failure.
- [x] Implement rolling retention on app use and debounced successful data changes; no unchanged-state snapshot loop. Write recovery and prepared envelope before replacing live reader state. Bootstrap completes validated pending restore before mounting stores, and preserves pending data on failure. Never claim success after failed persistence.
- [x] Implement View backup → contents preview → Restore this backup; manual Back up now, export/import and Undo last restore. Preserve progress-only versus Import all semantics, including account identity mapping and imported custom dependencies; warn before overwriting ambiguous account mappings.
- [x] Run both named files, export tests and typecheck; expect pass. Browser-test real download/upload, restore and storage-failure feedback. Document local-only lifetime and no backup on unused days.

### Task 11: Appearance, custom colours and Region & time pages

**Files:** Create `state/appearance.ts`, `components/redesign/AppearancePage.tsx`,
`TimeSettings.tsx`; modify `state/theme.ts`, `state/gameMeta.tsx`, `scripts/build-static.ts`,
`redesign.css`; test `test/appearance.test.ts`, `test/appearance-ui.test.tsx`.

**Interfaces:** `appearanceTokens(prefs: Record<string, unknown>, theme: Theme): AppearanceTokens`;
`readableOnSurfaces(hue: string, backgrounds: readonly string[], minimum: number): string`.
Token values cover both interface styles, schemes and themes; minimum is 4.5 for small text.

- [x] Add failing tests for interface/scheme/density independence, malformed saved palette, same background/text, colours legible on page and panels, game overrides shared across accounts and Reset to default. Include System appearance changes without losing custom selections.
- [x] Run `bun test test/appearance.test.ts test/appearance-ui.test.tsx`; expect failure.
- [x] Implement Slate/Warm/Plum/Custom, separate light/dark base edits and derived contrast-safe rendered colours. Apply pre-paint appearance using the reader envelope so reload does not flash a different UI. Reuse Task 4 timezone formatting throughout details/archive/forms; custom-entry copy names its interpretation zone.
- [x] Run named tests, existing theme tests and typecheck; expect pass. Browser-check custom equal colours, semantic urgency, native colour/number controls, IANA search and daylight saving.

### Task 12: Shared updates, data sources and About/Changelog

**Files:** Create `state/reader/updates.ts`, `components/redesign/UpdatesPanel.tsx`,
`DataSourcesPage.tsx`, `AboutPage.tsx`, `FeedFooter.tsx`; modify `Colophon.tsx`,
`WhatsNew.tsx`, `App.tsx`; test `test/redesign-updates.test.tsx`, `test/reader-updates.test.ts`.

**Interfaces:** `updateItems(state: ReaderState, feed: EventFeed, now: number): UpdateItem[]`;
`UpdateItem` is a discriminated union of event-newness, code-newness, release and source-age rows.
`FeedFooter({ sources, now, online, onRefresh, onAbout })` always retains feed-age disclosure.

- [x] Add failing tests: followed-games source scope independent of focus; one fresh sibling does not conceal old source; never-fetched/unchanged/overdue/unknown reasons; code/events/release markers clear independently; no empty updates panel.
- [x] Run `bun test test/redesign-updates.test.tsx test/reader-updates.test.ts`; expect failure.
- [x] Move notices into shared compact rows above Checklist/Timeline, using exact source-age copy from spec. Show source detail timestamps honestly; do not invent failure causes absent from feed. Preserve Check for new data's result/offline semantics. Mark seen event ids only after the relevant content has been presented; initial migration seeds already-known event ids to avoid announcing the whole calendar.
- [x] Extract full colophon to About, retain all credits unfiltered, and keep short age/About footer without Changelog. Lists contains actual list settings, no Done/ignored archive-link row. Run named tests, existing refresh/changelog tests and typecheck; expect pass.

### Task 13: New and returning reader onboarding

**Files:** Create `components/redesign/SetupWizard.tsx`, `ReturningTour.tsx`,
`state/reader/onboarding.ts`; modify `Welcome.tsx`, `App.tsx`;
test `test/redesign-onboarding.test.tsx`, `test/reader-onboarding.test.ts`.

**Interfaces:** `setupReader(draft: SetupDraft, existing: ReaderState, at: string, mint: () => AccountId): ReaderState`;
`SetupDraft` contains default region, interface/theme/scheme/timezone, selected games, per-game
TrackingIntent, showUpcoming and preferred `View`. Saved tour marker `redesignTourSeen: "2026-10-redesign"` is separate from changelog markers.

- [x] Add failing tests: initial events-only intent and upcoming off; unavailable cycles selectable; initial supported selections opt in deliberately; additional server uses fresh setup; new-user defaults never overwrite migrated answers. Skip/Back/finish preserve state and return to original main view.
- [x] Run `bun test test/redesign-onboarding.test.tsx test/reader-onboarding.test.ts`; expect failure.
- [x] Implement short preference/game/tracking/view steps and inline type explanations. Upcoming control appears only in tracking step. Persist completed setup once. Returning welcome/tour is offered once on either preferred main view; skipping records dismissal, with a replay link in General.
- [x] Run named tests, existing welcome/prefs tests and typecheck; expect pass. Browser-check both entry paths, keyboard, backtracking and reload after completion.

### Task 14: Deterministic Genshin codes source and published contract

**Files:** Create `src/shared/codes.ts`, `src/ingest/codes/game8.ts`, `registry.ts`,
`build.ts`, `scripts/build-codes.ts`, `fixtures/genshin/game8-codes-2026-10-16.html` and
matching expected JSON; modify refresh orchestration, build scripts, package scripts, static server
and service-worker feed handling; test `test/codes.test.ts`, `test/adapters/game8-codes.test.ts`,
`test/codes-refresh.test.ts`.

**Interfaces:** `RedeemCode = { id: string; game: GameId; code: string; reward: string | null; expiresAt: string | null; firstObservedAt: string; sourceUrl: string }`;
`CodesFeed = { schemaVersion: 1; codes: RedeemCode[]; sources: SourceHealth[] }`;
`parseGame8Codes(html: string, ctx: ParseContext): Omit<RedeemCode, "firstObservedAt">[]`;
`buildCodesFeed(previous: CodesFeed | null, parsed: readonly Omit<RedeemCode, "firstObservedAt">[], at: string): CodesFeed`.
Use code identity `JSON.stringify([game, code])`, preserving literal code case/punctuation from the source.

- [x] Read INGESTION/SOURCES and the real Game8 page/robots through the approved source workflow. Fetch at most once after checking existing cache and six-hour floor; pin actual bytes and independently count the page. If access is refused, do not bypass it; record that condition and seek owner-provided bytes for the fixture rather than fabricate data.
- [x] Add failing tests from pinned bytes: active versus expired sections, unknown reward/expiry, duplicate codes, HTML entities, changed page shape, stable first-observed date across unchanged rebuilds, and failed fetch retaining the previous feed.
- [x] Run `bun test test/codes.test.ts test/adapters/game8-codes.test.ts test/codes-refresh.test.ts`; expect failure.
- [x] Implement pure parser plus a separate `data/codes.v1.json` feed. Reuse robots, conditional-fetch, SnapshotStore, host spacing and failure reporting; do not weaken event Adapter's GachaEvent return contract. The unified refresh scheduler must share host spacing across both source kinds. Offline builds use real fixtures only. Codes do not alter existing event feed ids or event counts.
- [x] Run named tests and offline build; expect pass. Update INGESTION/SOURCES/ARCHITECTURE and workflow copy/build paths so the feed is deployed and cached. Network fetch is not part of tests.

### Task 15: Code pages, discovery notices and redemption

**Files:** Create `components/redesign/CodesPage.tsx`, `state/reader/codes.ts`;
modify `api.ts`, GameSettings and UpdatesPanel; test `test/reader-codes.test.ts`, `test/codes-ui.test.tsx`.

**Interfaces:** `newCodes(feed: CodesFeed, seen: readonly string[], game: GameId): RedeemCode[]`;
`fetchCodesFeed(signal?: AbortSignal): Promise<CodesFeed>`.
Viewing writes `codeSeen[game]`; redemption writes only `codeRedeemed[accountId][codeId]`.

- [x] Add failing tests: viewing clears newness without redemption; redeeming one account leaves another unredeemed; expired known code does not become new again; unavailable codes feed leaves events usable; code arrival does not clear new events/release notices.
- [x] Run `bun test test/reader-codes.test.ts test/codes-ui.test.tsx`; expect failure.
- [x] Bind game Codes page and in-app notices to the real feed, with copy control, source/reward/known-expiry fields and per-account redeemed state. Show honest empty/unavailable/stale states, never sample codes. Update refresh comparison to account for code changes separately from event-feed build stamps.
- [x] Run named tests and typecheck; expect pass. Browser-check feed update, Copy, view-seen behaviour and independent two-server redemption; verify exports/backups include state.

### Task 16: Built-app verification, documentation and final independent review

**Files:** Update `docs/PRD.md`, `DATA-MODEL.md`, `ARCHITECTURE.md`, `DESIGN.md`,
`PRODUCT.md`, affected AGENTS guidance, `TODO.md`; record evidence in
`docs/design-reviews/2026-10-16-redesign-implementation.md`. Keep browser tooling in `/tmp`.

**Interfaces:** All previous tasks' contracts; no new domain API.

- [x] Run `bun run typecheck`, `bun test`, `git diff --check`; expect all pass. Read full failures, not only the command exit status. Confirm tests run without docs/public build output, using the repository's Docker-layout check when needed.
- [x] Run `bun run build:css`, `bun run build:js`, `bun run build:static`; serve on a fresh distinctive port with an existing/copied real feed. Inspect Chrome screenshots for 390/1440px, both interfaces, both themes, Standard/Compact, 200% zoom and reduced motion. No horizontal page overflow, clipped panels or console errors.
- [x] Browser journeys: legacy-save migration; first and returning onboarding; two servers; reset override/backward-day/revert; direct dailies; routine pin/disclosure; event detail/edit; completion/Ignore/Undo; archive/history/stats; source-age scenarios; custom palettes/timezone; real code discovery/redemption; export/import/restore/undo; offline reopening and update prompt.
- [x] Perform a fresh whole-change review using the native execution skill's final reviewer. Review data-loss paths, source honesty, storage failures, shared contracts and all five Review Focus items. Fix critical/important findings with reproducing tests and rerun the suite; record remaining minor findings explicitly.
- [x] Finalize shipped docs to match actual behaviour and both visual systems. Report changes, evidence and limitations. Leave work uncommitted and unpublished until the owner requests those actions; no merge/branch cleanup is needed on main.

## Execution record and handoff

Use `.superpowers/sdd/2026-10-16-ui-redesign/progress.md` for task status, verification evidence
and rulings. A task is complete only after its named checks pass. User selected Native execution;
do not ask for the method again. The writing-plans skill requires owner review of this concrete
plan before implementation begins. After that review, execute all tasks continuously, with status
updates and no further per-task approval prompts. The final review is the only planned delegated
work; implementation stays native.

Self-review: all approved spec sections map to Tasks 1–15; migration, failure recovery and source
integration have explicit gates. Shared contracts are declared above and used consistently.
Task 14 has an honest external prerequisite: real source bytes and policy validation. A refused
source is not permission to invent data or declare the codes feature finished.


Completion evidence: [implementation review](../../design-reviews/2026-10-16-redesign-implementation.md).
All 16 feature/verification tasks are complete, uncommitted. The ledger records staged activation,
wrapper-file substitutions, review fixes and the stronger IndexedDB fallback in place of an unlocked
revision retry. Some expanded render checks passed immediately after their already-implemented
behaviour; they are coverage evidence, not claimed RED runs. No commit/push/publication performed.

## Fidelity correction follow-through — 2026-10-17

The original completion statement above describes the rejected first implementation. The subsequent
correction follows the approved reference composition and the owner's new Structured-default ruling.
See `docs/design-reviews/2026-10-17-redesign-fidelity.md` for matched screenshots, independent findings,
resolved verdicts and final functional verification. Final review cleared the reported corrections;
owner acceptance is not inferred from that review. All changes remain uncommitted and unpublished.
Settings now places the replay control under Default view, replacing the previous General page.
