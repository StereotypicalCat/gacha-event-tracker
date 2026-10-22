import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  RoutineDrawer,
  scheduleWords,
  sourceLabel,
} from "../src/client/components/redesign/RoutineDrawer.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { createAccount } from "../src/client/state/reader/accounts.ts";

const at = "2026-10-16T12:00:00.000Z";
const drawer = (
  pane: "library" | "create",
  state = migrateLegacy({}, ["genshin"], at, () => "account:one"),
) =>
  render(
    <RoutineDrawer
      state={state}
      now={Date.parse(at)}
      pane={pane}
      editing={null}
      onPane={() => {}}
      onClose={() => {}}
      onAction={async () => ({ ok: true })}
      onSave={async () => true}
    />,
  );

test("schedule lines read like the mockup", () => {
  expect(scheduleWords({ unit: "week", startsOn: 1 }, 4)).toBe(
    "Every Monday at 04:00",
  );
  expect(scheduleWords({ unit: "month", startsOn: 16 }, 4)).toBe(
    "Every month on the 16th at 04:00",
  );
  expect(scheduleWords({ unit: "day" }, 20)).toBe("Every day at 20:00");
  expect(
    sourceLabel("https://genshin-impact.fandom.com/wiki/Weekly_Boss"),
  ).toBe("Community wiki");
});

test("the library is a shelf of built-ins with bulk follows and dated sources", () => {
  const html = drawer("library");
  expect(html).toContain('class="routine-drawer"');
  expect(html).toContain("Create your own routine");
  expect(html).toContain("New follows also show in");
  expect(html).toContain("Follow all weeklies");
  expect(html).toContain("Every Monday at 04:00 · 3 runs · Community wiki");
  expect(html).toContain(">Follow<");
});

test("a game on two servers gets one follow button per server", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.accounts["account:asia"] = createAccount(
    "genshin",
    "asia",
    at,
    "account:asia",
  );
  s.data["account:asia"] = {
    progress: {},
    ignored: {},
    daily: {},
    amounts: {},
  };
  const html = drawer("library", s);
  expect(html).toContain(">EU<");
  expect(html).toContain(">Asia<");
  expect(html).toContain("2 servers");
});

test("the create shelf asks every mockup question and previews the result", () => {
  const html = drawer("create");
  for (const label of [
    "Start from an example",
    "What is it",
    "Repeats",
    "Every day",
    "Resets at",
    "Another hour",
    "Done when",
    "Note",
    "Link",
    "Also show in",
    "Preview",
    "Create and follow",
  ])
    expect(html).toContain(label);
  expect(html).toContain("Still needed: a name.");
});

test("a built-in that resets with the version says when, from the version table", () => {
  // Spec 2026-10-22: the drawer's period line is the version caption.
  const html = drawer("library", migrateLegacy({}, ["wuwa"], at, () => "account:one"));
  expect(html).toContain("Oscillated Coral: Radiant Tide");
  expect(html).toContain("Resets with 3.8 · 11 Nov");
});
