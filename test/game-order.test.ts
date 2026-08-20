import { describe, expect, test } from "bun:test";
import { moveGame, orderGames } from "../src/client/state/gameOrder.ts";
import { metaFor } from "../src/shared/games.ts";
import type { LaneId } from "../src/shared/custom.ts";

/**
 * The reader's game order.
 *
 * The property that matters most here is not the order itself but that this
 * can never lose a lane: a game missing from the focus bar or from settings
 * looks exactly like a game that has been switched off, and the reader's fix
 * for that — go and switch it back on — does nothing.
 */

const nameOf = (id: LaneId) => metaFor(id, {}).name;

/** Deliberately neither alphabetical by name nor sorted by id. */
const LANES: LaneId[] = ["zzz", "genshin", "holodori", "hsr", "nikke", "arknights"];

const BY_NAME = [
  "arknights", // Arknights
  "genshin", // Genshin Impact
  "nikke", // Goddess of Victory: Nikke
  "holodori", // hololive Dreams
  "hsr", // Honkai: Star Rail
  "zzz", // Zenless Zone Zero
];

describe("orderGames", () => {
  test("no stored order: alphabetical by the name the reader sees", () => {
    // Not by LaneId — `hsr` is Honkai: Star Rail, and `nikke` is Goddess of
    // Victory: Nikke, which sorts fifth by id and third by name.
    expect(orderGames(LANES, undefined, nameOf)).toEqual(BY_NAME);
  });

  test("no stored order: a lowercase name sorts by letter, not by code point", () => {
    // hololive Dreams is the one lowercase name in `games.ts`. A `<` comparison
    // files it after every capitalised game instead of between Goddess and
    // Honkai.
    const order = orderGames(["hsr", "holodori", "nikke"], undefined, nameOf);
    expect(order).toEqual(["nikke", "holodori", "hsr"]);
  });

  test("a stored order is obeyed exactly", () => {
    const stored = ["zzz", "hsr", "genshin"];
    expect(orderGames(["genshin", "hsr", "zzz"], stored, nameOf)).toEqual(stored);
  });

  test("lanes the reader never placed come after the ones they did, alphabetically", () => {
    // The reader ordered two games; four more exist. Their two stay put and the
    // rest arrive in name order behind them — a game we added is not entitled
    // to a position in an order the reader made.
    const order = orderGames(LANES, ["zzz", "hsr"], nameOf);
    expect(order).toEqual(["zzz", "hsr", "arknights", "genshin", "nikke", "holodori"]);
  });

  test("a game that has left the feed is skipped, not rendered as a gap", () => {
    const order = orderGames(["genshin", "hsr"], ["zzz", "hsr", "genshin"], nameOf);
    expect(order).toEqual(["hsr", "genshin"]);
  });

  test("a retired game keeps its slot for when it comes back", () => {
    // We filter on output rather than pruning the stored list, so a source that
    // goes away and returns does not cost the reader the position they chose.
    const stored = ["zzz", "hsr", "genshin"];
    const gone = orderGames(["hsr", "genshin"], stored, nameOf);
    expect(gone).toEqual(["hsr", "genshin"]);
    expect(orderGames(["genshin", "hsr", "zzz"], stored, nameOf)).toEqual(stored);
  });

  test("the reader's own lanes sort with everything else", () => {
    const meta = (id: LaneId) =>
      metaFor(id, {
        "mygame:aether": {
          id: "mygame:aether",
          name: "Aether Gazer",
          hue: "#888888",
          at: "2026-08-01T00:00:00.000Z",
        },
      }).name;
    expect(orderGames(["hsr", "mygame:aether"], undefined, meta)).toEqual([
      "mygame:aether",
      "hsr",
    ]);
  });

  test("a lane with no metadata still sorts instead of throwing", () => {
    // `metaFor` is total and answers "Unknown game" for a lane it does not
    // know, which is what an import carrying an event whose game did not come
    // with it looks like.
    const order = orderGames(["zzz", "mygame:ghost"], undefined, nameOf);
    expect(order).toHaveLength(2);
    expect(new Set(order)).toEqual(new Set(["zzz", "mygame:ghost"]));
  });

  test("always a permutation of the lanes it was given", () => {
    // The safety property: a game dropped here is indistinguishable, on screen,
    // from a game the reader switched off — and switching it on would not bring
    // it back.
    const cases: Array<LaneId[] | undefined> = [
      undefined,
      [],
      ["zzz"],
      ["nope", "zzz", "hsr"],
      [...LANES].reverse(),
      ["zzz", "zzz", "hsr"],
    ];
    for (const stored of cases) {
      const order = orderGames(LANES, stored, nameOf);
      expect([...order].sort()).toEqual([...LANES].sort());
    }
  });

  test("an empty lane list is not an error", () => {
    expect(orderGames([], ["zzz"], nameOf)).toEqual([]);
    expect(orderGames([], undefined, nameOf)).toEqual([]);
  });

  test("does not mutate what it is given", () => {
    const lanes = [...LANES];
    const stored = ["zzz", "hsr"];
    orderGames(lanes, stored, nameOf);
    expect(lanes).toEqual(LANES);
    expect(stored).toEqual(["zzz", "hsr"]);
  });
});

describe("moveGame", () => {
  test("a move records the whole displayed list, so a partial stored order cannot mis-map", () => {
    // The indices come from what is on screen. Applied to the displayed list,
    // the result names every lane — which is what gets stored, so the next read
    // needs no fallback for the games the reader never touched.
    const displayed = ["a", "b", "c", "d"];
    expect(moveGame(displayed, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveGame(displayed, 3, 0)).toHaveLength(displayed.length);
  });

  test("moves one game and shifts the rest", () => {
    expect(moveGame(["a", "b", "c", "d"], 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveGame(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  test("a one-step move is the arrow buttons", () => {
    expect(moveGame(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveGame(["a", "b", "c"], 1, 2)).toEqual(["a", "c", "b"]);
  });

  test("off either end is a no-op, so the first row's up arrow is harmless", () => {
    const order = ["a", "b", "c"];
    expect(moveGame(order, 0, -1)).toEqual(order);
    expect(moveGame(order, 2, 3)).toEqual(order);
    expect(moveGame(order, -1, 1)).toEqual(order);
    expect(moveGame(order, 9, 1)).toEqual(order);
  });

  test("moving a game onto itself changes nothing", () => {
    expect(moveGame(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  test("never loses or duplicates a game", () => {
    const order = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < order.length; from += 1) {
      for (let to = 0; to < order.length; to += 1) {
        expect([...moveGame(order, from, to)].sort()).toEqual([...order].sort());
      }
    }
  });

  test("does not mutate what it is given", () => {
    const order = ["a", "b", "c"];
    moveGame(order, 0, 2);
    expect(order).toEqual(["a", "b", "c"]);
  });
});
