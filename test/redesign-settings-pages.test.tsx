import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { AboutPage } from "../src/client/components/redesign/AboutPage.tsx";
import {
  DataSourcesPage,
  sourceReason,
} from "../src/client/components/redesign/DataSourcesPage.tsx";
import type { SourceHealth } from "../src/shared/feed.ts";

const now = Date.parse("2026-10-17T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const source = (over: Partial<SourceHealth> = {}): SourceHealth => ({
  sourceId: "genshin-events",
  game: "genshin",
  url: "https://genshin-impact.fandom.com/wiki/Event",
  lastSuccessAt: hoursAgo(2),
  lastConfirmedAt: hoursAgo(2),
  contentChangedAt: hoursAgo(6),
  eventCount: 3,
  parsedCount: null,
  statesNoEvents: false,
  ...over,
});

test("About holds credits and the disclaimer, not data freshness", () => {
  const html = render(<AboutPage sources={[source()]} />);
  for (const part of [
    "Made by",
    "With thanks to the source editors",
    "The studios and games",
    "Ideas and acknowledgements",
    "Unofficial and unaffiliated",
    "Genshin Impact",
  ])
    expect(html).toContain(part);
  expect(html).toContain('class="game-name" style="color:');
  expect(html).not.toContain("See data freshness");
  expect(html).not.toContain("last refreshed");
});

test("Data & sources holds the refresh time and one row per game", () => {
  const html = render(
    <DataSourcesPage
      sources={[
        source(),
        source({ sourceId: "genshin-game8", url: "https://game8.co/x" }),
      ]}
      now={now}
      timezone={null}
      onRefresh={async () => "same"}
    />,
  );
  expect(html).toContain("Event data last refreshed");
  expect(html).toContain("Check for new data");
  expect(html.match(/class="source-row"/g)?.length).toBe(1);
  expect(html).toContain("Last successful check:");
  expect(html).toContain("Check source page");
});

test("each source reads as one of the mockup's four states", () => {
  expect(sourceReason(source(), now).current).toBe(true);
  expect(
    sourceReason(source({ contentChangedAt: hoursAgo(24 * 9) }), now).text,
  ).toContain("Site has no new updates");
  expect(
    sourceReason(
      source({
        lastSuccessAt: hoursAgo(24 * 6),
        lastConfirmedAt: hoursAgo(24 * 6),
      }),
      now,
    ).text,
  ).toContain("Pull overdue");
  expect(
    sourceReason(
      source({
        lastSuccessAt: null,
        lastConfirmedAt: null,
        contentChangedAt: null,
      }),
      now,
    ).text,
  ).toContain("No successful source fetch");
});

test("Data & sources offers the standard-banner pulls choice beside the other list options", () => {
  const html = render(
    <DataSourcesPage
      sources={[source()]}
      now={now}
      timezone={null}
      showUpcoming={false}
      detectDaily={false}
      standardPulls={true}
      onPrefs={() => {}}
    />,
  );
  expect(html).toContain("Offer standard-banner pulls in the library");
  expect(html).toContain("Premium pulls are always offered.");
  expect(html.indexOf("Offer standard-banner pulls")).toBeLessThan(
    html.indexOf('class="source-row"'),
  );
});
