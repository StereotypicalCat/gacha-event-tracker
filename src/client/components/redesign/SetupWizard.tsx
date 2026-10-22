import { useState, type CSSProperties, type ReactNode } from "react";
import { TimezoneSelect } from "./TimezoneSelect.tsx";
import { ViewCards } from "./ViewCards.tsx";
import { GAMES, metaFor, type GameMeta } from "../../../shared/games.ts";
import { offered, routinesFor } from "../../../shared/routines.ts";
import type { ReaderState, TrackingIntent } from "../../state/reader/schema.ts";
import type { SetupDraft } from "../../state/reader/onboarding.ts";
import { cadenceOf } from "../../../shared/period.ts";

// A translation of the Round 6 B onboarding (design/mockups/round6/b-rail.html, `onboarding()`):
// preferences, a two-column game list, one tracking table and view cards.
type Kind = "events" | "dailies" | "weeklyMonthly" | "cycles";
const KINDS: readonly { id: Kind; label: string; about: string }[] = [
  {
    id: "events",
    label: "Events",
    about:
      "Time-limited activities from source pages. Track a deadline once, then complete or ignore it.",
  },
  {
    id: "dailies",
    label: "Dailies",
    about: "Chores that reset each game-day, such as daily commissions.",
  },
  {
    id: "weeklyMonthly",
    label: "Weeklies & monthlies",
    about:
      "Goals that reset each week or month, such as weekly bosses or shop restocks.",
  },
  {
    id: "cycles",
    label: "Cycles",
    about:
      "Routines that follow a game’s own schedule. For example, an endgame mode might reset every 14 days. You can follow individual modes later in Routines.",
  },
];
const EVENTS_ONLY: TrackingIntent = {
  events: true,
  dailies: false,
  weeklyMonthly: false,
  cycles: false,
};
const ORDER = Object.keys(GAMES);
const rank = (g: string) =>
  ORDER.includes(g) ? ORDER.indexOf(g) : ORDER.length;
