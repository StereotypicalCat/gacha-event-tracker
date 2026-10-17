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
test("returning readers can browse immediately without restarting setup", () => {
  const html = render(<ReturningTour onStep={() => {}} onFinish={() => {}} />);
  expect(html).toContain("Your games, routines and progress are all still here");
  expect(html).toContain("Keep browsing");
  expect(html).toContain("Take the quick tour");
});

import { TOUR_STEPS } from "../src/client/components/redesign/ReturningTour.tsx";
test("the tour introduces the Timeline right after the Checklist, and codes", () => {
  const stops = TOUR_STEPS.map((s) => s.stop);
  expect(stops.indexOf("timeline")).toBe(stops.indexOf("soon") + 1);
  expect(stops).toContain("codes");
});
