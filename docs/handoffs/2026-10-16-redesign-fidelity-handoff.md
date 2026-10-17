# Event Clock redesign: handoff to the replacement agent

> **Newer handoff:** the replacement implementation was also rejected. Read
> [2026-10-17 second-rejection handoff](2026-10-17-redesign-second-rejection-handoff.md) first.
> The owner's next-step instruction is to launch the current server, then ask them for the biggest
> differences from the mockup before making more UI changes.

Date: 2026-10-16. Repository: `/home/user/gacha-event-tracker`.

**2026-10-17 owner amendment:** Structured is now the default. Preserve any explicitly saved
Relaxed choice. The references and the historical rejection described below remain unchanged.
Correction evidence is recorded in `docs/design-reviews/2026-10-17-redesign-fidelity.md`.

## 1. Assignment and current acceptance status

**Finish the already-approved redesign by faithfully translating the approved mockup markup into
production React and wiring in real data. The current implementation was rejected by the owner.**

The owner approved Round 7, then explicitly chose to retain two interfaces with a Settings toggle:

- **Relaxed (default):** `design/mockups/round7/converged.html`.
- **Structured:** `design/mockups/round6/b-rail.html` — specifically Round 6 **B**, not A or C.

The owner subsequently reported that the implementation differed substantially from Round 7 and
asked why the previous agent had invented a design instead of using the markup and wiring data.
The previous agent acknowledged that this is what happened: it reused old visual components and
selected mockup CSS, built substitute pages, then verified functionality rather than fidelity.

**Do not repeat that approach.** Preserve the approved rendered structure, hierarchy, proportions,
spacing, typography, control arrangements, information architecture, responsive behavior and
interactions. Translate HTML to JSX, break it into maintainable components and connect real state.
The existing presentation is not the reference. Matching fonts and outer panel sizes is insufficient.

Do not transplant the prototype's fake data, fixed clocks, demo toolbar, localStorage namespace or
monolithic demo JavaScript into production. That restriction was previously misinterpreted as
permission to redesign its presentation. It is not. Real-data integration should retain the markup.

The owner selected **Native execution** and had already approved the spec/plan before implementation.
The task is to finish that approved design, not restart brainstorming or request permission for each
routine correction. Resolve actual conflicts explicitly; do not make new product choices silently.
This handoff-writing turn makes no implementation changes and does not complete the correction.

## 2. Read these records, in this order

1. `AGENTS.md` — complete repository working agreement, not just the excerpt in a chat.
2. This document and the approved reference HTML files above, **rendered in a browser**.
3. `docs/design-reviews/2026-10-16-redesign-round7.md` and corresponding round4/round5/round6 records.
4. `docs/superpowers/specs/2026-10-16-ui-redesign-design.md` — approved functional/state requirements.
5. `docs/superpowers/plans/2026-10-16-ui-redesign.md` — implementation inventory, not evidence of acceptance.
6. `docs/PRD.md`, `PRODUCT.md`, `DESIGN.md`, `DATA-MODEL.md`, `ARCHITECTURE.md`; source work additionally
   requires `INGESTION.md` and `SOURCES.md`.
7. `docs/design-reviews/2026-10-16-redesign-implementation.md` — prior verification, rejection audit,
   HTTP follow-up and representative **rejected implementation** screenshots.
8. `.superpowers/sdd/2026-10-16-ui-redesign/progress.md` and `review-packet.md` — historical ledger.

Important record caveats:

- The plan's checkboxes were all marked complete before the owner rejected the result. Presentation
  and fidelity gates must be reopened; do not treat those checks as acceptance.
- The spec's opening “written for owner review; not implemented” status is stale. Its requirements
  were approved; implementation exists but is rejected. Distinguish intent from implementation status.
- Most product/design docs were rewritten to describe the rejected implementation. Their design
  descriptions cannot override the approved mockup or the owner's later correction. Repair this
  documentation drift as the faithful implementation lands.
