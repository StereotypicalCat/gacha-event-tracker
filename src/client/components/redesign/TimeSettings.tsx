import { actionMeta } from "../../state/reader/actions.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { manyServers } from "../../state/reader/servers.ts";
import { REGION_LABEL } from "../../../shared/time.ts";
import type { ActionHandler } from "./GameSettings.tsx";
import { TimezoneSelect, zoneOffset } from "./TimezoneSelect.tsx";
import { ResetTimingRow } from "./ResetTimingRow.tsx";

/** The Round 6 B “Region & time” pane: default server, display timezone, and each server's reset. */
export function TimeSettings({
  state,
  now,
  onAction,
}: {
  state: ReaderState;
  now: number;
  onAction: ActionHandler;
}) {
  const meta = useGameMeta();
  const chosen =
    typeof state.prefs.timezone === "string" ? state.prefs.timezone : null;
  const shown = chosen ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const patch = (value: Record<string, unknown>) =>
    void onAction({ type: "prefs", patch: value, ...actionMeta() });
  const accounts = Object.values(state.accounts).filter(
    (a) =>
      !a.retiredAt &&
      !(
        Array.isArray(state.prefs.hiddenGames) &&
        state.prefs.hiddenGames.includes(a.game)
      ),
  );
  return (
    <section className="time-page">
      <h1>Region & time</h1>
      <p className="muted-copy">
        Your default server starts each game's setup. You can change it per game
        and track more than one server.
      </p>
      <section className="settings-group">
        <h2>Default game server</h2>
        <div
          className="segmented"
          role="group"
          aria-label="Default game server"
        >
          {(["asia", "america", "europe"] as const).map((region) => (
            <button
              key={region}
              aria-pressed={(state.prefs.region ?? "europe") === region}
              onClick={() => patch({ region })}
            >
              {REGION_LABEL[region]}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-group">
        <h2>Your timezone</h2>
        <p className="muted-copy">
          Automatic follows your device. A chosen timezone changes displayed
          dates and times; game servers still determine resets and deadlines.
        </p>
        <div className="zone-pick">
          <TimezoneSelect
            value={chosen}
            onChange={(timezone) => patch({ timezone })}
          />
        </div>
        <p className="source-note">
          Currently displaying {shown} · {zoneOffset(shown)}. Named zones follow
          daylight saving automatically.
        </p>
      </section>
      {accounts.length > 0 && (
        <section className="settings-group">
          <h2>Reset timing for your games</h2>
          <p className="muted-copy">
            Each server uses its automatic reset clock. Set an override if the
            listed time is wrong, and return to Automatic any time. Earlier
            progress is kept.
          </p>
          {accounts.map((a) => (
            <ResetTimingRow
              key={a.id}
              account={a}
              label={`${meta(a.game).short}${manyServers(state, a.game) ? ` · ${REGION_LABEL[a.region]}` : ""}`}
              now={now}
              onAction={onAction}
            />
          ))}
        </section>
      )}
    </section>
  );
}
