import { expect, test } from "bun:test";
import { archiveStats } from "../src/client/state/reader/archiveStats.ts";
import type { ArchiveRecord } from "../src/client/state/reader/schema.ts";
import { sampleEvent } from "./helpers/reader.ts";
const at = "2026-10-16T12:00:00.000Z";
const r = (outcome: ArchiveRecord["outcome"], id: string): ArchiveRecord => ({
  accountId: "account:one",
  event: { ...sampleEvent, id },
  outcome,
  outcomeAt: at,
  resolvedEnd: Date.parse(at),
  clockRevision: "initial",
  progress: {},
  days: ["2026-10-15", "2026-10-16"],
  amounts: {},
});
test("ignored outcomes never count as failures; event check-ins are not unique play days", () => {
  const result = archiveStats(
    [r("done", "a"), r("ignored", "b"), r("unfinished", "c")],
    Date.parse(at),
  );
  expect(result.overall.rate).toBe(50);
  expect(result.overall.eligible).toBe(2);
  expect(result.checkIns).toBe(6);
  expect(result.shortfalls).toEqual([]);
});
test("empty archives have no fabricated percentages or progress", () => {
  const result = archiveStats([], Date.parse(at));
  expect(result.overall.rate).toBeNull();
  expect(result.currentRun).toBe(0);
  expect(result.bestRun).toBe(0);
});
