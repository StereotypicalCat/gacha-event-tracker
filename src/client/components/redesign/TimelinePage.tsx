import { manyServers, serverSuffix } from "../../state/reader/servers.ts";
import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { occurrencesInFor, validRecords } from "../../state/useCustom.ts";
import { CustomEvent } from "../../../shared/custom.ts";
import {
  readerClockFor,
  readerDayKey,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import { RoutineControl } from "./DailyPanel.tsx";
import { routineRows, type RoutineRow } from "../../state/reader/routines.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { DAY, formatRemaining, resetShiftMs } from "../../../shared/time.ts";
import { periodOf } from "../../../shared/period.ts";
import { versionCaption, versionWindow } from "../../../shared/versions.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { canStep, snapDayWidth, stepDayWidth } from "../../state/zoom.ts";
import { orderGames } from "../../state/gameOrder.ts";
import { DisplayTimeContext, formatInZone } from "../../state/displayTime.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import type { ReaderEventRow } from "../../state/reader/eventRows.ts";
import type { ActionHandler } from "./GameSettings.tsx";
import {
  BoardHeader,
  Timeline as ClassicTimeline,
  PillChoice,
  openingLeft,
} from "../Timeline.tsx";

/** `prefs.timelineLook`: the redesign's grid (default) or the paimon.moe-style board. */
export const timelineLook = (prefs: Record<string, unknown>) =>
  prefs.timelineLook === "classic" ? "classic" : "new";
/** Dailies stay on the Checklist; the Timeline draws longer routines only. */
export const onTimeline = (r: RoutineRow) =>
  r.placement.followed && r.placement.timeline && r.cadence !== "day";

/**
 * Periods use each routine's resolved clock, including built-in clock overrides.
 * `estimated`: a version with no recorded end — `end` is then only where the
 * band stops (the estimate, or tomorrow once that has passed), never a reset to
 * count down to (spec 2026-10-22, decision 3). Say `estimatedReset` instead.
 */
export function routinePeriod(
  row: RoutineRow,
  now: number,
): { start: number; end: number; estimated: boolean } {
  const key = readerDayKey(now, row.clock),
    task = row.task ?? routinesFor(row.game).find((r) => r.id === row.id);
  if (task?.period.unit === "version") {
    const w = versionWindow(row.game, now);
    if (w?.end !== undefined) return { start: w.start, end: w.end, estimated: false };
    if (w) return { start: w.start, end: Math.max(w.estimate ?? 0, now + DAY), estimated: true };
  }
  const period = task && task.period.unit !== "version"
    ? periodOf(task.period, key)
    : { start: key, days: [key] };
  const shift = resetShiftMs(row.clock.region, row.game, row.clock);
  const start = Date.parse(period.start + "T00:00:00Z") - shift;
  return { start, end: start + period.days.length * DAY, estimated: false };
}

/** What to print instead of a countdown when `routinePeriod` is estimated. */
export const estimatedReset = (row: RoutineRow, now: number): string => {
  const w = versionWindow(row.game, now);
  return w ? versionCaption(w, now) : "resets with next version";
};
export function TimelinePage({
  state,
  focus = null,
  focusBar = null,
  rows,
  now,
  onAction,
  onOpen,
}: {
  state: ReaderState;
  /** The game in focus, already null when this view hides its focus bar. */
  focus?: string | null;
  /** Drawn under the board's header, in either look. */
  focusBar?: ReactNode;
  rows: ReaderEventRow[];
  now: number;
  onAction: ActionHandler;
  onOpen: (row: ReaderEventRow) => void;
}) {
  const p = state.prefs,
    meta = useGameMeta(),
    zone = useContext(DisplayTimeContext);
  const [routine, setRoutine] = useState<RoutineRow | null>(null),
    scroller = useRef<HTMLDivElement>(null),
    previous = useRef<{ width: number; min: number } | null>(null);
  const dayWidth = snapDayWidth(
    typeof p.timelineDayWidth === "number" ? p.timelineDayWidth : 32,
  );
  const active = Object.values(state.accounts).filter(
    (a) =>
      !a.retiredAt &&
      !(Array.isArray(p.hiddenGames) && p.hiddenGames.includes(a.game)),
  );
  const accounts = active.filter(
    (a) =>
      (!focus || a.game === focus) &&
      (rows.some((r) => r.accountId === a.id) ||
        routineRows(state, a.id, now).some(onTimeline)),
  );
  const min =
    Math.floor(
      Math.max(
        now - 60 * DAY,
        Math.min(now - 7 * DAY, ...rows.map((r) => r.clock.startsMs)) - 7 * DAY,
      ) / DAY,
    ) * DAY;
  const max =
    Math.ceil(
      Math.max(
        now + 35 * DAY,
        ...rows.map((r) => r.clock.endsMs ?? now + 35 * DAY),
      ) / DAY,
    ) * DAY;
  const days = Math.ceil((max - min) / DAY),
    width = days * dayWidth;
  const look = timelineLook(p),
    showEnd = p.timelineLabel === "end",
    day = (ms: number) => formatInZone(ms, false, zone).replace(/ \d{4}$/, "");
  const patch = (value: Record<string, unknown>) =>
    void onAction({ type: "prefs", patch: value, ...actionMeta() });
  const ownSection = p.resetStrips === true;
  const options = (
    <>
      <PillChoice
        label="Bar labels"
        value={showEnd ? "end" : "left"}
        options={[
          { id: "left", label: "Show time left" },
          { id: "end", label: "Show end dates" },
        ]}
        onChange={(timelineLabel) => patch({ timelineLabel })}
      />
      <PillChoice
        label="Routines"
        value={ownSection ? "own" : "together"}
        options={[
          { id: "together", label: "Group routines and events" },
          { id: "own", label: "Show routines in own section" },
        ]}
        onChange={(v) => patch({ resetStrips: v === "own" })}
      />
    </>
  );
  const focusRow = focusBar && <div className="timeline-focus">{focusBar}</div>;
  const liveStarts = rows
    .filter((r) => r.clock.live)
    .map((r) => r.clock.startsMs)
    .sort((a, b) => a - b);
  const openLeft = (viewport: number) =>
    openingLeft(
      ((now - min) / DAY) * dayWidth,
      (((liveStarts[Math.floor(liveStarts.length / 2)] ?? now) - min) / DAY) *
        dayWidth,
      viewport,
    );
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const old = previous.current;
    const label = el.clientWidth < 700 ? 170 : 250;
    if (old && old.width !== dayWidth) {
      const centre = (el.scrollLeft + (el.clientWidth - label) / 2) / old.width;
      el.scrollLeft = centre * dayWidth - (el.clientWidth - label) / 2;
    } else if (!old) el.scrollLeft = openLeft(el.clientWidth - label);
    previous.current = { width: dayWidth, min };
  }, [dayWidth, min, now]);
  const expanded = accounts
    .filter((a) => a.intent.events)
    .flatMap((a) =>
      occurrencesInFor(validRecords(state.customEvents, CustomEvent), min, max)
        .filter(
          (e) =>
            e.game === a.game && !state.archive[JSON.stringify([a.id, e.id])],
        )
        .map((event) => ({
          event,
          accountId: a.id,
          region: a.region,
          clockRevision: resolveReaderClock(a, now).revision,
          clock: readerClockFor(event, a, now),
        })),
    );
  const eventRows = [
    ...new Map(
      [...rows, ...expanded]
        .filter(
          (r) =>
            (!focus || r.event.game === focus) &&
            !r.clock.ended &&
            (p.showUpcoming === true || !r.clock.upcoming),
        )
        .map((r) => [JSON.stringify([r.accountId, r.event.id]), r]),
    ).values(),
  ];
  const order = orderGames(
    [...new Set(accounts.map((a) => a.game))],
    Array.isArray(p.gameOrder) ? (p.gameOrder as string[]) : undefined,
    (g) => meta(g).name,
  );
  const ordered = accounts
    .slice()
    .sort((a, b) =>
      p.timelineGroup === "ending"
        ? Math.min(
            ...eventRows
              .filter((r) => r.accountId === a.id)
              .map((r) => r.clock.endsMs ?? Infinity),
          ) -
          Math.min(
            ...eventRows
              .filter((r) => r.accountId === b.id)
              .map((r) => r.clock.endsMs ?? Infinity),
          )
        : order.indexOf(a.game) - order.indexOf(b.game),
    );
  const pos = (ms: number) => ((ms - min) / DAY) * dayWidth;
  const span = (start: number, end: number) => ({
    left: Math.max(0, pos(start)),
    width: Math.max(4, Math.min(width, pos(end)) - Math.max(0, pos(start))),
  });
  const eventRow = (r: ReaderEventRow) => (
    <div
      className="timeline-entry"
      key={JSON.stringify([r.accountId, r.event.id])}
      style={{ "--g": meta(r.event.game).hue } as CSSProperties}
    >
      <button
        className="timeline-name"
        onClick={() => onOpen(r)}
        aria-label={`View ${r.event.title} details`}
      >
        {r.event.title}
        <small>
          {meta(r.event.game).short}
          {serverSuffix(state, r.event.game, r.region)}
          {r.clock.upcoming ? " · Not started yet" : ""}
        </small>
      </button>
      <div className="time-track">
        <button
          className={`period-block${r.clock.endsMs === null ? " unknown-end" : ""}${r.clock.upcoming ? " future" : ""}`}
          style={span(r.clock.startsMs, r.clock.endsMs ?? max)}
          onClick={() => onOpen(r)}
          title={r.event.title}
        >
          <span>
            {r.clock.msRemaining === null
              ? "End date unknown"
              : showEnd && r.clock.endsMs !== null
                ? `Ends ${day(r.clock.endsMs)}`
                : formatRemaining(r.clock.msRemaining) + " left"}
          </span>
        </button>
      </div>
    </div>
  );
  const routineRow = (r: RoutineRow) => {
    const period = routinePeriod(r, now);
    return (
      <div className="routine-timeline-row" key={r.accountId + r.id}>
        <div
          className="timeline-entry"
          style={{ "--g": meta(r.game).hue } as CSSProperties}
        >
          <button className="timeline-name" onClick={() => setRoutine(r)}>
            {r.title}
            <small>
              {r.cadence} · {r.status.count}/{r.status.required}
            </small>
          </button>
          <div className="time-track">
            <button
              className="period-block routine"
              style={span(period.start, period.end)}
              onClick={() => setRoutine(r)}
            >
              <i
                className="fill"
                style={{
                  width: `${Math.min(100, (r.status.count / r.status.required) * 100)}%`,
                }}
              />
              <span>
                {r.status.count}/{r.status.required} ·{" "}
                {period.estimated
                  ? estimatedReset(r, now)
                  : showEnd
                    ? `resets ${formatInZone(period.end, true, zone)}`
                    : `${formatRemaining(period.end - now)} to reset`}
              </span>
            </button>
            {!period.estimated && (
              <i className="reset-mark" style={{ left: pos(period.end) }} />
            )}
          </div>
        </div>
      </div>
    );
  };
  const routines = accounts
    .flatMap((a) => routineRows(state, a.id, now))
    .filter(onTimeline);
  const items = [
    ...eventRows.map((row) => ({
      kind: "event" as const,
      row,
      accountId: row.accountId,
      end: row.clock.endsMs ?? Infinity,
    })),
    ...routines.map((row) => ({
      kind: "routine" as const,
      row,
      accountId: row.accountId,
      end: routinePeriod(row, now).end,
    })),
  ].sort((a, b) => a.end - b.end);
  const renderItem = (item: (typeof items)[number]) =>
    item.kind === "event" ? eventRow(item.row) : routineRow(item.row);
  if (p.timelineGroup === "ending")
    ordered.sort(
      (a, b) =>
        Math.min(
          ...items.filter((i) => i.accountId === a.id).map((i) => i.end),
        ) -
        Math.min(
          ...items.filter((i) => i.accountId === b.id).map((i) => i.end),
        ),
    );
  const queue = p.timelineGroup === "ending" && p.resetStrips !== true;
  return (
    <section className="reader-timeline">
      <div className="rt-top">
        <h1>Timeline</h1>
        <p className="sum">
          One row per event or routine. Your pins decide which routines appear.
        </p>
      </div>
      {look === "new" && (
        <BoardHeader
          group={p.timelineGroup === "ending" ? "ending" : "game"}
          onGroup={(timelineGroup) => patch({ timelineGroup })}
          controls={options}
          canOut={canStep(dayWidth, -1)}
          canIn={canStep(dayWidth, 1)}
          onZoom={(by) =>
            patch({ timelineDayWidth: stepDayWidth(dayWidth, by) })
          }
          onToday={() => {
            const el = scroller.current;
            if (el)
              el.scrollLeft = openLeft(
                el.clientWidth - (el.clientWidth < 700 ? 170 : 250),
              );
          }}
        />
      )}
      {look === "new" && focusRow}
      {look === "classic" ? (
        <div className="classic-timeline">
          <ClassicTimeline
            rows={eventRows}
            now={now}
            dayWidth={dayWidth}
            onZoom={(timelineDayWidth) => patch({ timelineDayWidth })}
            group={p.timelineGroup === "ending" ? "ending" : "game"}
            onGroup={(timelineGroup) => patch({ timelineGroup })}
            showUpcoming={p.showUpcoming === true}
            splitUpcoming={p.timelineSplitUpcoming !== false}
            gameOrder={order}
            onOpen={() => {}}
            onOpenRow={(row) => onOpen(row as ReaderEventRow)}
            servers={(game) => manyServers(state, game)}
            isDone={() => false}
            controls={options}
            afterHeader={focusRow}
            routinesInline={!ownSection}
            label={(row) =>
              row.clock.msRemaining === null
                ? null
                : showEnd && row.clock.endsMs !== null
                  ? `Ends ${day(row.clock.endsMs)}`
                  : `${formatRemaining(row.clock.msRemaining)} left`
            }
            routines={routines.map((r) => {
              const period = routinePeriod(r, now);
              return {
                key: r.accountId + r.id,
                game: r.game,
                title: r.title,
                detail: `${r.status.count}/${r.status.required}`,
                start: period.start,
                end: period.end,
                done: r.status.met,
                label: period.estimated
                  ? estimatedReset(r, now)
                  : showEnd
                    ? `resets ${day(period.end)}`
                    : `${formatRemaining(period.end - now)} to reset`,
                onOpen: () => setRoutine(r),
              };
            })}
          />
        </div>
      ) : accounts.length === 0 ? (
        <p className="empty-state">
          No tracked events or routines to show here.
        </p>
      ) : (
        <div className="timeline-scroller" ref={scroller}>
          <div
            className="timeline-board"
            style={
              {
                "--track-width": `${width}px`,
                "--day-width": `${dayWidth}px`,
              } as CSSProperties
            }
          >
            <div className="time-axis">
              <strong>Events & routines</strong>
              <div className="ticks">
                {Array.from({ length: days }, (_, i) => i)
                  .filter(
                    (i) => i % Math.max(1, Math.ceil(64 / dayWidth)) === 0,
                  )
                  .map((i) => (
                    <span key={i} style={{ left: i * dayWidth }}>
                      {formatInZone(min + i * DAY, false, zone).replace(
                        / \d{4}$/,
                        "",
                      )}
                    </span>
                  ))}
              </div>
            </div>
            <div
              className="today-line"
              style={{ left: `calc(var(--name-width) + ${pos(now)}px)` }}
            />
            {queue
              ? items.map(renderItem)
              : ordered.map((a) => (
                  <Fragment key={a.id}>
                    <div
                      className="game-separator"
                      style={{ "--g": meta(a.game).hue } as CSSProperties}
                    >
                      <strong>{meta(a.game).name}</strong>
                      <span>
                        {manyServers(state, a.game)
                          ? `${a.region} · Events & routines`
                          : "Events & routines"}
                      </span>
                    </div>
                    {p.resetStrips === true ? (
                      <>
                        {eventRows
                          .filter((r) => r.accountId === a.id)
                          .sort(
                            (a, b) =>
                              (a.clock.endsMs ?? Infinity) -
                              (b.clock.endsMs ?? Infinity),
                          )
                          .map(eventRow)}
                        {routines.some((r) => r.accountId === a.id) && (
                          <section
                            className="reset-strip"
                            aria-label={`${meta(a.game).short} routines`}
                          >
                            <div className="routine-divider">
                              <span>Routines</span>
                            </div>
                            {routines
                              .filter((r) => r.accountId === a.id)
                              .map(routineRow)}
                          </section>
                        )}
                      </>
                    ) : (
                      items.filter((i) => i.accountId === a.id).map(renderItem)
                    )}
                  </Fragment>
                ))}
          </div>
        </div>
      )}
      {look === "new" && (
        <p className="timeline-help">
          Events and routine periods share one time axis. Dashed bars are
          routines; the vertical markers show resets. Open a bar to see details
          or record progress.
        </p>
      )}
      {routine && (
        <RoutineDetail
          row={
            routineRows(state, routine.accountId, now).find(
              (r) => r.id === routine.id,
            ) ?? routine
          }
          server={serverSuffix(state, routine.game, routine.clock.region)}
          now={now}
          onAction={onAction}
          onClose={() => setRoutine(null)}
        />
      )}
    </section>
  );
}

/** A routine opened from either Timeline look: its period and its progress. */
function RoutineDetail({
  row,
  server,
  now,
  onAction,
  onClose,
}: {
  row: RoutineRow;
  /** `" · asia"` when the game has several servers, otherwise empty. */
  server: string;
  now: number;
  onAction: ActionHandler;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    meta = useGameMeta()(row.game),
    zone = useContext(DisplayTimeContext),
    period = routinePeriod(row, now);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="routine-detail event-detail-sheet"
      aria-label={row.title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="drawer-head">
        <p className="detail-game" style={{ color: meta.hue }}>
          {meta.name}
          {server}
        </p>
        <button onClick={onClose} aria-label="Close routine">
          Close
        </button>
      </div>
      <h2 className="detail-title">{row.title}</h2>
      <p className="help">
        {period.estimated ? (
          estimatedReset(row, now).replace(/^r/, "R")
        ) : (
          <>
            Resets {formatInZone(period.end, true, zone)} · in{" "}
            {formatRemaining(period.end - now)}
          </>
        )}
      </p>
      <RoutineControl row={row} onAction={onAction} now={now} />
    </dialog>
  );
}
