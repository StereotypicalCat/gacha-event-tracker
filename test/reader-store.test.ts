import { MemoryStorage } from "./helpers/reader.ts";
import { expect, test } from "bun:test";
import {
  createReaderStore,
  initializeReader,
} from "../src/client/state/reader/store.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";

const at = "2026-10-16T12:00:00.000Z";
test("two stores rebase unrelated field changes and reject older same-field writes", async () => {
  const storage = new MemoryStorage();
  const initial = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const a = createReaderStore(storage, initial),
    b = createReaderStore(storage, initial);
  expect(
    await a.dispatch({
      type: "progress",
      accountId: "account:one",
      itemId: "genshin:a:2026-10-01",
      patch: { status: "doing" },
      at,
      opId: "a",
    }),
  ).toEqual({ ok: true });
  expect(
    await b.dispatch({
      type: "progress",
      accountId: "account:one",
      itemId: "genshin:a:2026-10-01",
      patch: { note: "Keep me" },
      at,
      opId: "b",
    }),
  ).toEqual({ ok: true });
  const persisted = JSON.parse(storage.getItem(READER_KEYS.reader)!);
  expect(
    persisted.data["account:one"].progress["genshin:a:2026-10-01"],
  ).toMatchObject({ status: "doing", note: "Keep me" });
  expect(
    await a.dispatch({
      type: "progress",
      accountId: "account:one",
      itemId: "genshin:a:2026-10-01",
      patch: { status: "done" },
      at: "2026-10-15T12:00:00.000Z",
      opId: "c",
    }),
  ).toEqual({ ok: false, reason: "conflict" });
});
test("operation replay is idempotent, including toggles", async () => {
  const storage = new MemoryStorage(),
    s = createReaderStore(
      storage,
      migrateLegacy({}, ["genshin"], at, () => "account:one"),
    );
  const action = {
    type: "day" as const,
    accountId: "account:one",
    itemId: "dailies:genshin",
    revisionId: "initial",
    day: "2026-10-16",
    checked: true,
    at,
    opId: "same",
  };
  await s.dispatch(action);
  const rev = s.getSnapshot().revision;
  await s.dispatch(action);
  expect(s.getSnapshot().revision).toBe(rev);
});
test("failed migration preserves legacy bytes and never records success", () => {
  const storage = new MemoryStorage();
  storage.setItem("gacha-tracker:v1:prefs", '{"onboarded":true}');
  storage.fail = READER_KEYS.reader;
  const result = initializeReader(
    storage,
    ["genshin"],
    at,
    () => "account:one",
  );
  expect(result.ok).toBe(false);
  expect(storage.getItem("gacha-tracker:v1:prefs")).toBe('{"onboarded":true}');
  expect(storage.getItem(READER_KEYS.reader)).toBeNull();
  expect(storage.getItem(READER_KEYS.migrationRecovery)).not.toBeNull();
});
test("quota failure does not publish a successful in-memory edit", async () => {
  const storage = new MemoryStorage(),
    s = createReaderStore(
      storage,
      migrateLegacy({}, ["genshin"], at, () => "account:one"),
    );
  storage.fail = READER_KEYS.reader;
  expect(
    await s.dispatch({
      type: "prefs",
      patch: { interface: "relaxed" },
      at,
      opId: "a",
    }),
  ).toEqual({ ok: false, reason: "quota" });
  expect(s.getSnapshot().prefs.interface).toBe("structured");
});

test("new-event markers seed accounts together rather than queueing per-account writes", async () => {
  const storage = new MemoryStorage();
  let n = 0;
  const s = createReaderStore(
    storage,
    migrateLegacy({}, ["genshin", "hsr"], at, () => `account:test${++n}`),
  );
  await s.dispatch({
    type: "seenBatch",
    entries: [
      { id: "account:test1", ids: ["genshin:a"] },
      { id: "account:test2", ids: ["hsr:a"] },
    ],
    at,
    opId: "batch",
  });
  expect(s.getSnapshot().revision).toBe(1);
  expect(s.getSnapshot().eventSeen).toEqual({
    "account:test1": ["genshin:a"],
    "account:test2": ["hsr:a"],
  });
});
test("stale tabs preserve independent account routine choices", async () => {
  const storage = new MemoryStorage(),
    initial = migrateLegacy({}, ["genshin"], at, () => "account:one");
  storage.setItem(READER_KEYS.reader, JSON.stringify(initial));
  const a = createReaderStore(storage, initial),
    b = createReaderStore(storage, initial),
    account = initial.accounts["account:one"]!;
  await a.dispatch({
    type: "account",
    account: {
      ...account,
      routines: {
        ...account.routines,
        first: { followed: true, checklist: true, timeline: false },
      },
    },
    at,
    opId: "first",
  });
  await b.dispatch({
    type: "account",
    account: {
      ...account,
      routines: {
        ...account.routines,
        second: { followed: true, checklist: false, timeline: true },
      },
    },
    at,
    opId: "second",
  });
  expect(b.getSnapshot().accounts[account.id]!.routines.first).toHaveProperty(
    "followed",
    true,
  );
  expect(b.getSnapshot().accounts[account.id]!.routines.second).toHaveProperty(
    "followed",
    true,
  );
});
test("resuming a retired account removes its retirement without erasing history", async () => {
  const storage = new MemoryStorage(),
    initial = migrateLegacy({}, ["genshin"], at, () => "account:one");
  initial.accounts["account:one"]!.retiredAt = at;
  storage.setItem(READER_KEYS.reader, JSON.stringify(initial));
  const store = createReaderStore(storage, initial),
    account = { ...initial.accounts["account:one"]! };
  delete account.retiredAt;
  expect(
    await store.dispatch({ type: "account", account, at, opId: "resume" }),
  ).toEqual({ ok: true });
  expect(store.getSnapshot().accounts[account.id]!.retiredAt).toBeUndefined();
});
test("stale tabs preserve independent pins on the same routine", async () => {
  const storage = new MemoryStorage(),
    initial = migrateLegacy({}, ["genshin"], at, () => "account:one"),
    account = initial.accounts["account:one"]!;
  account.routines.test = { followed: true, checklist: false, timeline: false };
  storage.setItem(READER_KEYS.reader, JSON.stringify(initial));
  const a = createReaderStore(storage, initial),
    b = createReaderStore(storage, initial);
  await a.dispatch({
    type: "account",
    account: {
      ...account,
      routines: {
        ...account.routines,
        test: { ...account.routines.test!, checklist: true },
      },
    },
    at,
    opId: "checklist",
  });
  await b.dispatch({
    type: "account",
    account: {
      ...account,
      routines: {
        ...account.routines,
        test: { ...account.routines.test!, timeline: true },
      },
    },
    at,
    opId: "timeline",
  });
  expect(b.getSnapshot().accounts[account.id]!.routines.test).toEqual({
    followed: true,
    checklist: true,
    timeline: true,
  });
});
