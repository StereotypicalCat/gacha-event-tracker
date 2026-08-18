import { useCallback, useEffect, useState } from "react";
import { isCustomGameId, type LaneId } from "../../shared/custom.ts";
import type { Region } from "../../shared/schema.ts";
import { guessRegion } from "../../shared/time.ts";
import type { SortMode } from "./sort.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";
import type { TimelineGroup } from "./lanes.ts";
import { DEFAULT_THEME_CHOICE, type ThemeChoice } from "./theme.ts";
import { DEFAULT_DAY_WIDTH } from "./zoom.ts";

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
   * Whether to guess which events repeat daily from what the source printed.
   * Off leaves only the ones the reader marked themselves; it never discards a
   * mark or a logged day, so it is reversible.
   *
   * Off by default: the guess reads source wording and is wrong in both
   * directions, so a reader starts with only the dailies they chose. Readers
   * who already switched it on keep it — stored prefs win over this default.
   */
  detectDaily: boolean;
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
}

function defaults(): Prefs {
  return {
    region: guessRegion(),
    hiddenGames: [],
    focusGame: null,
    sort: "ending",
    view: "soon",
    timelineDayWidth: DEFAULT_DAY_WIDTH,
    timelineGroup: "game",
    detectDaily: false,
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

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    ...defaults(),
    ...readJson<Partial<Prefs>>(KEYS.prefs, {}),
  }));

  useEffect(() => {
    writeJson(KEYS.prefs, prefs);
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleGame = useCallback((game: LaneId) => {
    setPrefs((prev) => ({
      ...prev,
      hiddenGames: prev.hiddenGames.includes(game)
        ? prev.hiddenGames.filter((g) => g !== game)
        : [...prev.hiddenGames, game],
    }));
  }, []);

  return { prefs, update, toggleGame };
}
