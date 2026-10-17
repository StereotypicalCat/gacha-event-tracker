import type { CSSProperties } from "react";
import { useGameMeta } from "../../state/gameMeta.tsx";
import type { ComponentProps } from "react";
import type { GameFocus } from "../GameFocus.tsx";
export function FocusPicker({
  games,
  focus,
  counts,
  total,
  next,
  onFocus,
  onAdvance,
}: ComponentProps<typeof GameFocus>) {
  const meta = useGameMeta();
  if (games.length < 2) return null;
  return (
    <section className="game-focus">
      <div className="focus-heading">
        <h2>Focus</h2>
        <button onClick={onAdvance}>
          {next === null ? "Show all games" : `Next: ${meta(next).short}`}{" "}
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="focus-pills" role="group" aria-label="Focus on one game">
        {[null, ...games].map((g) => (
          <button
            key={g ?? "all"}
            className="focus-pill"
            style={
              { "--hue": g ? meta(g).hue : "var(--color-ink)" } as CSSProperties
            }
            aria-label={g ? meta(g).name : "All games"}
            aria-pressed={focus === g}
            data-empty={(g !== null && (counts[g] ?? 0) === 0) || undefined}
            onClick={() => onFocus(focus === g ? null : g)}
          >
            {g ? meta(g).short : "All"}
            <span className="n">{g ? (counts[g] ?? 0) : total}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** `prefs.focusBar`: where the focus bar appears. Absent means both views. */
export function focusBarShown(
  prefs: Record<string, unknown>,
  view: string,
): boolean {
  const bar = prefs.focusBar;
  if (typeof bar !== "object" || bar === null) return true;
  const key = view === "timeline" ? "timeline" : "checklist";
  return (bar as Record<string, unknown>)[key] !== false;
}
