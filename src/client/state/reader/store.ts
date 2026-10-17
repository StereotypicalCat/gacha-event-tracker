import { withReaderLock } from "./lock.ts";
import { refreshAutomaticClocks } from "./clock.ts";
import { reconcileLegacy } from "./legacy.ts";
import type { LaneId } from "../../../shared/custom.ts";
import { migrateLegacy } from "./migration.ts";
import {
  ReaderStateSchema,
  READER_KEYS,
  type AccountId,
  type ReaderState,
  type SaveResult,
} from "./schema.ts";
import { reduceReader, type ReaderAction } from "./reducer.ts";
export interface ReaderStore {
  getSnapshot(): ReaderState;
  subscribe(listener: () => void): () => void;
  dispatch(action: ReaderAction): Promise<SaveResult>;
  getError(): SaveResult | null;
  dispose(): void;
}
export function tryWriteJson(
  storage: Storage,
  key: string,
  value: unknown,
): SaveResult {
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "quota"
          : "unavailable",
    };
  }
}
export function readLegacy(storage: Storage): Record<string, string> {
  const raw: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("gacha-tracker:v1:")) {
      const value = storage.getItem(key);
      if (value !== null) raw[key] = value;
    }
  }
  return raw;
}
export function initializeReader(
  storage: Storage,
  games: readonly LaneId[],
  at: string,
  mint: () => AccountId,
): { ok: true; state: ReaderState } | { ok: false; reason: string } {
  try {
    const saved = storage.getItem(READER_KEYS.reader);
    if (saved !== null) {
      const parsed = ReaderStateSchema.safeParse(JSON.parse(saved));
      if (!parsed.success) return { ok: false, reason: "invalid" };
      const next = refreshAutomaticClocks(
        reconcileLegacy(parsed.data, readLegacy(storage), at),
        at,
      );
      if (next !== parsed.data) {
        const result = tryWriteJson(storage, READER_KEYS.reader, next);
        if (!result.ok) return result;
      }
      return { ok: true, state: next };
    }
    const raw = readLegacy(storage);
    const recovered = tryWriteJson(storage, READER_KEYS.migrationRecovery, {
      at,
      legacy: raw,
    });
    if (!recovered.ok) return recovered;
    const state = migrateLegacy(raw, games, at, mint);
    const result = tryWriteJson(storage, READER_KEYS.reader, state);
    return result.ok ? { ok: true, state } : result;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
export function createReaderStore(
  storage: Storage,
  initial: ReaderState,
): ReaderStore {
  let state = initial,
    error: SaveResult | null = null;
  const listeners = new Set<() => void>();
  let queued = Promise.resolve();
  const notify = () => {
    for (const f of listeners) f();
  };
  const persisted = (): ReaderState | null => {
    const raw = storage.getItem(READER_KEYS.reader);
    if (raw === null) return null;
    const value = ReaderStateSchema.safeParse(JSON.parse(raw));
    if (!value.success) throw new Error("invalid");
    return value.data;
  };
  const apply = (action: ReaderAction): SaveResult => {
    try {
      const current = persisted() ?? state;
      const next = reduceReader(current, action);
      if (next === current) {
        state = current;
        notify();
        return { ok: true };
      }
      const parsed = ReaderStateSchema.safeParse(next);
      if (!parsed.success) return { ok: false, reason: "invalid" };
      const result = tryWriteJson(storage, READER_KEYS.reader, next);
      if (!result.ok) return result;
      const confirmed = persisted();
      if (
        confirmed?.revision !== next.revision ||
        !(confirmed.operations as string[] | undefined)?.includes(action.opId)
      )
        return { ok: false, reason: "conflict" };
      state = next;
      notify();
      return result;
    } catch (e) {
      return {
        ok: false,
        reason:
          e instanceof Error && e.message === "conflict"
            ? "conflict"
            : e instanceof Error && e.message === "invalid"
              ? "invalid"
              : "unavailable",
      };
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== READER_KEYS.reader) return;
    try {
      const next = persisted();
      if (next) {
        state = next;
        notify();
      }
    } catch {
      error = { ok: false, reason: "invalid" };
      notify();
    }
  };
  if (typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  return {
    getSnapshot: () => state,
    getError: () => error,
    subscribe: (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    dispatch: (input) => {
      const action: ReaderAction =
        input.type === "account" && state.accounts[input.account.id]
          ? { ...input, baseAccount: state.accounts[input.account.id]! }
          : input;
      const run = async () => {
        let result: SaveResult;
        try {
          result = await withReaderLock(() => apply(action));
        } catch {
          result = { ok: false, reason: "unavailable" };
        }
        error = result.ok ? null : result;
        notify();
        return result;
      };
      const result = queued.then(run, run);
      queued = result.then(() => {});
      return result;
    },
    dispose: () => {
      if (typeof window !== "undefined")
        window.removeEventListener("storage", onStorage);
      listeners.clear();
    },
  };
}
