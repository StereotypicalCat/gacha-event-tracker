import { mintLocalId } from "./ids.ts";
import { z } from "zod";
import { DAY } from "../../../shared/time.ts";
import { READER_KEYS, type ReaderState, type SaveResult } from "./schema.ts";
import { buildReaderExport } from "./export.ts";
import { readLegacy, tryWriteJson } from "./store.ts";
const BackupSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  payload: z.record(z.unknown()),
});
export type BackupSnapshot = z.infer<typeof BackupSchema>;
export function retainBackups(
  snapshots: readonly BackupSnapshot[],
  now: number,
): BackupSnapshot[] {
  const today = Math.floor(now / DAY) * DAY,
    dailyStart = today - 6 * DAY,
    weeklyStart = dailyStart - 28 * DAY,
    month = new Date(weeklyStart);
  const buckets = new Map<string, BackupSnapshot>();
  for (const s of snapshots) {
    const ms = Date.parse(s.at);
    if (!Number.isFinite(ms) || ms > now) continue;
    let key: string;
    if (ms >= dailyStart) key = `day:${Math.floor(ms / DAY)}`;
    else if (ms >= weeklyStart)
      key = `week:${Math.floor((dailyStart - ms - 1) / (7 * DAY))}`;
    else {
      const d = new Date(ms),
        index =
          (month.getUTCFullYear() - d.getUTCFullYear()) * 12 +
          month.getUTCMonth() -
          d.getUTCMonth();
      if (index < 0 || index > 5) continue;
      key = `month:${index}`;
    }
    if (!buckets.has(key) || buckets.get(key)!.at < s.at) buckets.set(key, s);
  }
  return [...buckets.values()].sort((a, b) => b.at.localeCompare(a.at));
}
export function readBackups(storage: Storage): BackupSnapshot[] {
  try {
    const p = z
      .array(BackupSchema)
      .safeParse(JSON.parse(storage.getItem(READER_KEYS.backups) ?? "[]"));
    return p.success ? p.data : [];
  } catch {
    return [];
  }
}
export function saveBackup(
  storage: Storage,
  state: ReaderState,
  at: string,
): SaveResult {
  const previous = readBackups(storage);
  const payload = buildReaderExport(state, readLegacy(storage), at);
  const next = retainBackups(
    [...previous, { id: mintLocalId(), at, payload }],
    Date.parse(at),
  );
  // Oldest first, but never the newest: one recent copy is worth more than
  // the room, and past the cap the main save is what would run out.
  while (next.length > 1 && JSON.stringify(next).length > AUTO_BACKUP_BYTES)
    next.pop();
  return tryWriteJson(storage, READER_KEYS.backups, next);
}
/**
 * The most the automatic history may take in local storage, in UTF-16 units.
 * Each snapshot embeds the state, `legacyRaw` and the v1 keys, and up to 17
 * are retained; for a heavy reader that alone could fill the origin's ~5MB.
 * Together with `MANUAL_BACKUP_BYTES` this leaves the main save room to grow.
 */
export const AUTO_BACKUP_BYTES = 1_500_000;
/**
 * Which part of the retained history a snapshot belongs to, with the same
 * windows `retainBackups` keeps: the last 7 days, the 4 weeks before them,
 * then months.
 */
export function backupTier(
  at: string,
  now: number,
): "daily" | "weekly" | "monthly" {
  const today = Math.floor(now / DAY) * DAY,
    dailyStart = today - 6 * DAY,
    weeklyStart = dailyStart - 28 * DAY,
    ms = Date.parse(at);
  return ms >= dailyStart ? "daily" : ms >= weeklyStart ? "weekly" : "monthly";
}

/** How many Back up now copies are kept; each is a whole export in local storage. */
export const MANUAL_BACKUP_LIMIT = 20;
/**
 * The most the Back up now list may take in local storage, in UTF-16 units.
 * The origin's quota (~5MB) is shared with the reader's own save, which
 * matters more than any copy of it: past this, Back up now asks the reader
 * to delete one instead of risking the main save.
 */
export const MANUAL_BACKUP_BYTES = 1_500_000;
/** Backups made with Back up now, newest first. Separate from the automatic history. */
export function readManualBackups(storage: Storage): BackupSnapshot[] {
  try {
    const raw: unknown = JSON.parse(
      storage.getItem(READER_KEYS.manualBackups) ?? "[]",
    );
    if (!Array.isArray(raw)) return [];
    // Entry by entry, so one unreadable copy does not discard the others.
    return raw
      .flatMap((entry) => {
        const p = BackupSchema.safeParse(entry);
        return p.success ? [p.data] : [];
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch {
    return [];
  }
}
export function saveManualBackup(
  storage: Storage,
  state: ReaderState,
  at: string,
): SaveResult | { ok: false; reason: "full" } {
  const previous = readManualBackups(storage);
  if (previous.length >= MANUAL_BACKUP_LIMIT)
    return { ok: false, reason: "full" };
  const payload = buildReaderExport(state, readLegacy(storage), at);
  const next = [{ id: mintLocalId(), at, payload }, ...previous];
  if (JSON.stringify(next).length > MANUAL_BACKUP_BYTES)
    return { ok: false, reason: "full" };
  return tryWriteJson(storage, READER_KEYS.manualBackups, next);
}
export function deleteManualBackup(storage: Storage, id: string): SaveResult {
  return tryWriteJson(
    storage,
    READER_KEYS.manualBackups,
    readManualBackups(storage).filter((b) => b.id !== id),
  );
}
