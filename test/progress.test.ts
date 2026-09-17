import { describe, expect, test } from "bun:test";
import { buildExportData, parseImportData } from "../src/client/state/export.ts";
import { restorePrefsValue } from "../src/client/state/usePrefs.ts";
import { mergeProgress } from "../src/client/state/useProgress.ts";
import type { ProgressMap } from "../src/client/state/useProgress.ts";

/**
 * How an imported file meets the progress already on the device.
 *
 * This store is the only copy of what the reader has said about an event —
 * status, effort, note, whether it repeats — and there is no account and no
 * server holding a second one. So the merge has exactly two obligations: never
 * drop an id, and never roll an answer back to an older one. Both directions of
 * that second clause are real, because an import is as often a backup being
 * restored as it is a second device arriving.
 */

const at = (iso: string) => `2026-08-${iso}T12:00:00.000Z`;

describe("mergeProgress", () => {
  test("keeps an id that only one side has, from either side", () => {
    const device: ProgressMap = { a: { status: "done", at: at("10") } };
    const file: ProgressMap = { b: { status: "doing", at: at("11") } };
    expect(Object.keys(mergeProgress(device, file)).sort()).toEqual(["a", "b"]);
    expect(Object.keys(mergeProgress(file, device)).sort()).toEqual(["a", "b"]);
  });

  test("the later record wins, so a newer edit is not rolled back", () => {
    // The bug this replaces kept the *earlier* copy, which is right for a mark
    // — where `at` is when it was made — and wrong here, where the record is
    // the data and `at` is when it last changed. Restoring a backup taken
    // before an evening's work would have undone the evening.
    const older: ProgressMap = { a: { status: "doing", at: at("10") } };
    const newer: ProgressMap = {
      a: { status: "done", effort: "grind", note: "two more runs", at: at("14") },
    };

    expect(mergeProgress(older, newer).a).toEqual(newer.a);
    // And the same answer whichever way round it is applied, so restoring an
    // old file over newer progress does not roll the device back either.
    expect(mergeProgress(newer, older).a).toEqual(newer.a);
  });

  test("merging is idempotent and order-independent", () => {
    // Taking the maximum of two timestamps keeps both properties, which is what
    // makes importing the same file twice harmless.
    const a: ProgressMap = { x: { status: "done", at: at("10") } };
    const b: ProgressMap = { x: { status: "doing", at: at("12") } };
    const once = mergeProgress(a, b);
    expect(mergeProgress(once, b)).toEqual(once);
    expect(mergeProgress(b, a)).toEqual(once);
  });

  test("a record with no timestamp lands, but never wins", () => {
    // An import is untrusted input: a file edited by hand or truncated can carry
    // a record with no `at`. It is still the reader's data, so it is kept under
    // an id nothing holds — but it must not overwrite a record that does say
    // when it was touched.
    const broken = { at: undefined } as unknown as ProgressMap[string];
    const device: ProgressMap = { a: { status: "done", at: at("10") } };

    expect(mergeProgress(device, { a: broken }).a?.status).toBe("done");
    expect(mergeProgress(device, { fresh: broken }).fresh).toBe(broken);
  });

  test("nothing is ever removed, whatever the file says", () => {
    // The one guarantee docs/DATA-MODEL.md § Import actually makes.
    const device: ProgressMap = {
      a: { status: "done", at: at("10") },
      b: { note: "later", at: at("11") },
    };
    expect(Object.keys(mergeProgress(device, {})).sort()).toEqual(["a", "b"]);
  });
});

describe("buildExportData", () => {
  const dummyOwn = { games: {}, events: {} };

  test("progress export omits prefs", () => {
    const data = buildExportData({ a: { status: "done" } }, {}, {}, dummyOwn);
    expect(data.format).toBe("gacha-tracker-export");
    expect(data.version).toBe(1);
    expect(data.prefs).toBeUndefined();
    expect(data.progress).toEqual({ a: { status: "done" } });
  });

  test("export all includes prefs", () => {
    const prefs = { region: "asia" } as any;
    const data = buildExportData({ a: { status: "done" } }, {}, {}, dummyOwn, prefs);
    expect(data.format).toBe("gacha-tracker-export");
    expect(data.version).toBe(1);
    expect(data.prefs).toEqual(prefs);
  });
});

