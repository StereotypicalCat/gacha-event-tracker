import {
  carryForward,
  carryDaily,
  carryMarks,
  carryProgress,
  RETIRED_IDS,
  type CarryTable,
} from "../retiredIds.ts";
import type { ProgressMap } from "../useProgress.ts";
import type { DailyLogMap } from "../useDailyLog.ts";
import type { Marks } from "../useMarkSet.ts";
import { pairKey, type ReaderState } from "./schema.ts";
import { recordOf } from "./actions.ts";
export function applyReaderAliases(
  state: ReaderState,
  table: CarryTable,
): ReaderState {
  const combined = { ...RETIRED_IDS, ...table };
  if (
    !Object.values(state.data).some((d) =>
      [
        d.progress,
        d.ignored,
        ...Object.values(d.daily),
        ...Object.values(d.amounts),
      ].some((map) =>
        Object.keys(combined).some((id) => Object.hasOwn(map, id)),
      ),
    ) &&
    ![...Object.values(state.archive), ...Object.values(state.seenEvents)].some(
      (r) => Object.hasOwn(combined, r.event.id),
    )
  )
    return state;
  const data = { ...state.data };
  for (const [id, d] of Object.entries(data)) {
    data[id] = {
      ...d,
      progress: carryProgress(d.progress as ProgressMap, combined),
      ignored: carryMarks(d.ignored as Marks, combined),
      amounts: Object.fromEntries(
        Object.entries(d.amounts).map(([revision, logs]) => [
          revision,
          carryForward(
            logs,
            (a, b) => {
              const merged = { ...recordOf(a) };
              for (const [period, entry] of Object.entries(recordOf(b))) {
                if (
                  !merged[period] ||
                  String(recordOf(entry).at ?? "") >
                    String(recordOf(merged[period]).at ?? "")
                )
                  merged[period] = entry;
              }
              return merged;
            },
            combined,
          ),
        ]),
      ),
      daily: Object.fromEntries(
        Object.entries(d.daily).map(([revision, logs]) => [
          revision,
          carryDaily(logs as DailyLogMap, combined),
        ]),
      ),
    };
  }
  const archive = { ...state.archive },
    seenEvents = { ...state.seenEvents };
  for (const collection of [archive, seenEvents])
    for (const [key, r] of Object.entries(collection)) {
      const to = combined[r.event.id];
      if (!to) continue;
      const target = pairKey(r.accountId, to);
      const old = collection[target];
      const stamp = (v: typeof r) =>
        "outcomeAt" in v ? String(v.outcomeAt) : String(v.lastSeenAt);
      if (!old || stamp(r) > stamp(old))
        collection[target] = { ...r, event: { ...r.event, id: to } };
      delete collection[key];
    }
  return {
    ...state,
    data,
    archive: archive as ReaderState["archive"],
    seenEvents: seenEvents as ReaderState["seenEvents"],
  };
}
