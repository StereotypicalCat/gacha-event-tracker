import { expect, test } from "bun:test";
import { CODE_SOURCES } from "../../src/ingest/codes/registry.ts";
import { parseGame8CodeTable } from "../../src/ingest/codes/game8.ts";

const now = "2026-10-18T12:00:00.000Z";

// Each page pinned 2026-10-18; expected files were spot-checked against the
// live pages (Star Rail's six codes, WUTHERINGGIFT, Endfield's ENDFIELDSTEAM /
// ENDFIELDGIFT / ENDFIELD4PC, CZN's NIGHTMARECARNIVAL, P5X's WEBSTORE1YEAR).
for (const source of CODE_SOURCES.filter((s) => s.game !== "genshin")) {
  test(`${source.id} reads the page's active codes`, async () => {
    const html = await Bun.file(`${source.fixture}.html`).text();
    const expected = await Bun.file(`${source.fixture}.expected.json`).json();
    expect(
      source.parse(html, {
        now,
        sourceId: source.id,
        sourceUrl: source.url,
        game: source.game,
      }),
    ).toEqual(expected);
  });
}

test("an expired table inside the active section is not read as current", async () => {
  const wuwa = CODE_SOURCES.find((s) => s.game === "wuwa")!;
  const html = await Bun.file(`${wuwa.fixture}.html`).text();
  const codes = wuwa.parse(html, {
    now,
    sourceId: wuwa.id,
    sourceUrl: wuwa.url,
    game: "wuwa",
  });
  expect(codes.map((c) => c.code)).toEqual(["WUTHERINGGIFT"]);
});

test("a page that says it has no codes is an empty read it may store; a changed page is not", async () => {
  const uma = CODE_SOURCES.find((s) => s.game === "uma")!;
  const html = await Bun.file(`${uma.fixture}.html`).text();
  expect(
    uma.parse(html, { now, sourceId: uma.id, sourceUrl: uma.url, game: "uma" }),
  ).toEqual([]);
  expect("statesNoEvents" in uma && uma.statesNoEvents(html)).toBe(true);
  expect(() =>
    parseGame8CodeTable(
      "<h2>Something else</h2>",
      {
        now,
        sourceId: "x",
        sourceUrl: "https://example.com",
        game: "hsr",
      },
      /^Active Redeem Codes for/i,
    ),
  ).toThrow("could not be identified");
});

test("a reward shared with the code's cell, or listed with bullets, reads as text", () => {
  const html =
    "<h3>Codes</h3><table><tr><th>Date Added</th><th>Code &amp; Reward</th></tr>" +
    "<tr><td>09/24/2026</td><td><input class='a-clipboard__textInput' value='ONE'> Copied 100 Stamps</td></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='TWO'> Copied</td><td>・ Fons x10 ・ Coin x5</td></tr></table>";
  const codes = parseGame8CodeTable(
    html,
    {
      now,
      sourceId: "x",
      sourceUrl: "https://example.com",
      game: "nte",
    },
    /^Codes$/,
  );
  expect(codes.map((c) => [c.code, c.reward])).toEqual([
    ["ONE", "100 Stamps"],
    ["TWO", "Fons x10, Coin x5"],
  ]);
  expect(codes.every((c) => c.expiresAt === null)).toBe(true);
});