describe("parseImportData", () => {
  test("returns null for non-objects or invalid format", () => {
    expect(parseImportData(null)).toBeNull();
    expect(parseImportData("string")).toBeNull();
    expect(parseImportData({ format: "unknown" })).toBeNull();
  });

  test("parses export with progress, daily, ignored, and prefs", () => {
    const file = {
      format: "gacha-tracker-export",
      version: 1,
      progress: { "event:1": { status: "done" as const, at: "2026-08-10T12:00:00.000Z" } },
      daily: { "dailies:genshin": { days: ["2026-08-10"], at: "2026-08-10T12:00:00.000Z" } },
      ignored: { "event:2": { at: "2026-08-10T12:00:00.000Z" } },
      customGames: { "mygame:test": { id: "mygame:test" } },
      customEvents: { "myevent:test": { id: "myevent:test" } },
      prefs: { region: "europe", hiddenGames: ["zzz"] },
    };
    const parsed = parseImportData(file);
    expect(parsed).not.toBeNull();
    expect(parsed?.progress).toEqual(file.progress);
    expect(parsed?.daily).toEqual(file.daily as any);
    expect(parsed?.ignored).toEqual(file.ignored);
    expect(parsed?.customGames).toEqual(file.customGames);
    expect(parsed?.customEvents).toEqual(file.customEvents);
    expect(parsed?.prefs).toEqual(file.prefs);
  });

  test("maps legacy completions to progress with status done", () => {
    const file = {
      format: "gacha-tracker-export",
      version: 1,
      completions: { "legacy:1": { at: "2026-08-10T12:00:00.000Z" } },
    };
    const parsed = parseImportData(file);
    expect(parsed?.progress).toEqual({
      "legacy:1": { at: "2026-08-10T12:00:00.000Z", status: "done" as const },
    });
    expect(parsed?.prefs).toBeNull();
  });

  test("full migration round-trip preserves active games, order, and region", () => {
    const originalPrefs = {
      region: "asia" as const,
      hiddenGames: ["genshin"],
      gameOrder: ["zzz", "hsr", "genshin"],
      theme: "light" as const,
      sort: "doing" as const,
    };
    const progress = {
      "event:1": { status: "doing" as const, at: "2026-08-10T12:00:00.000Z" },
    };
    const own = {
      games: { "mygame:custom": { id: "mygame:custom", name: "Custom", hue: "#ff0000", at: "..." } },
      events: {},
    };

    // 1. Export all creates payload with prefs
    const exportedAll = buildExportData(progress, {}, {}, own, originalPrefs as any);
    const jsonString = JSON.stringify(exportedAll);

    // 2. Import parses the file
    const imported = parseImportData(JSON.parse(jsonString));
    expect(imported).not.toBeNull();
    expect(imported?.prefs).not.toBeNull();

    // 3. restorePrefsValue restores the exact preferences
    const restored = restorePrefsValue(imported!.prefs);
    expect(restored.region).toBe("asia");
    expect(restored.hiddenGames).toEqual(["genshin"]);
    expect(restored.gameOrder).toEqual(["zzz", "hsr", "genshin"]);
    expect(restored.theme).toBe("light");
    expect(restored.sort).toBe("doing");

    // 4. In contrast, standard progress export has null prefs on import
    const exportedProgressOnly = buildExportData(progress, {}, {}, own);
    const importedProgressOnly = parseImportData(JSON.parse(JSON.stringify(exportedProgressOnly)));
    expect(importedProgressOnly?.prefs).toBeNull();
  });
});


