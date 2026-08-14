import { useCallback, useEffect, useState } from "react";
import { KEYS, readJson, writeJson } from "./storage.ts";

export interface Completion {
  completedAt: string;
}
export type Completions = Record<string, Completion>;

/**
 * Completion marks, keyed by event ID.
 *
 * Writes are optimistic and local — there is no round trip and no failure case
 * to design for.
 */
export function useCompletions() {
  const [completions, setCompletions] = useState<Completions>(() =>
    readJson<Completions>(KEYS.completions, {}),
  );

  useEffect(() => {
    writeJson(KEYS.completions, completions);
  }, [completions]);

  const toggle = useCallback((id: string) => {
    setCompletions((prev) => {
      if (prev[id] !== undefined) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { completedAt: new Date().toISOString() } };
    });
  }, []);

  /**
   * Import merges and never removes. A completion present on either side stays
   * completed — an import that silently wiped marks would be unrecoverable,
   * since nothing else holds a copy.
   */
  const merge = useCallback((incoming: Completions) => {
    setCompletions((prev) => {
      const next = { ...prev };
      for (const [id, value] of Object.entries(incoming)) {
        const existing = next[id];
        // Keep the earlier of the two marks; union of IDs, never a removal.
        next[id] =
          existing === undefined || value.completedAt < existing.completedAt
            ? value
            : existing;
      }
      return next;
    });
  }, []);

  return { completions, toggle, merge };
}
