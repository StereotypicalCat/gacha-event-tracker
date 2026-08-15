/**
 * The raw snapshot cache.
 *
 * Every fetched page is stored verbatim on disk so that re-parsing — which is
 * the thing we actually iterate on — never costs the source another request
 * (CLAUDE.md § Scraping conduct). A snapshot plus its metadata is also what
 * makes a conditional request possible on the next cycle: we keep the ETag and
 * Last-Modified the server gave us and hand them back.
 *
 * Three files per source, and the split matters:
 *
 *   <root>/<id>.html         the body, exactly as served
 *   <root>/<id>.meta.json    durable facts: hash, validators, when it changed
 *   <root>/<id>.state.json   volatile run bookkeeping: when we last checked
 *
 * `.state.json` is separated (and gitignored) so that a refresh which confirms
 * "nothing changed" leaves a clean working tree. If check timestamps lived in
 * the metadata, every cycle would produce a commit that says nothing, and
 * "commit only when something changed" would be unenforceable.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SnapshotMeta {
  sourceId: string;
  url: string;
  /** sha256 of the body, hex. The parse stage skips work when it is unchanged. */
  contentHash: string;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  /** ISO timestamp of the fetch that last produced *different* bytes. */
  contentChangedAt: string;
  /** Events the adapter yielded from this body, for drop detection. */
  eventCount: number | null;
}

export interface SnapshotState {
  sourceId: string;
  /** Last attempt of any kind — this is what the minimum interval reads. */
  lastCheckedAt: string | null;
  /** Last time the server confirmed the body (200 or 304). */
  lastConfirmedAt: string | null;
  lastStatus: number | null;
  consecutiveFailures: number;
}

export interface Snapshot {
  meta: SnapshotMeta;
  state: SnapshotState;
  html: string;
}

export interface SaveInput {
  url: string;
  html: string;
  etag: string | null;
  lastModified: string | null;
  /** ISO timestamp of this fetch. */
  at: string;
  eventCount: number | null;
}

export interface SaveResult {
  changed: boolean;
  meta: SnapshotMeta;
}

export function hashBody(html: string): string {
  return new Bun.CryptoHasher("sha256").update(html).digest("hex");
}

function emptyState(sourceId: string): SnapshotState {
  return {
    sourceId,
    lastCheckedAt: null,
    lastConfirmedAt: null,
    lastStatus: null,
    consecutiveFailures: 0,
  };
}

export class SnapshotStore {
  constructor(readonly root: string = "snapshots") {}

  bodyPath(sourceId: string): string {
    return join(this.root, `${sourceId}.html`);
  }

  metaPath(sourceId: string): string {
    return join(this.root, `${sourceId}.meta.json`);
  }

  statePath(sourceId: string): string {
    return join(this.root, `${sourceId}.state.json`);
  }

  async readMeta(sourceId: string): Promise<SnapshotMeta | null> {
    const file = Bun.file(this.metaPath(sourceId));
    if (!(await file.exists())) return null;
    try {
      return (await file.json()) as SnapshotMeta;
    } catch {
      // A truncated metadata file must not take the run down; treat it as no
      // cache, which costs one full fetch and self-heals.
      return null;
    }
  }

  async readState(sourceId: string): Promise<SnapshotState> {
    const file = Bun.file(this.statePath(sourceId));
    if (!(await file.exists())) return emptyState(sourceId);
    try {
      return { ...emptyState(sourceId), ...((await file.json()) as SnapshotState) };
    } catch {
      return emptyState(sourceId);
    }
  }

  /** Body plus metadata, or null when this source has never been fetched. */
  async read(sourceId: string): Promise<Snapshot | null> {
    const meta = await this.readMeta(sourceId);
    if (meta === null) return null;

    const body = Bun.file(this.bodyPath(sourceId));
    if (!(await body.exists())) return null;

    return { meta, state: await this.readState(sourceId), html: await body.text() };
  }

