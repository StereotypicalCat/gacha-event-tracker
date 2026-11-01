import type { ReaderState } from "./schema.ts";
import { pairKey } from "./schema.ts";
import { recordOf } from "./actions.ts";
import { contentEvents, legacyMiliastraId, routeReaderContent } from "./contentRouting.ts";
import { displayGameFor } from "../../../shared/classification.ts";
const stamp = (v: unknown) => {
  const r = recordOf(v);
  return typeof r.updatedAt === "string"
    ? r.updatedAt
    : typeof r.at === "string"
      ? r.at
      : "";
};
function mergeRecords(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...a };
  for (const [id, value] of Object.entries(b)) {
    if (next[id] === undefined) next[id] = value;
    else if (stamp(value) > stamp(next[id]))
      next[id] = { ...recordOf(next[id]), ...recordOf(value) };
  }
  return next;
}
export function mergeReaderData(
  current: ReaderState,
  incoming: ReaderState,
): ReaderState {
  const next = {
    ...incoming,
    ...current,
    importedExtensions: [
      ...(Array.isArray(current.importedExtensions)
        ? current.importedExtensions
        : []),
      ...(Array.isArray(incoming.importedExtensions)
        ? incoming.importedExtensions
        : []),
      {
        migratedAt: incoming.migratedAt,
        root: Object.fromEntries(
          Object.entries(incoming).filter(
            ([k]) =>
              ![
                "version",
                "revision",
                "migratedAt",
                "legacyDigest",
                "accounts",
                "data",
                "archive",
                "seenEvents",
                "prefs",
                "customGames",
                "customEvents",
                "tasks",
                "codeSeen",
                "codeRedeemed",
                "eventSeen",
                "operations",
                "fieldTimes",
                "legacyRaw",
                "legacyAccounts",
                "importedExtensions",
              ].includes(k),
          ),
        ),
        accounts: Object.fromEntries(
          Object.entries(incoming.accounts).map(([id, a]) => [
            id,
            Object.fromEntries(
              Object.entries(a).filter(
                ([k]) =>
                  ![
                    "id",
                    "game",
                    "region",
                    "intent",
                    "routines",
                    "clocks",
                    "retiredAt",
                  ].includes(k),
              ),
            ),
          ]),
        ),
      },
    ],
    codeSeen: Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(current.codeSeen),
          ...Object.keys(incoming.codeSeen),
        ]),
      ].map((k) => [
        k,
        [
          ...new Set([
            ...(current.codeSeen[k] ?? []),
            ...(incoming.codeSeen[k] ?? []),
          ]),
        ],
      ]),
    ),
    eventSeen: { ...current.eventSeen },
    revision: current.revision + 1,
    accounts: { ...current.accounts },
    data: { ...current.data },
    archive: { ...current.archive },
    seenEvents: { ...current.seenEvents },
    customGames: mergeRecords(current.customGames, incoming.customGames),
    customEvents: mergeRecords(current.customEvents, incoming.customEvents),
    tasks: mergeRecords(current.tasks, incoming.tasks),
    codeRedeemed: { ...current.codeRedeemed },
  };
  next.importedExtensions = [
    ...new Map(
      next.importedExtensions.map((value) => [JSON.stringify(value), value]),
    ).values(),
  ];
  const accountMap = new Map<string, string>();
  const usedTargets = new Set<string>();
  const movedIds = new Set(contentEvents(incoming).filter(e => displayGameFor(e) === "miliastra").map(e => e.id));
  const localTimes = recordOf(current.fieldTimes), remoteTimes = recordOf(incoming.fieldTimes);
  const mergedTimes = { ...localTimes };
  for (const account of Object.values(incoming.accounts).sort((a, b) => Number(a.game === "miliastra") - Number(b.game === "miliastra"))) {
    const origin = typeof account.contentOrigin === "string" ? accountMap.get(account.contentOrigin) ?? account.contentOrigin : undefined;
    const hasMovedData = account.game === "genshin" && (typeof recordOf(incoming.contentRoutes)[account.id] === "string" || [
      ...Object.keys(incoming.data[account.id]?.progress ?? {}),
      ...Object.keys(incoming.data[account.id]?.ignored ?? {}),
      ...Object.values(incoming.data[account.id]?.daily ?? {}).flatMap(Object.keys),
      ...Object.values(incoming.data[account.id]?.amounts ?? {}).flatMap(Object.keys),
      ...Object.values(incoming.seenEvents).filter(r => r.accountId === account.id).map(r => r.event.id),
      ...Object.values(incoming.archive).filter(r => r.accountId === account.id).map(r => r.event.id),
    ].some(id => legacyMiliastraId(id) || movedIds.has(id)));
    const exact = next.accounts[account.id];
    const mine = (exact?.game === account.game ? exact : undefined) ?? Object.values(current.accounts).find(
      (a) =>
        !hasMovedData && a.game === account.game && a.region === account.region && !a.retiredAt && !usedTargets.has(a.id) && (account.game !== "miliastra" || a.contentOrigin === origin),
    );
    let id = mine?.id ?? account.id;
    let suffix = 0;
    while (!mine && next.accounts[id]) id = `account:import-${++suffix}`;
    next.accounts[id] = mine ?? { ...account, id, ...(origin ? { contentOrigin: origin } : {}) };
    accountMap.set(account.id, id);
    usedTargets.add(id);
    next.eventSeen[id] = [
      ...new Set([
        ...(next.eventSeen[id] ?? []),
        ...(incoming.eventSeen[account.id] ?? []),
      ]),
    ];
    const old = next.data[id],
      data = incoming.data[account.id];
    if (!data) continue;

    const revisionMap = new Map<string, string>();
    for (const clock of account.clocks) {
      const clocks = next.accounts[id]!.clocks;
      const existing = clocks.find(
        (c) =>
          JSON.stringify({ ...c, id: null, historicalOnly: null }) ===
          JSON.stringify({ ...clock, id: null, historicalOnly: null }),
      );
      if (existing) revisionMap.set(clock.id, existing.id);
      else {
        let clockId = clock.id;
        while (clocks.some((c) => c.id === clockId)) clockId += "-import";
        next.accounts[id] = {
          ...next.accounts[id]!,
          clocks: [
            {
              ...clock,
              id: clockId,
              ...(mine ? { historicalOnly: true } : {}),
            },
            ...next.accounts[id]!.clocks,
          ],
        };
        revisionMap.set(clock.id, clockId);
      }
    }
    const daily = { ...old?.daily },
      amounts = { ...old?.amounts };
    for (const [revision, items] of Object.entries(data.daily)) {
      const target = revisionMap.get(revision) ?? revision;
      const merged = { ...daily[target] };
      for (const [item, entry] of Object.entries(items)) {
        const a = recordOf(merged[item]),
          b = recordOf(entry);
        const days = [
          ...new Set([
            ...(Array.isArray(a.days) ? a.days : []),
            ...(Array.isArray(b.days) ? b.days : []),
          ]),
        ]
          .filter((d): d is string => {
            if (typeof d !== "string") return false;
            const local = recordOf(current.fieldTimes)[JSON.stringify([id, target, item, d])];
            const imported = recordOf(incoming.fieldTimes)[JSON.stringify([account.id, revision, item, d])];
            // A local deletion is authoritative over an older backup. Explicit
            // newer imported operations can still restore that day.
            const remoteTime = String(imported ?? ""), localTime = String(local ?? "");
            if (remoteTime > localTime && remoteTime >= stamp(a)) return Array.isArray(b.days) && b.days.includes(d);
            return !localTime || remoteTime > localTime || (Array.isArray(a.days) && a.days.includes(d));
          })
          .sort();
        merged[item] = {
          ...a,
          ...b,
          days,
          at: stamp(a) > stamp(b) ? stamp(a) : stamp(b),
        };
      }
      daily[target] = merged;
    }
    for (const [revision, items] of Object.entries(data.amounts)) {
      const target = revisionMap.get(revision) ?? revision;
      const merged = { ...amounts[target] };
      for (const [item, entry] of Object.entries(items)) {
        const a = recordOf(merged[item]), b = recordOf(entry), values = { ...a };
        const periods = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of Object.keys(remoteTimes)) {
          try { const p = JSON.parse(key); if (p[0] === account.id && p[1] === revision && p[2] === item && typeof p[3] === "string") periods.add(p[3]); } catch { /* opaque extension */ }
        }
        for (const period of periods) {
          const lt = String(localTimes[JSON.stringify([id, target, item, period])] ?? stamp(a[period]));
          const rt = String(remoteTimes[JSON.stringify([account.id, revision, item, period])] ?? stamp(b[period]));
          if (rt > lt) { if (b[period] === undefined) delete values[period]; else values[period] = b[period]; }
        }
        merged[item] = values;
      }
      amounts[target] = merged;
    }
    next.data[id] = {
      ...old,
      ...data,
      progress: mergeRecords(old?.progress ?? {}, data.progress),
      ignored: mergeRecords(old?.ignored ?? {}, data.ignored),
      daily,
      amounts,
    };
    const resultData = next.data[id]!;
    for (const item of new Set([...Object.keys(old?.progress ?? {}), ...Object.keys(data.progress)])) {
      const a = recordOf(old?.progress[item]), b = recordOf(data.progress[item]);
      const value = { ...recordOf(resultData.progress[item]) };
      const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of Object.keys(remoteTimes)) {
        try { const p = JSON.parse(key); if (p[0] === account.id && p[1] === "progress" && p[2] === item && typeof p[3] === "string") fields.add(p[3]); } catch { /* opaque extension */ }
      }
      for (const field of fields) {
        const lt = String(localTimes[JSON.stringify([id, "progress", item, field])] ?? "");
        const rt = String(remoteTimes[JSON.stringify([account.id, "progress", item, field])] ?? "");
        if (lt && lt >= (rt || stamp(b))) { if (a[field] === undefined) delete value[field]; else value[field] = a[field]; }
        else if (rt && rt >= stamp(a)) { if (b[field] === undefined) delete value[field]; else value[field] = b[field]; }
      }
      const restoreTime = String(localTimes[JSON.stringify(["archive", id, item])] ?? "");
      if (restoreTime > stamp(b) && !current.archive[pairKey(id, item)] && a.status !== "done") delete value.status;
      resultData.progress[item] = value;
    }
    for (const item of new Set([...Object.keys(old?.ignored ?? {}), ...Object.keys(data.ignored)])) {
      const lt = String(localTimes[JSON.stringify([id, "ignore", item])] ?? "");
      const rt = String(remoteTimes[JSON.stringify([account.id, "ignore", item])] ?? stamp(data.ignored[item]));
      if (lt && lt >= rt) { if (old?.ignored[item] === undefined) delete resultData.ignored[item]; else resultData.ignored[item] = old.ignored[item]; }
      else if (rt && data.ignored[item] === undefined) delete resultData.ignored[item];
    }
    for (const r of Object.values(incoming.archive).filter(
      (r) => r.accountId === account.id,
    )) {
      const key = pairKey(id, r.event.id);
      if ((!next.archive[key] || next.archive[key]!.outcomeAt < r.outcomeAt) && String(localTimes[JSON.stringify(["archive", id, r.event.id])] ?? "") <= r.outcomeAt)
        next.archive[key] = {
          ...r,
          accountId: id,
          clockRevision: revisionMap.get(r.clockRevision) ?? r.clockRevision,
        };
    }
    for (const r of Object.values(incoming.seenEvents).filter(
      (r) => r.accountId === account.id,
    )) {
      const key = pairKey(id, r.event.id);
      if (
        !next.seenEvents[key] ||
        next.seenEvents[key]!.lastSeenAt < r.lastSeenAt
      )
        next.seenEvents[key] = {
          ...r,
          accountId: id,
          clockRevision: revisionMap.get(r.clockRevision) ?? r.clockRevision,
        };
    }
    next.codeRedeemed[id] = {
      ...current.codeRedeemed[id],
      ...incoming.codeRedeemed[account.id],
    };
    for (const [key, time] of Object.entries(remoteTimes)) {
      try {
        const path = JSON.parse(key);
        if (!Array.isArray(path)) continue;
        if (path[0] === account.id) {
          path[0] = id;
          if (typeof path[1] === "string" && revisionMap.has(path[1])) path[1] = revisionMap.get(path[1]);
        } else if (path[0] === "archive" && path[1] === account.id) path[1] = id;
        else continue;
        const target = JSON.stringify(path);
        if (String(mergedTimes[target] ?? "") < String(time)) mergedTimes[target] = time;
      } catch { /* Opaque field paths remain in imported extensions. */ }
    }
  }
  const routes = { ...recordOf((next as ReaderState).contentRoutes) };
  for (const [from, to] of Object.entries(recordOf(incoming.contentRoutes))) {
    const origin = accountMap.get(from), target = typeof to === "string" ? accountMap.get(to) : undefined;
    if (origin && target && routes[origin] === undefined) routes[origin] = target;
  }
  if (Object.keys(routes).length) (next as ReaderState).contentRoutes = routes;
  if (Object.keys(mergedTimes).length) (next as ReaderState).fieldTimes = mergedTimes;
  return routeReaderContent(next);
}
