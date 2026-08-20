import { useState } from "react";
import type { LaneId } from "../../shared/custom.ts";
import type { Region } from "../../shared/schema.ts";
import { REGION_LABEL } from "../../shared/time.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { moveGame } from "../state/gameOrder.ts";
import type { ThemeChoice } from "../state/theme.ts";
import type { Prefs } from "../state/usePrefs.ts";
import { YourOwn } from "./YourOwn.tsx";

const REGIONS: Array<{ id: Region; label: string }> = (
  ["america", "europe", "asia"] as const
).map((id) => ({ id, label: REGION_LABEL[id] }));

/**
 * Dark first, because that is what the app is and what this control is offered
 * *from*; `System` last, because it is the answer that defers rather than
 * decides.
 */
const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

/**
 * The two readings of a board with the future on it, and both are right for
 * somebody — see PRD F1.
 *
 * Kept as a pair of pills rather than a second checkbox because neither answer
 * is the absence of the other: "mixed in" is a different order, not a heading
 * switched off. A checkbox would name one of them and leave the other as
 * whatever is left over.
 */
const SPLITS: Array<{ id: boolean; label: string; hint: string }> = [
  {
    id: true,
    label: "In their own group",
    hint: "Each lane runs out, then a “Not started yet” heading and what is queued behind it — the shape the checklist has either way.",
  },
  {
    id: false,
    label: "Mixed in",
    hint: "One deadline order, started or not — so something opening Friday and closing Sunday sits above an event running until October.",
  },
];

/**
 * The settings panel.
 *
 * Six groups, each collapsed until asked for, and each stating its own answer
 * on the summary line. It used to be one open block of everything in two
 * columns, which was readable at four games and is not at eighteen: the game
 * list alone is eighteen rows of four controls, and it sat above the pills and
 * checkboxes a reader had actually come down here to find. Scrolling past a
 * wall to reach a checkbox is the whole complaint.
 *
 * Collapsing it is only half an answer, though — a closed group that says
 * nothing turns "what is my region set to?" into a click. So every summary
 * carries its group's current state, which makes the closed panel a six-line
 * report of how the app is configured, and makes opening one a deliberate act
 * rather than the price of reading it.
 *
 * One column of groups rather than the two this replaced: the split was there
 * because the panel was tall, and with the groups closed the whole thing is
 * shorter than the header above it. That is a claim about the *groups*, not
 * about the panel's width — the rows run the full column, and the one list long
 * enough to need it takes two columns of its own inside its group.
 */
