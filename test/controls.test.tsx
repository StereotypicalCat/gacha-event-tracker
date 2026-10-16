import { describe, expect, test } from "bun:test";
import type { Task } from "../src/shared/task.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { Controls, ownState, PerGameChips } from "../src/client/components/Controls.tsx";
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
  showChores: true,
  showWeeklyTasks: true,
  showMonthlyTasks: true,
  showCycleTasks: true,
  showCompleted: true,
  showIgnored: false,
  theme: "dark",
  regionConfirmed: true,
  onboarded: true,
};

function render(
  prefs: Prefs,
  ignoredCount = 0,
  games = ["genshin", "hsr"],
  tasks?: Task[],
): string {
  return renderToStaticMarkup(
    <GameMetaProvider value={(id) => metaFor(id, {})}>
      <Controls
        games={games}
        prefs={prefs}
        onToggleGame={() => {}}
        onUpdate={() => {}}
        ignoredCount={ignoredCount}
        onExport={() => {}}
        onImport={() => {}}
        onExportAll={() => {}}
        onImportAll={() => {}}
        own={{
          games: {},
          events: {},
          lanes: ["genshin", "hsr"],
          now: 0,
          onOpen: () => {},
          onAddGame: () => {},
          onEditGame: () => {},
          onRemoveGame: () => ({ removed: true, blockedBy: 0 }),
          onAddEvent: () => {},
          ...(tasks === undefined ? {} : { tasks }),
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
    // wrong key shows up as the wrong count of ticks. The chores toggle is a
    // third box that is on in both renders — it defaults on — so it raises
    // each count by one without changing what the delta proves.
    const off = checkboxes(render(PREFS));
    const on = checkboxes(render({ ...PREFS, showUpcoming: true }));
    expect(off.filter(Boolean)).toHaveLength(2);
    expect(on.filter(Boolean)).toHaveLength(3);
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

describe("the chores checkbox reports its own pref", () => {
  test("off, one fewer box is ticked", () => {
    // Counting alone can no longer separate the two always-on boxes from each
    // other — with `showCompleted` also true, a checkbox bound to the wrong one
    // of them keeps the same total. Flipping this pref specifically is what
    // distinguishes them.
    const on = checkboxes(render(PREFS)).filter(Boolean).length;
    const off = checkboxes(render({ ...PREFS, showChores: false })).filter(Boolean).length;
    expect(off).toBe(on - 1);
  });
});

describe("Controls: backup and export actions", () => {
  test("renders all four export and import buttons", () => {
    const markup = render(PREFS);
    expect(markup).toContain("Export</button>");
    expect(markup).toContain("Import<input");
    expect(markup).toContain("Export all</button>");
    expect(markup).toContain("Import all<input");
    expect(markup).toContain("when moving hosts");
  });
});


describe("Controls: built-in weekly and monthly tasks", () => {
  test("one global switch, not a checkbox per game", () => {
    const html = render(PREFS, 0, ["genshin", "zzz", "endfield"]);
    expect(html).toContain("Show built-in weekly and monthly tasks");
    expect(html).not.toContain("Built-in weekly tasks for");
  });

  test("it reads showRoutines, and an unanswered one is off", () => {
    const games = ["genshin", "zzz"];
    const box = (html: string) =>
      html.match(/<input type="checkbox"[^>]*>(?=[^<]*<span>Show built-in weekly and monthly tasks)/)?.[0];
    expect(box(render(PREFS, 0, games))).not.toContain('checked=""');
    expect(box(render({ ...PREFS, showRoutines: true }, 0, games))).toContain('checked=""');
  });

  test("a reader who said yes to one game before is told so", () => {
    const html = render({ ...PREFS, routineGames: ["zzz"] }, 0, ["genshin", "zzz", "endfield"]);
    expect(html).toContain("Only Zenless Zone Zero");
  });

  test("no switch when no game on the list has any", () => {
    // Arknights and Blue Archive have none.
    expect(render(PREFS, 0, ["arknights", "ba"])).not.toContain("built-in weekly and monthly tasks");
  });
});

describe("Controls: daily chores per game", () => {
  test("the line under the switch states the exceptions", () => {
    expect(render(PREFS)).toContain("Every game");
    expect(render({ ...PREFS, choresOff: ["hsr"] })).toContain("All but Honkai: Star Rail");
    expect(render({ ...PREFS, showChores: false, choresOn: ["genshin", "hsr"] })).toContain("Only 2 games");
  });

  test("the games are behind Choose games, closed until asked for", () => {
    const html = render(PREFS);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Choose games<\/button>/);
    expect(html).not.toContain('aria-label="Daily chores per game"');
  });

  test("a game switched off for the reader is not offered, nor counted", () => {
    // Its chore is not drawn anyway; a chip for it would be a control that does nothing.
    expect(render({ ...PREFS, hiddenGames: ["hsr"], choresOff: ["hsr"] })).toContain("Every game");
  });

  test("each chip says whether that game's are on", () => {
    const html = renderToStaticMarkup(
      <GameMetaProvider value={(id) => metaFor(id, {})}>
        <PerGameChips games={["genshin", "hsr"]} rule={{ all: true, off: ["hsr"] }} label="chores" onSet={() => {}} />
      </GameMetaProvider>,
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Genshin Impact/);
    expect(html).toMatch(/aria-pressed="false"[^>]*><span[^>]*>Honkai: Star Rail/);
  });

  test("an off chip stays readable, in the focus chip's colours", () => {
    // Faint ink was about 2.7:1 on the dark surface — below the bar for a
    // control. The game-focus chip's muted ink and \`.hue-chip\` hover are the house answer.
    const html = renderToStaticMarkup(
      <GameMetaProvider value={(id) => metaFor(id, {})}>
        <PerGameChips games={["hsr"]} rule={{ all: false }} label="chores" onSet={() => {}} />
      </GameMetaProvider>,
    );
    expect(html).toContain("hue-chip");
    expect(html).toContain("color:var(--color-muted)");
    expect(html).not.toContain("color:var(--color-faint)");
  });
});

describe("Controls: the Your own summary counts tasks", () => {
  test("a reader with only tasks is not told they have none", () => {
    expect(ownState(0, 0, 1)).toBe("1 task");
    expect(ownState(1, 2, 0)).toBe("1 game · 2 events");
    expect(ownState(1, 0, 2)).toBe("1 game · 0 events · 2 tasks");
    expect(ownState(0, 0, 0)).toBe("none yet");
  });
});

describe("Controls: standard-banner pulls", () => {
  test("offered beside the built-ins switch, and reads its own pref", () => {
    const off = render({ ...PREFS, routineGames: ["genshin"] });
    expect(off).toContain("Include standard-banner pulls");
    expect(off).toContain("Paimon&#x27;s Bargains: Acquaint Fates");
    const on = render({ ...PREFS, routineGames: ["genshin"], standardPulls: true });
    expect(checkboxes(on).filter(Boolean).length).toBe(checkboxes(off).filter(Boolean).length + 1);
  });

  test("not offered when no game listed has a standard line", () => {
    expect(render({ ...PREFS, routineGames: ["endfield"] }, 0, ["endfield"])).not.toContain(
      "Include standard-banner pulls",
    );
  });
});

describe("Controls: weekly and monthly tasks under the dailies", () => {
  test("built-ins switched on globally count as a weekly task", () => {
    expect(render({ ...PREFS, showRoutines: true }, 0, ["zzz"])).toContain("Show weekly tasks");
    expect(render({ ...PREFS, showRoutines: true, routinesOff: ["zzz"] }, 0, ["zzz"])).not.toContain(
      "Show weekly tasks",
    );
  });

  test("each switch appears once there is a task of its period, and reads its own pref", () => {
    // Endfield's built-ins are weekly; there is no monthly task, so no monthly switch.
    const prefs = { ...PREFS, routineGames: ["endfield"] };
    const on = render(prefs, 0, ["endfield"]);
    expect(on).toContain("Show weekly tasks");
    expect(on).not.toContain("Show monthly tasks");
    const off = render({ ...prefs, showWeeklyTasks: false }, 0, ["endfield"]);
    expect(checkboxes(off).filter(Boolean).length).toBe(checkboxes(on).filter(Boolean).length - 1);
  });

  test("a cycle task brings its own switch, which reads showCycleTasks", () => {
    const AT = "2026-10-01T00:00:00.000Z";
    const shiyu: Task = {
      id: "mytask:dddddd4444", game: "hsr", title: "Shiyu Defense",
      period: { unit: "cycle", days: 14, from: "2026-10-16" }, measure: { kind: "days", required: 1 },
      at: AT, updatedAt: AT,
    };
    const on = render(PREFS, 0, undefined, [shiyu]);
    expect(on).toContain("Show cycle tasks");
    expect(on).not.toContain("Show weekly tasks");
    const off = render({ ...PREFS, showCycleTasks: false }, 0, undefined, [shiyu]);
    expect(checkboxes(off).filter(Boolean).length).toBe(checkboxes(on).filter(Boolean).length - 1);
  });

  test("with no tasks at all, neither switch is offered", () => {
    const html = render(PREFS);
    expect(html).not.toContain("Show weekly tasks");
    expect(html).not.toContain("Show monthly tasks");
    expect(html).not.toContain("Show cycle tasks");
  });
});
