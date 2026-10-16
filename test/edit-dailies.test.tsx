import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Dailies,
  splitByCadence,
  tasksShown,
  type DailyItem,
} from "../src/client/components/Dailies.tsx";
import {
  EditPanel,
  laneGroups,
  type StripEditor,
  type StripEvent,
  type StripStanding,
} from "../src/client/components/EditPanel.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import { goalSummary, type GoalStatus } from "../src/shared/goal.ts";
import type { Task } from "../src/shared/task.ts";

/**
 * Editing the dailies strip from the strip itself.
 *
 * Setting up Genshin's “To Temper Thyself and Journey Far” — five days of seven,
 * weeks from Monday — used to mean finding it in the list, opening its sheet,
 * saying it repeats, then setting the goal. The strip's Edit panel does the
 * same with the same handlers, and weekly and monthly tasks get a row of their
 * own under the dailies that the reader can switch off.
 */

const NOW = Date.parse("2026-10-14T12:00:00.000Z");

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <GameMetaProvider value={(id) => metaFor(id, {})}>{node}</GameMetaProvider>,
  );
}

const temper: StripEvent = {
  id: "genshin:to-temper-thyself-and-journey-far:2026-08-10",
  game: "genshin",
  title: "To Temper Thyself and Journey Far",
  goal: { period: "week", measure: "days", required: 5, weekStartsOn: 1 },
  hasStoredGoal: true,
  detected: false,
  defaultWeekStartsOn: 1,
  maxDays: 84,
};
const login: StripEvent = {
  id: "hsr:gift-of-odyssey:2026-10-01",
  game: "hsr",
  title: "Gift of Odyssey",
  goal: undefined,
  hasStoredGoal: false,
  detected: true,
  defaultWeekStartsOn: 3,
  maxDays: 7,
};
const abyss: StripEvent = {
  id: "genshin:spiral-abyss:2026-10-01",
  game: "genshin",
  title: "Spiral Abyss",
  goal: undefined,
  hasStoredGoal: false,
  detected: false,
  defaultWeekStartsOn: 3,
  maxDays: null,
};

function editor(over: Partial<StripEditor> = {}): StripEditor {
  return {
    inStrip: [temper, login],
    addable: [abyss],
    onGoal: () => {},
    onDaily: () => {},
    onOpen: () => {},
    shown: { chores: true, weekly: true, monthly: true, cycle: true },
    hasTasks: { weekly: true, monthly: false, cycle: false },
    onShown: () => {},
    standing: [],
    onTrack: () => {},
    ...over,
  };
}

describe("goalSummary", () => {
  test("says what each goal asks for in a few words", () => {
    expect(goalSummary(undefined)).toBe("No goal");
    expect(goalSummary({ period: "week", measure: "days", required: 5, weekStartsOn: 1 })).toBe(
      "5 days each week",
    );
    expect(goalSummary({ period: "week", measure: "days", required: 1, weekStartsOn: 1 })).toBe(
      "1 day each week",
    );
    expect(goalSummary({ period: "event", measure: "days", required: 12 })).toBe(
      "12 days across the event",
    );
    expect(
      goalSummary({ period: "week", measure: "amount", target: 2100, weekStartsOn: 1 }),
    ).toBe("2,100 points each week");
    expect(goalSummary({ period: "event", measure: "amount", target: 500 })).toBe(
      "500 points across the event",
    );
  });
});

describe("laneGroups", () => {
  test("the reader's lane order first, then stragglers, never re-sorted inside a lane", () => {
    const zzz: StripEvent = { ...abyss, id: "z", game: "zzz", title: "Z" };
    const groups = laneGroups(["hsr", "genshin"], [temper, zzz, login, abyss]);
    expect(groups.map((g) => [g.game, g.events.map((e) => e.title)])).toEqual([
      ["hsr", ["Gift of Odyssey"]],
      ["genshin", ["To Temper Thyself and Journey Far", "Spiral Abyss"]],
      ["zzz", ["Z"]],
    ]);
  });

  test("a lane with nothing in it is dropped", () => {
    expect(laneGroups(["hsr", "genshin"], [temper]).map((g) => g.game)).toEqual(["genshin"]);
  });
});