export function Controls({
  games,
  prefs,
  onToggleGame,
  onUpdate,
  ignoredCount,
  onExport,
  onImport,
  own,
}: {
  games: LaneId[];
  prefs: Prefs;
  onToggleGame: (g: LaneId) => void;
  onUpdate: (p: Partial<Prefs>) => void;
  ignoredCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
  /** Everything the reader entered themselves, and the ways to change it. */
  own: React.ComponentProps<typeof YourOwn>;
}) {
  const shown = games.filter((g) => !prefs.hiddenGames.includes(g)).length;
  const ownGames = Object.keys(own.games).length;
  const ownEvents = Object.keys(own.events).length;

  return (
    <section
      aria-labelledby="settings-heading"
      className="border-t border-hairline px-4 py-5"
    >
      <h2 id="settings-heading" className="eyebrow">
        Settings
      </h2>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-faint">
        All of this stays in this browser. Each group says where it stands, so
        you only have to open the one you came to change.
      </p>

      {/* Full width, like every other row on this page. This was held to
          `max-w-3xl` on the argument that a name and its state stop reading as
          one line across a wide screen — but the section's own rule spans the
          shell, so every rule inside it stopped short of that by a third of the
          column, and the panel became the one block on a desktop page not using
          the width, between a two-column checklist and a three-column footer
          that both do. The pairing itself is what the page already does: a
          deadline and its countdown sit at opposite ends of a full-width row
          directly above this. Prose inside a group keeps its own measure. */}
      <div className="mt-3.5 border-t border-hairline">
        <Group name="Games" state={gamesState(games.length, shown, prefs.gameOrder !== undefined)}>
          <GameOrder
            games={games}
            hidden={prefs.hiddenGames}
            custom={prefs.gameOrder !== undefined}
            onToggleGame={onToggleGame}
            onReorder={(from, to) =>
              // The whole displayed list, every time: the indices are positions
              // on screen, and what the reader is looking at is the order they
              // mean. See `moveGame`.
              onUpdate({ gameOrder: moveGame(games, from, to) })
            }
            onReset={() => onUpdate({ gameOrder: undefined })}
          />
        </Group>

        {/* Two groups, where this was one called "Reading" — a name that
            described neither of them. It was grouped on "both are how do I read
            this?", which is true of the theme and not of the region: the region
            is a fact about the reader's account, and it is the one setting here
            that can make a countdown wrong, because region-scoped ends and every
            daily reset are read off that server's clock. So it summarised as
            "Europe · Dark", two unrelated answers joined by a dot, in a panel
            whose whole premise is that a closed group states *its* answer. Split,
            each line answers one question and the consequential one is no longer
            filed behind a word for the other. */}
        <Group name="Server region" state={REGION_LABEL[prefs.region]}>
          <PillGroup
            label="Server region"
            labelHidden
            options={REGIONS}
            value={prefs.region}
            onChange={(region) => onUpdate({ region, regionConfirmed: true })}
          />
          <p className="mt-2.5 max-w-md text-xs leading-relaxed text-faint">
            Which server your account plays on. Events that end per region end on
            its clock, a date printed without a time is read as that server's
            daily reset, and every streak is counted in its days — so this is the
            setting to get right before trusting a countdown.
          </p>
        </Group>

        {/* Genuinely only how the page looks, and instant: no reload, and
            nothing marked, typed or ticked is touched. */}
        <Group name="Appearance" state={themeLabel(prefs.theme)}>
          <PillGroup
            label="Appearance"
            labelHidden
            options={THEMES}
            value={prefs.theme}
            onChange={(theme) => onUpdate({ theme })}
          />
        </Group>

        <Group
          name="What you see"
          state={visibilityState(
            prefs.showCompleted,
            prefs.showUpcoming,
            prefs.showIgnored && ignoredCount > 0,
          )}
        >
          <div className="flex flex-col gap-3">
            <Check
              checked={prefs.showCompleted}
              onChange={(showCompleted) => onUpdate({ showCompleted })}
              label="Show events I've finished"
            />

            {/* One of the three "what am I allowed to look at" rows, and it
                reaches both views: the checklist's "Not started yet" section
                and the board's future bars are the same events answering the
                same question. Off is the default because this app answers
                *what expires next* — see PRD F1. */}
            <Check
              checked={prefs.showUpcoming}
              onChange={(showUpcoming) => onUpdate({ showUpcoming })}
              label="Show events that haven't started"
              hint="Adds the checklist's “Not started yet” section, and plots them on the timeline — which draws its span from what it plots, so the board stretches weeks past today."
            />

            {/* Only while there is something to arrange. A choice about how
                unstarted events sit on the board is unanswerable when none
                are on it, and offering it anyway is a control that does
                nothing — the stored answer is kept either way, so switching
                the row above back on restores it rather than a default. */}
            {prefs.showUpcoming && (
              <div className="ml-6">
                <PillGroup
                  small
                  label="Where unstarted events sit on the board"
                  options={SPLITS}
                  value={prefs.timelineSplitUpcoming}
                  onChange={(timelineSplitUpcoming) =>
                    onUpdate({ timelineSplitUpcoming })
                  }
                />
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-faint">
                  On the timeline.{" "}
                  {SPLITS.find((s) => s.id === prefs.timelineSplitUpcoming)?.hint}
                </p>
              </div>
            )}

            {/* Detection reads the source's wording and is wrong in both
                directions, so it ships off and says so. Off leaves only the
                events the reader marked, and discards nothing — every mark and
                logged day survives, so it can be switched back on. */}
            <Check
              checked={prefs.detectDaily}
              onChange={(detectDaily) => onUpdate({ detectDaily })}
              label="Spot daily events automatically"
              badge="Experimental"
              hint="Guessed from what the source wrote, so it misses some and invents others. Off, only events you mark yourself get a checklist. Your ticks and streaks are kept either way."
            />

            {ignoredCount > 0 && (
              <Check
                checked={prefs.showIgnored}
                onChange={(showIgnored) => onUpdate({ showIgnored })}
                label={`Show the ${ignoredCount} event${
                  ignoredCount > 1 ? "s" : ""
                } I'm ignoring`}
              />
            )}
          </div>
        </Group>

        <Group name="Your own games and events" state={ownState(ownGames, ownEvents)}>
          <YourOwn {...own} />
        </Group>

        <Group name="Your progress" state="Backup to a file">
          <p className="max-w-md text-xs leading-relaxed text-faint">
            What you've finished, and every daily you've ticked off, are saved in
            this browser only — there is no account. Anything you added yourself is
            in there too. Move it all to another device with a file.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onExport}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
            >
              Export
            </button>
            <label className="cursor-pointer rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink">
              Import
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImport(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Group>
      </div>
    </section>
  );
}

