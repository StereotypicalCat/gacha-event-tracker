import { describe, expect, test } from "bun:test";
import { exceptionLine, setFor, shownFor } from "../src/shared/perGame.ts";

/**
 * One rule for "the app supplies this for a game": a global answer, and the
 * games that differ from it. Chores and built-in weekly tasks both read it, so
 * a reader's per-game answer means the same thing in both places.
 */
describe("shownFor", () => {
  test("with no exceptions, every game takes the global answer", () => {
    expect(shownFor({ all: true }, "genshin")).toBe(true);
    expect(shownFor({ all: false }, "genshin")).toBe(false);
  });

  test("an exception overrides the global answer for its game only", () => {
    expect(shownFor({ all: false, on: ["zzz"] }, "zzz")).toBe(true);
    expect(shownFor({ all: false, on: ["zzz"] }, "genshin")).toBe(false);
    expect(shownFor({ all: true, off: ["hsr"] }, "hsr")).toBe(false);
    expect(shownFor({ all: true, off: ["hsr"] }, "genshin")).toBe(true);
  });

  test("an exception survives the global answer flipping", () => {
    // Flipping the switch rewrites nothing else; a game the reader singled out
    // stays singled out.
    expect(shownFor({ all: true, on: ["zzz"] }, "zzz")).toBe(true);
    expect(shownFor({ all: false, off: ["hsr"] }, "hsr")).toBe(false);
  });

  test("a game in both lists — hand-edited storage — is shown", () => {
    expect(shownFor({ all: false, on: ["zzz"], off: ["zzz"] }, "zzz")).toBe(true);
    expect(shownFor({ all: true, on: ["zzz"], off: ["zzz"] }, "zzz")).toBe(true);
  });
});

describe("setFor", () => {
  test("an answer that differs from the global one is recorded as an exception", () => {
    expect(setFor({ all: false }, "zzz", true)).toEqual({ on: ["zzz"], off: [] });
    expect(setFor({ all: true }, "hsr", false)).toEqual({ on: [], off: ["hsr"] });
  });

  test("an answer that matches the global one clears the exception", () => {
    expect(setFor({ all: false, on: ["zzz", "endfield"] }, "zzz", false)).toEqual({
      on: ["endfield"],
      off: [],
    });
    expect(setFor({ all: true, off: ["hsr"] }, "hsr", true)).toEqual({ on: [], off: [] });
  });

  test("a game never ends up in both lists", () => {
    expect(setFor({ all: true, on: ["zzz"], off: ["zzz"] }, "zzz", false)).toEqual({
      on: [],
      off: ["zzz"],
    });
  });

  test("other games' exceptions are left where they were", () => {
    expect(setFor({ all: true, off: ["hsr"] }, "genshin", false)).toEqual({
      on: [],
      off: ["hsr", "genshin"],
    });
  });
});

describe("exceptionLine", () => {
  const name = (g: string) => ({ genshin: "Genshin Impact", zzz: "Zenless Zone Zero" })[g] ?? g;
  const games = ["genshin", "hsr", "zzz", "endfield"];

  test("on for everyone, or off for everyone", () => {
    expect(exceptionLine({ all: true }, games, name)).toBe("Every game");
    expect(exceptionLine({ all: false }, games, name)).toBe("No game");
  });

  test("one exception is named", () => {
    expect(exceptionLine({ all: true, off: ["genshin"] }, games, name)).toBe("All but Genshin Impact");
    expect(exceptionLine({ all: false, on: ["zzz"] }, games, name)).toBe("Only Zenless Zone Zero");
  });

  test("several are counted", () => {
    expect(exceptionLine({ all: true, off: ["genshin", "hsr", "zzz"] }, games, name)).toBe(
      "All but 3 games",
    );
    expect(exceptionLine({ all: false, on: ["genshin", "zzz"] }, games, name)).toBe("Only 2 games");
  });

  test("only the games listed count — an exception agreeing with the global answer is none", () => {
    expect(exceptionLine({ all: true, off: ["fgo"] }, games, name)).toBe("Every game");
    expect(exceptionLine({ all: true, on: ["zzz"] }, games, name)).toBe("Every game");
  });
});
