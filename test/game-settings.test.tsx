import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { GameSettings } from "../src/client/components/redesign/GameSettings.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
test("game settings explains simultaneous server tracking and credits zero-event sources", () => {
  const at = "2026-10-16T12:00:00.000Z",
    state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const html = render(
    <GameSettings
      state={state}
      initialGame="genshin"
      sources={[
        {
          sourceId: "genshin-extra",
          game: "genshin",
          url: "https://example.com/events",
          lastSuccessAt: null,
          lastConfirmedAt: null,
          contentChangedAt: null,
          eventCount: 0,
          parsedCount: null,
          statesNoEvents: false,
        },
      ]}
      onAction={async () => ({ ok: true })}
    />,
  );
  expect(html).toContain("track both accounts separately");
  expect(html).toContain("Track another server");
  expect(html).toContain("Automatic");
  expect(html).toContain("Reset to default");
  // Tracking choices save on click; there is no separate apply step.
  expect(html).not.toContain("Apply tracking choices");
  // A kind with no built-in routine is explained and still selectable.
  expect(html).toContain("none built in");
  expect(html).not.toMatch(/<button[^>]*disabled[^>]*data-st/);
});

import { AppearancePage } from "../src/client/components/redesign/AppearancePage.tsx";
test("Appearance orders only the games being tracked, with up and down buttons", () => {
  const at = "2026-10-16T12:00:00.000Z",
    state = migrateLegacy(
      {},
      ["genshin", "hsr", "zzz"],
      at,
      (() => {
        let n = 0;
        return () => `account:${++n}`;
      })(),
    );
  state.prefs.hiddenGames = ["zzz"];
  const html = render(
    <AppearancePage state={state} onAction={async () => ({ ok: true })} />,
  );
  expect(html).toContain("Game order");
  expect(html).toContain("Move Genshin Impact down");
  expect(html).toContain("Move Honkai: Star Rail up");
  expect(html).not.toContain("Move Zenless Zone Zero");
  expect(html).not.toContain("Sort A–Z");
});

test("game settings shows the tab the parent holds, so switching games keeps it", () => {
  const at = "2026-10-16T12:00:00.000Z",
    ids = ["account:one", "account:two"],
    state = migrateLegacy({}, ["genshin", "zzz"], at, () => ids.shift()!);
  const html = (game: string) =>
    render(
      <GameSettings
        state={state}
        initialGame={game}
        tab="codes"
        onTab={() => {}}
        sources={[]}
        onAction={async () => ({ ok: true })}
      />,
    );
  for (const game of ["genshin", "zzz"]) {
    expect(html(game)).toContain('data-tab="codes" aria-pressed="true"');
    expect(html(game)).toContain("Redeem codes");
  }
});

import { DisplayTimeContext, formatInZone } from "../src/client/state/displayTime.ts";
// Spec 2026-10-22: a game's version timer sits on its About tab.
const about = (game: string, at: string, tab: "about" | "setup" = "about") =>
  render(
    <DisplayTimeContext.Provider value="UTC">
      <GameSettings
        state={migrateLegacy({}, [game], at, () => "account:one")}
        initialGame={game}
        sources={[]}
        onAction={async () => ({ ok: true })}
        now={Date.parse(at)}
        tab={tab}
      />
    </DisplayTimeContext.Provider>,
  );
test("a game's About tab shows its version, when it ends and where that comes from", () => {
  const html = about("wuwa", "2026-10-22T14:30:00.000Z");
  expect(html).toContain("Version 3.7");
  expect(html).toContain(`ends ${formatInZone("2026-11-11T10:30:00Z", true, "UTC")} (in 19d 20h)`);
  expect(html).toContain('href="https://allthings.how/wuthering-waves-3-7-banners-schedule-hsin-and-suoming-release-dates/"');
  expect(html).toContain("Confirmed in game, 2026-10-22.");
});
test("past the recorded end, the About tab gives the next version and an estimate", () => {
  const html = about("wuwa", "2026-11-12T00:00:00.000Z");
  expect(html).toContain("Version 3.8");
  expect(html).toContain(`next version expected ~${formatInZone("2026-12-23T10:30:00Z", false, "UTC")} (estimate)`);
});
test("a game with no version table has no version row", () => {
  expect(about("genshin", "2026-10-22T14:30:00.000Z")).not.toContain("Version ");
});
test("a routine that resets with the version is offered with the cycles", () => {
  // Spec 2026-10-22, decision 10: Tower of Adversity and the three shop lines
  // (this count has always included the standard line).
  const html = about("wuwa", "2026-10-22T14:30:00.000Z", "setup");
  expect(html).toMatch(/Weeklies &amp; monthlies<\/span><span class="ls">[^<]*<\/span><span class="ls">3 built in/);
  expect(html).toMatch(/Cycles<\/span><span class="ls">[^<]*<\/span><span class="ls">4 built in/);
});