/** The theme in the reader's words, falling back to the stored value. */
function themeLabel(theme: ThemeChoice): string {
  return THEMES.find((t) => t.id === theme)?.label ?? theme;
}

/** "12 of 18 on · your order" — what the games group is set to, without opening it. */
function gamesState(total: number, shown: number, ordered: boolean): string {
  if (total === 0) return "none yet";
  return `${shown} of ${total} on · ${ordered ? "your order" : "A–Z"}`;
}

/**
 * What the visibility group is letting through.
 *
 * Named as additions to the deadlines, because that is what they are: the app's
 * answer is *what expires next*, and each of these switches puts something else
 * alongside it.
 */
function visibilityState(
  completed: boolean,
  upcoming: boolean,
  ignored: boolean,
): string {
  const also: string[] = [];
  if (completed) also.push("finished");
  if (upcoming) also.push("not started");
  if (ignored) also.push("ignored");
  return also.length === 0 ? "live deadlines only" : `plus ${also.join(", ")}`;
}

function ownState(games: number, events: number): string {
  if (games === 0 && events === 0) return "none yet";
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(games, "game")} · ${plural(events, "event")}`;
}

/**
 * One collapsible group of settings.
 *
 * Native `<details>` rather than a button and a piece of state, for the reason
 * the game-order arrows are ordinary buttons: the disclosure is then reachable
 * by keyboard and screen reader without a second implementation of the same
 * interaction, and it survives with JavaScript half-loaded.
 *
 * The state line is not decoration. A group that collapses to its name alone
 * turns every question about how the app is set up into a click, which trades
 * one kind of friction for another — so the summary answers the group's own
 * question, and opening it is for changing the answer rather than reading it.
 */
function Group({
  name,
  state,
  children,
}: {
  name: string;
  /** This group's current answer, in the reader's words. */
  state: string;
  children: React.ReactNode;
}) {
  return (
    <details className="settings-group border-b border-hairline">
      <summary className="flex items-center gap-2.5 py-3 text-sm">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="settings-chevron size-2.5 shrink-0 text-faint"
        >
          <path d="M5 2.5l6 5.5-6 5.5z" fill="currentColor" />
        </svg>
        <span className="min-w-0 flex-1 truncate font-medium text-ink">
          {name}
        </span>
        <span className="shrink-0 text-xs text-faint">{state}</span>
      </summary>
      {/* Indented to the group name, clear of the chevron. */}
      <div className="pb-5 pl-5">{children}</div>
    </details>
  );
}

/**
 * One row of mutually exclusive answers.
 *
 * The region, the theme and the board's grouping of unstarted events were three
 * copies of the same markup carrying the same pressed-state rules. Being one
 * component is also what gives each of them an accessible name: the first two
 * had none, so a screen reader read six unlabelled buttons in a row with
 * nothing saying which question either half answered — the `role="group"` the
 * board's own controls already carry.
 */
function PillGroup<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
  small = false,
  labelHidden = false,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  /** Subordinate to the control above it, rather than a question of its own. */
  small?: boolean;
  /**
   * For the group whose own summary already asks the question. Drops the
   * eyebrow and nothing else — `aria-label` still names the row, so the
   * accessible name survives the visual one going away.
   */
  labelHidden?: boolean;
}) {
  return (
    <div>
      {!labelHidden && <p className="eyebrow">{label}</p>}
      <div
        role="group"
        aria-label={label}
        className={`flex flex-wrap gap-1.5 ${labelHidden ? "" : "mt-2"}`}
      >
        {options.map((option) => {
          const on = option.id === value;
          return (
            <button
              key={String(option.id)}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={on}
              className={`rounded-full border font-medium transition-colors ${
                small ? "px-3 py-1 text-[0.6875rem]" : "px-3 py-1.5 text-xs"
              } ${
                on
                  ? "border-ink/70 text-ink"
                  : "border-hairline text-faint hover:text-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One switch, with room to say what it does.
 *
 * The explanations were inline in the panel, which is what made three checkboxes
 * as tall as the game list. They belong to the control, so they live with it.
 */
function Check({
  checked,
  onChange,
  label,
  hint,
  badge,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Why a reader might want this, when the label cannot carry it. */
  hint?: string | undefined;
  /** A caveat on the control itself — "Experimental" and nothing else so far. */
  badge?: string | undefined;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-px size-4 accent-[var(--color-near)]"
      />
      <span>
        {label}
        {badge !== undefined && (
          <span className="ml-1.5 rounded-full border border-hairline px-1.5 py-0.5 align-[1px] text-[0.5625rem] font-medium uppercase tracking-wider text-faint">
            {badge}
          </span>
        )}
        {hint !== undefined && (
          <span className="mt-0.5 block max-w-sm leading-relaxed text-faint">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Which games the reader plays, and the order they read them in.
 *
 * One row per game rather than the chip row this replaced: a reorder affordance
 * needs somewhere to put a handle and two arrows, and at fourteen games a list
 * reads better than a wrapped row of pills anyway.
 *
 * **Reordering lives here and nowhere else.** The focus bar and the dailies strip
 * are the fastest tap targets on the page — the strip is the part of it that is
 * answerable in ten seconds — and a drag target sitting on top of a tick target
 * costs somebody a streak the first time it misfires. So the live surfaces stay
 * drag-free and this is the screen you visit on purpose.
 *
 * The row itself is not a target. The handle, the two arrows and the on/off
 * switch are four explicit controls, and nothing else here is clickable — which
 * is what keeps this the right side of "a list row is one target": that rule is
 * about a full-bleed row target with a second control hidden inside it.
 */
function GameOrder({
  games,
  hidden,
  custom,
  onToggleGame,
  onReorder,
  onReset,
}: {
  /** Every lane, already in the reader's order. */
  games: LaneId[];
  hidden: LaneId[];
  /** Whether the reader has an order of their own, so reset has something to do. */
  custom: boolean;
  onToggleGame: (g: LaneId) => void;
  onReorder: (from: number, to: number) => void;
  onReset: () => void;
}) {
  const gameMeta = useGameMeta();
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <>
      {/* Both affordances, always visible. Touch fires no drag events at all, so
          the arrows are the mechanism and the handle is the fast path where a
          pointer exists — and the arrows are ordinary buttons, which is what
          makes this reachable by keyboard and screen reader without a second
          implementation of the same interaction. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="max-w-sm text-[0.6875rem] leading-relaxed text-faint">
          Drag a row, or use the arrows, to put your games in order. Everything
          that lists a game follows it.
        </p>
        {custom && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 text-[0.6875rem] text-faint transition-colors hover:text-muted"
          >
            Reset to A–Z
          </button>
        )}
      </div>

      {/* Two columns once there are enough games to make one tall, and once the
          screen is wide enough to hold them — eighteen rows was a 1,000px ribbon
          down the left of a desktop page with two thirds of the width empty
          beside it. It flows *down* then across, not across then down, so the
          numbers still read 1‑2‑3 in a straight line and an arrow still swaps a
          row with the one it is next to. Below nine games it stays one column:
          splitting a list short enough to take in at a glance only strands a
          couple of rows in a second column. */}
      <ul
        className={`mt-2 max-w-md ${
          games.length >= 9 ? "lg:max-w-4xl lg:columns-2 lg:gap-x-10" : ""
        }`}
      >
        {games.map((id, i) => {
          const game = gameMeta(id);
          const on = !hidden.includes(id);
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null && dragging !== i) onReorder(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={`flex break-inside-avoid items-center gap-2 rounded-lg py-1 ${
                dragging === i ? "opacity-40" : ""
              }`}
            >
              <span
                aria-hidden
                title="Drag to reorder"
                className="cursor-grab select-none px-0.5 text-xs leading-none text-faint"
              >
                ⠿
              </span>
              <span className="tnum w-4 shrink-0 text-[0.625rem] text-faint">
                {i + 1}
              </span>

              <button
                type="button"
                onClick={() => onToggleGame(id)}
                aria-pressed={on}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors"
                style={{
                  borderColor: on ? game.hue : "var(--color-hairline)",
                  color: on ? game.hue : "var(--color-faint)",
                  background: on
                    ? `color-mix(in srgb, ${game.hue} 12%, transparent)`
                    : "transparent",
                }}
              >
                <span className="truncate">{game.name}</span>
              </button>

              {/* Rendered at the ends too, and inert there. A control that
                  disappears on the first row slides the other one under the
                  finger that was aiming at it. */}
              <Nudge
                label={`Move ${game.name} up (${i + 1} of ${games.length})`}
                disabled={i === 0}
                onClick={() => onReorder(i, i - 1)}
                d="M8 3.5l4.5 5h-9z"
              />
              <Nudge
                label={`Move ${game.name} down (${i + 1} of ${games.length})`}
                disabled={i === games.length - 1}
                onClick={() => onReorder(i, i + 1)}
                d="M8 12.5l-4.5-5h9z"
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One arrow. Disabled at the ends rather than removed — see above. */
function Nudge({
  label,
  disabled,
  onClick,
  d,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-6 shrink-0 place-items-center rounded-md border border-hairline transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-25"
          : "text-muted hover:border-faint hover:text-ink"
      }`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-2.5">
        <path d={d} fill="currentColor" />
      </svg>
    </button>
  );
}
