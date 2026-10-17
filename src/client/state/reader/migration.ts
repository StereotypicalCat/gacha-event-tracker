import { ruleIdOf } from "../../../shared/recurrence.ts";
import type { LaneId } from "../../../shared/custom.ts";
import { GameId } from "../../../shared/schema.ts";
import { resetHourFor, serverOffsetUtc } from "../../../shared/time.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { shownFor } from "../../../shared/perGame.ts";
import {
  adoptNewLanes,
  choreRule,
  routineRule,
  restorePrefsValue,
} from "../usePrefs.ts";
import { KEYS } from "../storage.ts";
import {
  type AccountId,
  type ReaderState,
  emptyAccountData,
} from "./schema.ts";
export function legacyRecord(
  raw: Record<string, string>,
  key: string,
): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(raw[key] ?? "{}");
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
export function legacyDigest(raw: Record<string, string>): string {
  // Stable comparison stamp; not a security or identity hash.
  let n = 2166136261;
  for (const c of JSON.stringify(
    Object.keys(raw)
      .sort()
      .map((k) => [k, raw[k]]),
  ))
    n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0).toString(16);
}
export function migrateLegacy(
  raw: Record<string, string>,
  games: readonly LaneId[],
  at: string,
  mint: () => AccountId,
): ReaderState {
  const originalPrefs = restorePrefsValue(legacyRecord(raw, KEYS.prefs));
  const prefs = {
    ...originalPrefs,
    ...adoptNewLanes(
      games,
      originalPrefs.knownGames,
      originalPrefs.hiddenGames,
    ),
  };
  const tasks = legacyRecord(raw, KEYS.tasks),
    ownGames = legacyRecord(raw, KEYS.customGames),
    ownEvents = legacyRecord(raw, KEYS.customEvents);
  const progress = legacyRecord(raw, KEYS.progress),
    legacy = legacyRecord(raw, KEYS.completions);
  for (const [id, value] of Object.entries(legacy))
    if (
      progress[id] === undefined &&
      typeof value === "object" &&
      value !== null
    )
      progress[id] = { ...value, status: "done" };
  const daily = legacyRecord(raw, KEYS.daily),
    ignored = legacyRecord(raw, KEYS.ignored),
    amounts = legacyRecord(raw, KEYS.amounts);
  const lanes = new Set([...games, ...Object.keys(ownGames)]);
  const gameOf = (id: string): string | undefined => {
    const task = tasks[id] as { game?: unknown } | undefined;
    const event = ownEvents[ruleIdOf(id)] as { game?: unknown } | undefined;
    if (typeof task?.game === "string") return task.game;
    if (typeof event?.game === "string") return event.game;
    const parts = id.split(":");
    const candidate =
      parts[0] === "routine" || parts[0] === "dailies" ? parts[1] : parts[0];
    return GameId.safeParse(candidate).success ? candidate : undefined;
  };
  for (const map of [progress, daily, ignored, amounts, tasks, ownEvents])
    for (const id of Object.keys(map)) {
      const game = gameOf(id);
      if (game) lanes.add(game);
    }
  const state: ReaderState = {
    version: 2,
    revision: 0,
    migratedAt: at,
    legacyDigest: legacyDigest(raw),
    accounts: {},
    data: {},
    archive: {},
    seenEvents: {},
    prefs: { ...prefs },
    customGames: ownGames,
    customEvents: ownEvents,
    tasks,
    codeSeen: {},
    codeRedeemed: {},
    eventSeen: {},
    legacyRaw: raw,
    legacyAccounts: {},
  };
  for (const game of lanes) {
    const id = mint();
    if (state.accounts[id])
      throw new Error("Duplicate minted account identity");
    const revision = "initial";
    const routineRuleValue = routineRule(prefs);
    const chore = shownFor(choreRule(prefs), game);
    const routines = Object.fromEntries(
      routinesFor(game).map((r) => {
        const followed =
          shownFor(routineRuleValue, game) &&
          !(prefs.routinesHidden ?? []).includes(r.id) &&
          !(r.pulls === "standard" && !prefs.standardPulls);
        return [r.id, { followed, checklist: followed, timeline: followed }];
      }),
    );
    for (const [taskId, task] of Object.entries(tasks))
      if ((task as { game?: unknown })?.game === game) {
        const unit = (task as { period?: { unit?: string } }).period?.unit;
        const shown =
          unit === "week"
            ? prefs.showWeeklyTasks
            : unit === "month"
              ? prefs.showMonthlyTasks
              : prefs.showCycleTasks;
        routines[taskId] = {
          followed: true,
          checklist: shown,
          timeline: shown,
        };
      }
    if (GameId.safeParse(game).success)
      routines[`dailies:${game}`] = {
        followed: chore,
        checklist: chore,
        timeline: chore,
      };
    state.accounts[id] = {
      id,
      game,
      region: prefs.region,
      intent: {
        events: !prefs.hiddenGames.includes(game),
        dailies: chore,
        weeklyMonthly: shownFor(routineRuleValue, game),
        cycles: shownFor(routineRuleValue, game),
      },
      routines,
      clocks: [
        {
          id: revision,
          effectiveAt: "1970-01-01T00:00:00.000Z",
          region: prefs.region,
          reset: null,
          automaticBase: {
            offsetUtc: serverOffsetUtc(prefs.region, game),
            hour: resetHourFor(prefs.region, game),
            minute: 0,
          },
        },
      ],
    };
    const data = emptyAccountData();
    for (const [name, map] of Object.entries({ progress, ignored }))
      data[name as "progress" | "ignored"] = Object.fromEntries(
        Object.entries(map).filter(([key]) => gameOf(key) === game),
      );
    data.daily[revision] = Object.fromEntries(
      Object.entries(daily).filter(([key]) => gameOf(key) === game),
    );
    data.amounts[revision] = Object.fromEntries(
      Object.entries(amounts).filter(([key]) => gameOf(key) === game),
    );
    state.data[id] = data;
    (state.legacyAccounts as Record<string, string>)[game] = id;
  }
  return state;
}
