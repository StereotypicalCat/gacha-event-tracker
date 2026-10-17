import { resolveDaily } from "../../../shared/daily.ts";
import { readGoal, goalStatus } from "../../../shared/goal.ts";
import { readerClockFor } from "../../../shared/readerClock.ts";
import { recordOf } from "./actions.ts";
import { isCustomGameId } from "../../../shared/custom.ts";
import { metaFor } from "../../../shared/games.ts";
import { routinesFor, offered } from "../../../shared/routines.ts";
import { type Task, TaskSchema, taskStatus } from "../../../shared/task.ts";
import { readableAmounts } from "../useAmounts.ts";
import {
  resolveReaderClock,
  readerDayKey,
  type ReaderClock,
} from "../../../shared/readerClock.ts";
import { resetHourFor, serverOffsetUtc } from "../../../shared/time.ts";
import type { GoalStatus } from "../../../shared/goal.ts";
import type { Account, ReaderState, RoutinePlacement } from "./schema.ts";
export interface RoutineRow {
  id: string;
  accountId: string;
  game: string;
  title: string;
  cadence: "day" | "week" | "month" | "cycle";
  status: GoalStatus;
  placement: RoutinePlacement;
  clock: ReaderClock;
  days: string[];
  source: string | null;
  task: Task | null;
}
export function placementFor(account: Account, id: string): RoutinePlacement {
  return (
    account.routines[id] ?? {
      followed: false,
      checklist: false,
      timeline: false,
    }
  );
}
export function routineRows(
  state: ReaderState,
  accountId: string,
  now: number,
): RoutineRow[] {
  const account = state.accounts[accountId],
    data = state.data[accountId];
  if (!account || !data) return [];
  const clock = resolveReaderClock(account, now),
    today = readerDayKey(now, clock);
  const daysFor = (id: string): string[] => {
    const raw = data.daily[clock.revision]?.[id] as
      | { days?: unknown }
      | undefined;
    return Array.isArray(raw?.days)
      ? raw.days.filter((d): d is string => typeof d === "string")
      : [];
  };
  const rows: RoutineRow[] = [];
  if (!isCustomGameId(account.game)) {
    const id = `dailies:${account.game}`,
      days = daysFor(id),
      count = days.includes(today) ? 1 : 0;
    rows.push({
      id,
      accountId,
      game: account.game,
      title: metaFor(account.game, {}).dailyTasks,
      cadence: "day",
      status: {
        scope: "event",
        measure: "days",
        periodStart: today,
        required: 1,
        count,
        met: count === 1,
        needed: 1 - count,
        open: 1 - count,
        shortfall: false,
      },
      placement: placementFor(account, id),
      clock,
      days,
      source: null,
      task: null,
    });
  }
  const copied = new Set(
    Object.entries(state.tasks)
      .filter(([id]) => account.routines[id]?.followed)
      .map(([, v]) => (v as { from?: string })?.from),
  );
  const builtins = routinesFor(account.game).filter(
    (r) => !copied.has(r.id) && offered(r, state.prefs.standardPulls === true),
  );
  const custom = Object.values(state.tasks).flatMap((v) => {
    const p = TaskSchema.safeParse(v);
    return p.success && p.data.game === account.game ? [p.data] : [];
  });
  for (const task of [...builtins, ...custom]) {
    const fixed = "clock" in task ? task.clock : undefined;
    const own = "resetHour" in task ? task.resetHour : undefined;
    const timing: ReaderClock = fixed
      ? {
          revision: clock.revision,
          region: fixed,
          offsetUtc: serverOffsetUtc(fixed, account.game),
          resetHour: resetHourFor(fixed, account.game),
          resetMinute: 0,
        }
      : own !== undefined
        ? { ...clock, resetHour: own, resetMinute: 0 }
        : clock;
    const days = daysFor(task.id);
    const amounts = readableAmounts(
      data.amounts[clock.revision]?.[task.id] as
        | Record<string, unknown>
        | undefined,
    );
    rows.push({
      id: task.id,
      accountId,
      game: account.game,
      title: task.title,
      cadence: task.period.unit,
      status: taskStatus({
        task,
        region: account.region,
        now,
        logged: days,
        amounts,
        timing,
      }),
      placement: placementFor(account, task.id),
      clock: timing,
      days,
      source: "source" in task ? task.source : (task.link ?? null),
      task: TaskSchema.safeParse(task).success ? (task as Task) : null,
    });
  }
  for (const seen of Object.values(state.seenEvents).filter(
    (s) => s.accountId === accountId,
  )) {
    const event = seen.event,
      p = recordOf(data.progress[event.id]),
      goal = readGoal(p.goal),
      window = readerClockFor(event, account, now);
    if (
      !window.live ||
      state.archive[JSON.stringify([accountId, event.id])] ||
      p.status === "done" ||
      data.ignored[event.id] ||
      !(
        goal ||
        resolveDaily(
          event,
          typeof p.daily === "boolean" ? p.daily : undefined,
          state.prefs.detectDaily === true,
        )
      )
    )
      continue;
    const days = daysFor(event.id),
      count = days.includes(today) ? 1 : 0;
    const status = goal
      ? goalStatus({
          goal,
          startsMs: window.startsMs,
          endsMs: window.endsMs,
          region: account.region,
          game: account.game,
          now,
          logged: days,
          amounts: readableAmounts(
            data.amounts[clock.revision]?.[event.id] as
              | Record<string, unknown>
              | undefined,
          ),
          timing: clock,
        })
      : {
          scope: "event" as const,
          measure: "days" as const,
          periodStart: today,
          required: 1,
          count,
          met: count === 1,
          needed: 1 - count,
          open: 1 - count,
          shortfall: false,
        };
    rows.push({
      id: event.id,
      accountId,
      game: account.game,
      title: event.title,
      cadence: "day",
      status,
      placement: account.routines[event.id] ?? {
        followed: true,
        checklist: true,
        timeline: false,
      },
      clock,
      days,
      source: event.sourceUrl,
      task: null,
    });
  }
  return rows;
}
