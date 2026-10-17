import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import {
  captureSeen,
  reconcileArchive,
  archiveOutcome,
  restoreArchive,
} from "../src/client/state/reader/archive.ts";
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
