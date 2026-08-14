import { describe, expect, test } from "bun:test";
import {
  mergeEvents,
  titleExtends,
  titleSimilarity,
} from "../src/ingest/merge.ts";
import type { GachaEvent } from "../src/shared/schema.ts";

const NOW = "2026-08-14T00:00:00.000Z";

function event(overrides: Partial<GachaEvent> = {}): GachaEvent {
  return {
    id: "genshin:test-event:2026-08-12",
    game: "genshin",
    title: "Test Event",
    type: "other",
    summary: null,
    startsAt: "2026-08-12T00:00:00.000Z",
    startPrecision: "day",
    endsAt: "2026-08-24T00:00:00.000Z",
    endPrecision: "day",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: "https://example.test/a",
    sourceId: "source-a",
    status: "published",
    confidence: 0.9,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("mergeEvents", () => {
  test("keeps distinct events from different sources", () => {
    const a = event({ id: "genshin:a:2026-08-12", title: "Alpha" });
    const b = event({
      id: "genshin:b:2026-09-01",
      title: "Beta",
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-10T00:00:00.000Z",
      sourceId: "source-b",
    });
    const { events, conflicts } = mergeEvents([[a], [b]]);
    expect(events).toHaveLength(2);
    expect(conflicts).toHaveLength(0);
  });

  test("collapses the same event seen by two sources", () => {
    const a = event({ sourceId: "source-a", confidence: 0.85 });
    const b = event({ sourceId: "source-b", confidence: 0.9 });
    const { events } = mergeEvents([[a], [b]]);
    expect(events).toHaveLength(1);
  });

  test("raises confidence when an independent source corroborates", () => {
    const a = event({ sourceId: "source-a", confidence: 0.85 });
    const b = event({ sourceId: "source-b", confidence: 0.85 });
    const { events } = mergeEvents([[a], [b]]);
    // Two sources independently agreeing is stronger evidence than one.
    expect(events[0]?.confidence).toBeCloseTo(0.95, 5);
  });

  test("does not corroborate a duplicate from the same source", () => {
    const a = event({ sourceId: "source-a", confidence: 0.85 });
    const { events } = mergeEvents([[a, { ...a }]]);
    expect(events).toHaveLength(1);
    expect(events[0]?.confidence).toBeCloseTo(0.85, 5);
  });

  test("matches the same event under slightly different titles", () => {
    const a = event({ title: "Stygian Onslaught", sourceId: "source-a" });
    const b = event({
      id: "genshin:stygian-onslaught-event:2026-08-12",
      title: "Stygian Onslaught Event",
      sourceId: "source-b",
    });
    const { events } = mergeEvents([[a], [b]]);
    expect(events).toHaveLength(1);
  });

  test("flags an end-date disagreement instead of picking silently", () => {
    const a = event({ sourceId: "source-a", confidence: 0.9 });
    const b = event({
      sourceId: "source-b",
      confidence: 0.8,
      endsAt: "2026-08-28T00:00:00.000Z", // 4 days later
    });
    const { events, conflicts } = mergeEvents([[a], [b]]);
    expect(events).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.field).toBe("endsAt");
    expect(conflicts[0]?.deltaHours).toBe(96);
    // The conflict is surfaced, not averaged away, and confidence is NOT
    // bumped — disagreement is the opposite of corroboration.
    expect(events[0]?.confidence).toBeCloseTo(0.9, 5);
  });

  test("treats a same-name rerun months later as a separate event", () => {
    const a = event({ title: "Windblume Festival" });
    const b = event({
      id: "genshin:windblume-festival:2027-03-01",
      title: "Windblume Festival",
      startsAt: "2027-03-01T00:00:00.000Z",
      endsAt: "2027-03-20T00:00:00.000Z",
      sourceId: "source-b",
    });
    const { events } = mergeEvents([[a], [b]]);
    expect(events).toHaveLength(2);
  });

  test("returns events sorted by start date", () => {
    const late = event({
      id: "genshin:late:2026-09-01",
      title: "Late",
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-05T00:00:00.000Z",
    });
    const early = event({ id: "genshin:early:2026-08-01", title: "Early",
      startsAt: "2026-08-01T00:00:00.000Z" });
    const { events } = mergeEvents([[late], [early]]);
    expect(events.map((e) => e.title)).toEqual(["Early", "Late"]);
  });
});

describe("titleSimilarity", () => {
  test("identical titles score 1", () => {
    expect(titleSimilarity("Stygian Onslaught", "Stygian Onslaught")).toBe(1);
  });

  test("ignores case and punctuation", () => {
    expect(titleSimilarity("Gold Clash!", "gold clash")).toBe(1);
  });

  test("unrelated titles score low", () => {
    expect(titleSimilarity("Gold Clash", "Fishing Frenzy")).toBeLessThan(0.3);
  });
});

describe("titleExtends", () => {
  test("matches a title with an appended qualifier", () => {
    // Real case: Game8 says "Bedazzling Dawnstar Sign-In", wiki.gg says
    // "Bedazzling Dawnstar". Token overlap scores 0.67 — under any safe
    // threshold — but it is plainly one event.
    expect(titleExtends("Bedazzling Dawnstar", "Bedazzling Dawnstar Sign-In")).toBe(true);
  });

  test("refuses a single shared word", () => {
    // A one-word title would otherwise swallow everything containing it.
    expect(titleExtends("Rerun", "Overflowing Abundance Rerun")).toBe(false);
  });

  test("refuses a shared-word subset that is not a prefix", () => {
    // Subset matching would fuse these; they are different events.
    expect(titleExtends("Gold Clash", "Gold Rush Clash Royale")).toBe(false);
  });

  test("refuses two titles of equal length", () => {
    expect(titleExtends("Gold Clash", "Gold Rush")).toBe(false);
  });
});

describe("merging two sources for one game", () => {
  test("collapses an appended-qualifier duplicate and flags the date gap", () => {
    const g8 = event({
      id: "endfield:bedazzling-dawnstar-sign-in:2026-08-09",
      game: "endfield",
      title: "Bedazzling Dawnstar Sign-In",
      startsAt: "2026-08-09T00:00:00.000Z",
      endsAt: "2026-08-30T00:00:00.000Z",
      sourceId: "endfield-game8-events",
      confidence: 0.85,
    });
    const wiki = event({
      id: "endfield:bedazzling-dawnstar:2026-08-09",
      game: "endfield",
      title: "Bedazzling Dawnstar",
      startsAt: "2026-08-09T04:00:00.000Z",
      endsAt: "2026-09-01T22:00:00.000Z",
      sourceId: "endfield-wikigg-events",
      confidence: 0.95,
    });
    const { events, conflicts } = mergeEvents([[g8], [wiki]]);
    expect(events).toHaveLength(1);
    // The better-sourced copy wins, and the disagreement is surfaced rather
    // than averaged into a date neither source states.
    expect(events[0]?.sourceId).toBe("endfield-wikigg-events");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.field).toBe("endsAt");
  });
});
