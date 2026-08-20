import { describe, expect, test } from "bun:test";
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
