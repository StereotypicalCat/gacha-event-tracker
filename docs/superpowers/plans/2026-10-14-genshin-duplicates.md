# Genshin battle-pass duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One row per Genshin battle pass, with every reader's marks carried to the surviving ID.

**Architecture:** The Game8 parser drops a leading `Battle Pass -` label so both sources mint the
same ID; `titleExtends` learns leading qualifiers; a pure remap table (`src/client/state/retiredIds.ts`)
moves entries in the three event-keyed stores on load and on import.

**Spec:** `docs/superpowers/specs/2026-10-14-genshin-duplicates-design.md`

## Global Constraints

- Commits wait to be asked (AGENTS.md § Conventions); each task ends green.
- No change to `slugify`, `eventId` or the feed schema.
- The remap never drops data: moved entries merge under the store's own import rule.

## Tasks

- [x] **1. Parser.** Failing test in `test/adapters/game8.test.ts`: the Genshin fixture yields
  `Frostfarer` with id `genshin:frostfarer:2026-08-12`, and no title starts `Battle Pass`. Strip in
  `toEvent` (`src/ingest/parsers/game8.ts`). Regenerate `fixtures/genshin/game8-events-2026-08-14.expected.json`
  with `bun run parse … --json` and diff it: only the Frostfarer row may move.
- [x] **2. Merge.** Failing tests in `test/merge.test.ts`: `titleExtends("Frozen Wilds", "Anniversary Frozen Wilds")`
  is true; a one-word base is still refused; `Gold Clash` / `Gold Rush Clash` still refused. Then a
  `mergeEvents` test fusing the two pinned Genshin fixtures' Frostfarer rows into one. Implement.
- [x] **3. Remap.** `src/client/state/retiredIds.ts`: `RETIRED_IDS` table and
  `carryForward(map, combine)`. Tests in `test/retired-ids.test.ts`: move, both-present merge per
  store, idempotence, unrelated ids untouched. Wire into `useProgress` load, `useDailyLog` init,
  `useMarkSet` init, and `parseImportData`.
- [x] **4. Verify.** `bun run typecheck`, `bun test`, rebuild the feed and diff Genshin IDs against
  the baseline: exactly one fewer row, only the battle-pass IDs moved. schema-guardian review.
- [x] **6. Selectors** (added once the owner established the pairing). `src/ingest/aliases.ts`
  records each pair by event ID with its evidence; `isSameEvent` accepts it; Fandom's two IDs join
  `RETIRED_IDS`. Tests: fuses the recorded pair, not next year's run, not across pairs.
- [x] **5. Docs.** AGENTS.md § Fandom (Genshin): the prefix, the corrected net-new count;
  `docs/DATA-MODEL.md` § ID stability: the retired-ID table; `docs/INGESTION.md` merge rules if they
  describe `titleExtends`.

## Part 2 tasks

- [x] **7. Summary rule.** Tests in `test/merge.test.ts`: fuses a pair whose summary names the other
  title; refuses when ends differ, when the named title is one word, when no summary names it. Empty
  `SAME_EVENT`; `recordedSame` takes a table so its test injects one.
- [x] **8. mergedIds.** Merge test: survivor lists the absorbed id, chained fusions accumulate,
  same-id repeats add nothing. `GachaEvent.mergedIds` optional; feed parse accepts with and without.
- [x] **9. Client carry from feed.** `aliasesFrom(events)` (skips published ids and self-maps);
  `carryForward(map, combine, table)`; a `carry(table)` on the three stores; one effect in `App`.
  Drop Fandom's selector ids from `RETIRED_IDS`.
- [ ] **10. Verify.** typecheck, suite, feed diff (214, survivors carry `mergedIds`), browser check,
  schema-guardian.
- [x] **11. Docs.** AGENTS.md selector bullet, INGESTION.md rule 2, DATA-MODEL.md `mergedIds` and
  the feed-carried move.
