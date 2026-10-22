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

// Review fix (spec 2026-10-22, decision 3): with no recorded end, an estimate
// is shown as one — never as a reset, and never "ended" once it passes.
import { RoutinesPage } from "../src/client/components/redesign/RoutinesPage.tsx";
import { routinePeriod } from "../src/client/components/redesign/TimelinePage.tsx";
const wuwa = (iso: string) => {
  const state = migrateLegacy({}, ["wuwa"], iso, () => "account:pin");
  for (const id of ["routine:wuwa:shop-radiant-tide", "routine:wuwa:tower-of-adversity"])
    state.accounts["account:pin"]!.routines[id] = { followed: true, checklist: true, timeline: true };
  const rows = routineRows(state, "account:pin", Date.parse(iso));
  return { state, shop: rows.find((r) => r.id === "routine:wuwa:shop-radiant-tide")! };
};
for (const iso of ["2026-11-20T00:00:00.000Z", "2027-01-02T00:00:00.000Z"]) {
  test(`an open-ended version shows its estimate as one (${iso.slice(0, 10)})`, () => {
    const t = Date.parse(iso);
    const { state, shop } = wuwa(iso);
    const period = routinePeriod(shop, t);
    expect(period.estimated).toBe(true);
    expect(period.end).toBeGreaterThan(t); // the band still covers today
    const pinned = render(<PinnedRoutine row={shop} hue="#3DD6A0" onAction={ok} now={t} />);
    expect(pinned).toContain("resets with next version · expected ~23 Dec");
    expect(pinned).not.toContain("resets in");
    const page = render(<RoutinesPage state={state} onAction={ok} now={t} />);
    expect(page).not.toContain("ended");
  });
}
test("a recorded version end is still a countdown", () => {
  const iso = "2026-10-22T14:30:00.000Z";
  const { shop } = wuwa(iso);
  expect(routinePeriod(shop, Date.parse(iso)).estimated).toBe(false);
  expect(render(<PinnedRoutine row={shop} hue="#3DD6A0" onAction={ok} now={Date.parse(iso)} />)).toContain(
    "resets in 19d 20h",
  );
});
