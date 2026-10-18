import type { ReaderState } from "../../state/reader/schema.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { orderGames } from "../../state/gameOrder.ts";
import { useState, type ReactNode } from "react";
import type { CodesFeed } from "../../../shared/codes.ts";
import { unseenUsableCodes } from "../../state/reader/codes.ts";
export type SettingsPage =
  | "own"
  | "games"
  | "appearance"
  | "time"
  | "sources"
  | "backup"
  | "about"
  | "changelog";
export const SETTINGS_PAGES: readonly [SettingsPage, string][] = [
  ["about", "About Event Clock"],
  ["changelog", "Changelog"],
  ["sources", "Data & sources"],
  ["time", "Region & time"],
  ["appearance", "Appearance"],
  ["own", "Your own events and games"],
  ["backup", "Backup"],
];
export function SettingsLayout({
  page,
  onPage,
  children,
  state,
  game,
  onGame,
  codes,
}: {
  state?: ReaderState;
  /** Marks a followed game with codes not yet seen on its Codes tab. */
  codes?: CodesFeed | null;
  game?: string | undefined;
  onGame?: (game: string) => void;
  page: SettingsPage;
  onPage: (page: SettingsPage) => void;
  children: ReactNode;
}) {
  const meta = useGameMeta();
  const [allGames, setAllGames] = useState(false);
  const games = state
    ? orderGames(
        [
          ...new Set(
            Object.values(state.accounts)
              .filter((a) => !a.retiredAt)
              .map((a) => a.game),
          ),
        ],
        Array.isArray(state.prefs.gameOrder)
          ? (state.prefs.gameOrder as string[])
          : undefined,
        (g) => meta(g).name,
      )
    : [];
  const isHidden = (g: string) =>
    Array.isArray(state?.prefs.hiddenGames) &&
    state.prefs.hiddenGames.includes(g);
  games.sort((a, b) => Number(isHidden(a)) - Number(isHidden(b)));
  const descriptions: Partial<Record<SettingsPage, string>> = {
    own: "Events and games you added",
    appearance: "Theme, colours & default view",
    time: "Server defaults & display timezone",
    sources: "Freshness, sources & list options",
    backup: "Save, export & restore",
    about: "Credits & acknowledgements",
    changelog: "What changed",
  };
  const chevron = (
    <svg
      className="settings-chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
  const gameButton = (g: string) => {
    const accounts = Object.values(state!.accounts).filter(
      (a) => a.game === g && !a.retiredAt,
    );
    const parts = [
      ["events", "events"],
      ["dailies", "dailies"],
      ["weeklyMonthly", "weeklies"],
      ["cycles", "cycles"],
    ] as const;
    const summary = isHidden(g)
      ? "Not followed"
      : parts
          .filter(([key]) => accounts.some((a) => a.intent[key]))
          .map(([, label]) => label)
          .join(", ") || "Nothing tracked";
    // Only games the reader follows: codes for the others are not news.
    const fresh =
      codes && !isHidden(g)
        ? unseenUsableCodes(
            codes,
            state!.codeSeen[g] ?? [],
            g,
            accounts.map((a) => a.id),
            state!.codeRedeemed,
            Date.now(),
          ).length
        : 0;
    return (
      <button
        key={g}
        className="settings-row"
        data-off={isHidden(g) || undefined}
        aria-current={page === "games" && game === g ? "page" : undefined}
        onClick={() => onGame?.(g)}
        style={{ ["--g" as string]: meta(g).hue }}
      >
        <span className="settings-marker" aria-hidden="true" />
        <span className="settings-copy">
          <span>{meta(g).name}</span>
          <small>
            {summary}
            {!isHidden(g) && accounts.length > 1
              ? ` · ${accounts.map((a) => a.region).join(" + ")}`
              : ""}
          </small>
        </span>
        {fresh > 0 && (
          <span className="settings-new">
            {fresh} new {fresh === 1 ? "code" : "codes"}
          </span>
        )}
        {chevron}
      </button>
    );
  };
  const others = games.filter(isHidden);
  return (
    <div className="settings-layout">
      <nav aria-label="Settings pages">
        <h2>General</h2>
        {SETTINGS_PAGES.map(([id, label]) => (
          <button
            key={id}
            className="settings-row"
            aria-current={id === page && !game ? "page" : undefined}
            onClick={() => onPage(id)}
          >
            <span className="settings-marker" aria-hidden="true" />
            <span className="settings-copy">
              <span>{label}</span>
              <small>{descriptions[id]}</small>
            </span>
            {chevron}
          </button>
        ))}
        <p className="settings-games-label">Your games</p>
        {games.filter((g) => !isHidden(g)).map(gameButton)}
        {others.length > 0 && (
          <>
            <p className="settings-games-label">Other games</p>
            {(allGames ? others : others.slice(0, 3)).map(gameButton)}
            {!allGames && others.length > 3 && (
              <button onClick={() => setAllGames(true)}>
                Show {others.length - 3} more games
              </button>
            )}
          </>
        )}
      </nav>
      <section className="settings-content">{children}</section>
    </div>
  );
}
