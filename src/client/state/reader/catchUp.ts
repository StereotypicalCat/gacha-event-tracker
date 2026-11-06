import { catchUpDays } from "../../../shared/daily.ts";
import { metaFor } from "../../../shared/games.ts";
import { readGoal } from "../../../shared/goal.ts";
import { isTimerPeriod, type RoutinePeriod } from "../../../shared/period.ts";
import {
  clockFromRevision,
  readerClockFor,
  readerDayKey,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { TaskSchema } from "../../../shared/task.ts";
import { formatInZone } from "../displayTime.ts";
import { recordOf } from "./actions.ts";
import { contentEvents } from "./contentRouting.ts";
import { routineRows, type RoutineRow } from "./routines.ts";
import type { Account, ClockRevision, ReaderState } from "./schema.ts";

/**
 * What the Routines page's Catch up section draws for one account (spec
 * 2026-11-06). Pure, so the rules that keep it honest are tested without React:
 * the strip's bounds are PRD F17's, and the count only says what a reader's own
 * ticks can support, because nothing records when they began following.
 */
export interface CatchUpDay {
  key: string;
  ticked: boolean;
  today: boolean;
  disabled: boolean;
}
export interface CatchUpValue {
  period: string;
  label: string;
  text: string;
}
export interface CatchUpItem {
  id: string;
  revisionId: string;
  title: string;
  /** Empty in Older records, where the group's heading says what it is. */
  kind: string;
  /** Null for a number and for a routine with no earlier period to catch up on. */
  days: CatchUpDay[] | null;
  /** Ticks outside the strip: stored, so still reachable (PRD F17). */
  earlier: CatchUpDay[];
  /** Newest first; null when this item is not measured in numbers. */
  values: CatchUpValue[] | null;
  behind: number;
}
export interface CatchUpGroup {
  id: string;
  title: string;
  note: string | null;
  items: CatchUpItem[];
}
export interface AccountCatchUp {
  accountId: string;
  items: CatchUpItem[];
  older: CatchUpGroup[];
  behind: number;
}

const SPAN = 14;
const KIND: Record<RoutineRow["cadence"], string> = {
  day: "Dailies",
  week: "Weeklies",
  month: "Monthlies",
  cycle: "Cycles",
};
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const formatKey = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    ...options,
  });

function periodLabel(key: string, scope: string): string {
  if (!DATE_KEY.test(key)) return key;
  const day = formatKey(key, { day: "numeric", month: "short" });
  if (scope === "week") return `Week of ${day}`;
  if (scope === "month") return formatKey(key, { month: "short", year: "numeric" });
  if (scope === "day") return day;
  return `From ${day}`;
}

const loggedDays = (raw: unknown): string[] => {
  const days = recordOf(raw).days;
  return Array.isArray(days)
    ? days.filter((d): d is string => typeof d === "string")
    : [];
};

/** A task or built-in, whichever owns this id. */
function shapeOf(
  state: ReaderState,
  account: Account,
  id: string,
): {
  period: RoutinePeriod;
  measure: { kind: string; target?: number | undefined; unit?: string | undefined };
} | null {
  const builtin = routinesFor(account.game).find((r) => r.id === id);
  if (builtin) return builtin;
  const task = TaskSchema.safeParse(state.tasks[id]);
  return task.success ? task.data : null;
}

function valuesOf(
  state: ReaderState,
  account: Account,
  id: string,
  raw: unknown,
  scope: string,
): CatchUpValue[] {
  const data = state.data[account.id];
  const measure = shapeOf(state, account, id)?.measure;
  const goal = readGoal(recordOf(data?.progress[id]).goal);
  const target =
    measure?.target ?? (goal?.measure === "amount" ? goal.target : undefined);
  const unit = measure?.unit ? ` ${measure.unit}` : "";
  return Object.entries(recordOf(raw))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, entry]) => {
      const value = recordOf(entry).value;
      return {
        period,
        label: periodLabel(period, scope),
        text:
          typeof value !== "number"
            ? "unreadable amount"
            : target === undefined
              ? `${value}${unit}`
              : `${value} of ${target}${unit}`,
      };
    });
}

