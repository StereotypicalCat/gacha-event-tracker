import type { LaneId } from "../../../shared/custom.ts";
import { withReaderLock } from "./lock.ts";
import { finishPendingRestore } from "./restore.ts";
import { initializeReader } from "./store.ts";
import type { AccountId, ReaderState } from "./schema.ts";

/**
 * Open the reader's save at start-up: finish an interrupted restore, then
 * migrate or reconcile and write back. Both read the envelope and write it
 * again, so they run under the lock every save takes; otherwise a second
 * tab's save landing between the read and the write would be overwritten.
 */
export async function openReader(
  storage: Storage,
  games: readonly LaneId[],
  at: string,
  mint: () => AccountId,
): Promise<
  { ok: true; state: ReaderState } | { ok: false; reason: "restore" | "open" }
> {
  const open = () => {
    if (!finishPendingRestore(storage).ok)
      return { ok: false, reason: "restore" } as const;
    const opened = initializeReader(storage, games, at, mint);
    return opened.ok ? opened : ({ ok: false, reason: "open" } as const);
  };
  // Both steps catch their own errors, so a throw here is the lock itself
  // being unavailable (no Web Locks and no IndexedDB, as in some private
  // windows). Opening unlocked then is what start-up did before the lock.
  try {
    return await withReaderLock(open);
  } catch {
    return open();
  }
}
