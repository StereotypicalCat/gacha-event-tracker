/**
 * localStorage access.
 *
 * Everything here stays on the device — there is no account, no session, and
 * the server never learns what a user has completed. The `v1` segment in every
 * key is the migration hook: read old versions forward, and never delete an old
 * key until the migration has shipped and run, because a user who has not
 * opened the app in six months still has their data under it.
 */

const NS = "gacha-tracker:v1";

export const KEYS = {
  /**
   * Superseded by `progress`, which carries a status rather than using
   * membership to mean "done". Read once to migrate; never written, never
   * deleted — see useProgress.
   */
  completions: `${NS}:completions`,
  progress: `${NS}:progress`,
  ignored: `${NS}:ignored`,
  prefs: `${NS}:prefs`,
} as const;

/**
 * Reads never throw. A corrupt or foreign value falls back to the default
 * rather than taking the app down — losing a preference is recoverable, a blank
 * screen is not.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled (private mode). The UI keeps working
    // from in-memory state; only persistence is lost.
  }
}
