import { useCallback, useEffect, useState } from "react";
import { isCustomGameId, type LaneId } from "../../shared/custom.ts";
import type { Region } from "../../shared/schema.ts";
import { guessRegion } from "../../shared/time.ts";
import type { SortMode } from "./sort.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";
import type { TimelineGroup } from "./lanes.ts";
import { DEFAULT_THEME_CHOICE, type ThemeChoice } from "./theme.ts";
import { DEFAULT_DAY_WIDTH, snapDayWidth } from "./zoom.ts";
import { ENTRIES, newestId } from "../../shared/changelog.ts";
import { setFor, shownFor, type PerGame } from "../../shared/perGame.ts";
import { hiddenAfter, routinesFor, type Routine } from "../../shared/routines.ts";

/**
 * Which of the two views the reader is looking at.
 *
 * Lives here rather than in `App` because it is the reader's answer to "how do
 * I read this?", and component state loses it on every reload — a reader who
 * prefers the timeline was being put back on the list each time they opened the
 * page, with nothing to blame but the app forgetting.
 */
export type View = "soon" | "timeline";

export interface Prefs {
  interface?: "relaxed" | "structured";
  density?: "standard" | "compact";
  region: Region;
  /**
   * Games the reader has switched off.
   *
   * Still stored as the inverse, but no longer because a new game should
   * appear by default — see `knownGames`, which is what decides that now. It
   * stays the inverse because it is what every existing device has written
   * down, and rewriting a live key space to say the same thing differently
   * costs a migration and buys nothing.
   */
  hiddenGames: LaneId[];
  /**
   * Every lane this reader has been offered.
   *
   * A game we add is a game they never asked for. Turning eleven lanes into
   * fourteen under someone who plays two is not a feature arriving, it is
   * their calendar filling with events they will never open — so a lane that
   * is new *to them* arrives switched off, and the games chips in settings are
   * where they take it up.
   *
   * Absent means "never recorded", which is not the same as "has been offered
   * nothing": every existing reader is in that state, and seeding it from
   * what is on screen is what stops this from switching their games off the
   * first time they load a build that has it. Their own games (`mygame:`) are
   * recorded here too but never auto-hidden — they asked for those by typing
   * them in.
   */
  knownGames?: LaneId[];
  /**
   * The order the reader put their games in.
   *
   * Absent means they have never placed one — not that they have no order, and
   * not an empty order. Every install predating this is in that state, so the
   * fallback has to be a rule rather than a stored value: `orderGames` sorts
   * alphabetically by name, which is what the first-run picker already does.
   * A game added later trails everything they placed by hand.
   *
   * `| undefined` is explicit because `exactOptionalPropertyTypes` is on and
   * "Reset to A–Z" is a patch that writes the field away — `{ gameOrder:
   * undefined }` has to be assignable for the reset to typecheck, and
   * `JSON.stringify` drops it on the way to storage.
   *
   * Not a key space and not a migration: one more field in the single `prefs`
   * blob, like `timelineGroup`. It rides the export for free. Standard
   * progress import restores progress, dailies, ignores and the reader's own
   * games — leaving local prefs intact — while "Import all" restores preferences
   * alongside them, bringing game order, region, theme and active games back
   * when migrating hosts.
   */
  gameOrder?: LaneId[] | undefined;
  /**
   * One game to look at right now, or null for all of them.
   *
   * A lens, not a setting: it never changes `hiddenGames`, and a focus on a
   * game that is switched off or has left the feed is ignored rather than
   * obeyed (`resolveFocus`), so it can never leave the reader on a blank page
   * with no visible cause.
   */
  focusGame: LaneId | null;
  /** How the list is ordered. Deadline order is the default and the fallback. */
  sort: SortMode;
  /**
   * The view they were last reading. The list is the default: the page's whole
   * claim is answering "what expires next" in one look, and the timeline
   * answers "when is everything" — a slower question. One tap moves between
   * them and the choice is remembered from then on.
   */
  view: View;
  /**
   * How wide one day is on the timeline, in px.
   *
   * Stored as the measurement rather than a step number, so the ladder in
   * `state/zoom.ts` can change without silently rescaling boards that were set
   * before it did. Read through `snapDayWidth`, which is what makes a value
   * from an older export — or a corrupted one — land on something renderable.
   */
  timelineDayWidth: number;
  /**
   * How the timeline stacks its bars: a lane per game, or every game together
   * in deadline order.
   *
   * Remembered for the same reason `view` and `timelineDayWidth` are — it is
   * the reader's answer to "how do I read this?", and a board that went back to
   * lanes on every reload would make them say it again each time.
   *
   * Defaults to `"game"`, which is the board every existing reader already has.
   * A stored pref wins, so shipping this moves nobody's view.
   */
  timelineGroup: TimelineGroup;
  /**
   * Whether events that have not started yet are shown at all — the board
   * plots them, and the checklist keeps its "Not started yet" section.
   *
   * Off by default, and that is a claim about what this app is for: it answers
   * *what expires next*, and a reader with fourteen lanes has a next patch
   * queued behind every one of them. On the board it is also structural, since
   * the window is drawn from what is plotted — showing the future pushes the
   * right edge weeks past today and shrinks every running bar to make room.
   *
   * It sits with `showCompleted` and `showIgnored` because it is the same
   * question: what is the reader allowed to look at. It was called
   * `timelineUpcoming` while it governed only the board — see `adoptRenamed`,
   * which carries a reader's stored answer across rather than resetting it.
   */
  showUpcoming: boolean;
  /**
   * Whether those unstarted events keep to their own block on the board, under
   * a "Not started yet" heading, or sit in one deadline order with everything
   * else.
   *
   * Two readings of the same board, and both are right for somebody. Split
   * answers "what is on now, and what is queued behind it" — the shape of a
   * patch. Mixed answers "what runs out first", full stop, which is the
   * question a Gantt chart is for: an event opening on Friday and closing on
   * Sunday is a nearer deadline than one running now until October, and the
   * split order can never show that.
   *
   * The board only: the checklist splits them structurally, into a section with
   * a heading of its own, and always has.
   *
   * Defaults to `true`, the board as it was before this existed. Only read when
   * `showUpcoming` is on — with nothing unstarted plotted there is no block to
   * keep apart — but stored either way, so switching the parent back on
   * restores the answer they gave rather than a default.
   */
  timelineSplitUpcoming: boolean;
  /**
   * Whether to guess which events repeat daily from what the source printed.
   * Off leaves only the ones the reader marked themselves; it never discards a
   * mark or a logged day, so it is reversible.
   *
   * Off by default: the guess reads source wording and is wrong in both
   * directions, so a reader starts with only the dailies they chose. Readers
   * who already switched it on keep it — stored prefs win over this default.
   */
  detectDaily: boolean;
  /**
   * Whether Today's dailies carries each game's standing chore — commissions,
   * sanity, daily training.
   *
   * On by default, because every reader has these today and a setting that
   * silently removes something on upgrade is worse than one nobody notices.
   * Off hides only the chores: an event with a checklist is something the
   * reader engaged with and stays either way. Like `detectDaily` it discards
   * nothing — the ticks live under `dailies:<game>` and are never written from
   * here, so switching back on restores every one of them.
   */
  showChores: boolean;
  /**
   * Games whose chore differs from `showChores` — shown although it is off, or
   * hidden although it is on (`src/shared/perGame.ts`). Absent means none, so
   * every install from before these existed reads exactly as it did.
   */
  choresOn?: LaneId[] | undefined;
  choresOff?: LaneId[] | undefined;
  /**
   * Whether weekly tasks — the reader's own and any built-ins they turned on —
   * sit in the strip's row under the dailies. `showMonthlyTasks` is the same
   * for monthly ones.
   *
   * On by default, for `showChores`' reason: a reader who set tasks up before
   * these existed must not find them gone. Off hides only tasks — an event with
   * a goal is something the reader engaged with and stays either way — and,
   * like the chores, it discards nothing: ticks and numbers keep their keys.
   */
  showWeeklyTasks: boolean;
  showMonthlyTasks: boolean;
  /** The same for tasks that repeat every N days (`period.ts`), on by default likewise. */
  showCycleTasks: boolean;
  showCompleted: boolean;
  /** Reveal events the reader has ignored, so they can be restored. */
  showIgnored: boolean;
  /**
   * Which ground the app is drawn on: `dark`, `light`, or `system` to follow
   * the device.
   *
   * Dark is the default and not a placeholder — see `DEFAULT_THEME_CHOICE`. The
   * value only decides colour: nothing about what is shown, sorted, counted or
   * stored changes with it, which is why it can be flipped mid-read with
   * nothing to save.
   */
  theme: ThemeChoice;
  /** False until the reader confirms or changes the guessed region. */
  regionConfirmed: boolean;
  /** False until the reader has picked their games on first run. */
  onboarded: boolean;
  /**
   * The global answer for built-in weekly tasks (routines.ts, PRD F17). Absent
   * means *never answered*, read as off — built-ins are opt-in — and is what
   * lets the strip still ask about one game at a time.
   */
  showRoutines?: boolean | undefined;
  /**
   * Games whose built-in weekly tasks the reader turned on — the on-exceptions
   * to `showRoutines`, and the same list it was before the global answer
   * existed, so nothing was migrated. Absent means none: built-ins are opt-in,
   * so an install from before they existed gets none rather than all.
   */
  routineGames?: LaneId[] | undefined;
  /** Games whose built-ins stay off although `showRoutines` is on. */
  routinesOff?: LaneId[] | undefined;
  /** Games already asked "track its weekly tasks?", so the question is asked once. */
  routinesAsked?: LaneId[] | undefined;
  /**
   * Built-ins the reader stopped tracking one at a time, by `routine:` id —
   * Endfield's weekly items but not its Stock Redistribution. Narrows the game
   * rule above and never widens it; absent means none, and their ticks and
   * numbers stay stored under the id.
   */
  routinesHidden?: string[] | undefined;
  /**
   * Whether a shop's standard-banner pulls are tracked beside its premium ones
   * (`Routine.pulls`, owner, 2026-10-16). Absent means no — premium only — so
   * an install from before the standard lines existed gains nothing new.
   */
  standardPulls?: boolean | undefined;
  /**
   * The newest changelog entry the reader dismissed (PRD F18). Absent means
   * unrecorded, not "seen nothing": first-run setup sets it, so an absent value
   * is an install from before the changelog, shown the launch window once.
   */
  changelogSeen?: string | undefined;
}

