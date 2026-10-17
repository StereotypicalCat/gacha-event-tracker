import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { DailyPanel } from "../src/client/components/redesign/DailyPanel.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";
import { readerDayKey } from "../src/shared/readerClock.ts";

const at = "2026-10-16T12:00:00.000Z";
const now = Date.parse(at);
function setup() {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:daily");
  state.accounts["account:daily"]!.routines["dailies:genshin"] = {
    followed: true,
    checklist: true,
    timeline: false,
  };
  const rows = routineRows(state, "account:daily", now).filter(
    (r) => r.id === "dailies:genshin",
  );
  return { state, rows };
}

test("a daily row is one tick target, with progress above the list", () => {
  const { state, rows } = setup();
  const html = render(
    <DailyPanel
      rows={rows}
      state={state}
      onAction={async () => ({ ok: true })}
      now={now}
    />,
  );
  expect(html).toContain('class="daily-row daily-hit"');
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain("0 of 1 done");
  expect(html).not.toContain("-day streak");
});

test("a ticked daily reads done, shows its streak, and the panel says all done", () => {
  const { state, rows } = setup();
  const today = readerDayKey(now, rows[0]!.clock);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const ticked = [{ ...rows[0]!, days: [yesterday, today] }];
  const html = render(
    <DailyPanel
      rows={ticked}
      state={state}
      onAction={async () => ({ ok: true })}
      now={now}
    />,
  );
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("All done for today");
  expect(html).toContain("2-day streak");
  // A fresh render is not a fresh tick: nothing pops on arrival.
  expect(html).not.toContain("data-fresh");
  expect(html).not.toContain("fireworks");
});

test("an event's weekly goal, met without today's tick, reads done and shows 5/5 wk", () => {
  const { state, rows } = setup();
  const today = readerDayKey(now, rows[0]!.clock);
  const goalRow = {
    ...rows[0]!,
    id: "genshin:to-temper-thyself",
    title: "To Temper Thyself and Journey Far",
    days: [],
    status: {
      scope: "week" as const,
      measure: "days" as const,
      periodStart: today,
      required: 5,
      count: 5,
      met: true,
      needed: 0,
      open: 0,
      shortfall: false,
    },
  };
  const html = render(
    <DailyPanel
      rows={[goalRow]}
      state={state}
      onAction={async () => ({ ok: true })}
      now={now}
    />,
  );
  expect(html).toContain("5/5 wk");
  expect(html).toContain('data-met="true"');
  // Not ticked today: the button stays unpressed, nothing is invented.
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain("All done for today");
  expect(html).not.toContain("-day streak");
});

test("an unmet weekly goal counts toward its target, not as done", () => {
  const { state, rows } = setup();
  const today = readerDayKey(now, rows[0]!.clock);
  const goalRow = {
    ...rows[0]!,
    id: "genshin:to-temper-thyself",
    days: [],
    status: {
      scope: "week" as const,
      measure: "days" as const,
      periodStart: today,
      required: 5,
      count: 3,
      met: false,
      needed: 2,
      open: 4,
      shortfall: false,
    },
  };
  const html = render(
    <DailyPanel
      rows={[goalRow]}
      state={state}
      onAction={async () => ({ ok: true })}
      now={now}
    />,
  );
  expect(html).toContain("3/5 wk");
  expect(html).toContain("0 of 1 done");
  expect(html).not.toContain("data-met");
});
