import { useState } from "react";
import type { CustomEvent, CustomEvents, CustomGames, LaneId } from "../../shared/custom.ts";
import { formatAbsolute } from "../../shared/time.ts";
import type { EventDraft } from "../state/useCustom.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { cadenceLabel, EventForm, GameForm } from "./CustomForms.tsx";

/**
 * The reader's own games and events — a group of the settings panel (PRD F13).
 *
 * Their events are still *managed* from the event itself — open one and the
 * detail sheet offers edit and delete, exactly where you would look for them.
 * What lives here is the way back **to** it, which the rest of the app cannot
 * offer: every list and the board drop an event once it has ended, so a
 * one-off of the reader's own became unreachable the day it finished —
 * impossible to edit, and impossible to delete out of a store nothing else can
 * reach. This index is the only surface that shows an event whatever state it
 * is in.
 */

/**
 * What a row says about itself, beyond its title.
 *
 * The job is to explain why an event is not on any other surface, because a
 * list of bare titles leaves the reader guessing which of two entries is the
 * dead one. A repeating event says how often instead of when: its dates roll
 * forward, so printing one would disagree with the row they would find if they
 * went looking.
 */
export function eventCaption(event: CustomEvent, nowMs: number): string {
  const cadence = cadenceLabel(event.repeat);
  if (cadence !== null) {
    // A series that has stopped is exactly what this list exists to explain,
    // and a healthy-looking cadence explains nothing: the reader would see
    // "on a weekly cycle" and no reason it is missing from the board.
    const until = event.repeat?.until ?? null;
    if (until !== null && Date.parse(until) < nowMs) {
      return `stopped ${formatAbsolute(Date.parse(until), false)}`;
    }
    return cadence;
  }

  if (event.endsAt !== null && Date.parse(event.endsAt) < nowMs) {
    return `ended ${formatAbsolute(Date.parse(event.endsAt), false)}`;
  }
  if (Date.parse(event.startsAt) > nowMs) {
    return `starts ${formatAbsolute(Date.parse(event.startsAt), false)}`;
  }
  return event.endsAt === null
    ? "no end date"
    : `until ${formatAbsolute(Date.parse(event.endsAt), false)}`;
}

export function YourOwn({
  games,
  events,
  lanes,
  onAddGame,
  onEditGame,
  onRemoveGame,
  onAddEvent,
  now,
  onOpen,
}: {
  games: CustomGames;
  events: CustomEvents;
  /** Every lane an event may be filed under, tracked games included. */
  lanes: LaneId[];
  onAddGame: (name: string, hue: string) => void;
  onEditGame: (id: string, name: string, hue: string) => void;
  onRemoveGame: (id: string) => { removed: boolean; blockedBy: number };
  onAddEvent: (draft: EventDraft) => void;
  now: number;
  /**
   * Open one of their events. Takes the stored id — a rule's, not an
   * occurrence's — and the caller resolves it to whichever row the sheet can
   * actually show.
   */
  onOpen: (id: string) => void;
}) {
  const gameMeta = useGameMeta();
  const [adding, setAdding] = useState<"game" | "event" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const list = Object.values(games);
  // An event may be filed under a game we track — a source can miss one — and
  // those have no row above to nest under. Listing them separately is what
  // keeps this index complete: an ended event under Genshin is on no other
  // surface either, and would be just as stuck. It also catches an event whose
  // own lane has since gone, which `removeGame` refuses to cause but an import
  // can still deliver — hence "another game" rather than "a game we track",
  // which would be false for exactly that row.
  const underTracked = Object.values(events).filter(
    (e) => games[e.game] === undefined,
  );

  return (
    // No heading or rule of its own: this is the body of a settings group that
    // already carries both, and drew a second border under the first one.
    <div>
      <p className="max-w-md text-xs leading-relaxed text-faint">
        Track something this app doesn't cover, or an event a source missed. Your
        dates are yours — they're never presented as coming from a wiki, and they
        travel in your export.
      </p>

      {list.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {list.map((game) => {
            const mine = Object.values(events).filter((e) => e.game === game.id);
            const held = mine.length;
            return (
              <li key={game.id}>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: game.hue }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{game.name}</span>
                  <span className="shrink-0 text-xs text-faint">
                    {held === 0
                      ? "no events yet"
                      : `${held} event${held > 1 ? "s" : ""}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(editing === game.id ? null : game.id);
                      setRefusal(null);
                    }}
                    className="shrink-0 text-xs text-faint transition-colors hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const result = onRemoveGame(game.id);
                      // Refused rather than cascading: deleting a lane should
                      // not quietly take a fortnight of events with it.
                      setRefusal(
                        result.removed
                          ? null
                          : `${game.name} still has ${result.blockedBy} event${
                              result.blockedBy > 1 ? "s" : ""
                            }. Delete those first.`,
                      );
                    }}
                    className="shrink-0 text-xs text-faint transition-colors hover:text-critical"
                  >
                    Delete
                  </button>
                </div>

                {/* Indented under its game rather than in one flat list,
                    because the games are already the structure here and a
                    reader looking for an event of theirs knows which game they
                    filed it under. */}
                {mine.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1 border-l border-hairline pl-3">
                    {mine.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(event.id)}
                          className="flex w-full items-baseline gap-2 text-left transition-colors hover:text-ink"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-muted">
                            {event.title}
                          </span>
                          <span className="shrink-0 text-xs text-faint">
                            {eventCaption(event, now)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {editing === game.id && (
                  <GameForm
                    initial={{ name: game.name, hue: game.hue }}
                    onSave={(name, hue) => {
                      onEditGame(game.id, name, hue);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Its own heading rather than trailing the list above, which read as
          though these belonged to whichever game happened to be last. */}
      {underTracked.length > 0 && (
        <p className="mt-4 text-xs text-faint">Filed under another game</p>
      )}
      {underTracked.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {underTracked.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onOpen(event.id)}
                className="flex w-full items-baseline gap-2 text-left transition-colors hover:text-ink"
              >
                <span className="shrink-0 text-xs text-faint">
                  {gameMeta(event.game).short}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {event.title}
                </span>
                <span className="shrink-0 text-xs text-faint">
                  {eventCaption(event, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {refusal !== null && (
        <p className="mt-2 text-xs leading-relaxed text-critical">{refusal}</p>
      )}

      {adding === "game" && (
        <GameForm
          onSave={(name, hue) => {
            onAddGame(name, hue);
            setAdding(null);
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      {adding === "event" && (
        <EventForm
          lanes={lanes}
          customGames={games}
          onSave={(draft) => {
            onAddEvent(draft);
            setAdding(null);
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      {adding === null && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setAdding("game")}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            Add a game
          </button>
          <button
            type="button"
            onClick={() => setAdding("event")}
            disabled={lanes.length === 0}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            Add an event
          </button>
        </div>
      )}
    </div>
  );
}
