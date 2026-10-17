import { expect, test } from "bun:test";
import { parseGame8Codes } from "../../src/ingest/codes/game8.ts";
test("code attributes are order/quote insensitive and duplicate code rows merge", () => {
  const row =
    "<tr><td><input value='AbC&amp;X' class='a-clipboard__textInput' readonly></td><td>Reward &amp; more</td></tr>";
  const html =
    "<h3>Latest Redeem Codes</h3><table><tr><th>Redeem Codes</th><th>Rewards</th></tr>" +
    row +
    row +
    "</table><h2>Expired codes</h2>" +
    row;
  const codes = parseGame8Codes(html, {
    game: "genshin",
    sourceId: "test",
    sourceUrl: "https://example.com",
    now: "2026-10-16T12:00:00.000Z",
  });
  expect(codes).toHaveLength(1);
  expect(codes[0]?.code).toBe("AbC&X");
  expect(codes[0]?.reward).toBe("Reward & more");
});