- The Round 7 review initially discussed one UI; its later owner-decision note supersedes that:
  retain **two**, Round 7 and Round 6 B.
- `2026-10-16-110223-command-messagesuperpowersusing-superpowersc.txt` is an earlier transcript supplied
  by the owner. It predates later work; it is supplemental, not the only record of current decisions.

## 3. Workspace and authorization

Last inspected HEAD: `ee41389` (`docs: a handoff note for the next agent, and the worktree feed trap`).
Implementation was made in place on `main`. **All redesign changes remain uncommitted.** No push,
PR, publication or deployment was performed by this agent. The owner has separately built/used the
app through their network, so browser data may already contain v2 state.

Run `git status --short` before work. There are many modified tracked files and many untracked new
files; `git diff` alone omits most new implementation code. Preserve them. In particular, do not
`git clean`, reset to HEAD, delete all untracked files, or discard the state work to obtain a clean
starting point. Earlier untracked `.impeccable/`, design artifacts, transcripts and review documents
also existed and must not be treated as disposable agent scratch.

The approved plan says to use the current checkout; do not create a branch/worktree, commit, push,
or publish without a separate owner instruction. The owner's standing workflow is to carry approved
work through execution without repeated approval stops. Keep progress communication concise and
report genuine problems directly.

## 4. What went wrong, concretely

The previous implementation created `ReaderApp.tsx`, reused old `EventRow`, `NextUp`, `Timeline`,
`EventDetail` and `Colophon` presentation, and added `redesign.css` plus new simplified pages.
That produced functional features with materially different presentation and interactions.

Confirmed divergence examples — this is a starting inventory, not an exhaustive audit:

| Area | Approved reference | Rejected implementation |
| --- | --- | --- |
| Header | Navigation counts; intentional Settings placement; mockup header hierarchy | Generic navigation and a different live/upcoming summary |
| Standard events | Event content, prominent separate deadline/supporting text, chevron, deliberate meter placement | Old EventRow internals decorated with CSS; different countdown hierarchy and layout |
| Routines | Per-game bands, aligned routine/progress/cycle/pin/menu columns and appropriate library/create flows | Flattened library rows with stacked checkbox options |
| Settings | Sidebar includes individual game entries/descriptions leading into game profiles | Generic Your games page with a game dropdown |
| Timeline | Routine periods/progress and reset markers plotted on the same time axis as events | Event timelines followed by ordinary routine controls; textual reset strips |
| Archive | Story panel plus interactive per-game outcome bars/filtering and the approved per-game/history bodies | Simplified statistics and per-game text totals |
| Forms/overlays | Approved drawers, sheets, field groupings and hierarchy | Several older production forms and modal layouts reused |
| Mobile | Mockup-specific compact rail, hierarchy and responsive adaptations | Generic stacking; screenshots showing no overflow were accepted without reference comparison |

The earlier independent review concentrated on storage safety and functional correctness. It found
important real bugs, which were fixed, but it did not establish design fidelity. **1,590 passing
tests is not evidence that this is the approved design.** Screenshots in the earlier implementation
report document the rejected result; do not use them as visual goldens.

## 5. How to read the mockup correctly

The reference HTML is layered: it contains earlier CSS/render functions, then later overrides.
Reading its first stylesheet or first definition of a renderer in isolation gives the wrong target.
Render the complete file and exercise its actual controls.

Useful anchors in Round 7 (line numbers are approximate; search the names):

- Final airy system begins around line 1003: `/* A single airier world, informed by the original C planner. */`.
- Header `tabs()` around 1336; initial `baseRoutinesScreen()` around 1392; `settingsScreen()` around 1480.
- Later `round4Checklist()` around 1894; final timeline renderer around 1912.
- Final `checklistScreen()` around 1976; `archiveStory()` / `renderArchive()` around 1989.
- Final `routinesScreen()` around 2051; later render/tour/number-input adjustments around 2065.
- Final `generalPane()` around 2073, `onboarding()` around 2085, `returningTour()` around 2087.

