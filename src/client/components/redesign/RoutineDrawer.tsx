import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { DisplayTimeContext, formatInZone } from "../../state/displayTime.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import { routineRows, type RoutineRow } from "../../state/reader/routines.ts";
import {
  resolveReaderClock,
  readerDayKey,
} from "../../../shared/readerClock.ts";
import type { Account, ReaderState } from "../../state/reader/schema.ts";
import type { TaskDraft } from "../../state/useTasks.ts";
import {
  offered,
  routinesFor,
  type Routine,
} from "../../../shared/routines.ts";
import { asOfLabel, TaskSchema, type Task } from "../../../shared/task.ts";
import { periodOf, type Period } from "../../../shared/period.ts";
import { AmountTarget } from "../../../shared/goal.ts";
import {
  DAY,
  formatRemaining,
  REGION_LABEL,
  resetShiftMs,
} from "../../../shared/time.ts";
import type { ActionHandler } from "./GameSettings.tsx";

export type DrawerPane = "library" | "create";

/** Where a new routine is saved: which account follows it, and its pins. */
export interface CreatePlacement {
  accountId: string;
  checklist: boolean;
  timeline: boolean;
}

/**
 * The Round 6 B side drawer for the Routines tab: the library of built-ins,
 * and creating or editing a routine of your own. One `<dialog>`, docked right,
 * so Escape, focus and the backdrop come from the browser.
 */
