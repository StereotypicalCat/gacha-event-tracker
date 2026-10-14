/**
 * What *Add an event* and *Add a task* share: one field style, one pill, the
 * row of examples, and the sentence that says why Save is not ready.
 *
 * Kept in one place because the two forms drifted apart while each grew on
 * its own — two paddings for the same input, the same choice drawn as a
 * select in one and as pills in the other.
 */

export const labelClass = "block text-xs font-medium text-muted";

/** DESIGN.md § Inputs: ground fill, hairline border, 8px corners, 8×12 padding, faint on focus. */
export const field =
  "rounded-lg border border-hairline bg-ground px-3 py-2 text-sm text-ink outline-none focus:border-faint";

export function pill(on: boolean): string {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-40 ${
    on ? "border-near/70 bg-near/15 text-near" : "border-hairline text-faint hover:text-muted"
  }`;
}

/**
 * "Still needed: a name and a start date." — or null when nothing is.
 *
 * Save is disabled from the same list this reads, so the sentence and the
 * button cannot disagree. Before it, both forms greyed Save out with no word
 * of why, and a reader had to guess which of a dozen fields it wanted.
 */
export function stillNeededLine(needs: readonly string[]): string | null {
  if (needs.length === 0) return null;
  const list =
    needs.length === 1
      ? needs[0]
      : `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}`;
  return `Still needed: ${list}.`;
}

/**
 * The row of examples a new entry can start from (`src/shared/templates.ts`).
 *
 * Only ever on an add: an entry being edited already has its shape, and
 * re-shaping it from here would be one tap from rewriting a schedule.
 */
export function ExampleRow<T extends { id: string; label: string; hint: string }>({
  examples,
  chosen,
  onChoose,
}: {
  examples: readonly T[];
  chosen: string | null;
  onChoose: (example: T) => void;
}) {
  const hint = examples.find((e) => e.id === chosen)?.hint ?? null;
  return (
    <div className="mb-3">
      <p className={labelClass}>Start from an example</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {examples.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={e.id === chosen}
            onClick={() => onChoose(e)}
            className={pill(e.id === chosen)}
          >
            {e.label}
          </button>
        ))}
      </div>
      {hint !== null && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

/** The line beside Save, when there is anything to say. */
export function StillNeeded({ needs }: { needs: readonly string[] }) {
  const line = stillNeededLine(needs);
  return line === null ? null : (
    <p className="self-center text-xs leading-relaxed text-faint">{line}</p>
  );
}
