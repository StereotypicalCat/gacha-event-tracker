import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextUp } from "../src/client/components/NextUp.tsx";
import {
  boardWindow,
  markerLabel,
  splitAt,
  startMarkers,
  Timeline,
} from "../src/client/components/Timeline.tsx";
import { CatchUpPanel, dailyGroups } from "../src/client/components/Dailies.tsx";
import { Welcome } from "../src/client/components/Welcome.tsx";
import { timelineLanes } from "../src/client/state/lanes.ts";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import { dayKey } from "../src/shared/daily.ts";
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

  test("lists the games alphabetically by the name on the button", () => {
    // Two games here each pin one half of the sort, and neither is decoration:
    //
    // `nikke` is Goddess of Victory: Nikke, so its id sorts fifth and its name
    // third. That is what makes this a test of sorting by *name* rather than by
    // `LaneId` — every other set of ids in this table happens to sort into the
    // same order as its names, so a comparator on the id passes them all.
    //
    // `holodori` is hololive Dreams, the one lowercase name in `games.ts`. A
    // code-point sort files it after every capitalised game instead of between
    // Goddess and Honkai, which is why the comparator has to be `localeCompare`.
    //
    // The input order is neither feed order nor id order, so nothing lines up
    // by luck.
    const markup = render(
      <Welcome
        available={["zzz", "genshin", "holodori", "hsr", "nikke", "arknights"]}
        onConfirm={() => {}}
      />,
    );
    expect(pickerNames(markup)).toEqual([
      "Arknights",
      "Genshin Impact",
      "Goddess of Victory: Nikke",
      "hololive Dreams",
      "Honkai: Star Rail",
      "Zenless Zone Zero",
    ]);
  });
});

/**
 * The game names on the picker buttons, in the order they render.
 *
 * Pinned to the name span's `flex-1` class: edit that className and this
 * returns nothing and the assertion fails loudly, which is the safe direction
 * to break in. The text arrives HTML-escaped, so a fixture using a name with an
 * apostrophe — Girls' Frontline 2: Exilium — must expect `&#x27;` in it.
 */