/** A raw ID is never shown: it means nothing to a reader. */
export function catchUpTitle(
  state: ReaderState,
  account: Account,
  id: string,
  rows: readonly RoutineRow[],
): string {
  if (id.startsWith("dailies:")) return metaFor(account.game, {}).dailyTasks;
  const row = rows.find((r) => r.id === id || r.placementId === id);
  if (row) return row.title;
  const builtin = routinesFor(account.game).find((r) => r.id === id);
  if (builtin) return builtin.title;
  const task = recordOf(state.tasks[id]).title;
  if (typeof task === "string") return task;
  const event = contentEvents(state).find((e) => e.id === id);
  if (event) return event.title;
  return id.startsWith("feed-cycle:") ? "Battle pass" : "Removed item";
}

function revisionNote(revision: ClockRevision): string {
  const reset = revision.reset
    ? `${revision.reset.hour}:${String(revision.reset.minute).padStart(2, "0")}`
    : "Automatic";
  const when = revision.effectiveAt.startsWith("1970")
    ? "Migrated history"
    : formatInZone(revision.effectiveAt, true, null);
  return `${revision.region} · ${reset} · ${when}`;
}

const isMigrated = (revision: ClockRevision) =>
  revision.effectiveAt.startsWith("1970");

/** The ids a reset timing holds something for: an emptied log is not a record. */
function loggedIds(state: ReaderState, account: Account, revisionId: string) {
  const data = state.data[account.id]!;
  const daily = data.daily[revisionId] ?? {};
  const amounts = data.amounts[revisionId] ?? {};
  return [...new Set([...Object.keys(daily), ...Object.keys(amounts)])].filter(
    (id) =>
      loggedDays(daily[id]).length > 0 ||
      Object.keys(recordOf(amounts[id])).length > 0,
  );
}

/** Names a day the reader unticked this visit, in `catchUpFor`'s `kept`. */
export const keepKey = (
  accountId: string,
  revisionId: string,
  id: string,
  day: string,
) => JSON.stringify([accountId, revisionId, id, day]);

