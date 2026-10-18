import { expect, test } from "bun:test";
import {
  AUTO_BACKUP_BYTES,
  deleteManualBackup,
  MANUAL_BACKUP_BYTES,
  MANUAL_BACKUP_LIMIT,
  readBackups,
  readManualBackups,
  saveBackup,
  saveManualBackup,
} from "../src/client/state/reader/backups.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";

const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
};
const at = "2026-10-17T12:00:00.000Z";
const state = migrateLegacy({}, ["genshin"], at, () => "account:one");

test("Back up now keeps its own list and never replaces the day's automatic snapshot", () => {
  const storage = memory();
  saveBackup(storage, state, at);
  const automatic = readBackups(storage);
  expect(saveManualBackup(storage, state, "2026-10-17T13:00:00.000Z").ok).toBe(
    true,
  );
  expect(saveManualBackup(storage, state, "2026-10-17T14:00:00.000Z").ok).toBe(
    true,
  );
  expect(readBackups(storage)).toEqual(automatic);
  const manual = readManualBackups(storage);
  expect(manual.map((b) => b.at)).toEqual([
    "2026-10-17T14:00:00.000Z",
    "2026-10-17T13:00:00.000Z",
  ]);
  expect(storage.getItem(READER_KEYS.manualBackups)).not.toBeNull();
});

test("a manual backup can be deleted, and the list has a cap", () => {
  const storage = memory();
  saveManualBackup(storage, state, at);
  const [only] = readManualBackups(storage);
  expect(deleteManualBackup(storage, only!.id).ok).toBe(true);
  expect(readManualBackups(storage)).toEqual([]);
  for (let i = 0; i < MANUAL_BACKUP_LIMIT; i++)
    expect(
      saveManualBackup(
        storage,
        state,
        new Date(Date.parse(at) + i).toISOString(),
      ).ok,
    ).toBe(true);
  const full = saveManualBackup(storage, state, "2026-10-18T00:00:00.000Z");
  expect(full).toEqual({ ok: false, reason: "full" });
  expect(readManualBackups(storage)).toHaveLength(MANUAL_BACKUP_LIMIT);
});

test("one unreadable entry does not discard the other manual backups", () => {
  const storage = memory();
  saveManualBackup(storage, state, at);
  const list = JSON.parse(storage.getItem(READER_KEYS.manualBackups)!);
  storage.setItem(
    READER_KEYS.manualBackups,
    JSON.stringify([...list, { id: 1, at: "not a date" }]),
  );
  expect(readManualBackups(storage)).toHaveLength(1);
});

test("the list refuses a copy that would push it past its size budget", () => {
  const storage = memory();
  const big = {
    ...state,
    prefs: { ...state.prefs, filler: "x".repeat(MANUAL_BACKUP_BYTES) },
  };
  expect(saveManualBackup(storage, big, at)).toEqual({
    ok: false,
    reason: "full",
  });
  expect(readManualBackups(storage)).toEqual([]);
});

test("the automatic history drops its oldest copies past its size cap, never the newest", () => {
  const storage = memory();
  // A heavy reader: about 300k units of v1 data embedded in every snapshot.
  storage.setItem(
    "gacha-tracker:v1:progress",
    JSON.stringify("x".repeat(300_000)),
  );
  const day = 86_400_000;
  for (let i = 0; i < 10; i++)
    expect(
      saveBackup(
        storage,
        state,
        new Date(Date.parse(at) + i * day).toISOString(),
      ).ok,
    ).toBe(true);
  const kept = readBackups(storage);
  expect(storage.getItem(READER_KEYS.backups)!.length).toBeLessThanOrEqual(
    AUTO_BACKUP_BYTES,
  );
  expect(kept.length).toBeGreaterThan(1);
  expect(kept.length).toBeLessThan(7);
  expect(kept[0]!.at).toBe(new Date(Date.parse(at) + 9 * day).toISOString());

  storage.setItem(
    "gacha-tracker:v1:progress",
    JSON.stringify("x".repeat(AUTO_BACKUP_BYTES)),
  );
  const last = new Date(Date.parse(at) + 10 * day).toISOString();
  expect(saveBackup(storage, state, last).ok).toBe(true);
  expect(readBackups(storage).map((b) => b.at)).toEqual([last]);
});
