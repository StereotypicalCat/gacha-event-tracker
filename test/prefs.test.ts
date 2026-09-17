import { describe, expect, test } from "bun:test";
import { adoptNewLanes, adoptRenamed, defaults, restorePrefsValue } from "../src/client/state/usePrefs.ts";
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

/**
 * A preference that changed its name.
 *
 * `timelineUpcoming` governed the board alone; `showUpcoming` governs the
 * checklist too. Nothing is lost by dropping the old name — `prefs` is one blob
 * under one key — but a reader who had switched the future on would find it off
 * again with no explanation, which is the same failure as forgetting their view.
 */
describe("adoptRenamed", () => {
  test("a reader's old answer is carried across", () => {
    expect(adoptRenamed({ timelineUpcoming: true })).toEqual({
      showUpcoming: true,
    });
    // Both directions: having said no is also an answer.
    expect(adoptRenamed({ timelineUpcoming: false })).toEqual({
      showUpcoming: false,
    });
  });

  test("the old name never overwrites a fresher one", () => {
    // Once written back under the new name, the leftover must not undo it —
    // otherwise the setting would spring back on every load.
    expect(
      adoptRenamed({ timelineUpcoming: true, showUpcoming: false }),
    ).toEqual({ showUpcoming: false });
  });

  test("it is dropped rather than carried into the stored object", () => {
    // Kept, it would be written straight back and outlive the migration.
    expect(
      Object.keys(adoptRenamed({ timelineUpcoming: true, sort: "doing" })),
    ).toEqual(["sort", "showUpcoming"]);
  });

  test("a reader with neither is left alone", () => {
    expect(adoptRenamed({ sort: "doing" })).toEqual({ sort: "doing" });
    expect(adoptRenamed({})).toEqual({});
  });
});

describe("defaults that a reader would notice losing", () => {
  test("the chores are on until someone says otherwise", () => {
    // Flipping this one line silently empties Today's dailies for every
    // existing reader — it is the whole argument of the comment above it, and
    // nothing else in the suite was watching it.
    expect(defaults().showChores).toBe(true);
  });

  test("a stored blob without the key keeps the default", () => {
    // The upgrade path. Prefs saved before this key existed must not read as
    // "off" — `{...defaults(), ...stored}` is what guarantees that, and JSON
    // cannot carry an `undefined` that would override it.
    const stored = { region: "europe", detectDaily: false } as const;
    expect({ ...defaults(), ...stored }.showChores).toBe(true);
  });
});

describe("restorePrefsValue", () => {
  test("returns defaults when passed null or non-object", () => {
    expect(restorePrefsValue(null)).toEqual(defaults());
    expect(restorePrefsValue(undefined)).toEqual(defaults());
    expect(restorePrefsValue("invalid")).toEqual(defaults());
  });

  test("restores full valid preferences from an export", () => {
    const exported = {
      region: "asia" as const,
      hiddenGames: ["genshin", "hsr"],
      knownGames: ["genshin", "hsr", "zzz"],
      gameOrder: ["zzz", "genshin"],
      focusGame: "zzz",
      sort: "doing" as const,
      view: "timeline" as const,
      timelineDayWidth: 48,
      timelineGroup: "ending" as const,
      showUpcoming: true,
      timelineSplitUpcoming: false,
      detectDaily: true,
      showChores: false,
      showCompleted: false,
      showIgnored: true,
      theme: "light" as const,
      regionConfirmed: true,
      onboarded: true,
    };
    expect(restorePrefsValue(exported)).toEqual(exported);
  });

  test("falls back to defaults for missing fields from older exports", () => {
    const older = {
      region: "europe" as const,
      hiddenGames: ["zzz"],
      theme: "dark" as const,
    };
    const restored = restorePrefsValue(older);
    expect(restored.region).toBe("europe");
    expect(restored.hiddenGames).toEqual(["zzz"]);
    expect(restored.theme).toBe("dark");
    // missing fields use defaults
    expect(restored.showChores).toBe(defaults().showChores);
    expect(restored.timelineGroup).toBe(defaults().timelineGroup);
    expect(restored.sort).toBe(defaults().sort);
  });

  test("adopts renamed fields like timelineUpcoming to showUpcoming", () => {
    const legacy = {
      timelineUpcoming: true,
    };
    const restored = restorePrefsValue(legacy);
    expect(restored.showUpcoming).toBe(true);
  });

  test("sanitizes corrupt or invalid fields", () => {
    const corrupt = {
      region: "mars",
      hiddenGames: "not-an-array",
      gameOrder: 123,
      timelineDayWidth: -99,
      theme: "neon",
      view: "grid",
    };
    const restored = restorePrefsValue(corrupt);
    expect(restored.region).toBe(defaults().region);
    expect(restored.hiddenGames).toEqual([]);
    expect(restored.gameOrder).toBeUndefined();
    expect(restored.timelineDayWidth).toBe(defaults().timelineDayWidth);
    expect(restored.theme).toBe(defaults().theme);
    expect(restored.view).toBe(defaults().view);
  });
});
