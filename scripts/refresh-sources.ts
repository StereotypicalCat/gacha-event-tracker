/**
 * Refresh every source, then regenerate the feed.
 *
 *   bun run refresh                          # the real thing
 *   bun run refresh --dry-run                # plan only, no requests, no writes
 *   bun run refresh --only genshin-game8-events
 *
 * This is the scheduled half of the pipeline (docs/INGESTION.md stages 1-2).
 * The rules it enforces are etiquette obligations, not preferences:
 *
 *   - robots.txt is read once per host per run and obeyed; unreadable means
 *     "do not fetch", never "assume yes".
 *   - at most ONE request per source per cycle, and never sooner than six hours
 *     after the last attempt. There is deliberately no retry: a retry is a
 *     second request, and the next cycle is minutes-cheap compared to being a
 *     bad guest.
 *   - conditional requests always, so an unchanged page costs the wiki a 304.
 *   - a descriptive User-Agent carrying a contact URL.
 *
 * Failure policy: one wiki being down is a warning. The previous snapshot stays
 * in place and the feed keeps its events — a source outage must never blank the
 * calendar. Hard failures (bad arguments, an unwritable cache, a feed that will
 * not rebuild) exit non-zero so CI stops before committing anything.
 */
import {
  ADAPTERS,
  adapterById,
} from "../src/ingest/adapters/index.ts";
import { SIX_HOURS_MS } from "../src/ingest/adapters/types.ts";
import type { Adapter } from "../src/ingest/adapters/types.ts";
import { RobotsCache, type FetchLike } from "../src/ingest/robots.ts";
import { decodeBody, SnapshotStore } from "../src/ingest/snapshots.ts";

const DEFAULT_CONTACT =
  "https://github.com/StereotypicalCat/gacha-event-tracker";

export const DEFAULT_USER_AGENT = `gacha-event-tracker/1.0 (+${process.env["REFRESH_CONTACT_URL"] ?? DEFAULT_CONTACT})`;

/** How a single source's cycle ended. */
export type RefreshResult =
  | "fetched" // 200 with new bytes, parsed, stored
  | "unchanged" // 304, or 200 whose bytes matched what we had
  | "skipped_interval" // fetched too recently to ask again
  | "skipped_robots" // robots.txt says no, or could not be read
  | "rejected" // fetched, but the body parsed worse than what we hold
  | "failed" // unreachable or an error status
  | "planned"; // --dry-run

export interface SourceOutcome {
  sourceId: string;
  result: RefreshResult;
  note: string;
  status: number | null;
  eventCount: number | null;
}

export interface RefreshSummary {
  outcomes: SourceOutcome[];
  /** Sources whose stored bytes changed — the only reason to commit. */
  changed: number;
  /** Sources we actually sent a request to. */
  attempted: number;
  /** Sources that answered (200 or 304). */
  confirmed: number;
  warnings: string[];
  /** Set when the run should exit non-zero. */
  hardFailure: string | null;
}

export interface RobotsGate {
  allows(url: string): Promise<{ allowed: boolean; reason: string }>;
}

export interface RefreshOptions {
  adapters: readonly Adapter[];
  store: SnapshotStore;
  robots: RobotsGate;
  fetchImpl: FetchLike;
  userAgent: string;
  /** Injected clock — the runner is testable, like the parsers it drives. */
  now: () => Date;
  dryRun: boolean;
  only: string | null;
  timeoutMs: number;
  log: (line: string) => void;
  /** Called once when something changed. Null skips the rebuild (tests). */
  rebuildFeed: (() => Promise<void>) | null;
}

/** A drop this steep means the page changed shape, not that events ended. */
const DROP_WARNING_RATIO = 0.5;

