import { describe, expect, test } from "bun:test";
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

  test("every entry's note exists, and every spec path is shaped like one", () => {
    const ids = new Set(NOTES.map((n) => n.id));
    for (const e of ENTRIES) if (e.note !== undefined) expect(ids).toContain(e.note);
    // Shape only: the image build runs this suite without docs/ (.dockerignore),
    // so whether the file exists is scripts/check-changelog.ts's question, the
    // same split the refs get for CI's shallow checkout.
    for (const n of NOTES) for (const p of n.specs ?? []) expect(p).toMatch(/^docs\/[\w./-]+\.md$/);
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

describe("the seen marker in prefs", () => {
  test("restore keeps a string and drops anything else", async () => {
    const { restorePrefsValue } = await import("../src/client/state/usePrefs.ts");
    expect(restorePrefsValue({ changelogSeen: "check-in-goals" }).changelogSeen).toBe("check-in-goals");
    expect(restorePrefsValue({ changelogSeen: 7 }).changelogSeen).toBeUndefined();
    expect(restorePrefsValue({}).changelogSeen).toBeUndefined();
  });

  test("first-run setup marks everything seen", async () => {
    const { firstRunPrefs } = await import("../src/client/state/usePrefs.ts");
    expect(firstRunPrefs(["genshin", "hsr"], ["hsr"], "soon")).toEqual({
      onboarded: true,
      hiddenGames: ["genshin"],
      view: "soon",
      changelogSeen: newestId(ENTRIES),
    });
  });
});
