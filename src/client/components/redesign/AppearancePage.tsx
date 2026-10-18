import type { CSSProperties } from "react";
import { recordOf, actionMeta } from "../../state/reader/actions.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { orderGames } from "../../state/gameOrder.ts";
import type { ReaderState } from "../../state/reader/schema.ts";
import type { ActionHandler } from "./GameSettings.tsx";
import { ChecklistDisplay } from "./RoutinesPage.tsx";
import { timelineLook } from "./TimelinePage.tsx";
import { ViewCards } from "./ViewCards.tsx";
import { focusBarShown } from "./FocusPicker.tsx";
import { URGENCY_STEPS, urgencyChoice } from "../../state/appearance.ts";
import { celebrationsOn } from "../Fireworks.tsx";

/** The live legend's words for each step. */
const URGENCY_LABEL = {
  calm: "A week or more",
  near: "Under a week",
  soon: "Under 3 days",
  critical: "Under a day",
} as const;
export function AppearancePage({
  state,
  onAction,
  onReplayTour,
}: {
  state: ReaderState;
  onAction: ActionHandler;
  /** Starts the returning tour at its first step. */
  onReplayTour?: () => void;
}) {
  const meta = useGameMeta();
  const p = state.prefs,
    patch = (patch: Record<string, unknown>) =>
      void onAction({ type: "prefs", patch, ...actionMeta() });
  const hidden = Array.isArray(p.hiddenGames)
    ? (p.hiddenGames as string[])
    : [];
  const saved = Array.isArray(p.gameOrder)
    ? (p.gameOrder as string[])
    : undefined;
  const byName = (g: string) => meta(g).name;
  const accounts = Object.values(state.accounts).filter((a) => !a.retiredAt);
  // Only the games being tracked: not hidden, with events or a followed routine.
  const tracked = orderGames(
    [
      ...new Set(
        accounts
          .filter(
            (a) =>
              !hidden.includes(a.game) &&
              (a.intent.events ||
                Object.values(a.routines).some((r) => r.followed)),
          )
          .map((a) => a.game),
      ),
    ],
    saved,
    byName,
  );
  const untracked = orderGames(
    [...new Set(accounts.map((a) => a.game))].filter(
      (g) => !tracked.includes(g),
    ),
    saved,
    byName,
  );
  const move = (index: number, by: -1 | 1) => {
    const next = tracked.slice();
    const [g] = next.splice(index, 1);
    next.splice(index + by, 0, g!);
    patch({ gameOrder: [...next, ...untracked] });
  };
  return (
    <section>
      <h1>Appearance</h1>
      <div className="interface-choices">
        {(["structured", "relaxed"] as const).map((id) => (
          <button
            type="button"
            aria-pressed={(p.interface ?? "structured") === id}
            key={id}
            onClick={() => patch({ interface: id })}
          >
            <span className={`interface-preview ${id}`} aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <strong>{id === "relaxed" ? "Relaxed" : "Structured"}</strong>
            <small>
              {id === "relaxed"
                ? "Separated panels with more breathing room."
                : "A compact, ruled planner."}
            </small>
          </button>
        ))}
      </div>
      <section className="settings-group">
        <h2>Theme</h2>
        <p className="help">
          Choose a light or dark workspace, or follow your device.
        </p>
        <div className="segmented">
          {["dark", "light", "system"].map((theme) => (
            <button
              key={theme}
              aria-pressed={(p.theme ?? "dark") === theme}
              onClick={() => patch({ theme })}
            >
              {theme[0]!.toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-group">
        <h2>Colour scheme</h2>
        <div className="scheme-choices">
          {["slate", "warm", "plum", "custom"].map((s) => (
            <button
              className={`scheme-option scheme-${s}`}
              key={s}
              aria-pressed={(p.scheme ?? "slate") === s}
              onClick={() => patch({ scheme: s })}
            >
              <span className="scheme-swatch" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {s[0]!.toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </section>
      {p.scheme === "custom" && (
        <div className="custom-palettes">
          {["dark", "light"].map((theme) => (
            <fieldset key={theme}>
              <legend>
                {theme === "dark" ? "Dark colours" : "Light colours"}
              </legend>
              {["ground", "surface", "text", "accent"].map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="color"
                    value={String(
                      recordOf(recordOf(p.customPalette)[theme])[k] ??
                        (theme === "dark"
                          ? k === "text"
                            ? "#eeeae3"
                            : "#22252f"
                          : k === "text"
                            ? "#28272d"
                            : "#fffdf8"),
                    )}
                    onChange={(e) =>
                      patch({
                        customPalette: {
                          ...recordOf(p.customPalette),
                          [theme]: {
                            ...recordOf(recordOf(p.customPalette)[theme]),
                            [k]: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <p className="help">
            Your chosen colours are saved. Displayed text and surfaces adjust to
            keep them readable.
          </p>
        </div>
      )}
      <section className="settings-group urgency-colours">
        <h2>Urgency colours</h2>
        <p className="help">
          Countdowns and time bars change colour as an event's end gets closer.
          Pick each step for dark and light. They work with any scheme, and are
          only adjusted if needed to stay readable.
        </p>
        <div className="custom-palettes">
          {(["dark", "light"] as const).map((theme) => {
            const chosen = urgencyChoice(p, theme),
              own = recordOf(recordOf(p.urgencyPalette)[theme]);
            return (
              <fieldset key={theme}>
                <legend>
                  {theme === "dark" ? "Dark theme" : "Light theme"}
                </legend>
                {URGENCY_STEPS.map((k) => (
                  <label key={k} style={{ "--u": chosen[k] } as CSSProperties}>
                    <input
                      type="color"
                      value={chosen[k]}
                      onChange={(e) =>
                        patch({
                          urgencyPalette: {
                            ...recordOf(p.urgencyPalette),
                            [theme]: { ...own, [k]: e.target.value },
                          },
                        })
                      }
                    />
                    <span className="urgency-sample" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    {URGENCY_LABEL[k]}
                  </label>
                ))}
                {Object.keys(own).length > 0 && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() =>
                      patch({
                        urgencyPalette: {
                          ...recordOf(p.urgencyPalette),
                          [theme]: {},
                        },
                      })
                    }
                  >
                    Use the default colours
                  </button>
                )}
              </fieldset>
            );
          })}
        </div>
      </section>
      <section className="settings-group">
        <h2>Default view</h2>
        <p className="help">
          What opens when you come back. What's new shows in both, so you won't
          miss it either way.
        </p>
        <ViewCards
          value={p.view === "timeline" ? "timeline" : "soon"}
          onChange={(view) => patch({ view })}
        />
        <div className="acts">
          <button
            type="button"
            className="btn"
            data-tour="replay"
            onClick={() =>
              onReplayTour
                ? onReplayTour()
                : patch({ redesignTourSeen: "replay" })
            }
          >
            Replay the introduction
          </button>
          <span className="help">
            Your games, events and progress stay in this browser.
          </span>
        </div>
      </section>
      {tracked.length > 1 && (
        <section className="settings-group game-order">
          <h2>Game order</h2>
          <p className="help">
            The games you track, in the order focus, routines and the timeline
            list them. Move the ones you play most to the top.
          </p>
          <ol>
            {tracked.map((g, i) => (
              <li key={g} style={{ "--g": meta(g).hue } as CSSProperties}>
                <span className="settings-marker" aria-hidden="true" />
                <span className="name">{meta(g).name}</span>
                <button
                  type="button"
                  className="move"
                  aria-label={`Move ${meta(g).name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="move"
                  aria-label={`Move ${meta(g).name} down`}
                  disabled={i === tracked.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          {saved && (
            <button
              type="button"
              className="btn"
              onClick={() => patch({ gameOrder: null })}
            >
              Sort A–Z
            </button>
          )}
        </section>
      )}
      <section className="settings-group">
        <h2>Timeline design</h2>
        <p className="help">
          The new look puts a name column beside each bar. The classic look
          draws filled bars with the title inside, grouped under each game.
        </p>
        <div className="segmented">
          {(["new", "classic"] as const).map((look) => (
            <button
              key={look}
              aria-pressed={timelineLook(p) === look}
              onClick={() => patch({ timelineLook: look })}
            >
              {look === "new" ? "New look" : "Classic look"}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-group">
        <h2>Focus bar</h2>
        <p className="help">
          The game pills that narrow a view to one game. A view without them
          always shows every game.
        </p>
        {(["checklist", "timeline"] as const).map((view) => (
          <label key={view}>
            <input
              type="checkbox"
              checked={focusBarShown(p, view)}
              onChange={(e) =>
                patch({
                  focusBar: {
                    checklist: focusBarShown(p, "checklist"),
                    timeline: focusBarShown(p, "timeline"),
                    [view]: e.target.checked,
                  },
                })
              }
            />
            Show on the {view === "checklist" ? "Checklist" : "Timeline"}
          </label>
        ))}
      </section>
      <section className="settings-group">
        <h2>Celebrations</h2>
        <p className="help">
          Fireworks when you finish a daily, a routine or an event, and a bigger
          show when you finish all your dailies or a game's routines.
        </p>
        <label>
          <input
            type="checkbox"
            data-celebrations
            checked={celebrationsOn(p)}
            onChange={(e) => patch({ celebrations: e.target.checked })}
          />
          Show fireworks
        </label>
      </section>
      <section className="settings-group checklist-settings">
        <h2>Checklist</h2>
        <div className="setting-fields">
          <label>
            Event rows
            <select
              value={String(p.density ?? "standard")}
              onChange={(e) => patch({ density: e.target.value })}
            >
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <ChecklistDisplay state={state} onAction={onAction} plain />
        </div>
        <p className="help">
          Focusing a game opens its routines automatically. Pins on the Routines
          tab decide which routines appear on your Checklist.
        </p>
      </section>
    </section>
  );
}