The reference has its own review toolbar, shortcuts, fixed `NOW`, synthetic histories and namespace
`event-clock:mockup:round7:v1`. Those are tools for inspecting states, not product UI/state to ship.
Capture all relevant states using that toolbar and the product's controls. Do the equivalent for
Round 6 B; do not assume it is merely Round 7 with a border-radius change.

Some demo behavior is explicitly superseded by owner requirements: e.g. adding a server must start
fresh choices, not copy follows/pins just because an old prototype handler does. The stale-data label
must be **Event data may be out of date**, replacing the mockup's **Older schedules**. The two-interface
selector is an approved addition to Appearance. Keep these necessary adaptations narrow and explicit.

## 6. Approved requirements to retain

The detailed spec remains necessary. This summary preserves the accumulated owner feedback:

- Two visual interfaces over shared real state/components; Relaxed default. Interface, theme,
  colour scheme and Standard/Compact row density are independent.
- Standard rows without descriptive text are shorter, with no reserved empty description area.
- Focus uses the existing All/game pills, counts, toggle-to-All and Next behavior, first in the
  Checklist rail as in B. It hides for one tracked game and never changes followed games.
- Checklist, Timeline, Routines, Archive and Settings are the main navigation. Utility navigation
  must not overwrite the saved preferred main view (`soon` / `timeline`).
- Source age belongs in the same compact updates structure as new-since-last-look notices, only
  when tracked games have stale data. Source scope is independent of temporary focus. Codes,
  event newness, release news and source age are distinct states. Keep reasons/timestamps/source
  links in detail and Data & sources; never invent a failure cause. Footer always states data age.
- Routines are rows. Manage built-ins, custom routines, follow/unfollow, Make it mine, and independent
  Checklist/Timeline pins there. Stopping a routine preserves history. Keep daily ticks one action.
- Dailies can have their own Checklist panel or be grouped with routines; the same setting appears
  in Routines and Appearance. Group policy: collapsed, expanded by default, or always expanded.
  Focus temporarily expands groups without rewriting the policy. Numeric controls have visible
  native steppers and step one.
- Timeline routines belong on the time axis. Separate reset strips, when enabled, sit beside their
  game's events. Preserve the cross-game Ending soonest queue when strips are off; focus applies
  to events, routines and reset strips together.
- Add another server explains simultaneous accounts and asks all tracking questions again. It copies
  no progress, follows or pins. Changing an existing server preserves that account's identity/history.
  Prevent duplicate active game/server setup; retired histories remain recoverable.
- Each game's settings includes Setup, Codes and About. About names all relevant real sources,
  links them and thanks editors, including sources contributing zero events. Game colour has picker,
  hex, preview and reset, shared across that game's servers.
- Per-server reset timing has an override and Revert to Automatic; preserve historical clock revisions.
  Display timezone defaults to Automatic, permits named IANA zones/search and revert, and affects
  display/manual date entry rather than server periods or source instants.
- Appearance includes Slate/Warm/Plum/Custom; custom light/dark palettes, game identity and urgency
  remain legible and distinct. Preserve offline font fallback.
- About retains the full colophon, acknowledgements, sources, studios, disclaimer and project links.
  Changelog is its own Settings page, **not a footer link or an About button**.
- Lists must contain actual settings, not a pointless Done/ignored row linking to Archive.
- New setup initially selects **events only**. Ask default server, appearance, timezone, games,
  tracking types and preferred main view. Types explain cycles and remain selectable even when
  nothing is available; explain the absence. Upcoming visibility belongs in “What do you want to
  track?”, initially off. Do not change existing readers to new-reader defaults.
