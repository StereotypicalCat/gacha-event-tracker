import { DisplayTimeContext } from "../state/displayTime.ts";
import { useContext, useState } from "react";
import {
  isCustomGameId,
  type CustomEvent,
  type CustomGames,
  type LaneId,
} from "../../shared/custom.ts";
import {
  addUnits,
  cadenceOf,
  comesRoundEarly,
  movesOccurrences,
  PRESET_UNIT,
  repeatModeOf,
  repeatSpanning,
  RepeatUnit,
  type Cadence,
  type Repeat,
  type RepeatMode,
} from "../../shared/recurrence.ts";
import { EventType } from "../../shared/schema.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { readerInstant, type EventDraft } from "../state/useCustom.ts";
import { EVENT_TEMPLATES, type EventTemplate } from "../../shared/templates.ts";
import { ExampleRow, field, pill, StillNeeded } from "./formParts.tsx";

/**
 * Entering a game and an event yourself (PRD F13).
 *
 * The forms deliberately mirror what a parser is allowed to produce rather than
 * what a database column will accept — most of all, **"I don't know" is a
 * first-class answer for the end date.** A form that made the end mandatory
 * would force a reader to invent one, which is the single failure this whole
 * product is built to avoid; it just happens to be the reader inventing it
 * instead of us.
 */

/**
 * Enough hues to tell lanes apart, none of them colliding with a tracked game.
 *
 * Stored raw, as picked. What a light-mode reader sees is a darkened reading of
 * these (`readableHue`), for the same reason the tracked games get one — the
 * palette was struck against the dark ground.
 */
export const CUSTOM_HUES = [
  "#C74B50",
  "#E08A3C",
  "#D9C34A",
  "#5FBF6A",
  "#4FB3C4",
  "#5C7CE0",
  "#9B6FD1",
  "#D46FA8",
];

const TYPES = EventType.options;

/**
 * What a schedule change costs, or null when it costs nothing.
 *
 * Occurrence ids carry their own start day, so moving the anchor or the
 * interval re-keys every occurrence and the marks stored under the old ids stop
 * being reachable. Nothing is rewritten — `removeEvent` makes the same trade,
 * and `useMarkSet.merge` never removes because nothing else holds a copy — but
 * the reader is told the count first, the way `removeGame` reports `blockedBy`
 * instead of cascading.
 *
 * Informs; never blocks.
 */
export function strandedNotice(count: number): string | null {
  if (count <= 0) return null;
  return `Changing the schedule will strand ${count} tick${
    count === 1 ? "" : "s"
  } you've already recorded.`;
}

/** Whether a number opens on a vowel sound when read aloud. */
function takesAn(n: number): boolean {
  // Eight, eleven and eighteen, plus every number in the eighties — which is
  // still inside the 365 ceiling `interval` is capped at, so nothing larger
  // needs considering.
  return n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89);
}

/**
 * How often a rule comes round, in the words the form offered.
 *
 * "Cycle" rather than "every N days", because this sits directly beneath a
 * start and an end — a duration — and a reader who has just been thinking in
 * durations reads "every 26 days" as another one. Naming the shape of the
 * repetition is what separates the two, and "cycle" is the word this genre
 * already uses for it.
 *
 * A cycle of one unit is named rather than numbered: nobody says "a 1-week
 * cycle". A longer one takes the singular unit, because a hyphenated
 * "26-day" is an adjective, not a count.
 */
export function cadenceLabel(repeat: Repeat | null): string | null {
  if (repeat === null) return null;
  if (repeat.interval === 1) {
    const named: Record<RepeatUnit, string> = {
      days: "daily",
      weeks: "weekly",
      months: "monthly",
    };
    return `on a ${named[repeat.unit]} cycle`;
  }
  const article = takesAn(repeat.interval) ? "an" : "a";
  return `on ${article} ${repeat.interval}-${repeat.unit.replace(/s$/, "")} cycle`;
}