/**
 * What finishing first-run setup writes. A new reader is marked up to date
 * with the changelog: a list of changes means nothing before you've used the
 * thing it changes. They also start with events that have not opened yet
 * shown (owner, 2026-10-13) — set here rather than in `defaults()`, so an
 * install whose stored prefs predate the field keeps today's answer instead of
 * having it switched on underneath them.
 */
export function firstRunPrefs(
  games: readonly LaneId[],
  chosen: readonly LaneId[],
  view: View,
): Partial<Prefs> {
  return {
    onboarded: true,
    hiddenGames: games.filter((g) => !chosen.includes(g)),
    view,
    changelogSeen: newestId(ENTRIES),
    showUpcoming: true,
  };
}

/** Whose standing chore the strip carries. */
export function choreRule(p: Prefs): PerGame {
  return { all: p.showChores, on: p.choresOn, off: p.choresOff };
}

/** Whose built-in weekly tasks are on. An unanswered global switch is off. */
export function routineRule(p: Prefs): PerGame {
  return { all: p.showRoutines ?? false, on: p.routineGames, off: p.routinesOff };
}

/**
 * What tracking one built-in, or stopping, writes (the strip's Edit panel).
 *
 * Stopping hides that one and nothing else. Tracking one whose game is on
 * unhides it. Tracking one whose game is off turns the game on — the same
 * answer the strip's question records — with its siblings hidden, because the
 * reader asked for one item and not the game's whole list.
 */
