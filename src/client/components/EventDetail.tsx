import type { ResetTiming } from "../../shared/time.ts";
import { formatInZone } from "../state/displayTime.ts";
import { useEffect, useState } from "react";
import { useGameMeta } from "../state/gameMeta.tsx";
import {
  isCustomEventId,
  type CustomEvent,
  type CustomGames,
  type LaneId,
} from "../../shared/custom.ts";
import type { EventDraft } from "../state/useCustom.ts";
import { cadenceLabel, EventForm } from "./CustomForms.tsx";
import {
  formatAbsolute as defaultFormatAbsolute,
  formatRemaining,
  REGION_LABEL,
} from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { pressure, pressureReason, type Effort } from "../../shared/effort.ts";
import type { Status } from "../state/useProgress.ts";
import { ProgressControls } from "./ProgressControls.tsx";
import { DailyChecklist } from "./DailyChecklist.tsx";
import { GoalControl } from "./GoalControl.tsx";
import { dailyDays as runDays, dailyOverride, dayKey } from "../../shared/daily.ts";
import { goalStatus, type AmountLog, type Goal } from "../../shared/goal.ts";
import { AmountEditor } from "./AmountEditor.tsx";
import { isoWeekday } from "../../shared/period.ts";
import type { Region } from "../../shared/schema.ts";
import { Meter, URGENCY_COLOR } from "./Meter.tsx";

