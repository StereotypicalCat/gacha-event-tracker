import { useCallback, useEffect, useState } from "react";
import { readJson, writeJson } from "./storage.ts";

export interface Mark {
  /** When the reader made this mark. */
  at: string;
}
export type Marks = Record<string, Mark>;

/**
 * A set of per-event marks, keyed by event ID and persisted locally.
 *
 * Completions ("I finished this") and ignores ("stop showing me this") are the
 * same shape and want the same guarantees, so they share one implementation.
 * They stay separate stores because they mean different things: an ignored
 * event is hidden, a completed one is dimmed but still counted.
 */
export function useMarkSet(storageKey: string) {
  const [marks, setMarks] = useState<Marks>(() =>
    readJson<Marks>(storageKey, {}),
  );

  useEffect(() => {
    writeJson(storageKey, marks);
  }, [storageKey, marks]);

  const toggle = useCallback((id: string) => {
    setMarks((prev) => {
      if (prev[id] !== undefined) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { at: new Date().toISOString() } };
    });
  }, []);

  const clear = useCallback(() => setMarks({}), []);

  /**
   * Union merge, keeping the earlier mark. Never removes: nothing else holds a
   * copy of these, so a silent deletion would be unrecoverable.
   */
  const merge = useCallback((incoming: Marks) => {
    setMarks((prev) => {
      const next = { ...prev };
      for (const [id, value] of Object.entries(incoming)) {
        const existing = next[id];
        next[id] =
          existing === undefined || value.at < existing.at ? value : existing;
      }
      return next;
    });
  }, []);

  return { marks, toggle, merge, clear };
}
