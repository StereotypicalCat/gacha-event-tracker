import { useEffect, useRef, useState } from "react";
import { freshness } from "../../../shared/feed.ts";
import type { CodesFeed, RedeemCode } from "../../../shared/codes.ts";
import { REDEEM } from "../../../shared/redeem.ts";
import type { GameId } from "../../../shared/schema.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import { codeExpired, codeUsed, newCodes } from "../../state/reader/codes.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import { formatInZone } from "../../state/displayTime.ts";
import type { ActionHandler } from "./GameSettings.tsx";
import { shineOn } from "../Fireworks.tsx";
import { motionReduced } from "../../state/appearance.ts";
// A redeemed code shines where it was ticked, then lands among the redeemed.
const SHINE_MS = 800,
  LAND_MS = 360;
/**
 * The open list and the redeemed-or-expired list. A code still shining from
 * the tick that redeemed it holds its place in the open list, not greyed yet.
 */
export function codeLanes<C extends { id: string }>(
  codes: readonly C[],
  done: (c: C) => boolean,
  shining: ReadonlySet<string>,
) {
  const used = (c: C) => done(c) && !shining.has(c.id);
  return {
    open: codes.filter((c) => !used(c)),
    closed: codes.filter(used),
    used,
  };
}
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
  // Redeemed on every server, or past its stated expiry: greyed, below the
  // codes still to use.
  const now = Date.now();
  const done = (c: RedeemCode) =>
    codeExpired(c, now) ||
    codeUsed(
      c,
      accounts.map((a) => a.id),
      state.codeRedeemed,
    );
  // Only the reader's own ticks animate: a code already redeemed, or one that
  // expires by itself, never plays on arrival.
  const [shining, setShining] = useState<ReadonlySet<string>>(new Set());
  const [landing, setLanding] = useState<ReadonlySet<string>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const settle = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  };
  const without = (id: string) => (set: ReadonlySet<string>) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };
  const shine = (id: string) => {
    settle(id);
    setShining((set) => new Set(set).add(id));
    timers.current.set(
      id,
      setTimeout(() => {
        setShining(without(id));
        setLanding((set) => new Set(set).add(id));
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            setLanding(without(id));
          }, LAND_MS),
        );
      }, SHINE_MS),
    );
  };
  const { open, closed, used } = codeLanes(codes, done, shining);
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
  const row = (c: RedeemCode) => (
    <article
      className={used(c) ? "code-row used" : "code-row"}
      key={c.id}
      data-shine={shining.has(c.id) || undefined}
      data-landing={landing.has(c.id) || undefined}
    >
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
          {c.confirmedDead
            ? `Confirmed expired in game, ${c.confirmedDead}.`
            : codeExpired(c, now)
              ? "Expired"
              : c.expiresAt
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
          <label key={a.id} data-fresh={fresh.has(a.id + c.id) || undefined}>
            <input
              type="checkbox"
              checked={Boolean(state.codeRedeemed[a.id]?.[c.id])}
              onChange={(e) => {
                const redeemed = e.target.checked;
                setFresh((set) =>
                  redeemed
                    ? new Set(set).add(a.id + c.id)
                    : without(a.id + c.id)(set),
                );
                if (!redeemed) {
                  settle(c.id);
                  setShining(without(c.id));
                  setLanding(without(c.id));
                } else if (
                  !codeExpired(c, now) &&
                  // Without the shine, or holding still, it moves straight down.
                  shineOn(state.prefs) &&
                  !motionReduced(state.prefs) &&
                  // This tick is the last server still to redeem it.
                  accounts.every(
                    (o) => o.id === a.id || state.codeRedeemed[o.id]?.[c.id],
                  )
                )
                  shine(c.id);
                void onAction({
                  type: "redeem",
                  accountId: a.id,
                  codeId: c.id,
                  redeemed,
                  ...actionMeta(),
                });
              }}
            />
            Redeemed
            {/* The server only when there is more than one to tell apart. */}
            {accounts.length > 1 && ` · ${a.region}`}
          </label>
        ))}
      </div>
    </article>
  );
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
        <>
          {open.length ? (
            open.map(row)
          ) : (
            <p
              className="codes-clear"
              data-fresh={landing.size > 0 || undefined}
            >
              Every code here is redeemed or expired.
            </p>
          )}
          {closed.length > 0 && (
            <section className="codes-used">
              <h3>Redeemed or expired</h3>
              {closed.map(row)}
            </section>
          )}
        </>
      )}
    </section>
  );
}
