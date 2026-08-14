import { useEffect } from "react";

/**
 * A short-lived confirmation with an undo.
 *
 * Ignoring an event makes it vanish, which is exactly what was asked for and
 * also the moment a mistake is least recoverable — the row you would click to
 * undo is the row that just disappeared. The undo lives here instead.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  ms = 7000,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  ms?: number;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, ms);
    return () => clearTimeout(id);
  }, [onDismiss, ms, message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-hairline bg-raised px-4 py-3 shadow-lg">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">{message}</p>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-near transition-colors duration-150 hover:text-ink"
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
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
