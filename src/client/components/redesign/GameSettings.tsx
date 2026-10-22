import { useGameMeta } from "../../state/gameMeta.tsx";
import { mintAccountId, mintLocalId } from "../../state/reader/ids.ts";
import { orderGames } from "../../state/gameOrder.ts";
import type { CodesFeed } from "../../../shared/codes.ts";
import { CodesPage } from "./CodesPage.tsx";
import { useState } from "react";
import { metaFor } from "../../../shared/games.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { REGION_LABEL } from "../../../shared/time.ts";
import type { SourceHealth } from "../../../shared/feed.ts";
import type { Region } from "../../../shared/schema.ts";
import type {
  ReaderState,
  SaveResult,
  Account,
  TrackingIntent,
} from "../../state/reader/schema.ts";
import type { ReaderAction } from "../../state/reader/reducer.ts";
import {
  createAccount,
  changeAccountRegion,
  retireAccount,
} from "../../state/reader/accounts.ts";
import { actionMeta, recordOf } from "../../state/reader/actions.ts";
import { ResetTimingRow } from "./ResetTimingRow.tsx";
import { newCodes } from "../../state/reader/codes.ts";
import { useContext } from "react";
import { DisplayTimeContext, formatInZone } from "../../state/displayTime.ts";
import { resolveReaderClock } from "../../../shared/readerClock.ts";
import { DAY, formatRemaining, resetShiftMs } from "../../../shared/time.ts";
import { VERSIONS, versionWindow } from "../../../shared/versions.ts";
import { cadenceOf } from "../../../shared/period.ts";
export type ActionHandler = (action: ReaderAction) => Promise<SaveResult>;
export const GAME_TABS = ["setup", "codes", "about"] as const;
export type GameTab = (typeof GAME_TABS)[number];
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
export function GameSettings({
  state,
  sources,
  onAction,
  codes = null,
  initialGame,
  tab: heldTab,
  onTab,
  now = Date.now(),
}: {
  state: ReaderState;
  sources: SourceHealth[];
  onAction: ActionHandler;
  codes?: CodesFeed | null;
  initialGame?: string | undefined;
  // When the parent holds the tab, switching games keeps the reader on it.
  tab?: GameTab;
  onTab?: (tab: GameTab) => void;
  /** Fixed in tests; the live clock otherwise. */
  now?: number;
}) {
  const renderedMeta = useGameMeta();
  const games = orderGames(
    [...new Set(Object.values(state.accounts).map((a) => a.game))],
    Array.isArray(state.prefs.gameOrder)
      ? (state.prefs.gameOrder as string[])
      : undefined,
    (id) =>
      metaFor(id, state.customGames as Parameters<typeof metaFor>[1]).name,
  );
  const [selected] = useState(
    initialGame ??
      games.find(
        (g) =>
          !(
            Array.isArray(state.prefs.hiddenGames) &&
            state.prefs.hiddenGames.includes(g)
          ),
      ) ??
      games[0] ??
      "",
  );
  const [ownTab, setOwnTab] = useState<GameTab>("setup");
  const tab = heldTab ?? ownTab,
    setTab = onTab ?? setOwnTab;
  const [trackingAccount, setTrackingAccount] = useState<string | null>(null);
  const [addingServer, setAddingServer] = useState(false);
  const [server, setServer] = useState<Region>("asia");
  const [message, setMessage] = useState("");
  const accounts = Object.values(state.accounts).filter(
    (a) => a.game === selected && !a.retiredAt,
  );
  const activeAccount =
    accounts.find((a) => a.id === trackingAccount) ?? accounts[0];
  const game = metaFor(
    selected,
    state.customGames as Parameters<typeof metaFor>[1],
  );
  const zone = useContext(DisplayTimeContext),
    version = versionWindow(selected, now),
    entry = VERSIONS.find((v) => v.game === selected && version?.number === v.number),
    short = renderedMeta(selected).short;
  const freshCodes = codes
    ? newCodes(codes, state.codeSeen[selected] ?? [], selected).length
    : 0;
  return (
    <section className="game-settings" style={{ ["--g" as string]: game.hue }}>
      {initialGame ? (
        <div className="ptitle">
          <h1 style={{ color: renderedMeta(selected).hue }}>{game.name}</h1>
          {game.studio && <span className="studio">{game.studio}</span>}
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const hidden = Array.isArray(state.prefs.hiddenGames)
                ? (state.prefs.hiddenGames as string[])
                : [];
              const following = !hidden.includes(selected);
              // Following a game with nothing tracked starts with its events.
              if (!following)
                for (const a of accounts.filter(
                  (a) =>
                    !a.intent.events &&
                    !Object.values(a.routines).some((r) => r.followed),
                ))
                  void onAction({
                    type: "account",
                    account: { ...a, intent: { ...a.intent, events: true } },
                    ...actionMeta(),
                  });
              void onAction({
                type: "prefs",
                patch: {
                  hiddenGames: following
                    ? [...hidden, selected]
                    : hidden.filter((g) => g !== selected),
                },
                ...actionMeta(),
              });
            }}
          >
            {Array.isArray(state.prefs.hiddenGames) &&
            state.prefs.hiddenGames.includes(selected)
              ? "Follow game"
              : "Stop following game"}
          </button>
        </div>
      ) : null}

      <div className="subtabs">
        {GAME_TABS.map((id) => (
          <button
            type="button"
            key={id}
            data-tab={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {id[0]!.toUpperCase() + id.slice(1)}
            {id === "codes" && freshCodes > 0 && (
              <span className="new-code">{freshCodes} new</span>
            )}
          </button>
        ))}
      </div>
      {tab === "about" ? (
        <div className="game-about">
          <h3 className="about-h">About {game.name}</h3>
          <div className="grp">
            {game.studio && (
              <div className="trow">
                <span>Studio</span>
                <b>{game.studio}</b>
              </div>
            )}
            {accounts.map((a) => {
              const clock = resolveReaderClock(a, Math.max(now, Date.now())),
                shift = resetShiftMs(clock.region, a.game, clock),
                next = Math.floor((now + shift) / DAY) * DAY + DAY - shift;
              return (
                <div className="trow" key={a.id}>
                  <span>{REGION_LABEL[a.region]} reset</span>
                  <span>
                    {formatInZone(next, true, zone)} ·{" "}
                    {a.clocks.at(-1)!.reset === null
                      ? "automatic"
                      : "custom override"}
                  </span>
                </div>
              );
            })}
            {version && (
              // Spec 2026-10-22: only a recorded end is a date; the rest is an estimate.
              <div className="trow">
                <span>Version {version.number ?? "now"}</span>
                <span className="version-end">
                  {version.end !== undefined
                    ? `ends ${formatInZone(version.end, true, zone)} (in ${formatRemaining(version.end - now)})`
                    : version.estimate !== undefined
                      ? `next version expected ~${formatInZone(version.estimate, false, zone)} (estimate)`
                      : "next version not yet dated"}
                  {entry && (
                    <small>
                      <a href={entry.source} target="_blank" rel="noreferrer">
                        Source
                      </a>
                      {entry.note !== undefined && ` · ${entry.note}`}
                    </small>
                  )}
                </span>
              </div>
            )}
          </div>
          <section className="grp">
            <h3>Data sources</h3>
            {sources.filter((s) => s.game === selected).length === 0 ? (
              <p className="muted-copy">No built-in source for this game.</p>
            ) : (
              <>
                {sources
                  .filter((s) => s.game === selected)
                  .map((src) => (
                    <p className="game-source" key={src.sourceId}>
                      <a href={src.url} target="_blank" rel="noreferrer">
                        {hostOf(src.url)}
                      </a>
                      <small>
                        {/banner/i.test(src.sourceId)
                          ? "Banner schedule"
                          : /pass|version|nameless|fund/i.test(src.sourceId)
                            ? "Battle pass schedule"
                            : "Event schedule"}
                      </small>
                    </p>
                  ))}
                <p className="muted-copy">
                  Thanks to the editors at{" "}
                  {[
                    ...new Set(
                      sources
                        .filter((s) => s.game === selected)
                        .map((src) => hostOf(src.url)),
                    ),
                  ].join(" and ")}{" "}
                  for compiling and maintaining these schedules. Event Clock
                  reads their work; their source pages are the authority.
                </p>
              </>
            )}
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                location.hash = "#settings/sources";
              }}
            >
              Source status and freshness
            </button>
          </section>
        </div>
      ) : tab === "codes" ? (
        <CodesPage
          game={selected}
          feed={codes}
          state={state}
          onAction={onAction}
        />
      ) : (
        <>
          {activeAccount && (
            <section className="grp profile-tracking">
              <h3>
                What to track
                <span>
                  Any combination. Each one follows or unfollows that kind of
                  built-in for {short}
                  {accounts.length > 1
                    ? ` on the ${REGION_LABEL[activeAccount.region]} server`
                    : ""}
                  .
                </span>
              </h3>
              {accounts.length > 1 && (
                <div className="tracking-account-choice">
                  <span>Tracking for</span>
                  <div className="segmented">
                    {accounts.map((a) => (
                      <button
                        key={a.id}
                        aria-pressed={a.id === activeAccount.id}
                        onClick={() => setTrackingAccount(a.id)}
                      >
                        {REGION_LABEL[a.region]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <AccountSetup
                key={activeAccount.id + "tracking"}
                account={activeAccount}
                onAction={onAction}
                onTracked={() =>
                  void onAction({
                    type: "prefs",
                    patch: {
                      hiddenGames: (Array.isArray(state.prefs.hiddenGames)
                        ? state.prefs.hiddenGames
                        : []
                      ).filter((g) => g !== selected),
                    },
                    ...actionMeta(),
                  })
                }
              />
              <div className="compnote">
                <span>
                  Fine-tune single routines, and where they show, on the
                  Routines tab.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    location.hash = "#routines";
                  }}
                >
                  Fine-tune in Routines →
                </button>
              </div>
            </section>
          )}
          <section className="grp profile-servers">
            <h3>
              Servers
              <span>
                Play on more than one server? Add your other server to track
                both accounts separately.
              </span>
            </h3>
            {accounts.map((a, index) => {
              const clock = resolveReaderClock(a, Math.max(now, Date.now())),
                shift = resetShiftMs(clock.region, a.game, clock),
                next = Math.floor((now + shift) / DAY) * DAY + DAY - shift,
                reset = a.clocks.at(-1)!.reset;
              return (
                <div className="srvrow" key={a.id}>
                  <span className="tagn">{index === 0 ? "Main" : "Also"}</span>
                  <div className="clock">
                    <b>{REGION_LABEL[a.region]}</b> ·{" "}
                    {reset === null ? "automatic" : "custom"}{" "}
                    {String(clock.resetHour).padStart(2, "0")}:
                    {String(clock.resetMinute).padStart(2, "0")} reset ·{" "}
                    {formatInZone(next, true, zone)} · in{" "}
                    {formatRemaining(next - now)}
                    <small>
                      Separate dailies and routines for this server.
                    </small>
                  </div>
                  <div className="r">
                    <select
                      aria-label={`${REGION_LABEL[a.region]} account server`}
                      value={a.region}
                      onChange={(e) =>
                        void onAction({
                          type: "account",
                          account: changeAccountRegion(
                            a,
                            e.target.value as Region,
                            new Date().toISOString(),
                            mintLocalId(),
                          ),
                          ...actionMeta(),
                        })
                      }
                    >
                      {(["europe", "america", "asia"] as const).map((r) => (
                        <option
                          key={r}
                          value={r}
                          disabled={accounts.some(
                            (other) => other.id !== a.id && other.region === r,
                          )}
                        >
                          {REGION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    {index > 0 && (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() =>
                          void onAction({
                            type: "account",
                            account: retireAccount(a, new Date().toISOString()),
                            ...actionMeta(),
                          })
                        }
                      >
                        Remove
                        <span className="sr-only">
                          {" "}
                          {REGION_LABEL[a.region]} server
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {Object.values(state.accounts)
              .filter((a) => a.game === selected && a.retiredAt)
              .map((a) => (
                <p key={a.id}>
                  <button
                    type="button"
                    disabled={accounts.some(
                      (other) => other.region === a.region,
                    )}
                    title={
                      accounts.some((other) => other.region === a.region)
                        ? "This server is already tracked. Use its active setup above."
                        : undefined
                    }
                    onClick={() => {
                      const resumed = { ...a };
                      delete resumed.retiredAt;
                      void onAction({
                        type: "account",
                        account: resumed,
                        ...actionMeta(),
                      });
                    }}
                  >
                    Resume {REGION_LABEL[a.region]} server
                  </button>
                  <span className="help">
                    {" "}
                    · your recorded progress is kept
                  </span>
                </p>
              ))}
            <button
              type="button"
              className="btn link server-add-toggle"
              aria-expanded={addingServer}
              onClick={() => setAddingServer(!addingServer)}
            >
              Track another server
            </button>
            {addingServer && (
              <section className="another-server">
                <h3>Add a server</h3>
                <p>
                  Play on more than one server? Add your other server to track
                  both accounts separately.
                </p>
                <p>
                  You'll choose what to track again. Progress and routine pins
                  start fresh.
                </p>
                <select
                  aria-label="Another server"
                  value={server}
                  onChange={(e) => setServer(e.target.value as Region)}
                >
                  {(["europe", "america", "asia"] as const).map((r) => (
                    <option value={r} key={r}>
                      {REGION_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    if (accounts.some((a) => a.region === server)) {
                      setMessage(
                        "You already track this server. Use its setup above.",
                      );
                      return;
                    }
                    const a = createAccount(
                      selected,
                      server,
                      new Date().toISOString(),
                      mintAccountId(),
                    );
                    const r = await onAction({
                      type: "account",
                      account: a,
                      ...actionMeta(),
                    });
                    setMessage(
                      r.ok
                        ? "Server added. Choose what to track in its setup above."
                        : "Could not save this server. Your other accounts are unchanged.",
                    );
                  }}
                >
                  Add server
                </button>
                <p role="status">{message}</p>
              </section>
            )}
          </section>
          <section className="grp game-colour-group">
            <h3>
              Game colour
              <span>
                Used for {short} in every view and on all its servers.
              </span>
            </h3>
            <div className="game-colour">
              <input
                aria-label={`${game.name} colour`}
                type="color"
                value={String(
                  recordOf(state.prefs.gameColors)[selected] ?? game.hue,
                )}
                onChange={(e) =>
                  void onAction({
                    type: "prefs",
                    patch: {
                      gameColors: {
                        ...recordOf(state.prefs.gameColors),
                        [selected]: e.target.value,
                      },
                    },
                    ...actionMeta(),
                  })
                }
              />
              <input
                aria-label={`${game.name} hex colour`}
                type="text"
                key={
                  selected + String(recordOf(state.prefs.gameColors)[selected])
                }
                defaultValue={String(
                  recordOf(state.prefs.gameColors)[selected] ?? game.hue,
                )}
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                onBlur={(e) => {
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                    void onAction({
                      type: "prefs",
                      patch: {
                        gameColors: {
                          ...recordOf(state.prefs.gameColors),
                          [selected]: e.target.value,
                        },
                      },
                      ...actionMeta(),
                    });
                  else
                    e.target.value = String(
                      recordOf(state.prefs.gameColors)[selected] ?? game.hue,
                    );
                }}
              />
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  const colors = { ...recordOf(state.prefs.gameColors) };
                  delete colors[selected];
                  void onAction({
                    type: "prefs",
                    patch: { gameColors: colors },
                    ...actionMeta(),
                  });
                }}
              >
                Reset to default
              </button>
              <span
                className="colour-preview"
                style={{ color: renderedMeta(selected).hue }}
              >
                {short} event
              </span>
            </div>
            <p className="source-note">
              The preview adjusts for readable contrast. Your selected base
              colour stays saved.
            </p>
          </section>
          {activeAccount && (
            <section className="grp profile-reset">
              <h3>
                Reset timing
                <span>
                  Correct the reset time if needed; Automatic restores the
                  listed clock. Earlier progress is kept.
                </span>
              </h3>
              {accounts.map((a) => (
                <ResetTimingRow
                  key={a.id}
                  account={a}
                  label={`${short}${accounts.length > 1 ? ` · ${REGION_LABEL[a.region]}` : ""}`}
                  now={now}
                  onAction={onAction}
                />
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
function AccountSetup({
  account: a,
  onAction,
  onTracked,
}: {
  account: Account;
  onAction: ActionHandler;
  onTracked: () => void;
}) {
  const [draft, setDraft] = useState<TrackingIntent>(a.intent);
  const builtins = routinesFor(a.game);
  const availability = {
    dailies: !a.game.startsWith("mygame:"),
    weeklyMonthly: builtins.some((r) => cadenceOf(r.period) !== "cycle"),
    cycles: builtins.some((r) => cadenceOf(r.period) === "cycle"),
  };
  /**
   * Saved on each click. Only the kind that changed touches its routines, so
   * turning one kind on or off never resets pins chosen for the others on the
   * Routines tab.
   */
  const apply = async (
    next: TrackingIntent,
    force?: "dailies" | "weeklyMonthly" | "cycles",
  ) => {
    const changed = (
      ["events", "dailies", "weeklyMonthly", "cycles"] as const
    ).filter((k) => next[k] !== draft[k] || k === force);
    setDraft(next);
    const placements = { ...a.routines };
    const place = (id: string, followed: boolean) => {
      placements[id] = { followed, checklist: followed, timeline: followed };
    };
    if (changed.includes("dailies")) place(`dailies:${a.game}`, next.dailies);
    for (const r of builtins) {
      const kind = cadenceOf(r.period) === "cycle" ? "cycles" : "weeklyMonthly";
      if (changed.includes(kind)) place(r.id, next[kind]);
    }
    const result = await onAction({
      type: "account",
      account: { ...a, intent: next, routines: placements },
      ...actionMeta(),
    });
    if (result.ok) onTracked();
    else setDraft(draft);
  };
  return (
    <section className="account-setup">
      <div className="comp" role="group" aria-label="What to track">
        {(
          [
            {
              id: "events",
              label: "Events",
              about: "This game's events in Checklist and Timeline",
              ids: [] as string[],
            },
            {
              id: "dailies",
              label: "Dailies",
              about:
                "Chores that reset each game-day, such as daily commissions",
              ids: availability.dailies ? [`dailies:${a.game}`] : [],
            },
            {
              id: "weeklyMonthly",
              label: "Weeklies & monthlies",
              about:
                "Weekly goals and monthly restocks, such as bosses and shop pulls",
              ids: builtins
                .filter((r) => cadenceOf(r.period) !== "cycle")
                .map((r) => r.id),
            },
            {
              id: "cycles",
              label: "Cycles",
              about:
                "Routines on a game-specific schedule, such as a 14-day endgame mode",
              ids: builtins
                .filter((r) => cadenceOf(r.period) === "cycle")
                .map((r) => r.id),
            },
          ] as const
        ).map((k) => {
          const total = k.ids.length,
            followed = k.ids.filter((id) => a.routines[id]?.followed).length;
          // Partly followed: some built-ins of this kind were fine-tuned
          // on the Routines tab. A click follows the rest.
          const some = followed > 0 && followed < total;
          const on = k.id === "events" ? draft.events : draft[k.id];
          const line =
            k.id === "events"
              ? on
                ? "Shown"
                : "Hidden"
              : total === 0
                ? "none built in"
                : some
                  ? "Some, fine-tuned"
                  : `${total} built in`;
          return (
            <button
              type="button"
              key={k.id}
              aria-pressed={some ? "mixed" : on}
              data-st={some ? "some" : on ? "on" : "off"}
              data-empty={k.id !== "events" && total === 0}
              onClick={() =>
                k.id === "events"
                  ? void apply({ ...draft, events: !draft.events })
                  : void apply({ ...draft, [k.id]: some ? true : !on }, k.id)
              }
            >
              <span className="cbx" aria-hidden="true">
                {on && !some && (
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                )}
              </span>
              <span className="ln">{k.label}</span>
              <span className="ls">{k.about}</span>
              <span className="ls">{line}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
