import { useState } from "react";
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
 * The rule the three-way control currently describes.
 *
 * Pulled out of the component because it is the one place the three answers
 * become the single `{unit, interval}` the schema stores, and that translation
 * is worth reading in one piece rather than spread through the render.
 *
 * A delay is expressed by where it lands: the next opening is the wait added
 * to the close, and the interval is whatever spans the anchor to there. That
 * is why a delay can never produce a rule that comes round before it ends —
 * the next opening is at or after the close by construction. Only a
 * hand-stated cadence can, which is why `comesRoundEarly` still guards the
 * form.
 */
function repeatOf(input: {
  mode: RepeatMode;
  measuring: boolean;
  measured: Repeat | null;
  startMs: number | null;
  contiguousMs: number | null;
  unit: RepeatUnit;
  amount: number;
  until: string | null;
}): Repeat | null {
  const { mode, measuring, measured, startMs, contiguousMs, unit, amount, until } =
    input;

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
  return "mt-1 w-full rounded-lg border border-hairline bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-faint";
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
function fields(iso: string | null): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
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
  const start = fields(initial?.startsAt ?? null);
  const end = fields(initial?.endsAt ?? null);

  // Round-tripped through the same fields-then-readerInstant path the live
  // form uses, rather than read straight off the record. The two disagree: a
  // day-precision end is stored as whatever instant it was written at, and the
  // form re-resolves it to the end of the reader's own day. Deriving the
  // opening state from the stored value and everything after it from the
  // re-resolved one is how the control opens saying "with a delay" about a
  // rule that has no gap at all.
  const initialStartTime = initial?.startPrecision === "exact" ? start.time : "";
  const initialEndTime = initial?.endPrecision === "exact" ? end.time : "";
  const initialStartsAt =
    start.date === ""
      ? null
      : (readerInstant(start.date, initialStartTime, "start") ?? null);
  const initialEndsAt =
    initial?.endsAt == null || end.date === ""
      ? null
      : (readerInstant(end.date, initialEndTime, "end") ?? null);

  // The reader's own games first, and so the default too. Someone filling this
  // in by hand is usually doing it *because* the game isn't tracked; making
  // them scroll past nine that are gets the common case backwards. Stable
  // within each group, so the tracked ones keep their feed order.
  const ordered = [...lanes].sort(
    (a, b) => Number(isCustomGameId(b)) - Number(isCustomGameId(a)),
  );

  const [game, setGame] = useState<LaneId>(
    initial?.game ?? ordered[0] ?? Object.keys(customGames)[0] ?? "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<EventType>(initial?.type ?? "other");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(
    initialStartTime,
  );
  // Separate from an empty end date so "I don't know" is a thing the reader
  // states, not a field they leave blank and hope about.
  const [endKnown, setEndKnown] = useState(initial ? initial.endsAt !== null : true);
  // Asked before the dates, because it decides which of them are even
  // questions: a preset's period is its window, so there is no end to type.
  const [cadence, setCadence] = useState<Cadence>(() =>
    cadenceOf(initial?.endsAt ?? null, initial?.repeat ?? null),
  );
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(
    initialEndTime,
  );
  // Three answers rather than a unit and a number, because "how often" is
  // rarely the question a reader actually has. They know it comes back the
  // moment it ends, or that it comes back after a wait; the cadence follows
  // from that and from dates they have already typed.
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() =>
    initial === undefined
      ? "never"
      : repeatModeOf(
          Date.parse(initialStartsAt ?? initial.startsAt),
          initialEndsAt === null
            ? null
            : contiguousOpening(Date.parse(initialEndsAt), initialEndTime !== ""),
          initial.repeat,
        ),
  );
  // Measuring is the convenience, not a cage: an irregular rotation still has
  // to be sayable when the first window does not describe it.
  const [ownCadence, setOwnCadence] = useState(false);
  const opening = openingControls(initialStartsAt, initialEndsAt, initialEndTime !== "", initial?.repeat ?? null);
  const [cadenceUnit, setCadenceUnit] = useState<RepeatUnit>(opening.unit);
  const [cadenceAmount, setCadenceAmount] = useState(String(opening.amount));

  // A preset's period is its window, so it has no end to state. The end the
  // reader may have typed under a different cadence is kept in state rather
  // than cleared — hiding a field and quietly discarding what is in it is how
  // a form loses somebody's work when they change their mind back.
  const preset = cadence === "daily" || cadence === "weekly" || cadence === "monthly";
  const datedWindow = cadence === "one-off" || cadence === "custom";

  const startsAt = startDate === "" ? null : readerInstant(startDate, startTime, "start");
  const endsAt =
    !datedWindow || !endKnown || endDate === ""
      ? null
      : readerInstant(endDate, endTime, "end");

  const endMissing = datedWindow && endKnown && endDate !== "" && endsAt === null;
  const backwards = startsAt !== null && endsAt !== null && endsAt <= startsAt;

  const startMs = startsAt === null ? null : Date.parse(startsAt);
  const endMs = endsAt === null ? null : Date.parse(endsAt);

  const amount = Number(cadenceAmount);
  const amountValid = Number.isInteger(amount) && amount >= 1 && amount <= 365;
  const existingUntil = initial?.repeat?.until ?? null;

  // What the dates already say, when they say anything. Null covers both "no
  // end given yet" and a window that is no whole number of any unit — two
  // exact times a few hours apart — where rounding would move a boundary the
  // reader chose, so the form asks instead.
  const contiguousMs =
    endMs === null ? null : contiguousOpening(endMs, endTime !== "");
  const measured =
    startMs === null || contiguousMs === null
      ? null
      : repeatSpanning(startMs, contiguousMs);
  const measuring = repeatMode === "forever" && !ownCadence && measured !== null;

  // A delay is measured from the end, so it has nothing to work with until one
  // is given. Forever still does: the reader states the cadence and each
  // occurrence runs until the next opens.
  const delayNeedsEnd = repeatMode === "delay" && endMs === null;

  const repeat = preset
    ? repeatFrom(PRESET_UNIT[cadence], 1, existingUntil)
    : cadence === "one-off"
      ? null
      : repeatOf({
          mode: repeatMode,
          measuring,
          measured,
          startMs,
          contiguousMs,
          unit: cadenceUnit,
          amount,
          until: existingUntil,
        });

  // Only `custom` can be incomplete. A preset is one unit with no window and
  // is therefore always sayable, and a one-off has no repeat to get wrong.
  const repeatIncomplete =
    cadence === "custom" &&
    ((repeatMode === "forever" && !measuring && !amountValid) ||
      (repeatMode === "delay" && (delayNeedsEnd || repeat === null)));

  // The same predicate the schema refines on, so the form cannot start
  // refusing saves the schema would accept or promising ones it will reject.
  const earlyReturn =
    startsAt !== null &&
    comesRoundEarly(
      Date.parse(startsAt),
      endsAt === null ? null : Date.parse(endsAt),
      repeat,
    );

  const valid =
    title.trim().length > 0 &&
    game !== "" &&
    startsAt !== null &&
    !backwards &&
    !endMissing &&
    (!endKnown || endDate !== "") &&
    !earlyReturn &&
    !repeatIncomplete;

  const draft: EventDraft | null =
    startsAt === null
      ? null
      : {
          game, title, type,
          summary: summary === "" ? null : summary,
          startsAt, startHasTime: startTime !== "",
          endsAt, endHasTime: endTime !== "",
          repeat,
        };
  // Only a schedule change re-keys anything. Renaming does not — the token is
  // random precisely so fixing a typo never costs the marks attached to it.
  const stranded =
    initial !== undefined && draft !== null && strandedBy !== undefined &&
    movesOccurrences(initial, draft)
      ? strandedBy(draft)
      : 0;
  const notice = strandedNotice(stranded);

  return (
    <form
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || draft === null) return;
        onSave(draft);
      }}
    >
      <label className={labelClass()}>
        Game
        <select
          value={game}
          onChange={(e) => setGame(e.target.value)}
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
        What is it
        <input
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Walpurgisnacht"
          className={inputClass()}
        />
      </label>

      <label className={`${labelClass()} mt-3`}>
        Kind
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
          className={inputClass()}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {/* Asked before the dates because it decides which of them are even
          questions. A weekly chore has no end date worth typing — the week is
          the window — and a form that asks anyway is asking something with no
          honest answer. */}
      <label className={`${labelClass()} mt-3`}>
        Cadence
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as Cadence)}
          className={inputClass()}
        >
          <option value="one-off">one-off</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
          <option value="custom">custom</option>
        </select>
      </label>

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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass()}
          />
        </label>
        <label className={labelClass()}>
          Time (optional)
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputClass()}
          />
        </label>
      </div>

      {/* Only a cadence that carries its own window asks about an end. The end
          is allowed to be unknown there, and says so out loud: making it
          mandatory would push the reader into inventing a date, which is
          exactly the failure the parsers are forbidden from committing. */}
      {datedWindow && (
        <>
          <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={!endKnown}
              onChange={(e) => setEndKnown(!e.target.checked)}
              className="size-4 accent-[var(--color-near)]"
            />
            I don't know when it ends
          </label>

          {endKnown && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelClass()}>
                Ends
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass()}
                />
              </label>
              <label className={labelClass()}>
                Time (optional)
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass()}
                />
              </label>
            </div>
          )}
        </>
      )}

      {/* Only a custom cadence needs any of this: a preset answers it by
          construction, and a one-off has nothing to answer. */}
      {cadence === "custom" && (
        <>
        <label className={`${labelClass()} mt-3`}>
          Repeat
          <select
            value={repeatMode}
            onChange={(e) => setRepeatMode(e.target.value as RepeatMode)}
            className={inputClass()}
          >
            <option value="never">never</option>
            <option value="forever">forever</option>
            <option value="delay" disabled={endMs === null}>
              with a delay
            </option>
          </select>
        </label>

        {repeatMode !== "never" && endMs === null && (
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
              onClick={() => setOwnCadence(true)}
              className="underline transition-colors hover:text-ink"
            >
              state it myself
            </button>
          </p>
        )}

        {repeatMode === "forever" && !measuring && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={labelClass()}>
              Cycle length
              <input
                type="number"
                min={1}
                max={365}
                value={cadenceAmount}
                onChange={(e) => setCadenceAmount(e.target.value)}
                className={inputClass()}
              />
            </label>
            <label className={labelClass()}>
              <span className="invisible">Unit</span>
              <select
                value={cadenceUnit}
                onChange={(e) => setCadenceUnit(e.target.value as RepeatUnit)}
                className={inputClass()}
              >
                {RepeatUnit.options.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {repeatMode === "delay" && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelClass()}>
                Wait
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={cadenceAmount}
                  onChange={(e) => setCadenceAmount(e.target.value)}
                  className={inputClass()}
                />
              </label>
              <label className={labelClass()}>
                <span className="invisible">Unit</span>
                <select
                  value={cadenceUnit}
                  onChange={(e) => setCadenceUnit(e.target.value as RepeatUnit)}
                  className={inputClass()}
                >
                  {RepeatUnit.options.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {/* Both readings, so the reader can check one against the other: a
                week's wait after a week's window is a fortnightly rule, and
                seeing that spelled out is how they catch a wrong number. */}
            <p className="mt-1.5 text-xs leading-relaxed text-faint">
              after it ends
              {repeat !== null ? ` · ${cadenceLabel(repeat)}` : ""}
            </p>
          </>
        )}
        </>
      )}

      {earlyReturn && (
        <p className="mt-2 text-xs text-critical">
          That comes round before it ends.
        </p>
      )}

      <label className={`${labelClass()} mt-3`}>
        Note (optional)
        <input
          value={summary}
          maxLength={500}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What you want to remember about it"
          className={inputClass()}
        />
      </label>

      {datedWindow && !endKnown && cadence === "one-off" && (
        <p className="mt-2 text-xs leading-relaxed text-faint">
          It'll show with no countdown and no daily checklist, the same as an
          event whose source hasn't announced an end.
        </p>
      )}
      {datedWindow && !endKnown && cadence === "custom" && (
        /* Not a degraded answer here — the interval bounds it. */
        <p className="mt-2 text-xs leading-relaxed text-faint">
          Each one runs until the next one opens, so it still counts down.
        </p>
      )}
      {backwards && (
        <p className="mt-2 text-xs text-critical">
          That ends before it starts.
        </p>
      )}
      {endMissing && (
        <p className="mt-2 text-xs text-critical">That end date isn't a real date.</p>
      )}
      {startTime === "" && startDate !== "" && (
        <p className="mt-2 text-xs leading-relaxed text-faint">
          No time given, so this counts from the start of the day where you are —
          and to the end of the day it finishes on.
        </p>
      )}

      {notice !== null && (
        <p className="mt-2 text-xs leading-relaxed text-muted">{notice}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={!valid}
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
      </div>
    </form>
  );
}