describe("tasksShown", () => {
  const AT = "2026-10-01T00:00:00.000Z";
  const weekly: Task = {
    id: "mytask:aaaaaa1111", game: "zzz", title: "Activity points",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 2100, unit: "points" }, at: AT, updatedAt: AT,
  };
  const monthly: Task = {
    id: "mytask:bbbbbb2222", game: "zzz", title: "Shop reset",
    period: { unit: "month", startsOn: 1 }, measure: { kind: "days", required: 1 },
    at: AT, updatedAt: AT,
  };

  test("each switch hides its own period and nothing else", () => {
    const all = [weekly, monthly];
    const on = { cycle: true };
    expect(tasksShown(all, { weekly: true, monthly: true, ...on })).toEqual(all);
    expect(tasksShown(all, { weekly: false, monthly: true, ...on })).toEqual([monthly]);
    expect(tasksShown(all, { weekly: true, monthly: false, ...on })).toEqual([weekly]);
    expect(tasksShown(all, { weekly: false, monthly: false, ...on })).toEqual([]);
  });
});

describe("splitByCadence", () => {
  const item = (key: string, cadence: DailyItem["cadence"]): DailyItem => ({
    key, game: "zzz", label: key, title: key, ariaLabel: key, today: "2026-10-14",
    resetsIn: 0, notBefore: null, cadence,
  });

  test("today's things stay on top, weekly and monthly go under, order kept", () => {
    const items = [item("chore", "day"), item("wk", "week"), item("ev", "event"),
      item("mo", "month"), item("ev2", "day")];
    const { today, longer } = splitByCadence(items);
    expect(today.map((i) => i.key)).toEqual(["chore", "ev", "ev2"]);
    expect(longer.map((i) => i.key)).toEqual(["wk", "mo"]);
  });
});

describe("EditPanel", () => {
  test("lists the strip's events by game, each with its goal in words", () => {
    const html = render(<EditPanel games={["genshin", "hsr"]} editor={editor()} />);
    expect(html).toContain("To Temper Thyself and Journey Far");
    expect(html).toContain("5 days each week");
    expect(html).toContain("Gift of Odyssey");
    expect(html).toContain("No goal");
    // Genshin's heading comes before Honkai's, as the reader ordered them.
    expect(html.indexOf("Genshin Impact")).toBeLessThan(html.indexOf("Honkai: Star Rail"));
  });

  test("offers running events that are not in the strip yet, a game at a time", () => {
    // Closed, a game says how many it could add and lists none of them: with
    // every game on, the open list was a hundred pills deep.
    const closed = render(<EditPanel games={["genshin", "hsr"]} editor={editor()} />);
    expect(closed).toMatch(/Track · (<!-- -->)?1/);
    expect(closed).not.toContain("Track Spiral Abyss");
    const open = render(
      <EditPanel games={["genshin", "hsr"]} editor={editor()} initialAdding="genshin" />,
    );
    expect(open).toMatch(/aria-label="Track Spiral Abyss"/);
  });

  test("a goal this version cannot read is said, not shown as none", () => {
    const unread: StripEvent = { ...login, hasStoredGoal: true };
    const html = render(
      <EditPanel games={["hsr"]} editor={editor({ inStrip: [unread], addable: [] })} />,
    );
    expect(html).toContain("A goal this version can&#x27;t read");
    expect(html).not.toContain("No goal");
  });

  test("an open row carries the goal control, the sheet and the way out", () => {
    const html = render(
      <EditPanel games={["genshin"]} editor={editor({ inStrip: [temper], addable: [] })}
        initialOpen={temper.id} />,
    );
    expect(html).toContain("Check-in goal");
    expect(html).toContain("Open details");
    // Same wording as the sheet, so the reader is told what goes with it.
    expect(html).toContain("Stop tracking — removes the goal");
  });

  test("the switches are offered only for what exists", () => {
    const html = render(<EditPanel games={["genshin"]} editor={editor()} />);
    expect(html).toContain("Daily chores");
    expect(html).toContain("Weekly tasks");
    expect(html).not.toContain("Monthly tasks");
    expect(html).not.toContain("Cycle tasks");
  });

  test("a cycle task brings the cycle switch", () => {
    const html = render(
      <EditPanel games={["genshin"]} editor={editor({ hasTasks: { weekly: false, monthly: false, cycle: true } })} />,
    );
    expect(html).toContain("Cycle tasks");
    expect(html).not.toContain("Weekly tasks");
  });

  test("with nothing to add, it says where events come from", () => {
    const html = render(
      <EditPanel games={["genshin"]} editor={editor({ inStrip: [temper], addable: [] })} />,
    );
    expect(html).not.toContain('aria-label="Track');
    expect(html).toContain("Everything running is tracked");
  });

  const chore: StripStanding = {
    id: "dailies:genshin", game: "genshin", title: "Commissions, resin", kind: "chore", tracked: true,
  };
  const bosses: StripStanding = {
    id: "routine:genshin:weekly-bosses", game: "genshin", title: "Weekly Bosses", kind: "routine", tracked: true,
  };
  const bargains: StripStanding = {
    id: "routine:genshin:paimons-bargains", game: "genshin", title: "Paimon's Bargains", kind: "routine", tracked: false,
  };

  test("a game's chore and built-ins are listed with its events, each with Stop tracking", () => {
    const html = render(
      <EditPanel games={["genshin"]} editor={editor({ inStrip: [temper], addable: [], standing: [chore, bosses] })} />,
    );
    // Chore first, then built-ins, then the events — the order the strip draws.
    const at = (t: string) => html.indexOf(t);
    expect(at("Commissions, resin")).toBeLessThan(at("Weekly Bosses"));
    expect(at("Weekly Bosses")).toBeLessThan(at("To Temper Thyself"));
    expect(html).toContain('aria-label="Stop tracking Commissions, resin"');
    expect(html).toContain('aria-label="Stop tracking Weekly Bosses"');
  });

  test("what a game could track and does not is counted under Track, events included", () => {
    const ed = editor({ inStrip: [temper], addable: [abyss], standing: [{ ...chore, tracked: false }, bosses, bargains] });
    const closed = render(<EditPanel games={["genshin"]} editor={ed} />);
    expect(closed).toMatch(/Track · (<!-- -->)?3/);
    expect(closed).not.toContain("Everything running is tracked");
    const open = render(<EditPanel games={["genshin"]} editor={ed} initialAdding="genshin" />);
    expect(open).toContain('aria-label="Track Commissions, resin"');
    expect(open).toContain('aria-label="Track Paimon&#x27;s Bargains"');
    expect(open).toContain('aria-label="Track Spiral Abyss"');
    expect(open).not.toContain('aria-label="Track Weekly Bosses"');
  });

  test("a game with only standing items still gets its group", () => {
    const html = render(
      <EditPanel games={["genshin", "hsr"]} editor={editor({ inStrip: [], addable: [], standing: [chore] })} />,
    );
    expect(html).toContain("Genshin Impact");
    expect(html).not.toContain("Honkai: Star Rail");
  });
});

