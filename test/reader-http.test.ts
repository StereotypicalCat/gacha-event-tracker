import { expect, test } from "bun:test";
import { mintAccountId } from "../src/client/state/reader/ids.ts";
import { actionMeta } from "../src/client/state/reader/actions.ts";
import { initializeReader } from "../src/client/state/reader/store.ts";
import { saveBackup, readBackups } from "../src/client/state/reader/backups.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";
import { MemoryStorage } from "./helpers/reader.ts";

const at = "2026-10-16T12:00:00.000Z";
function withoutRandomUUID(run: () => void) {
  const before = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: undefined,
  });
  try {
    run();
  } finally {
    if (before) Object.defineProperty(crypto, "randomUUID", before);
    else Reflect.deleteProperty(crypto, "randomUUID");
  }
}

test("HTTP first-visit migration succeeds without randomUUID and retains legacy bytes", () => {
  withoutRandomUUID(() => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      "genshin:example:2026-10-01": { note: "Keep my progress", at },
    });
    storage.setItem("gacha-tracker:v1:progress", raw);
    const result = initializeReader(storage, ["genshin"], at, mintAccountId);
    expect(result.ok).toBe(true);
    expect(storage.getItem("gacha-tracker:v1:progress")).toBe(raw);
    expect(storage.getItem(READER_KEYS.reader)).not.toBeNull();
    if (result.ok)
      expect(
        Object.values(result.state.data)[0]!.progress[
          "genshin:example:2026-10-01"
        ],
      ).toHaveProperty("note", "Keep my progress");
  });
});

test("HTTP edits receive distinct operation IDs without randomUUID", () => {
  withoutRandomUUID(() => {
    const first = actionMeta(),
      second = actionMeta();
    expect(first.opId).toMatch(/^[a-zA-Z0-9-]+$/);
    expect(first.opId).not.toBe(second.opId);
  });
});

test("HTTP local backups save normally without randomUUID", () => {
  withoutRandomUUID(() => {
    const storage = new MemoryStorage();
    const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
    expect(saveBackup(storage, state, at)).toEqual({ ok: true });
    expect(readBackups(storage)).toHaveLength(1);
  });
});