export async function runRefresh(
  options: RefreshOptions,
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    outcomes: [],
    changed: 0,
    attempted: 0,
    confirmed: 0,
    warnings: [],
    hardFailure: null,
  };

  const selected =
    options.only === null
      ? [...options.adapters]
      : options.adapters.filter((a) => a.id === options.only);

  if (selected.length === 0) {
    summary.hardFailure = `unknown source '${options.only ?? ""}'`;
    return summary;
  }

  for (const adapter of selected) {
    // One source can never take the cycle down with it. Everything inside
    // refreshOne that can fail is handled there; this is the backstop that
    // keeps an unforeseen throw from costing every source after this one its
    // turn — the sources are independent, and a run that stops halfway leaves
    // no summary and no record of what was already asked.
    let outcome: SourceOutcome;
    try {
      outcome = await refreshOne(adapter, options);
    } catch (error) {
      outcome = {
        sourceId: adapter.id,
        result: "failed",
        note: `unexpected error: ${String(error)}`,
        status: null,
        eventCount: null,
      };
    }
    summary.outcomes.push(outcome);

    if (outcome.result === "fetched") {
      summary.changed += 1;
      summary.attempted += 1;
      summary.confirmed += 1;
    } else if (outcome.result === "unchanged") {
      summary.attempted += 1;
      summary.confirmed += 1;
    } else if (outcome.result === "failed" || outcome.result === "rejected") {
      summary.attempted += 1;
      summary.warnings.push(`${adapter.id}: ${outcome.note}`);
    } else if (outcome.result === "skipped_robots") {
      summary.warnings.push(`${adapter.id}: ${outcome.note}`);
    }

    options.log(
      `  ${adapter.id.padEnd(24)} ${outcome.result.padEnd(17)} ${outcome.note}`,
    );
  }

  // Every source failing is not "a wiki is down", it is us: no network, a bad
  // User-Agent, a proxy. That should stop the pipeline rather than look green.
  if (summary.attempted > 0 && summary.confirmed === 0) {
    summary.hardFailure = `all ${summary.attempted} attempted sources failed`;
    return summary;
  }

  // Likewise, being turned away everywhere is news. Left as a warning it would
  // read as a quiet, successful, permanently empty refresh.
  if (summary.outcomes.every((o) => o.result === "skipped_robots")) {
    summary.hardFailure = `robots.txt blocked all ${summary.outcomes.length} sources`;
    return summary;
  }

  if (summary.changed > 0 && options.rebuildFeed !== null) {
    try {
      await options.rebuildFeed();
    } catch (error) {
      // New snapshots are on disk but do not produce a feed. Exiting non-zero
      // keeps CI from committing them.
      summary.hardFailure = `feed rebuild failed: ${String(error)}`;
    }
  }

  return summary;
}

