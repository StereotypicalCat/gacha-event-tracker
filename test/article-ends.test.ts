import { expect, test } from "bun:test";
import { ADAPTERS } from "../src/ingest/adapters/index.ts";
import {
  applyArticleEnds,
  articleTitle,
  latestStatedMs,
  parseArticleEnd,
  type StatedEnd,
} from "../src/ingest/articleEnds.ts";
import { mergeEvents } from "../src/ingest/merge.ts";
import type { GachaEvent } from "../src/shared/schema.ts";

const dir = "fixtures/genshin/articles";
const hourOfRuin = await Bun.file(`${dir}/hour-of-ruin-2026-11-07.html`).text();
const raiment = await Bun.file(`${dir}/raiment-collection-2026-11-04-2026-11-07.html`).text();
const table = await Bun.file(`${dir}/event-table-2026-11-06.html`).text();

const withEnd = (value: string) =>
  hourOfRuin.replace("December 15, 2026 14:59 (Server Time)", value);

const fandom = ADAPTERS.find((a) => a.id === "genshin-fandom-events")!;
const parseTable = (now: string, articleEnds?: ReadonlyMap<string, StatedEnd>) =>
  fandom.parse(table, {
    now,
    sourceUrl: fandom.url,
    sourceId: fandom.id,
    game: fandom.game,
    ...(articleEnds ? { articleEnds } : {}),
  });

const NOW = "2026-11-07T00:00:00.000Z";
const listed = parseTable(NOW);
const row = (title: string): GachaEvent => listed.find((e) => e.title === title)!;
const HOUR_OF_RUIN_ID = "genshin:hour-of-ruin:2026-11-04";
const ends = new Map([["Hour_of_Ruin_(Event)", parseArticleEnd(hourOfRuin)!]]);

test("server time gives every region its own end", () => {
  const end = parseArticleEnd(hourOfRuin)!;
  expect(end.day).toBe("2026-12-15");
  expect(end.regionEnds).toEqual({
    asia: "2026-12-15T06:59:00.000Z",
    europe: "2026-12-15T13:59:00.000Z",
    america: "2026-12-15T19:59:00.000Z",
  });
  // The earliest, as wikigg.ts does: never promise more than some region gets.
  expect(end.endsAt).toBe("2026-12-15T06:59:00.000Z");
});

test("GMT+8 is one instant", () => {
  expect(parseArticleEnd(raiment)).toEqual({
    day: "2026-12-16",
    endsAt: "2026-12-15T21:59:00.000Z",
    regionEnds: null,
  });
});

test.each([
  "December 15, 2026",
  "TBA",
  "December 15, 2026 14:59 UTC",
  "December 15, 2026 14:59 GMT+9",
  "Smarch 15, 2026 14:59 (Server Time)",
  "December 45, 2026 14:59 (Server Time)",
  "December 15, 2026 25:59 (Server Time)",
  "",
])("%p is no usable time", (value) => {
  expect(parseArticleEnd(withEnd(value))).toBeNull();
});

test("malformed JSON is no usable time", () => {
  expect(parseArticleEnd("<html>not the API</html>")).toBeNull();
});

test("a page with no infobox is no usable time", () => {
  expect(parseArticleEnd(JSON.stringify({ parse: { text: "<p>Stub.</p>" } }))).toBeNull();
});

test("the End header cell is not mistaken for the value", () => {
  // The <th> carries data-source="time_end" too, and precedes the value.
  const noValue = JSON.stringify({
    parse: { text: '<table><tr><th data-source="time_end">End</th></tr></table>' },
  });
  expect(parseArticleEnd(noValue)).toBeNull();
});

test("markup inside the value cell is read as its text", () => {
  expect(
    parseArticleEnd(withEnd("<span>December 15, 2026 14:59</span> (Server Time)"))?.day,
  ).toBe("2026-12-15");
});

test("the latest stated instant is the last region's", () => {
  expect(latestStatedMs(parseArticleEnd(hourOfRuin)!)).toBe(Date.parse("2026-12-15T19:59:00.000Z"));
  expect(latestStatedMs(parseArticleEnd(raiment)!)).toBe(Date.parse("2026-12-15T21:59:00.000Z"));
});

test("an article title is decoded from a wiki URL and nothing else", () => {
  expect(articleTitle("https://genshin-impact.fandom.com/wiki/The_Forge_Realm%27s_Temper/2026-11-04")).toBe(
    "The_Forge_Realm's_Temper/2026-11-04",
  );
  expect(articleTitle(fandom.url)).toBeNull();
  expect(articleTitle("https://game8.co/wiki/Hour_of_Ruin")).toBeNull();
});

test("the end lands on the row an article describes", () => {
  const [applied] = applyArticleEnds([row("Hour of Ruin")], listed, ends, () => {});
  expect(applied?.endPrecision).toBe("exact");
  expect(applied?.regionScoped).toBe(true);
  expect(applied?.regionEnds?.europe).toBe("2026-12-15T13:59:00.000Z");
  expect(applied?.endsAt).toBe("2026-12-15T06:59:00.000Z");
});

