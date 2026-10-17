import { parseReaderExport, buildReaderExport } from "./export.ts";
import { READER_KEYS, type SaveResult } from "./schema.ts";
import { readLegacy, tryWriteJson } from "./store.ts";
export function finishPendingRestore(storage: Storage): SaveResult {
  try {
    const raw = storage.getItem(READER_KEYS.pending);
    if (raw === null) return { ok: true };
    const pending = JSON.parse(raw) as { payload?: unknown };
    const reader = parseReaderExport(pending.payload);
    if (!reader) return { ok: false, reason: "invalid" };
    const result = tryWriteJson(storage, READER_KEYS.reader, reader);
    if (!result.ok) return result;
    storage.removeItem(READER_KEYS.pending);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
export function prepareRestore(
  storage: Storage,
  payload: unknown,
  at: string,
): SaveResult {
  const reader = parseReaderExport(payload);
  if (!reader) return { ok: false, reason: "invalid" };
  try {
    const oldRaw = storage.getItem(READER_KEYS.reader);
    if (oldRaw === null) return { ok: false, reason: "invalid" };
    const before = parseReaderExport({
      format: "gacha-tracker-export",
      version: 2,
      reader: JSON.parse(oldRaw),
    });
    if (!before) return { ok: false, reason: "invalid" };
    const recovery = tryWriteJson(
      storage,
      READER_KEYS.recovery,
      buildReaderExport(before, readLegacy(storage), at),
    );
    if (!recovery.ok) return recovery;
    const prepared = tryWriteJson(storage, READER_KEYS.pending, {
      at,
      payload: buildReaderExport(reader, {}, at),
    });
    if (!prepared.ok) return prepared;
    return finishPendingRestore(storage);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
export function undoRestore(storage: Storage): SaveResult {
  try {
    const raw = storage.getItem(READER_KEYS.recovery);
    if (raw === null) return { ok: false, reason: "invalid" };
    return prepareRestore(storage, JSON.parse(raw), new Date().toISOString());
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