async function refreshOne(
  adapter: Adapter,
  options: RefreshOptions,
): Promise<SourceOutcome> {
  const { store } = options;
  const now = options.now();
  const nowIso = now.toISOString();
  const meta = await store.readMeta(adapter.id);
  const state = await store.readState(adapter.id);
  const headers = store.conditionalHeaders(meta);

  if (!store.isDue(state, now.getTime(), adapter.minIntervalMs)) {
    const dueAt = new Date(store.dueAt(state, adapter.minIntervalMs));
    return {
      sourceId: adapter.id,
      result: "skipped_interval",
      note: `checked ${state.lastCheckedAt ?? "?"}, next due ${dueAt.toISOString()}`,
      status: null,
      eventCount: meta?.eventCount ?? null,
    };
  }

  if (options.dryRun) {
    const conditional = Object.keys(headers);
    return {
      sourceId: adapter.id,
      result: "planned",
      note: `would GET ${adapter.url}${
        conditional.length > 0 ? ` with ${conditional.join(", ")}` : " (no validators cached)"
      }`,
      status: null,
      eventCount: meta?.eventCount ?? null,
    };
  }

  const decision = await options.robots.allows(adapter.url);
  if (!decision.allowed) {
    return {
      sourceId: adapter.id,
      result: "skipped_robots",
      note: decision.reason,
      status: null,
      eventCount: meta?.eventCount ?? null,
    };
  }

  let response: Response;
  try {
    response = await options.fetchImpl(adapter.url, {
      headers: {
        "User-Agent": options.userAgent,
        Accept: "text/html,application/xhtml+xml",
        ...headers,
      },
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: "follow",
    });
  } catch (error) {
    await store.recordCheck(adapter.id, { at: nowIso, status: null, ok: false });
    return {
      sourceId: adapter.id,
      result: "failed",
      note: `unreachable: ${String(error)}`,
      status: null,
      eventCount: meta?.eventCount ?? null,
    };
  }

  if (response.status === 304) {
    await store.recordCheck(adapter.id, { at: nowIso, status: 304, ok: true });
    return {
      sourceId: adapter.id,
      result: "unchanged",
      note: "304 not modified",
      status: 304,
      eventCount: meta?.eventCount ?? null,
    };
  }

  if (!response.ok) {
    await store.recordCheck(adapter.id, {
      at: nowIso,
      status: response.status,
      ok: false,
    });
    return {
      sourceId: adapter.id,
      result: "failed",
      note: `HTTP ${response.status}`,
      status: response.status,
      eventCount: meta?.eventCount ?? null,
    };
  }

  // Reading the body is a second chance to fail — a reset connection, a
  // truncated response, or the timeout firing mid-stream. Left outside the try
  // this rejection escapes refreshOne, aborts the whole cycle, and leaves the
  // sources after this one unfetched and this one's `lastCheckedAt` unwritten:
  // one bad body would both blank the run and lose the record that we had
  // already spent this source's request.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    await store.recordCheck(adapter.id, {
      at: nowIso,
      status: response.status,
      ok: false,
    });
    return {
      sourceId: adapter.id,
      result: "failed",
      note: `body unreadable: ${String(error)}`,
      status: response.status,
      eventCount: meta?.eventCount ?? null,
    };
  }

  // Decode with the charset the server declared. Storing the raw bytes keeps
  // the snapshot re-decodable; decoding before parsing keeps mojibake out of
  // titles, and therefore out of the event IDs that are localStorage keys.
  const { text: html, charset } = decodeBody(
    bytes,
    response.headers.get("Content-Type"),
  );

  // The parse gate. A body that no longer parses, or that yields nothing where
  // it used to yield events, is a source that changed shape — publishing it
  // would empty a game's calendar silently, which is the failure this pipeline
  // exists to avoid. Keep what we hold and warn.
  let events: number;
  try {
    events = adapter.parse(html, {
      now: nowIso,
      sourceUrl: adapter.url,
      sourceId: adapter.id,
      game: adapter.game,
    }).length;
  } catch (error) {
    await store.recordCheck(adapter.id, {
      at: nowIso,
      status: response.status,
      ok: false,
    });
    return {
      sourceId: adapter.id,
      result: "rejected",
      note: `kept previous snapshot; new body did not parse: ${String(error)}`,
      status: response.status,
      eventCount: meta?.eventCount ?? null,
    };
  }

  // Zero events is never a useful snapshot: every source in the registry
  // yields events by construction, so an empty parse means the page changed
  // shape. Refusing it keeps the previous snapshot — or, on a first run, the
  // checked-in fixture — as the thing the feed is built from.
  const previousCount = meta?.eventCount ?? null;
  if (events === 0) {
    await store.recordCheck(adapter.id, {
      at: nowIso,
      status: response.status,
      ok: false,
    });
    return {
      sourceId: adapter.id,
      result: "rejected",
      note:
        previousCount === null
          ? "did not store; body yielded 0 events"
          : `kept previous snapshot; new body yielded 0 events (had ${previousCount})`,
      status: response.status,
      eventCount: previousCount,
    };
  }

  const saved = await store.save(adapter.id, {
    url: adapter.url,
    body: bytes,
    charset,
    etag: response.headers.get("ETag"),
    lastModified: response.headers.get("Last-Modified"),
    at: nowIso,
    eventCount: events,
  });
  await store.recordCheck(adapter.id, {
    at: nowIso,
    status: response.status,
    ok: true,
  });

  if (!saved.changed) {
    return {
      sourceId: adapter.id,
      result: "unchanged",
      note: `200 but identical bytes (${events} events)`,
      status: response.status,
      eventCount: events,
    };
  }

  const dropped =
    previousCount !== null &&
    previousCount > 0 &&
    events < previousCount * DROP_WARNING_RATIO;

  return {
    sourceId: adapter.id,
    result: "fetched",
    note: dropped
      ? `${events} events — down from ${previousCount}, check the page shape`
      : `${events} events`,
    status: response.status,
    eventCount: events,
  };
}

