import { expect, test } from "bun:test";
import {
  initializeReader,
  createReaderStore,
} from "../src/client/state/reader/store.ts";
import { MemoryStorage } from "./helpers/reader.ts";
import { READER_KEYS } from "../src/client/state/reader/schema.ts";
const at = "2026-10-16T12:00:00.000Z";
test("a returning older tab's newer edit is carried to the original migrated account", async () => {
  const s = new MemoryStorage();
  s.setItem(
    "gacha-tracker:v1:progress",
    JSON.stringify({ "genshin:a:2026-01-01": { status: "doing", at } }),
  );
  const first = initializeReader(s, ["genshin"], at, () => "account:original");
  expect(first.ok).toBe(true);
  s.setItem(
    "gacha-tracker:v1:progress",
    JSON.stringify({
      "genshin:a:2026-01-01": {
        status: "done",
        note: "From old tab",
        at: "2026-10-17T12:00:00.000Z",
      },
    }),
  );
  const again = initializeReader(
    s,
    ["genshin"],
    "2026-10-18T12:00:00.000Z",
    () => {
      throw Error("Must not remint");
    },
  );
  expect(again.ok).toBe(true);
  if (again.ok)
    expect(
      again.state.data["account:original"]?.progress["genshin:a:2026-01-01"],
    ).toHaveProperty("note", "From old tab");
});
test("a removed v2 field is not resurrected by an older legacy copy", async () => {
  const s = new MemoryStorage();
  s.setItem(
    "gacha-tracker:v1:progress",
    JSON.stringify({ "genshin:a:2026-01-01": { note: "old", at } }),
  );
  const first = initializeReader(s, ["genshin"], at, () => "account:original");
  if (!first.ok) throw Error("init");
  const store = createReaderStore(s, first.state);
  await store.dispatch({
    type: "progress",
    accountId: "account:original",
    itemId: "genshin:a:2026-01-01",
    patch: { note: null },
    at: "2026-10-18T12:00:00.000Z",
    opId: "clear",
  });
  s.setItem("gacha-tracker:v1:prefs", JSON.stringify({ region: "asia" }));
  initializeReader(s, ["genshin"], "2026-10-19T12:00:00.000Z", () => {
    throw Error("Must not remint");
  });
  expect(
    JSON.parse(s.getItem(READER_KEYS.reader)!).data["account:original"]
      .progress["genshin:a:2026-01-01"].note,
  ).toBeUndefined();
});
test("old-tab removals clear migrated ticks and ignores without clearing newer v2 edits", () => {
  const s = new MemoryStorage(),
    id = "genshin:a:2026-01-01";
  s.setItem(
    "gacha-tracker:v1:daily",
    JSON.stringify({ [id]: { days: ["2026-10-16"], at } }),
  );
  s.setItem("gacha-tracker:v1:ignored", JSON.stringify({ [id]: { at } }));
  initializeReader(s, ["genshin"], at, () => "account:original");
  s.setItem("gacha-tracker:v1:daily", "{}");
  s.setItem("gacha-tracker:v1:ignored", "{}");
  const result = initializeReader(
    s,
    ["genshin"],
    "2026-10-18T12:00:00.000Z",
    () => {
      throw Error("remint");
    },
  );
  if (!result.ok) throw Error(result.reason);
  expect(
    result.state.data["account:original"]!.daily.initial?.[id],
  ).toHaveProperty("days", []);
  expect(result.state.data["account:original"]!.ignored[id]).toBeUndefined();
});
