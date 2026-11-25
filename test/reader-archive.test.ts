import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import {
  captureSeen,
  reconcileArchive,
  archiveOutcome,
  restoreArchive,
  archivedEventEnded,
  canRestoreArchivedEvent,
} from "../src/client/state/reader/archive.ts";
import { reduceReader } from "../src/client/state/reader/reducer.ts";
import { readerEventRows } from "../src/client/state/reader/eventRows.ts";
import { sampleEvent } from "./helpers/reader.ts";
import { pairKey } from "../src/client/state/reader/schema.ts";
const at = "2026-10-16T12:00:00.000Z";
test("archive saves metadata and outcome immediately; restore preserves the event snapshot", () => {
  let s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s = captureSeen(s, readerEventRows(s, [sampleEvent], Date.parse(at)), at);
  s = archiveOutcome(s, "account:one", sampleEvent.id, "done", at);
  expect(s.archive[pairKey("account:one", sampleEvent.id)]?.event.title).toBe(
    "Test",
  );
  expect(s.data["account:one"]?.progress[sampleEvent.id]).toHaveProperty(
    "status",
    "done",
  );
  s = restoreArchive(s, "account:one", sampleEvent.id);
  expect(s.archive).toEqual({});
  expect(s.seenEvents[pairKey("account:one", sampleEvent.id)]).toBeDefined();
});
test("missing source rows are not proof of expiry, and unknown end remains unresolved", () => {
  let s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s = captureSeen(
    s,
    readerEventRows(
      s,
      [
        sampleEvent,
        {
          ...sampleEvent,
          id: "genshin:unknown:2026-10-01",
          endsAt: null,
          endPrecision: "unknown",
        },
      ],
      Date.parse(at),
    ),
    at,
  );
  s = reconcileArchive(s, [], Date.parse(at));
  expect(s.archive).toEqual({});
  s = reconcileArchive(s, [], Date.parse("2026-11-01T12:00:00Z"));
  expect(Object.values(s.archive)).toHaveLength(1);
  expect(Object.values(s.archive)[0]?.outcome).toBe("unfinished");
});

