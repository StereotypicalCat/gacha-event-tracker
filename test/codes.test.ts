import { expect, test } from "bun:test";
import { applyCodeChecks, buildCodesFeed } from "../src/ingest/codes/build.ts";
import { parseGame8Codes } from "../src/ingest/codes/game8.ts";
import { CODE_CHECKS } from "../src/shared/codeChecks.ts";
const at = "2026-10-16T12:00:00.000Z",
  ctx = {
    game: "genshin" as const,
    sourceId: "genshin-game8-codes",
    sourceUrl: "https://game8.co/games/Genshin-Impact/archives/304759",
    now: at,
  };
test("real fixture reads the ten current codes and fences off expired tables", async () => {
  const html = await Bun.file(
    "fixtures/genshin/game8-codes-2026-10-16.html",
  ).text();
  const codes = parseGame8Codes(html, ctx);
  expect(codes).toHaveLength(10);
  expect(codes.map((c) => c.code)).toEqual([
    "NEEIJB764CA3",
    "6LS3F3LS5K87",
    "OPERACOLLAB",
    "VesnaOnPatrol",
    "EPIC2026",
    "Y6JYMKV6JKSL",
    "Y1INABQB6DEX",
    "2BJ64QRZ7RT8",
    "PLDXIB886Y1S",
    "GENSHINGIFT",
  ]);
  expect(codes.every((c) => c.expiresAt === null)).toBe(true);
  expect(codes[0]?.reward).toContain("Primogem");
  expect(codes.some((c) => c.code === "Rekviem")).toBe(false);
});
test("first-observed time stays fixed across unchanged builds and shape changes reject", () => {
  const code = {
    id: '["genshin","TEST"]',
    game: "genshin" as const,
    code: "TEST",
    reward: null,
    expiresAt: null,
    sourceUrl: ctx.sourceUrl,
  };
  const first = buildCodesFeed(null, [code], at);
  expect(
    buildCodesFeed(first, [code], "2026-10-20T12:00:00.000Z").codes[0]
      ?.firstObservedAt,
  ).toBe(at);
  expect(() => parseGame8Codes("<h1>New design</h1>", ctx)).toThrow();
});
test("special-program codes are included while their stated expiry date is still ahead", async () => {
  const html = (
    await Bun.file("fixtures/genshin/game8-codes-2026-10-16.html").text()
  ).replace("after September 15, 2026", "after November 15, 2026");
  const codes = parseGame8Codes(html, ctx);
  expect(codes).toHaveLength(13);
  expect(codes.some((c) => c.code === "Rekviem")).toBe(true);
});
test("a code the owner confirmed dead is stamped, and a check matching nothing is reported", () => {
  const live = (code: string) => ({
    id: JSON.stringify(["genshin", code]),
    game: "genshin" as const,
    code,
    reward: null,
    expiresAt: null,
    firstObservedAt: at,
    sourceUrl: ctx.sourceUrl,
  });
  const { codes, unmatched } = applyCodeChecks(
    [live("DEAD"), live("ALIVE")],
    [
      { game: "genshin", code: "DEAD", checked: "2026-10-20" },
      { game: "genshin", code: "GONE", checked: "2026-10-20" },
    ],
  );
  expect(codes.map((c) => c.confirmedDead ?? null)).toEqual([
    "2026-10-20",
    null,
  ]);
  expect(unmatched.map((c) => c.code)).toEqual(["GONE"]);
});
test("every code check names one code once, with a date", () => {
  const ids = CODE_CHECKS.map((c) => JSON.stringify([c.game, c.code]));
  expect(new Set(ids).size).toBe(ids.length);
  for (const c of CODE_CHECKS) expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
