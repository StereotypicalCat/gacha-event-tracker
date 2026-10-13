import { useState } from "react";

/**
 * An amount the reader typed, as a whole non-negative number — or null while
 * the field holds nothing readable yet, which is mid-edit rather than an answer.
 *
 * Separators are stripped because people type the number the game shows, and
 * the game shows `1,900`. Decimals round: no game here counts fractions of an
 * activity point, and a stray `.6` is a typo, not a claim.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s,_]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Where the reader is now against a target: `1,900 / 2,100 points`.
 *
 * Sets the value rather than adding to it, because the game shows a running
 * total and that is the number people have in front of them. Enter saves,
 * Escape cancels, and an empty or unreadable field disables Save rather than
 * saving a zero nobody typed.
 */
export function AmountEditor({
  label,
  value,
  target,
  unit,
  onSave,
  onCancel,
  autoFocus = false,
}: {
  label: string;
  value: number | undefined;
  target: number;
  unit?: string | undefined;
  onSave: (value: number) => void;
  /** Absent where the editor is always open, as in the detail sheet. */
  onCancel?: (() => void) | undefined;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const parsed = parseAmount(draft);

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null) onSave(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel !== undefined) onCancel();
      }}
    >
      <label className="flex items-center gap-2">
        <span>{label}</span>
        <input
          inputMode="numeric"
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="tnum w-20 rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
        />
      </label>
      <span className="tnum">
        / {target.toLocaleString("en-US")}
        {unit ? ` ${unit}` : ""}
      </span>
      <button
        type="submit"
        disabled={parsed === null}
        className="rounded-full border border-near/70 bg-near/15 px-3 py-1 text-xs font-medium text-near disabled:opacity-40"
      >
        Save
      </button>
      {onCancel !== undefined && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-faint transition-colors hover:text-muted"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
