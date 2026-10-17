import { useState } from "react";
import { freshness, type SourceHealth } from "../../../shared/feed.ts";
import { formatInZone } from "../../state/displayTime.ts";
import type { RefreshOutcome } from "../../api.ts";
export function FeedFooter({
  sources,
  now,
  online,
  timezone,
  onRefresh,
  onAbout,
}: {
  sources: SourceHealth[];
  now: number;
  online: boolean;
  timezone: string | null;
  onRefresh: () => Promise<RefreshOutcome>;
  onAbout: () => void;
}) {
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const at = freshness(sources, now).refreshedAt;
  return (
    <footer className="feed-footer">
      <p>
        Event data last refreshed{" "}
        {at ? formatInZone(at, true, timezone) : "at an unrecorded time"}. Dates
        are shown in {timezone ?? "your device's timezone"}.
      </p>
      <button
        type="button"
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
      <button type="button" onClick={onAbout}>
        About Event Clock
      </button>
      <span role="status">{status}</span>
      {!online && (
        <p>
          You're offline. This is the last downloaded event data; changes since
          then may be missing.
        </p>
      )}
    </footer>
  );
}
