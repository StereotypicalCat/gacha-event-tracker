import { EventFeed, SCHEMA_VERSION } from "../shared/feed.ts";

export type FeedState =
  | { status: "loading" }
  | { status: "ready"; feed: EventFeed }
  | { status: "error"; message: string };

/**
 * Fetch the published feed.
 *
 * A `schemaVersion` we do not recognise is refused rather than rendered — the
 * client would be guessing at unfamiliar fields, and a calendar that guesses is
 * worse than one that asks you to reload.
 */
export async function fetchFeed(
  signal?: AbortSignal,
  options: { fresh?: boolean } = {},
): Promise<EventFeed> {
  // Resolved against <base>, so this is correct at a domain root, under a
  // GitHub Pages subpath, and on a deep link alike.
  const feedUrl = new URL("data/events.v1.json", document.baseURI);
  // `fresh` is the reader asking: revalidate with the server rather than take
  // the browser's copy, which the feed's max-age lets it keep for minutes. The
  // service worker's network-first fetch passes the request's cache mode on.
  const res = await fetch(feedUrl, {
    signal: signal ?? null,
    ...(options.fresh === true ? { cache: "no-cache" as const } : {}),
  });
  if (!res.ok) {
    throw new Error(`Feed request failed (${res.status}).`);
  }

  const json: unknown = await res.json();
  const version = (json as { schemaVersion?: number }).schemaVersion;
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `This page expects feed v${SCHEMA_VERSION} but the server sent v${String(version)}. Reload to get the current app.`,
    );
  }

  const parsed = EventFeed.safeParse(json);
  if (!parsed.success) {
    throw new Error("The feed did not match the expected shape.");
  }
  return parsed.data;
}

export type RefreshOutcome = "updated" | "same" | "failed";

/**
 * What a "check for new data" brought back.
 *
 * Compared on events and source health, never on `generatedAt`: that is when
 * the file was built, and a rebuild of the same data would otherwise be
 * announced as an update that brought nothing (AGENTS.md § the page states its
 * own age, which refuses the build clock for the same reason).
 */
export function refreshOutcome(before: EventFeed, after: EventFeed | Error): RefreshOutcome {
  if (after instanceof Error) return "failed";
  const same =
    JSON.stringify(before.events) === JSON.stringify(after.events) &&
    JSON.stringify(before.sources) === JSON.stringify(after.sources);
  return same ? "same" : "updated";
}