- Returning users get a one-time welcome/tour with Skip/Back; preserve progress and preferred view.
- Done/Ignore saves immediately, explains movement to Archive for about 1.5 seconds, then fades/
  collapses. Undo lasts about eight seconds; Archive Restore remains available. Honor reduced motion.
- Archive retains real metadata/logs/outcomes, defaults to per-game history, offers alternate history
  timeline and the approved story statistics/outcome bars. Exclude ignored/unresolved entries from
  completion-rate denominators; unknown ends stay unknown. Explain incomplete pre-redesign history.
- Backups retain seven daily, four weekly and six monthly snapshots, latest per disjoint UTC bucket,
  plus recovery. Created during app use, not magically on unused days. View backup → preview →
  Restore this backup; support recovery/Undo. Keep progress merge distinct from full restore.
- Real codes notify in-app. Viewing clears per-game newness separately from per-server redemption;
  codes and event newness do not clear one another. No sample codes/history/health as production data.

## 7. Existing implementation map: preserve useful machinery, replace presentation faithfully

Production entry is `main.tsx` → `App.tsx` (stable re-export) → `ReaderApp.tsx`.
`ReaderContent` coordinates pages, focus, feed/state, archive transitions, settings and detail adapters.
Only the **v2 reader store** is mounted for production writes. Older hooks still supply validators,
types and pure helpers; **do not mount their v1 persistence effects alongside the v2 store**.

| Files | Existing responsibilities / cautions |
| --- | --- |
| `src/client/state/reader/schema.ts` | Zod v2 envelope, stable local account IDs, clocks, placements, archive/seen snapshots; passthrough unknown fields; account/clock reference validation |
| `migration.ts`, `legacy.ts` | v1 migration, original-account mapping, retained raw bytes, startup old-tab deltas and deletion handling |
| `store.ts`, `reducer.ts`, `lock.ts`, `useReader.ts` | Serialized read-latest writes, operation replay, field timestamps/tombstones, account/pin rebase, storage-event updates, visible save errors |
| `accounts.ts`, `clock.ts`, `src/shared/readerClock.ts` | Account lifecycle, automatic clock metadata revisions, override/revert, active versus historical-only imported clocks |
| `eventRows.ts`, `routines.ts` | Account-aware real selectors and custom recurrence projection; useful data sources for faithful new markup |
| `archive.ts`, `archiveStats.ts`, `aliases.ts` | Durable snapshots/outcomes/restore/expiry, real statistics, retired/merged ID carry |
| `backups.ts`, `restore.ts`, `export.ts`, `import.ts` | UTC retention, validated versioned envelopes, recovery/pending restore, legacy imports, progress-only merge |
| `ids.ts`, `actions.ts` | HTTP-compatible identity generation, action timestamps/operation IDs |
| `src/client/state/appearance.ts` | Saved palette plus readable derived tokens against surfaces; check reference fidelity when applying |
| `src/client/state/displayTime.ts`, `CustomForms.tsx`, `useCustom.ts` | IANA display formatting, manual wall-time parsing, DST behavior and interpreted-zone context |
| `src/shared/time.ts`, `daily.ts`, `goal.ts`, `task.ts` | Existing domain rules extended with optional injected reset timing; defaults preserve old behavior |
| `src/client/components/redesign/` | Current replacement pages — functional starting points, **not accepted presentation** |
| `src/client/redesign.css`, `styles.css`, `index.html` | New overrides/fonts/prepaint; existing old CSS/components still influence internals |
| `api.ts`, `sw.js`, `useAppUpdate.ts` | Separate event/code feeds; network-first data; unchanged waiting-worker update handshake |

Existing UI files include AppNavigation, SettingsLayout, GameSettings, RoutinesPage, DailyPanel,
RoutineGroup, RoutineHistory, TimelinePage, ArchivePage/ArchiveStory, BackupPage, AppearancePage,
TimeSettings, UpdatesPanel, DataSourcesPage, FeedFooter, SetupWizard, ReturningTour, TrackingChoices,
CodesPage and ChangelogPage. Reuse their real operations where sound; change their markup/layout to
match the approved reference. Do not preserve a rejected arrangement just to keep a component name.