export function trackRoutinePatch(p: Prefs, routine: Routine, track: boolean): Partial<Prefs> {
  const rule = routineRule(p);
  if (!track || shownFor(rule, routine.game)) {
    return { routinesHidden: hiddenAfter(p.routinesHidden, routine.id, track) };
  }
  const { on, off } = setFor(rule, routine.game, true);
  const siblings = routinesFor(routine.game)
    .map((r) => r.id)
    .filter((id) => id !== routine.id);
  const hidden = [...(p.routinesHidden ?? []).filter((id) => id !== routine.id && !siblings.includes(id)), ...siblings];
  return {
    routineGames: on,
    routinesOff: off,
    routinesAsked: [...(p.routinesAsked ?? []).filter((g) => g !== routine.game), routine.game],
    routinesHidden: hidden.length > 0 ? hidden : undefined,
  };
}

export function defaults(): Prefs {
  return {
    interface: "structured",
    density: "standard",
    region: guessRegion(),
    hiddenGames: [],
    focusGame: null,
    sort: "ending",
    view: "soon",
    timelineDayWidth: DEFAULT_DAY_WIDTH,
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
    theme: DEFAULT_THEME_CHOICE,
    regionConfirmed: false,
    onboarded: false,
  };
}

/**
 * What to record and what to switch off when the set of lanes changes.
 *
 * Pure and separate from the hook because it decides whether a reader's games
 * get switched off, which is the kind of thing that should be provable rather
 * than watched for. Returns `null` when there is nothing to do, so the caller
 * writes to storage only when something actually changed.
 *
 * Two cases it must not get wrong:
 *
 * - **`known` absent.** Every reader who installed before this existed is in
 *   that state, and it means "unrecorded", not "has been offered nothing".
 *   Seeding records what is already on their screen and switches nothing off.
 * - **A lane they invented.** `mygame:` lanes are the reader asking for a game
 *   by typing it in, so they are recorded but never hidden. Only a lane that
 *   arrived because we added a source turns up switched off.
 */
