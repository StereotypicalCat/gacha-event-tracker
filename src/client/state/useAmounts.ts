import { useCallback, useEffect, useState } from "react";
import type { AmountLog } from "../../shared/goal.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";

/** Every item's numbers: `{ [itemKey]: { [periodStart]: { value, at } } }`. */
export type AmountLogMap = Record<string, AmountLog>;

/**
 * The store as it sits on disk. Entries are checked where they are read, not
 * when loaded: filtering on load would make the next write delete whatever did
 * not parse, and the likeliest thing that does not parse is a newer version's.
 */
export type StoredAmounts = Record<string, Record<string, unknown>>;

/** One item's readable entries; anything malformed is left in storage and skipped here. */
export function readableAmounts(log: Record<string, unknown> | undefined): AmountLog {
  const out: AmountLog = {};
  for (const [period, entry] of Object.entries(log ?? {})) {
    if (isEntry(entry)) out[period] = { value: entry.value, at: entry.at };
  }
  return out;
}

const isEntry = (v: unknown): v is { value: number; at: string } =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { value: unknown }).value === "number" &&
  Number.isFinite((v as { value: number }).value) &&
  typeof (v as { at: unknown }).at === "string";

/**
 * Import: merge per item **and** per period, the later `at` winning, nothing
 * removed.
 *
 * Per period because a week's number is its own fact: restoring last month's
 * backup must not roll this week's 1,900 back to an earlier 800, and must not
 * lose a week the device never saw. A malformed entry is skipped — a file is
 * untrusted input — rather than allowed to take the rest with it.
 */
export function mergeAmounts(current: StoredAmounts, incoming: unknown): StoredAmounts {
  if (typeof incoming !== "object" || incoming === null) return current;
  const next: StoredAmounts = { ...current };
  for (const [key, log] of Object.entries(incoming as Record<string, unknown>)) {
    if (typeof log !== "object" || log === null) continue;
    for (const [period, entry] of Object.entries(log as Record<string, unknown>)) {
      if (!isEntry(entry)) continue;
      const mine = next[key]?.[period];
      if (isEntry(mine) && mine.at >= entry.at) continue;
      const log = next[key];
      const kept = typeof log === "object" && log !== null ? log : {};
      next[key] = { ...kept, [period]: { value: entry.value, at: entry.at } };
    }
  }
  return next;
}

/**
 * Numbers the reader entered against a target, one per item per period.
 *
 * Kept apart from the day log because it is a different kind of fact — a
 * running total rather than a set of days — and from `progress` because it
 * grows a value per week. Nothing here prunes an old period: last month's
 * number is the reader's record and costs a few bytes.
 */
export function useAmounts() {
  const [amounts, setAmounts] = useState<StoredAmounts>(() => {
    const raw = readJson<unknown>(KEYS.amounts, {});
    return typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as StoredAmounts)
      : {};
  });

  useEffect(() => {
    writeJson(KEYS.amounts, amounts);
  }, [amounts]);

  const amountsFor = useCallback(
    (key: string): AmountLog => readableAmounts(amounts[key]),
    [amounts],
  );

  /** Set one period's number; undefined clears that period alone, at the reader's word. */
  const setAmount = useCallback(
    (key: string, periodStart: string, value: number | undefined) => {
      setAmounts((prev) => {
        const { [periodStart]: _old, ...rest } = prev[key] ?? {};
        const log =
          value === undefined ? rest : { ...rest, [periodStart]: { value, at: new Date().toISOString() } };
        if (Object.keys(log).length === 0) {
          const { [key]: _gone, ...others } = prev;
          return others;
        }
        return { ...prev, [key]: log };
      });
    },
    [],
  );

  const merge = useCallback((incoming: unknown) => {
    setAmounts((prev) => mergeAmounts(prev, incoming));
  }, []);

  return { amounts, amountsFor, setAmount, merge };
}
