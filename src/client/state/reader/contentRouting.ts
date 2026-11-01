import { classifiedEvent, displayGameFor, passPlacementId } from "../../../shared/classification.ts";
import type { DisplayEvent } from "../../../shared/custom.ts";
import { DisplayEventSchema, emptyAccountData, pairKey, type ReaderState } from "./schema.ts";
import { recordOf } from "./actions.ts";
import type { ReaderAction } from "./reducer.ts";

/** Identity hints from the audit; used only for old marks with no snapshot. */
export function legacyMiliastraId(id: string): boolean {
  return /^genshin:(?:starlit-gala(?:-wonderland-selects)?|silvery-moonlight-chronicle|phantasmagoric-chronicle|starlight-voyage-[a-z-]+|raiment-collection-[a-z-]+):\d{4}-\d{2}-\d{2}$/.test(id);
}
export function contentEvents(state: ReaderState): DisplayEvent[] {
  const out = new Map<string, DisplayEvent>();
  for (const raw of [
    ...Object.values(state.archive).map(r => r.event),
    ...Object.values(state.seenEvents).map(r => r.event),
    ...Object.values(recordOf(state.contentEvents)),
  ]) {
    const p = DisplayEventSchema.safeParse(raw);
    if (p.success) out.set(p.data.id, p.data);
  }
  return [...out.values()];
}
function routedId(state: ReaderState, account: string, item: string): string {
  const to = recordOf(state.contentRoutes)[account];
  if (typeof to !== "string" || !state.accounts[to]) return account;
  return legacyMiliastraId(item) || contentEvents(state).some(e => e.id === item && displayGameFor(e) === "miliastra") ? to : account;
}

/** Late operations from a pre-upgrade tab must use destination tombstones. */
export function routeContentAction(state: ReaderState, action: ReaderAction): ReaderAction {
  if (!("accountId" in action)) return action;
  const item = "itemId" in action ? action.itemId : "eventId" in action ? action.eventId : null;
  if (!item) return action;
  const accountId = routedId(state, action.accountId, item);
  if (accountId === action.accountId) return action;
  if (action.type === "archive" && action.record)
    return { ...action, accountId, record: { ...action.record, accountId, event: classifiedEvent(action.record.event) } };
  return { ...action, accountId };
}

const families: Record<string, string[]> = {
  genshin: ["battle-pass"], miliastra: ["miliastra-pass"], hsr: ["nameless-honor"], zzz: ["city-fund"], nikki: ["mira-journey"],
};
export const passFamiliesForGame = (game: string): string[] => (families[game] ?? []).map(f => `feed-cycle:${game}:${f}`);

/**
 * Normalize under the reader lock, before validation/save. The wire event keeps
 * its source game; only saved snapshots and client rows use the logical lane.
 * Every identity and day key survives. Origin timestamps remain as tombstones
 * so an old tab or an old backup cannot recreate a cleared destination value.
 */
