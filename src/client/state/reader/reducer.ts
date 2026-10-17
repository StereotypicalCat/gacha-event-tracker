import { applyReaderAliases } from "./aliases.ts";
import { archiveOutcome, restoreArchive, reconcileArchive } from "./archive.ts";
import {
  type Account,
  type ArchiveRecord,
  type ReaderState,
  type SeenEvent,
  emptyAccountData,
  pairKey,
} from "./schema.ts";
export type ReaderAction = { at: string; opId: string } & (
  | {
      type: "outcome";
      accountId: string;
      eventId: string;
      outcome: "done" | "ignored" | "unfinished";
    }
  | { type: "restore"; accountId: string; eventId: string }
  | { type: "aliases"; table: Record<string, string> }
  | { type: "reconcile" }
  | { type: "prefs"; patch: Record<string, unknown> }
  | {
      type: "progress";
      accountId: string;
      itemId: string;
      patch: Record<string, unknown>;
    }
  | { type: "ignore"; accountId: string; itemId: string; ignored: boolean }
  | {
      type: "day";
      accountId: string;
      revisionId: string;
      itemId: string;
      day: string;
      checked: boolean;
    }
  | {
      type: "amount";
      accountId: string;
      revisionId: string;
      itemId: string;
      period: string;
      value: number | null;
    }
  | { type: "account"; account: Account; baseAccount?: Account }
  | {
      type: "archive";
      record: ArchiveRecord | null;
      accountId: string;
      eventId: string;
    }
  | { type: "seenEvents"; records: SeenEvent[] }
  | {
      type: "record";
      collection: "customGames" | "customEvents" | "tasks";
      id: string;
      value: unknown;
    }
  | { type: "seenBatch"; entries: { id: string; ids: string[] }[] }
  | { type: "seen"; kind: "codeSeen" | "eventSeen"; id: string; ids: string[] }
  | { type: "redeem"; accountId: string; codeId: string; redeemed: boolean }
);
export function actionFields(action: ReaderAction): string[] {
  if (action.type === "outcome" || action.type === "restore")
    return [JSON.stringify(["archive", action.accountId, action.eventId])];
  if (action.type === "prefs")
    return Object.keys(action.patch).map((k) => JSON.stringify(["prefs", k]));
  if (action.type === "progress")
    return Object.keys(action.patch).map((k) =>
      JSON.stringify([action.accountId, "progress", action.itemId, k]),
    );
  if (action.type === "day")
    return [
      JSON.stringify([
        action.accountId,
        action.revisionId,
        action.itemId,
        action.day,
      ]),
    ];
  if (action.type === "amount")
    return [
      JSON.stringify([
        action.accountId,
        action.revisionId,
        action.itemId,
        action.period,
      ]),
    ];
  if (action.type === "ignore")
    return [JSON.stringify([action.accountId, "ignore", action.itemId])];
  if (action.type === "account")
    return [JSON.stringify(["account", action.account.id])];
  if (action.type === "archive")
    return [JSON.stringify(["archive", action.accountId, action.eventId])];
  if (action.type === "record")
    return [JSON.stringify([action.collection, action.id])];
  if (action.type === "redeem")
    return [JSON.stringify(["redeem", action.accountId, action.codeId])];
  return [];
}
export function reduceReader(
  state: ReaderState,
  action: ReaderAction,
): ReaderState {
  const operations = Array.isArray(state.operations)
    ? (state.operations as string[])
    : [];
  if (operations.includes(action.opId)) return state;
  const times = (state.fieldTimes ?? {}) as Record<string, string>;
  const fields = actionFields(action);
  if (fields.some((k) => (times[k] ?? "") > action.at))
    throw new Error("conflict");
  const next: ReaderState = {
    ...state,
    revision: state.revision + 1,
    operations: [...operations.slice(-1023), action.opId],
    fieldTimes: {
      ...times,
      ...Object.fromEntries(fields.map((k) => [k, action.at])),
    },
  };
  if (action.type === "aliases") return applyReaderAliases(next, action.table);
  if (action.type === "outcome")
    return archiveOutcome(
      next,
      action.accountId,
      action.eventId,
      action.outcome,
      action.at,
    );
  if (action.type === "restore")
    return restoreArchive(next, action.accountId, action.eventId);
  if (action.type === "reconcile")
    return reconcileArchive(next, [], Date.parse(action.at));
  if (action.type === "prefs") next.prefs = { ...state.prefs, ...action.patch };
  else if (action.type === "account") {
    let account = action.account;
    const old = state.accounts[account.id],
      base = action.baseAccount;
    if (old && base) {
      account = { ...old };
      for (const key of new Set([
        ...Object.keys(base),
        ...Object.keys(action.account),
      ])) {
        const value = action.account[key];
        if (JSON.stringify(value) === JSON.stringify(base[key])) continue;
        if (key === "routines") {
          const routines = { ...old.routines };
          for (const id of new Set([
            ...Object.keys(base.routines),
            ...Object.keys(action.account.routines),
          ]))
            if (
              JSON.stringify(base.routines[id]) !==
              JSON.stringify(action.account.routines[id])
            ) {
              const changed = action.account.routines[id];
              if (changed) {
                const placement = { ...(old.routines[id] ?? changed) };
                for (const field of new Set([
                  ...Object.keys(base.routines[id] ?? {}),
                  ...Object.keys(changed),
                ])) {
                  if (
                    JSON.stringify(changed[field]) ===
                    JSON.stringify(base.routines[id]?.[field])
                  )
                    continue;
                  if (changed[field] === undefined) delete placement[field];
                  else placement[field] = changed[field];
                }
                routines[id] = placement;
              } else delete routines[id];
            }
          account.routines = routines;
        } else if (key === "clocks") {
          account.clocks = [
            ...old.clocks,
            ...action.account.clocks.filter(
              (c) =>
                !base.clocks.some((b) => b.id === c.id) &&
                !old.clocks.some((b) => b.id === c.id),
            ),
          ];
        } else if (value === undefined) delete account[key];
        else account[key] = value;
      }
    }
    next.accounts = { ...state.accounts, [account.id]: account };
    next.data = {
      ...state.data,
      [action.account.id]: state.data[action.account.id] ?? emptyAccountData(),
    };
  } else if (action.type === "record") {
    const values = { ...state[action.collection] };
    if (action.value === null) delete values[action.id];
    else values[action.id] = action.value;
    next[action.collection] = values;
  } else if (action.type === "archive") {
    const values = { ...state.archive };
    const key = pairKey(action.accountId, action.eventId);
    if (action.record === null) delete values[key];
    else values[key] = action.record;
    next.archive = values;
  } else if (action.type === "seenEvents") {
    next.seenEvents = { ...state.seenEvents };
    for (const r of action.records) {
      const key = pairKey(r.accountId, r.event.id),
        old = next.seenEvents[key];
      next.seenEvents[key] = {
        ...r,
        firstSeenAt: old?.firstSeenAt ?? r.firstSeenAt,
      };
    }
  } else if (action.type === "seenBatch") {
    next.eventSeen = { ...state.eventSeen };
    for (const e of action.entries)
      next.eventSeen[e.id] = [
        ...new Set([...(state.eventSeen[e.id] ?? []), ...e.ids]),
      ];
  } else if (action.type === "seen") {
    next[action.kind] = {
      ...state[action.kind],
      [action.id]: [
        ...new Set([...(state[action.kind][action.id] ?? []), ...action.ids]),
      ],
    };
  } else if (action.type === "redeem") {
    const values = { ...state.codeRedeemed[action.accountId] };
    if (action.redeemed) values[action.codeId] = action.at;
    else delete values[action.codeId];
    next.codeRedeemed = { ...state.codeRedeemed, [action.accountId]: values };
  } else {
    const old = state.data[action.accountId];
    if (!old || !state.accounts[action.accountId]) throw new Error("invalid");
    const data = { ...old };
    if (action.type === "progress") {
      const raw = old.progress[action.itemId];
      const value =
        typeof raw === "object" && raw !== null
          ? ({ ...raw } as Record<string, unknown>)
          : {};
      for (const [k, v] of Object.entries(action.patch)) {
        if (v === undefined || v === null) delete value[k];
        else value[k] = v;
      }
      data.progress = {
        ...old.progress,
        [action.itemId]: { ...value, at: action.at },
      };
    } else if (action.type === "ignore") {
      data.ignored = { ...old.ignored };
      if (action.ignored) data.ignored[action.itemId] = { at: action.at };
      else delete data.ignored[action.itemId];
    } else if (action.type === "day") {
      if (
        !state.accounts[action.accountId]!.clocks.some(
          (c) => c.id === action.revisionId,
        )
      )
        throw new Error("invalid");
      const revision = old.daily[action.revisionId] ?? {};
      const entry = revision[action.itemId] as { days?: string[] } | undefined;
      const days = new Set(Array.isArray(entry?.days) ? entry.days : []);
      if (action.checked) days.add(action.day);
      else days.delete(action.day);
      data.daily = {
        ...old.daily,
        [action.revisionId]: {
          ...revision,
          [action.itemId]: { ...entry, days: [...days].sort(), at: action.at },
        },
      };
    } else if (action.type === "amount") {
      if (
        !state.accounts[action.accountId]!.clocks.some(
          (c) => c.id === action.revisionId,
        )
      )
        throw new Error("invalid");
      const revision = old.amounts[action.revisionId] ?? {};
      const log = {
        ...((revision[action.itemId] as Record<string, unknown>) ?? {}),
      };
      if (action.value === null) delete log[action.period];
      else log[action.period] = { value: action.value, at: action.at };
      data.amounts = {
        ...old.amounts,
        [action.revisionId]: { ...revision, [action.itemId]: log },
      };
    }
    next.data = { ...state.data, [action.accountId]: data };
  }
  return next;
}