export function adoptNewLanes(
  lanes: readonly LaneId[],
  known: readonly LaneId[] | undefined,
  hidden: readonly LaneId[],
): Partial<Prefs> | null {
  // An empty list is a feed that has not arrived, not a reader with no games.
  if (lanes.length === 0) return null;
  if (known === undefined) return { knownGames: [...lanes] };

  const fresh = lanes.filter((lane) => !known.includes(lane));
  if (fresh.length === 0) return null;

  const unasked = fresh.filter(
    (lane) => !isCustomGameId(lane) && !hidden.includes(lane),
  );
  return {
    knownGames: [...known, ...fresh],
    hiddenGames: [...hidden, ...unasked],
  };
}

/**
 * A stored `prefs` object with the one renamed field carried across.
 *
 * `timelineUpcoming` became `showUpcoming` when it stopped being about the
 * board alone. Dropping the old name would not lose data — this is one blob
 * under one key, not a key space — but it would silently reset the answer of
 * every reader who had switched the future on, and they would have to find the
 * setting again to say a thing they already said.
 *
 * A stored new name always wins, so this can never overwrite a fresher answer
 * with a stale one; and once written back under the new name the old one is
 * simply an unread leftover. Pure and exported so that is a test rather than a
 * claim.
 */
export function adoptRenamed(
  stored: Partial<Prefs> & { timelineUpcoming?: boolean },
): Partial<Prefs> {
  const { timelineUpcoming, ...rest } = stored;
  if (timelineUpcoming === undefined || rest.showUpcoming !== undefined) {
    return rest;
  }
  return { ...rest, showUpcoming: timelineUpcoming };
}

/**
 * Takes incoming preferences (e.g. from an imported backup file) and restores a
 * clean, type-safe Prefs object, falling back to defaults for any missing or
 * invalid values.
 */
