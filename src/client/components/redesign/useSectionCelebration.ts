import { useContext, useEffect, useRef, useState } from "react";
import { CelebrationsContext } from "../Fireworks.tsx";

/** How long the grand celebration stays mounted: the last wave's sparks included. */
export const CELEBRATION_MS = 2600;

/**
 * Whether completing one more item now finishes the section: that item gets
 * the section's grand celebration, not its own small burst on top.
 */
export function finishesSection(total: number, done: number): boolean {
  return total > 0 && done === total - 1;
}

/**
 * Counts up when a section has just been finished: everything in it done,
 * more done than a moment ago, and the same number of things as before. That
 * is the live strip's rule (Dailies.tsx): a list that got shorter (focusing a
 * game, unpinning) or a page that opens already complete is not the reader
 * finishing anything, so neither celebrates. With celebrations switched off
 * it stays at 0, so the sweep and the "All done" pop go too.
 */
export function useSectionCelebration(total: number, done: number): number {
  const on = useContext(CelebrationsContext);
  const [burst, setBurst] = useState(0);
  const previous = useRef<{ total: number; done: number } | null>(null);
  const complete = total > 0 && done === total;
  useEffect(() => {
    const was = previous.current;
    previous.current = { total, done };
    if (was === null || !complete || !on) return;
    if (was.total === total && done > was.done) setBurst((n) => n + 1);
  }, [total, done, complete, on]);
  useEffect(() => {
    if (burst === 0) return;
    const id = setTimeout(() => setBurst(0), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [burst]);
  return on ? burst : 0;
}
