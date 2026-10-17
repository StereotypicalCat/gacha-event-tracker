import type { ReaderState, Account } from "../../state/reader/schema.ts";
import { recordOf, actionMeta } from "../../state/reader/actions.ts";
import {
  clockFromRevision,
  readerDayKey,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import { catchUpDays } from "../../../shared/daily.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { TaskSchema } from "../../../shared/task.ts";
import { formatInZone } from "../../state/displayTime.ts";
import type { ActionHandler } from "./GameSettings.tsx";
export function RoutineHistory({
  account,
  state,
  now,
  onAction,
}: {
  account: Account;
  state: ReaderState;
  now: number;
  onAction: ActionHandler;
}) {
  const data = state.data[account.id]!;
  const current = resolveReaderClock(account, now);
  const revisions = account.clocks
    .slice()
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  return (
    <details className="routine-history">
      <summary>Catch up & recorded history</summary>
      {revisions.map((revision, index) => {
        const clock = clockFromRevision(revision),
          last =
            index === revisions.length - 1
              ? now
              : Math.min(
                  now,
                  Date.parse(revisions[index + 1]!.effectiveAt) - 1,
                ),
          today = readerDayKey(last, clock);
        const items = {
          ...data.daily[revision.id],
          ...data.amounts[revision.id],
        };
        for (const [id, p] of Object.entries(account.routines))
          if (p.followed && revision.id === current.revision) items[id] ??= {};
        return (
          <section key={revision.id}>
            <h3>
              {revision.id === current.revision
                ? "Current reset timing"
                : "Before reset timing changed"}
            </h3>
            <p className="help">
              {revision.region} ·{" "}
              {revision.reset
                ? `${revision.reset.hour}:${String(revision.reset.minute).padStart(2, "0")}`
                : "Automatic"}{" "}
              ·{" "}
              {revision.effectiveAt.startsWith("1970")
                ? "Migrated history"
                : formatInZone(revision.effectiveAt, true, null)}
            </p>
            {Object.keys(items).map((id) => {
              const title = id.startsWith("dailies:")
                ? "Daily check-in"
                : (routinesFor(account.game).find((r) => r.id === id)?.title ??
                  String(
                    recordOf(state.tasks[id]).title ??
                      Object.values(state.seenEvents).find(
                        (s) => s.event.id === id,
                      )?.event.title ??
                      id,
                  ));
              // A routine with its own reset hour keeps its own day labels,
              // as its row does (state/reader/routines.ts).
              const own = TaskSchema.safeParse(state.tasks[id]),
                hour = own.success ? own.data.resetHour : undefined,
                itemClock =
                  hour === undefined
                    ? clock
                    : { ...clock, resetHour: hour, resetMinute: 0 },
                itemToday =
                  hour === undefined ? today : readerDayKey(last, itemClock);
              const raw = recordOf(data.daily[revision.id]?.[id]),
                days = new Set(
                  Array.isArray(raw.days)
                    ? raw.days.filter((d): d is string => typeof d === "string")
                    : [],
                );
              const recent = catchUpDays(
                last,
                revision.region,
                account.game,
                revision.effectiveAt.startsWith("1970")
                  ? null
                  : Date.parse(revision.effectiveAt),
                14,
                itemClock,
              );
              return (
                <div key={id}>
                  <p>{title}</p>
                  {!data.amounts[revision.id]?.[id] && (
                    <div className="history-days">
                      {[...new Set([...recent, ...days])].sort().map((day) => (
                        <button
                          type="button"
                          key={day}
                          disabled={day > itemToday}
                          aria-pressed={days.has(day)}
                          onClick={() =>
                            void onAction({
                              type: "day",
                              accountId: account.id,
                              revisionId: revision.id,
                              itemId: id,
                              day,
                              checked: !days.has(day),
                              ...actionMeta(),
                            })
                          }
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                  {Object.entries(
                    recordOf(data.amounts[revision.id]?.[id]),
                  ).map(([period, entry]) => (
                    <p className="help" key={period}>
                      {period}:{" "}
                      {String(recordOf(entry).value ?? "unreadable amount")}
                    </p>
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </details>
  );
}
