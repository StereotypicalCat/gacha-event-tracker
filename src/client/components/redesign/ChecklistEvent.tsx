import { useContext, type CSSProperties } from "react";
import type { ReaderEventRow } from "../../state/reader/eventRows.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { DisplayTimeContext, formatInZone } from "../../state/displayTime.ts";
import { formatRemaining } from "../../../shared/time.ts";
import { Meter, URGENCY_COLOR } from "../Meter.tsx";
import { STEPS } from "../Legend.tsx";
import { isCustomEventId } from "../../../shared/custom.ts";

/** Compact's column headings: the Round 6 B ledger (`table.led`) as a grid over list rows. */
/** The compact ledger's column labels; events not started yet count down to their start. */
export function LedgerColumns({ upcoming = false }: { upcoming?: boolean }) {
  return (
    <div className="ledger-columns" aria-hidden="true">
      <span>Game</span>
      <span>Event</span>
      <span className="h-meter">{upcoming ? "Duration" : "Time left"}</span>
      <span>{upcoming ? "Starts in" : "Ends in"}</span>
    </div>
  );
}
/**
 * Live's legend, said once under "Running now": what the bars and their
 * colours mean. Colours come from the same `URGENCY_COLOR`, so they follow
 * the reader's urgency colours.
 */
export function UrgencyLegend() {
  return (
    <div className="urgency-legend">
      <p>
        <span className="bars" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} data-on={i < 5 || undefined} />
          ))}
        </span>
        bars = time left
      </p>
      <p>
        <span>colour = ends in</span>
        {STEPS.map((step) => (
          <span key={step.urgency} className="step">
            <i
              aria-hidden="true"
              style={{ background: URGENCY_COLOR[step.urgency] }}
            />
            {step.label}
          </span>
        ))}
      </p>
    </div>
  );
}
/**
 * How long a completed or ignored row holds, greyed with its "Moved to Archive"
 * notice, before it fades (2026-10-20, owner: 1.5 s read as unresponsive), and
 * when it is gone once the 250 ms collapse has run.
 */
export const ARCHIVE_HOLD_MS = 900,
  ARCHIVE_COLLAPSE_MS = ARCHIVE_HOLD_MS + 250;
/**
 * The marks on a checklist row on its way to the Archive. While it holds, its
 * text greys; a completed one also gets the codes' shine, an ignored one does
 * not. Then it fades and collapses.
 */
