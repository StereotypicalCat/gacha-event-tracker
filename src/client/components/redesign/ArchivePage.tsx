import { useState, type CSSProperties } from "react";
import { serverSuffix } from "../../state/reader/servers.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { formatInZone } from "../../state/displayTime.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import type { ReaderState, ArchiveRecord } from "../../state/reader/schema.ts";
import { pairKey } from "../../state/reader/schema.ts";
import { ArchiveStory } from "./ArchiveStory.tsx";
import type { ActionHandler } from "./GameSettings.tsx";
import { DAY } from "../../../shared/time.ts";

export function ArchivePage({
  state,
  onAction,
  now,
  onOpen,
}: {
  state: ReaderState;
  onAction: ActionHandler;
  now: number;
  onOpen: (record: ArchiveRecord) => void;
}) {
  const [game, setGame] = useState<string | null>(null),
    [outcome, setOutcome] = useState("all"),
    [history, setHistory] = useState(false),
    meta = useGameMeta();
  const records = Object.values(state.archive).sort((a, b) =>
    b.outcomeAt.localeCompare(a.outcomeAt),
  );
  const games = [...new Set(records.map((r) => r.event.game))],
    zone =
      typeof state.prefs.timezone === "string" ? state.prefs.timezone : null;
  const shown = records.filter(
    (r) =>
      (!game || r.event.game === game) &&
      (outcome === "all" || outcome === r.outcome),
  );
  const start =
    Math.floor(
      Math.min(now, ...shown.map((r) => Date.parse(r.event.startsAt))) / DAY,
    ) * DAY;
  const end = Math.max(
    start + DAY,
    now,
    ...shown.map((r) => r.resolvedEnd ?? Date.parse(r.outcomeAt)),
  );
  const days = Math.ceil((end - start) / DAY),
    trackWidth = Math.max(800, days * 16);
  const summary = (items: ArchiveRecord[]) =>
    `${items.filter((r) => r.outcome === "done").length} of ${items.filter((r) => r.outcome !== "ignored").length} done · ${items.filter((r) => r.outcome === "unfinished").length} unfinished`;
  const outcomeBar = (items: ArchiveRecord[]) => (
    <span className="archive-outcome-bar" aria-hidden="true">
      {items.map((r) => (
        <i key={pairKey(r.accountId, r.event.id)} className={r.outcome} />
      ))}
    </span>
  );
  const restore = (r: ArchiveRecord) =>
    void onAction({
      type: "restore",
      accountId: r.accountId,
      eventId: r.event.id,
      ...actionMeta(),
    });
  return (
    <section className="archive-page">
      <div className="archive-view">
        <div className="segmented">
          <button aria-pressed={!history} onClick={() => setHistory(false)}>
            By game
          </button>
          <button aria-pressed={history} onClick={() => setHistory(true)}>
            History timeline
          </button>
        </div>
        <p className="help">Recorded history · kept in this browser</p>
      </div>
      <ArchiveStory records={records} now={now} game={game} onGame={setGame} />
      <div className="rt-top">
        <h1>Archive</h1>
        <p className="sum">
          Finished, ignored or ended. Kept in your save and off the Checklist
          and Timeline. Open one to see it as it was.
        </p>
        <div className="segmented">
          {["all", "done", "unfinished", "ignored"].map((o) => (
            <button
              key={o}
              aria-pressed={o === outcome}
              onClick={() => setOutcome(o)}
            >
              {
                {
                  all: "All",
                  done: "Completed",
                  unfinished: "Ended unfinished",
                  ignored: "Ignored",
                }[o]
              }
            </button>
          ))}
        </div>
      </div>
      <div className="archive-body">
        <nav className="archive-sidebar" aria-label="Archive games">
          <button aria-pressed={game === null} onClick={() => setGame(null)}>
            All games<small>{records.length} events</small>
          </button>
          {games.map((g) => (
            <button
              key={g}
              aria-pressed={game === g}
              onClick={() => setGame(g)}
              style={{ "--g": meta(g).hue } as CSSProperties}
            >
              <strong>{meta(g).name}</strong>
              <small>
                {summary(records.filter((r) => r.event.game === g))}
              </small>
              {outcomeBar(records.filter((r) => r.event.game === g))}
            </button>
          ))}
        </nav>
        <div className="archive-main">
          {!shown.length && (
            <p className="empty-state">
              {records.length
                ? "No events match these filters."
                : "No archived events yet. Completed and ignored events will appear here."}
            </p>
          )}
          {history && shown.length > 0 ? (
            <div className="timeline-scroller archive-timeline">
              <div
                className="timeline-board"
                style={
                  {
                    "--track-width": `${trackWidth}px`,
                    "--day-width": `${trackWidth / days}px`,
                  } as CSSProperties
                }
              >
                <div className="time-axis">
                  <strong>Recorded events</strong>
                  <div className="ticks">
                    {Array.from({ length: Math.ceil(days / 7) }, (_, i) => (
                      <span
                        key={i}
                        style={{ left: ((i * 7) / days) * trackWidth }}
                      >
                        {formatInZone(start + i * 7 * DAY, false, zone).replace(
                          / \d{4}$/,
                          "",
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                {shown.map((r) => (
                  <div
                    className="timeline-entry"
                    key={pairKey(r.accountId, r.event.id)}
                    style={{ "--g": meta(r.event.game).hue } as CSSProperties}
                  >
                    <button className="timeline-name" onClick={() => onOpen(r)}>
                      {r.event.title}
                      <small>
                        {meta(r.event.game).short} · {r.outcome}
                      </small>
                    </button>
                    <div className="time-track">
                      <button
                        className={`period-block archive-period ${r.outcome}${r.resolvedEnd === null ? " unknown-end" : ""}`}
                        onClick={() => onOpen(r)}
                        style={{
                          left:
                            ((Date.parse(r.event.startsAt) - start) /
                              (end - start)) *
                            trackWidth,
                          width: Math.max(
                            18,
                            (((r.resolvedEnd ?? Date.parse(r.outcomeAt)) -
                              Date.parse(r.event.startsAt)) /
                              (end - start)) *
                              trackWidth,
                          ),
                        }}
                      >
                        <span>
                          {r.resolvedEnd === null ? "End unknown" : r.outcome}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            games
              .filter((g) => !game || game === g)
              .map((g) => {
                const own = shown.filter((r) => r.event.game === g);
                return (
                  own.length > 0 && (
                    <section
                      className="archive-game"
                      key={g}
                      style={{ "--g": meta(g).hue } as CSSProperties}
                    >
                      <h2>{meta(g).name}</h2>
                      <div className="archive-saved">
                        <div className="archive-saved-heading">
                          <h3>Saved events</h3>
                          <small>{summary(own)}</small>
                          {outcomeBar(own)}
                        </div>
                        {own.map((r) => (
                          <article
                            className="archive-record"
                            key={pairKey(r.accountId, r.event.id)}
                          >
                            <button
                              className="archive-open"
                              onClick={() => onOpen(r)}
                              title={r.event.summary ?? undefined}
                            >
                              <span
                                className={`outcome-symbol ${r.outcome}`}
                                aria-label={r.outcome}
                              >
                                {r.outcome === "done"
                                  ? "✓"
                                  : r.outcome === "ignored"
                                    ? "−"
                                    : "!"}
                              </span>
                              <span className="event-link">
                                {r.event.title}
                                <small>
                                  {serverSuffix(
                                    state,
                                    r.event.game,
                                    state.accounts[r.accountId]?.region,
                                    true,
                                  ).slice(3)}
                                </small>
                              </span>
                              <span className="archive-when">
                                {formatInZone(r.outcomeAt, false, zone)}
                              </span>
                              <span aria-hidden="true">›</span>
                            </button>
                            <button
                              className="archive-restore"
                              onClick={() => restore(r)}
                            >
                              Restore
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  )
                );
              })
          )}
          <p className="help archive-history-note">
            History from before this redesign may be incomplete. Unknown end
            dates stay unknown; earlier progress is preserved.
          </p>
        </div>
      </div>
    </section>
  );
}
