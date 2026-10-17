import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  PinnedRoutine,
  lastDayInPeriod,
} from "../src/client/components/redesign/PinnedRoutine.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";

const at = "2026-10-16T12:00:00.000Z";
const now = Date.parse(at);
function row(id: string) {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:pin");
  state.accounts["account:pin"]!.routines[id] = {
    followed: true,
    checklist: true,
    timeline: false,
  };
  return routineRows(state, "account:pin", now).find((r) => r.id === id)!;
}
const ok = async () => ({ ok: true }) as const;

test("an amount routine short of its target offers +1, an editable count and one-click complete", () => {
  const r = row("routine:genshin:weekly-bosses");
  const html = render(
    <PinnedRoutine row={r} hue="#4EA8DE" onAction={ok} now={now} />,
  );
  expect(html).toContain("0 / 3 runs");
  expect(html).toContain("+1");
  expect(html).toContain("Mark Weekly Bosses complete");
  expect(html).toContain('aria-pressed="false"');
  expect(html).not.toContain("data-done");
});

test("a met target reads done this week, drops +1, and its box offers undo", () => {
  const r = row("routine:genshin:weekly-bosses");
  const met = { ...r, status: { ...r.status, count: 3, met: true, needed: 0 } };
  const html = render(
    <PinnedRoutine row={met} hue="#4EA8DE" onAction={ok} now={now} />,
  );
  expect(html).toContain('data-done="true"');
  expect(html).toContain("Done this week");
  expect(html).toContain("3 / 3 runs");
  expect(html).not.toContain("+1");
  expect(html).toContain("done this week. Undo");
  expect(html).toContain('aria-pressed="true"');
  // Arriving complete is not completing it: no fireworks on render.
  expect(html).not.toContain("fireworks");
});

test("undoing a check-in removes the period's latest tick, not one from before it", () => {
  const r = row("routine:genshin:realm-depot");
  const today = "2026-10-16";
  const ticked = {
    ...r,
    days: ["2026-10-08", "2026-10-13", "2026-10-14"],
    status: { ...r.status, periodStart: "2026-10-12" },
  };
  expect(lastDayInPeriod(ticked, today)).toBe("2026-10-14");
  expect(
    lastDayInPeriod({ ...ticked, days: ["2026-10-08"] }, today),
  ).toBeNull();
});
