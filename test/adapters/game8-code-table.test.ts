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

test("Wuthering Waves' codes survive Game8 dropping 'All' from the heading", async () => {
  // "Wuthering Waves All Active Codes" became "Wuthering Waves Active Codes" around
  // 2026-10-25, and the exact match froze the list for two weeks.
  const source = CODE_SOURCES.find((s) => s.id === "wuwa-game8-codes")!;
  const ctx = { now: "2026-11-07T00:00:00.000Z", sourceUrl: source.url, sourceId: source.id, game: source.game };
  const read = async (date: string) =>
    (source.parse(await Bun.file(`fixtures/wuwa/game8-codes-${date}.html`).text(), ctx) as Array<{ code: string }>).map((c) => c.code);
  expect(await read("2026-11-07")).toEqual(["TRAINOFSOULS", "BLOOMINGFLOWERS", "SCHOOLLIFE", "WUTHERINGGIFT"]);
  expect(await read("2026-10-18")).toEqual(["WUTHERINGGIFT"]);
});

test("separate version/livestream h2 sections are included while live and dropped once expired", () => {
  const html =
    "<h2>Active Zenless Zone Zero Code (November 2026)</h2>" +
    "<table><tr><th>Code</th><th>Rewards</th></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='ZENLESSGIFT'> Copied</td><td>Polychrome x50</td></tr></table>" +
    "<h2>All ZZZ 3.4 Codes</h2>" +
    "<h3>Version 3.4 Livestream Codes</h3>" +
    "<table><tr><th>3.4 Code</th><th>Rewards</th></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='SUNCHASER'> Copied</td><td>Polychrome x300</td></tr></table>" +
    "<p>This code will expire on November 22, 2026 at 11:59 PM (UTC+8).</p>";
  const base = {
    sourceId: "zzz-game8-codes",
    sourceUrl: "https://game8.co/games/Zenless-Zone-Zero/archives/435683",
    game: "zzz" as const,
  };
  const live = parseGame8CodeTable(
    html,
    { ...base, now: "2026-11-20T18:00:00.000Z" },
    /^Active Zenless Zone Zero Code/i,
  );
  expect(live.map((c) => c.code)).toEqual(["ZENLESSGIFT", "SUNCHASER"]);
  expect(live[1]?.expiresAt).toBe("2026-11-22T15:59:00.000Z");
  expect(live[1]?.reward).toBe("Polychrome x300");

  const expired = parseGame8CodeTable(
    html,
    { ...base, now: "2026-11-22T16:00:00.000Z" },
    /^Active Zenless Zone Zero Code/i,
  );
  expect(expired.map((c) => c.code)).toEqual(["ZENLESSGIFT"]);
});

test("separate special-program h2 with date-only expiry sets expiresOn and drops after +2 days", () => {
  const html =
    "<h2>Active Redeem Codes for November 2026</h2>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='STARRAILGIFT'></td><td>Jade x50</td></tr></table>" +
    "<h2>3.5 Special Program Codes</h2>" +
    "<p>These livestream codes cannot be redeemed after November 22, 2026.</p>" +
    "<h3>Global Codes</h3>" +
    "<table><tr><th>Code</th><th>Rewards</th></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='STREAM35'></td><td>Jade x100</td></tr></table>" +
    "<h3>CN Codes</h3>" +
    "<table><tr><th>CN Codes</th><th>Rewards</th></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='CNONLY35'></td><td>Jade x100</td></tr></table>";
  const base = {
    sourceId: "hsr-game8-codes",
    sourceUrl: "https://game8.co/games/Honkai-Star-Rail/archives/410296",
    game: "hsr" as const,
  };
  const live = parseGame8CodeTable(
    html,
    { ...base, now: "2026-11-20T12:00:00.000Z" },
    /^Active Redeem Codes for/i,
  );
  expect(live.map((c) => c.code)).toEqual(["STARRAILGIFT", "STREAM35"]);
  expect(live[1]?.expiresAt).toBeNull();
  expect(live[1]?.expiresOn).toBe("2026-11-22");

  const expired = parseGame8CodeTable(
    html,
    { ...base, now: "2026-11-24T00:00:00.000Z" },
    /^Active Redeem Codes for/i,
  );
  expect(expired.map((c) => c.code)).toEqual(["STARRAILGIFT"]);
});

test("past-tense expired prose and expired headings in extra h2 sections are skipped", () => {
  const html =
    "<h2>Active Zenless Zone Zero Code (November 2026)</h2>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='ZENLESSGIFT'></td><td>Polychrome x50</td></tr></table>" +
    "<h2>All ZZZ 3.3 Codes</h2>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='OLDLIVE'></td><td>Polychrome x300</td></tr></table>" +
    "<p>This code expired on November 25, 2026 at 11:59 PM (UTC+8).</p>" +
    "<h2>All Expired 3.2 Codes</h2>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='ANCIENT'></td><td>Polychrome x300</td></tr></table>";
  const codes = parseGame8CodeTable(
    html,
    {
      now: "2026-11-20T12:00:00.000Z",
      sourceId: "zzz-game8-codes",
      sourceUrl: "https://game8.co/games/Zenless-Zone-Zero/archives/435683",
      game: "zzz",
    },
    /^Active Zenless Zone Zero Code/i,
  );
  expect(codes.map((c) => c.code)).toEqual(["ZENLESSGIFT"]);
});

test("version h2 without expiry deduplicates against active codes and keeps primary reward", () => {
  const html =
    "<h2>Version 1.6 Codes</h2>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='ENDFIELDSTEAM'></td><td>Short reward</td></tr>" +
    "<tr><td><input class='a-clipboard__textInput' value='VERSIONONLY'></td><td>Bonus x1</td></tr></table>" +
    "<h2>Arknights: Endfield Active Codes</h2>" +
    "<h3>All Active Codes in October 2026</h3>" +
    "<table><tr><td><input class='a-clipboard__textInput' value='ENDFIELDSTEAM'></td><td>Full primary reward</td></tr></table>";
  const codes = parseGame8CodeTable(
    html,
    {
      now: "2026-10-18T12:00:00.000Z",
      sourceId: "endfield-game8-codes",
      sourceUrl: "https://game8.co/games/Arknights-Endfield/archives/571509",
      game: "endfield",
    },
    /^All Active Codes in/i,
  );
  expect(codes.map((c) => [c.code, c.reward])).toEqual([
    ["ENDFIELDSTEAM", "Full primary reward"],
    ["VERSIONONLY", "Bonus x1"],
  ]);
});
