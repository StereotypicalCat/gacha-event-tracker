import { useEffect, useRef } from "react";
import { serverSuffix } from "../../state/reader/servers.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { formatInZone } from "../../state/displayTime.ts";
import { actionMeta, recordOf } from "../../state/reader/actions.ts";
import type { ArchiveRecord, ReaderState } from "../../state/reader/schema.ts";
import type { ActionHandler } from "./GameSettings.tsx";

/** An archive is a saved snapshot, including its clock and progress, not a live editor. */
export function ArchiveDetail({
  record,
  state,
  onAction,
  onClose,
}: {
  record: ArchiveRecord;
  state: ReaderState;
  onAction: ActionHandler;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const meta = useGameMeta()(record.event.game);
  const account = state.accounts[record.accountId];
  const clock = account?.clocks.find((c) => c.id === record.clockRevision);
  const progress = recordOf(record.progress);
  const zone =
    typeof state.prefs.timezone === "string" ? state.prefs.timezone : null;
  const outcome = {
    done: "Completed",
    ignored: "Ignored",
    unfinished: "Ended unfinished",
  }[record.outcome];
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="archive-detail event-detail-sheet"
      aria-label={record.event.title}
      onCancel={onClose}
    >
      <div className="drawer-head">
        <p className="detail-game" style={{ color: meta.hue }}>
          {meta.name}
          {serverSuffix(
            state,
            record.event.game,
            clock?.region ?? account?.region,
            true,
          )}
        </p>
        <button onClick={onClose} aria-label="Close archived details">
          Close
        </button>
      </div>
      <h2 className="detail-title">{record.event.title}</h2>
      {record.event.summary && <p className="help">{record.event.summary}</p>}
      <dl className="archive-facts">
        <div>
          <dt>Outcome</dt>
          <dd>
            {outcome} · {formatInZone(record.outcomeAt, true, zone)}
          </dd>
        </div>
        <div>
          <dt>End recorded</dt>
          <dd>
            {record.resolvedEnd === null
              ? "Unannounced"
              : formatInZone(
                  new Date(record.resolvedEnd).toISOString(),
                  record.event.endPrecision === "exact",
                  zone,
                )}
          </dd>
        </div>
        <div>
          <dt>Saved progress</dt>
          <dd>
            {record.days.length} check-ins
            {typeof progress.effort === "string" ? ` · ${progress.effort}` : ""}
          </dd>
        </div>
      </dl>
      {typeof progress.note === "string" && progress.note && (
        <section>
          <h3>Your note</h3>
          <p className="archive-note">{progress.note}</p>
        </section>
      )}
      {record.days.length > 0 && (
        <details>
          <summary>Recorded check-ins</summary>
          <p>{record.days.join(" · ")}</p>
        </details>
      )}
      {Object.keys(record.amounts).length > 0 && (
        <details>
          <summary>Recorded amounts</summary>
          <dl>
            {Object.entries(record.amounts).map(([period, raw]) => (
              <div key={period}>
                <dt>{period}</dt>
                <dd>{String(recordOf(raw).value ?? raw)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {record.event.sourceUrl && (
        <p>
          <a
            className="source-link"
            href={record.event.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Original source ↗
          </a>
        </p>
      )}
      <p className="help">
        Saved when this event entered your archive. Restoring keeps its
        progress; an event that has already ended remains in history.
      </p>
      <button
        className="btn"
        onClick={async () => {
          const result = await onAction({
            type: "restore",
            accountId: record.accountId,
            eventId: record.event.id,
            ...actionMeta(),
          });
          if (result.ok) onClose();
        }}
      >
        Restore event
      </button>
    </dialog>
  );
}
