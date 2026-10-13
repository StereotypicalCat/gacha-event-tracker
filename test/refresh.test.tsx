import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fetchFeed, refreshOutcome } from "../src/client/api.ts";
import { Colophon } from "../src/client/components/Colophon.tsx";
import type { EventFeed } from "../src/shared/feed.ts";

/**
 * "Check for new data": a reload can be served the browser's cached feed for
 * minutes, so the reader gets a way to ask the server directly — and an honest
 * answer about what came back. It fetches what is *published*; it cannot make
 * the sources be read any sooner.
 */

const feed = (over: Partial<EventFeed> = {}): EventFeed => ({
  schemaVersion: 1,
  generatedAt: "2026-10-13T06:00:00.000Z",
  events: [],
  sources: [],
  ...over,
});

describe("refreshOutcome", () => {
  test("new events or source health mean updated", () => {
    const before = feed();
    const after = feed({
      sources: [{
        sourceId: "s", game: "genshin", url: "https://example.test",
        lastSuccessAt: "2026-10-13T12:00:00.000Z", lastConfirmedAt: null,
        contentChangedAt: null, eventCount: 0, parsedCount: 0, statesNoEvents: false,
      }],
    });
    expect(refreshOutcome(before, after)).toBe("updated");
  });

  test("a rebuild that only moved the build stamp is not new data", () => {
    // generatedAt is when the file was built, not when a source was read
    // (AGENTS.md § the page states its own age); a fresh stamp on the same
    // events would claim an update that brought nothing.
    expect(refreshOutcome(feed(), feed({ generatedAt: "2026-10-13T18:00:00.000Z" }))).toBe("same");
  });

  test("an error is a failure, whatever was on screen", () => {
    expect(refreshOutcome(feed(), new Error("offline"))).toBe("failed");
  });
});

describe("fetchFeed({ fresh })", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  test("revalidates past the browser cache only when asked", async () => {
    const modes: (RequestCache | undefined)[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      modes.push(init?.cache);
      return new Response(JSON.stringify(feed()), { status: 200 });
    }) as typeof fetch;
    (globalThis as { document?: unknown }).document ??= { baseURI: "https://example.test/" };
    await fetchFeed(undefined, { fresh: true });
    await fetchFeed();
    expect(modes).toEqual(["no-cache", undefined]);
  });
});

describe("the footer's check button", () => {
  const NOW = Date.parse("2026-10-13T12:00:00.000Z");

  test("sits with the data's age when the app can refresh", () => {
    const html = renderToStaticMarkup(
      <Colophon sources={[]} now={NOW} onRefresh={async () => "same"} online />,
    );
    expect(html).toContain("Check for new data");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Check for new data/);
  });

  test("is disabled offline, and says why", () => {
    const html = renderToStaticMarkup(
      <Colophon sources={[]} now={NOW} onRefresh={async () => "same"} online={false} />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Check for new data/);
    expect(html).toContain("offline");
  });

  test("is absent where nothing can refresh", () => {
    expect(renderToStaticMarkup(<Colophon sources={[]} now={NOW} />)).not.toContain(
      "Check for new data",
    );
  });
});

describe("the age right after a refresh", () => {
  test("a timestamp a moment ahead of the page's clock reads as 0m, not 'ended'", () => {
    // The page's `now` ticks coarsely; a feed fetched this second can carry a
    // newer instant than it.
    const NOW = Date.parse("2026-10-13T12:00:00.000Z");
    const html = renderToStaticMarkup(
      <Colophon
        sources={[{
          sourceId: "s", game: "genshin", url: "https://example.test",
          lastSuccessAt: "2026-10-13T12:00:20.000Z", lastConfirmedAt: null,
          contentChangedAt: null, eventCount: 0, parsedCount: 0, statesNoEvents: false,
        }]}
        now={NOW}
      />,
    );
    expect(html).not.toContain("ended ago");
  });
});
