import { expect, test } from "bun:test";
import {
  prepareRestore,
  finishPendingRestore,
  undoRestore,
} from "../src/client/state/reader/restore.ts";
import { buildReaderExport } from "../src/client/state/reader/export.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";
import { MemoryStorage } from "./helpers/reader.ts";
const at = "2026-10-16T12:00:00.000Z";
const reader = () => migrateLegacy({}, ["genshin"], at, () => "account:one");
test("restore preserves a recovery copy and undo restores the previous data", () => {
  const s = new MemoryStorage(),
    before = reader(),
    after = { ...reader(), prefs: { interface: "relaxed" } };
  s.setItem(READER_KEYS.reader, JSON.stringify(before));
  expect(prepareRestore(s, buildReaderExport(after, {}, at), at)).toEqual({
    ok: true,
  });
  expect(JSON.parse(s.getItem(READER_KEYS.reader)!).prefs.interface).toBe(
    "relaxed",
  );
  expect(undoRestore(s)).toEqual({ ok: true });
  expect(JSON.parse(s.getItem(READER_KEYS.reader)!)).toEqual(before);
});
test("failed live write keeps a prepared transaction for startup recovery", () => {
  const s = new MemoryStorage();
  s.setItem(READER_KEYS.reader, JSON.stringify(reader()));
  s.fail = READER_KEYS.reader;
  const after = { ...reader(), prefs: { interface: "relaxed" } };
  expect(prepareRestore(s, buildReaderExport(after, {}, at), at)).toEqual({
    ok: false,
    reason: "quota",
  });
  expect(s.getItem(READER_KEYS.pending)).not.toBeNull();
  expect(JSON.parse(s.getItem(READER_KEYS.reader)!).prefs.interface).toBe(
    "structured",
  );
  s.fail = "";
  expect(finishPendingRestore(s)).toEqual({ ok: true });
  expect(JSON.parse(s.getItem(READER_KEYS.reader)!).prefs.interface).toBe(
    "relaxed",
  );
});
test("invalid payloads cannot overwrite live data or create a transaction", () => {
  const s = new MemoryStorage();
  s.setItem(READER_KEYS.reader, JSON.stringify(reader()));
  expect(
    prepareRestore(s, { format: "gacha-tracker-export", version: 999 }, at),
  ).toEqual({ ok: false, reason: "invalid" });
  expect(s.getItem(READER_KEYS.pending)).toBeNull();
});
test("restore rejects orphan logs and references to missing clock revisions", () => {
  const s = new MemoryStorage();
  s.setItem(READER_KEYS.reader, JSON.stringify(reader()));
  const broken = reader();
  broken.data["account:missing"] = broken.data["account:one"]!;
  expect(prepareRestore(s, buildReaderExport(broken, {}, at), at)).toEqual({
    ok: false,
    reason: "invalid",
  });
  delete broken.data["account:missing"];
  broken.data["account:one"]!.daily.missing = {};
  expect(prepareRestore(s, buildReaderExport(broken, {}, at), at)).toEqual({
    ok: false,
    reason: "invalid",
  });
});
