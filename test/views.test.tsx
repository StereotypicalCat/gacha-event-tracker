import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextUp } from "../src/client/components/NextUp.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import { clockFor } from "../src/shared/time.ts";
import { GachaEvent, type GameId } from "../src/shared/schema.ts";

/**
 * Static-render checks on the headline panel.
 *
 * Not a substitute for using the thing, but they pin the claims it makes: it
 * leads with the closest deadline, it carries the ones behind it, and it never
 * dresses an unannounced end up as a countdown.
 */

const NOW = Date.parse("2026-08-17T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <GameMetaProvider value={(id) => metaFor(id, {})}>{node}</GameMetaProvider>,
  );
}

function row(title: string, game: GameId, endsInHours: number | null) {
  // Through the schema rather than cast into shape: it is the single source of
  // truth for this type, and it is what would catch a fixture that no longer
  // resembles a real event.
  const event = GachaEvent.parse({
    id: `${game}:${title.toLowerCase().replace(/\W+/g, "-")}:2026-08-10`,
    game,
    title,
    type: "story",
    summary: null,
    startsAt: "2026-08-10T00:00:00.000Z",
    startPrecision: "day",
    endsAt:
      endsInHours === null
        ? null
        : new Date(NOW + endsInHours * HOUR).toISOString(),
    endPrecision: endsInHours === null ? "unknown" : "exact",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: "https://example.invalid/events",
    sourceId: "example-events",
    status: "published",
    confidence: 1,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  });
  return { event, clock: clockFor(event, "europe", NOW) };
}

describe("NextUp", () => {
  const rows = [
    row("Closing Ceremony", "genshin", 6),
    row("Second Wind", "hsr", 30),
    row("Third Rail", "zzz", 100),
  ];

  test("leads with the closest deadline and lists the ones behind it", () => {
    // A reader asked for the next three, and was right that one is too few:
    // finishing the headline event left the panel pointing at nothing.
    const html = render(<NextUp rows={rows} focused={null} onOpen={() => {}} />);
    expect(html).toContain("Closing Ceremony");
    expect(html).toContain("Second Wind");
    expect(html).toContain("Third Rail");
    // The lead keeps the big countdown; the rest are a queue under it.
    expect(html.indexOf("Closing Ceremony")).toBeLessThan(html.indexOf("Then"));
    expect(html.indexOf("Then")).toBeLessThan(html.indexOf("Second Wind"));
  });

  test("one deadline is a headline with nothing behind it", () => {
    const html = render(
      <NextUp rows={rows.slice(0, 1)} focused={null} onOpen={() => {}} />,
    );
    expect(html).toContain("Closing Ceremony");
    expect(html).not.toContain(">Then<");
  });

  test("no deadlines says so rather than rendering an empty panel", () => {
    const html = render(<NextUp rows={[]} focused={null} onOpen={() => {}} />);
    expect(html).toContain("Nothing running");
  });

  test("an unannounced end is never dressed up as a countdown", () => {
    // The rule the whole product rests on, at the largest type size it has.
    const html = render(
      <NextUp rows={[row("Unknown End", "wuwa", null)]} focused={null} onOpen={() => {}} />,
    );
    expect(html).toContain("unknown");
    expect(html).toContain("no end date");
  });
});