export function catchUpFor(
  state: ReaderState,
  account: Account,
  now: number,
  /**
   * Older days are offered because they are recorded, so unticking one would
   * take its button away and a mis-tap could not be undone. These stay offered,
   * unticked, for the visit.
   */
  kept: ReadonlySet<string> = new Set(),
): AccountCatchUp {
  const data = state.data[account.id];
  if (!data) return { accountId: account.id, items: [], older: [], behind: 0 };
  const keptDays = [...kept].map(
    (k) => JSON.parse(k) as [string, string, string, string],
  ).filter(([accountId]) => accountId === account.id);
  const keptFor = (revisionId: string, id: string) =>
    keptDays
      .filter(([, rev, item]) => rev === revisionId && item === id)
      .map(([, , , day]) => day);
  const heldIds = (revisionId: string) => [
    ...new Set([
      ...loggedIds(state, account, revisionId),
      ...keptDays.filter(([, rev]) => rev === revisionId).map(([, , id]) => id),
    ]),
  ];
  const current = resolveReaderClock(account, now);
  const revision = account.clocks.find((c) => c.id === current.revision);
  const floor =
    !revision || isMigrated(revision) ? null : Date.parse(revision.effectiveAt);
  const rows = routineRows(state, account.id, now);
  const events = contentEvents(state);

  const items = rows
    .filter((row) => row.placement.followed && !row.placementId)
    .map((row): CatchUpItem => {
      const id = row.id,
        shape = shapeOf(state, account, id),
        today = readerDayKey(now, row.clock),
        isEvent =
          row.task === null &&
          !id.startsWith("routine:") &&
          !id.startsWith("dailies:");
      // When it opens on the reader's server, not `startsAt`: a day-precision
      // date opens at that server's reset, which is a game-day after midnight UTC.
      const event = isEvent ? events.find((e) => e.id === id) : undefined;
      const notBefore = Math.max(
        floor ?? -Infinity,
        event ? readerClockFor(event, account, now).startsMs : -Infinity,
      );
      const stripless =
        row.status.measure === "amount" ||
        (shape !== null && isTimerPeriod(shape.period));
      const ticked = new Set(row.days);
      const strip = stripless
        ? []
        : catchUpDays(
            now,
            row.clock.region,
            account.game,
            notBefore === -Infinity ? null : notBefore,
            SPAN,
            row.clock,
          );
      const shown = new Set(strip);
      const first = row.days.length ? [...row.days].sort()[0]! : null;
      const countable =
        row.cadence === "day" &&
        row.status.measure === "days" &&
        readGoal(recordOf(data.progress[id]).goal) === undefined;
      const behind =
        countable && first !== null
          ? strip.filter((k) => k >= first && k < today && !ticked.has(k)).length
          : 0;
      const amounts = data.amounts[current.revision]?.[id];
      return {
        id,
        revisionId: current.revision,
        title: row.title,
        kind: isEvent ? "Event" : KIND[row.cadence],
        days: stripless
          ? null
          : strip.map((key) => ({
              key,
              ticked: ticked.has(key),
              today: key === today,
              disabled: false,
            })),
        earlier: [...new Set([...ticked, ...keptFor(current.revision, id)])]
          .filter((key) => !shown.has(key))
          .sort()
          .map((key) => ({
            key,
            ticked: ticked.has(key),
            today: false,
            disabled: key > today,
          })),
        values:
          stripless || Object.keys(recordOf(amounts)).length
            ? valuesOf(state, account, id, amounts, row.status.scope)
            : null,
        behind,
      };
    });

  const listed = new Set(items.map((i) => i.id));
  const older: CatchUpGroup[] = [];
  const recorded = (id: string, revisionId: string, days: CatchUpDay[]) => {
    const amounts = data.amounts[revisionId]?.[id];
    const unit = shapeOf(state, account, id)?.period;
    return {
      id,
      revisionId,
      title: catchUpTitle(state, account, id, rows),
      kind: "",
      days,
      earlier: [],
      values: Object.keys(recordOf(amounts)).length
        ? valuesOf(state, account, id, amounts, unit?.unit ?? "event")
        : null,
      behind: 0,
    } satisfies CatchUpItem;
  };

  // Recorded days only: offering new ones could claim a day after an event ended.
  const gone = heldIds(current.revision)
    .filter((id) => !listed.has(id))
    .map((id) => {
      const today = readerDayKey(now, current);
      const ticked = new Set(loggedDays(data.daily[current.revision]?.[id]));
      return recorded(
        id,
        current.revision,
        [...new Set([...ticked, ...keptFor(current.revision, id)])].sort().map((key) => ({
          key,
          ticked: ticked.has(key),
          today: false,
          disabled: key > today,
        })),
      );
    });
  if (gone.length)
    older.push({
      id: current.revision,
      title: "Ended or no longer followed",
      note: null,
      items: gone,
    });

  const revisions = account.clocks
    .slice()
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  revisions.forEach((rev, index) => {
    if (rev.id === current.revision) return;
    const next = revisions[index + 1];
    const last = next ? Math.min(now, Date.parse(next.effectiveAt) - 1) : now;
    const clock = clockFromRevision(rev);
    const groupItems = heldIds(rev.id).map((id) => {
      // A routine with its own reset hour keeps its own day labels, as its row does.
      const own = TaskSchema.safeParse(state.tasks[id]);
      const hour = own.success ? own.data.resetHour : undefined;
      const itemClock =
        hour === undefined ? clock : { ...clock, resetHour: hour, resetMinute: 0 };
      const today = readerDayKey(last, itemClock);
      const ticked = new Set(loggedDays(data.daily[rev.id]?.[id]));
      const offered = catchUpDays(
        last,
        rev.region,
        account.game,
        isMigrated(rev) ? null : Date.parse(rev.effectiveAt),
        SPAN,
        itemClock,
      );
      return recorded(
        id,
        rev.id,
        [...new Set([...offered, ...ticked, ...keptFor(rev.id, id)])].sort().map((key) => ({
          key,
          ticked: ticked.has(key),
          today: false,
          disabled: key > today,
        })),
      );
    });
    if (groupItems.length)
      older.push({
        id: rev.id,
        title: "Before reset timing changed",
        note: revisionNote(rev),
        items: groupItems,
      });
  });

  return {
    accountId: account.id,
    items,
    older,
    behind: items.reduce((sum, item) => sum + item.behind, 0),
  };
}

export function defaultCatchUpAccount(
  list: readonly AccountCatchUp[],
): string | null {
  return (list.find((a) => a.behind > 0) ?? list[0])?.accountId ?? null;
}

/** Keeps a live choice even at zero, so a tick never moves the list under the reader. */
export function pickAccount(
  selected: string | null,
  list: readonly AccountCatchUp[],
): string | null {
  return list.some((a) => a.accountId === selected)
    ? selected
    : defaultCatchUpAccount(list);
}
