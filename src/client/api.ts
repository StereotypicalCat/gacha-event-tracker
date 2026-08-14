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
export async function fetchFeed(signal?: AbortSignal): Promise<EventFeed> {
  const res = await fetch("/data/events.v1.json", { signal: signal ?? null });
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
