import type { ReactNode } from "react";
import { Fireworks } from "../Fireworks.tsx";
import { useSectionCelebration } from "./useSectionCelebration.ts";

export function RoutineGroup({
  title,
  policy,
  focused,
  children,
  hue,
  summary,
  done,
  total,
}: {
  title: string;
  hue?: string;
  summary?: string;
  policy: "collapsed" | "expanded" | "always";
  focused: boolean;
  children: ReactNode;
  /** Met routines in the group; with `total`, finishing them all celebrates. */
  done?: number;
  total?: number;
}) {
  const burst = useSectionCelebration(total ?? 0, done ?? 0);
  const complete = total !== undefined && total > 0 && done === total;
  const shared = {
    className: "routine-group",
    style: { color: hue },
    "data-complete": complete || undefined,
    "data-celebrate": burst > 0 || undefined,
  };
  const celebration = burst > 0 && <Fireworks key={burst} grand hue={hue} />;
  return policy === "always" ? (
    <section {...shared}>
      {celebration}
      <h3>
        {title}
        <small>{summary}</small>
      </h3>
      {children}
    </section>
  ) : (
    <details {...shared} open={focused || policy === "expanded"}>
      <summary>
        {title}
        <small>{summary}</small>
      </summary>
      {celebration}
      {children}
    </details>
  );
}
