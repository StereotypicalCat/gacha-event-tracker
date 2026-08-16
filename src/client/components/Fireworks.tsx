/**
 * A small burst, for the one moment in this app that is unambiguously good
 * news: every daily ticked off before the reset.
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

export function Fireworks() {
  return (
    <div aria-hidden className="fireworks">
      {BURSTS.map((burst, b) => (
        <span
          key={b}
          className="firework"
          style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
        >
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              className="spark"
              style={{
                ["--a" as string]: `${(360 / SPARKS) * i + b * 13}deg`,
                // Uneven reach, so it reads as a burst rather than a wheel.
                ["--d" as string]: `${16 + ((i * 7) % 13)}px`,
                ["--delay" as string]: `${burst.delay}ms`,
                background: COLORS[(i + b) % COLORS.length] ?? "var(--color-ink)",
              }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