describe("the strip with an editor", () => {
  const AT = "2026-10-01T00:00:00.000Z";
  const weekly: Task = {
    id: "mytask:aaaaaa1111", game: "zzz", title: "Activity points",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 2100, unit: "points" }, at: AT, updatedAt: AT,
  };
  const status: GoalStatus = {
    scope: "week", measure: "amount", periodStart: "2026-10-12", required: 2100, count: 0,
    met: false, needed: 2100, open: 5, shortfall: false,
  };

  test("offers Edit beside Catch up", () => {
    const html = render(
      <Dailies games={["genshin"]} events={[]} region="europe" now={NOW} showChores
        daysFor={() => []} onToggleDay={() => {}} edit={editor()} />,
    );
    expect(html).toContain("Catch up");
    expect(html).toMatch(/>Edit</);
  });

  test("weekly and monthly tasks sit in their own row under today's", () => {
    const html = render(
      <Dailies games={["zzz"]} events={[]} region="europe" now={NOW} showChores
        daysFor={() => []} onToggleDay={() => {}} tasks={[weekly]}
        taskStatusFor={() => status} onSetAmount={() => {}} amountFor={() => undefined} />,
    );
    // The heading names the periods the row holds: only a week here.
    const heading = html.indexOf(">This week<");
    expect(heading).toBeGreaterThan(-1);
    expect(html.indexOf("ZZZ")).toBeLessThan(heading);
    expect(html.indexOf("Activity points")).toBeGreaterThan(heading);
  });

  test("without weekly or monthly things there is no second row", () => {
    const html = render(
      <Dailies games={["zzz"]} events={[]} region="europe" now={NOW} showChores
        daysFor={() => []} onToggleDay={() => {}} />,
    );
    expect(html).not.toContain(">This week");
  });

  test("an empty strip still offers a way to add an event", () => {
    const html = render(
      <Dailies games={["genshin"]} events={[]} region="europe" now={NOW} showChores={false}
        daysFor={() => []} onToggleDay={() => {}} edit={editor({ inStrip: [] })} />,
    );
    expect(html).toMatch(/>Edit</);
  });

  test("an empty strip with nothing to add stays away, as it did before", () => {
    const html = render(
      <Dailies games={["genshin"]} events={[]} region="europe" now={NOW} showChores={false}
        daysFor={() => []} onToggleDay={() => {}}
        edit={editor({ inStrip: [], addable: [], shown: { chores: false, weekly: true, monthly: true, cycle: true } })} />,
    );
    expect(html).toBe("");
  });
});
