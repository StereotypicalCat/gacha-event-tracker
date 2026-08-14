import type { Urgency } from "../../shared/time.ts";

const TICKS = 24;

export const URGENCY_COLOR: Record<Urgency, string> = {
  expired: "var(--color-faint)",
  critical: "var(--color-critical)",
  soon: "var(--color-soon)",
  near: "var(--color-near)",
  calm: "var(--color-calm)",
};

interface MeterProps {
  /** 0–1 through the event's own window. Null when the end is unannounced. */
  progress: number | null;
  urgency: Urgency;
  /** Suppresses the entry animation for long lists. */
  animate?: boolean | undefined;
  label: string;
}

/**
 * The depletion meter — this interface's signature element.
 *
 * A discrete tick-strip rather than a smooth bar, borrowed from the stamina
 * meters these games all use. Ticks read as a countable resource in a way a
 * continuous bar does not, which is the right metaphor: what is left is
 * finite and visibly draining.
 *
 * An event with no announced end gets a hatched strip instead of a filled one.
 * It must not look like a full meter — "we don't know" and "loads of time" are
 * different facts and conflating them is the failure this product avoids.
 */
export function Meter({ progress, urgency, animate = true, label }: MeterProps) {
  const unknown = progress === null;
  const remainingTicks = unknown
    ? 0
    : Math.max(0, Math.round((1 - progress) * TICKS));

  return (
    <div
      className="meter"
      role="img"
      aria-label={label}
      style={{ ["--tick" as string]: URGENCY_COLOR[urgency] }}
    >
      {Array.from({ length: TICKS }, (_, i) => {
        // Ticks drain from the right, so the surviving run sits at the left
        // edge and rows align into a readable ramp down the list.
        const live = i < remainingTicks;
        return (
          <span
            key={i}
            className="meter-tick"
            data-live={live}
            data-unknown={unknown}
            style={
              animate ? { animationDelay: `${Math.min(i, 12) * 14}ms` } : undefined
            }
          />
        );
      })}
    </div>
  );
}
