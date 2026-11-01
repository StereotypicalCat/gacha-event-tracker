import { expect, test } from "bun:test";
import { classificationFor, classifySourceLabels, displayGameFor, passFamilyFor, isTcgEvent } from "../src/shared/classification.ts";
import { GachaEvent } from "../src/shared/schema.ts";
import { mergeEvents } from "../src/ingest/merge.ts";
import { sampleEvent } from "./helpers/reader.ts";
import { ADAPTERS } from "../src/ingest/adapters/index.ts";

test("source labels retain Miliastra and pass identity independently", () => {
  expect(classifySourceLabels("In-Game, Miliastra Pass, Miliastra Wonderland")).toEqual({ lane: "miliastra", activity: "battle-pass", family: "miliastra-pass" });
  expect(classifySourceLabels("In-Game, Battle Pass")).toEqual({ activity: "battle-pass", family: "battle-pass" });
  expect(classifySourceLabels("In-Game, The Forge Realm's Temper")).toEqual({ tags: ["tcg"] });
  expect(classifySourceLabels("Challenge")).toEqual({});
});
test("cached article paths route poetic names without changing IDs", () => {
  const e = { ...sampleEvent, sourceUrl: "https://genshin-impact.fandom.com/wiki/Miliastra_Pass/2026-09-23" };
  expect(displayGameFor(e)).toBe("miliastra");
  expect(passFamilyFor(e)).toBe("miliastra-pass");
  expect(classificationFor({ ...sampleEvent, sourceUrl: "https://genshin-impact.fandom.com/wiki/Starlight_Voyage/2026-10-19" }).lane).toBe("miliastra");
  expect(classificationFor(sampleEvent)).toEqual({});
  expect(classificationFor({ ...e, id: "myevent:abcdef", sourceUrl: null })).toEqual({});
  expect(isTcgEvent({ ...sampleEvent, sourceUrl: "https://genshin-impact.fandom.com/wiki/The_Forge_Realm%27s_Temper/2026-09-23" })).toBe(true);
});
test("optional classification survives schema and the losing source's merge", () => {
  const labeled = GachaEvent.parse({ ...sampleEvent, sourceId: "second", confidence: 0.5, classification: { activity: "battle-pass", family: "battle-pass" } });
  expect(mergeEvents([[sampleEvent], [labeled]]).events[0]?.classification).toEqual({ activity: "battle-pass", family: "battle-pass" });
  expect(GachaEvent.parse(sampleEvent).id).toBe(sampleEvent.id);
});
test("the Genshin parser preserves its real type column", async () => {
  const a = ADAPTERS.find(a => a.id === "genshin-fandom-events")!;
  const events = a.parse(await Bun.file("fixtures/genshin/fandom-events-2026-09-12.html").text(), { now: "2026-09-12T12:00:00.000Z", sourceId: a.id, sourceUrl: a.url, game: a.game });
  expect(events.find(e => e.sourceUrl.includes("Miliastra_Pass"))?.classification).toHaveProperty("lane", "miliastra");
  expect(events.find(e => e.sourceUrl.includes("Battle_Pass"))?.classification).toHaveProperty("activity", "battle-pass");
});
test("conflicting explicit pass families are reported without choosing a routing", () => {
  const a = { ...sampleEvent, classification: { activity: "battle-pass" as const, family: "first" } };
  const b = { ...sampleEvent, sourceId: "second", classification: { activity: "battle-pass" as const, family: "second" } };
  const result = mergeEvents([[a], [b]]);
  expect(result.classificationConflicts).toHaveLength(1);
  expect(result.events[0]?.classification).toEqual({ unresolved: true });
});