export function RoutineDrawer({
  state,
  now,
  pane,
  editing,
  onPane,
  onClose,
  onAction,
  onSave,
}: {
  state: ReaderState;
  now: number;
  pane: DrawerPane;
  /** The routine being edited, when the create pane edits one. */
  editing: Task | null;
  onPane: (pane: DrawerPane) => void;
  onClose: () => void;
  onAction: ActionHandler;
  onSave: (draft: TaskDraft, placement: CreatePlacement) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const accounts = Object.values(state.accounts).filter(
    (a) =>
      !a.retiredAt &&
      !(
        Array.isArray(state.prefs.hiddenGames) &&
        state.prefs.hiddenGames.includes(a.game)
      ),
  );
  return (
    <dialog
      ref={dialog}
      className="routine-drawer"
      aria-label={
        pane === "library"
          ? "Routine library"
          : editing
            ? "Edit routine"
            : "Create your own routine"
      }
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      {pane === "library" ? (
        <Library
          state={state}
          now={now}
          accounts={accounts}
          onCreate={() => onPane("create")}
          onClose={onClose}
          onAction={onAction}
        />
      ) : (
        <CreateForm
          state={state}
          now={now}
          accounts={accounts}
          editing={editing}
          onBack={() => onPane("library")}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </dialog>
  );
}

const Close = ({ onClose }: { onClose: () => void }) => (
  <button type="button" className="close" aria-label="Close" onClick={onClose}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  </button>
);

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
const hh = (h: number, m = 0) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** "Every Monday at 04:00", in server time. */
export function scheduleWords(
  period: Period,
  hour: number,
  minute = 0,
): string {
  const at = ` at ${hh(hour, minute)}`;
  if (period.unit === "day") return `Every day${at}`;
  if (period.unit === "week")
    return `Every ${WEEKDAYS[period.startsOn - 1]}${at}`;
  if (period.unit === "month")
    return `Every month on the ${period.startsOn === 31 ? "last day" : ordinal(period.startsOn)}${at}`;
  return `Every ${period.days} days${at}`;
}

/** "Community wiki" for fandom pages; otherwise the site's own name. */
export function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return /fandom\.com$|wiki/.test(host) ? "Community wiki" : host;
  } catch {
    return "Source";
  }
}

function measureWords(r: Pick<Routine, "measure">): string {
  const m = r.measure;
  if (m.kind === "amount")
    return `${m.target.toLocaleString("en-US")}${m.unit ? ` ${m.unit}` : ""}`;
  return m.required === 1 ? "tick when done" : `${m.required} days`;
}

const SHORT_REGION: Record<string, string> = {
  europe: "EU",
  america: "NA",
  asia: "Asia",
};

function Library({
  state,
  now,
  accounts,
  onCreate,
  onClose,
  onAction,
}: {
  state: ReaderState;
  now: number;
  accounts: Account[];
  onCreate: () => void;
  onClose: () => void;
  onAction: ActionHandler;
}) {
  const meta = useGameMeta();
  const [query, setQuery] = useState("");
  const [pinChecklist, setPinChecklist] = useState(true);
  const [pinTimeline, setPinTimeline] = useState(false);
  const games = [...new Set(accounts.map((a) => a.game))];
  const standard = state.prefs.standardPulls === true;
  const q = query.trim().toLowerCase();
  const follow = (row: RoutineRow, on: boolean) => ({
    ...row.placement,
    followed: on,
    ...(on
      ? {
          checklist: pinChecklist,
          timeline: pinTimeline && row.cadence !== "day",
        }
      : {}),
  });
  const write = (writes: Map<string, Account>) =>
    Promise.all(
      [...writes.values()].map((account) =>
        onAction({ type: "account", account, ...actionMeta() }),
      ),
    );
  const setFollow = (rows: RoutineRow[], on: boolean) => {
    // One write per account, so a later row never restores an earlier one.
    const writes = new Map<string, Account>();
    for (const row of rows) {
      const a = writes.get(row.accountId) ?? state.accounts[row.accountId]!;
      writes.set(row.accountId, {
        ...a,
        routines: { ...a.routines, [row.id]: follow(row, on) },
      });
    }
    return write(writes);
  };
  return (
    <>
      <div className="drawer-h">
        <div className="r1">
          <h2>Library</h2>
          <Close onClose={onClose} />
        </div>
        <button type="button" className="mkown" onClick={onCreate}>
          <span className="plus" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>
            <b>Create your own routine</b>
            <small>
              Anything the library doesn't have: a guild run, a shop you buy
              from, a mode on its own clock.
            </small>
          </span>
          <span className="go" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </button>
        <p>
          Or follow built-ins for your games, each from a dated source. What you
          follow lands on the Routines tab.
        </p>
        <input
          type="search"
          placeholder="Search routines or games"
          aria-label="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="newpin">
          <span>New follows also show in</span>
          <label>
            <input
              type="checkbox"
              checked={pinChecklist}
              onChange={(e) => setPinChecklist(e.target.checked)}
            />
            Checklist
          </label>
          <label>
            <input
              type="checkbox"
              checked={pinTimeline}
              onChange={(e) => setPinTimeline(e.target.checked)}
            />
            Timeline
          </label>
        </div>
      </div>
      <div className="drawer-b">
        {games.map((game) => {
          const mine = accounts.filter((a) => a.game === game);
          const byAccount = new Map(
            mine.map((a) => [
              a.id,
              routineRows(state, a.id, now).filter(
                (r) =>
                  r.id.startsWith("routine:") || r.id.startsWith("dailies:"),
              ),
            ]),
          );
          const builtins = routinesFor(game).filter((r) =>
            offered(r, standard),
          );
          const ids = (byAccount.get(mine[0]!.id) ?? [])
            .map((r) => r.id)
            .filter(
              (id) =>
                id.startsWith("dailies:") || builtins.some((b) => b.id === id),
            );
          const name = meta(game).name;
          const shown = ids.filter((id) => {
            if (!q) return true;
            const title = byAccount
              .get(mine[0]!.id)!
              .find((r) => r.id === id)!.title;
            return (
              title.toLowerCase().includes(q) || name.toLowerCase().includes(q)
            );
          });
          if (!shown.length) return null;
          const rowsOf = (id: string) =>
            mine.flatMap((a) =>
              (byAccount.get(a.id) ?? []).filter((r) => r.id === id),
            );
          const followed = ids.filter((id) =>
            rowsOf(id).some((r) => r.placement.followed),
          ).length;
          const kinds = (["week", "month", "cycle"] as const).filter((k) =>
            ids.some((id) => rowsOf(id)[0]?.cadence === k),
          );
          const bulk = (pick: (r: RoutineRow) => boolean) =>
            void setFollow(
              ids
                .flatMap(rowsOf)
                .filter((r) => pick(r) && !r.placement.followed),
              true,
            );
          return (
            <section
              className="lg"
              key={game}
              style={{ "--g": meta(game).hue } as CSSProperties}
            >
              <div className="lg-h">
                <span className="nm">{name}</span>
                <span className="cnt">
                  {followed} of {ids.length} followed
                  {mine.length > 1 ? ` · ${mine.length} servers` : ""}
                </span>
              </div>
              <div className="bulk">
                {kinds.map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => bulk((r) => r.cadence === k)}
                  >
                    Follow all{" "}
                    {k === "week"
                      ? "weeklies"
                      : k === "month"
                        ? "monthlies"
                        : "cycles"}
                  </button>
                ))}
                <button type="button" onClick={() => bulk(() => true)}>
                  Follow everything
                </button>
              </div>
              {shown.map((id) => {
                const rows = rowsOf(id),
                  first = rows[0]!,
                  def = builtins.find((b) => b.id === id);
                const line = def
                  ? [
                      scheduleWords(
                        def.period,
                        first.clock.resetHour,
                        first.clock.resetMinute,
                      ),
                      measureWords(def),
                      `${sourceLabel(def.source)}, checked ${asOfLabel(def.checked)}`,
                    ]
                  : [
                      scheduleWords(
                        { unit: "day" },
                        first.clock.resetHour,
                        first.clock.resetMinute,
                      ),
                      "tick when done",
                      "The game's standing chores",
                    ];
                const title = id.startsWith("dailies:")
                  ? `Dailies: ${first.title}`
                  : first.title;
                return (
                  <div className="li" key={id}>
                    <div>
                      <div className="t">{title}</div>
                      <div className="d">{line.join(" · ")}</div>
                    </div>
                    {rows.length > 1 ? (
                      <div className="fols">
                        {rows.map((r) => {
                          const region = state.accounts[r.accountId]!.region;
                          return (
                            <FollowButton
                              key={r.accountId}
                              on={r.placement.followed}
                              label={`${r.placement.followed ? "Unfollow" : "Follow"} on ${REGION_LABEL[region]}`}
                              onClick={() =>
                                void setFollow([r], !r.placement.followed)
                              }
                            >
                              {SHORT_REGION[region] ?? region}
                            </FollowButton>
                          );
                        })}
                      </div>
                    ) : (
                      <FollowButton
                        on={first.placement.followed}
                        label={`${first.placement.followed ? "Unfollow" : "Follow"} ${title}`}
                        onClick={() =>
                          void setFollow([first], !first.placement.followed)
                        }
                      >
                        {first.placement.followed ? "Following" : "Follow"}
                      </FollowButton>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

function FollowButton({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="fol"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface Fields {
  example: string | null;
  title: string;
  game: string;
  accountId: string;
  unit: "day" | "week" | "month" | "cycle";
  dow: number;
  dom: number;
  days: string;
  from: string;
  hourMode: "game" | "custom";
  hour: number;
  done: "once" | "ndays" | "amount";
  nDays: string;
  target: string;
  amountUnit: string;
  note: string;
  link: string;
  checklist: boolean;
  timeline: boolean;
}

const EXAMPLES: {
  id: string;
  label: string;
  hint: string;
  sets: Partial<Fields>;
}[] = [
  {
    id: "guild",
    label: "Weekly guild run",
    hint: "Ticked once a week, on the day your group plays.",
    sets: { title: "Guild co-op clear", unit: "week", dow: 5, done: "once" },
  },
  {
    id: "login",
    label: "Daily login",
    hint: "A tick a day on the game's reset.",
    sets: { title: "Log in for the daily reward", unit: "day", done: "once" },
  },
  {
    id: "shop",
    label: "Monthly shop restock",
    hint: "Counts what you bought against the stock.",
    sets: {
      title: "Buy the monthly pull bundle",
      unit: "month",
      dom: 1,
      done: "amount",
      target: "5",
      amountUnit: "pulls",
    },
  },
  {
    id: "cycle",
    label: "Endgame cycle",
    hint: "Fill in a day a cycle began; how often it comes back does the rest.",
    sets: { title: "Endgame cycle", unit: "cycle", days: "14", done: "once" },
  },
  {
    id: "stamina",
    label: "Weekly points target",
    hint: "Enter your number as you go.",
    sets: {
      title: "Weekly activity points",
      unit: "week",
      dow: 1,
      done: "amount",
      target: "2100",
      amountUnit: "points",
    },
  },
];

function fieldsFrom(
  editing: Task | null,
  accounts: Account[],
  state: ReaderState,
): Fields {
  const game = editing?.game ?? accounts[0]?.game ?? "";
  const account =
    accounts.find(
      (a) =>
        a.game === game &&
        state.accounts[a.id]?.routines[editing?.id ?? ""]?.followed,
    ) ?? accounts.find((a) => a.game === game);
  const p = editing?.period,
    m = editing?.measure;
  const placement = editing && account?.routines[editing.id];
  return {
    example: null,
    title: editing?.title ?? "",
    game,
    accountId: account?.id ?? "",
    unit: p?.unit ?? "week",
    dow: p?.unit === "week" ? p.startsOn : 1,
    dom: p?.unit === "month" ? p.startsOn : 1,
    days: String(p?.unit === "cycle" ? p.days : 14),
    from: p?.unit === "cycle" ? p.from : "",
    hourMode: editing?.resetHour === undefined ? "game" : "custom",
    hour: editing?.resetHour ?? 20,
    done:
      m?.kind === "amount" ? "amount" : m && m.required > 1 ? "ndays" : "once",
    nDays: String(m?.kind === "days" ? Math.max(2, m.required) : 2),
    target: m?.kind === "amount" ? String(m.target) : "",
    amountUnit: m?.kind === "amount" ? (m.unit ?? "") : "",
    note: editing?.note ?? "",
    link: editing?.link ?? "",
    checklist: placement ? placement.checklist : true,
    timeline: placement ? placement.timeline : false,
  };
}

function periodFrom(f: Fields): Period | null {
  if (f.unit === "day") return { unit: "day" };
  if (f.unit === "week") return { unit: "week", startsOn: f.dow };
  if (f.unit === "month") return { unit: "month", startsOn: f.dom };
  const days = Number(f.days);
  if (!Number.isInteger(days) || days < 2 || days > 366) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from)) return null;
  return { unit: "cycle", days, from: f.from };
}

const periodLength = (f: Fields) =>
  f.unit === "day"
    ? 1
    : f.unit === "week"
      ? 7
      : f.unit === "month"
        ? 31
        : Math.min(31, Number(f.days) || 31);

/** What the fields still lack, in the order the form asks. */
function stillNeeded(f: Fields): string[] {
  const needs: string[] = [];
  if (!f.title.trim()) needs.push("a name");
  if (f.unit === "cycle") {
    const d = Number(f.days);
    if (!Number.isInteger(d) || d < 2 || d > 366)
      needs.push("a length of 2 to 366 days");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from)) needs.push("a day a cycle began");
  }
  if (f.done === "ndays") {
    const n = Number(f.nDays);
    if (!Number.isInteger(n) || n < 1 || n > periodLength(f))
      needs.push("how many days");
  }
  if (f.done === "amount") {
    const n = Number(f.target.replace(/,/g, ""));
    if (!Number.isInteger(n) || n < 1 || !AmountTarget.safeParse(n).success)
      needs.push("the number to reach");
  }
  if (f.link.trim() && !/^https?:\/\/\S+$/i.test(f.link.trim()))
    needs.push("a link starting with https://");
  return needs;
}

function draftFrom(f: Fields): TaskDraft | null {
  if (stillNeeded(f).length) return null;
  const period = periodFrom(f);
  if (!period) return null;
  const unit = f.amountUnit.trim();
  const draft: TaskDraft = {
    game: f.game,
    title: f.title.trim(),
    period,
    measure:
      f.done === "amount"
        ? {
            kind: "amount",
            target: Number(f.target.replace(/,/g, "")),
            ...(unit ? { unit } : {}),
          }
        : { kind: "days", required: f.done === "once" ? 1 : Number(f.nDays) },
    resetHour: f.hourMode === "custom" ? f.hour : undefined,
    note: f.note.trim() || undefined,
    link: f.link.trim() || undefined,
  };
  const check = TaskSchema.safeParse({
    ...draft,
    id: "mytask:check00000",
    at: "",
    updatedAt: "",
  });
  return check.success ? draft : null;
}

function CreateForm({
  state,
  now,
  accounts,
  editing,
  onBack,
  onClose,
  onSave,
}: {
  state: ReaderState;
  now: number;
  accounts: Account[];
  editing: Task | null;
  onBack: () => void;
  onClose: () => void;
  onSave: (draft: TaskDraft, placement: CreatePlacement) => Promise<boolean>;
}) {
  const meta = useGameMeta(),
    zone = useContext(DisplayTimeContext);
  const [f, setF] = useState<Fields>(() =>
    fieldsFrom(editing, accounts, state),
  );
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Fields>) => setF((old) => ({ ...old, ...p }));
  const games = [...new Set(accounts.map((a) => a.game))];
  const servers = accounts.filter((a) => a.game === f.game);
  const account =
    servers.find((a) => a.id === f.accountId) ?? servers[0] ?? accounts[0];
  const clock = account ? resolveReaderClock(account, now) : null;
  const gameHour = clock ? hh(clock.resetHour, clock.resetMinute) : "04:00";
  const needs = stillNeeded(f);
  // Logged ticks keep their date labels, so a new hour moves which day they
  // count for: say so before the reader saves it.
  const hourChanged =
    editing !== null &&
    (f.hourMode === "custom" ? f.hour : undefined) !== editing.resetHour;
  const draft = draftFrom(f);
  const example = EXAMPLES.find((e) => e.id === f.example);
  const short = meta(f.game).short;
  // The preview's next reset, on the routine's own clock.
  const period = periodFrom(f);
  const preview = (() => {
    if (!clock || !period || !account) return null;
    const timing =
      f.hourMode === "custom"
        ? { ...clock, resetHour: f.hour, resetMinute: 0 }
        : clock;
    const span = periodOf(period, readerDayKey(now, timing));
    const start =
      Date.parse(`${span.start}T00:00:00Z`) -
      resetShiftMs(timing.region, f.game, timing);
    const end = start + span.days.length * DAY;
    return {
      when: scheduleWords(period, timing.resetHour, timing.resetMinute).replace(
        /^E/,
        "e",
      ),
      server: REGION_LABEL[account.region],
      yours: formatInZone(end, true, zone),
      next: formatRemaining(end - now),
    };
  })();
  const per = {
    day: "each day",
    week: "each week",
    month: "each month",
    cycle: "each cycle",
  }[f.unit];
  const pill = <T extends string>(
    value: T,
    current: T,
    label: string,
    onPick: (v: T) => void,
  ) => (
    <button
      type="button"
      key={value}
      aria-pressed={value === current}
      onClick={() => onPick(value)}
    >
      {label}
    </button>
  );
  const optional = <em className="opt">optional</em>;
  return (
    <>
      <div className="drawer-h">
        <div className="r1">
          <button type="button" className="back" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Library
          </button>
          <Close onClose={onClose} />
        </div>
        <h2 className="create-title">
          {editing ? "Edit routine" : "Create your own routine"}
        </h2>
        <p>
          It sits beside the built-ins on the Routines tab, marked as yours, and
          you can pin it like any other.
        </p>
      </div>
      <div className="drawer-b">
        <form
          className="cf"
          style={{ "--g": meta(f.game).hue } as CSSProperties}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft || !account || busy) return;
            setBusy(true);
            const ok = await onSave(draft, {
              accountId: account.id,
              checklist: f.checklist,
              timeline: f.timeline && f.unit !== "day",
            });
            setBusy(false);
            if (ok) onClose();
          }}
        >
          {!editing && (
            <div className="fld full">
              <span>Start from an example</span>
              <div className="pills">
                {EXAMPLES.map((ex) =>
                  pill(ex.id, f.example ?? "", ex.label, () =>
                    set({ ...ex.sets, example: ex.id }),
                  ),
                )}
              </div>
              {example && <span className="help">{example.hint}</span>}
            </div>
          )}
          <label className="fld full">
            <span>What is it</span>
            <input
              required
              maxLength={80}
              placeholder="Guild co-op clear"
              value={f.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Game</span>
            <select
              value={f.game}
              disabled={editing !== null}
              onChange={(e) => {
                const game = e.target.value;
                set({
                  game,
                  accountId:
                    accounts.find((a) => a.game === game)?.id ?? f.accountId,
                });
              }}
            >
              {games.map((g) => (
                <option key={g} value={g}>
                  {meta(g).name}
                </option>
              ))}
            </select>
          </label>
          {servers.length > 1 && !editing ? (
            <label className="fld">
              <span>Server</span>
              <select
                value={account?.id}
                onChange={(e) => set({ accountId: e.target.value })}
              >
                {servers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {REGION_LABEL[a.region]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="fld">
              <span>Server</span>
              <span className="help server-note">
                {account
                  ? `${REGION_LABEL[account.region]}, the one you play ${short} on.`
                  : ""}
              </span>
            </div>
          )}
          <div className="fld full">
            <span>Repeats</span>
            <div className="pills">
              {(
                [
                  ["day", "Every day"],
                  ["week", "Every week"],
                  ["month", "Every month"],
                  ["cycle", "Every N days"],
                ] as const
              ).map(([u, l]) => pill(u, f.unit, l, (unit) => set({ unit })))}
            </div>
            <div className="row">
              {f.unit === "week" ? (
                <>
                  on
                  <select
                    aria-label="Day of the week"
                    value={f.dow}
                    onChange={(e) => set({ dow: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </>
              ) : f.unit === "month" ? (
                <>
                  on the
                  <select
                    aria-label="Day of the month"
                    value={f.dom}
                    onChange={(e) => set({ dom: Number(e.target.value) })}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d === 31 ? "last day" : ordinal(d)}
                      </option>
                    ))}
                  </select>
                  of the month
                </>
              ) : f.unit === "cycle" ? (
                <>
                  every
                  <input
                    type="number"
                    min={2}
                    max={366}
                    aria-label="Days in a cycle"
                    value={f.days}
                    onChange={(e) => set({ days: e.target.value })}
                  />
                  days, counted from
                  <input
                    type="date"
                    aria-label="A day a cycle began"
                    value={f.from}
                    onChange={(e) => set({ from: e.target.value })}
                  />
                  <span className="help">any day a cycle began</span>
                </>
              ) : (
                <span className="help">Rolls at the reset every day.</span>
              )}
            </div>
          </div>
          <div className="fld full">
            <span>Resets at</span>
            <div className="row">
              <label className="chk">
                <input
                  type="radio"
                  name="hourMode"
                  checked={f.hourMode === "game"}
                  onChange={() => set({ hourMode: "game" })}
                />
                The game's reset, {gameHour} server time
              </label>
              <label className="chk">
                <input
                  type="radio"
                  name="hourMode"
                  checked={f.hourMode === "custom"}
                  onChange={() => set({ hourMode: "custom" })}
                />
                Another hour
              </label>
              {f.hourMode === "custom" && (
                <select
                  aria-label="Reset hour, server time"
                  value={f.hour}
                  onChange={(e) => set({ hour: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hh(h)} server time
                    </option>
                  ))}
                </select>
              )}
            </div>
            {hourChanged && (
              <span className="help warn" role="note">
                Changing the reset hour moves where each day starts for this
                routine. Ticks already logged keep their dates, so today's may
                count toward a different day.
              </span>
            )}
          </div>
          <div className="fld full">
            <span>Done when</span>
            <div className="pills">
              {(
                [
                  ["once", "I tick it once"],
                  ["ndays", "I tick it on several days"],
                  ["amount", "I reach a number"],
                ] as const
              ).map(([k, l]) => pill(k, f.done, l, (done) => set({ done })))}
            </div>
            <div className="row">
              {f.done === "ndays" ? (
                <>
                  on
                  <input
                    type="number"
                    min={1}
                    max={periodLength(f)}
                    aria-label="Days to tick"
                    value={f.nDays}
                    onChange={(e) => set({ nDays: e.target.value })}
                  />
                  days {per}
                </>
              ) : f.done === "amount" ? (
                <>
                  reach
                  <input
                    type="number"
                    min={1}
                    aria-label="Number to reach"
                    value={f.target}
                    onChange={(e) => set({ target: e.target.value })}
                  />
                  <input
                    className="unit"
                    placeholder="points"
                    aria-label="Unit"
                    maxLength={24}
                    value={f.amountUnit}
                    onChange={(e) => set({ amountUnit: e.target.value })}
                  />
                </>
              ) : (
                <span className="help">
                  One tick, then it waits for the reset.
                </span>
              )}
            </div>
          </div>
          <label className="fld">
            <span>Note {optional}</span>
            <textarea
              maxLength={500}
              placeholder="Bring a healer"
              value={f.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Link {optional}</span>
            <input
              type="url"
              placeholder="https://"
              maxLength={500}
              value={f.link}
              onChange={(e) => set({ link: e.target.value })}
            />
          </label>
          {!editing && (
            <div className="fld full">
              <span>Also show in</span>
              <div className="row">
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={f.checklist}
                    onChange={(e) => set({ checklist: e.target.checked })}
                  />
                  Checklist
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    disabled={f.unit === "day"}
                    checked={f.timeline && f.unit !== "day"}
                    onChange={(e) => set({ timeline: e.target.checked })}
                  />
                  Timeline
                </label>
                <span className="help">
                  {f.unit === "day"
                    ? "Dailies stay off the Timeline. Always on the Routines tab."
                    : "Always on the Routines tab."}
                </span>
              </div>
            </div>
          )}
          <div className="preview">
            <div className="k">Preview</div>
            <div className="t">
              {f.title.trim() || "Untitled routine"}{" "}
              <span className="pg">· {short}</span>
            </div>
            {preview ? (
              <div className="l">
                Resets{" "}
                <b>
                  {preview.when} {preview.server} server time
                </b>{" "}
                · {preview.yours} your time · next in <b>{preview.next}</b>
                <br />
                Done when you{" "}
                {f.done === "amount" ? (
                  <>
                    reach{" "}
                    <b>
                      {Number(f.target || 0).toLocaleString("en-US")}
                      {f.amountUnit.trim() ? ` ${f.amountUnit.trim()}` : ""}
                    </b>
                  </>
                ) : f.done === "ndays" ? (
                  <>
                    tick on <b>{f.nDays} days</b>
                  </>
                ) : (
                  <>
                    tick it <b>once</b>
                  </>
                )}{" "}
                {per}.
              </div>
            ) : (
              <div className="l">
                Pick a day a cycle began to see when it resets.
              </div>
            )}
          </div>
          <div className="cf-foot">
            <button
              className="btn solid"
              type="submit"
              disabled={!draft || busy}
            >
              {editing ? "Save changes" : "Create and follow"}
            </button>
            <button className="btn link" type="button" onClick={onClose}>
              Cancel
            </button>
            {needs.length > 0 && (
              <span className="help">Still needed: {needs.join(", ")}.</span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