/**
 * The `repeat` a save would write, given what the form's own controls state
 * plus whatever `until` the record being edited already carries.
 *
 * The form has no control for `until` — descoped from the control surface
 * during planning, not from the schema — so it is never this function's to
 * set. But a rule reaching the form already carrying one, reachable today
 * only by importing a file that has it, has to keep it: rebuilding `repeat`
 * from the unit and interval fields alone would silently turn a terminating
 * rule eternal on a save as unrelated as a title fix. Exported, and separated
 * from the component's own state wiring, so that survival is provable without
 * a submit nothing in this test suite can click.
 */
export function repeatFrom(
  unit: RepeatUnit | "never",
  interval: number,
  existingUntil: string | null,
): Repeat | null {
  const intervalValid = Number.isInteger(interval) && interval >= 1 && interval <= 365;
  if (unit === "never" || !intervalValid) return null;
  return { unit, interval, until: existingUntil };
}

/**
 * The instant a successor opens if it opens the moment this window closes.
 *
 * `readerInstant` resolves an end the reader gave no time to as 23:59:59 —
 * the last second of the day they named, because that is what "runs until the
 * 8th" means to a person. The next window therefore opens at midnight, one
 * second later, not on that final second. An end they *did* give a time to is
 * an instant they chose, and a successor opens on it exactly.
 *
 * One second is not a fudge factor: it is the exact distance between this
 * form's end-of-day convention and the midnight that follows it. The
 * convention lives here rather than in `recurrence.ts` because this form is
 * what wrote the boundary in the first place.
 */
function contiguousOpening(endsMs: number, endHasTime: boolean): number {
  return endHasTime ? endsMs : endsMs + 1000;
}

/**
 * What to put in the number-and-unit pair when the form opens.
 *
 * Both the delay control and the hand-stated cadence share one pair, because
 * only one of them is ever on screen and carrying the number across when the
 * reader changes their mind is kinder than resetting it to 1.
 *
 * For a rule that already has a gap this recovers the gap itself — the stored
 * interval spans the window *and* the wait, and the reader entered the wait —
 * so reopening shows them the number they typed rather than the one derived
 * from it. A rule with no gap has none to recover and falls back to its own
 * cadence, which is the sensible starting point if they switch to a delay.
 */
function openingControls(
  startsAt: string | null,
  endsAt: string | null,
  endHasTime: boolean,
  rule: Repeat | null,
): { unit: RepeatUnit; amount: number } {
  if (rule === null || startsAt === null) return { unit: "weeks", amount: 1 };

  const contiguousMs =
    endsAt === null ? null : contiguousOpening(Date.parse(endsAt), endHasTime);
  const gap =
    contiguousMs === null
      ? null
      : repeatSpanning(
          contiguousMs,
          addUnits(Date.parse(startsAt), rule.unit, rule.interval),
        );
  return gap === null
    ? { unit: rule.unit, amount: rule.interval }
    : { unit: gap.unit, amount: gap.interval };
}

/**
 * Whether the end-date question has been answered.
 *
 * A cadence that renders no end field is asking nothing, so there is nothing
 * to withhold. Missing that gate is not a cosmetic slip: a fresh form starts
 * with `endKnown` true and `endDate` empty, so a preset — which hides both the
 * field and the "I don't know" checkbox — would leave Save disabled with
 * nothing on screen a reader could do about it.
 *
 * Exported because that state needs a click to reach, and nothing in this
 * project can click. Every static render drives the form through `initial`,
 * and `cadenceOf` never returns a preset for an event that has an end, so the
 * broken case was invisible to the whole suite.
 */
export function endStated(
  datedWindow: boolean,
  endKnown: boolean,
  endDate: string,
): boolean {
  return !datedWindow || !endKnown || endDate !== "";
}

/**
 * What an unstated end means, given whether anything repeats.
 *
 * Keyed off the rule rather than off the cadence. `custom` with the repeat set
 * to never is a real state and it has no interval to bound anything, so
 * choosing the sentence by cadence promised a countdown that would not arrive.
 */
export function unknownEndNote(repeat: Repeat | null): string {
  if (repeat === null) {
    return "It'll show with no countdown and no daily checklist, the same as an event whose source hasn't announced an end.";
  }
  return "Each one runs until the next one opens, so it still counts down.";
}