  /** Sources with a stored snapshot, by id. */
  async list(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return [];
    }
    return names
      .filter((n) => n.endsWith(".meta.json"))
      .map((n) => n.slice(0, -".meta.json".length))
      .sort();
  }

  /**
   * Headers for the next request. An empty object is correct for a source we
   * have never seen — there is nothing to be conditional about.
   */
  conditionalHeaders(meta: SnapshotMeta | null): Record<string, string> {
    const headers: Record<string, string> = {};
    if (meta === null) return headers;
    if (meta.etag !== null && meta.etag !== "") {
      headers["If-None-Match"] = meta.etag;
    }
    if (meta.lastModified !== null && meta.lastModified !== "") {
      headers["If-Modified-Since"] = meta.lastModified;
    }
    return headers;
  }

  /**
   * Has enough time passed to fetch this source again?
   *
   * The floor is six hours per source (CLAUDE.md). A source we have never
   * checked is always due.
   */
  isDue(state: SnapshotState, nowMs: number, minIntervalMs: number): boolean {
    if (state.lastCheckedAt === null) return true;
    const last = Date.parse(state.lastCheckedAt);
    if (Number.isNaN(last)) return true;
    return nowMs - last >= minIntervalMs;
  }

  /** When this source may next be fetched, in epoch ms. */
  dueAt(state: SnapshotState, minIntervalMs: number): number {
    if (state.lastCheckedAt === null) return 0;
    const last = Date.parse(state.lastCheckedAt);
    return Number.isNaN(last) ? 0 : last + minIntervalMs;
  }

  /**
   * Store a fetched body.
   *
   * Identical bytes are a no-op on disk: the metadata keeps its original
   * `contentChangedAt` and validators, so an unchanged source produces no diff
   * for the workflow to commit.
   */
  async save(sourceId: string, input: SaveInput): Promise<SaveResult> {
    const contentHash = hashBody(input.html);
    const previous = await this.readMeta(sourceId);
    const bodyExists = await Bun.file(this.bodyPath(sourceId)).exists();
    const changed =
      previous === null || previous.contentHash !== contentHash || !bodyExists;

    if (!changed && previous !== null) {
      return { changed: false, meta: previous };
    }

    const meta: SnapshotMeta = {
      sourceId,
      url: input.url,
      contentHash,
      bytes: Buffer.byteLength(input.html),
      etag: input.etag,
      lastModified: input.lastModified,
      contentChangedAt: input.at,
      eventCount: input.eventCount,
    };

    await mkdir(this.root, { recursive: true });
    await writeFile(this.bodyPath(sourceId), input.html);
    await writeFile(this.metaPath(sourceId), `${JSON.stringify(meta, null, 2)}\n`);

    return { changed: true, meta };
  }

  /** Record an attempt: success, 304 or failure. Writes only state. */
  async recordCheck(
    sourceId: string,
    check: { at: string; status: number | null; ok: boolean },
  ): Promise<SnapshotState> {
    const previous = await this.readState(sourceId);
    const state: SnapshotState = {
      sourceId,
      lastCheckedAt: check.at,
      lastConfirmedAt: check.ok ? check.at : previous.lastConfirmedAt,
      lastStatus: check.status,
      consecutiveFailures: check.ok ? 0 : previous.consecutiveFailures + 1,
    };

    await mkdir(this.root, { recursive: true });
    await writeFile(this.statePath(sourceId), `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  /** Remove one source's cache entirely. Used by tests and by hand. */
  async forget(sourceId: string): Promise<void> {
    for (const path of [
      this.bodyPath(sourceId),
      this.metaPath(sourceId),
      this.statePath(sourceId),
    ]) {
      await rm(path, { force: true });
    }
  }
}

/**
 * How fresh a snapshot demonstrably is.
 *
 * The last time the server confirmed the body, when we know it; otherwise the
 * last time the content changed. Never later than reality — a freshness badge
 * that overstates is worse than one that lags.
 */
export function freshnessAt(snapshot: Snapshot): string {
  const confirmed = snapshot.state.lastConfirmedAt;
  if (confirmed === null) return snapshot.meta.contentChangedAt;
  return Date.parse(confirmed) > Date.parse(snapshot.meta.contentChangedAt)
    ? confirmed
    : snapshot.meta.contentChangedAt;
}
