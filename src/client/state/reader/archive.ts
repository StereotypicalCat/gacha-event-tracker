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
/**
 * Returns true when an archived event has already ended on its recorded
 * snapshot or the account's active clock. Events with unknown end dates
 * remain open unless explicitly recorded as unfinished.
 */
export function archivedEventEnded(
  record: ArchiveRecord,
  state: ReaderState,
  now: number,
): boolean {
  if (record.outcome === "unfinished") return true;
  if (record.resolvedEnd !== null && record.resolvedEnd <= now) return true;
  const account = state.accounts[record.accountId];
  if (!account) return false;
  const clock = readerClockFor(record.event, account, now);
  return clock.ended && clock.endsMs !== null;
}

/**
 * Returns true when an archived event can be restored back to live Checklist
 * and Timeline views (its account is active and the event has not ended).
 */
export function canRestoreArchivedEvent(
  record: ArchiveRecord,
  state: ReaderState,
  now: number,
): boolean {
  const account = state.accounts[record.accountId];
  if (!account || account.retiredAt) return false;
  return !archivedEventEnded(record, state, now);
}

/**
 * Records or updates an archived event outcome while keeping account progress
 * and ignore records consistent and preserving any existing historical clock
 * and pre-archive progress snapshot.
 */
export function archiveOutcome(
  state: ReaderState,
  accountId: string,
  eventId: string,
  outcome: ArchiveRecord["outcome"],
  at: string,
): ReaderState {
  const key = pairKey(accountId, eventId),
    existing = state.archive[key],
    seen = state.seenEvents[key],
    account = state.accounts[accountId],
    data = state.data[accountId],
    event = existing?.event ?? seen?.event;
  if (!event || !account || !data) return state;
  const currentProgress = recordOf(data.progress[eventId]),
    savedProgress = existing ? recordOf(existing.progress) : currentProgress,
    baseProgress = { ...savedProgress };
  if (baseProgress.status === "done") delete baseProgress.status;
  const progress = { ...data.progress };
  const ignores = { ...data.ignored };
  const hasBaseFields = Object.keys(baseProgress).some((k) => k !== "at");
  if (outcome === "done") {
    progress[eventId] = { ...baseProgress, status: "done", at };
    delete ignores[eventId];
  } else if (outcome === "ignored") {
    ignores[eventId] = { at };
    if (existing || currentProgress.status === "done") {
      if (hasBaseFields) progress[eventId] = { ...baseProgress, at };
      else delete progress[eventId];
    }
  } else {
    delete ignores[eventId];
    if (existing || currentProgress.status === "done") {
      if (hasBaseFields) progress[eventId] = { ...baseProgress, at };
      else delete progress[eventId];
    }
  }
  const record: ArchiveRecord = existing
    ? {
        ...existing,
        outcome,
        outcomeAt: at,
      }
    : (() => {
        const clock = resolveReaderClock(account, Date.parse(at)),
          days = new Set<string>();
        for (const logs of Object.values(data.daily)) {
          const raw = recordOf(logs[eventId]);
          if (Array.isArray(raw.days))
            for (const day of raw.days)
              if (typeof day === "string") days.add(day);
        }
        return {
          accountId,
          event,
          outcome,
          outcomeAt: at,
          resolvedEnd: readerClockFor(event, account, Date.parse(at)).endsMs,
          clockRevision: clock.revision,
          progress: baseProgress,
          days: [...days].sort(),
          amounts: recordOf(data.amounts[clock.revision]?.[eventId]),
          previousIgnore: data.ignored[eventId] ?? null,
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
      })();
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
