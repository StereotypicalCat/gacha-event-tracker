import { EFFORT_LIST, type Effort } from "../../shared/effort.ts";
import type { Status } from "../state/useProgress.ts";

const STATUSES: Array<{ id: Status | undefined; label: string }> = [
  { id: undefined, label: "Not started" },
  { id: "doing", label: "Doing it" },
  { id: "done", label: "Done" },
];

/**
 * Where the reader is with an event, and how much work they reckon it is.
 *
 * Both are optional and both are theirs — nothing is inferred on their behalf.
 * An event with no effort recorded never gets a "you won't finish this"
 * warning, because we would be inventing the estimate the warning rests on.
 */
export function ProgressControls({
  status,
  effort,
  note,
  onStatus,
  onEffort,
  onNote,
}: {
  status: Status | undefined;
  effort: Effort | undefined;
  note: string;
  onStatus: (s: Status | undefined) => void;
  onEffort: (e: Effort | undefined) => void;
  onNote: (n: string) => void;
}) {
  return (
    <div className="mt-5 border-t border-hairline pt-4">
      <p className="eyebrow">Where are you with it?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const on = status === s.id;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onStatus(s.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                on
                  ? "border-near/70 bg-near/15 text-near"
                  : "border-hairline text-faint hover:text-muted"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="eyebrow mt-4">How much work is it?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EFFORT_LIST.map((e) => {
          const on = effort === e.id;
          return (
            <button
              key={e.id}
              type="button"
              // Tapping the current value clears it — the way back from a
              // wrong guess should not need a separate control.
              onClick={() => onEffort(on ? undefined : e.id)}
              aria-pressed={on}
              title={e.hint}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                on
                  ? "border-soon/70 bg-soon/15 text-soon"
                  : "border-hairline text-faint hover:text-muted"
              }`}
            >
              {e.label}
              <span className="ml-1.5 text-[0.6875rem] opacity-70">{e.hint}</span>
            </button>
          );
        })}
      </div>

      <label className="eyebrow mt-4 block" htmlFor="event-note">
        Your notes
      </label>
      <textarea
        id="event-note"
        defaultValue={note}
        onBlur={(e) => onNote(e.target.value)}
        rows={2}
        placeholder="Anything worth remembering — where you got to, what's left."
        className="mt-2 w-full resize-y rounded-lg border border-hairline bg-ground px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-faint focus:outline-none"
      />
    </div>
  );
}