export function leavingMarks(
  transition: { key: string; label: string; phase: string } | null,
  key: string,
  shine = true,
) {
  const leaving = transition?.key === key ? transition : null;
  return {
    className: leaving?.phase === "fade" ? "archive-fading" : "",
    "data-leaving": (leaving && leaving.phase !== "hidden") || undefined,
    "data-shine":
      (shine && leaving?.phase === "hold" && leaving.label === "Completed") ||
      undefined,
  };
}
export function ChecklistEvent({
  row,
  now,
  doing,
  onOpen,
  server = false,
  compact = false,
}: {
  row: ReaderEventRow;
  now: number;
  doing?: boolean;
  server?: boolean;
  compact?: boolean;
  onOpen: () => void;
}) {
  const meta = useGameMeta()(row.event.game),
    zone = useContext(DisplayTimeContext);
  const { event, clock } = row;
  const remaining = clock.upcoming
    ? `In ${formatRemaining(clock.startsMs - now)}`
    : clock.msRemaining === null
      ? "Unknown"
      : formatRemaining(clock.msRemaining);
  const date = clock.upcoming ? clock.startsMs : clock.endsMs;
  const meter = (
    <Meter
      progress={clock.progress}
      urgency={clock.urgency}
      animate={false}
      label={
        clock.msRemaining === null ? "End date unknown" : `${remaining} left`
      }
    />
  );
  const unknown = clock.msRemaining === null && !clock.upcoming;
  if (compact)
    return (
      <button
        type="button"
        className="ledger-row"
        style={{ "--g": meta.hue } as CSSProperties}
        onClick={onOpen}
      >
        <span className="gcell">
          <span>
            {meta.short}
            {server && <small>{row.region}</small>}
          </span>
        </span>
        <span className="tcell">
          <span className="gsm">{meta.short}</span>
          {event.title}
          {doing && <span className="tag">Doing it</span>}
          {isCustomEventId(event.id) && <span className="tag own">Yours</span>}
        </span>
        <span className="mcell">{meter}</span>
        <span
          className="cd"
          style={{
            color: unknown
              ? "var(--color-faint)"
              : URGENCY_COLOR[clock.urgency],
          }}
        >
          {unknown ? "End unknown" : remaining}
        </span>
      </button>
    );
  return (
    <button
      type="button"
      className={`event-entry${event.summary ? "" : " no-description"}`}
      style={{ "--g": meta.hue } as CSSProperties}
      onClick={onOpen}
    >
      <span className="event-copy">
        <span className="identity">
          {meta.name}
          {server && ` · ${row.region}`}
          {doing && " · Doing it"}
          {isCustomEventId(event.id) && " · Yours"}
        </span>
        <span className="event-title">{event.title}</span>
        {event.summary && (
          <span className="event-description">{event.summary}</span>
        )}
      </span>
      <span
        className="deadline"
        style={{ color: URGENCY_COLOR[clock.urgency] }}
      >
        {remaining}
        <small>
          {date === null
            ? "End not announced"
            : `${clock.upcoming ? "Starts" : "Ends"} ${formatInZone(new Date(date).toISOString(), false, zone).replace(/ \d{4}$/, "")}`}
        </small>
        {/* Every row shows its time left. The mockup hid it on rows without a
            description; the owner chose consistency over the tighter row. */}
        {meter}
      </span>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="m6 4 4 4-4 4" />
      </svg>
    </button>
  );
}
export function NextDeadline({
  row,
  then = [],
  servers = () => false,
  onOpen,
}: {
  row: ReaderEventRow | undefined;
  /** The next few after `row`, as in the Round 6 rail's `.then` list. */
  then?: readonly ReaderEventRow[];
  /** Whether a game is on several servers, so its server is named. */
  servers?: (game: string) => boolean;
  onOpen: (row: ReaderEventRow) => void;
}) {
  const meta = useGameMeta(),
    zone = useContext(DisplayTimeContext);
  if (!row)
    return (
      <section className="head">
        <p className="legend">Next to expire</p>
        <h2>All caught up</h2>
        <p className="help">No outstanding deadlines in this view.</p>
      </section>
    );
  const { event, clock } = row;
  return (
    <section className="head">
      <p className="legend">Next to expire</p>
      <button className="headline-event" onClick={() => onOpen(row)}>
        <h2>{event.title}</h2>
        <span className="game" style={{ color: meta(event.game).hue }}>
          {meta(event.game).name}
          {servers(event.game) && ` · ${row.region}`}
        </span>
      </button>
      <div className="big" style={{ color: URGENCY_COLOR[clock.urgency] }}>
        {clock.msRemaining === null
          ? "Unknown"
          : formatRemaining(clock.msRemaining)}
        {clock.msRemaining !== null && <small>left</small>}
      </div>
      <p className="exact">
        {clock.endsMs === null
          ? "End not announced"
          : `Ends ${formatInZone(new Date(clock.endsMs).toISOString(), true, zone)}`}
      </p>
      <Meter
        progress={clock.progress}
        urgency={clock.urgency}
        animate={false}
        label="Time remaining in this event"
      />
      {then.length > 0 && (
        <ul className="then" aria-label="Then">
          {then.map((r) => (
            <li
              key={`${r.accountId} ${r.event.id}`}
              style={{ "--g": meta(r.event.game).hue } as CSSProperties}
            >
              <button type="button" onClick={() => onOpen(r)}>
                <span className="dot" aria-hidden="true" />
                <span className="t">{r.event.title}</span>
                <span
                  className="r"
                  style={{
                    color:
                      r.clock.msRemaining === null
                        ? "var(--color-faint)"
                        : URGENCY_COLOR[r.clock.urgency],
                  }}
                >
                  {r.clock.msRemaining === null
                    ? "no end"
                    : formatRemaining(r.clock.msRemaining)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