export function EventDetail({
  row,
  completed,
  ignored,
  status,
  effort,
  note,
  region,
  now,
  daily,
  detectedDaily,
  dailyDays,
  goal,
  hasStoredGoal,
  amounts,
  onSetAmount,
  onDaily,
  onGoal,
  onToggleDay,
  onIgnore,
  onStatus,
  onEffort,
  onNote,
  onClose,
  own,
  timing,
  timezone,
  sourceNotice,
}: {
  sourceNotice?: React.ReactNode;
  timing?: ResetTiming | undefined;
  timezone?: string | null | undefined;
  row: RowEvent;
  completed: boolean;
  ignored: boolean;
  status: Status | undefined;
  effort: Effort | undefined;
  note: string;
  region: Region;
  now: number;
  /** Whether to treat this as repeating, the reader's answer included. */
  daily: boolean;
  /** What the source's wording implies, so an override can fall back to it. */
  detectedDaily: boolean;
  /** Days already ticked off, for events that repeat. */
  dailyDays: string[];
  /** The reader's check-in goal, already read through `readGoal`. */
  goal: Goal | undefined;
  /**
   * Whether anything is stored under the goal at all, readable or not. A goal
   * of a newer shape reads as none, and "not daily" would still remove it, so
   * the warning keys off this rather than off `goal`.
   */
  hasStoredGoal: boolean;
  /** Numbers entered for this event's points goal, by period start. */
  amounts: AmountLog;
  onSetAmount: (id: string, periodStart: string, value: number) => void;
  onDaily: (id: string, daily: boolean | undefined, clearsGoal?: boolean) => void;
  onGoal: (id: string, goal: Goal | undefined) => void;
  onToggleDay: (id: string, day: string) => void;
  onIgnore: (id: string) => void;
  onStatus: (id: string, s: Status | undefined) => void;
  onEffort: (id: string, e: Effort | undefined) => void;
  onNote: (id: string, n: string) => void;
  onClose: () => void;
  /**
   * Present only when this is an event the reader entered themselves, in which
   * case they can change it or take it back — this sheet is where anyone would
   * look for that, rather than a list in settings.
   */
  own?:
    | {
        record: CustomEvent;
        lanes: LaneId[];
        games: CustomGames;
        onSave: (id: string, draft: EventDraft) => void;
        onDelete: (id: string) => void;
        strandedBy: (draft: EventDraft) => number;
      }
    | undefined;
}) {
  const formatAbsolute = (instant: string | number, withTime: boolean) => timezone === undefined ? defaultFormatAbsolute(instant, withTime) : formatInZone(instant, withTime, timezone);
  const gameMeta = useGameMeta();
  const [editing, setEditing] = useState(false);
  const { event, clock } = row;
  // The run's claimable days caps an event-wide goal; null when the end is
  // unannounced, and then nothing is invented to cap it with.
  const run = runDays(clock.startsMs, clock.endsMs, region, event.game, timing);
  const goalState =
    goal === undefined
      ? undefined
      : goalStatus({
          goal,
          startsMs: clock.startsMs,
          endsMs: clock.endsMs,
          region,
          game: event.game,
          now,
          logged: dailyDays,
          ...(timing === undefined ? {} : { timing }),
          amounts,
        });
  const game = gameMeta(event.game);
  const heat = URGENCY_COLOR[clock.urgency];
  const risk = status === "done" ? "fine" : pressure(effort, clock.msRemaining);
  // Read once rather than at both the guard and the render: calling it twice
  // was what forced the non-null assertion below it.
  const cadence = cadenceLabel(own?.record.repeat ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="event-detail-overlay fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="event-detail-sheet"
      >
        <p className="detail-game" style={{ color: game.hue }}>
          {game.name}
        </p>
        <h2 className="detail-title">
          {event.title}
        </h2>
        {sourceNotice}
        {/* Stated plainly, next to the title rather than buried at the bottom:
            a reader has to be able to tell which dates the app went and found
            and which ones they typed in themselves. */}
        {isCustomEventId(event.id) && (
          <p className="mt-1 text-xs text-faint">
            You added this. The dates are yours, not a source's.
          </p>
        )}
        {event.summary !== null && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{event.summary}</p>
        )}

        <div className="mt-4">
          <Meter
            progress={clock.progress}
            urgency={clock.urgency}
            label="Time remaining"
            animate={false}
          />
        </div>

        <dl className="detail-facts">
          {/* Off the clock, not off the event: a day-precision boundary is
              resolved to the game's reset there, and printing the stored
              00:00Z instead would name a different day to the countdown. */}
          <Field label="Starts">
            {formatAbsolute(clock.startsMs, event.startPrecision === "exact")}
          </Field>
          <Field label="Ends">
            {clock.endsMs === null ? (
              <span className="text-faint">Not announced</span>
            ) : (
              formatAbsolute(clock.endsMs, event.endPrecision === "exact")
            )}
          </Field>
          <Field label="Remaining">
            <span className="tnum font-display" style={{ color: heat }}>
              {clock.msRemaining === null
                ? "unknown"
                : formatRemaining(clock.msRemaining)}
            </span>
          </Field>
          <Field label="Type">{event.type}</Field>
        </dl>

        {cadence !== null && (
          <p className="mt-2 text-xs text-faint">{cadence}</p>
        )}

        {risk !== "fine" && effort !== undefined && clock.msRemaining !== null && (
          <p
            className="mt-4 rounded-lg border px-3 py-2 text-xs leading-relaxed"
            style={{
              borderColor:
                risk === "unlikely"
                  ? "color-mix(in srgb, var(--color-critical) 40%, transparent)"
                  : "color-mix(in srgb, var(--color-soon) 40%, transparent)",
              color:
                risk === "unlikely" ? "var(--color-critical)" : "var(--color-soon)",
            }}
          >
            {pressureReason(effort, clock.msRemaining)} It is a rough guide, not a
            verdict — you know your own schedule.
          </p>
        )}

        {/* A repeating event gets the checklist instead of nothing but a
            "mark done" — its work is spread over every day of the run, and one
            tick cannot express that.

            Detection reads the source's wording and is wrong in both
            directions, so the reader can say. The control sits where the
            checklist goes, which is the one place the answer visibly matters. */}
        {daily ? (
          <>
            <DailyChecklist
              timing={timing}
              startsMs={clock.startsMs}
              endsMs={clock.endsMs}
              region={region}
              game={event.game}
              now={now}
              logged={dailyDays}
              onToggleDay={(day) => onToggleDay(event.id, day)}
              goal={goalState}
            />
            <GoalControl
              goal={goal}
              defaultWeekStartsOn={isoWeekday(dayKey(clock.startsMs, region, event.game, timing))}
              maxDays={run === null ? null : run.length}
              onChange={(g) => onGoal(event.id, g)}
            />
            {/* Always open here: the sheet has the room, and a number is the
                one thing about this goal the reader comes back to change. */}
            {goalState?.measure === "amount" && (
              <AmountEditor
                key={goalState.periodStart}
                label={goalState.scope === "event" ? "So far:" : "This week:"}
                value={amounts[goalState.periodStart]?.value}
                target={goalState.required}
                onSave={(value) => onSetAmount(event.id, goalState.periodStart, value)}
              />
            )}
            {/* Reaching the count may not have claimed the rewards, so the
                event is never finished on the reader's behalf — this is the
                way to say it is, offered at the moment it could be true. */}
            {goalState?.scope === "event" && goalState.met && status !== "done" && (
              <button
                type="button"
                onClick={() => onStatus(event.id, "done")}
                className="mt-2 rounded-full border border-near/70 bg-near/15 px-3 py-1.5 text-xs font-medium text-near"
              >
                Mark event done
              </button>
            )}
            <button
              type="button"
              onClick={() => onDaily(event.id, dailyOverride(false, detectedDaily), true)}
              className="mt-2 block text-xs text-faint transition-colors hover:text-muted"
            >
              {!hasStoredGoal
                ? "This isn't a daily event"
                : "This isn't a daily event — removes the goal"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onDaily(event.id, dailyOverride(true, detectedDaily))}
            className="mt-5 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-hairline px-4 py-3 text-left transition-colors hover:border-faint"
          >
            {/* Drawn rather than typed: the fullwidth plus this used to be is
                missing from both faces, so it fell back to whatever the device
                had — and on some, that was an empty box. */}
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0 text-faint">
              <path
                d="M8 3v10M3 8h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>
              <span className="block text-sm font-medium">
                It repeats daily
              </span>
              <span className="block text-xs leading-relaxed text-faint">
                Track it day by day, and tick today off as you go.
              </span>
            </span>
          </button>
        )}

        <ProgressControls
          status={status}
          effort={effort}
          note={note}
          onStatus={(s) => onStatus(event.id, s)}
          onEffort={(e) => onEffort(event.id, e)}
          onNote={(n) => onNote(event.id, n)}
        />

        {own !== undefined && (
          <div className="mt-4 border-t border-hairline pt-4">
            {editing ? (
              <EventForm
                lanes={own.lanes}
                customGames={own.games}
                initial={own.record}
                onSave={(draft) => {
                  own.onSave(event.id, draft);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
                strandedBy={own.strandedBy}
              />
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
                >
                  Edit this event
                </button>
                <button
                  type="button"
                  onClick={() => {
                    own.onDelete(event.id);
                    onClose();
                  }}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-critical"
                >
                  Delete
                </button>
              </div>
            )}
            {/* Their marks and logged days are not swept up with it: reaching
                into three other stores on one tap is how a misclick costs
                somebody a streak. */}
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Deleting removes the event. Anything you ticked off stays.
            </p>
          </div>
        )}

        {/* Gated on the same condition `boundaryMs` uses to apply the reset
            shift, so the copy never claims a countdown the clock is not
            actually running. A reader's own event is day-precision exactly as
            often as a parsed one, but `extractionMethod` is "manual" — there
            is no source to have "given" a date, and `readerInstant` already
            resolved it to the instant they meant rather than a placeholder
            `boundaryMs` has to reinterpret. */}
        {event.endPrecision === "day" &&
          event.endsAt !== null &&
          event.extractionMethod === "parser" && (
          <p className="mt-3 text-xs leading-relaxed text-faint">
            The source gave a date but no time of day, so this counts down to
            that day's {REGION_LABEL[region]} server reset — where these usually land, but a
            reading rather than a stated time. Check in-game before the last
            hours.
          </p>
        )}

        {/* Says what it does and does what it says.

            It used to advance one step round the untouched → doing → done
            cycle, so a reader pressing a button labelled "Mark done" on a fresh
            event got "doing it" and had to press it again — and the second
            press from "done" silently wiped the status rather than undoing
            anything. Three states need three targets, which is what the control
            above is; this one is the commit, so it goes straight to done and
            back. */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStatus(event.id, completed ? undefined : "done")}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              completed
                ? "border-hairline text-muted hover:text-ink"
                : "border-transparent bg-ink text-ground hover:bg-ink-strong"
            }`}
          >
            {completed ? "Mark not done" : "Mark done"}
          </button>
          {/* Nothing to link to when the reader typed this themselves, and a
              dead "Source" button would imply somebody else vouched for the
              date. Provenance is stated above instead. */}
          {event.sourceUrl !== null && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border border-hairline px-4 py-2.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Source
            </a>
          )}
        </div>

        {/* Ignoring is not completing. "Done" keeps an event visible and
            counted; "not interested" removes it from both views entirely. */}
        <button
          type="button"
          onClick={() => {
            onIgnore(event.id);
            if (!ignored) onClose();
          }}
          className="mt-3 w-full rounded-lg px-4 py-2 text-xs text-faint transition-colors hover:text-muted"
        >
          {ignored
            ? "Stop ignoring this event"
            : "Not interested — hide this event"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
