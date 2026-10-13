import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  compareUrl,
  ENTRIES,
  EntrySchema,
  launchWindow,
  newestId,
  NOTES,
  NoteSchema,
  unseen,
  type Entry,
} from "../src/shared/changelog.ts";

/**
 * The changelog is reader-facing copy tied to git. These pin its shape — the
 * refs' existence is `scripts/check-changelog.ts`'s job, since CI is shallow.
 */
describe("the changelog's content", () => {
  test("every entry and note parses", () => {
    for (const e of ENTRIES) expect(EntrySchema.safeParse(e).success).toBe(true);
    for (const n of NOTES) expect(NoteSchema.safeParse(n).success).toBe(true);
  });

  test("ids are unique, and both lists are newest first", () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
    const sorted = (xs: { date: string }[]) =>
      xs.every((x, i) => i === 0 || xs[i - 1]!.date >= x.date);
    expect(sorted(ENTRIES)).toBe(true);
    expect(sorted(NOTES)).toBe(true);
  });

  test("every entry's note exists, and every note's specs exist on disk", () => {
    const ids = new Set(NOTES.map((n) => n.id));
    for (const e of ENTRIES) if (e.note !== undefined) expect(ids).toContain(e.note);
    for (const n of NOTES) for (const p of n.specs ?? []) expect(existsSync(p)).toBe(true);
  });
});

describe("what a reader has not seen", () => {
  const e = (id: string, date: string): Entry => ({
    id, date, kind: "feature", title: id, ref: "abcdef1",
  });
  const list = [e("c", "2026-10-13"), e("b", "2026-10-05"), e("a", "2026-09-01")];

  test("everything newer than the one they dismissed", () => {
    expect(unseen(list, "b", "2026-10-13").map((x) => x.id)).toEqual(["c"]);
    expect(unseen(list, "c", "2026-10-13")).toEqual([]);
  });

  test("never recorded: the last two weeks, once", () => {
    expect(unseen(list, undefined, "2026-10-13").map((x) => x.id)).toEqual(["c", "b"]);
  });

  test("a recorded id that is gone falls back to the launch window, not the whole history", () => {
    expect(unseen(list, "renamed", "2026-10-13").map((x) => x.id)).toEqual(["c", "b"]);
  });

  test("helpers", () => {
    expect(launchWindow(list, "2026-10-13", 3).map((x) => x.id)).toEqual(["c"]);
    expect(newestId(list)).toBe("c");
    expect(compareUrl("https://r", "a1b2c3d", "e4f5a6b")).toBe("https://r/compare/a1b2c3d...e4f5a6b");
  });
});