function pickerNames(markup: string): string[] {
  return [...markup.matchAll(/<span class="flex-1[^"]*"[^>]*>([^<]+)<\/span>/g)].map(
    (m) => m[1] ?? "",
  );
}

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

  test("the reader's game order stacks the lanes", () => {
    const lanes = timelineLanes(rows, "game", true, ["zzz", "hsr", "genshin"]);
    expect(lanes.map((l) => l.game)).toEqual(["zzz", "hsr", "genshin"]);
  });

  test("ordering the lanes does not re-sort the rows inside one", () => {
    // The same rule the mode itself follows, read one level up.
    const lanes = timelineLanes(rows, "game", true, ["genshin"]);
    expect(lanes[0]?.rows.map((r) => r.event.title)).toEqual([
      "Closing Ceremony",
      "Third Rail",
    ]);
  });

  test("a game the order does not name keeps its place behind the ones it does", () => {
    // Total for a lane the reader never placed — and stable, so the unplaced
    // games stay in the order their rows arrived rather than shuffling.
    const lanes = timelineLanes(rows, "game", true, ["zzz"]);
    expect(lanes.map((l) => l.game)).toEqual(["zzz", "genshin", "hsr"]);
  });

  test("no order given stacks exactly as it did before", () => {
    expect(timelineLanes(rows, "game", true).map((l) => l.game)).toEqual(
      timelineLanes(rows, "game", true, undefined).map((l) => l.game),
    );
  });

  test("the merged stack ignores it, having one lane and no game", () => {
    const lanes = timelineLanes(rows, "ending", true, ["zzz", "hsr", "genshin"]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.game).toBeNull();
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
        splitUpcoming
        onOpen={() => {}}
        isDone={() => false}
      />,
    );

  test("mixed in, lane mode re-sorts rather than keeping the block", () => {
    // The one place `timelineLanes` is allowed to reorder a lane. Leaving the
    // given order alone would draw exactly the block it was told not to, minus
    // the heading that explained it.
    // Given live-first, as every sort this board can be handed produces. B has
    // the nearer end (48h against 100h) but has not opened yet.
    const given = [row("A", "hsr", 100), upcoming("B", "hsr", 24, 24)];
    expect(timelineLanes(given, "game", true)[0]?.rows[0]?.event.title).toBe("A");
    expect(timelineLanes(given, "game", false)[0]?.rows[0]?.event.title).toBe("B");
  });

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

describe("Timeline: expand", () => {
  const rows = [
    row("Closing Ceremony", "genshin", 100),
    row("Second Wind", "hsr", 6),
  ];

  const board = (
    expand: (min: number, max: number) => ReturnType<typeof row>[],
    showUpcoming = false,
  ) =>
    render(
      <Timeline
        rows={rows}
        now={NOW}
        dayWidth={13}
        onZoom={() => {}}
        group="game"
        onGroup={() => {}}
        showUpcoming={showUpcoming}
        splitUpcoming
        onOpen={() => {}}
        isDone={() => false}
        expand={expand}
      />,
    );

  test("an occurrence expand hands back is drawn alongside the base rows", () => {
    // The lists only ever carry a rule's first two occurrences — expand exists
    // so the rest of its rhythm still reaches the board. This is the
    // straightforward half of that promise: something expand hands back that
    // is not already among the base rows has to actually appear.
    const extra = row("Third Rail", "zzz", 50);
    const html = board(() => [extra]);
    expect(html).toContain("Third Rail");
  });

  test("an occurrence already among the base rows is not drawn twice", () => {
    // expand does not know what the lists already showed, so it is free to
    // hand back the same occurrences that are already in the base rows —
    // exactly what happens for the first two of every rule. Undeduped, each
    // would draw a second bar directly on top of the first: not a visible
    // duplicate row a reader would notice, but one bar reading subtly bolder
    // than the rest, which is a far easier thing to miss. Comparing the whole
    // rendered markup, rather than counting how many times a title appears,
    // is what catches a bar drawn twice in the same place.
    const extra = row("Third Rail", "zzz", 50);
    const withDuplicates = board(() => [rows[0]!, rows[1]!, extra]);
    const withoutDuplicates = board(() => [extra]);
    expect(withDuplicates).toBe(withoutDuplicates);
  });

  test("showUpcoming={false} holds back an upcoming extra same as a base row", () => {
    // Expanded occurrences answer to the same switch as everything else on the
    // board. An extra that has not started yet is exactly the "next patch
    // queued behind it" noise showUpcoming exists to hold back — it does not
    // get a pass for having arrived through expand instead of rows.
    const html = board(() => [upcoming("Future Wave", "zzz", 48)], false);
    expect(html).not.toContain("Future Wave");
  });

  test("no drawn bar's right edge runs past the board's own width", () => {
    // `boardWindow`'s `max` comes from `plotted` alone, so a base row can
    // never cross it — but an expanded occurrence can: `occurrencesOf` admits
    // anything that only *starts* at or before the window's edge, and one
    // with no stated end then runs a full interval past it. Uncapped, that
    // grows the pane's scrollWidth past the gridlines and the axis, which is
    // the reader scrolling into empty space the spec says the board must
    // never have. A year out is a stand-in for that: nowhere near the two
    // base rows' window, so nothing but a clamp keeps it on the board.
    const farEvent = GachaEvent.parse({
      id: "zzz:open-ended-rerun:2026-08-10",
      game: "zzz",
      title: "Open-Ended Rerun",
      type: "story",
      summary: null,
      startsAt: "2026-08-10T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2027-08-10T00:00:00.000Z",
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
    const farRow = { event: farEvent, clock: clockFor(farEvent, "europe", NOW) };
    const html = board(() => [farRow], true);

    const chartWidth = Number(
      /style="width:([\d.]+)px;min-width:100%"/.exec(html)?.[1],
    );
    // The bar's box is `margin-left` plus `width`; both are inline styles on
    // the same button this fixture's title makes unique to find.
    const bar = /title="Open-Ended Rerun"[^>]*style="([^"]+)"/.exec(html)?.[1] ?? "";
    const marginLeft = Number(/margin-left:([\d.]+)px/.exec(bar)?.[1]);
    const width = Number(/width:([\d.]+)px/.exec(bar)?.[1]);

    expect(marginLeft + width).toBeLessThanOrEqual(chartWidth);
  });

  test("a start marker counts an occurrence that only arrived through expand", () => {
    // Neither base row has started yet as far as this window's concerned —
    // both `row()` fixtures already opened on the 10th — so with no expanded
    // extra there is nothing upcoming to mark. An extra that has not started
    // yet is exactly the case a start marker exists to label, and it has to
    // show up whether it came from the base rows or from expand.
    const html = board(() => [upcoming("Future Wave", "zzz", 48)], true);
    expect(html).toContain("starts ");
  });
});

describe("Timeline: events that have not started", () => {
  const rows = [
    row("Closing Ceremony", "genshin", 100),
    upcoming("Frost Parade", "hsr", 3 * 24),
    upcoming("Second Coming", "zzz", 3 * 24 + 2),
    upcoming("Long Way Round", "wuwa", 30 * 24),
  ];

  const board = (
    showUpcoming: boolean,
    all = rows,
    group: "game" | "ending" = "ending",
    splitUpcoming = true,
  ) =>
    render(
      <Timeline
        rows={all}
        now={NOW}
        dayWidth={32}
        onZoom={() => {}}
        group={group}
        onGroup={() => {}}
        showUpcoming={showUpcoming}
        splitUpcoming={splitUpcoming}
        onOpen={() => {}}
        isDone={() => false}
      />,
    );

  test("the board holds them back by default", () => {
    // Off is the default because the board answers "how does the time I am in
    // lay out?", and it draws its span from what it plots — so a next patch on
    // every lane pushes the running bars the reader came for off to the left.
    const html = board(false);
    expect(html).toContain("Closing Ceremony");
    expect(html).not.toContain("Frost Parade");
    expect(html).not.toContain("Long Way Round");
  });

  test("switching it on plots them", () => {
    const html = board(true);
    expect(html).toContain("Frost Parade");
    expect(html).toContain("Long Way Round");
  });

  test("a board with only future events says so rather than reading empty", () => {
    // Otherwise the reader is looking at "nothing to plot" while three events
    // are scheduled, and an absence nobody mentioned is indistinguishable from
    // a quiet fortnight. It names the setting, since the switch is not on the
    // board any more.
    const html = board(false, rows.slice(1));
    expect(html).toContain("Nothing is running right now");
    expect(html).toContain("3 events have not started yet");
    expect(html).toContain("Show events that haven&#x27;t started");
  });

  test("one waiting event is counted in words, not as \"1 events\"", () => {
    const html = board(false, [rows[1]!]);
    expect(html).toContain("One event has not started yet");
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

  test("a heading marks where the running bars stop", () => {
    // The dashed edge says "this bar has not started"; it does not say where
    // the running ones ended, which is what a board read at a glance needs.
    const html = board(true);
    const at = html.indexOf("Not started yet");
    expect(at).toBeGreaterThan(html.indexOf("Closing Ceremony"));
    expect(at).toBeLessThan(html.indexOf("Frost Parade"));
  });

  test("every lane gets its own, since every lane has its own boundary", () => {
    // Stacked by game, "where does this game stop running?" is a different
    // answer per lane — one heading for the board would be in the wrong place
    // for all but one of them.
    const html = board(true, rows, "game");
    expect(html.split("Not started yet")).toHaveLength(4);
  });

  test("mixed in, there is no block to head and no heading", () => {
    // Not the heading switched off: the rows are one deadline queue, so a
    // label would be pointing at the middle of it.
    const html = board(true, rows, "ending", false);
    expect(html).toContain("Frost Parade");
    expect(html).not.toContain("Not started yet");
  });

  test("mixed in, a nearer deadline wins whether or not it has opened", () => {
    // The whole point of the option, and the one thing the split order can
    // never show. Frost Parade opens in 3 days and closes 10 days after that;
    // Closing Ceremony is running now until 100 hours from now — so it is
    // still the nearer deadline, and Frost Parade sits under it rather than
    // behind every running row.
    const near = upcoming("Quick Turnaround", "hsr", 24, 24);
    const html = board(true, [row("Closing Ceremony", "genshin", 100), near], "ending", false);
    expect(html.indexOf("Quick Turnaround")).toBeLessThan(
      html.indexOf("Closing Ceremony"),
    );
    // Split, the same two rows go the other way round.
    const kept = board(true, [row("Closing Ceremony", "genshin", 100), near], "ending", true);
    expect(kept.indexOf("Closing Ceremony")).toBeLessThan(
      kept.indexOf("Quick Turnaround"),
    );
  });

  test("no heading where nothing is waiting", () => {
    // A label with nothing under it is a section that does not exist.
    expect(board(true, [row("Closing Ceremony", "genshin", 100)])).not.toContain(
      "Not started yet",
    );
    expect(board(false)).not.toContain("Not started yet");
  });
});

describe("splitAt", () => {
  const live = { clock: { upcoming: false } };
  const soon = { clock: { upcoming: true } };

  test("finds the boundary", () => {
    expect(splitAt([live, live, soon, soon])).toBe(2);
  });

  test("a lane that is all future breaks at the top", () => {
    // Not a divider then but a heading, which is the honest reading: nothing
    // in this lane has started.
    expect(splitAt([soon, soon])).toBe(0);
  });

  test("nothing waiting is no boundary at all", () => {
    expect(splitAt([live, live])).toBe(-1);
    expect(splitAt([])).toBe(-1);
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

describe("dailyGroups", () => {
  const NOW = Date.parse("2026-08-17T12:00:00.000Z");
  const meta = (id: string) => metaFor(id, {});
  const startOf = (e: { startsAt: string }) => Date.parse(e.startsAt);

  const repeating = (id: string, game: string, title: string) =>
    ({
      id,
      game,
      title,
      type: "login",
      summary: null,
      startsAt: "2026-08-10T00:00:00.000Z",
      startPrecision: "day",
      endsAt: null,
      endPrecision: "unknown",
      regionScoped: false,
      regionEnds: null,
      sourceUrl: "https://example.test",
    }) as never;

  test("a game's chore and its events are adjacent, chore first", () => {
    // This is the whole point: the strip used to list every chore and then
    // every event, so Genshin's commissions and Genshin's login event sat at
    // opposite ends with a dozen games between them.
    const groups = dailyGroups(
      ["genshin", "hsr"],
      [repeating("e1", "genshin", "Login Bonus"), repeating("e2", "hsr", "Sign In")],
      NOW,
      "europe",
      meta,
      startOf,
    );
    expect(groups.map((g) => g.items.map((i) => i.key))).toEqual([
      ["dailies:genshin", "e1"],
      ["dailies:hsr", "e2"],
    ]);
  });

  test("groups follow the order the games arrive in", () => {
    // The reader's order, resolved upstream by `orderGames`.
    const groups = dailyGroups(["hsr", "genshin"], [], NOW, "europe", meta, startOf);
    expect(groups.map((g) => g.game)).toEqual(["hsr", "genshin"]);
  });

  test("events keep their given order inside a game", () => {
    // Grouping is not a licence to re-sort within a group.
    const groups = dailyGroups(
      ["genshin"],
      [
        repeating("late", "genshin", "Second"),
        repeating("early", "genshin", "First"),
      ],
      NOW,
      "europe",
      meta,
      startOf,
    );
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      "dailies:genshin",
      "late",
      "early",
    ]);
  });

  test("a lane the reader invented gets no standing chore", () => {
    // There is no routine we could name on their behalf — but their repeating
    // events still group under it.
    const groups = dailyGroups(
      ["mygame:mine"],
      [repeating("m1", "mygame:mine", "My Daily")],
      NOW,
      "europe",
      meta,
      startOf,
    );
    expect(groups[0]?.items.map((i) => i.key)).toEqual(["m1"]);
  });

  test("a lane with nothing to tick is dropped, not rendered as an empty heading", () => {
    const groups = dailyGroups(["mygame:empty"], [], NOW, "europe", meta, startOf);
    expect(groups).toEqual([]);
  });

  test("an event whose lane is not listed still gets a line", () => {
    // Dropping it would quietly remove something tickable. It trails the lanes
    // that were listed.
    const groups = dailyGroups(
      ["genshin"],
      [repeating("stray", "zzz", "Stray Daily")],
      NOW,
      "europe",
      meta,
      startOf,
    );
    expect(groups.map((g) => g.game)).toEqual(["genshin", "zzz"]);
  });

  test("a done event contributes nothing, because it never arrives here", () => {
    // The strip is an instruction, not a record: App filters completed and
    // ignored events out before this sees them (`outstanding` in lens.ts), so
    // catch-up cannot resurrect a chip for something the reader finished.
    const groups = dailyGroups(["genshin"], [], NOW, "europe", meta, startOf);
    expect(groups[0]?.items.map((i) => i.key)).toEqual(["dailies:genshin"]);
  });

  test("a chore has no start to clip a catch-up strip at; an event does", () => {
    const groups = dailyGroups(
      ["genshin"],
      [repeating("e1", "genshin", "Login Bonus")],
      NOW,
      "europe",
      meta,
      startOf,
    );
    const [chore, event] = groups[0]?.items ?? [];
    expect(chore?.notBefore).toBeNull();
    expect(event?.notBefore).toBe(Date.parse("2026-08-10T00:00:00.000Z"));
  });

  test("each item carries its own game's reset clock", () => {
    // Endfield serves Europe off the Americas machine, so its day rolls at
    // 09:00 UTC. A section-wide "today" would tick the wrong box for hours.
    const dawn = Date.parse("2026-08-17T05:00:00.000Z");
    const groups = dailyGroups(
      ["genshin", "endfield"],
      [],
      dawn,
      "europe",
      meta,
      startOf,
    );
    const today = groups.map((g) => g.items[0]?.today);
    expect(today[0]).not.toBe(today[1]);
  });
});

describe("CatchUpPanel", () => {
  const NOW = Date.parse("2026-08-17T12:00:00.000Z");
  const meta = (id: string) => metaFor(id, {});
  const startOf = (e: { startsAt: string }) => Date.parse(e.startsAt);

  const groups = () =>
    dailyGroups(["genshin"], [], NOW, "europe", meta, startOf);

  const panel = (logged: string[] = []) =>
    render(
      <CatchUpPanel
        groups={groups()}
        now={NOW}
        region="europe"
        daysFor={() => logged}
        onToggleDay={() => {}}
      />,
    );

  test("a fortnight of days, each one tickable", () => {
    const markup = panel();
    const pips = [...markup.matchAll(/aria-label="[^"]*(?:not )?done"/g)];
    expect(pips).toHaveLength(14);
  });

  test("no day later than today, because nobody can have done tomorrow", () => {
    // The pip for a future day would be a control for a claim that cannot be
    // true. It is absent rather than present-and-disabled.
    expect(panel()).not.toContain('disabled=""');
  });

  test("a logged day reads as done, an unlogged one does not", () => {
    const markup = panel([dayKey(NOW, "europe", "genshin")]);
    expect(markup).toContain(", done\"");
    expect(markup).toContain(", not done\"");
  });

  test("names the game, so an expanded strip says whose days these are", () => {
    expect(panel()).toContain("Genshin Impact");
  });

  test("an undated event's strip starts at the event, not a fortnight ago", () => {
    const started = NOW - 2 * 86_400_000;
    const withEvent = dailyGroups(
      ["genshin"],
      [
        {
          id: "e1",
          game: "genshin",
          title: "Login Bonus",
          type: "login",
          summary: null,
          startsAt: new Date(started).toISOString(),
          startPrecision: "day",
          endsAt: null,
          endPrecision: "unknown",
          regionScoped: false,
          regionEnds: null,
          sourceUrl: "https://example.test",
        } as never,
      ],
      NOW,
      "europe",
      meta,
      startOf,
    );
    const markup = render(
      <CatchUpPanel
        groups={withEvent}
        now={NOW}
        region="europe"
        daysFor={() => []}
        onToggleDay={() => {}}
      />,
    );
    // The chore's fourteen, plus three for an event that opened two days ago.
    expect([...markup.matchAll(/aria-label="[^"]*(?:not )?done"/g)]).toHaveLength(17);
  });
});

describe("boardWindow is not widened by expansion", () => {
  test("a rule's occurrences cannot enlarge the board that generated them", () => {
    // The circularity guard. boardWindow takes max from the ends it is given,
    // so if expanded occurrences were fed back into it, each pass would widen
    // the window, generate more occurrences and widen it again — a rule with
    // until: null would never terminate. The fix is ordering: settle the window
    // from the base rows, THEN expand into it. This test pins the ordering by
    // asserting the window is a function of the base rows alone.
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    const starts = [Date.parse("2026-09-01T00:00:00.000Z")];
    const ends = [Date.parse("2026-09-08T00:00:00.000Z")];

    const base = boardWindow(starts, ends, now);

    // A year of weekly occurrences, as `expand` would return them.
    const expandedEnds = Array.from({ length: 52 }, (_, i) =>
      Date.parse("2026-09-08T00:00:00.000Z") + i * 7 * 24 * 60 * 60 * 1000,
    );
    const ifItLeaked = boardWindow(starts, [...ends, ...expandedEnds], now);

    expect(base.max).toBeLessThan(ifItLeaked.max);
    // Which is exactly why Timeline must compute starts/ends from `plotted`
    // before calling expand — asserted structurally in the component below.
  });

  test("Timeline itself never widens the board it hands to expand", () => {
    // The unit test above only pins `boardWindow`'s own purity; it never
    // renders `Timeline`, so nothing here catches the ordering itself moving —
    // `expand` called before `boardWindow` settles its window leaves the
    // suite green otherwise. This renders the component and compares the
    // actual chart width against a year of occurrences `expand` hands back,
    // against the same board with no `expand` at all.
    const rows = [row("Closing Ceremony", "genshin", 100)];
    const chartWidthOf = (html: string) =>
      Number(/style="width:([\d.]+)px;min-width:100%"/.exec(html)?.[1]);

    const withoutExpand = render(
      <Timeline
        rows={rows}
        now={NOW}
        dayWidth={13}
        onZoom={() => {}}
        group="game"
        onGroup={() => {}}
        showUpcoming
        splitUpcoming
        onOpen={() => {}}
        isDone={() => false}
      />,
    );

    // A year of weekly occurrences, exactly the shape a bare rotation with no
    // `until` would hand back — if these reached `boardWindow` the chart
    // would grow to fit them.
    const yearOfOccurrences = Array.from({ length: 52 }, (_, i) =>
      row(`Rerun ${i}`, "zzz", 100 + i * 7 * 24),
    );
    const withExpand = render(
      <Timeline
        rows={rows}
        now={NOW}
        dayWidth={13}
        onZoom={() => {}}
        group="game"
        onGroup={() => {}}
        showUpcoming
        splitUpcoming
        onOpen={() => {}}
        isDone={() => false}
        expand={() => yearOfOccurrences}
      />,
    );

    expect(chartWidthOf(withExpand)).toBe(chartWidthOf(withoutExpand));
  });
});
