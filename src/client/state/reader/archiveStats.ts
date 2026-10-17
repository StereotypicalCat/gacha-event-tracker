import type { ArchiveRecord } from "./schema.ts";
import { readGoal } from "../../../shared/goal.ts";
import { recordOf } from "./actions.ts";
export interface ArchiveStats {
  monthly: { done: number; eligible: number; rate: number | null };
  overall: { done: number; eligible: number; rate: number | null };
  currentRun: number;
  bestRun: number;
  checkIns: number;
  unfinished: number;
  shortfalls: { id: string; title: string; needed: number }[];
  games: Record<string, { done: number; ignored: number; unfinished: number }>;
}
export function archiveStats(
  records: readonly ArchiveRecord[],
  now: number,
): ArchiveStats {
  const month = new Date(now).toISOString().slice(0, 7),
    time = (r: ArchiveRecord) =>
      r.outcome === "unfinished" && r.resolvedEnd !== null
        ? r.resolvedEnd
        : Date.parse(r.outcomeAt);
  const eligible = records
    .filter(
      (r) =>
        r.outcome !== "ignored" &&
        (r.outcome === "done" ||
          (r.resolvedEnd !== null && r.resolvedEnd <= now)),
    )
    .slice()
    .sort(
      (a, b) =>
        time(a) - time(b) ||
        a.accountId.localeCompare(b.accountId) ||
        a.event.id.localeCompare(b.event.id),
    );
  const tally = (rows: readonly ArchiveRecord[]) => {
    const done = rows.filter((r) => r.outcome === "done").length;
    return {
      done,
      eligible: rows.length,
      rate: rows.length ? Math.round((done / rows.length) * 100) : null,
    };
  };
  let currentRun = 0,
    bestRun = 0;
  for (const r of eligible) {
    currentRun = r.outcome === "done" ? currentRun + 1 : 0;
    bestRun = Math.max(bestRun, currentRun);
  }
  const games: ArchiveStats["games"] = {};
  for (const r of records) {
    games[r.event.game] ??= { done: 0, ignored: 0, unfinished: 0 };
    games[r.event.game]![r.outcome]++;
  }
  const shortfalls: ArchiveStats["shortfalls"] = [];
  for (const r of eligible.filter((r) => r.outcome === "unfinished")) {
    const goal = readGoal(recordOf(r.progress).goal);
    if (goal?.period === "event" && goal.measure === "days") {
      const needed = goal.required - new Set(r.days).size;
      if (needed > 0)
        shortfalls.push({ id: r.event.id, title: r.event.title, needed });
    }
  }
  return {
    monthly: tally(
      eligible.filter((r) => new Date(time(r)).toISOString().startsWith(month)),
    ),
    overall: tally(eligible),
    currentRun,
    bestRun,
    checkIns: records.reduce((n, r) => n + new Set(r.days).size, 0),
    unfinished: records.filter((r) => r.outcome === "unfinished").length,
    shortfalls,
    games,
  };
}
