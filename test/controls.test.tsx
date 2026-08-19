import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Controls } from "../src/client/components/Controls.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import type { Prefs } from "../src/client/state/usePrefs.ts";

/**
 * The settings panel's view filters.
 *
 * Three rows answer the same question — *what am I allowed to look at?* — and
 * they are the only place two of them can be reached from, so what they are
 * bound to is worth pinning. A checkbox wired to the wrong preference is
 * invisible in a diff and obvious only to the reader it happens to.
 */

const PREFS: Prefs = {
  region: "europe",
  hiddenGames: [],
  focusGame: null,
  sort: "ending",
  view: "soon",
  timelineDayWidth: 32,
  timelineGroup: "game",
  timelineUpcoming: false,
  detectDaily: false,
  showCompleted: true,
  showIgnored: false,
  theme: "dark",
  regionConfirmed: true,
  onboarded: true,
};

function render(prefs: Prefs, ignoredCount = 0): string {
  return renderToStaticMarkup(
    <GameMetaProvider value={(id) => metaFor(id, {})}>
      <Controls
        games={["genshin", "hsr"]}
        prefs={prefs}
        onToggleGame={() => {}}
        onUpdate={() => {}}
        ignoredCount={ignoredCount}
        onExport={() => {}}
        onImport={() => {}}
        own={{
          games: {},
          events: {},
          lanes: ["genshin", "hsr"],
          onAddGame: () => {},
          onEditGame: () => {},
          onRemoveGame: () => ({ removed: true, blockedBy: 0 }),
          onAddEvent: () => {},
        }}
      />
    </GameMetaProvider>,
  );
}

/** The nth checkbox's `checked` attribute, in document order. */
function checkboxes(html: string): boolean[] {
  return [...html.matchAll(/<input type="checkbox"[^>]*>/g)].map((m) =>
    m[0].includes('checked=""'),
  );
}

describe("Controls: what am I allowed to look at", () => {
  test("the unstarted-events switch is here, in the reader's words", () => {
    // It used to be a pill in the board's own header, next to the stacking and
    // scale controls. Those two reshape what is already on the board; this one
    // decides what is on it at all, which is the question the two rows beside
    // it answer.
    const html = render(PREFS);
    expect(html).toContain("Show events that haven&#x27;t started");
    expect(html).toContain("Show events I&#x27;ve finished");
  });

  test("it says the board is what it applies to", () => {
    // Sitting between two app-wide filters, a row that named no scope would
    // read as a promise about the whole app — and the checklist lists these
    // whatever this says.
    const html = render(PREFS);
    expect(html).toContain("On the timeline");
    expect(html).toContain("Not started yet");
  });

  test("it reads its own preference and not a neighbour's", () => {
    // Both neighbours are on and this one is off, so a checkbox bound to the
    // wrong key shows up as the wrong count of ticks.
    const off = checkboxes(render(PREFS));
    const on = checkboxes(render({ ...PREFS, timelineUpcoming: true }));
    expect(off.filter(Boolean)).toHaveLength(1);
    expect(on.filter(Boolean)).toHaveLength(2);
  });

  test("the ignored row appears only once something is ignored", () => {
    // Nothing to restore means nothing to offer — the row would be a filter
    // over an empty set.
    expect(render(PREFS)).not.toContain("I&#x27;m ignoring");
    expect(render(PREFS, 3)).toContain("Show the 3 events I&#x27;m");
  });
});
