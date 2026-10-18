import { useEffect, useState } from "react";
import { freshness } from "../../../shared/feed.ts";
import type { CodesFeed } from "../../../shared/codes.ts";
import { REDEEM } from "../../../shared/redeem.ts";
import type { GameId } from "../../../shared/schema.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import { newCodes } from "../../state/reader/codes.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import { formatInZone } from "../../state/displayTime.ts";
import type { ActionHandler } from "./GameSettings.tsx";
export function CodesPage({
  game,
  feed,
  state,
  onAction,
}: {
  game: string;
  feed: CodesFeed | null;
  state: ReaderState;
  onAction: ActionHandler;
}) {
  const [message, setMessage] = useState("");
  const accounts = Object.values(state.accounts).filter(
    (a) => a.game === game && !a.retiredAt,
  );
  const codes = feed?.codes.filter((c) => c.game === game) ?? [];
  const redeem = REDEEM[game as GameId];
  const unseen = feed ? newCodes(feed, state.codeSeen[game] ?? [], game) : [];
  useEffect(() => {
    if (unseen.length)
      void onAction({
        type: "seen",
        kind: "codeSeen",
        id: game,
        ids: unseen.map((c) => c.id),
        ...actionMeta(),
      });
  }, [game, feed, onAction]);
  return (
    <section className="codes-page">
      <h2>Redeem codes</h2>
      <p className="help">
        New-code notices are separate from redemption. Mark codes redeemed for
        each account you play.
      </p>
      {redeem && (
        <div className="redeem-where">
          {redeem.url && (
            <a
              className="commit"
              href={redeem.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Redeem on the official site ↗
            </a>
          )}
          <p>
            <span>{redeem.url ? "Or in game:" : "Redeem in game:"}</span>{" "}
            {redeem.inGame}
          </p>
        </div>
      )}
      <p role="status">{message}</p>
      {feed &&
        freshness(
          feed.sources.filter((s) => s.game === game),
          Date.now(),
        ).stale.length > 0 && (
          <p className="help">
            Code data may be out of date. Check the linked source before relying
            on a code's availability.
          </p>
        )}
      {!feed ? (
        <p>The codes feed is unavailable. Event tracking is still available.</p>
      ) : !codes.length ? (
        <p>No published codes are available for this game.</p>
      ) : (
        codes.map((c) => (
          <article className="code-row" key={c.id}>
            <div>
              <code>{c.code}</code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(c.code);
                    setMessage(`Copied ${c.code}.`);
                  } catch {
                    setMessage(
                      "Could not copy automatically. Select the code to copy it.",
                    );
                  }
                }}
              >
                Copy
              </button>
              {c.reward && <p>{c.reward}</p>}
              <small>
                {c.expiresAt
                  ? `Expires ${formatInZone(c.expiresAt, true, typeof state.prefs.timezone === "string" ? state.prefs.timezone : null)}`
                  : c.expiresOn
                    ? `Expires on ${c.expiresOn} (time not stated)`
                    : "Expiry not announced"}{" "}
                ·{" "}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                  Source
                </a>
              </small>
            </div>
            <div>
              {accounts.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(state.codeRedeemed[a.id]?.[c.id])}
                    onChange={(e) =>
                      void onAction({
                        type: "redeem",
                        accountId: a.id,
                        codeId: c.id,
                        redeemed: e.target.checked,
                        ...actionMeta(),
                      })
                    }
                  />
                  Redeemed
                  {/* The server only when there is more than one to tell apart. */}
                  {accounts.length > 1 && ` · ${a.region}`}
                </label>
              ))}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
