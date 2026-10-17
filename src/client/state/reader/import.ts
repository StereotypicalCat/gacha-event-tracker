import type { ReaderState } from "./schema.ts";
import { pairKey } from "./schema.ts";
import { recordOf } from "./actions.ts";
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
  for (const account of Object.values(incoming.accounts)) {
    const mine = Object.values(next.accounts).find(
      (a) =>
        a.game === account.game && a.region === account.region && !a.retiredAt,
    );
    let id = mine?.id ?? account.id;
    let suffix = 0;
    while (!mine && next.accounts[id]) id = `account:import-${++suffix}`;
    next.accounts[id] = mine ?? { ...account, id };
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
          .filter((d): d is string => typeof d === "string")
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
      for (const [item, entry] of Object.entries(items))
        merged[item] = mergeRecords(recordOf(merged[item]), recordOf(entry));
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
    for (const r of Object.values(incoming.archive).filter(
      (r) => r.accountId === account.id,
    )) {
      const key = pairKey(id, r.event.id);
      if (!next.archive[key] || next.archive[key]!.outcomeAt < r.outcomeAt)
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
  }
  return next;
}
