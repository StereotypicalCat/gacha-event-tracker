import { describe, expect, test } from "bun:test";
import { DAY } from "../src/shared/time.ts";
import {
  VERSION_DAYS,
  VERSIONS,
  versionCaption,
  versionWindow,
  type GameVersion,
} from "../src/shared/versions.ts";

/**
 * Version timers: a hand-kept, cited table (spec 2026-10-22). A routine resets
 * only at an end the table records; an estimate is shown and never acted on.
 */

const at = (iso: string) => Date.parse(iso);

describe("VERSIONS", () => {
  test("each game's versions are in order and meet end to start", () => {
    const games = new Set(VERSIONS.map((v) => v.game));
    for (const game of games) {
      const list = VERSIONS.filter((v) => v.game === game);
      list.forEach((v, i) => {
        expect(Number.isFinite(at(v.start))).toBe(true);
        if (v.end !== undefined) expect(at(v.end)).toBeGreaterThan(at(v.start));
        const next = list[i + 1];
        if (next !== undefined) {
          expect(at(next.start)).toBeGreaterThan(at(v.start));
          if (v.end !== undefined) expect(at(v.end)).toBe(at(next.start));
          else expect(v.end).toBeDefined(); // only the newest may be open
        }
      });
    }
  });

  test("every one cites an https page and the day it was read", () => {
    for (const v of VERSIONS) {
      expect(v.source.startsWith("https://")).toBe(true);
      expect(v.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (v.note?.toLowerCase().includes("in game") === true)
        expect(v.note).toMatch(/Confirmed in game, \d{4}-\d{2}-\d{2}\./);
    }
  });
});

describe("versionWindow", () => {
  test("inside 3.7: its number, its key, its recorded end", () => {
    expect(versionWindow("wuwa", at("2026-10-22T14:30:00Z"))).toEqual({
      number: "3.7",
      key: "2026-09-30",
      start: at("2026-09-30T03:00:00Z"),
      end: at("2026-11-11T10:30:00Z"),
      estimate: undefined,
      nextNumber: "3.8",
    });
  });

  test("rolls at the recorded instant, not a minute before", () => {
    expect(versionWindow("wuwa", at("2026-11-11T10:29:00Z"))?.number).toBe("3.7");
    expect(versionWindow("wuwa", at("2026-11-11T10:30:00Z"))).toEqual({
      number: "3.8",
      key: "2026-11-11",
      start: at("2026-11-11T10:30:00Z"),
      end: undefined,
      estimate: at("2026-11-11T10:30:00Z") + 42 * DAY,
      nextNumber: undefined,
    });
  });

  test("never rolls on an estimate: far past it, still 3.8 under the same key", () => {
    const w = versionWindow("wuwa", at("2027-02-01T00:00:00Z"));
    expect(w?.number).toBe("3.8");
    expect(w?.key).toBe("2026-11-11");
  });

  const open: GameVersion = {
    game: "wuwa",
    number: "4.0",
    start: "2026-12-23T03:00:00Z",
    next: "4.1",
    source: "https://example.org/",
    checked: "2026-10-22",
  };

  test("a newest entry with no end is open, estimated from its own start", () => {
    const w = versionWindow("wuwa", at("2026-12-30T00:00:00Z"), [open]);
    expect(w).toEqual({
      number: "4.0",
      key: "2026-12-23",
      start: at(open.start),
      end: undefined,
      estimate: at(open.start) + 42 * DAY,
      nextNumber: "4.1",
    });
  });

  test("no usual length, no estimate", () => {
    expect(versionWindow("wuwa", at("2026-12-30T00:00:00Z"), [open], {})?.estimate).toBeUndefined();
  });

  test("a game with no versions has no window", () => {
    expect(versionWindow("genshin", at("2026-10-22T00:00:00Z"))).toBeUndefined();
  });

  test("WuWa's usual length is six weeks", () => {
    expect(VERSION_DAYS.wuwa).toBe(42);
  });
});

describe("versionCaption", () => {
  const base = { key: "2026-11-11", start: at("2026-11-11T10:30:00Z") };
  const estimate = at("2026-12-23T10:30:00Z");

  test("a recorded end names the next version and the day", () => {
    const w = versionWindow("wuwa", at("2026-10-22T14:30:00Z"))!;
    expect(versionCaption(w, at("2026-10-22T14:30:00Z"))).toBe("resets with 3.8 · 11 Nov");
  });

  test("no recorded end: the next version, if named, and the estimate", () => {
    const now = at("2026-11-20T00:00:00Z");
    expect(versionCaption({ ...base, number: "3.8", nextNumber: "3.9", estimate }, now)).toBe(
      "resets with next version (3.9) · expected ~23 Dec",
    );
    expect(versionCaption({ ...base, number: "3.8", estimate }, now)).toBe(
      "resets with next version · expected ~23 Dec",
    );
  });

  test("past the estimate, it says the end is not yet confirmed", () => {
    expect(versionCaption({ ...base, estimate }, at("2027-01-02T00:00:00Z"))).toBe(
      "resets with next version · expected ~23 Dec, not yet confirmed",
    );
  });

  test("no estimate at all", () => {
    expect(versionCaption(base, at("2026-11-20T00:00:00Z"))).toBe("resets with next version");
  });
});