/** Regenerate public/data/events.v1.json from whatever is now cached. */
export async function rebuildFeedViaScript(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "scripts/build-feed.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`build-feed exited ${code}`);
}

interface Args {
  dryRun: boolean;
  only: string | null;
  root: string;
  userAgent: string;
  rebuild: boolean;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    dryRun: false,
    only: null,
    root: process.env["SNAPSHOT_DIR"] ?? "snapshots",
    userAgent: process.env["REFRESH_USER_AGENT"] ?? DEFAULT_USER_AGENT,
    rebuild: true,
    help: false,
  };

  // A flag whose value is missing is a mistake, never a default. `--only` with
  // nothing after it used to mean "every source", which is the opposite of
  // what the operator typed and one request per source more than they wanted.
  const value = (i: number, flag: string): string => {
    const next = argv[i];
    if (next === undefined || next.startsWith("-")) {
      throw new Error(`${flag} requires a value`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--only":
        i += 1;
        args.only = value(i, "--only");
        break;
      case "--snapshots":
        i += 1;
        args.root = value(i, "--snapshots");
        break;
      case "--user-agent":
        i += 1;
        args.userAgent = value(i, "--user-agent");
        break;
      case "--no-feed":
        args.rebuild = false;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (arg !== undefined && arg.startsWith("-")) {
          throw new Error(`unknown flag '${arg}'`);
        }
        break;
    }
  }

  return args;
}

const USAGE = `usage: bun run refresh [--dry-run] [--only <sourceId>] [--snapshots <dir>]
                       [--user-agent <ua>] [--no-feed]

  --dry-run       report what each source would do; no requests, no writes
  --only <id>     refresh a single source (${ADAPTERS.map((a) => a.id).join(", ")})
  --snapshots     snapshot cache directory (default: snapshots, env SNAPSHOT_DIR)
  --user-agent    override the User-Agent (env REFRESH_USER_AGENT)
  --no-feed       skip regenerating public/data/events.v1.json`;

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(Bun.argv.slice(2));
  } catch (error) {
    console.error(String(error));
    console.error(USAGE);
    return 2;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (args.only !== null && adapterById(args.only) === undefined) {
    console.error(`unknown source '${args.only}'`);
    console.error(USAGE);
    return 2;
  }

  const store = new SnapshotStore(args.root);
  const robots = new RobotsCache({
    userAgent: args.userAgent,
    fetchImpl: (input, init) => fetch(input, init),
  });

  console.log(
    `refresh: ${args.only ?? `${ADAPTERS.length} sources`}${args.dryRun ? " (dry run)" : ""}`,
  );
  console.log(`  user-agent: ${args.userAgent}`);
  console.log(`  snapshots:  ${args.root}`);
  console.log(`  interval:   ${SIX_HOURS_MS / 3_600_000}h minimum per source\n`);

  const summary = await runRefresh({
    adapters: ADAPTERS,
    store,
    robots,
    fetchImpl: (input, init) => fetch(input, init),
    userAgent: args.userAgent,
    now: () => new Date(),
    dryRun: args.dryRun,
    only: args.only,
    timeoutMs: 20_000,
    log: (line) => console.log(line),
    rebuildFeed: args.dryRun || !args.rebuild ? null : rebuildFeedViaScript,
  });

  console.log(
    `\n${summary.changed} changed, ${summary.confirmed}/${summary.attempted} confirmed, ${summary.warnings.length} warnings`,
  );
  for (const warning of summary.warnings) console.warn(`  ! ${warning}`);

  // The workflow reads this line to decide whether to commit; `git status` is
  // the authority, but this makes a skipped commit legible in the log.
  console.log(`changed=${summary.changed}`);

  if (summary.hardFailure !== null) {
    console.error(`\nrefresh failed: ${summary.hardFailure}`);
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
