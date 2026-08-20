import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Controls } from "../src/client/components/Controls.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import { metaFor } from "../src/shared/games.ts";
import type { Prefs } from "../src/client/state/usePrefs.ts";

/**
 * The settings panel: its view filters, its group summaries, its game order.
 *
 * Three rows answer the same question — *what am I allowed to look at?* — and
 * they are the only place two of them can be reached from, so what they are
 * bound to is worth pinning. A checkbox wired to the wrong preference is
 * invisible in a diff and obvious only to the reader it happens to.
 *
 * The summaries are pinned for a related reason. The groups ship closed, so
 * those lines are the only account a reader gets of how the app is set up
 * without opening anything, and a line that drifts from the control inside it
 * is worse than no line at all.
 */

const PREFS: Prefs = {
  region: "europe",
  hiddenGames: [],
  focusGame: null,
  sort: "ending",
  view: "soon",
  timelineDayWidth: 32,
  timelineGroup: "game",
  showUpcoming: false,
  timelineSplitUpcoming: true,
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

  test("it names both views, because it reaches both", () => {
    // It began as the board's alone. Sitting between two app-wide filters, a
    // row that still said "on the timeline" would understate what a tick does.
    const html = render(PREFS);
    expect(html).toContain("Not started yet");
    expect(html).toContain("timeline");
  });

  test("the split pills say they are the board's alone", () => {
    // Unlike the row above them, these really are one view — the checklist
    // splits unstarted events into a section of their own either way.
    const html = render({ ...PREFS, showUpcoming: true });
    expect(html).toContain("On the timeline.");
  });

  test("it reads its own preference and not a neighbour's", () => {
    // Both neighbours are on and this one is off, so a checkbox bound to the
    // wrong key shows up as the wrong count of ticks.
    const off = checkboxes(render(PREFS));
    const on = checkboxes(render({ ...PREFS, showUpcoming: true }));
    expect(off.filter(Boolean)).toHaveLength(1);
    expect(on.filter(Boolean)).toHaveLength(2);
  });

  test("how unstarted events sit on the board is offered only when they are", () => {
    // A choice about arranging them is unanswerable with none on the board,
    // and a control that changes nothing visible is worse than none.
    expect(render(PREFS)).not.toContain("Mixed in");
    const on = render({ ...PREFS, showUpcoming: true });
    expect(on).toContain("In their own group");
    expect(on).toContain("Mixed in");
  });

  test("it is a pair of answers, not one answer and its absence", () => {
    // "Mixed in" is a different order, not a heading switched off, so both
    // states name themselves and the panel says which is on.
    const split = render({ ...PREFS, showUpcoming: true });
    const mixed = render({
      ...PREFS,
      showUpcoming: true,
      timelineSplitUpcoming: false,
    });
    const pressed = (html: string) =>
      [...html.matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(pressed(split)).toContain("In their own group");
    expect(pressed(mixed)).toContain("Mixed in");
    // And the line under them describes the answer that is actually on.
    expect(mixed).toContain("One deadline order");
    expect(split).not.toContain("One deadline order");
  });

  test("the ignored row appears only once something is ignored", () => {
    // Nothing to restore means nothing to offer — the row would be a filter
    // over an empty set.
    expect(render(PREFS)).not.toContain("I&#x27;m ignoring");
    expect(render(PREFS, 3)).toContain("Show the 3 events I&#x27;m");
  });
});

