import { describe, expect, test } from "bun:test";
import { adoptNewLanes } from "../src/client/state/usePrefs.ts";
import type { LaneId } from "../src/shared/custom.ts";

/**
 * What happens to a reader's games when we add a source.
 *
 * Adding one is our decision, not theirs: a reader who plays two games did not
 * ask for the other twelve, and a calendar that fills up on its own is the
 * thing the first-run picker exists to prevent. So a lane that is new to them
 * arrives switched off — and the one case that must never misfire is the
 * reader who installed before any of this was recorded.
 */

const TRACKED: LaneId[] = ["genshin", "hsr", "zzz"];

describe("adoptNewLanes", () => {
  test("an unrecorded reader has everything on their screen recorded, and nothing switched off", () => {
    // Every existing install is in this state. Reading "no record" as "has been
    // offered nothing" would switch off every game they already read.
    expect(adoptNewLanes(TRACKED, undefined, [])).toEqual({
      knownGames: TRACKED,
    });
  });

  test("a lane they were never offered arrives switched off", () => {
    const patch = adoptNewLanes([...TRACKED, "holodori"], TRACKED, []);
    expect(patch).toEqual({
      knownGames: [...TRACKED, "holodori"],
      hiddenGames: ["holodori"],
    });
  });

  test("their own game is recorded but never hidden", () => {
    // They asked for it by typing it in. Hiding it would be the app arguing
    // with the reader about a game they just created.
    const patch = adoptNewLanes(
      [...TRACKED, "mygame:limbus-company"],
      TRACKED,
      [],
    );
    expect(patch).toEqual({
      knownGames: [...TRACKED, "mygame:limbus-company"],
      hiddenGames: [],
    });
  });

  test("nothing new is nothing to write", () => {
    expect(adoptNewLanes(TRACKED, TRACKED, ["zzz"])).toBeNull();
  });

  test("an empty list is a feed that has not arrived, not a reader with no games", () => {
    // Seeding from it would record nothing and then treat every real game as
    // new the moment the feed lands.
    expect(adoptNewLanes([], undefined, [])).toBeNull();
    expect(adoptNewLanes([], TRACKED, [])).toBeNull();
  });

  test("a game they had already switched off is not listed twice", () => {
    const patch = adoptNewLanes([...TRACKED, "wuwa"], TRACKED, ["wuwa"]);
    expect(patch?.hiddenGames).toEqual(["wuwa"]);
  });

  test("their existing choices are left exactly as they were", () => {
    const patch = adoptNewLanes([...TRACKED, "fgo"], TRACKED, ["hsr"]);
    expect(patch?.hiddenGames).toEqual(["hsr", "fgo"]);
  });
});
