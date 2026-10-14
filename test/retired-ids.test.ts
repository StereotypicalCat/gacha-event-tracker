import { describe, expect, test } from "bun:test";
import {
  carryForward,
  carryDaily,
  carryMarks,
  carryProgress,
} from "../src/client/state/retiredIds.ts";

const OLD = "genshin:old-name:2026-09-23";
const NEW = "genshin:new-name:2026-09-23";
const T = { [OLD]: NEW };

describe("carryForward", () => {
  test("moves an entry to the id the feed now uses", () => {
    const out = carryForward({ [OLD]: { n: 1 } }, (a) => a, T);
    expect(out).toEqual({ [NEW]: { n: 1 } });
  });

  test("leaves ids nobody retired alone, and returns the same object", () => {
    const map = { "genshin:stygian-onslaught:2026-09-30": { n: 1 } };
    expect(carryForward(map, (a) => a, T)).toBe(map);
  });

  test("a corrupt store or entry never takes the app down", () => {
    // `readJson` returns a parsed `null` as it found it, and these run inside
    // useState initialisers, where a throw is a blank screen.
    expect(carryMarks(null as never, T)).toBe(null as never);
    const out = carryMarks(
      { [OLD]: null as never, [NEW]: { at: "2026-09-24T00:00:00.000Z" } },
      T,
    );
    expect(out[NEW]).toEqual({ at: "2026-09-24T00:00:00.000Z" });
  });

  test("is idempotent", () => {
    const once = carryForward({ [OLD]: { n: 1 }, x: { n: 2 } }, (a) => a, T);
    expect(carryForward(once, (a) => a, T)).toEqual(once);
  });
});

describe("when the reader marked both rows", () => {
  test("progress keeps whichever was touched last", () => {
    const out = carryProgress(
      {
        [OLD]: { status: "done", at: "2026-10-02T00:00:00.000Z" },
        [NEW]: { status: "doing", at: "2026-10-01T00:00:00.000Z" },
      },
      T,
    );
    expect(out).toEqual({
      [NEW]: { status: "done", at: "2026-10-02T00:00:00.000Z" },
    });
  });

  test("progress keeps a field only the older row held", () => {
    // Both rows are the reader's own, so the later one wins each field it
    // sets — but a note or a goal it never had is not something they removed.
    const out = carryProgress(
      {
        [OLD]: { status: "doing", note: "farm weekly", at: "2026-09-25T00:00:00.000Z" },
        [NEW]: { status: "done", at: "2026-10-02T00:00:00.000Z" },
      },
      T,
    );
    expect(out).toEqual({
      [NEW]: { status: "done", note: "farm weekly", at: "2026-10-02T00:00:00.000Z" },
    });
  });

  test("the daily log keeps every day either row was ticked", () => {
    const out = carryDaily(
      {
        [OLD]: { days: ["2026-09-24", "2026-09-26"], at: "2026-09-26T00:00:00.000Z" },
        [NEW]: { days: ["2026-09-25", "2026-09-26"], at: "2026-09-25T00:00:00.000Z" },
      },
      T,
    );
    expect(out).toEqual({
      [NEW]: {
        days: ["2026-09-24", "2026-09-25", "2026-09-26"],
        at: "2026-09-26T00:00:00.000Z",
      },
    });
  });

  test("an ignore keeps the earlier mark", () => {
    const out = carryMarks(
      {
        [OLD]: { at: "2026-09-24T00:00:00.000Z" },
        [NEW]: { at: "2026-09-30T00:00:00.000Z" },
      },
      T,
    );
    expect(out).toEqual({ [NEW]: { at: "2026-09-24T00:00:00.000Z" } });
  });
});