describe("Controls: what a closed group says", () => {
  /**
   * The summaries are the whole reason collapsing the panel is not a regression.
   * A group that shows only its name turns "what is my region set to?" into a
   * click, so each one has to answer its own question from `prefs` — and being
   * derived rather than stored is what stops them disagreeing with the controls
   * inside.
   */
  const summaries = (html: string): string[] =>
    [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/g)].map((m) =>
      (m[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );

  /**
   * One group's line, found by its name rather than its position.
   *
   * These used to be indexed, which meant splitting one group in two moved
   * every assertion below it onto a neighbour — and a test that fails because
   * the panel gained a group says nothing about the line it was written for.
   */
  const line = (html: string, name: string): string =>
    summaries(html).find((l) => l.startsWith(`${name} `)) ?? "";

  test("every group is named, and states where it stands", () => {
    const lines = summaries(render(PREFS));
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("Games 2 of 2 on · A–Z");
    expect(lines[5]).toBe("Your progress Backup to a file");
    expect(line(render(PREFS), "Your own games and events")).toBe(
      "Your own games and events none yet",
    );
  });

  test("the region and the theme are two questions, not one line", () => {
    // They were one group called "Reading", summarising as "Europe · Dark" —
    // two unrelated answers joined by a dot, under a name that described
    // neither. The region is the one setting here that can make a countdown
    // wrong, so it gets its own line rather than sharing a word for the theme.
    const lines = summaries(render(PREFS));
    expect(lines).not.toContain("Reading Europe · Dark");
    expect(line(render(PREFS), "Server region")).toBe("Server region Europe");
    expect(line(render(PREFS), "Appearance")).toBe("Appearance Dark");
    expect(line(render({ ...PREFS, theme: "system" }), "Appearance")).toBe(
      "Appearance System",
    );
  });

  test("the games line counts what is on, and whose order it is in", () => {
    const some = render({ ...PREFS, hiddenGames: ["hsr"], gameOrder: ["hsr", "genshin"] });
    expect(line(some, "Games")).toBe("Games 1 of 2 on · your order");
  });

  test("the visibility line names the additions, not the switches", () => {
    // The app's answer is what expires next; each of these puts something else
    // alongside it, so that is how the line reads.
    expect(line(render({ ...PREFS, showCompleted: false }), "What you see")).toBe(
      "What you see live deadlines only",
    );
    expect(line(render({ ...PREFS, showUpcoming: true }), "What you see")).toBe(
      "What you see plus finished, not started",
    );
  });

  test("ignored counts in the line only once it is actually revealed", () => {
    // `showIgnored` with nothing ignored is a filter over an empty set, and the
    // row itself is not even offered — so the summary must not claim it either.
    expect(line(render({ ...PREFS, showIgnored: true }, 0), "What you see")).toBe(
      "What you see plus finished",
    );
    expect(line(render({ ...PREFS, showIgnored: true }, 3), "What you see")).toBe(
      "What you see plus finished, ignored",
    );
  });

  test("dropping a repeated eyebrow does not drop the accessible name", () => {
    // The region and theme pills sit in groups whose summaries already ask the
    // question, so the eyebrow above them would only say it twice and is gone.
    // `aria-label` is the half that has to survive that: without it a screen
    // reader reads six unlabelled buttons in a row with nothing saying which
    // question either half answers.
    const html = render(PREFS);
    expect(html).toContain('aria-label="Server region"');
    expect(html).toContain('aria-label="Appearance"');
    // Twice and no more: the summary a reader sees, and the label a screen
    // reader hears. A third copy is the eyebrow coming back.
    expect([...html.matchAll(/Server region/g)]).toHaveLength(2);
  });

  test("the panel has a heading of its own", () => {
    // It used to begin with an unannounced wall of controls, which reads as more
    // of the page rather than as the place settings live.
    expect(render(PREFS)).toContain("Settings");
  });
});

describe("Controls: the game order editor", () => {
  const html = () => render(PREFS);

  test("both affordances ship, because touch fires no drag events", () => {
    // The arrows are the mechanism and the handle is the pointer fast path. A
    // drag-only list is unreachable on a phone and by keyboard alike.
    expect(html()).toContain("draggable");
    expect(html()).toContain('aria-label="Move Genshin Impact up (1 of 2)"');
    expect(html()).toContain('aria-label="Move Honkai: Star Rail down (2 of 2)"');
  });

  test("an arrow at the end is disabled, not missing", () => {
    // A control that disappears on the first row slides the other one under the
    // finger aiming at it.
    const markup = html();
    // The whole tag: `disabled` is serialised before `aria-label`.
    const tag = (label: string) =>
      new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(markup)?.[0] ?? "";
    expect(tag("Move Genshin Impact up \\(1 of 2\\)")).toContain("disabled");
    expect(tag("Move Genshin Impact down \\(1 of 2\\)")).not.toContain("disabled");
    expect(tag("Move Honkai: Star Rail down \\(2 of 2\\)")).toContain("disabled");
  });

  test("the row names the game in full, and still toggles it", () => {
    // Rows have room for the real name where the chips only had `short`.
    expect(html()).toContain("Honkai: Star Rail");
    expect(html()).toContain('aria-pressed="true"');
  });

  test("reset appears only once the reader has an order to reset", () => {
    expect(html()).not.toContain("Reset to A–Z");
    expect(render({ ...PREFS, gameOrder: ["hsr", "genshin"] })).toContain(
      "Reset to A–Z",
    );
  });
});