The prior wrapper-file substitutions are recorded in the ledger. They do not justify retaining
presentation mismatches. Likewise, prior DOM/render tests may assert the rejected structure; update
those intentionally while retaining meaningful state, accessibility and data-preservation coverage.

## 8. Data that must survive this correction

Browser-local accounts are game/server tracking identities, **not authentication accounts**.
There is no server copy of user progress. UI work must preserve existing v1 and already-created v2
state, account IDs, original event/task/daily IDs and day/period labels.

Active storage keys:

```
gacha-tracker:v2:reader
gacha-tracker:v2:migration-recovery
gacha-tracker:v2:backups
gacha-tracker:v2:restore-pending
gacha-tracker:v2:restore-recovery
```

Do not delete `gacha-tracker:v1:*`. `ReaderState` contains `accounts`, per-account `data` with progress/
ignored/daily/amount maps, `archive`, `seenEvents`, prefs, custom games/events/tasks, `codeSeen`,
`codeRedeemed` and `eventSeen`. Daily/amount maps are nested under clock revision. Archive/seen keys
are `JSON.stringify([accountId,eventId])`; those are distinct from immutable domain IDs.

Actions carry timestamps and operation IDs. Ordinary writes use Web Locks; browsers without Web
Locks use an IndexedDB readwrite transaction mutex. Failure is disclosed without publishing a
successful in-memory save. Account updates capture a base and rebase changed routine/pin fields.

Exports: `format: "gacha-tracker-export"`, `version: 2`, `exportedAt`, `reader`, `legacy`; progress
exports mark `scope: "progress"`. Full restore validates first and saves recovery plus a pending
transaction before replacing live state; bootstrap resolves pending restore before mounting writers.
Progress imports merge by game/server, preserve local prefs/active reset, retain imported clock
history and preserve unknown extensions. Backups are outside the envelope to avoid recursive growth.

Important fixes already made and regression-tested — retain them:

- Initial event-newness seeding is batched; per-account effect writes previously created an
  O(accounts²) queue that made settings appear unresponsive.
- Capture/reconciliation waits for finished onboarding; otherwise unchosen catalogue games enter
  new readers' seen history before they select games.
- Deleted custom events/occurrences must not reappear from seen-event fallback. A vanished source
  event with an unpassed/unknown end remains accessible; distinguish deletion from source absence.
- Imported clock revisions retain historical logs without changing the local active reset.
  Equality ignores import-only `historicalOnly` so repeated imports do not duplicate revisions/logs.
- Incoming opaque root/account extensions survive subsequent exports/transfers and deduplicate.
  Imported seen markers remain distinct from redemption and are merged appropriately.
- Retired accounts Resume by actually removing `retiredAt`; changed-field rebase must handle deletion.
  Independent tabs editing pins on the same routine must preserve both fields.
- Reset override/revert and automatic metadata correction append revisions, never rewrite old ticks.
  History resolves the explicit original revision, not today's reset.
- Alias carry includes amount history and archive/seen snapshots as well as progress/daily/ignore.
- v2 preferences are read before initial paint; user choices must not be replaced by old v1 defaults.
- Manual refresh fetches both feeds, ignores build-only timestamp movement and discloses partial
  code-feed failure. Codes page discloses stale data. Source diagnostics never invent missing causes.
- Native numeric controls keep a local draft so async persistence does not swallow rapid typing.

These foundations have substantial tests, but are not an assurance that every integration is correct.
Review real consumers while changing markup; do not label the state layer or presentation complete
without verifying the resulting flows.

## 9. Critical HTTP/WireGuard regression: do not reintroduce

The owner uses an HTTP network address through WireGuard: **10.20.20.2**.
They encountered on first visit:

