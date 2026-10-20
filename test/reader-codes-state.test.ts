import { expect, test } from "bun:test";
import type { CodesFeed, RedeemCode } from "../src/shared/codes.ts";
import {
  codeExpired,
  codeUsed,
  unseenUsableCodes,
} from "../src/client/state/reader/codes.ts";

const code = (id: string, over: Partial<RedeemCode> = {}): RedeemCode => ({
  id,
  game: "genshin",
  code: id.toUpperCase(),
  reward: null,
  expiresAt: null,
  expiresOn: null,
  firstObservedAt: "2026-10-01T00:00:00.000Z",
  sourceUrl: "https://example.com/codes",
  ...over,
});
const now = Date.parse("2026-10-18T12:00:00.000Z");

test("a code expires at its stated instant", () => {
  expect(
    codeExpired(code("a", { expiresAt: "2026-10-18T11:59:59.000Z" }), now),
  ).toBe(true);
  expect(
    codeExpired(code("a", { expiresAt: "2026-10-18T12:00:01.000Z" }), now),
  ).toBe(false);
  expect(codeExpired(code("a"), now)).toBe(false);
});

test("a date-only expiry passes only once the date has ended everywhere", () => {
  // 17 Oct has ended everywhere by 18 Oct 12:00 UTC; 18 Oct has not.
  expect(codeExpired(code("a", { expiresOn: "2026-10-17" }), now)).toBe(true);
  expect(codeExpired(code("a", { expiresOn: "2026-10-18" }), now)).toBe(false);
  expect(codeExpired(code("a", { expiresOn: "2026-10-17" }), now - 1)).toBe(
    false,
  );
});

test("a code is used once it is redeemed on every server played", () => {
  const redeemed = { "account:eu": { a: "2026-10-18T00:00:00.000Z" } };
  expect(codeUsed(code("a"), ["account:eu"], redeemed)).toBe(true);
  expect(codeUsed(code("a"), ["account:eu", "account:na"], redeemed)).toBe(
    false,
  );
  expect(codeUsed(code("a"), [], redeemed)).toBe(false);
});

test("the Settings marker counts unseen codes that can still be used", () => {
  const feed: CodesFeed = {
    schemaVersion: 1,
    sources: [],
    codes: [
      code("seen"),
      code("fresh"),
      code("expired", { expiresAt: "2026-10-01T00:00:00.000Z" }),
      code("used"),
      code("other", { game: "hsr" }),
    ],
  };
  const ids = unseenUsableCodes(
    feed,
    ["seen"],
    "genshin",
    ["account:eu"],
    { "account:eu": { used: "2026-10-18T00:00:00.000Z" } },
    now,
  ).map((c) => c.id);
  expect(ids).toEqual(["fresh"]);
});

test("a code the owner confirmed dead is expired whatever its stated expiry", () => {
  expect(codeExpired(code("a", { confirmedDead: "2026-10-20" }), now)).toBe(
    true,
  );
  expect(
    codeExpired(
      code("a", {
        confirmedDead: "2026-10-20",
        expiresAt: "2026-12-01T00:00:00.000Z",
      }),
      now,
    ),
  ).toBe(true);
});
