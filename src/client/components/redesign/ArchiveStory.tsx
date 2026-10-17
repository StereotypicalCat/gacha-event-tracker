import { archiveStats } from "../../state/reader/archiveStats.ts";
import type { ArchiveRecord } from "../../state/reader/schema.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import type { CSSProperties } from "react";
export function ArchiveStory({
  records,
  now,
  onGame,
  game,
}: {
  records: ArchiveRecord[];
  now: number;
  onGame?: (game: string | null) => void;
  game?: string | null;
}) {
  const meta = useGameMeta();
  const s = archiveStats(records, now);
  return (
    <section className="archive-story">
      <h2>Your season, in a few numbers</h2>
      <p>
        Your recorded history ·{" "}
        {records.filter((r) => r.outcome === "done").length} completed,{" "}
        {records.filter((r) => r.outcome === "ignored").length} set aside. A
        record of your saved events.
      </p>
      <div className="story-stats">
        <div>
          <strong>
            {s.monthly.rate === null ? "—" : s.monthly.rate + "%"}
          </strong>
          <span>completed this month</span>
          <small>
            {s.overall.rate === null
              ? "No eligible history yet"
              : s.overall.rate + "% overall"}
          </small>
        </div>
        <div>
          <strong>{s.currentRun}</strong>
          <span>completion run</span>
          <small>Best: {s.bestRun}</small>
        </div>
        <div>
          <strong>{s.checkIns}</strong>
          <span>event check-ins</span>
          <small>Summed per event and server</small>
        </div>
        <div>
          <strong>{s.unfinished}</strong>
          <span>ended unfinished</span>
          <small>Ignored events excluded from completion rates</small>
        </div>
      </div>
      {Object.entries(s.games).map(([id, g]) => {
        const total = g.done + g.ignored + g.unfinished;
        return (
          <button
            className="stats-game"
            key={id}
            style={{ "--g": meta(id).hue } as CSSProperties}
            aria-pressed={game === id}
            onClick={() => onGame?.(game === id ? null : id)}
          >
            <span className="name">{meta(id).short}</span>
            <span className="outcome-stack" aria-hidden="true">
              <i
                className="done"
                style={{ width: `${(g.done / total) * 100}%` }}
              />
              <i
                className="unfinished"
                style={{ width: `${(g.unfinished / total) * 100}%` }}
              />
              <i
                className="ignored"
                style={{ width: `${(g.ignored / total) * 100}%` }}
              />
            </span>
            <span className="counts">
              {g.done} done · {g.unfinished} unfinished · {g.ignored} ignored
            </span>
          </button>
        );
      })}
      <p className="help">
        Recorded archive history only. Ignored events are excluded from
        completion rates. Select a game to filter the records below.
      </p>
      {s.shortfalls.map((r) => (
        <p key={r.id}>
          {r.title}: {r.needed} check-ins short of your recorded goal.
        </p>
      ))}
    </section>
  );
}