> Event Clock could not open. Your saved data could not be opened safely…

Exact reproduction: plain HTTP hostname in Chrome → `isSecureContext === false`,
`crypto.randomUUID` undefined, `crypto.getRandomValues` available. Startup account minting threw;
`initializeReader` caught it and returned generic `unavailable`, misleadingly blaming saved data.
Localhost-only checks missed it because localhost is treated as a secure context.

Fixed in `state/reader/ids.ts` using 128-bit `crypto.getRandomValues` tokens. Use `mintAccountId()` for
new accounts and `mintLocalId()` for operations, reset revisions and backups. **Never reintroduce
direct client `crypto.randomUUID()` or remint existing IDs.** There are three new regressions in
`test/reader-http.test.ts` that failed before the fix. Existing legacy bytes were preserved.

Actual HTTP-origin browser checks pass: old-progress migration, new setup, editing, extra server,
reset override/revert, backups and reload. IndexedDB locking works on this origin too. Secure-only
features must degrade honestly (e.g. clipboard may require manual copy; a service worker is not
available on ordinary HTTP). Do not claim HTTP offline support just because localhost SW tests pass.

## 10. Codes ingestion is real and already implemented

Do not replace it with prototype codes or repeat external fetching just to work on presentation.

- Source: `https://game8.co/games/Genshin-Impact/archives/304759`.
- One descriptive-aggregator robots request and one page request returned 200 during capture.
  No header-shaping/access workaround or repeated community requests were used.
- Pinned: `fixtures/genshin/game8-codes-2026-10-16.html`, expected JSON and capture metadata.
- Snapshots: `snapshots/genshin-game8-codes.html`, meta, `snapshots/codes-first-seen.json`.
- Parser/registry: `src/ingest/codes/game8.ts`, `registry.ts`, `build.ts`.
- Offline builder: `scripts/build-codes.ts`; published file `data/codes.v1.json`.
- `src/shared/codes.ts` validates codes/feed. Source-stated calendar expiry is `expiresOn`, not a
  fabricated `expiresAt` instant. Unstated expiry remains null. First observation survives rebuilds.
- The captured current section has ten actual codes; the three expired programme codes are fenced
  out. Tests include a future-expiry variant that admits those programme codes appropriately.
- `scripts/refresh-sources.ts` combines event adapters and count-only code sources under the original
  robots, six-hour floor, host spacing, conditional requests and snapshot gates. Event adapters
  still return GachaEvent arrays; codes are not fake events.
- `package.json` build includes `build:codes`; the service worker caches the separate feed correctly.

Use the fixtures/snapshots offline. Existing parser/date rules and source conduct remain binding.
No SQLite, remote sync, push service, unrelated parser changes or new runtime dependencies are needed.

## 11. Verification already available — and its limits

Latest completed verification after the HTTP fix:

- `bun test`: **1,590 pass, zero failures, 75 files**.
- `bun run typecheck` and `git diff --check`: pass.
- Full offline build before the HTTP follow-up: 209 events across 20 games, ten codes.
- Latest JS/static rebuild after HTTP fix: shell `9752bd6bf1d2`, 119 bundled modules.
- Earlier Docker COPY-layout suite, without docs/public: 1,586 pass, one intentional README-only
  skip, zero failures (before the three HTTP tests were added). Recheck after your changes.
- Independent read-only reviews found/fixed several storage/integration issues; focused HTTP review
  found no important issues. These reviews did **not** establish visual fidelity.

Prior browser checks covered migration, default view, both interfaces/themes at 1440/390, densities,
reduced motion, an effective 200% CSS viewport, onboarding, direct ticks, extra servers, reset history,
code redemption, Done/Ignore/Undo, custom unknown-end events, real JSON download/upload/restore,
backup restore/Undo, timezone search, offline reload and the actual waiting-service-worker prompt.
These are behavioral evidence and regression starting points; the owner still rejected the UI.

