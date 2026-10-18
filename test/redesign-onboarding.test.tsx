import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { SetupWizard } from "../src/client/components/redesign/SetupWizard.tsx";
import { ReturningTour } from "../src/client/components/redesign/ReturningTour.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
test("initial preferences follow the Round 6 setup and defer upcoming events to tracking", () => {
  const s = migrateLegacy(
    {},
    [],
    "2026-10-16T12:00:00.000Z",
    () => "account:test",
  );
  const html = render(<SetupWizard state={s} onFinish={async () => {}} />);
  for (const label of [
    "Step 1 of 4",
    "Make it yours",
    "Default game server",
    "Appearance",
    "Colour scheme",
    "Your timezone",
    "Next: choose your games",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("Show events that haven&#x27;t started");
});
import {
  TOUR_DONE,
  TOUR_STEPS,
  tourMode,
  untriedOptions,
} from "../src/client/components/redesign/ReturningTour.tsx";
import { setupReader } from "../src/client/state/reader/onboarding.ts";

const tourProps = {
  looks: { interface: "relaxed", timelineLook: "new" },
  onLook: () => {},
  onStep: () => {},
  onFinish: () => {},
};
test("the tour opens on its first step, with no way to skip it when forced", () => {
  const html = render(
    <ReturningTour {...tourProps} intro="returning" closable={false} />,
  );
  expect(html).toContain("Welcome back");
  expect(html).toContain("going on a short tour");
  expect(html).toContain("1 of " + TOUR_STEPS.length);
  expect(html).not.toContain("Skip");
  expect(html).not.toContain("Close tour");
  expect(html).not.toContain("Keep browsing");
});
test("a new reader is welcomed, and a replay can be closed", () => {
  expect(
    render(<ReturningTour {...tourProps} intro="new" closable={false} />),
  ).toContain("Welcome to Event Clock");
  const replay = render(<ReturningTour {...tourProps} closable />);
  expect(replay).toContain("Close tour");
  expect(replay).not.toContain("Welcome");
});
test("the tour lets the reader try both layouts and both Timeline looks", () => {
  const choices = TOUR_STEPS.filter((s) => s.choice).map((s) => [
    s.stop,
    s.choice,
  ]);
  expect(choices).toEqual([
    ["soon", "interface"],
    ["timeline", "timelineLook"],
  ]);
});
test("a choice holds Continue until both options have been tried", () => {
  expect(
    untriedOptions("interface", ["structured"]).map((o) => o.label),
  ).toEqual(["Relaxed"]);
  expect(untriedOptions("interface", ["structured", "relaxed"])).toEqual([]);
  expect(untriedOptions("timelineLook", []).map((o) => o.value)).toEqual([
    "new",
    "classic",
  ]);
});
test("the tour opens on a dimmed welcome, then highlights each step", () => {
  expect(TOUR_STEPS[0]!.target).toBeUndefined();
  for (const step of TOUR_STEPS.slice(1)) expect(step.target).toBeTruthy();
  expect(TOUR_STEPS.find((s) => s.stop === "routines")!.target).toBe(
    '[data-page="routines"]',
  );
});
test("the tour follows the owner's order, walking the way to the codes", () => {
  expect(TOUR_STEPS.map((s) => s.stop)).toEqual([
    "soon",
    "soon",
    "soon",
    "timeline",
    "routines",
    "archive",
    "settings",
    "codes-game",
    "codes-tab",
    "codes",
    "replay",
  ]);
});
test("the tour introduces the Timeline right after the Checklist, and codes", () => {
  const stops = TOUR_STEPS.map((s) => s.stop);
  expect(stops.indexOf("timeline")).toBe(stops.lastIndexOf("soon") + 1);
  expect(stops).toContain("codes");
});
test("everyone takes this tour once, including readers who saw the last one", () => {
  expect(tourMode(TOUR_DONE)).toBe("done");
  for (const seen of [undefined, null, "2026-10-redesign", 7])
    expect(tourMode(seen)).toBe("unseen");
  expect(tourMode("new")).toBe("new");
  expect(tourMode("returning")).toBe("returning");
  expect(tourMode("replay")).toBe("replay");
});
test("finishing setup sends a new reader into the forced tour", () => {
  const s = migrateLegacy({}, [], "2026-10-16T12:00:00.000Z", () => "a");
  const next = setupReader(
    {
      region: "europe",
      interface: "structured",
      theme: "dark",
      scheme: "default",
      timezone: null,
      showUpcoming: true,
      view: "soon",
      games: [],
      tracking: {},
    },
    s,
    "2026-10-16T12:00:00.000Z",
    () => "account:b",
  );
  expect(tourMode(next.prefs.redesignTourSeen)).toBe("new");
  expect(next.prefs.interface).toBe("structured");
});
