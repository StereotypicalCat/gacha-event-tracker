import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextUp } from "../src/client/components/NextUp.tsx";
import {
  boardWindow,
  markerLabel,
  startMarkers,
  Timeline,
} from "../src/client/components/Timeline.tsx";
import { Welcome } from "../src/client/components/Welcome.tsx";
import { timelineLanes } from "../src/client/state/lanes.ts";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import { clockFor } from "../src/shared/time.ts";
import { GachaEvent, type GameId } from "../src/shared/schema.ts";

/**
 * Static-render checks on the two surfaces a reader meets first.
 *
 * Not a substitute for using the thing, but they pin the claims each one makes:
 * the headline carries the deadlines behind the closest one, and the first run
 * asks how the reader wants to read the app rather than deciding for them.
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

/**
 * An event whose start is still ahead of `NOW`.
 *
 * Its own helper rather than a flag on `row`, because everything about it is
 * different: the start is what places it, the id is cut from the start's date,
 * and it is the case the board deliberately withholds.
 */
function upcoming(
  title: string,
  game: GameId,
  startsInHours: number,
  runsForHours = 240,
) {
  const startsAt = new Date(NOW + startsInHours * HOUR).toISOString();
  const event = GachaEvent.parse({
    id: `${game}:${title.toLowerCase().replace(/\W+/g, "-")}:${startsAt.slice(0, 10)}`,
    game,
    title,
    type: "banner",
    summary: null,
    startsAt,
    startPrecision: "exact",
    endsAt: new Date(NOW + (startsInHours + runsForHours) * HOUR).toISOString(),
    endPrecision: "exact",
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

describe("Welcome (first run)", () => {
  const html = () =>
    render(<Welcome available={["genshin", "hsr"]} onConfirm={() => {}} />);

  test("asks how the reader wants to see their events", () => {
    expect(html()).toContain("How do you want to see them?");
    expect(html()).toContain("Checklist");
    expect(html()).toContain("Timeline");
  });

  test("says where the choice lives afterwards", () => {
    // The tabs are small text in a corner — the one control a first-time reader
    // will not find on their own, so the screen that sets it says where it is.
    expect(html()).toContain("top right");
  });

  test("opens on the list, with the choice already answered", () => {
    // Games stay unanswered because only the reader knows which ones they play.
    // This one has a defensible default, and a reader cannot choose between two
    // layouts they have not seen yet.
    expect(html()).toContain('aria-checked="true"');
  });
});

describe("Timeline window", () => {
  const DAY = 86_400_000;

  test("reaches a week past the oldest running event", () => {
    // So "when did this start?" is answerable without the reader hunting for
    // an edge, and so a bar that began days ago shows its real start.
    const started = NOW - 20 * DAY;
    const { min } = boardWindow([started], [NOW + 5 * DAY], NOW);
    expect(min).toBe(started - 7 * DAY);
  });

  test("stops two months back however long something has been running", () => {
    // A standing login campaign can have started half a year ago. Drawing from
    // its start bought months of empty calendar that nobody scrolls through and
    // pushed every other bar off to the right.
    const ancient = NOW - 200 * DAY;
    const { min } = boardWindow([ancient, NOW - 3 * DAY], [NOW + 5 * DAY], NOW);
    expect(min).toBe(NOW - 60 * DAY);
    // The bar is then older than the board, which is what the faded left edge
    // says — it must not be redrawn as though it started at the edge.
    expect(ancient).toBeLessThan(min);
  });

  test("today is on the board even when everything is still to come", () => {
    const { min, max } = boardWindow([NOW + 30 * DAY], [NOW + 40 * DAY], NOW);
    expect(min).toBeLessThan(NOW);
    expect(max).toBeGreaterThan(NOW);
  });
});

describe("timelineLanes", () => {
  // Deliberately not in deadline order, and with a game interleaved, so the
  // two modes cannot both pass by accident.
  const rows = [
    row("Closing Ceremony", "genshin", 100),
    row("Second Wind", "hsr", 6),
    row("Third Rail", "genshin", 30),
    row("Open Ended", "zzz", null),
  ];

  test("by game: a lane each, and the order inside one is left alone", () => {
    // The rows arrive sorted by whatever the reader chose in the list.
    // Grouping them is not a licence to re-sort within a game.
    const lanes = timelineLanes(rows, "game");
    expect(lanes.map((l) => l.game)).toEqual(["genshin", "hsr", "zzz"]);
    expect(lanes[0]?.rows.map((r) => r.event.title)).toEqual([
      "Closing Ceremony",
      "Third Rail",
    ]);
  });

  test("ending soonest: every game in one stack, deadline order", () => {
    const lanes = timelineLanes(rows, "ending");
    expect(lanes).toHaveLength(1);
    // No heading to name the game, so the renderer has to say it per bar.
    expect(lanes[0]?.game).toBeNull();
    expect(lanes[0]?.rows.map((r) => r.event.title)).toEqual([
      "Second Wind",
      "Third Rail",
      "Closing Ceremony",
      // An unannounced end is still on the board, behind every dated one — it
      // is real, but it is not a deadline.
      "Open Ended",
    ]);
  });

  test("neither mode loses a row", () => {
    for (const mode of ["game", "ending"] as const) {
      const plotted = timelineLanes(rows, mode).flatMap((l) => l.rows);
      expect(plotted).toHaveLength(rows.length);
    }
  });

  test("an empty board is no lanes, not one empty lane", () => {
    expect(timelineLanes([], "ending")).toEqual([]);
    expect(timelineLanes([], "game")).toEqual([]);
  });
});

describe("Timeline stacking", () => {
  const rows = [
    row("Closing Ceremony", "genshin", 100),
    row("Second Wind", "hsr", 6),
  ];

  const board = (group: "game" | "ending") =>
    render(
      <Timeline
        rows={rows}
        now={NOW}
        dayWidth={13}
        onZoom={() => {}}
        group={group}
        onGroup={() => {}}
        showUpcoming={false}
        onShowUpcoming={() => {}}
        onOpen={() => {}}
        isDone={() => false}
      />,
    );

  test("both stackings plot every event", () => {
    for (const group of ["game", "ending"] as const) {
      const html = board(group);
      expect(html).toContain("Closing Ceremony");
      expect(html).toContain("Second Wind");
    }
  });

  test("the merged board names each bar's game, since no heading does", () => {
    // Colour cannot carry it once every game shares one stack, and a reader
    // who cannot tell whose event is ending tonight has not been told the
    // thing they came for.
    const html = board("ending");
    expect(html).toContain(metaFor("hsr", {}).short);
    expect(html).toContain(metaFor("genshin", {}).short);
    // Deadline order, across games.
    expect(html.indexOf("Second Wind")).toBeLessThan(
      html.indexOf("Closing Ceremony"),
    );
  });

  test("the reader can see which stacking they are on", () => {
    // The control is the only thing on the board saying which of the two
    // shapes they are reading, so it has to say it, not just accept a tap.
    const pressed = (group: "game" | "ending") =>
      /aria-pressed="true"[\s\S]*?>([^<]+)</.exec(board(group))?.[1];
    expect(pressed("game")).toBe("By game");
    expect(pressed("ending")).toBe("Ending soonest");
  });
});

describe("Timeline: events that have not started", () => {
  const rows = [
    row("Closing Ceremony", "genshin", 100),
    upcoming("Frost Parade", "hsr", 3 * 24),
    upcoming("Second Coming", "zzz", 3 * 24 + 2),
    upcoming("Long Way Round", "wuwa", 30 * 24),
  ];

  const board = (showUpcoming: boolean, all = rows) =>
    render(
      <Timeline
        rows={all}
        now={NOW}
        dayWidth={32}
        onZoom={() => {}}
        group="ending"
        onGroup={() => {}}
        showUpcoming={showUpcoming}
        onShowUpcoming={() => {}}
        onOpen={() => {}}
        isDone={() => false}
      />,
    );

  test("the board holds them back by default and says how many", () => {
    // Off is the default because the board answers "how does the time I am in
    // lay out?" — but an absence nobody mentioned is indistinguishable from a
    // quiet fortnight, which is the wrong thing for this app to imply.
    const html = board(false);
    expect(html).toContain("Closing Ceremony");
    expect(html).not.toContain("Frost Parade");
    expect(html).not.toContain("Long Way Round");
    expect(html).toContain("Not started");
    expect(html).toContain(">3<");
  });

  test("switching it on plots them", () => {
    const html = board(true);
    expect(html).toContain("Frost Parade");
    expect(html).toContain("Long Way Round");
  });

  test("the control says which way it is set", () => {
    expect(board(false)).toContain('aria-pressed="false"');
    expect(board(true)).toContain('aria-pressed="true"');
  });

  test("nothing waiting and switched off means no control at all", () => {
    // A toggle that cannot change anything invites a tap that does nothing.
    expect(board(false, [row("Closing Ceremony", "genshin", 100)])).not.toContain(
      "Not started",
    );
  });

  test("a board with only future events says so rather than reading empty", () => {
    // Otherwise the reader is looking at "nothing to plot" while three events
    // are scheduled, and the reason is a control they did not notice.
    const html = board(false, rows.slice(1));
    expect(html).toContain("Nothing is running right now");
    expect(html).toContain("3 events have not started yet");
    // The control is still there to act on what the sentence just told them.
    expect(html).toContain("Not started");
  });

  test("each clump of starts is marked in words", () => {
    const html = board(true);
    // Two of them open on the same day, so that is one mark saying two.
    expect(html).toContain("2 start");
    // And the far one is its own mark, singular.
    expect(html).toContain("starts ");
  });

  test("start markers are absent while the events are held back", () => {
    expect(board(false)).not.toContain("2 start");
  });
});

describe("startMarkers", () => {
  const DAY = 86_400_000;
  const at = (ms: number) => ({ clock: { upcoming: true, startsMs: ms } });

  /** A generous scale, so nothing merges unless the test asks it to. */
  const wide = (ms: number) => (ms / DAY) * 108;

  test("events starting the same day are one mark", () => {
    // A patch ships six things at once; six rules stacked on one date is not a
    // reading of that, it is a smear.
    const marks = startMarkers(
      [at(5 * DAY), at(5 * DAY + 3600_000), at(5 * DAY + 7200_000)],
      wide,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.count).toBe(3);
  });

  test("the mark sits at the earliest start in its day", () => {
    // So the rule lands on the leftmost bar of the clump rather than at a
    // midnight no event actually begins at.
    const marks = startMarkers([at(5 * DAY + 7200_000), at(5 * DAY)], wide);
    expect(marks[0]?.ms).toBe(5 * DAY);
  });

  test("separate days stay separate when the scale has room", () => {
    const marks = startMarkers([at(5 * DAY), at(9 * DAY)], wide);
    expect(marks).toHaveLength(2);
  });

  test("days closer than a label are merged, and the label says the range", () => {
    // At six pixels a day, four days apart is 24px — two labels on top of each
    // other. Merged, and honest about what it covers.
    const tight = (ms: number) => (ms / DAY) * 6;
    const marks = startMarkers([at(5 * DAY), at(9 * DAY)], tight);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.count).toBe(2);
    expect(marks[0]?.ms).toBe(5 * DAY);
    expect(marks[0]?.through).toBe(9 * DAY);
  });

  test("events already running are not starts", () => {
    expect(
      startMarkers([{ clock: { upcoming: false, startsMs: 5 * DAY } }], wide),
    ).toEqual([]);
  });
});

describe("markerLabel", () => {
  const DAY = 86_400_000;

  test("one event says it starts", () => {
    expect(markerLabel({ ms: 5 * DAY, through: 5 * DAY, count: 1 })).toStartWith(
      "starts ",
    );
  });

  test("several on one day are counted", () => {
    expect(markerLabel({ ms: 5 * DAY, through: 5 * DAY, count: 4 })).toStartWith(
      "4 start ",
    );
  });

  test("a merged mark names the span it covers, not just its first day", () => {
    // Claiming one date for a mark that stands for eleven days is the kind of
    // small confident wrongness this codebase exists to avoid.
    const label = markerLabel({ ms: 5 * DAY, through: 9 * DAY, count: 2 });
    expect(label).toContain("–");
  });
});