Tests that pin state, clocks, source honesty, archive denominators, retention, quota/recovery and
imports remain valuable. Some late render tests passed immediately because code already existed;
not every historical checkbox is evidence of a genuine RED test run.

## 12. Local tools and traps

Commands (Bun, React 19, strict TypeScript, Tailwind, Zod; use existing dependencies):

```bash
bun test
bun run typecheck
bun run build:css
bun run build:js
bun run build:static
PORT=<fresh-port> bun run serve.ts
bun run build             # offline feed + codes + shell, no wiki fetch required
git diff --check
```

- Use `--production` exactly as the existing JS build does. `NODE_ENV=production` or a define alone
  can produce a cleanly built bundle that crashes with jsxDEV errors; real-browser loading is required.
- **Fresh port after each rebuild:** a localhost/HTTPS service worker caches the shell cache-first.
  Do not diagnose old cached bundles as new-code behavior. Ordinary HTTP also caches JS/CSS in-browser;
  use fresh origins/cache bypass for verification and a hard refresh for the owner.
- Stop only your own servers by exact PID/port; never `pkill -f serve.ts`.
- To inspect the reference directly, serve a separate scratch origin with
  `PUBLIC_DIR=design/mockups PORT=<another-fresh-port> bun run serve.ts`, then open
  `/round7/converged.html` or `/round6/b-rail.html`. Keep mockup and production browser contexts
  separate. Never point prototype handlers at production storage.
- Last known preview servers were 41880 and 41881, serving rebuilt `public/`; recheck before use.
  Earlier verification servers 41873–41879 were stopped. Do not assume temporary processes persist.
- `public/data/` is ignored. A fresh checkout/worktree has no feed until built/copied. No worktree is
  requested here, but this trap matters if the environment is reconstructed.
- Browser storage seed is now v2 after initialization. `gacha-tracker:v1:prefs` with `onboarded:true`
  works only before first migration. Use disposable contexts and reload after intentional seeding;
  do not let mounted effects race test setup or touch the owner's real storage.
- Wait for rendered content, not `networkidle0`. Use `textContent`, because CSS uppercase changes
  `innerText`. Keep capture scale about 3× or less to avoid blank sticky panes.
- Tests must not require build output or docs. `test/serve.test.ts` creates its own tree.
- In this tool sandbox, localhost listening misleadingly reported EADDRINUSE; unrestricted runs
  passed. Tests/Chrome/server calls required the appropriate tool escalation. Do not confuse that
  restriction with an actual application failure.

Chrome: `/usr/bin/google-chrome-stable`. Scratch Puppeteer import used successfully:

```
/tmp/claude-1000/-home-user-gacha-event-tracker/06f9b760-325c-487b-bd28-0493ad38d1b2/scratchpad/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js
```

Scratch Prettier: `/tmp/gacha-redesign-format/node_modules/prettier/bin/prettier.cjs`.
No browser/format dependency was installed into the project. Discover/recreate scratch tooling if
these paths do not survive; do not add runtime dependencies for it.

Temporary browser scripts (inspect their origins/selectors and adapt; these assert rejected markup):
`/tmp/redesign-browser-journeys.mjs`, `redesign-browser-matrix.mjs`, `redesign-browser-custom.mjs`,
`redesign-browser-update.mjs`, `redesign-browser-release-matrix.mjs`, `/tmp/check-reader-release.mjs`.
HTTP reproduction/fix verification: `/tmp/reproduce-reader-first-visit.mjs`, `/tmp/verify-reader-http.mjs`.
The latter launches Chrome with `--no-proxy-server` and
`--host-resolver-rules=MAP event-clock.test 127.0.0.1` and uses `http://event-clock.test:<port>`.
This exercises the HTTP security boundary locally; no request to the owner's WireGuard machine is
necessary. Temporary artifacts are not the durable source of requirements or acceptance.

