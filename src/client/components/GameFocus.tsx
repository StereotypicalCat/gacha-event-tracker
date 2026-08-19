import { useGameMeta } from "../state/gameMeta.tsx";
import type { LaneId } from "../../shared/custom.ts";

/**
 * One game at a time.
 *
 * The settings panel already lets a reader switch games on and off, but that is
 * a different job: it says which games they play, and it is set once. This is
 * the thing a reader does *while reading* — clear the deck down to one game,
 * finish it, move to the next. Doing that with the on/off switches means two
 * taps per game and a settings panel that no longer describes what they play.
 *
 * So focus is a lens, not a setting: it never changes which games are switched
 * on, "All" is always one tap away, and the rotation ends by returning to All
 * rather than looping forever.
 */
export function GameFocus({
  games,
  focus,
  counts,
  total,
  next,
  onFocus,
  onAdvance,
}: {
  /** Games the reader has switched on, in feed order. */
  games: LaneId[];
  focus: LaneId | null;
  /** Outstanding rows per game, so a chip says whether it is worth a visit. */
  counts: Partial<Record<LaneId, number>>;
  total: number;
  /** Where "next" goes — null means back to all games. */
  next: LaneId | null;
  onFocus: (game: LaneId | null) => void;
  onAdvance: () => void;
}) {
  const gameMeta = useGameMeta();
  // With one game there is nothing to focus down to, and the bar would just be
  // a chip that does nothing.
  if (games.length < 2) return null;

  return (
    <section className="border-b border-hairline px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Focus</p>
        <button
          type="button"
          onClick={onAdvance}
          className="shrink-0 text-[0.6875rem] font-medium text-faint transition-colors hover:text-ink"
        >
          {next === null ? "Show all games" : `Next: ${gameMeta(next).short}`}
          <span aria-hidden> →</span>
        </button>
      </div>

      {/* A scrolling strip where the bar is as wide as the page, wrapped rows
          where it is a 20rem rail: a thirteen-game reader would otherwise get
          four chips and a hairline scrollbar, and a game you cannot see is a
          game you will not focus. The rail is short and the list beside it is
          long, so the rows cost nothing that column was using. */}
      <div
        role="group"
        aria-label="Focus on one game"
        // `pt-1` is the lift's headroom, not spacing: `scroll-x` sets
        // `overflow-x: auto`, which computes the vertical axis to `auto` as
        // well, so a chip that rises a pixel under the cursor loses that pixel
        // and its ring to the scroller's edge. `mt` gives the same total gap
        // back.
        className="scroll-x -mx-4 mt-1 flex gap-1.5 px-4 pb-1 pt-1 lg:flex-wrap"
      >
        <Chip
          label="All"
          count={total}
          on={focus === null}
          hue="var(--color-ink)"
          onClick={() => onFocus(null)}
        />
        {games.map((id) => {
          const game = gameMeta(id);
          return (
            <Chip
              key={id}
              label={game.short}
              ariaLabel={game.name}
              count={counts[id] ?? 0}
              on={focus === id}
              hue={game.hue}
              // Tapping the focused game backs out to all of them, so the chip
              // that got you here is also the way back.
              onClick={() => onFocus(focus === id ? null : id)}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * A game chip.
 *
 * Carries its hue whether or not it is selected — dimmer when it is not — so
 * the row reads as a set of games at a glance rather than as one coloured chip
 * among a row of grey ones. The count is what makes it worth tapping: a game
 * with nothing outstanding says so before you visit it.
 */
function Chip({
  label,
  ariaLabel,
  count,
  on,
  hue,
  onClick,
}: {
  label: string;
  ariaLabel?: string | undefined;
  count: number;
  on: boolean;
  hue: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={`${ariaLabel ?? label}, ${count} outstanding`}
      // The dailies strip's hover, and for the same reason: these colours are a
      // game's hue, so they arrive inline where no rule can reach them, and
      // `.hue-chip` works off `--hue` and the `aria-pressed` above instead.
      className="hue-chip flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        ["--hue" as string]: hue,
        borderColor: on ? hue : `color-mix(in srgb, ${hue} 30%, transparent)`,
        color: on ? hue : "var(--color-muted)",
        background: on
          ? `color-mix(in srgb, ${hue} 14%, transparent)`
          : "transparent",
        // Nothing to do here — still reachable, just not competing for the eye.
        opacity: count === 0 && !on ? 0.5 : 1,
      }}
    >
      <span className="hue-chip-label">{label}</span>
      <span className="tnum text-[0.625rem] opacity-70">{count}</span>
    </button>
  );
}
