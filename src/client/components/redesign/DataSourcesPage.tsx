import { useState, type CSSProperties } from "react";
import type { SourceHealth } from "../../../shared/feed.ts";
import { freshness, STALE_AFTER_MS } from "../../../shared/feed.ts";
import { formatRemaining } from "../../../shared/time.ts";
import { formatInZone } from "../../state/displayTime.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import type { RefreshOutcome } from "../../api.ts";
import { siteFor } from "../Colophon.tsx";

/** The Round 6 B “Data & sources” pane: when data was refreshed, and each source's state. */
export function DataSourcesPage({
  sources,
  now,
  timezone,
  online = true,
  onRefresh,
  showUpcoming,
  detectDaily,
  standardPulls,
  onPrefs,
}: {
  /** The sources of the games the reader tracks. */
  sources: SourceHealth[];
  now: number;
  timezone: string | null;
  online?: boolean;
  onRefresh?: () => Promise<RefreshOutcome>;
  /** What the event lists include from this data (formerly Settings → Lists). */
  showUpcoming?: boolean;
  detectDaily?: boolean;
  standardPulls?: boolean;
  onPrefs?: (patch: Record<string, unknown>) => void;
}) {
  const meta = useGameMeta();
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const when = (at: string | null, never: string) =>
    at
      ? `${formatInZone(at, true, timezone)} · ${formatRemaining(now - Date.parse(at))} ago`
      : never;
  const { refreshedAt, stale } = freshness(sources, now);
  const games = [...new Set(sources.map((s) => s.game))];
  const listNames = (names: string[]) =>
    names.length < 2
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const staleNames = stale.map((s) => meta(s.game).name);
  return (
    <section className="sources-page">
      <h1>Data & sources</h1>
      {onPrefs && (
        <section className="settings-group list-options">
          <h2>In your lists</h2>
          <label className="chk">
            <input
              type="checkbox"
              checked={showUpcoming === true}
              onChange={(e) => onPrefs({ showUpcoming: e.target.checked })}
            />
            <span>
              Show events that haven't started
              <small>
                Include upcoming events in the Checklist and on the Timeline.
              </small>
            </span>
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={detectDaily === true}
              onChange={(e) => onPrefs({ detectDaily: e.target.checked })}
            />
            <span>
              Detect daily events from source descriptions
              <small>
                Treat events whose source says they run daily as daily
                check-ins.
              </small>
            </span>
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={standardPulls === true}
              onChange={(e) => onPrefs({ standardPulls: e.target.checked })}
            />
            <span>
              Offer standard-banner pulls in the library
              <small>Premium pulls are always offered.</small>
            </span>
          </label>
        </section>
      )}
      <h2 className="sources-heading">Sources</h2>
      <p className="muted-copy">
        The source check and its last content update are separate. A recently
        checked page may still hold an older schedule. Dates are shown in{" "}
        {timezone ?? "your device's timezone"}; the source page is the
        authority, so check it before an event's final hours.
      </p>
      {onRefresh && (
        <div className="acts">
          <button
            type="button"
            className="btn"
            disabled={!online || checking}
            onClick={async () => {
              setChecking(true);
              const result = await onRefresh();
              setStatus(
                result === "partial"
                  ? "Event data checked; redeem codes could not be checked. Try again later."
                  : result === "updated"
                    ? "Published data updated."
                    : result === "same"
                      ? "Nothing newer has been published yet."
                      : "The server could not be reached. Your saved data is still available.",
              );
              setChecking(false);
            }}
          >
            {checking ? "Checking…" : "Check for new data"}
          </button>
          <span role="status" className="help">
            {!online
              ? "You're offline. This is the last downloaded event data."
              : status}
          </span>
        </div>
      )}
      <p className="source-note">
        Event data last refreshed{" "}
        {refreshedAt ? when(refreshedAt, "") : "at an unrecorded time"}. These
        rows cover the games you have switched on.
      </p>
      {staleNames.length > 0 && (
        <p className="source-warning">
          {listNames(staleNames)}{" "}
          {staleNames.length === 1 ? "has a source" : "each have a source"} that
          has not refreshed in over two days, so end dates there may have moved.
        </p>
      )}
      {games.map((game) => (
        <div
          className="source-row"
          key={game}
          style={{ "--g": meta(game).hue } as CSSProperties}
        >
          <strong>{meta(game).name}</strong>
          <div>
            {sources
              .filter((s) => s.game === game)
              .map((s) => {
                const checked =
                  [s.lastConfirmedAt, s.lastSuccessAt]
                    .filter((d): d is string => d !== null)
                    .sort()
                    .at(-1) ?? null;
                const reason = sourceReason(s, now);
                return (
                  <div className="source-entry" key={s.sourceId}>
                    {sources.filter((x) => x.game === game).length > 1 && (
                      <p className="source-name">{siteFor(s.url).name}</p>
                    )}
                    <p>Last successful check: {when(checked, "Never")}</p>
                    <p>
                      Source content last changed:{" "}
                      {when(
                        s.contentChangedAt ?? s.lastSuccessAt,
                        "Not recorded",
                      )}
                    </p>
                    <p className={`reason${reason.current ? " current" : ""}`}>
                      {reason.text}
                    </p>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      Check source page
                    </a>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

/** One sentence on a source's state, in the mockup's four cases. */
export function sourceReason(
  s: SourceHealth,
  now: number,
): { text: string; current: boolean } {
  const recent = (at: string | null) =>
    at !== null && now - Date.parse(at) <= STALE_AFTER_MS;
  if (s.lastSuccessAt === null && s.lastConfirmedAt === null)
    return {
      text: "No successful source fetch has been recorded. A bundled sample schedule is being held.",
      current: false,
    };
  if (recent(s.lastSuccessAt) && recent(s.contentChangedAt ?? s.lastSuccessAt))
    return {
      text: "Source check succeeded; the held schedule is recent.",
      current: true,
    };
  if (recent(s.lastConfirmedAt) || recent(s.lastSuccessAt))
    return {
      text: "Site has no new updates. The latest check succeeded, but the page has not changed.",
      current: false,
    };
  return {
    text: "Pull overdue. No recent successful source check; the cause was not reported.",
    current: false,
  };
}