## 13. Recommended correction sequence

1. Inspect the complete approved Round 7 and Round 6 B in a browser. Inventory screens, controls,
   overlays and states. Capture the target before editing. Start with the real rendered markup.
2. Reopen the plan's presentation/fidelity gates. Record a concrete component mapping from reference
   elements to JSX and existing selectors/actions. Keep already-tested domain/state machinery where
   correct. Do not create another design or hide differences behind new CSS overrides.
3. Port the shared shell and Checklist faithfully, including exact event structure, header/counts,
   rail hierarchy, daily tick treatment, grouped routines, update rows, Standard/Compact and mobile.
4. Port Routines/library/create/edit, per-game settings/sidebar/profiles, appearance/timezone and
   source/backup/about/changelog pages. Preserve the approved information architecture and controls.
5. Correct Timeline as a genuine shared time-axis view, with routine periods/progress/reset markers,
   optional adjacent reset strips and the correct global queue. Preserve account-aware identities
   and event opening for multiple servers/custom occurrences.
6. Port Archive story/outcome bars/filtering, per-game/history layouts, details and both onboarding
   flows. Connect actual empty, unavailable, stale, unknown-end and legacy-history states honestly.
7. Verify each screen against equivalent reference states while developing, then repeat the full
   matrix and behavior/data-preservation suite. Update docs to the accepted result, not to a newly
   invented substitute. Leave integration/commit/publication for explicit owner instruction.

This is suggested sequencing, not permission to defer required screens. Complete the approved scope.
If production facts require a genuine departure, identify the exact reference behavior and reason;
do not silently substitute a different interaction.

## 14. Completion criteria for the next agent

- Side-by-side target/production comparison for both references in equivalent states, using matched
  or deliberately representative content. Explain data-dependent differences rather than dismissing
  markup/layout mismatches as real-data effects. Inspect DOM structure and computed styles where
  useful; screenshots alone do not verify hidden interactions.
- Check Checklist, Timeline, Routines, library/create/edit, game Setup/Codes/About, every Settings
  page, Archive/history/details, new onboarding and returning tour, including empty/error states.
- Desktop and phone, light/dark, Standard/Compact, multi-game and focused/single-game, two servers,
  long titles, missing descriptions, unknown ends, stale/fresh sources, custom colours/timezone,
  keyboard/focus, reduced motion and 200% effective viewport. No clipped controls or page overflow.
- All existing meaningful regressions plus updated presentation tests, strict typecheck, production
  build and real-browser load pass. Tests remain offline and independent of public/docs.
- Ordinary HTTP network-origin startup and subsequent writes remain working. Preserve all migration,
  recovery, cross-tab, reset-history, code-newness/redemption and import/export protections above.
- A final reviewer must explicitly compare against the approved rendered mockups as well as audit
  correctness. Review “looks similar” or “no overflow” is insufficient. Do not report completion
  based on counts of passing tests while known design differences remain.
- Update AGENTS/product/design/data/architecture/source docs and handoff/status records honestly.
  No false completed checkboxes; record material limits and no invented data. No commit/push/publish
  without authorization.

## 15. Prompt to give the replacement agent

> Read `AGENTS.md` and `docs/handoffs/2026-10-16-redesign-fidelity-handoff.md`. Finish the approved
> redesign in the current working tree. The current implementation was rejected because it
> substituted its own presentation for the approved markup. Faithfully translate
> `design/mockups/round7/converged.html` (Relaxed/default) and
> `design/mockups/round6/b-rail.html` (Structured) into React and wire real state/data. Preserve the
> existing tested migration, storage, reset, backup, codes and HTTP/WireGuard fixes. Compare actual
> reference and production screens/interactions throughout; do not treat the old completed plan,
> passing tests or rejected screenshots as design acceptance. Complete all required screens and
> validation. Leave changes uncommitted and unpublished unless I separately authorize integration.
