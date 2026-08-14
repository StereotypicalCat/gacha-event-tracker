import type { Urgency } from "../../shared/time.ts";
import { URGENCY_COLOR } from "./Meter.tsx";

const STEPS: Array<{ urgency: Urgency; label: string }> = [
  { urgency: "calm", label: "a week+" },
  { urgency: "near", label: "under a week" },
  { urgency: "soon", label: "under 3 days" },
  { urgency: "critical", label: "under a day" },
];

/**
 * What the bars and colours mean, said once.
 *
 * The meter encodes two things at once, and neither is guessable from looking
 * at it. Every row now carries a plain caption ("9 of 12 days left"), which
 * explains the bar; this explains the colour, which no per-row text can.
 *
 * Shown once above the list rather than repeated per row — a legend that
 * appears 50 times is noise, not help.
 */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3">
      <p className="flex items-center gap-2 text-[0.6875rem] leading-none text-faint">
        <span aria-hidden className="flex gap-[2px]">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="h-2.5 w-[3px] rounded-[1px]"
              style={{
                background:
                  i < 5 ? URGENCY_COLOR.near : "var(--color-hairline)",
              }}
            />
          ))}
        </span>
        bars = time left
      </p>

      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] leading-none text-faint">
        <span>colour = ends in</span>
        {STEPS.map((step) => (
          <span key={step.urgency} className="flex items-center gap-1">
            <span
              aria-hidden
              className="size-2 rounded-[1px]"
              style={{ background: URGENCY_COLOR[step.urgency] }}
            />
            {step.label}
          </span>
        ))}
      </p>
    </div>
  );
}
