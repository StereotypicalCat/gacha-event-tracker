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

  const cycleStatus = useCallback(
    (id: string) => {
      setProgress((prev) => {
        // Untouched → doing → done → untouched. One control, three states, in
        // the order the reader actually moves through them.
        const current = prev[id]?.status;
        const next: Status | undefined =
          current === undefined ? "doing" : current === "doing" ? "done" : undefined;
        const merged: Progress = {
          ...prev[id],
          status: next,
          at: new Date().toISOString(),
        };
        if (isEmpty(merged)) {
          const { [id]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [id]: merged };
      });
    },
    [],
  );

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

  /** Union merge on import, keeping the earlier entry. Never removes. */
  const merge = useCallback((incoming: ProgressMap) => {
    setProgress((prev) => {
      const next = { ...prev };
      for (const [id, value] of Object.entries(incoming)) {
        const existing = next[id];
        next[id] =
          existing === undefined || value.at < existing.at ? value : existing;
      }
      return next;
    });
  }, []);

  return {
    progress,
    patch,
    setStatus,
    cycleStatus,
    setDaily,
    setEffort,
    setNote,
    merge,
  };
}
