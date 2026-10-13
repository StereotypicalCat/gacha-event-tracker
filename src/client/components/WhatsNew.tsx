import { KIND_LABEL, type Entry } from "../../shared/changelog.ts";
import { asOfLabel } from "../../shared/routines.ts";

/** At most this many lines on the card; the rest are a tap away. */
const SHOWN = 5;

/**
 * What changed since the reader last looked (PRD F18).
 *
 * Shown in the new version, after the reload — the update notice (F14) is the
 * old bundle and cannot know what the new one brings. Top of the main column,
 * never in the rail: the rail holds what the reader has to *do*, and this is
 * something to read once. Never modal; "Got it" records the newest entry.
 */
export function WhatsNew({
  entries,
  onDismiss,
  onSeeAll,
}: {
  /** Unseen entries, newest first. */
  entries: readonly Entry[];
  onDismiss: () => void;
  onSeeAll: () => void;
}) {
  if (entries.length === 0) return null;
  const more = entries.length - SHOWN;

  return (
    <section aria-labelledby="whats-new" className="border-b border-hairline px-4 py-4">
      <h2 id="whats-new" className="eyebrow">
        What's new
      </h2>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {entries.slice(0, SHOWN).map((entry) => (
          <li key={entry.id} className="flex items-baseline gap-2 text-sm">
            <span className="w-24 shrink-0 text-[0.6875rem] text-faint">
              {KIND_LABEL[entry.kind]}
            </span>
            <span className="min-w-0 flex-1 text-muted">{entry.title}</span>
            <span className="tnum hidden shrink-0 text-[0.6875rem] text-faint sm:inline">
              {asOfLabel(entry.date)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-3 text-xs">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-near/70 bg-near/15 px-3 py-1 font-medium text-near"
        >
          Got it
        </button>
        <button
          type="button"
          onClick={onSeeAll}
          className="text-faint transition-colors hover:text-muted"
        >
          {more > 0 ? `See all (${more} more)` : "See all"}
        </button>
      </div>
    </section>
  );
}