/**
 * The rule the form's controls currently describe, across all five cadences.
 *
 * The one place five answers become the single `{unit, interval}` the schema
 * stores, which is worth reading in one piece rather than spread through the
 * render — and exported so that `until` surviving every one of those paths is
 * provable without a submit nothing in this suite can click.
 *
 * A preset is one unit with no window. A delay is expressed by where it lands:
 * the next opening is the wait added to the close, and the interval is
 * whatever spans the anchor to there. That is why a delay can never produce a
 * rule that comes round before it ends — the next opening is at or after the
 * close by construction. Only a hand-stated cycle length can, which is why
 * `comesRoundEarly` still guards the form.
 *
 * A delay returns null when no whole unit spans the anchor to that opening,
 * which happens whenever the start and the end disagree about having a
 * time-of-day: nothing steps from 10:00 to a midnight. The schema anchors
 * every occurrence to `startsAt`, so that rule is not merely unstated but
 * unstatable, and the form says so rather than disabling Save in silence.
 */
export function repeatOf(input: {
  cadence: Cadence;
  mode: RepeatMode;
  measuring: boolean;
  measured: Repeat | null;
  startMs: number | null;
  contiguousMs: number | null;
  unit: RepeatUnit;
  amount: number;
  until: string | null;
}): Repeat | null {
  const { cadence, mode, measuring, measured, startMs, contiguousMs, unit, amount, until } =
    input;

  if (cadence === "one-off") return null;
  if (cadence !== "custom") return repeatFrom(PRESET_UNIT[cadence], 1, until);

  if (mode === "never") return null;
  if (mode === "forever") {
    return measuring && measured !== null
      ? repeatFrom(measured.unit, measured.interval, until)
      : repeatFrom(unit, amount, until);
  }

  if (startMs === null || contiguousMs === null) return null;
  if (!Number.isInteger(amount) || amount < 1 || amount > 365) return null;
  const span = repeatSpanning(startMs, addUnits(contiguousMs, unit, amount));
  return span === null ? null : repeatFrom(span.unit, span.interval, until);
}

function labelClass(): string {
  return "block text-xs font-medium text-muted";
}

function inputClass(): string {
  return `mt-1 w-full ${field}`;
}

