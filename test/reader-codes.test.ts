import { expect, test } from "bun:test";
import { newCodes } from "../src/client/state/reader/codes.ts";
import { reduceReader } from "../src/client/state/reader/reducer.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
const at = "2026-10-16T12:00:00.000Z";
test("viewing codes clears newness independently from redemption on two accounts", () => {
  const feed = {
    schemaVersion: 1 as const,
    sources: [],
    codes: [
      {
        id: "code",
        game: "genshin" as const,
        code: "TEST",
        reward: null,
        expiresAt: null,
        firstObservedAt: at,
        sourceUrl: "https://example.com",
      },
    ],
  };
  let state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  expect(newCodes(feed, [], "genshin")).toHaveLength(1);
  state = reduceReader(state, {
    type: "seen",
    kind: "codeSeen",
    id: "genshin",
    ids: ["code"],
    at,
    opId: "seen",
  });
  expect(newCodes(feed, state.codeSeen.genshin!, "genshin")).toHaveLength(0);
  expect(state.codeRedeemed).toEqual({});
  state = reduceReader(state, {
    type: "redeem",
    accountId: "account:one",
    codeId: "code",
    redeemed: true,
    at,
    opId: "redeem",
  });
  expect(state.codeRedeemed["account:one"]?.code).toBe(at);
  expect(state.codeRedeemed["account:two"]).toBeUndefined();
});
