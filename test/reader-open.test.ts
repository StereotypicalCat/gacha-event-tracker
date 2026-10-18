import { expect, test } from "bun:test";
import { openReader } from "../src/client/state/reader/open.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";
import { MemoryStorage } from "./helpers/reader.ts";

const at = "2026-10-18T12:00:00.000Z";

test("start-up reads and writes the save inside the reader lock", async () => {
  const s = new MemoryStorage();
  const seen: string[] = [];
  const locks = {
    request: async (name: string, run: () => unknown) => {
      seen.push(`lock ${name}`);
      const value = await run();
      seen.push(`release, saved: ${s.getItem(READER_KEYS.reader) !== null}`);
      return value;
    },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { locks },
    configurable: true,
  });
  try {
    const opened = await openReader(s, ["genshin"], at, () => "account:one");
    expect(opened.ok).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
  expect(seen).toEqual([
    "lock gacha-tracker:v2:reader",
    "release, saved: true",
  ]);
});

test("an interrupted restore that cannot be read stops start-up, keeping the save", async () => {
  const s = new MemoryStorage();
  s.setItem(READER_KEYS.pending, JSON.stringify({ at, payload: {} }));
  const opened = await openReader(s, ["genshin"], at, () => "account:one");
  expect(opened).toEqual({ ok: false, reason: "restore" });
  expect(s.getItem(READER_KEYS.pending)).not.toBeNull();
  expect(s.getItem(READER_KEYS.reader)).toBeNull();
});

test("an unreadable save is reported, not replaced", async () => {
  const s = new MemoryStorage();
  s.setItem(READER_KEYS.reader, JSON.stringify({ version: 2 }));
  const opened = await openReader(s, ["genshin"], at, () => "account:one");
  expect(opened).toEqual({ ok: false, reason: "open" });
  expect(s.getItem(READER_KEYS.reader)).toBe(JSON.stringify({ version: 2 }));
});

test("with no lock available, start-up still opens the save", async () => {
  const s = new MemoryStorage();
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: {
      locks: {
        request: () => Promise.reject(new Error("unavailable")),
      },
    },
    configurable: true,
  });
  try {
    const opened = await openReader(s, ["genshin"], at, () => "account:one");
    expect(opened.ok).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
  expect(s.getItem(READER_KEYS.reader)).not.toBeNull();
});
