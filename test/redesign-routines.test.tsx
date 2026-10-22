import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { RoutineGroup } from "../src/client/components/redesign/RoutineGroup.tsx";
test("always expanded groups have no collapse affordance", () => {
  const html = render(
    <RoutineGroup title="Genshin" policy="always" focused={false}>
      <p>Direct daily controls</p>
    </RoutineGroup>,
  );
  expect(html).not.toContain("<summary");
  expect(html).toContain("Direct daily controls");
});
test("focus expands groups without changing the saved default", () => {
  const html = render(
    <RoutineGroup title="Genshin" policy="collapsed" focused={true}>
      <p>Controls</p>
    </RoutineGroup>,
  );
  expect(html).toContain('open=""');
});

import { placementAccounts } from "../src/client/components/redesign/RoutinesPage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";
test("bulk pins combine changes per account and preserve the other placement", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const state = migrateLegacy({}, ["genshin"], at, () => "account:bulk");
  const a = state.accounts["account:bulk"]!;
  a.routines["routine:genshin:weekly-bosses"] = {
    followed: true,
    checklist: false,
    timeline: true,
  };
  const rows = routineRows(state, a.id, Date.parse(at));
  expect(rows.length).toBeGreaterThan(1);
  const accounts = placementAccounts(state, rows, "checklist", true);
  expect(accounts).toHaveLength(1);
  for (const row of rows) {
    expect(accounts[0]!.routines[row.id]!.checklist).toBe(true);
    expect(accounts[0]!.routines[row.id]!.timeline).toBe(
      row.placement.timeline,
    );
  }
  expect(a.routines["routine:genshin:weekly-bosses"]!.checklist).toBe(false);
});

import { RoutinesPage } from "../src/client/components/redesign/RoutinesPage.tsx";
test("the routines table shows progress as text with an edit affordance, not inputs", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const state = migrateLegacy({}, ["genshin"], at, () => "account:table");
  const pin = { followed: true, checklist: true, timeline: true };
  state.accounts["account:table"]!.routines["routine:genshin:weekly-bosses"] =
    pin;
  state.accounts["account:table"]!.routines["dailies:genshin"] = pin;
  const html = render(
    <RoutinesPage
      state={state}
      onAction={async () => ({ ok: true })}
      now={Date.parse(at)}
    />,
  );
  expect(html).toContain('class="rt"');
  expect(html).toContain('class="gcell"');
  expect(html).toContain('title="Enter an amount"');
  expect(html).toContain("/ 3 runs");
  expect(html).not.toContain('type="number"');
  expect(html).toContain('class="pin"');
  // One server: the game cell does not name it.
  expect(html).not.toContain(">europe<");
});

test("routine bands are named by cadence: Dailies, Weeklies", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const state = migrateLegacy({}, ["genshin"], at, () => "account:bands");
  const pin = { followed: true, checklist: true, timeline: true };
  state.accounts["account:bands"]!.routines["routine:genshin:weekly-bosses"] =
    pin;
  state.accounts["account:bands"]!.routines["dailies:genshin"] = pin;
  const html = render(
    <RoutinesPage
      state={state}
      onAction={async () => ({ ok: true })}
      now={Date.parse(at)}
    />,
  );
  expect(html).toContain(">Dailies<");
  expect(html).toContain(">Weeklies<");
  expect(html).not.toContain(">Today<");
  expect(html).not.toContain(">This week<");
});

import { Fireworks } from "../src/client/components/Fireworks.tsx";
test("the grand celebration is wider than the single burst and carries the game's colour", () => {
  const single = render(<Fireworks />);
  const grand = render(<Fireworks grand hue="#4EA8DE" />);
  const count = (html: string) => html.split('class="spark"').length - 1;
  expect(count(single)).toBe(27);
  expect(count(grand)).toBe(98);
  expect(grand).toContain('class="fireworks grand"');
  expect(grand).toContain("background:#4EA8DE");
});

test("a finished routine group is marked complete but does not celebrate on arrival", () => {
  const html = render(
    <RoutineGroup
      title="Genshin"
      policy="always"
      focused={false}
      done={2}
      total={2}
      summary="All 2 done"
    >
      <p>rows</p>
    </RoutineGroup>,
  );
  expect(html).toContain('data-complete="true"');
  expect(html).toContain("All 2 done");
  expect(html).not.toContain("data-celebrate");
  expect(html).not.toContain("fireworks");
});

test("a routine that resets with the version is not offered as Make it mine", () => {
  // A reader's task cannot hold a version period (spec 2026-10-22).
  const at = "2026-10-22T14:30:00.000Z";
  const state = migrateLegacy({}, ["wuwa"], at, () => "account:mine");
  const pin = { followed: true, checklist: true, timeline: true };
  state.accounts["account:mine"]!.routines["routine:wuwa:shop-radiant-tide"] = pin;
  state.accounts["account:mine"]!.routines["routine:wuwa:weekly-challenge"] = pin;
  const html = render(
    <RoutinesPage state={state} onAction={async () => ({ ok: true })} now={Date.parse(at)} />,
  );
  expect(html).toContain("Oscillated Coral: Radiant Tide");
  expect(html.split("Make it mine").length - 1).toBe(1);
});
