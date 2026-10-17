import {
  commitUrl,
  compareUrl,
  KIND_LABEL,
  specUrl,
  type Entry,
  type Note,
} from "../../../shared/changelog.ts";
import { asOfLabel } from "../../../shared/routines.ts";
import { REPO_URL } from "../Colophon.tsx";

const KIND_ORDER: readonly Entry["kind"][] = ["feature", "games", "fix"];

/**
 * The Round 6 B changelog page (`.changelog-page .rel`): a dated, typed entry
 * per release note, its summary, and the commits it covers as a list, with the
 * commit range and design notes beneath. Loose commits follow by month.
 */
export function ChangelogPage({
  notes,
  entries,
}: {
  notes: readonly Note[];
  entries: readonly Entry[];
}) {
  const loose = entries.filter((e) => e.note === undefined);
  const months = [...new Set(loose.map((e) => e.date.slice(0, 7)))];
  return (
    <section className="changelog-page">
      <h1>Changelog</h1>
      <p className="muted-copy">
        Changes and release notes for Event Clock, summarised from the project's
        history and design notes. Each links to the commits it covers.
      </p>
      {notes.map((note) => {
        const covered = entries.filter((e) => e.note === note.id);
        const kinds = KIND_ORDER.filter((k) =>
          covered.some((e) => e.kind === k),
        );
        return (
          <article className="rel" key={note.id}>
            <div className="d">
              {asOfLabel(note.date)}
              {kinds.map((k) => ` · ${KIND_LABEL[k]}`).join("")}
            </div>
            <h3>{note.title}</h3>
            {note.summary.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            {covered.length > 0 && (
              <ul>
                {covered.map((entry) => (
                  <EntryItem key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
            <p className="rel-links">
              <a
                href={compareUrl(REPO_URL, note.from, note.to)}
                target="_blank"
                rel="noreferrer noopener"
              >
                Commits {note.from}…{note.to}
              </a>
              {(note.specs ?? []).map((path) => (
                <a
                  key={path}
                  href={specUrl(REPO_URL, path)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Spec: {path.split("/").at(-1)}
                </a>
              ))}
            </p>
          </article>
        );
      })}
      {months.length > 0 && (
        <section className="rel other-changes">
          <h3>Other changes</h3>
          {months.map((month) => (
            <div key={month}>
              <div className="d">
                {asOfLabel(`${month}-01`).replace(/^1 /, "")}
              </div>
              <ul>
                {loose
                  .filter((e) => e.date.startsWith(month))
                  .map((entry) => (
                    <EntryItem key={entry.id} entry={entry} />
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}

function EntryItem({ entry }: { entry: Entry }) {
  return (
    <li>
      <span className="t">{entry.title}</span>
      <span className="meta">
        <span className={`kind ${entry.kind}`}>{KIND_LABEL[entry.kind]}</span>
        <a
          href={commitUrl(REPO_URL, entry.ref)}
          target="_blank"
          rel="noreferrer noopener"
          className="hash"
        >
          {entry.ref}
        </a>
      </span>
    </li>
  );
}
