import { useCallback, useEffect, useState } from "react";
import { KEYS, readJson, writeJson } from "./storage.ts";

export interface DailyLog {
  /** Game-day keys (`YYYY-MM-DD`) the reader has ticked off, oldest first. */
  days: string[];
  /** When the log was last touched. Used to resolve import conflicts. */
  at: string;
}

export type DailyLogMap = Record<string, DailyLog>;

/**
 * Which days of a repeating event the reader has done.
 *
 * Kept apart from `progress` rather than nested inside it: progress is one
 * record per event and this is a growing list per event, and merging on import
 * means different things for the two (last-write-wins versus union). A daily
 * log is also the only store here that can lose *work* rather than a
 * preference — a fortnight's login streak exists nowhere else — so nothing in
 * this module ever removes a day the reader did not remove themselves.
 */
export function useDailyLog() {
  const [logs, setLogs] = useState<DailyLogMap>(() =>
    readJson<DailyLogMap>(KEYS.daily, {}),
  );

  useEffect(() => {
    writeJson(KEYS.daily, logs);
  }, [logs]);

  const toggleDay = useCallback((id: string, day: string) => {
    setLogs((prev) => {
      const current = prev[id]?.days ?? [];
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort();
      if (next.length === 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { days: next, at: new Date().toISOString() } };
    });
  }, []);

  const daysFor = useCallback(
    (id: string): string[] => logs[id]?.days ?? [],
    [logs],
  );

  /**
   * Union merge on import: every day either side recorded is a day the reader
   * actually played, so keeping both is the only answer that cannot lose one.
   */
  const merge = useCallback((incoming: DailyLogMap) => {
    setLogs((prev) => {
      const next = { ...prev };
      for (const [id, log] of Object.entries(incoming)) {
        // An imported file is untrusted input; a malformed entry is skipped
        // rather than allowed to take the store down with it.
        if (!Array.isArray(log?.days)) continue;
        const days = log.days.filter((d): d is string => typeof d === "string");
        if (days.length === 0) continue;
        const union = [...new Set([...(next[id]?.days ?? []), ...days])].sort();
        const at = next[id]?.at;
        const incomingAt =
          typeof log.at === "string" ? log.at : new Date().toISOString();
        next[id] = {
          days: union,
          at: at === undefined || incomingAt > at ? incomingAt : at,
        };
      }
      return next;
    });
  }, []);

  return { logs, toggleDay, daysFor, merge };
}
