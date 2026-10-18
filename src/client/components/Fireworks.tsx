import { createContext, useContext } from "react";

/**
 * A small burst, for finishing something: a daily ticked, a routine met, an
 * event marked completed. Finishing a whole section gets the grand version.
 *
 * Deliberately tiny and deliberately silent — decorative only, `aria-hidden`,
 * and gone in under a second. The text beside it already says "All done", which
 * is what a screen reader gets; this is the same sentence said in colour.
 *
 * Fully off under `prefers-reduced-motion` (see styles.css). A celebration
 * nobody asked for is exactly the kind of motion that setting exists to stop,
 * and the state it celebrates is legible without it.
 */

/**
 * Whether the reader wants celebrations at all (Settings → Appearance). Off
 * means none, big or small; absent means on.
 */
export function celebrationsOn(prefs: Record<string, unknown>): boolean {
  return prefs.celebrations !== false;
}

/** The reader's celebrations switch, provided once at the app's root. */
export const CelebrationsContext = createContext(true);

/**
 * Fixed spark geometry rather than random: the burst looks the same every time,
 * which makes it a piece of the interface rather than a surprise, and keeps it
 * out of the "renders differently on every paint" category.
 */
const BURSTS: Array<{ x: number; y: number; delay: number }> = [
  { x: 18, y: 40, delay: 0 },
  { x: 52, y: 22, delay: 140 },
  { x: 82, y: 52, delay: 260 },
];

const SPARKS = 9;

/** The heat ramp, reused: the palette already means "this app", so it stays. */
const COLORS = [
  "var(--color-near)",
  "var(--color-soon)",
  "var(--color-critical)",
  "var(--color-ink)",
];

/**
 * The grand version, for finishing a whole section (every daily, or every
 * routine in a game's group) rather than one item: more bursts across the
 * section, wider and longer, in waves. Same fixed geometry rule as above.
 */
const GRAND_BURSTS: Array<{ x: number; y: number; delay: number }> = [
  { x: 12, y: 30, delay: 0 },
  { x: 50, y: 18, delay: 120 },
  { x: 86, y: 34, delay: 220 },
  { x: 30, y: 62, delay: 380 },
  { x: 70, y: 66, delay: 480 },
  { x: 20, y: 86, delay: 640 },
  { x: 80, y: 84, delay: 720 },
];
const GRAND_SPARKS = 14;

export function Fireworks({
  grand = false,
  hue,
}: {
  /** The section-complete celebration rather than the single burst. */
  grand?: boolean;
  /** A game's colour to mix into the sparks. */
  hue?: string | undefined;
} = {}) {
  const on = useContext(CelebrationsContext);
  if (!on) return null;
  const bursts = grand ? GRAND_BURSTS : BURSTS,
    sparks = grand ? GRAND_SPARKS : SPARKS,
    colors = hue ? [hue, ...COLORS] : COLORS;
  return (
    <div aria-hidden className={`fireworks${grand ? " grand" : ""}`}>
      {bursts.map((burst, b) => (
        <span
          key={b}
          className="firework"
          style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
        >
          {Array.from({ length: sparks }, (_, i) => (
            <span
              key={i}
              className="spark"
              style={{
                ["--a" as string]: `${(360 / sparks) * i + b * 13}deg`,
                // Uneven reach, so it reads as a burst rather than a wheel.
                ["--d" as string]: grand
                  ? `${34 + ((i * 11) % 34)}px`
                  : `${16 + ((i * 7) % 13)}px`,
                ["--delay" as string]: `${burst.delay}ms`,
                background:
                  colors[(i + b) % colors.length] ?? "var(--color-ink)",
              }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
