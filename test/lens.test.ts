import { describe, expect, test } from "bun:test";
import { firstToExpire, outstanding } from "../src/client/state/lens.ts";
import type { GameId } from "../src/shared/schema.ts";

const row = (id: string, game: GameId, msRemaining: number | null) => ({
  event: { id, game },
  clock: { msRemaining },
});

const none = () => false;

describe("outstanding", () => {
  const rows = [
    row("a", "genshin", 1000),
    row("b", "hsr", 2000),
    row("c", "zzz", 3000),
  ];

  test("drops what the reader has finished", () => {
    // The headline and the dailies strip both tell the reader what to do, and
    // pointing at a job they already ticked off is the app arguing with them.
    expect(outstanding(rows, (id) => id === "b", none).map((r) => r.event.id)).toEqual(
      ["a", "c"],
    );
  });

  test("drops what they have ignored", () => {
    expect(outstanding(rows, none, (id) => id === "a").map((r) => r.event.id)).toEqual(
      ["b", "c"],
    );
  });

  test("done and ignored at once is still just gone", () => {
    expect(outstanding(rows, (id) => id === "a", (id) => id === "a")).toHaveLength(2);
  });

  test("nothing outstanding is an empty list, not a null", () => {
    expect(outstanding(rows, () => true, none)).toEqual([]);
  });
});

describe("firstToExpire", () => {
  test("takes the soonest, not the first row", () => {
    // The list arrives sorted by whatever mode the reader chose. Under "doing
    // first" its head is what they are partway through, which is not what a
    // panel headed "next to expire" claims to be showing.
    const rows = [
      row("mid-run", "genshin", 9 * 86_400_000),
      row("tonight", "hsr", 3 * 3_600_000),
    ];
    expect(firstToExpire(rows)?.event.id).toBe("tonight");
  });

  test("an unannounced end is never the deadline while a real one exists", () => {
    const rows = [row("unknown", "zzz", null), row("real", "wuwa", 5000)];
    expect(firstToExpire(rows)?.event.id).toBe("real");
  });

  test("falls back to an unknown end when it is all there is", () => {
    // It is still a live event and still worth showing; it is just not a
    // countdown. Showing nothing would be worse.
    expect(firstToExpire([row("unknown", "zzz", null)])?.event.id).toBe("unknown");
  });

  test("no rows is null rather than a crash", () => {
    expect(firstToExpire([])).toBeNull();
  });
});
