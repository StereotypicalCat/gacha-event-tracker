import { z } from "zod";
import type { DisplayEvent } from "../../../shared/custom.ts";
import { GachaEvent, Region } from "../../../shared/schema.ts";
const record = z.record(z.unknown());
export const AccountIdSchema = z.string().regex(/^account:[a-zA-Z0-9-]+$/);
export type AccountId = z.infer<typeof AccountIdSchema>;
export const ClockRevisionSchema = z
  .object({
    id: z.string().min(1),
    effectiveAt: z.string().datetime(),
    region: Region,
    reset: z
      .object({
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .nullable(),
    automaticBase: z.object({
      offsetUtc: z.number().min(-14).max(14),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
    }),
  })
  .passthrough();
export type ClockRevision = z.infer<typeof ClockRevisionSchema>;
export const TrackingIntentSchema = z
  .object({
    events: z.boolean(),
    dailies: z.boolean(),
    weeklyMonthly: z.boolean(),
    cycles: z.boolean(),
  })
  .passthrough();
export type TrackingIntent = z.infer<typeof TrackingIntentSchema>;
export const RoutinePlacementSchema = z
  .object({
    followed: z.boolean(),
    checklist: z.boolean(),
    timeline: z.boolean(),
  })
  .passthrough();
export type RoutinePlacement = z.infer<typeof RoutinePlacementSchema>;
export const AccountSchema = z
  .object({
    id: AccountIdSchema,
    game: z.string().min(1),
    region: Region,
    intent: TrackingIntentSchema,
    routines: z.record(RoutinePlacementSchema),
    clocks: z.array(ClockRevisionSchema).min(1),
    retiredAt: z.string().datetime().optional(),
  })
  .passthrough();
export type Account = z.infer<typeof AccountSchema>;
export const AccountDataSchema = z
  .object({
    progress: record,
    ignored: record,
    daily: z.record(record),
    amounts: z.record(record),
  })
  .passthrough();
export type AccountData = z.infer<typeof AccountDataSchema>;
export const DisplayEventSchema = z.custom<DisplayEvent>((value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.game !== "string" ||
    v.game.length === 0 ||
    !(v.sourceUrl === null || typeof v.sourceUrl === "string")
  )
    return false;
  // Validate the existing timestamp/precision invariants without widening the wire feed schema.
  return GachaEvent.safeParse({
    ...v,
    game: "genshin",
    sourceUrl: v.sourceUrl ?? "https://reader.invalid/",
  }).success;
});
export const ArchiveRecordSchema = z
  .object({
    accountId: AccountIdSchema,
    event: DisplayEventSchema,
    outcome: z.enum(["done", "ignored", "unfinished"]),
    outcomeAt: z.string().datetime(),
    resolvedEnd: z.number().finite().nullable(),
    clockRevision: z.string(),
    progress: z.unknown(),
    days: z.array(z.string()),
    amounts: record,
  })
  .passthrough();
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;
export const SeenEventSchema = z
  .object({
    accountId: AccountIdSchema,
    event: DisplayEventSchema,
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    clockRevision: z.string(),
  })
  .passthrough();
export type SeenEvent = z.infer<typeof SeenEventSchema>;
export const ReaderStateSchema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    migratedAt: z.string().datetime(),
    legacyDigest: z.string(),
    accounts: z.record(AccountSchema),
    data: z.record(AccountDataSchema),
    archive: z.record(ArchiveRecordSchema),
    seenEvents: z.record(SeenEventSchema),
    prefs: record,
    customGames: record,
    customEvents: record,
    tasks: record,
    codeSeen: z.record(z.array(z.string())),
    codeRedeemed: z.record(z.record(z.string())),
    eventSeen: z.record(z.array(z.string())),
  })
  .passthrough()
  .superRefine((s, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    for (const [id, a] of Object.entries(s.accounts)) {
      if (id !== a.id || !s.data[id]) invalid("Account identity/data mismatch");
      const ids = new Set(a.clocks.map((c) => c.id));
      if (ids.size !== a.clocks.length) invalid("Duplicate clock revision");
      if (!a.clocks.some((c) => c.historicalOnly !== true))
        invalid("Missing active clock");
      const data = s.data[id];
      if (
        data &&
        [...Object.keys(data.daily), ...Object.keys(data.amounts)].some(
          (r) => !ids.has(r),
        )
      )
        invalid("Unknown log clock revision");
    }
    for (const id of Object.keys(s.data))
      if (!s.accounts[id]) invalid("Orphan account data");
    for (const collection of [s.archive, s.seenEvents])
      for (const [key, r] of Object.entries(collection)) {
        const a = s.accounts[r.accountId];
        if (
          !a ||
          a.game !== r.event.game ||
          key !== pairKey(r.accountId, r.event.id) ||
          !a.clocks.some((c) => c.id === r.clockRevision)
        )
          invalid("Invalid event account/clock reference");
      }
    for (const id of Object.keys(s.codeRedeemed))
      if (!s.accounts[id]) invalid("Orphan code redemption");
  });
export type ReaderState = z.infer<typeof ReaderStateSchema>;
export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "quota" | "invalid" | "conflict" };
export const READER_KEYS = {
  reader: "gacha-tracker:v2:reader",
  migrationRecovery: "gacha-tracker:v2:migration-recovery",
  pending: "gacha-tracker:v2:restore-pending",
  backups: "gacha-tracker:v2:backups",
  /** Backups the reader made with Back up now; never pruned by `retainBackups`. */
  manualBackups: "gacha-tracker:v2:manual-backups",
  recovery: "gacha-tracker:v2:restore-recovery",
} as const;
export function emptyAccountData(): AccountData {
  return { progress: {}, ignored: {}, daily: {}, amounts: {} };
}
export function pairKey(accountId: string, eventId: string): string {
  return JSON.stringify([accountId, eventId]);
}