const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export function SetupWizard({
  state,
  meta = (id) => metaFor(id, {}),
  onFinish,
}: {
  state: ReaderState;
  meta?: (id: string) => GameMeta;
  onFinish: (draft: SetupDraft) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<SetupDraft>({
    region: "europe",
    interface: "structured",
    theme: "dark",
    scheme: "slate",
    timezone: null,
    games: [],
    tracking: {},
    showUpcoming: false,
    view: "soon",
  });
  const games = [
    ...new Set(Object.values(state.accounts).map((a) => a.game)),
  ].sort((a, b) => rank(a) - rank(b));
  const set = (
    p: Partial<SetupDraft> | ((d: SetupDraft) => Partial<SetupDraft>),
  ) => setDraft((d) => ({ ...d, ...(typeof p === "function" ? p(d) : p) }));
  const hue = (g: string) => ({ "--g": meta(g).hue }) as CSSProperties;
  const intentOf = (g: string) => draft.tracking[g] ?? EVENTS_ONLY;
  const standard = state.prefs.standardPulls === true;
  const builtins = (g: string, k: Kind) =>
    k === "events"
      ? 0
      : k === "dailies"
        ? 1
        : routinesFor(g).filter(
            (r) =>
              offered(r, standard) &&
              (cadenceOf(r.period) === "cycle") === (k === "cycles"),
          ).length;
  const withGames = (choose: (current: string[]) => string[]) =>
    set((d) => {
      const chosen = choose(d.games).sort((a, b) => rank(a) - rank(b));
      return {
        games: chosen,
        tracking: Object.fromEntries(
          chosen.map((g) => [g, d.tracking[g] ?? EVENTS_ONLY]),
        ),
      };
    });
  const next = () => setStep(step + 1);
  const back = () => setStep(step - 1);
  const finish = async () => {
    setBusy(true);
    try {
      await onFinish(draft);
    } finally {
      setBusy(false);
    }
  };
  const foot = (count: string, action: ReactNode, extra?: ReactNode) => (
    <div className="ob-foot">
      {step > 0 && (
        <button
          type="button"
          className="btn link"
          disabled={busy}
          onClick={back}
        >
          Back
        </button>
      )}
      <span className="cnt">{count}</span>
      {extra}
      {action}
    </div>
  );
  return (
    <section className="setup-wizard ob" aria-labelledby="setup-title">
      <div className="step">Step {step + 1} of 4</div>
      {step === 0 ? (
        <>
          <h1 id="setup-title">Make it yours</h1>
          <p className="lede">
            Start with a few preferences. You can change every answer in
            Settings later.
          </p>
          <div className="preference-grid">
            <label>
              Default game server
              <select
                value={draft.region}
                onChange={(e) =>
                  set({ region: e.target.value as SetupDraft["region"] })
                }
              >
                <option value="europe">Europe</option>
                <option value="america">America</option>
                <option value="asia">Asia</option>
              </select>
              <small>
                Each game starts here. You can choose a different server for a
                game or track two accounts separately.
              </small>
            </label>
            <label>
              Appearance
              <select
                value={draft.theme}
                onChange={(e) =>
                  set({ theme: e.target.value as SetupDraft["theme"] })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label>
              Colour scheme
              <select
                value={draft.scheme}
                onChange={(e) => set({ scheme: e.target.value })}
              >
                <option value="slate">Slate</option>
                <option value="warm">Warm</option>
                <option value="plum">Plum</option>
              </select>
            </label>
            <label>
              Your timezone
              <TimezoneSelect
                value={draft.timezone}
                onChange={(timezone) => set({ timezone })}
              />
              <small>
                Automatic follows your device; server reset clocks stay
                separate.
              </small>
            </label>
          </div>
          {foot(
            "Next: choose your games",
            <button type="button" className="btn solid" onClick={next}>
              Continue
            </button>,
          )}
        </>
      ) : step === 1 ? (
        <>
          <h1 id="setup-title">Which games do you play?</h1>
          <p className="lede">
            You'll only see events for these. You can change it, and set each
            game's server, in Settings.
          </p>
          <div className="gpick">
            {games.map((g) => {
              const on = draft.games.includes(g);
              return (
                <button
                  type="button"
                  key={g}
                  aria-pressed={on}
                  style={hue(g)}
                  onClick={() =>
                    withGames((current) =>
                      current.includes(g)
                        ? current.filter((x) => x !== g)
                        : [...current, g],
                    )
                  }
                >
                  <span className="sw2" aria-hidden="true" />
                  {meta(g).name}
                </button>
              );
            })}
          </div>
          {foot(
            draft.games.length
              ? `${draft.games.length} chosen`
              : "Pick at least one",
            <button
              type="button"
              className="btn solid"
              disabled={!draft.games.length}
              onClick={next}
            >
              Continue
            </button>,
            <button
              type="button"
              className="btn link"
              onClick={() => {
                withGames(() => [...games]);
                next();
              }}
            >
              Choose all games instead
            </button>,
          )}
        </>
      ) : step === 2 ? (
        <TrackingStep
          draft={draft}
          set={set}
          hue={hue}
          meta={meta}
          intentOf={intentOf}
          builtins={builtins}
          foot={foot(
            trackingSummary(draft, intentOf, builtins),
            <button type="button" className="btn solid" onClick={next}>
              Continue
            </button>,
          )}
        />
      ) : (
        <>
          <h1 id="setup-title">Which view should open first?</h1>
          <p className="lede">
            Both are always one tab away. This is just what you land on.
          </p>
          <ViewCards
            value={draft.view === "timeline" ? "timeline" : "soon"}
            onChange={(view) => set({ view })}
          />
          {draft.view === "timeline" && (
            <div className="look-choice">
              <h2>Which timeline design?</h2>
              <p className="lede">
                Both show the same events. You can switch any time in Settings →
                Appearance.
              </p>
              <div className="viewpick">
                <button
                  type="button"
                  className="vcard"
                  aria-pressed={(draft.timelineLook ?? "new") === "new"}
                  onClick={() => set({ timelineLook: "new" })}
                >
                  <div className="vprev tl-new" aria-hidden="true">
                    {[
                      ["#4EA8DE", "0%", "62%"],
                      ["#F2A03D", "18%", "48%"],
                      ["#3DD6A0", "8%", "80%"],
                    ].map(([g, left, width]) => (
                      <span key={g}>
                        <i className="name" />
                        <i
                          className="bar"
                          style={{ "--g": g, left, width } as CSSProperties}
                        />
                      </span>
                    ))}
                  </div>
                  <b>New look</b>
                  <small>
                    A name column beside each bar, with routines on the same
                    grid.
                  </small>
                </button>
                <button
                  type="button"
                  className="vcard"
                  aria-pressed={draft.timelineLook === "classic"}
                  onClick={() => set({ timelineLook: "classic" })}
                >
                  <div className="vprev tl-classic" aria-hidden="true">
                    <em
                      className="lane"
                      style={{ "--g": "#4EA8DE" } as CSSProperties}
                    />
                    {[
                      ["#4EA8DE", "0%", "70%"],
                      ["#4EA8DE", "0%", "42%"],
                      ["#F2A03D", "24%", "64%"],
                    ].map(([g, left, width], i) => (
                      <i
                        key={i}
                        style={{ "--g": g, left, width } as CSSProperties}
                      >
                        <span />
                      </i>
                    ))}
                  </div>
                  <b>Classic look</b>
                  <small>
                    Filled bars with the title inside, grouped under each game.
                  </small>
                </button>
              </div>
            </div>
          )}
          {foot(
            "",
            <button
              type="button"
              className="btn solid"
              disabled={busy}
              onClick={finish}
            >
              Start
            </button>,
          )}
        </>
      )}
    </section>
  );
}
function trackingSummary(
  draft: SetupDraft,
  intentOf: (g: string) => TrackingIntent,
  builtins: (g: string, k: Kind) => number,
): string {
  const routineKinds: Kind[] = ["dailies", "weeklyMonthly", "cycles"];
  const total = draft.games.reduce(
    (n, g) =>
      n +
      routineKinds
        .filter((k) => intentOf(g)[k])
        .reduce((t, k) => t + builtins(g, k), 0),
    0,
  );
  if (total)
    return `Follows ${total} built-in routine${total === 1 ? "" : "s"}. You'll choose where they show once you've seen the views.`;
  return draft.games.some((g) => routineKinds.some((k) => intentOf(g)[k]))
    ? "Your type choices are saved; no matching built-ins are available yet."
    : "Events only, for now.";
}
function TrackingStep({
  draft,
  set,
  hue,
  meta,
  intentOf,
  builtins,
  foot,
}: {
  draft: SetupDraft;
  set: (
    p: Partial<SetupDraft> | ((d: SetupDraft) => Partial<SetupDraft>),
  ) => void;
  hue: (g: string) => CSSProperties;
  meta: (id: string) => GameMeta;
  intentOf: (g: string) => TrackingIntent;
  builtins: (g: string, k: Kind) => number;
  foot: ReactNode;
}) {
  const update = (gs: string[], k: Kind, on: boolean) =>
    set((d) => ({
      tracking: {
        ...d.tracking,
        ...Object.fromEntries(
          gs.map((g) => [g, { ...(d.tracking[g] ?? EVENTS_ONLY), [k]: on }]),
        ),
      },
    }));
  const missing = draft.games.flatMap((g) =>
    KINDS.filter((k) => k.id !== "events" && !builtins(g, k.id)).map(
      (k) =>
        `${meta(g).short}: no built-in ${k.label.toLowerCase()} available yet.`,
    ),
  );
  return (
    <>
      <h1 id="setup-title">What do you want to track?</h1>
      <p className="lede">
        Pick any mix, per game or for all of them. Routines are the things that
        reset; they get their own tab, where you can follow or drop single ones
        later.
      </p>
      <dl className="type-guide">
        {KINDS.map((k) => (
          <div key={k.id}>
            <dt>{k.label}</dt>
            <dd>{k.about}</dd>
          </div>
        ))}
      </dl>
      <div className="availability">
        <p>
          Every type is selectable. We remember what you want to track even when
          there is nothing available today.
        </p>
        {missing.length > 0 && <p>{missing.join(" ")}</p>}
        <p>
          A supported routine between runs is different: its next window will
          appear when its schedule is available. New built-ins are offered for
          review in Routines.
        </p>
      </div>
      <div className="matrix-scroll">
        <table className="mtx">
          <thead>
            <tr>
              <th scope="col">Game</th>
              {KINDS.map((k) => (
                <th scope="col" key={k.id}>
                  {k.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="all">
              <th scope="row">
                Same for all<small>Sets every game below</small>
              </th>
              {KINDS.map((k) => {
                const n = draft.games.filter((g) => intentOf(g)[k.id]).length;
                const all = n === draft.games.length;
                return (
                  <td key={k.id}>
                    <button
                      type="button"
                      className="tg"
                      aria-pressed={all ? true : n ? "mixed" : false}
                      data-mixed={n > 0 && !all}
                      aria-label={`All games: ${k.label}`}
                      onClick={() => update(draft.games, k.id, !all)}
                    >
                      <Check />
                    </button>
                  </td>
                );
              })}
            </tr>
            {draft.games.map((g) => (
              <tr key={g} style={hue(g)}>
                <th scope="row">{meta(g).short}</th>
                {KINDS.map((k) => (
                  <td key={k.id}>
                    <button
                      type="button"
                      className="tg"
                      aria-pressed={intentOf(g)[k.id]}
                      aria-label={`${meta(g).short}: ${k.label}`}
                      onClick={() => update([g], k.id, !intentOf(g)[k.id])}
                    >
                      <Check />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="upcoming-choice">
        <label className="chk">
          <input
            type="checkbox"
            checked={draft.showUpcoming}
            onChange={(e) => set({ showUpcoming: e.target.checked })}
          />
          <span>
            Show events that haven’t started
            <small>Include upcoming events in Checklist and Timeline.</small>
          </span>
        </label>
      </div>
      {foot}
    </>
  );
}
