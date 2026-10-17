import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  TimelinePage,
  timelineLook,
} from "../src/client/components/redesign/TimelinePage.tsx";
import { focusBarShown } from "../src/client/components/redesign/FocusPicker.tsx";
import { openingLeft } from "../src/client/components/Timeline.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { readerEventRows } from "../src/client/state/reader/eventRows.ts";
import { sampleEvent } from "./helpers/reader.ts";
test("a game's reset strip follows its events and precedes its full routine rows", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  s.prefs.resetStrips = true;
  s.accounts["account:test"]!.routines["routine:genshin:weekly-bosses"] = {
    followed: true,
    checklist: true,
    timeline: true,
  };
  const html = render(
    <TimelinePage
      state={s}
      rows={readerEventRows(s, [sampleEvent], Date.parse(at))}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(html.indexOf('class="reset-strip"')).toBeGreaterThan(
    html.indexOf("View Test"),
  );
  expect(html.indexOf('class="routine-timeline-row"')).toBeGreaterThan(
    html.indexOf('class="reset-strip"'),
  );
  // A divider says where the routines begin.
  expect(html.indexOf('class="routine-divider"')).toBeGreaterThan(
    html.indexOf('class="reset-strip"'),
  );
  expect(html).toContain("Show routines in own section");
});
test("focus excludes other games' routine-only timelines", () => {
  let n = 0;
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin", "hsr"], at, () => `account:test${++n}`);
  s.prefs.focusGame = "genshin";
  for (const a of Object.values(s.accounts))
    a.routines[`dailies:${a.game}`] = {
      followed: true,
      checklist: true,
      timeline: true,
    };
  const html = render(
    <TimelinePage
      state={s}
      rows={readerEventRows(s, [sampleEvent], Date.parse(at)).filter(
        (r) => r.event.game === "genshin",
      )}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(html).not.toContain("Honkai: Star Rail");
});

test("Ending soonest places pinned routine resets in the same deadline queue as events", () => {
  const at = "2026-10-16T12:00:00.000Z",
    now = Date.parse(at),
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  s.prefs.timelineGroup = "ending";
  s.accounts["account:test"]!.routines["routine:genshin:weekly-bosses"] = {
    followed: true,
    checklist: true,
    timeline: true,
  };
  const html = render(
    <TimelinePage
      state={s}
      rows={readerEventRows(
        s,
        [{ ...sampleEvent, endsAt: "2026-10-30T12:00:00.000Z" }],
        now,
      )}
      now={now}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(html.indexOf('class="routine-timeline-row"')).toBeGreaterThan(-1);
  expect(html.indexOf('class="routine-timeline-row"')).toBeLessThan(
    html.indexOf('aria-label="View Test details"'),
  );
});

test("dailies stay off the timeline even when pinned there; longer routines show", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  const pin = { followed: true, checklist: true, timeline: true };
  s.accounts["account:test"]!.routines["dailies:genshin"] = pin;
  s.accounts["account:test"]!.routines["routine:genshin:weekly-bosses"] = pin;
  const html = render(
    <TimelinePage
      state={s}
      rows={readerEventRows(s, [sampleEvent], Date.parse(at))}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(html).toContain("Weekly Bosses");
  expect(html).not.toContain("Commissions, resin");
});
test("the new look is the default; end dates replace time left when chosen", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  const page = () =>
    render(
      <TimelinePage
        state={s}
        rows={readerEventRows(s, [sampleEvent], Date.parse(at))}
        now={Date.parse(at)}
        onAction={async () => ({ ok: true })}
        onOpen={() => {}}
      />,
    );
  expect(timelineLook(s.prefs)).toBe("new");
  expect(page()).toContain(" left</span>");
  s.prefs.timelineLabel = "end";
  expect(page()).toContain(">Ends ");
  s.prefs.timelineLook = "classic";
  expect(timelineLook(s.prefs)).toBe("classic");
  expect(page()).toContain('class="classic-timeline"');
  expect(page()).not.toContain('class="timeline-board"');
});
test("the focus bar setting defaults to both views and can hide either", () => {
  expect(focusBarShown({}, "soon")).toBe(true);
  expect(focusBarShown({}, "timeline")).toBe(true);
  const prefs = { focusBar: { checklist: true, timeline: false } };
  expect(focusBarShown(prefs, "soon")).toBe(true);
  expect(focusBarShown(prefs, "timeline")).toBe(false);
  expect(focusBarShown({ focusBar: "junk" }, "timeline")).toBe(true);
});
test("both looks draw the shared pill header with the focus bar beneath it", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  for (const look of ["new", "classic"]) {
    s.prefs.timelineLook = look;
    const html = render(
      <TimelinePage
        state={s}
        focusBar={<p className="focus-marker" />}
        rows={readerEventRows(s, [sampleEvent], Date.parse(at))}
        now={Date.parse(at)}
        onAction={async () => ({ ok: true })}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("Show routines in own section");
    expect(html).toContain("Show end dates");
    expect(html).not.toContain("New look");
    expect(html.indexOf("focus-marker")).toBeGreaterThan(
      html.indexOf("Jump to today"),
    );
  }
});
test("the board opens back to the running starts, with now a quarter to half across", () => {
  // Starts far back: capped so now sits halfway.
  expect(openingLeft(1000, 0, 800)).toBe(600);
  // Starts just before now: now still a quarter across.
  expect(openingLeft(1000, 990, 800)).toBe(800);
  // In between: opens just before the start.
  expect(openingLeft(1000, 700, 800)).toBe(672);
});