test("a global end leaves the row unscoped", () => {
  const raimentRow = row("Raiment Collection: Radiance Ablaze");
  const [applied] = applyArticleEnds(
    [raimentRow],
    listed,
    new Map([["Raiment_Collection/2026-11-04", parseArticleEnd(raiment)!]]),
    () => {},
  );
  expect(applied?.endPrecision).toBe("exact");
  expect(applied?.regionScoped).toBe(false);
  expect(applied?.regionEnds).toBeNull();
  expect(applied?.endsAt).toBe("2026-12-15T21:59:00.000Z");
});

test("a merged Game8 survivor takes the end through mergedIds", () => {
  const survivor: GachaEvent = {
    ...row("Hour of Ruin"),
    id: "genshin:game8-title:2026-11-04",
    sourceId: "genshin-game8-events",
    sourceUrl: "https://game8.co/games/Genshin-Impact/archives/301601",
    mergedIds: [HOUR_OF_RUIN_ID],
  };
  const [applied] = applyArticleEnds([survivor], listed, ends, () => {});
  expect(applied?.endPrecision).toBe("exact");
  expect(applied?.regionEnds?.america).toBe("2026-12-15T19:59:00.000Z");
});

test("a survivor of a real merge keeps its identity and takes the end", () => {
  const game8Copy: GachaEvent = {
    ...row("Hour of Ruin"),
    sourceId: "genshin-game8-events",
    sourceUrl: "https://game8.co/games/Genshin-Impact/archives/301601",
    confidence: 0.95,
  };
  const { events } = mergeEvents([[game8Copy], [row("Hour of Ruin")]]);
  const [applied] = applyArticleEnds(events, listed, ends, () => {});
  expect(applied?.sourceId).toBe("genshin-game8-events");
  expect(applied?.endPrecision).toBe("exact");
});

test("id, startsAt, sourceUrl, sourceId and classification never change", () => {
  const before = { ...row("Hour of Ruin"), classification: { lane: "miliastra" as const } };
  const [after] = applyArticleEnds([before], listed, ends, () => {});
  expect(after?.id).toBe(before.id);
  expect(after?.startsAt).toBe(before.startsAt);
  expect(after?.sourceUrl).toBe(before.sourceUrl);
  expect(after?.sourceId).toBe(before.sourceId);
  expect(after?.classification).toEqual(before.classification);
});

test("an article whose date disagrees with the table keeps the row and warns", () => {
  const stale = new Map([
    ["Hour_of_Ruin_(Event)", parseArticleEnd(withEnd("December 20, 2026 14:59 (Server Time)"))!],
  ]);
  const warnings: string[] = [];
  const input = [row("Hour of Ruin")];
  expect(applyArticleEnds(input, listed, stale, (w) => warnings.push(w))).toEqual(input);
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toContain("Hour of Ruin");
});

test("a survivor whose date disagrees with the table keeps the row and warns", () => {
  const survivor: GachaEvent = { ...row("Hour of Ruin"), endsAt: "2026-12-17T00:00:00.000Z" };
  const warnings: string[] = [];
  expect(applyArticleEnds([survivor], listed, ends, (w) => warnings.push(w))).toEqual([survivor]);
  expect(warnings.length).toBe(1);
});

test("a survivor already at exact precision is left alone without a warning", () => {
  const survivor: GachaEvent = {
    ...row("Hour of Ruin"),
    endsAt: "2026-12-15T10:00:00.000Z",
    endPrecision: "exact",
  };
  const warnings: string[] = [];
  expect(applyArticleEnds([survivor], listed, ends, (w) => warnings.push(w))).toEqual([survivor]);
  expect(warnings).toEqual([]);
});

test("no articles means the same contents as merged", () => {
  expect(applyArticleEnds(listed, listed, new Map(), () => {})).toEqual(listed);
});

test("a live row outlives the table's day on its stated end", () => {
  // Past the last region's 04:00 on the printed day, before America's 14:59.
  const lastDay = "2026-12-15T15:00:00.000Z";
  expect(parseTable(lastDay).some((e) => e.id === HOUR_OF_RUIN_ID)).toBe(false);
  expect(parseTable(lastDay, ends).some((e) => e.id === HOUR_OF_RUIN_ID)).toBe(true);
});

test("a stated end also retires a row, once every region has passed it", () => {
  expect(parseTable("2026-12-15T20:00:00.000Z", ends).some((e) => e.id === HOUR_OF_RUIN_ID)).toBe(false);
});

test("an article that disagrees on the date does not keep a row alive", () => {
  const stale = new Map([
    ["Hour_of_Ruin_(Event)", parseArticleEnd(withEnd("December 20, 2026 14:59 (Server Time)"))!],
  ]);
  expect(parseTable("2026-12-15T15:00:00.000Z", stale).some((e) => e.id === HOUR_OF_RUIN_ID)).toBe(false);
});
