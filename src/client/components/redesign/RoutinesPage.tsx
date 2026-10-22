import { routinePeriod } from "./TimelinePage.tsx";
import { manyServers, serverSuffix } from "../../state/reader/servers.ts";
import { formatRemaining } from "../../../shared/time.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import type { CSSProperties } from "react";
import { RoutineHistory } from "./RoutineHistory.tsx";
import { useState } from "react";

import { routinesFor, mineFrom, ownable } from "../../../shared/routines.ts";

const builtinOwnable = (game: string, id: string) => {
  const routine = routinesFor(game).find((r) => r.id === id);
  return routine !== undefined && ownable(routine);
};
import { mintTaskId, type Task } from "../../../shared/task.ts";
import {
  RoutineDrawer,
  type CreatePlacement,
  type DrawerPane,
} from "./RoutineDrawer.tsx";
import { actionMeta } from "../../state/reader/actions.ts";
import type { ReaderState, Account } from "../../state/reader/schema.ts";
import { routineRows, type RoutineRow } from "../../state/reader/routines.ts";
import type { TaskDraft } from "../../state/useTasks.ts";
import { RoutineProgress } from "./RoutineProgress.tsx";
import type { ActionHandler } from "./GameSettings.tsx";
// One account write per bulk action prevents a later row from restoring an earlier pin.
export function placementAccounts(
  state: ReaderState,
  rows: readonly RoutineRow[],
  key: "checklist" | "timeline",
  value: boolean,
): Account[] {
  const accounts = new Map<string, Account>();
  for (const row of rows) {
    const account =
      accounts.get(row.accountId) ?? state.accounts[row.accountId]!;
    accounts.set(row.accountId, {
      ...account,
      routines: {
        ...account.routines,
        [row.id]: { ...row.placement, [key]: value },
      },
    });
  }
  return [...accounts.values()];
}
export function ChecklistDisplay({
  state,
  onAction,
  plain = false,
}: {
  state: ReaderState;
  onAction: ActionHandler;
  /** Just the two fields, for a settings group; the Routines page shows them as a band. */
  plain?: boolean;
}) {
  const fields = (
    <>
      <label>
        Dailies on Checklist
        <select
          value={String(state.prefs.dailyLayout ?? "separate")}
          onChange={(e) =>
            void onAction({
              type: "prefs",
              patch: { dailyLayout: e.target.value },
              ...actionMeta(),
            })
          }
        >
          <option value="separate">Separate panel</option>
          <option value="grouped">Grouped with routines</option>
        </select>
      </label>
      <label>
        Routine groups
        <select
          value={String(state.prefs.routineDisclosure ?? "collapsed")}
          onChange={(e) =>
            void onAction({
              type: "prefs",
              patch: { routineDisclosure: e.target.value },
              ...actionMeta(),
            })
          }
        >
          <option value="collapsed">Collapsed by default</option>
          <option value="expanded">Expanded by default</option>
          <option value="always">Always expanded</option>
        </select>
      </label>
    </>
  );
  if (plain) return fields;
  return (
    <fieldset className="checklist-display">
      <legend className="sr-only">Checklist display</legend>
      {fields}
      <p className="help">
        Focusing a game opens its routines automatically. Pins below decide
        which routines appear on your Checklist.
      </p>
    </fieldset>
  );
}
export function RoutinesPage({
  state,
  onAction,
  now,
}: {
  state: ReaderState;
  onAction: ActionHandler;
  now: number;
}) {
  const meta = useGameMeta();
  const [drawer, setDrawer] = useState<DrawerPane | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const open = (pane: DrawerPane, task: Task | null = null) => {
    setEditing(task);
    setDrawer(pane);
  };
  const accounts = Object.values(state.accounts).filter(
    (a) =>
      !a.retiredAt &&
      !(
        Array.isArray(state.prefs.hiddenGames) &&
        state.prefs.hiddenGames.includes(a.game)
      ),
  );
  const save = async (draft: TaskDraft, placement: CreatePlacement) => {
    const at = new Date().toISOString(),
      id = editing ? editing.id : mintTaskId();
    const task = {
      ...(editing ?? {}),
      ...draft,
      id,
      at: editing ? editing.at : at,
      updatedAt: at,
    };
    const result = await onAction({
      type: "record",
      collection: "tasks",
      id,
      value: task,
      ...actionMeta(),
    });
    if (!result.ok) return false;
    // An edit keeps where the routine already shows; a new one follows on the
    // chosen server with the chosen pins.
    if (editing) return true;
    const a = state.accounts[placement.accountId];
    if (!a) return false;
    const placed = await onAction({
      type: "account",
      account: {
        ...a,
        routines: {
          ...a.routines,
          [id]: {
            followed: true,
            checklist: placement.checklist,
            timeline: placement.timeline,
          },
        },
      },
      ...actionMeta(),
    });
    return placed.ok;
  };
  const copy = async (row: RoutineRow) => {
    const routine = routinesFor(row.game).find((r) => r.id === row.id);
    if (!routine) return;
    const at = new Date().toISOString(),
      id = mintTaskId();
    const account = state.accounts[row.accountId]!;
    const result = await onAction({
      type: "record",
      collection: "tasks",
      id,
      value: { ...mineFrom(routine), id, at, updatedAt: at },
      ...actionMeta(),
    });
    if (!result.ok) return;
    for (const [revision, items] of Object.entries(
      state.data[account.id]!.daily,
    )) {
      const log = items[row.id] as { days?: string[] } | undefined;
      for (const day of log?.days ?? [])
        await onAction({
          type: "day",
          accountId: account.id,
          revisionId: revision,
          itemId: id,
          day,
          checked: true,
          ...actionMeta(),
        });
    }
    for (const [revision, items] of Object.entries(
      state.data[account.id]!.amounts,
    )) {
      const log = items[row.id] as
        Record<string, { value: number }> | undefined;
      for (const [period, value] of Object.entries(log ?? {}))
        await onAction({
          type: "amount",
          accountId: account.id,
          revisionId: revision,
          itemId: id,
          period,
          value: value.value,
          ...actionMeta(),
        });
    }
    await onAction({
      type: "account",
      account: {
        ...account,
        routines: {
          ...account.routines,
          [id]: row.placement,
          [row.id]: { ...row.placement, followed: false },
        },
      },
      ...actionMeta(),
    });
  };
  const group = state.prefs.routineGroup === "game" ? "game" : "reset";
  const allRows = accounts
    .flatMap((a) => routineRows(state, a.id, now))
    .filter((r) => r.placement.followed);
  const bands =
    group === "game"
      ? accounts.map((a) => ({
          id: a.id,
          title: meta(a.game).name,
          rows: allRows.filter((r) => r.accountId === a.id),
        }))
      : (["day", "week", "month", "cycle"] as const).map((c) => ({
          id: c,
          title: {
            day: "Dailies",
            week: "Weeklies",
            month: "Monthlies",
            cycle: "Cycles",
          }[c],
          rows: allRows.filter((r) => r.cadence === c),
        }));
  return (
    <section className="routines-page">
      <div className="rt-top">
        <h1>Routines</h1>
        <p className="sum">
          {`${allRows.filter((r) => !r.status.met).length} of ${allRows.length} still to do. ${allRows.filter((r) => r.placement.checklist).length} pinned to the checklist, ${allRows.filter((r) => r.placement.timeline && r.cadence !== "day").length} to the timeline. The rest live only here.`}
        </p>
        <div className="segmented">
          {(["reset", "game"] as const).map((g) => (
            <button
              key={g}
              aria-pressed={g === group}
              onClick={() =>
                void onAction({
                  type: "prefs",
                  patch: { routineGroup: g },
                  ...actionMeta(),
                })
              }
            >
              {g === "reset" ? "By reset" : "By game"}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => open("library")}>
          Browse the library
        </button>
        <button type="button" className="commit" onClick={() => open("create")}>
          Create your own routine
        </button>
      </div>
      {drawer && (
        <RoutineDrawer
          state={state}
          now={now}
          pane={drawer}
          editing={editing}
          onPane={(pane) => open(pane)}
          onClose={() => {
            setDrawer(null);
            setEditing(null);
          }}
          onAction={onAction}
          onSave={save}
        />
      )}
      <ChecklistDisplay state={state} onAction={onAction} />
      {bands.map((band) => {
        const rows = band.rows;
        if (!rows.length) return null;
        const setPlacement = (
          row: RoutineRow,
          key: "followed" | "checklist" | "timeline",
          value: boolean,
        ) => {
          const a = state.accounts[row.accountId]!;
          return onAction({
            type: "account",
            account: {
              ...a,
              routines: {
                ...a.routines,
                [row.id]: { ...row.placement, [key]: value },
              },
            },
            ...actionMeta(),
          });
        };
        return (
          <section className="band" key={band.id}>
            <div className="band-h">
              <div>
                <h2>{band.title}</h2>
                <p className="meta">
                  {
                    rows.filter((r) => r.placement.followed && !r.status.met)
                      .length
                  }{" "}
                  of {rows.length} still to do
                </p>
                <div className="bulk-pins">
                  {(["checklist", "timeline"] as const)
                    .filter(
                      (key) =>
                        key !== "timeline" ||
                        rows.some((r) => r.cadence !== "day"),
                    )
                    .map((key) => (
                      <button
                        className="btn"
                        key={key}
                        onClick={async () => {
                          const value = !rows.every((r) => r.placement[key]);
                          for (const account of placementAccounts(
                            state,
                            rows,
                            key,
                            value,
                          ))
                            await onAction({
                              type: "account",
                              account,
                              ...actionMeta(),
                            });
                        }}
                      >
                        {rows.every((r) => r.placement[key])
                          ? "Unpin all from"
                          : "Pin all to"}{" "}
                        {key}
                      </button>
                    ))}
                </div>
              </div>
              <div className="band-reset">
                <small>Next reset in</small>
                <strong>
                  {formatRemaining(
                    Math.min(...rows.map((r) => routinePeriod(r, now).end)) -
                      now,
                  )}
                </strong>
              </div>
            </div>
            <table className="rt">
              <thead>
                <tr>
                  <th className="h-g">Game</th>
                  <th className="h-t">Routine</th>
                  <th className="h-prog">Progress</th>
                  {(["checklist", "timeline"] as const).map((key) => (
                    <th className="c-pin" key={key}>
                      <span className="pinlbl">
                        <PinIcon kind={key} on={false} />
                        <span>
                          {key === "checklist" ? "Checklist" : "Timeline"}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th className="c-k">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.accountId + row.id}
                    className={row.status.met ? "met" : ""}
                    style={{ "--g": meta(row.game).hue } as CSSProperties}
                  >
                    <td>
                      <span className="gcell">
                        <span>
                          {meta(row.game).short}
                          {manyServers(state, row.game) && (
                            <small>
                              {state.accounts[row.accountId]?.region}
                            </small>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="rtitle">
                      <span className="gsm">
                        {meta(row.game).short}
                        {serverSuffix(
                          state,
                          row.game,
                          state.accounts[row.accountId]?.region,
                        )}
                      </span>
                      {row.cadence === "day" && row.id.startsWith("dailies:")
                        ? "Dailies: "
                        : ""}
                      {row.title}
                      {row.task?.note && (
                        <small className="routine-note">{row.task.note}</small>
                      )}
                      {group === "game" && (
                        <small className="routine-cadence">
                          {row.cadence === "day"
                            ? "Daily"
                            : row.cadence === "week"
                              ? "Weekly"
                              : row.cadence === "month"
                                ? "Monthly"
                                : "Game cycle"}
                        </small>
                      )}
                    </td>
                    <td className="prog">
                      <RoutineProgress
                        row={row}
                        onAction={onAction}
                        now={now}
                      />
                    </td>
                    {(["checklist", "timeline"] as const).map((key) => (
                      <td className="c-pin" key={key}>
                        {key === "timeline" && row.cadence === "day" ? (
                          <span
                            className="no-pin"
                            title="Dailies stay on the Checklist"
                          >
                            —
                          </span>
                        ) : (
                          <button
                            className="pin"
                            aria-label={`${row.placement[key] ? "Unpin from" : "Pin to"} ${key === "checklist" ? "Checklist" : "Timeline"}: ${row.title}`}
                            aria-pressed={row.placement[key]}
                            title={`${row.placement[key] ? "Shown in" : "Show in"} ${key === "checklist" ? "Checklist" : "Timeline"}`}
                            onClick={() =>
                              setPlacement(row, key, !row.placement[key])
                            }
                          >
                            <PinIcon kind={key} on={row.placement[key]} />
                          </button>
                        )}
                      </td>
                    ))}
                    <td className="c-k">
                      <details className="routine-menu">
                        <summary
                          className="kebab"
                          aria-label={`More for ${row.title}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.7" />
                            <circle cx="12" cy="12" r="1.7" />
                            <circle cx="19" cy="12" r="1.7" />
                          </svg>
                        </summary>
                        <div>
                          {row.source && (
                            <a
                              href={row.source}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source
                            </a>
                          )}
                          {row.id.startsWith("routine:") ? (
                            builtinOwnable(row.game, row.id) && (
                              <button onClick={() => void copy(row)}>
                                Make it mine
                              </button>
                            )
                          ) : (
                            row.task && (
                              <>
                                <button
                                  onClick={() => open("create", row.task)}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    void onAction({
                                      type: "record",
                                      collection: "tasks",
                                      id: row.id,
                                      value: null,
                                      ...actionMeta(),
                                    })
                                  }
                                >
                                  Delete routine
                                </button>
                              </>
                            )
                          )}
                          <button
                            onClick={() =>
                              setPlacement(
                                row,
                                "followed",
                                !row.placement.followed,
                              )
                            }
                          >
                            {row.placement.followed
                              ? "Stop following"
                              : "Follow"}
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <details className="routine-histories">
        <summary>Catch up & recorded history</summary>
        {accounts.map((a) => (
          <RoutineHistory
            key={a.id}
            account={a}
            state={state}
            now={now}
            onAction={onAction}
          />
        ))}
      </details>
      {!accounts.some((a) =>
        routineRows(state, a.id, now).some((r) => r.placement.followed),
      ) && (
        <p className="empty-state">
          No routines followed yet. Browse the library to choose your dailies,
          weekly tasks and game cycles.
        </p>
      )}
    </section>
  );
}

/** The Round 6 pin glyphs: a list for the Checklist, staggered bars for the Timeline. */
function PinIcon({ kind }: { kind: "checklist" | "timeline"; on?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {kind === "checklist" ? (
        <>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
        </>
      ) : (
        <path d="M4 6h9M8 12h12M4 18h7" strokeWidth="2.2" />
      )}
    </svg>
  );
}
