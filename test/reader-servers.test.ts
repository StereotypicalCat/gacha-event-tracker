import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { createAccount } from "../src/client/state/reader/accounts.ts";
import {
  manyServers,
  serverSuffix,
} from "../src/client/state/reader/servers.ts";
const at = "2026-10-16T12:00:00.000Z";
test("a server is named only for a game tracked on more than one", () => {
  const s = migrateLegacy(
    {},
    ["genshin", "hsr"],
    at,
    () => `account:${Math.random()}`,
  );
  expect(manyServers(s, "genshin")).toBe(false);
  expect(serverSuffix(s, "genshin", "europe")).toBe("");
  s.accounts["account:asia"] = createAccount(
    "genshin",
    "asia",
    at,
    "account:asia",
  );
  expect(serverSuffix(s, "genshin", "asia")).toBe(" · asia");
  expect(serverSuffix(s, "hsr", "europe")).toBe("");
  // A retired second server stops counting, except where archives ask.
  s.accounts["account:asia"] = {
    ...s.accounts["account:asia"]!,
    retiredAt: at,
  };
  expect(manyServers(s, "genshin")).toBe(false);
  expect(manyServers(s, "genshin", true)).toBe(true);
});
