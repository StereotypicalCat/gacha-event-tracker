import { useEffect } from "react";
import {
  commitUrl,
  compareUrl,
  KIND_LABEL,
  specUrl,
  type Entry,
  type Note,
} from "../../shared/changelog.ts";
import { asOfLabel } from "../../shared/routines.ts";
import { REPO_URL } from "./Colophon.tsx";

const link =
  "underline decoration-hairline underline-offset-2 transition-colors hover:text-ink";

/**
 * The fuller record (PRD F18): release notes, each a few paragraphs from the
 * history and the specs, with the commit range and the specs it draws on, and
 * the short entries it covers listed under it. Entries that belong to no note
 * follow, by month.
 *
 * The detail sheet's shape — the same scrim, the same Escape — because it is
 * the same kind of thing: something opened to read, then closed.
 */
export function ChangelogSheet({
  notes,
  entries,
  onClose,
}: {
  notes: readonly Note[];
  entries: readonly Entry[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loose = entries.filter((e) => e.note === undefined);
  const months = [...new Set(loose.map((e) => e.date.slice(0, 7)))];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close changelog"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Changelog"
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-5 sm:max-w-lg sm:rounded-2xl"
      >
        <h2 className="font-display text-xl font-semibold">Changelog</h2>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          What changed, summarised from the project's history and design notes. Each links to the
          commits it covers.
        </p>

        {notes.map((note) => {
          const covered = entries.filter((e) => e.note === note.id);
          return (
            <article key={note.id} className="mt-6 border-t border-hairline pt-4">
              <p className="eyebrow">{asOfLabel(note.date)}</p>
              <h3 className="mt-1 text-base font-semibold">{note.title}</h3>
              {note.summary.map((paragraph, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
              {covered.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1">
                  {covered.map((entry) => (
                    <EntryLine key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-faint">
                <a
                  href={compareUrl(REPO_URL, note.from, note.to)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={link}
                >
                  commits {note.from}…{note.to}
                </a>
                {(note.specs ?? []).map((path) => (
                  <a
                    key={path}
                    href={specUrl(REPO_URL, path)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={link}
                  >
                    {path.split("/").at(-1)}
                  </a>
                ))}
              </p>
            </article>
          );
        })}

        {months.length > 0 && (
          <section className="mt-6 border-t border-hairline pt-4">
            <h3 className="text-base font-semibold">Other changes</h3>
            {months.map((month) => (
              <div key={month} className="mt-3">
                <p className="eyebrow">{asOfLabel(`${month}-01`).replace(/^1 /, "")}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {loose
                    .filter((e) => e.date.startsWith(month))
                    .map((entry) => (
                      <EntryLine key={entry.id} entry={entry} />
                    ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function EntryLine({ entry }: { entry: Entry }) {
  return (
    <li className="flex items-baseline gap-2 text-xs">
      <span className="w-24 shrink-0 text-faint">{KIND_LABEL[entry.kind]}</span>
      <span className="min-w-0 flex-1 text-muted">{entry.title}</span>
      <a
        href={commitUrl(REPO_URL, entry.ref)}
        target="_blank"
        rel="noreferrer noopener"
        className={`tnum shrink-0 text-faint ${link}`}
      >
        {entry.ref}
      </a>
    </li>
  );
}
