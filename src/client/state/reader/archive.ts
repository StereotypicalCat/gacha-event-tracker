import type { DisplayEvent } from "../../../shared/custom.ts";
import {
  readerClockFor,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import type { ReaderEventRow } from "./eventRows.ts";
import { type ReaderState, type ArchiveRecord, pairKey } from "./schema.ts";
import { recordOf } from "./actions.ts";
export function captureSeen(
  state: ReaderState,
  rows: readonly ReaderEventRow[],
  at: string,
): ReaderState {
  const seen = { ...state.seenEvents };
  for (const row of rows) {
    const key = pairKey(row.accountId, row.event.id),
      old = seen[key];
    seen[key] = {
      accountId: row.accountId,
      event: row.event,
      firstSeenAt: old?.firstSeenAt ?? at,
      lastSeenAt: at,
      clockRevision: row.clockRevision,
    };
  }
  return { ...state, seenEvents: seen };
}
export function archiveOutcome(
  state: ReaderState,
  accountId: string,
  eventId: string,
  outcome: ArchiveRecord["outcome"],
  at: string,
): ReaderState {
  const key = pairKey(accountId, eventId),
    seen = state.seenEvents[key],
    account = state.accounts[accountId],
    data = state.data[accountId];
  if (!seen || !account || !data) return state;
  const clock = resolveReaderClock(account, Date.parse(at)),
    days = new Set<string>();
  for (const logs of Object.values(data.daily)) {
    const raw = recordOf(logs[eventId]);
    if (Array.isArray(raw.days))
      for (const day of raw.days) if (typeof day === "string") days.add(day);
  }
  const before = recordOf(data.progress[eventId]),
    ignored = data.ignored[eventId];
  const progress = { ...data.progress };
  const ignores = { ...data.ignored };
  if (outcome === "done") progress[eventId] = { ...before, status: "done", at };
  if (outcome === "ignored") ignores[eventId] = { at };
  const record: ArchiveRecord = {
    accountId,
    event: seen.event,
    outcome,
    outcomeAt: at,
    resolvedEnd: readerClockFor(seen.event, account, Date.parse(at)).endsMs,
    clockRevision: clock.revision,
    progress: before,
    days: [...days].sort(),
    amounts: recordOf(data.amounts[clock.revision]?.[eventId]),
    previousIgnore: ignored ?? null,
    revisionDays: Object.fromEntries(
      Object.entries(data.daily).map(([id, logs]) => [
        id,
        recordOf(logs[eventId]).days ?? [],
      ]),
    ),
    revisionAmounts: Object.fromEntries(
      Object.entries(data.amounts).map(([id, logs]) => [
        id,
        logs[eventId] ?? {},
      ]),
    ),
  };
  return {
    ...state,
    archive: { ...state.archive, [key]: record },
    data: {
      ...state.data,
      [accountId]: { ...data, progress, ignored: ignores },
    },
  };
}
export function restoreArchive(
  state: ReaderState,
  accountId: string,
  eventId: string,
): ReaderState {
  const key = pairKey(accountId, eventId),
    r = state.archive[key],
    data = state.data[accountId];
  if (!r || !data) return state;
  const archive = { ...state.archive };
  delete archive[key];
  const ignored = { ...data.ignored };
  delete ignored[eventId];
  const latest = recordOf(data.progress[eventId]);
  const restored = {
    ...recordOf(r.progress),
    ...(typeof latest.at === "string" && latest.at > r.outcomeAt ? latest : {}),
  };
  if (restored.status === "done") delete restored.status;
  const progress = { ...data.progress, [eventId]: restored };
  return {
    ...state,
    archive,
    data: { ...state.data, [accountId]: { ...data, ignored, progress } },
  };
}
export function reconcileArchive(
  state: ReaderState,
  _events: readonly DisplayEvent[],
  now: number,
): ReaderState {
  let next = state;
  for (const seen of Object.values(state.seenEvents)) {
    const a = state.accounts[seen.accountId];
    if (!a || a.retiredAt) continue;
    const key = pairKey(a.id, seen.event.id);
    if (next.archive[key]) continue;
    const clock = readerClockFor(seen.event, a, now);
    const data = next.data[a.id]!;
    const p = recordOf(data.progress[seen.event.id]);
    if (
      (clock.ended && clock.endsMs !== null) ||
      p.status === "done" ||
      data.ignored[seen.event.id]
    ) {
      const outcome =
        p.status === "done"
          ? "done"
          : data.ignored[seen.event.id]
            ? "ignored"
            : "unfinished";
      next = archiveOutcome(
        next,
        a.id,
        seen.event.id,
        outcome,
        outcome === "unfinished"
          ? new Date(clock.endsMs ?? now).toISOString()
          : typeof p.at === "string"
            ? p.at
            : new Date(now).toISOString(),
      );
    }
  }
  return next;
}