test("re-marking an archived event updates outcome and account data while preserving historical clock and progress", () => {
  let s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const key = pairKey("account:one", sampleEvent.id);
  s.data["account:one"]!.progress[sampleEvent.id] = {
    status: "doing",
    effort: "short",
    note: "forgot to tick",
    at,
  };
  s.data["account:one"]!.daily.initial = {
    [sampleEvent.id]: { days: ["2026-10-15"], at },
  };
  s = captureSeen(s, readerEventRows(s, [sampleEvent], Date.parse(at)), at);
  s = reconcileArchive(s, [], Date.parse("2026-11-01T12:00:00.000Z"));
  const initialRecord = s.archive[key]!;
  expect(initialRecord.outcome).toBe("unfinished");

  // Append a later clock revision and drop seenEvents to verify historical snapshot preservation.
  s.accounts["account:one"]!.clocks.push({
    ...s.accounts["account:one"]!.clocks[0]!,
    id: "later-clock",
    effectiveAt: "2026-11-05T00:00:00.000Z",
    region: "europe",
  });
  delete s.seenEvents[key];

  const doneAt = "2026-11-10T09:00:00.000Z";
  s = reduceReader(s, {
    type: "outcome",
    accountId: "account:one",
    eventId: sampleEvent.id,
    outcome: "done",
    at: doneAt,
    opId: "mark-done",
  });
  expect(s.archive[key]).toMatchObject({
    outcome: "done",
    outcomeAt: doneAt,
    clockRevision: "initial",
    resolvedEnd: initialRecord.resolvedEnd,
    days: ["2026-10-15"],
    progress: {
      status: "doing",
      effort: "short",
      note: "forgot to tick",
      at,
    },
  });
  expect(s.data["account:one"]?.progress[sampleEvent.id]).toMatchObject({
    status: "done",
    effort: "short",
    note: "forgot to tick",
    at: doneAt,
  });

  // Switch to ignored: clears done status and sets ignored, keeping pre-archive progress.
  const ignoredAt = "2026-11-10T10:00:00.000Z";
  s = reduceReader(s, {
    type: "outcome",
    accountId: "account:one",
    eventId: sampleEvent.id,
    outcome: "ignored",
    at: ignoredAt,
    opId: "mark-ignored",
  });
  expect(s.archive[key]?.outcome).toBe("ignored");
  expect(s.data["account:one"]?.ignored[sampleEvent.id]).toEqual({
    at: ignoredAt,
  });
  expect(s.data["account:one"]?.progress[sampleEvent.id]).toMatchObject({
    status: "doing",
    effort: "short",
    note: "forgot to tick",
  });

  // Switch from ignored to done: clears ignored entry.
  const redoneAt = "2026-11-10T11:00:00.000Z";
  s = reduceReader(s, {
    type: "outcome",
    accountId: "account:one",
    eventId: sampleEvent.id,
    outcome: "done",
    at: redoneAt,
    opId: "remark-done",
  });
  expect(s.archive[key]?.outcome).toBe("done");
  expect(s.data["account:one"]?.ignored[sampleEvent.id]).toBeUndefined();
  expect(s.data["account:one"]?.progress[sampleEvent.id]).toHaveProperty(
    "status",
    "done",
  );
  // Subsequent reconcile keeps the done archive record untouched.
  s = reconcileArchive(s, [], Date.parse("2026-11-12T00:00:00.000Z"));
  expect(s.archive[key]?.outcome).toBe("done");

  // Switch back to unfinished: clears both done and ignored while preserving pre-archive progress.
  const unfinAt = "2026-11-10T12:00:00.000Z";
  s = reduceReader(s, {
    type: "outcome",
    accountId: "account:one",
    eventId: sampleEvent.id,
    outcome: "unfinished",
    at: unfinAt,
    opId: "mark-unfinished",
  });
  expect(s.archive[key]?.outcome).toBe("unfinished");
  expect(s.archive[key]?.outcomeAt).toBe(unfinAt);
  expect(s.data["account:one"]?.ignored[sampleEvent.id]).toBeUndefined();
  expect(s.data["account:one"]?.progress[sampleEvent.id]).toMatchObject({
    status: "doing",
    effort: "short",
    note: "forgot to tick",
  });
});

test("archivedEventEnded and canRestoreArchivedEvent distinguish live, unknown-end, ended, and retired records", () => {
  let s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const unknown = {
    ...sampleEvent,
    id: "genshin:open:2026-10-01",
    endsAt: null,
    endPrecision: "unknown" as const,
  };
  s = captureSeen(
    s,
    readerEventRows(s, [sampleEvent, unknown], Date.parse(at)),
    at,
  );
  s = archiveOutcome(s, "account:one", sampleEvent.id, "done", at);
  s = archiveOutcome(s, "account:one", unknown.id, "done", at);

  const datedRecord = s.archive[pairKey("account:one", sampleEvent.id)]!;
  const openRecord = s.archive[pairKey("account:one", unknown.id)]!;

  // While live, dated and unknown-end archived events can be restored and are not ended.
  expect(archivedEventEnded(datedRecord, s, Date.parse(at))).toBe(false);
  expect(canRestoreArchivedEvent(datedRecord, s, Date.parse(at))).toBe(true);
  expect(archivedEventEnded(openRecord, s, Date.parse("2027-01-01T00:00:00Z"))).toBe(false);
  expect(canRestoreArchivedEvent(openRecord, s, Date.parse("2027-01-01T00:00:00Z"))).toBe(true);

  // Once past end, dated event is ended and cannot be restored to live views.
  const afterEnd = Date.parse("2026-11-01T12:00:00Z");
  expect(archivedEventEnded(datedRecord, s, afterEnd)).toBe(true);
  expect(canRestoreArchivedEvent(datedRecord, s, afterEnd)).toBe(false);

  // Retired accounts cannot restore to live views even for open-end events.
  s.accounts["account:one"]!.retiredAt = "2026-10-17T00:00:00.000Z";
  expect(canRestoreArchivedEvent(openRecord, s, Date.parse(at))).toBe(false);
});