export function GameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; hue: string } | undefined;
  onSave: (name: string, hue: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hue, setHue] = useState(initial?.hue ?? CUSTOM_HUES[0]!);
  const valid = name.trim().length > 0 && name.trim().length <= 40;

  return (
    <form
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(name, hue);
      }}
    >
      <label className={labelClass()}>
        Game name
        <input
          autoFocus
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Limbus Company"
          className={inputClass()}
        />
      </label>

      <p className={`${labelClass()} mt-3`}>Lane colour</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {CUSTOM_HUES.map((h) => (
          <button
            key={h}
            type="button"
            aria-label={`Use colour ${h}`}
            aria-pressed={hue === h}
            onClick={() => setHue(h)}
            className={`size-7 rounded-full border-2 transition-transform ${
              hue === h ? "scale-110 border-ink" : "border-transparent"
            }`}
            style={{ background: h }}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={!valid}
          className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-xs font-medium text-ground transition-colors disabled:opacity-40"
        >
          Save game
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Split a stored instant back into the date and time a form field wants. */
function fields(iso: string | null, timezone?: string | null): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  if (timezone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(d).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** The kinds, in the words a reader uses. What is stored stays the enum value. */
const KIND_LABEL: Record<EventType, string> = {
  banner: "Banner",
  story: "Story",
  rerun: "Rerun",
  challenge: "Challenge / endgame",
  login: "Login rewards",
  shop: "Shop",
  maintenance: "Maintenance",
  other: "Other",
};

const CADENCES: readonly { value: Cadence; label: string }[] = [
  { value: "one-off", label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "custom", label: "On its own cycle" },
];

const REPEAT_MODES: readonly { value: RepeatMode; label: string }[] = [
  { value: "never", label: "Doesn't repeat" },
  { value: "forever", label: "Comes back as it ends" },
  { value: "delay", label: "Comes back after a wait" },
];

/**
 * The answers that decide which questions the event form asks — what an
 * example sets (`src/shared/templates.ts`), plus whether the reader has taken
 * the cycle length over from the measured one.
 */
export interface EventShape {
  type: EventType;
  cadence: Cadence;
  repeatMode: RepeatMode;
  endKnown: boolean;
  ownCadence: boolean;
}

/** Everything the event form holds, as typed. */
export interface EventFormValues extends EventShape {
  game: LaneId;
  title: string;
  summary: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  cadenceUnit: RepeatUnit;
  cadenceAmount: string;
}

/**
 * A shape with an example applied. Only the shape: the name, the dates, the
 * note and the game are the reader's and stay as typed. A cycle length they
 * took over by hand goes back to the measured one, because it was stated for
 * whatever they had before, not for this.
 */
export function withEventTemplate(shape: EventShape, t: EventTemplate): EventShape {
  return { ...shape, ...t.sets, ownCadence: false };
}

/**
 * A shape with a new "how often". Choosing *On its own cycle* while the repeat
 * says *Doesn't repeat* moves it to *Comes back as it ends*: a cycle that never
 * comes back is a contradiction on screen, and the plain one-off is already
 * *Once*. Any other answer the reader gave is kept.
 */
export function withCadence(shape: EventShape, cadence: Cadence): EventShape {
  return {
    ...shape,
    cadence,
    repeatMode: cadence === "custom" && shape.repeatMode === "never" ? "forever" : shape.repeatMode,
  };
}

/**
 * What the event still lacks before it can be saved, in the order the form
 * asks. Mistakes — dates the wrong way round, a cycle that comes round early —
 * are not in it: those are said in critical beside their field.
 */
export function eventStillNeeded(s: {
  title: string;
  startDate: string;
  datedWindow: boolean;
  endKnown: boolean;
  endDate: string;
  delayNeedsEnd: boolean;
  needsCycle: boolean;
  needsWait?: boolean;
}): string[] {
  const needs: string[] = [];
  if (s.title.trim() === "") needs.push("a name");
  if (s.startDate === "") needs.push("a start date");
  if (s.delayNeedsEnd && !s.endKnown) {
    // The end field is hidden behind "I don't know when it ends", so a bare
    // "an end date" would ask for something not on screen.
    needs.push("an end date (a wait counts from it) or another repeat");
  } else if ((s.datedWindow && s.endKnown && s.endDate === "") || s.delayNeedsEnd) {
    needs.push("an end date");
  }
  if (s.needsCycle) needs.push("a cycle length");
  if (s.needsWait) needs.push("a wait");
  return needs;
}

/**
 * Everything the event form works out from what is typed — the instants, the
 * rule, each mistake, what is still needed, and the draft a save would write.
 *
 * One pure function rather than a block inside the render, so the examples
 * can be proved to complete into a saveable event without a click, and so the
 * still-needed line and Save's disabled state read the same answer.
 */
export function eventFormState(v: EventFormValues, existingUntil: string | null, timezone?: string | null) {
  // A preset's period is its window, so it has no end to state. The end the
  // reader may have typed under a different cadence is kept in state rather
  // than cleared — hiding a field and quietly discarding what is in it is how
  // a form loses somebody's work when they change their mind back.
  const preset = v.cadence === "daily" || v.cadence === "weekly" || v.cadence === "monthly";
  const datedWindow = v.cadence === "one-off" || v.cadence === "custom";

  const startsAt = v.startDate === "" ? null : readerInstant(v.startDate, v.startTime, "start", timezone);
  const endsAt =
    !datedWindow || !v.endKnown || v.endDate === ""
      ? null
      : readerInstant(v.endDate, v.endTime, "end", timezone);

  const endMissing = datedWindow && v.endKnown && v.endDate !== "" && endsAt === null;
  const backwards = startsAt !== null && endsAt !== null && endsAt <= startsAt;

  const startMs = startsAt === null ? null : Date.parse(startsAt);
  const endMs = endsAt === null ? null : Date.parse(endsAt);

  const amount = Number(v.cadenceAmount);
  const amountValid = Number.isInteger(amount) && amount >= 1 && amount <= 365;

  // What the dates already say, when they say anything. Null covers both "no
  // end given yet" and a window that is no whole number of any unit — two
  // exact times a few hours apart — where rounding would move a boundary the
  // reader chose, so the form asks instead.
  const contiguousMs = endMs === null ? null : contiguousOpening(endMs, v.endTime !== "");
  const measured =
    startMs === null || contiguousMs === null ? null : repeatSpanning(startMs, contiguousMs);
  const measuring = v.repeatMode === "forever" && !v.ownCadence && measured !== null;

  // A delay is measured from the end, so it has nothing to work with until one
  // is given. Forever still does: the reader states the cadence and each
  // occurrence runs until the next opens.
  const delayNeedsEnd = v.cadence === "custom" && v.repeatMode === "delay" && endMs === null;

  const repeat = repeatOf({
    cadence: v.cadence,
    mode: v.repeatMode,
    measuring,
    measured,
    startMs,
    contiguousMs,
    unit: v.cadenceUnit,
    amount,
    until: existingUntil,
  });

  // Only `custom` can be incomplete. A preset is one unit with no window and
  // is therefore always sayable, and a one-off has no repeat to get wrong.
  const needsCycle =
    v.cadence === "custom" && v.repeatMode === "forever" && !measuring && !amountValid;
  const needsWait = v.cadence === "custom" && v.repeatMode === "delay" && !amountValid;
  // A wait that is given, against an end that is given, and still lands on no
  // whole unit from the start: unstatable rather than unstated, so it is a
  // mistake said beside the wait, not a gap in the still-needed line.
  const unstatableWait =
    v.cadence === "custom" && v.repeatMode === "delay" && !delayNeedsEnd && amountValid &&
    repeat === null;
  const repeatIncomplete =
    needsCycle ||
    (v.cadence === "custom" && v.repeatMode === "delay" && (delayNeedsEnd || repeat === null));

  // The same predicate the schema refines on, so the form cannot start
  // refusing saves the schema would accept or promising ones it will reject.
  const earlyReturn =
    startsAt !== null &&
    comesRoundEarly(Date.parse(startsAt), endsAt === null ? null : Date.parse(endsAt), repeat);

  const needs = eventStillNeeded({
    title: v.title,
    startDate: v.startDate,
    datedWindow,
    endKnown: v.endKnown,
    endDate: v.endDate,
    delayNeedsEnd,
    needsCycle,
    needsWait,
  });

  const valid =
    needs.length === 0 &&
    v.game !== "" &&
    startsAt !== null &&
    !backwards &&
    !endMissing &&
    endStated(datedWindow, v.endKnown, v.endDate) &&
    !earlyReturn &&
    !repeatIncomplete;

  const draft: EventDraft | null =
    startsAt === null
      ? null
      : {
          game: v.game,
          title: v.title,
          type: v.type,
          summary: v.summary === "" ? null : v.summary,
          startsAt,
          startHasTime: v.startTime !== "",
          endsAt,
          endHasTime: v.endTime !== "",
          repeat,
        };

  return {
    preset,
    datedWindow,
    startsAt,
    endsAt,
    endMs,
    measured,
    measuring,
    delayNeedsEnd,
    repeat,
    backwards,
    endMissing,
    earlyReturn,
    unstatableWait,
    needs,
    valid,
    draft,
  };
}

export function EventForm({
  lanes,
  customGames,
  initial,
  onSave,
  onCancel,
  strandedBy,
}: {
  /** Every lane an event can belong to — a source can miss an event too. */
  lanes: LaneId[];
  customGames: CustomGames;
  initial?: CustomEvent | undefined;
  onSave: (draft: EventDraft) => void;
  onCancel: () => void;
  /**
   * How many stored marks this draft's schedule would leave behind.
   *
   * Supplied by the caller because only it can see the mark stores. Absent —
   * on the add form, where there is nothing to strand — the notice never
   * renders.
   */
  strandedBy?: ((draft: EventDraft) => number) | undefined;
}) {
  const gameMeta = useGameMeta();
  const timezone = useContext(DisplayTimeContext);

  // The reader's own games first, and so the default too. Someone filling this
  // in by hand is usually doing it *because* the game isn't tracked; making
  // them scroll past nine that are gets the common case backwards. Stable
  // within each group, so the tracked ones keep their feed order.
  const ordered = [...lanes].sort(
    (a, b) => Number(isCustomGameId(b)) - Number(isCustomGameId(a)),
  );

  const [v, setV] = useState<EventFormValues>(() => {
    const start = fields(initial?.startsAt ?? null, timezone);
    const end = fields(initial?.endsAt ?? null, timezone);
    // Round-tripped through the same fields-then-readerInstant path the live
    // form uses, rather than read straight off the record. The two disagree: a
    // day-precision end is stored as whatever instant it was written at, and
    // the form re-resolves it to the end of the reader's own day. Deriving the
    // opening state from the stored value and everything after it from the
    // re-resolved one is how the control opens saying "with a delay" about a
    // rule that has no gap at all.
    const startTime = initial?.startPrecision === "exact" ? start.time : "";
    const endTime = initial?.endPrecision === "exact" ? end.time : "";
    const initialStartsAt =
      start.date === "" ? null : (readerInstant(start.date, startTime, "start", timezone) ?? null);
    const initialEndsAt =
      initial?.endsAt == null || end.date === ""
        ? null
        : (readerInstant(end.date, endTime, "end", timezone) ?? null);
    const opening = openingControls(
      initialStartsAt,
      initialEndsAt,
      endTime !== "",
      initial?.repeat ?? null,
    );
    return {
      game: initial?.game ?? ordered[0] ?? Object.keys(customGames)[0] ?? "",
      title: initial?.title ?? "",
      type: initial?.type ?? "other",
      summary: initial?.summary ?? "",
      startDate: start.date,
      startTime,
      // Separate from an empty end date so "I don't know" is a thing the
      // reader states, not a field they leave blank and hope about.
      endKnown: initial ? initial.endsAt !== null : true,
      // Asked before the dates, because it decides which of them are even
      // questions: a preset's period is its window, so there is no end to type.
      cadence: cadenceOf(initial?.endsAt ?? null, initial?.repeat ?? null),
      endDate: end.date,
      endTime,
      // Three answers rather than a unit and a number, because "how often" is
      // rarely the question a reader actually has. They know it comes back the
      // moment it ends, or that it comes back after a wait; the cadence follows
      // from that and from dates they have already typed.
      repeatMode:
        initial === undefined
          ? "never"
          : repeatModeOf(
              Date.parse(initialStartsAt ?? initial.startsAt),
              initialEndsAt === null
                ? null
                : contiguousOpening(Date.parse(initialEndsAt), endTime !== ""),
              initial.repeat,
            ),
      // Measuring is the convenience, not a cage: an irregular rotation still
      // has to be sayable when the first window does not describe it.
      ownCadence: false,
      cadenceUnit: opening.unit,
      cadenceAmount: String(opening.amount),
    };
  });
  const set = (patch: Partial<EventFormValues>) => setV((prev) => ({ ...prev, ...patch }));
  const [chosen, setChosen] = useState<EventTemplate | null>(null);

  const s = eventFormState(v, initial?.repeat?.until ?? null, timezone);
  const { preset, datedWindow, endMs, measured, measuring, repeat, draft } = s;

  // Only a schedule change re-keys anything. Renaming does not — the token is
  // random precisely so fixing a typo never costs the marks attached to it.
  const stranded =
    initial !== undefined && draft !== null && strandedBy !== undefined &&
    movesOccurrences(initial, draft)
      ? strandedBy(draft)
      : 0;
  const notice = strandedNotice(stranded);

  const unitSelect = (
    <label className={labelClass()}>
      <span className="invisible">Unit</span>
      <select
        value={v.cadenceUnit}
        onChange={(e) => set({ cadenceUnit: e.target.value as RepeatUnit })}
        className={inputClass()}
      >
        {RepeatUnit.options.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!s.valid || draft === null) return;
        onSave(draft);
      }}
    >
      <p className="help">Dates and times use {timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      {initial === undefined && (
        <ExampleRow
          examples={EVENT_TEMPLATES}
          chosen={chosen?.id ?? null}
          onChoose={(t) => {
            setChosen(t);
            setV((prev) => ({ ...prev, ...withEventTemplate(prev, t) }));
          }}
        />
      )}

      <label className={labelClass()}>
        Game
        <select
          value={v.game}
          onChange={(e) => set({ game: e.target.value })}
          className={inputClass()}
        >
          {ordered.map((id) => (
            <option key={id} value={id}>
              {gameMeta(id).name}
              {isCustomGameId(id) ? " (yours)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Otherwise the list is eleven games we track and no sign of why none of
          them is theirs — the reader who came here to add a game we don't cover
          has no way of knowing they need to make it first. */}
      {Object.keys(customGames).length === 0 && (
        <p className="mt-1.5 text-xs leading-relaxed text-faint">
          These are the games we track. To file this under a game of your own,
          cancel and add the game first.
        </p>
      )}

      <label className={`${labelClass()} mt-3`}>
        Name
        <input
          value={v.title}
          maxLength={200}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={chosen?.placeholder ?? "Walpurgisnacht"}
          className={inputClass()}
        />
      </label>

      {/* Asked before the dates because it decides which of them are even
          questions. A weekly chore has no end date worth typing — the week is
          the window — and a form that asks anyway is asking something with no
          honest answer. Pills rather than a select, so every answer is in view:
          not seeing which answer produced what they wanted was the confusion. */}
      <p className={`${labelClass()} mt-3`}>How often</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {CADENCES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={v.cadence === c.value}
            onClick={() => setV((prev) => ({ ...prev, ...withCadence(prev, c.value) }))}
            className={pill(v.cadence === c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {preset && (
        <p className="mt-1.5 text-xs leading-relaxed text-faint">
          Each one runs until the next opens, so there is no end date to give.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className={labelClass()}>
          Starts
          <input
            type="date"
            value={v.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
            className={inputClass()}
          />
        </label>
        <label className={labelClass()}>
          Time (optional)
          <input
            type="time"
            value={v.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
            className={inputClass()}
          />
        </label>
      </div>
      {v.startTime === "" && v.startDate !== "" && (
        <p className="mt-1.5 text-xs leading-relaxed text-faint">
          No time given, so this counts from the start of the day where you are —
          and to the end of the day it finishes on.
        </p>
      )}

      {/* Only a cadence that carries its own window asks about an end. The end
          is allowed to be unknown there, and says so out loud: making it
          mandatory would push the reader into inventing a date, which is
          exactly the failure the parsers are forbidden from committing. */}
      {datedWindow && (
        <>
          <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={!v.endKnown}
              onChange={(e) => set({ endKnown: !e.target.checked })}
              className="size-4 accent-[var(--color-near)]"
            />
            I don't know when it ends
          </label>
          {!v.endKnown && (
            <p className="mt-1.5 text-xs leading-relaxed text-faint">{unknownEndNote(repeat)}</p>
          )}

          {v.endKnown && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelClass()}>
                Ends
                <input
                  type="date"
                  value={v.endDate}
                  onChange={(e) => set({ endDate: e.target.value })}
                  className={inputClass()}
                />
              </label>
              <label className={labelClass()}>
                Time (optional)
                <input
                  type="time"
                  value={v.endTime}
                  onChange={(e) => set({ endTime: e.target.value })}
                  className={inputClass()}
                />
              </label>
            </div>
          )}
          {s.backwards && (
            <p className="mt-1.5 text-xs text-critical">That ends before it starts.</p>
          )}
          {s.endMissing && (
            <p className="mt-1.5 text-xs text-critical">That end date isn't a real date.</p>
          )}
        </>
      )}

      {/* Only a custom cadence needs any of this: a preset answers it by
          construction, and a one-off has nothing to answer. */}
      {v.cadence === "custom" && (
        <>
          <p className={`${labelClass()} mt-3`}>Repeat</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {REPEAT_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={v.repeatMode === m.value}
                disabled={m.value === "delay" && endMs === null}
                onClick={() => set({ repeatMode: m.value })}
                className={pill(v.repeatMode === m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {v.repeatMode !== "never" && endMs === null && (
            <p className="mt-1.5 text-xs leading-relaxed text-faint">
              A delay needs an end date to be measured from. With none, each one
              just runs until the next opens.
            </p>
          )}

          {/* Measured, and said out loud — a cadence the form worked out silently
              would be a date the reader never agreed to, which is the one thing
              this product does not do. */}
          {measuring && measured !== null && (
            <p className="mt-2 text-xs leading-relaxed text-faint">
              {cadenceLabel(measured)} · worked out from your dates.{" "}
              <button
                type="button"
                onClick={() => set({ ownCadence: true })}
                className="underline transition-colors hover:text-ink"
              >
                state it myself
              </button>
            </p>
          )}

          {v.repeatMode === "forever" && !measuring && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelClass()}>
                Cycle length
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={v.cadenceAmount}
                  onChange={(e) => set({ cadenceAmount: e.target.value })}
                  className={inputClass()}
                />
              </label>
              {unitSelect}
            </div>
          )}

          {/* The way back. Taking the cadence over is meant to be a decision the
              reader can undo, and without this it was a one-way door: nothing
              else ever cleared `ownCadence`, so the measured reading could not
              be recovered without abandoning the form. Only offered when there
              is something to go back to. */}
          {v.repeatMode === "forever" && v.ownCadence && measured !== null && (
            <p className="mt-1.5 text-xs leading-relaxed text-faint">
              <button
                type="button"
                onClick={() => set({ ownCadence: false })}
                className="underline transition-colors hover:text-ink"
              >
                use my dates instead
              </button>{" "}
              · {cadenceLabel(measured)}
            </p>
          )}

          {v.repeatMode === "delay" && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className={labelClass()}>
                  Wait
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={v.cadenceAmount}
                    onChange={(e) => set({ cadenceAmount: e.target.value })}
                    className={inputClass()}
                  />
                </label>
                {unitSelect}
              </div>
              {/* Both readings, so the reader can check one against the other: a
                  week's wait after a week's window is a fortnightly rule, and
                  seeing that spelled out is how they catch a wrong number. */}
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                after it ends
                {repeat !== null ? ` · ${cadenceLabel(repeat)}` : ""}
              </p>
              {/* Every occurrence is anchored to the start, so the wait has to
                  land a whole number of units from it. It never can when one
                  boundary has a time of day and the other does not — nothing
                  steps from 10:00 to a midnight — and that is unstatable rather
                  than merely unstated, so it says so instead of leaving Save
                  disabled with no reason given. */}
              {s.unstatableWait && (
                <p className="mt-2 text-xs text-critical">
                  Give the start and the end both a time, or neither — a wait has
                  to land a whole number of days from the start, and these don't
                  line up.
                </p>
              )}
            </>
          )}
        </>
      )}

      {s.earlyReturn && (
        <p className="mt-2 text-xs text-critical">
          That comes round before it ends.
        </p>
      )}

      {/* A label rather than a question that changes the form, so it follows
          the questions that do. An example sets it already. */}
      <label className={`${labelClass()} mt-3`}>
        Kind
        <select
          value={v.type}
          onChange={(e) => set({ type: e.target.value as EventType })}
          className={inputClass()}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {KIND_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className={`${labelClass()} mt-3`}>
        Note (optional)
        <input
          value={v.summary}
          maxLength={500}
          onChange={(e) => set({ summary: e.target.value })}
          placeholder="What you want to remember about it"
          className={inputClass()}
        />
      </label>

      {notice !== null && (
        <p className="mt-2 text-xs leading-relaxed text-muted">{notice}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!s.valid}
          className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-xs font-medium text-ground transition-colors disabled:opacity-40"
        >
          {initial === undefined ? "Add event" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
        <StillNeeded needs={s.needs} />
      </div>
    </form>
  );
}