export function routeReaderContent(state: ReaderState): ReaderState {
  const next = structuredClone(state);
  const routes = { ...recordOf(next.contentRoutes) };
  const events = contentEvents(next);
  const miliastraIds = new Set(events.filter(e => displayGameFor(e) === "miliastra").map(e => e.id));
  const isMoved = (id: string) => miliastraIds.has(id) || legacyMiliastraId(id);
  const times = { ...recordOf(next.fieldTimes) } as Record<string, string>;
  const stamp = (v: unknown) => String(recordOf(v).at ?? recordOf(v).updatedAt ?? "");
  const fieldTime = (a: string, kind: string, id: string, field?: string) => times[JSON.stringify(field === undefined ? [a, kind, id] : [a, kind, id, field])] ?? "";
  for (const origin of Object.values(next.accounts).filter(a => a.game === "genshin")) {
    const src = next.data[origin.id];
    if (!src) continue;
    const ids = new Set([
      ...Object.keys(src.progress), ...Object.keys(src.ignored),
      ...Object.values(src.daily).flatMap(Object.keys),
      ...Object.values(src.amounts).flatMap(Object.keys),
      ...(next.eventSeen[origin.id] ?? []),
      ...Object.values(next.seenEvents).filter(r => r.accountId === origin.id).map(r => r.event.id),
      ...Object.values(next.archive).filter(r => r.accountId === origin.id).map(r => r.event.id),
    ].filter(isMoved));
    // Inventory supplies a destination even on a device with no prior marks.
    if (miliastraIds.size && origin.intent.events) for (const id of miliastraIds) ids.add(id);
    if (!ids.size && typeof routes[origin.id] !== "string") continue;
    const placeholder = Object.values(next.accounts).find(a => a.game === "miliastra" && a.contentPlaceholder === true && a.region === origin.region && !a.contentOrigin && Object.values(next.data[a.id]?.progress ?? {}).length === 0);
    const targetId = typeof routes[origin.id] === "string" ? routes[origin.id] as string : placeholder?.id ?? `account:miliastra-${origin.id.slice("account:".length)}`;
    const existing = next.accounts[targetId];
    // A deterministic target may never overwrite an unrelated imported account.
    if (existing && existing !== placeholder && existing.contentOrigin !== origin.id) throw new Error("content account identity collision");
    routes[origin.id] = targetId;
    if (!existing || existing === placeholder) {
      next.accounts[targetId] = { ...origin, id: targetId, game: "miliastra", contentOrigin: origin.id, contentPlaceholder: false, passTrackingMigrated: false, legacyPassVisibility: origin.legacyPassVisibility ?? origin.intent.events, routines: {}, intent: { events: origin.intent.events, dailies: false, weeklyMonthly: false, cycles: origin.intent.cycles } };
      next.data[targetId] = emptyAccountData();
    }
    const target = next.accounts[targetId]!;
    // Keep newly encountered historical revisions; never replace a destination's
    // active clock or settings after its independent creation.
    for (const c of origin.clocks) if (!target.clocks.some(t => t.id === c.id)) target.clocks.unshift({ ...c, historicalOnly: true });
    const dst = next.data[targetId]!;
    for (const id of ids) {
      if (Object.hasOwn(src.progress, id)) {
        const a = recordOf(src.progress[id]), b = recordOf(dst.progress[id]), merged = { ...b };
        for (const [field, value] of Object.entries(a)) {
          const sourceTime = fieldTime(origin.id, "progress", id, field) || stamp(a);
          const destTime = fieldTime(targetId, "progress", id, field) || stamp(b);
          if (sourceTime > destTime || (!Object.hasOwn(b, field) && !destTime)) merged[field] = value;
        }
        dst.progress[id] = merged;
        delete src.progress[id];
      }
      if (Object.hasOwn(src.ignored, id)) {
        const st = fieldTime(origin.id, "ignore", id) || stamp(src.ignored[id]);
        const dt = fieldTime(targetId, "ignore", id) || stamp(dst.ignored[id]);
        if (st > dt || !dt) dst.ignored[id] = src.ignored[id];
        delete src.ignored[id];
      }
      for (const kind of ["daily", "amounts"] as const) {
        for (const [revision, items] of Object.entries(src[kind])) {
          if (!Object.hasOwn(items, id)) continue;
          const values = dst[kind][revision] ??= {};
          const a = recordOf(items[id]), b = recordOf(values[id]);
          if (kind === "daily") {
            const ad = Array.isArray(a.days) ? a.days as string[] : [];
            const bd = Array.isArray(b.days) ? b.days as string[] : [];
            const days = new Set(bd);
            for (const day of ad) {
              const path = (account: string) => JSON.stringify([account, revision, id, day]);
              const st = times[path(origin.id)] || stamp(a), dt = times[path(targetId)] || stamp(b);
              if (st > dt || !dt) days.add(day);
            }
            values[id] = { ...a, ...b, days: [...days].sort(), at: stamp(a) > stamp(b) ? stamp(a) : stamp(b) };
          } else {
            const merged = { ...b };
            for (const [period, value] of Object.entries(a)) {
              const path = (account: string) => JSON.stringify([account, revision, id, period]);
              const st = times[path(origin.id)] || stamp(value), dt = times[path(targetId)] || stamp(b[period]);
              if (st > dt || !dt) merged[period] = value;
            }
            values[id] = merged;
          }
          delete items[id];
        }
      }
      for (const kind of ["archive", "seenEvents"] as const) {
        const from = pairKey(origin.id, id), to = pairKey(targetId, id), r = next[kind][from];
        if (!r) continue;
        const old = next[kind][to];
        const rtime = String("outcomeAt" in r ? r.outcomeAt : r.lastSeenAt);
        const oldTime = old ? String("outcomeAt" in old ? old.outcomeAt : old.lastSeenAt) : "";
        const deletion = kind === "archive" ? times[JSON.stringify(["archive", targetId, id])] ?? "" : "";
        if (rtime > oldTime && rtime >= deletion) {
          const moved = { ...r, accountId: targetId, event: classifiedEvent(r.event) };
          if (kind === "archive") next.archive[to] = moved as ReaderState["archive"][string];
          else next.seenEvents[to] = moved as ReaderState["seenEvents"][string];
        }
        delete next[kind][from];
      }
    }
    const movedSeen = (next.eventSeen[origin.id] ?? []).filter(isMoved);
    if (movedSeen.length) {
      next.eventSeen[targetId] = [...new Set([...(next.eventSeen[targetId] ?? []), ...movedSeen])];
      next.eventSeen[origin.id] = (next.eventSeen[origin.id] ?? []).filter(id => !isMoved(id));
    }
    for (const [key, value] of Object.entries(times)) {
      let path: unknown;
      try { path = JSON.parse(key); } catch { continue; }
      if (!Array.isArray(path)) continue;
      if (path[0] === origin.id && path.some(v => typeof v === "string" && isMoved(v))) path[0] = targetId;
      else if (path[0] === "archive" && path[1] === origin.id && typeof path[2] === "string" && isMoved(path[2])) path[1] = targetId;
      else continue;
      const to = JSON.stringify(path);
      if (!times[to] || times[to]! < value) times[to] = value;
    }
  }
  if (Object.keys(routes).length) {
    next.contentRoutes = routes;
    const known = Array.isArray(next.prefs.knownGames) ? next.prefs.knownGames as string[] : Object.values(state.accounts).map(a => a.game);
    if (!known.includes("miliastra")) {
      next.prefs.knownGames = [...known, "miliastra"];
      next.prefs.hiddenGames = [...new Set([...(Array.isArray(next.prefs.hiddenGames) ? next.prefs.hiddenGames : []), "miliastra"])];
    }
  }
  for (const account of Object.values(next.accounts)) {
    if (account.passTrackingMigrated === true) continue;
    const legacy = account.legacyPassVisibility === true || (account.legacyPassVisibility === undefined && account.intent.events);
    for (const key of passFamiliesForGame(account.game)) account.routines[key] ??= { followed: legacy, checklist: legacy, timeline: legacy };
    account.legacyPassVisibility = legacy;
    account.passTrackingMigrated = true;
  }
  // Preserve source identities here. This cache also exposes passes when Events
  // is off, so they need not masquerade as seen/unfinished ordinary events.
  for (const event of events) {
    const key = passPlacementId(event);
    if (!key) continue;
    for (const a of Object.values(next.accounts).filter(a => a.game === displayGameFor(event))) a.routines[key] ??= { followed: a.intent.cycles, checklist: a.intent.cycles, timeline: a.intent.cycles };
  }
  if (Object.keys(times).length) next.fieldTimes = times;
  return JSON.stringify(next) === JSON.stringify(state) ? state : next;
}