export function restorePrefsValue(incoming: unknown): Prefs {
  const base = defaults();
  if (typeof incoming !== "object" || incoming === null) {
    return base;
  }
  const raw = adoptRenamed(incoming as Partial<Prefs> & { timelineUpcoming?: boolean });
  const result: Prefs = {
    ...base,
    ...raw,
  };

  if (result.interface !== "relaxed" && result.interface !== "structured") result.interface = "structured";
  if (result.density !== "standard" && result.density !== "compact") result.density = "standard";

  // Region
  if (result.region !== "america" && result.region !== "europe" && result.region !== "asia") {
    result.region = base.region;
  }

  // Games arrays
  if (!Array.isArray(result.hiddenGames)) {
    result.hiddenGames = base.hiddenGames;
  } else {
    result.hiddenGames = result.hiddenGames.filter((g): g is LaneId => typeof g === "string");
  }

  if (result.knownGames !== undefined) {
    if (!Array.isArray(result.knownGames)) {
      delete result.knownGames;
    } else {
      result.knownGames = result.knownGames.filter((g): g is LaneId => typeof g === "string");
    }
  }

  if (result.gameOrder !== undefined) {
    if (!Array.isArray(result.gameOrder)) {
      result.gameOrder = undefined;
    } else {
      result.gameOrder = result.gameOrder.filter((g): g is LaneId => typeof g === "string");
    }
  }

  if (result.changelogSeen !== undefined && typeof result.changelogSeen !== "string") {
    result.changelogSeen = undefined;
  }

  // Per-game exceptions and built-in tasks: string arrays, or absent.
  for (const key of ["routineGames", "routinesAsked", "routinesOff", "routinesHidden", "choresOn", "choresOff"] as const) {
    const value: unknown = result[key];
    if (value === undefined) continue;
    result[key] = Array.isArray(value)
      ? value.filter((g): g is LaneId => typeof g === "string")
      : undefined;
  }

  if (result.showRoutines !== undefined && typeof result.showRoutines !== "boolean") {
    result.showRoutines = undefined;
  }
  if (result.standardPulls !== undefined && typeof result.standardPulls !== "boolean") {
    result.standardPulls = undefined;
  }

  // focusGame
  if (result.focusGame !== null && typeof result.focusGame !== "string") {
    result.focusGame = null;
  }

  // Sort
  if (result.sort !== "ending" && result.sort !== "doing") {
    result.sort = base.sort;
  }

  // View
  if (result.view !== "soon" && result.view !== "timeline") {
    result.view = base.view;
  }

  // Zoom
  if (typeof result.timelineDayWidth === "number") {
    result.timelineDayWidth = snapDayWidth(result.timelineDayWidth);
  } else {
    result.timelineDayWidth = base.timelineDayWidth;
  }

  // Timeline grouping
  if (result.timelineGroup !== "game" && result.timelineGroup !== "ending") {
    result.timelineGroup = base.timelineGroup;
  }

  // Theme
  if (result.theme !== "dark" && result.theme !== "light" && result.theme !== "system") {
    result.theme = base.theme;
  }

  // Booleans
  result.showUpcoming = typeof result.showUpcoming === "boolean" ? result.showUpcoming : base.showUpcoming;
  result.timelineSplitUpcoming = typeof result.timelineSplitUpcoming === "boolean" ? result.timelineSplitUpcoming : base.timelineSplitUpcoming;
  result.detectDaily = typeof result.detectDaily === "boolean" ? result.detectDaily : base.detectDaily;
  result.showChores = typeof result.showChores === "boolean" ? result.showChores : base.showChores;
  result.showWeeklyTasks = typeof result.showWeeklyTasks === "boolean" ? result.showWeeklyTasks : base.showWeeklyTasks;
  result.showMonthlyTasks = typeof result.showMonthlyTasks === "boolean" ? result.showMonthlyTasks : base.showMonthlyTasks;
  result.showCycleTasks = typeof result.showCycleTasks === "boolean" ? result.showCycleTasks : base.showCycleTasks;
  result.showCompleted = typeof result.showCompleted === "boolean" ? result.showCompleted : base.showCompleted;
  result.showIgnored = typeof result.showIgnored === "boolean" ? result.showIgnored : base.showIgnored;
  result.regionConfirmed = typeof result.regionConfirmed === "boolean" ? result.regionConfirmed : base.regionConfirmed;
  result.onboarded = typeof result.onboarded === "boolean" ? result.onboarded : base.onboarded;

  return result;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    ...defaults(),
    ...adoptRenamed(readJson<Partial<Prefs>>(KEYS.prefs, {})),
  }));

  useEffect(() => {
    writeJson(KEYS.prefs, prefs);
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const restorePrefs = useCallback((incoming: unknown) => {
    setPrefs(restorePrefsValue(incoming));
  }, []);

  const toggleGame = useCallback((game: LaneId) => {
    setPrefs((prev) => ({
      ...prev,
      hiddenGames: prev.hiddenGames.includes(game)
        ? prev.hiddenGames.filter((g) => g !== game)
        : [...prev.hiddenGames, game],
    }));
  }, []);

  return { prefs, update, toggleGame, restorePrefs };
}

