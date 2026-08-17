/**
 * "A new version is ready."
 *
 * The one thing this app sells is that what it shows you is current, and a
 * cache-first shell quietly breaks that promise for its most loyal reader — the
 * one who never closes the tab. This is the disclosure, in the same spirit as
 * the offline banner: say what is true, then let them choose.
 *
 * It is an offer, never a swap. Reloading mid-sentence while someone types their
 * own event in would be the app taking a decision that costs them work, so the
 * reader picks the moment. Dismissing is free — nothing they have marked, typed
 * or ticked lives in the bundle, and the offer comes back next load.
 *
 * Sits a toast's height up from the bottom edge so an undo toast can never land
 * on top of it, and low enough to be reachable with a thumb.
 */
export function UpdateNotice({
  applying,
  onApply,
  onDismiss,
}: {
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-hairline bg-raised px-4 py-3 shadow-lg">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-near" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
          A new version of Event Clock is ready.{" "}
          <span className="text-faint">
            Your marks and notes are kept — reloading only loses your place on
            the page.
          </span>
        </p>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-near transition-colors duration-150 hover:text-ink disabled:text-faint"
        >
          {applying ? "Reloading…" : "Reload"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          className="shrink-0 text-faint transition-colors duration-150 hover:text-muted"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
