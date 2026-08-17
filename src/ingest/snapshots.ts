/**
 * The raw snapshot cache.
 *
 * Every fetched page is stored verbatim on disk so that re-parsing — which is
 * the thing we actually iterate on — never costs the source another request
 * (AGENTS.md § Scraping conduct). A snapshot plus its metadata is also what
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
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SnapshotMeta {
  sourceId: string;
  url: string;
  /** sha256 of the served bytes, hex. The parse stage skips work when it is unchanged. */
  contentHash: string;
  /** The served length, in bytes — not the length of the decoded text. */
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  /** ISO timestamp of the fetch that last produced *different* bytes. */
  contentChangedAt: string;
  /** Events the adapter yielded from this body, for drop detection. */
  eventCount: number | null;
  /**
   * The encoding the stored bytes are in, as the server declared it. Absent in
   * metadata written before charsets were handled, which is read as UTF-8.
   */
  charset?: string;
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
  /**
   * The body as served. Bytes are the honest unit: a page in Shift_JIS or
   * Latin-1 that we stored as re-encoded text could never be re-decoded, and
   * `snapshots/README.md` promises "the body verbatim". A string is accepted
   * as a convenience and is stored as UTF-8.
   */
  body: Uint8Array | string;
  /** The encoding `body` is in. Defaults to UTF-8. */
  charset?: string;
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

export function hashBody(body: Uint8Array | string): string {
  return new Bun.CryptoHasher("sha256").update(body).digest("hex");
}

const DEFAULT_CHARSET = "utf-8";

/** The charset a `Content-Type` header declares, lowercased, or null. */
export function charsetFromContentType(contentType: string | null): string | null {
  if (contentType === null) return null;
  const match = /;\s*charset\s*=\s*"?([^;"\s]+)"?/i.exec(contentType);
  return match?.[1]?.toLowerCase() ?? null;
}

/** The charset a `<meta>` tag declares in the first bytes of a document. */
export function sniffMetaCharset(bytes: Uint8Array): string | null {
  // Every encoding we might meet here is ASCII-compatible in its first 2 KiB,
  // so reading the head as Latin-1 cannot lose the declaration.
  const head = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    Math.min(bytes.byteLength, 2048),
  ).toString("latin1");
  const match = /<meta[^>]*?charset\s*=\s*["']?\s*([a-z0-9_\-:.]+)/i.exec(head);
  return match?.[1]?.toLowerCase() ?? null;
}

export interface DecodedBody {
  text: string;
  /** The charset actually used, which is what gets recorded in the metadata. */
  charset: string;
}

/**
 * Decode a fetched body into text.
 *
 * `Response.text()` assumes UTF-8, so a page served in Shift_JIS or Latin-1
 * comes back as a field of U+FFFD. That is not merely ugly: mojibake in a title
 * flows through `slugify` into the event ID, which is a localStorage key, so a
 * mis-decoded fetch silently orphans every completion mark for that source
 * (AGENTS.md § Event IDs are localStorage keys).
 *
 * Header first, then a `<meta charset>` sniff, then UTF-8. An encoding label
 * the runtime does not know falls back to UTF-8 rather than throwing — the raw
 * bytes are kept either way, so a wrong guess stays recoverable.
 */
export function decodeBody(
  bytes: Uint8Array,
  contentType: string | null,
): DecodedBody {
  const declared =
    charsetFromContentType(contentType) ?? sniffMetaCharset(bytes) ?? DEFAULT_CHARSET;
  try {
    const decoder = new TextDecoder(declared);
    return { text: decoder.decode(bytes), charset: decoder.encoding };
  } catch {
    return {
      text: new TextDecoder(DEFAULT_CHARSET).decode(bytes),
      charset: DEFAULT_CHARSET,
    };
  }
}

function toBytes(body: Uint8Array | string): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function decodeStored(bytes: Uint8Array, charset: string | undefined): string {
  try {
    return new TextDecoder(charset ?? DEFAULT_CHARSET).decode(bytes);
  } catch {
    return new TextDecoder(DEFAULT_CHARSET).decode(bytes);
  }
}

/**
 * Write a file by writing a sibling temp file and renaming it into place.
 *
 * `rename` within a directory is atomic, so a reader — the feed build, git,
 * the next refresh — sees either the whole old file or the whole new one, and
 * a crash mid-write leaves a stray temp file rather than a truncated snapshot.
 */
async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const temp = `${path}.tmp-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeFile(temp, data);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Would writing this metadata change the file on disk? */
function sameMeta(a: SnapshotMeta, b: SnapshotMeta): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

    // Decoded with the charset the bytes were stored in, so a Shift_JIS page
    // reads back as the text the wiki published rather than as mojibake.
    const bytes = new Uint8Array(await body.arrayBuffer());
    return {
      meta,
      state: await this.readState(sourceId),
      html: decodeStored(bytes, meta.charset),
    };
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
   * The floor is six hours per source (AGENTS.md). A source we have never
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
   * Identical bytes are a no-op on the body and keep the original
   * `contentChangedAt`, so an unchanged source does not look like a changed
   * one. The validators are the exception: a server is free to rotate an ETag
   * while serving the very same bytes, and keeping the old one would mean
   * sending a stale `If-None-Match` forever — every cycle costing the wiki a
   * full body where a 304 was the whole point (AGENTS.md § Scraping conduct).
   * So the metadata is refreshed, and `changed` stays false.
   */
  async save(sourceId: string, input: SaveInput): Promise<SaveResult> {
    const bytes = toBytes(input.body);
    const charset = input.charset ?? DEFAULT_CHARSET;
    const contentHash = hashBody(bytes);
    const previous = await this.readMeta(sourceId);
    const bodyExists = await Bun.file(this.bodyPath(sourceId)).exists();
    const changed =
      previous === null || previous.contentHash !== contentHash || !bodyExists;

    const meta: SnapshotMeta = {
      sourceId,
      url: input.url,
      contentHash,
      bytes: bytes.byteLength,
      etag: input.etag,
      lastModified: input.lastModified,
      contentChangedAt: changed ? input.at : (previous?.contentChangedAt ?? input.at),
      // New bytes mean the count they yielded, even when that is unknown; the
      // same bytes keep the count we already recorded for them.
      eventCount: changed
        ? input.eventCount
        : (input.eventCount ?? previous?.eventCount ?? null),
      charset,
    };

    await mkdir(this.root, { recursive: true });

    if (!changed && previous !== null) {
      if (sameMeta(previous, meta)) return { changed: false, meta: previous };
      await writeAtomic(this.metaPath(sourceId), `${JSON.stringify(meta, null, 2)}\n`);
      return { changed: false, meta };
    }

    // Body first, metadata second, each renamed into place. A crash between
    // them leaves new bytes beside older metadata, whose stale hash makes the
    // next save rewrite both — the other order would leave metadata claiming a
    // hash for bytes that were never written, and the next save would believe
    // it and skip them.
    await writeAtomic(this.bodyPath(sourceId), bytes);
    await writeAtomic(this.metaPath(sourceId), `${JSON.stringify(meta, null, 2)}\n`);

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
    await writeAtomic(this.statePath(sourceId), `${JSON.stringify(state, null, 2)}\n`);
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
