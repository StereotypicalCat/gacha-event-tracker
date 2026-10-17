import { expect, test } from "bun:test";
import { setupReader } from "../src/client/state/reader/onboarding.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
const at = "2026-10-16T12:00:00.000Z";
test("new-reader setup is events-only and remembers unsupported cycle intent", () => {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const next = setupReader(
    {
      region: "asia",
      interface: "relaxed",
      theme: "dark",
      scheme: "slate",
      timezone: null,
      games: ["genshin"],
      tracking: {
        genshin: {
          events: true,
          dailies: false,
          weeklyMonthly: false,
          cycles: true,
        },
      },
      showUpcoming: false,
      view: "timeline",
    },
    state,
    at,
    () => "account:two",
  );
  const a = next.accounts["account:one"]!;
  expect(a.region).toBe("asia");
  expect(a.intent.cycles).toBe(true);
  expect(a.routines["dailies:genshin"]?.followed).toBe(false);
  expect(next.prefs.onboarded).toBe(true);
  expect(next.prefs.view).toBe("timeline");
  expect(next.prefs.showUpcoming).toBe(false);
});

test("the timeline design is saved only when the reader starts on Timeline", () => {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const draft = {
    region: "europe" as const,
    interface: "structured" as const,
    theme: "dark" as const,
    scheme: "slate",
    timezone: null,
    games: ["genshin"],
    tracking: {},
    showUpcoming: false,
    view: "timeline" as const,
    timelineLook: "classic" as const,
  };
  const mint = () => "account:two";
  expect(setupReader(draft, state, at, mint).prefs.timelineLook).toBe(
    "classic",
  );
  expect(
    setupReader({ ...draft, view: "soon" }, state, at, mint).prefs.timelineLook,
  ).toBeUndefined();
});
