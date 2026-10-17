import type { ReaderState } from "./schema.ts";
import { legacyRecord, legacyDigest, migrateLegacy } from "./migration.ts";
import { KEYS } from "../storage.ts";
import { recordOf } from "./actions.ts";
import { reduceReader } from "./reducer.ts";
export function reconcileLegacy(
  state: ReaderState,
  raw: Record<string, string>,
  at: string,
): ReaderState {
  const digest = legacyDigest(raw);
  if (digest === state.legacyDigest) return state;
  const baseline = recordOf(state.legacyRaw) as Record<string, string>;
  let n = 0;
  const incoming = migrateLegacy(
    raw,
    Object.keys(recordOf(state.legacyAccounts)),
    at,
    () => `account:legacy${++n}`,
  );
  const previous = migrateLegacy(
    baseline,
    Object.keys(recordOf(state.legacyAccounts)),
    at,
    () => `account:before${++n}`,
  );
  let next = state;
  for (const a of Object.values(incoming.accounts)) {
    const originalId = recordOf(state.legacyAccounts)[a.game];
    const account =
      typeof originalId === "string"
        ? next.accounts[originalId]
        : Object.values(next.accounts).find((x) => x.game === a.game);
    if (!account) continue;
    const beforeAccount = Object.values(previous.accounts).find(
      (b) => b.game === a.game,
    );
    const beforeData = beforeAccount
      ? previous.data[beforeAccount.id]
      : undefined;
    const includeRemoved = (
      now: Record<string, unknown>,
      old: Record<string, unknown>,
    ) =>
      Object.fromEntries(
        [...new Set([...Object.keys(now), ...Object.keys(old)])].map((id) => [
          id,
          now[id] ?? { at: recordOf(old[id]).at ?? state.migratedAt },
        ]),
      );
    const data = incoming.data[a.id]!,
      revision = account.clocks[0]!.id;
    for (const [item, value] of Object.entries(
      includeRemoved(data.progress, beforeData?.progress ?? {}),
    )) {
      if (
        Object.hasOwn(data.progress, item) &&
        JSON.stringify(value) ===
          JSON.stringify(legacyRecord(baseline, KEYS.progress)[item])
      )
        continue;
      const record = recordOf(value),
        timestamp = typeof record.at === "string" ? record.at : at,
        patch = { ...record };
      delete patch.at;
      for (const field of ["status", "effort", "note", "daily", "goal"])
        if (
          !(field in patch) &&
          field in recordOf(next.data[account.id]?.progress[item])
        )
          patch[field] = null;
      try {
        next = reduceReader(next, {
          type: "progress",
          accountId: account.id,
          itemId: item,
          patch,
          at: timestamp,
          opId: `legacy:${digest}:${account.id}:${item}`,
        });
      } catch {
        /* A newer v2 field/tombstone wins; raw legacy bytes remain preserved. */
      }
    }
    for (const [item, value] of Object.entries(
      includeRemoved(data.daily.initial ?? {}, beforeData?.daily.initial ?? {}),
    )) {
      if (
        JSON.stringify(value) ===
        JSON.stringify(legacyRecord(baseline, KEYS.daily)[item])
      )
        continue;
      const record = recordOf(value),
        old = recordOf(legacyRecord(baseline, KEYS.daily)[item]);
      const days = new Set(
        Array.isArray(record.days)
          ? record.days.filter((d): d is string => typeof d === "string")
          : [],
      );
      const before = new Set(
        Array.isArray(old.days)
          ? old.days.filter((d): d is string => typeof d === "string")
          : [],
      );
      for (const day of new Set([...days, ...before]))
        if (days.has(day) !== before.has(day))
          try {
            next = reduceReader(next, {
              type: "day",
              accountId: account.id,
              revisionId: revision,
              itemId: item,
              day,
              checked: days.has(day),
              at: typeof record.at === "string" ? record.at : at,
              opId: `legacy:${digest}:${item}:${day}`,
            });
          } catch {
            /* Do not resurrect a newer untick. */
          }
    }
    for (const [item, value] of Object.entries(
      includeRemoved(
        data.amounts.initial ?? {},
        beforeData?.amounts.initial ?? {},
      ),
    ))
      for (const [period, entry] of Object.entries(
        includeRemoved(
          recordOf(value),
          recordOf(beforeData?.amounts.initial?.[item]),
        ),
      )) {
        if (
          JSON.stringify(entry) ===
          JSON.stringify(
            recordOf(legacyRecord(baseline, KEYS.amounts)[item])[period],
          )
        )
          continue;
        const e = recordOf(entry);
        if (
          e.value !== undefined &&
          (typeof e.value !== "number" || !Number.isFinite(e.value))
        )
          continue;
        try {
          next = reduceReader(next, {
            type: "amount",
            accountId: account.id,
            revisionId: revision,
            itemId: item,
            period,
            value: typeof e.value === "number" ? e.value : null,
            at: typeof e.at === "string" ? e.at : at,
            opId: `legacy:${digest}:${item}:${period}`,
          });
        } catch {
          /* Preserve newer amounts. */
        }
      }
    for (const [item, value] of Object.entries(
      includeRemoved(data.ignored, beforeData?.ignored ?? {}),
    )) {
      if (
        Object.hasOwn(data.ignored, item) &&
        JSON.stringify(value) ===
          JSON.stringify(legacyRecord(baseline, KEYS.ignored)[item])
      )
        continue;
      const e = recordOf(value);
      try {
        next = reduceReader(next, {
          type: "ignore",
          accountId: account.id,
          itemId: item,
          ignored: Object.hasOwn(data.ignored, item),
          at: typeof e.at === "string" ? e.at : at,
          opId: `legacy:${digest}:ignore:${item}`,
        });
      } catch {
        /* Preserve newer restore decisions. */
      }
    }
  }
  for (const [collection, key] of [
    ["tasks", KEYS.tasks],
    ["customGames", KEYS.customGames],
    ["customEvents", KEYS.customEvents],
  ] as const)
    for (const id of new Set([
      ...Object.keys(legacyRecord(raw, key)),
      ...Object.keys(legacyRecord(baseline, key)),
    ])) {
      const value = legacyRecord(raw, key)[id] ?? null;
      if (
        JSON.stringify(value) ===
        JSON.stringify(legacyRecord(baseline, key)[id])
      )
        continue;
      const e = recordOf(value ?? legacyRecord(baseline, key)[id]);
      try {
        next = reduceReader(next, {
          type: "record",
          collection,
          id,
          value,
          at:
            typeof e.updatedAt === "string"
              ? e.updatedAt
              : typeof e.at === "string"
                ? e.at
                : at,
          opId: `legacy:${digest}:${collection}:${id}`,
        });
      } catch {
        /* Preserve newer edits. */
      }
    }
  return { ...next, legacyDigest: digest, legacyRaw: raw };
}
