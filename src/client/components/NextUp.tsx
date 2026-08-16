import { gameMeta } from "../../shared/games.ts";
import { formatRemaining } from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { Meter, URGENCY_COLOR } from "./Meter.tsx";

/**
 * The thesis of the page: this app is a clock, so the first thing you see is
 * the single event closest to expiring, at a size nothing else competes with.
 *
 * Deliberately not a stat grid. One number, because the reader has exactly one
 * question on arrival.
 */
export function NextUp({
  row,
  focused,
  onOpen,
}: {
  /**
   * The soonest-expiring event the reader has neither finished nor ignored.
   * A panel headed "next to expire" is a deadline they still have to meet, so
   * an event they already ticked off does not belong in it however visible
   * they have chosen to keep it elsewhere.
   */
  row: RowEvent | null;
  /** Name of the game being focused on, when the page is narrowed to one. */
  focused: string | null;
  onOpen: (id: string) => void;
}) {
  if (row === null) {
    return (
      <section className="border-b border-hairline px-4 py-8">
        <p className="eyebrow">Nothing running</p>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {focused === null
            ? "Nothing live and unfinished in the games you have switched on. Turn a game back on below, or check again after the next patch."
            : `Nothing live and unfinished in ${focused}. Move to the next game, or show all of them.`}
        </p>
      </section>
    );
  }

  const { event, clock } = row;
  const game = gameMeta(event.game);
  const heat = URGENCY_COLOR[clock.urgency];
  const known = clock.msRemaining !== null;

  return (
    <section className="relative overflow-hidden border-b border-hairline px-4 pb-6 pt-5">
      {/* A wash of the urgency colour, so the panel itself changes temperature
          as the deadline closes in. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-[0.16] blur-2xl"
        style={{ background: `radial-gradient(60% 100% at 50% 100%, ${heat}, transparent)` }}
      />

      <div className="relative">
        <p className="eyebrow">Next to expire</p>

        <button
          type="button"
          onClick={() => onOpen(event.id)}
          className="mt-2 block max-w-full text-left"
        >
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight">
            {event.title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: game.hue }}>
            {game.name}
          </p>
        </button>

        <div className="mt-5 flex items-end justify-between gap-4">
          <p
            className="tnum font-display text-[2.75rem] font-bold leading-none tracking-tight"
            style={{ color: known ? heat : "var(--color-faint)" }}
          >
            {known ? formatRemaining(clock.msRemaining ?? 0) : "unknown"}
          </p>
          <p className="pb-1 text-right text-xs leading-tight text-muted">
            {known ? "left" : "no end date"}
            <br />
            {known ? "to finish it" : "announced"}
          </p>
        </div>

        <div className="mt-4">
          <Meter
            progress={clock.progress}
            urgency={clock.urgency}
            label={`${event.title} time remaining`}
          />
        </div>
      </div>
    </section>
  );
}
