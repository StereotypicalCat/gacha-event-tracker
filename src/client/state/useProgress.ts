import { useCallback, useEffect, useState } from "react";
import type { Effort } from "../../shared/effort.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";
import type { Marks } from "./useMarkSet.ts";

/** Where the reader is with an event. Absent means untouched. */
export type Status = "doing" | "done";

export interface Progress {
  status?: Status | undefined;
  effort?: Effort | undefined;
  /**
   * The reader's own answer to "does this repeat daily?", overriding what the
   * source's wording implies. Absent means they have not said and detection
   * stands — see resolveDaily in shared/daily.ts.
   */
  daily?: boolean | undefined;
  /** Anything the reader wants to remember about it. */
  note?: string | undefined;
  at: string;
}

export type ProgressMap = Record<string, Progress>;

/**
 * Per-event notes the reader adds: where they are with it, how much work they
 * think it is, and anything else worth remembering.
 *
 * Supersedes the completions-only store. Completions were `{ [id]: { at } }`
 * with membership meaning "done"; this carries a status instead, so "started"
 * is expressible.
 *
 * MIGRATION: the old completions store is read once to seed `status: "done"`,
 * and is **never written to or deleted**. Someone who last opened the app six
 * months ago still has their marks under that key, and these live only in the
 * browser — nothing else holds a copy to restore from. See
 * docs/DATA-MODEL.md § Client-side storage.
 */
function load(): ProgressMap {
  const stored = readJson<ProgressMap>(KEYS.progress, {});
  if (Object.keys(stored).length > 0) return stored;

  const legacy = readJson<Marks>(KEYS.completions, {});
  const seeded: ProgressMap = {};
  for (const [id, mark] of Object.entries(legacy)) {
    seeded[id] = { status: "done", at: mark.at };
  }
  return seeded;
}

/**
 * Nothing recorded, so not worth a row. Every field the reader can set has to
 * be listed here: one left out means an event they marked *only* with that
 * field gets silently dropped on the next write.
 */
function isEmpty(p: Progress): boolean {
  return (
    p.status === undefined &&
    p.effort === undefined &&
    p.daily === undefined &&
    (p.note ?? "") === ""
  );
}

/**
 * Union merge on import, keeping whichever copy was touched last. Never removes.
 *
 * `useMarkSet` keeps the **earlier** of two marks and is right to. There `at` is
 * when the reader made the mark, membership in the set is the whole fact, and
 * the oldest timestamp is the truest answer to "when did they say this?" —
 * nothing is lost by preferring it.
 *
 * This store is the opposite shape, and it was merging the same way. Here the
 * record *is* the data — a status, an effort, a note, whether it repeats — and
 * `at` is when they last changed one of those. Keeping the earlier copy
 * therefore discards every edit made after it, in both of the directions an
 * import actually happens in: restoring a backup taken before an evening's work
 * rolls that evening back, and importing an old file into a device with newer
 * progress rolls the device back. Neither is recoverable, because nothing else
 * holds a copy.
 *
 * So the later record wins. Nothing is removed either way — an id present on
 * only one side always survives — which is the guarantee docs/DATA-MODEL.md
 * § Import makes, and taking the maximum of two timestamps keeps the merge
 * order-independent and idempotent exactly as the old rule was.
 *
 * A record whose `at` is not a string is an import that has been edited or
 * truncated. It can still land under an id nothing holds yet, but it never wins
 * a comparison against a record that does carry one.
 */
export function mergeProgress(
  current: ProgressMap,
  incoming: ProgressMap,
): ProgressMap {
  const touchedAt = (p: Progress): string =>
    typeof p.at === "string" ? p.at : "";

  const next = { ...current };
  for (const [id, value] of Object.entries(incoming)) {
    const existing = next[id];
    next[id] =
      existing === undefined || touchedAt(value) > touchedAt(existing)
        ? value
        : existing;
  }
  return next;
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressMap>(load);

  useEffect(() => {
    writeJson(KEYS.progress, progress);
  }, [progress]);

  const patch = useCallback((id: string, next: Partial<Progress>) => {
    setProgress((prev) => {
      const merged: Progress = {
        ...prev[id],
        ...next,
        at: new Date().toISOString(),
      };
      // An entry with nothing recorded is not worth keeping; drop it so the
      // store stays a set of things the reader actually said something about.
      if (isEmpty(merged)) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: merged };
    });
  }, []);

  const setStatus = useCallback(
    (id: string, status: Status | undefined) => patch(id, { status }),
    [patch],
  );

  // There was a `cycleStatus` here that advanced untouched → doing → done →
  // untouched from a single control. It is gone: the only caller was the sheet's
  // "Mark done" button, where one press on a fresh event produced "doing it" and
  // the press after "done" cleared the status instead of undoing it. Status is
  // set outright now, by a control per state.

  const setDaily = useCallback(
    (id: string, daily: boolean | undefined) => patch(id, { daily }),
    [patch],
  );

  const setEffort = useCallback(
    (id: string, effort: Effort | undefined) => patch(id, { effort }),
    [patch],
  );

  const setNote = useCallback(
    (id: string, note: string) => patch(id, { note: note.trim() }),
    [patch],
  );

  const merge = useCallback((incoming: ProgressMap) => {
    setProgress((prev) => mergeProgress(prev, incoming));
  }, []);

  return {
    progress,
    patch,
    setStatus,
    setDaily,
    setEffort,
    setNote,
    merge,
  };
}
