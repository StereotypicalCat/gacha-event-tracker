import { useState } from "react";
import { useGameMeta } from "../state/gameMeta.tsx";
import type { LaneId } from "../../shared/custom.ts";

/**
 * First run: pick your games.
 *
 * Asked once, before any events are shown, because a calendar full of games you
 * don't play is worse than an empty one — it buries the thing you came for.
 *
 * Nothing is preselected. An empty state with a disabled button is clearer than
 * guessing on the reader's behalf and hoping they notice.
 */
export function Welcome({
  available,
  onConfirm,
}: {
  available: LaneId[];
  onConfirm: (chosen: LaneId[]) => void;
}) {
  const gameMeta = useGameMeta();
  const [chosen, setChosen] = useState<LaneId[]>([]);

  const toggle = (id: LaneId) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );

  return (
    <div className="flex min-h-full flex-col px-5 py-12">
      <p className="font-display text-[0.9375rem] font-bold tracking-[0.02em]">
        EVENT<span className="text-near">CLOCK</span>
      </p>

      <h1 className="mt-8 max-w-sm font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight">
        Which games do you play?
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        You'll only see events for these. Change it any time — nothing is saved
        anywhere but this browser.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {available.map((id) => {
          const game = gameMeta(id);
          const on = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={on}
              className="game-pick flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left"
              style={{
                ["--hue" as string]: game.hue,
                borderColor: on ? game.hue : "var(--color-hairline)",
                background: on
                  ? `color-mix(in srgb, ${game.hue} 12%, transparent)`
                  : "transparent",
              }}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full transition-transform duration-150"
                style={{
                  background: on ? game.hue : "var(--color-hairline)",
                  transform: on ? "scale(1.25)" : "scale(1)",
                }}
              />
              <span
                className="flex-1 text-[0.9375rem] font-medium"
                style={{ color: on ? game.hue : "var(--color-muted)" }}
              >
                {game.name}
              </span>
              {on && (
                <svg viewBox="0 0 16 16" className="size-4" style={{ color: game.hue }} aria-hidden>
                  <path
                    d="M2.5 8.5l3.5 3.5 7.5-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onConfirm(chosen)}
          className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-ground transition-colors duration-150 hover:bg-white disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint"
        >
          {chosen.length === 0
            ? "Pick at least one game"
            : `Show my ${chosen.length === 1 ? "game" : `${chosen.length} games`}`}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(available)}
          className="text-xs text-faint transition-colors duration-150 hover:text-muted"
        >
          Show everything instead
        </button>
      </div>

      <p className="mt-auto pt-10 text-xs leading-relaxed text-faint">
        More games are coming as sources are added. Anything you switch on later
        shows up automatically.
      </p>
    </div>
  );
}
