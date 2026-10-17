import type { CodesFeed } from "../../../shared/codes.ts";
import { serverSuffix } from "../../state/reader/servers.ts";
import { newCodes } from "../../state/reader/codes.ts";
import { trackedGames } from "../../state/reader/updates.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import {
  MAX_SNOOZE_DAYS,
  staleSnooze,
  updateItems,
} from "../../state/reader/updates.ts";
const SNOOZE_DAYS = [1, 3, MAX_SNOOZE_DAYS];
import { actionMeta } from "../../state/reader/actions.ts";
import type { EventFeed } from "../../../shared/feed.ts";
import { metaFor } from "../../../shared/games.ts";
import type { ActionHandler } from "./GameSettings.tsx";
export function UpdatesPanel({
  state,
  feed,
  now,
  onSources,
  onAction,
  codes = null,
  onCodes,
}: {
  state: ReaderState;
  feed: EventFeed;
  now: number;
  onSources: () => void;
  onAction: ActionHandler;
  codes?: CodesFeed | null;
  onCodes?: (game: string) => void;
}) {
  const items = updateItems(state, feed, now);
  if (codes)
    for (const game of trackedGames(state)) {
      const found = newCodes(codes, state.codeSeen[game] ?? [], game);
      if (found.length)
        items.push({ kind: "codes", game, ids: found.map((c) => c.id) });
    }
  if (!items.length) return null;
  return (
    <section className="updates-panel" aria-label="Updates">
      {items.map((item, i) =>
        item.kind === "sources" ? (
          <div className="update-row" key={i}>
            <strong>Event data may be out of date</strong>
            <span>
              For games you track:{" "}
              {item.games.map((g) => metaFor(g, {}).name).join(", ")}
            </span>
            <button type="button" onClick={onSources}>
              Details & reasons
            </button>
            <span className="snooze" role="group" aria-label="Hide this notice">
              Hide for
              {SNOOZE_DAYS.map((days) => (
                <button
                  type="button"
                  key={days}
                  onClick={() =>
                    void onAction({
                      type: "prefs",
                      patch: {
                        staleSnooze: staleSnooze(item.games, now, days),
                      },
                      ...actionMeta(),
                    })
                  }
                >
                  {days} day{days === 1 ? "" : "s"}
                </button>
              ))}
            </span>
          </div>
        ) : item.kind === "events" ? (
          <div className="update-row" key={i}>
            <strong>New since you last looked</strong>
            <span>
              {item.ids.length} event{item.ids.length === 1 ? "" : "s"}
              {state.accounts[item.accountId] &&
                ` · ${metaFor(state.accounts[item.accountId]!.game, {}).name}`}
              {state.accounts[item.accountId] &&
                serverSuffix(
                  state,
                  state.accounts[item.accountId]!.game,
                  state.accounts[item.accountId]!.region,
                )}
            </span>
            <button
              type="button"
              onClick={() =>
                void onAction({
                  type: "seen",
                  kind: "eventSeen",
                  id: item.accountId,
                  ids: item.ids,
                  ...actionMeta(),
                })
              }
            >
              Got it
            </button>
          </div>
        ) : (
          <div className="update-row" key={i}>
            <strong>New redeem codes</strong>
            <span>
              {item.ids.length} · {metaFor(item.game, {}).name}
            </span>
            <button type="button" onClick={() => onCodes?.(item.game)}>
              View codes
            </button>
          </div>
        ),
      )}
    </section>
  );
}
