import { useEffect, useRef, useState } from "react";

/** How long the grand celebration stays mounted: the last wave's sparks included. */
export const CELEBRATION_MS = 2600;

/**
 * Counts up when a section has just been finished: everything in it done,
 * more done than a moment ago, and the same number of things as before. That
 * is the live strip's rule (Dailies.tsx): a list that got shorter (focusing a
 * game, unpinning) or a page that opens already complete is not the reader
 * finishing anything, so neither celebrates.
 */
export function useSectionCelebration(total: number, done: number): number {
  const [burst, setBurst] = useState(0);
  const previous = useRef<{ total: number; done: number } | null>(null);
  const complete = total > 0 && done === total;
  useEffect(() => {
    const was = previous.current;
    previous.current = { total, done };
    if (was === null || !complete) return;
    if (was.total === total && done > was.done) setBurst((n) => n + 1);
  }, [total, done, complete]);
  useEffect(() => {
    if (burst === 0) return;
    const id = setTimeout(() => setBurst(0), CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [burst]);
  return burst;
}
