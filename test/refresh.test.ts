import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseArgs,
  runRefresh,
  type RefreshOptions,
  type RobotsGate,
} from "../scripts/refresh-sources.ts";
import type { Adapter, ParseContext } from "../src/ingest/adapters/types.ts";
import { SnapshotStore } from "../src/ingest/snapshots.ts";
import type { GachaEvent } from "../src/shared/schema.ts";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const NOW = new Date("2026-08-15T12:00:00.000Z");
const UA = "gacha-event-tracker/1.0 (+https://example.test)";

let root: string;
let store: SnapshotStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-clock-refresh-"));
  store = new SnapshotStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/**
 * A stand-in adapter whose "parser" counts `<event>` tags, so a test can make a
 * body parse well, badly, or not at all without touching a real parser.
 */
function adapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    id: "genshin-game8-events",
    game: "genshin",
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    parserId: "game8",
    minIntervalMs: SIX_HOURS_MS,
    priority: 0,
    parse(html: string, _ctx: ParseContext): GachaEvent[] {
      if (html.includes("<broken>")) throw new Error("template not recognised");
      const count = html.match(/<event>/g)?.length ?? 0;
      return Array.from({ length: count }) as GachaEvent[];
    },
    ...overrides,
  };
}

const ALLOW_ALL: RobotsGate = {
  allows: async () => ({ allowed: true, reason: "robots.txt ok" }),
};

interface Call {
  url: string;
  headers: Record<string, string>;
}

function options(
  over: Partial<RefreshOptions> & { responder?: (call: Call) => Response },
): { opts: RefreshOptions; calls: Call[]; rebuilds: { count: number } } {
  const calls: Call[] = [];
  const rebuilds = { count: 0 };
  const responder =
    over.responder ?? (() => new Response("<html><event></event></html>"));

  const opts: RefreshOptions = {
    adapters: [adapter()],
    store,
    robots: ALLOW_ALL,
    fetchImpl: async (url, init) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      )) {
        headers[k] = v;
      }
      const call = { url, headers };
      calls.push(call);
      return responder(call);
    },
    userAgent: UA,
    now: () => NOW,
    dryRun: false,
    only: null,
    timeoutMs: 1000,
    log: () => {},
    rebuildFeed: async () => {
      rebuilds.count += 1;
    },
    ...over,
  };

  return { opts, calls, rebuilds };
}

async function seed(html: string, at: string, eventCount: number | null) {
  await store.save("genshin-game8-events", {
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    html,
    etag: 'W/"v1"',
    lastModified: "Fri, 14 Aug 2026 09:00:00 GMT",
    at,
    eventCount,
  });
}

describe("a normal cycle", () => {
  test("fetches once, stores the body, rebuilds the feed", async () => {
    const { opts, calls, rebuilds } = options({});
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(1);
    expect(summary.outcomes[0]?.result).toBe("fetched");
    expect(summary.changed).toBe(1);
    expect(summary.hardFailure).toBeNull();
    expect(rebuilds.count).toBe(1);

    const snapshot = await store.read("genshin-game8-events");
    expect(snapshot?.html).toBe("<html><event></event></html>");
    expect(snapshot?.meta.eventCount).toBe(1);
    expect(snapshot?.state.lastConfirmedAt).toBe(NOW.toISOString());
  });

  test("identifies itself with a contact URL", async () => {
    const { opts, calls } = options({});
    await runRefresh(opts);
    expect(calls[0]?.headers["User-Agent"]).toBe(UA);
    expect(calls[0]?.headers["User-Agent"]).toContain("+https://");
  });

  test("sends the validators it was given last time", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts, calls } = options({});
    await runRefresh(opts);

    expect(calls[0]?.headers["If-None-Match"]).toBe('W/"v1"');
    expect(calls[0]?.headers["If-Modified-Since"]).toBe(
      "Fri, 14 Aug 2026 09:00:00 GMT",
    );
  });

  test("304 reuses the cached snapshot and changes nothing", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts, rebuilds } = options({
      responder: () => new Response(null, { status: 304 }),
    });
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("unchanged");
    expect(summary.changed).toBe(0);
    expect(rebuilds.count).toBe(0);

    const snapshot = await store.read("genshin-game8-events");
    expect(snapshot?.html).toBe("<html><event></event></html>");
    expect(snapshot?.meta.contentChangedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(snapshot?.state.lastConfirmedAt).toBe(NOW.toISOString());
  });

  test("a 200 with identical bytes is not a change either", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts, rebuilds } = options({});
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("unchanged");
    expect(summary.changed).toBe(0);
    expect(rebuilds.count).toBe(0);
  });
});

describe("one request per source per six hours", () => {
  test("skips a source checked less than six hours ago", async () => {
    await store.recordCheck("genshin-game8-events", {
      at: new Date(NOW.getTime() - SIX_HOURS_MS + 1000).toISOString(),
      status: 200,
      ok: true,
    });

    const { opts, calls } = options({});
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(0);
    expect(summary.outcomes[0]?.result).toBe("skipped_interval");
    expect(summary.attempted).toBe(0);
    expect(summary.hardFailure).toBeNull();
  });

  test("fetches again once the interval has elapsed", async () => {
    await store.recordCheck("genshin-game8-events", {
      at: new Date(NOW.getTime() - SIX_HOURS_MS).toISOString(),
      status: 200,
      ok: true,
    });

    const { opts, calls } = options({});
    await runRefresh(opts);
    expect(calls).toHaveLength(1);
  });

  test("never retries a failure inside the same cycle", async () => {
    const { opts, calls } = options({
      responder: () => new Response("nope", { status: 500 }),
    });
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(1);
    expect(summary.outcomes[0]?.result).toBe("failed");
  });
});

describe("robots", () => {
  test("does not fetch a source robots.txt disallows", async () => {
    const { opts, calls } = options({
      robots: {
        allows: async () => ({ allowed: false, reason: "disallowed by robots" }),
      },
    });
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(0);
    expect(summary.outcomes[0]?.result).toBe("skipped_robots");
    expect(summary.warnings).toHaveLength(1);
  });

  test("one source blocked is a warning; all of them is a failure", async () => {
    const blocked = {
      allows: async (url: string) => ({
        allowed: !url.includes("Genshin"),
        reason: "disallowed by robots",
      }),
    };
    const two = [
      adapter(),
      adapter({
        id: "nte-game8-events",
        game: "nte",
        url: "https://game8.co/games/Neverness-to-Everness/archives/592073",
      }),
    ];

    const partial = await runRefresh(options({ adapters: two, robots: blocked }).opts);
    expect(partial.hardFailure).toBeNull();
    expect(partial.warnings).toHaveLength(1);

    // Fresh ids: the partial run above already checked one of the pair, and a
    // source checked minutes ago is skipped for the interval, not for robots.
    const all = await runRefresh(
      options({
        adapters: [
          adapter({ id: "hsr-game8-events", game: "hsr", url: "https://game8.co/a" }),
          adapter({ id: "zzz-game8-events", game: "zzz", url: "https://game8.co/b" }),
        ],
        robots: {
          allows: async () => ({ allowed: false, reason: "disallowed by robots" }),
        },
      }).opts,
    );
    expect(all.hardFailure).toContain("blocked all 2 sources");
  });

  test("robots is consulted before the page is requested", async () => {
    const order: string[] = [];
    const { opts } = options({
      robots: {
        allows: async () => {
          order.push("robots");
          return { allowed: true, reason: "ok" };
        },
      },
      responder: () => {
        order.push("page");
        return new Response("<html><event></event></html>");
      },
    });
    await runRefresh(opts);
    expect(order).toEqual(["robots", "page"]);
  });
});

describe("a source being down never blanks the feed", () => {
  test("an unreachable source is a warning, not a failure", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts } = options({
      adapters: [
        adapter(),
        adapter({
          id: "nte-game8-events",
          game: "nte",
          url: "https://game8.co/games/Neverness-to-Everness/archives/592073",
        }),
      ],
      responder: (call) => {
        if (call.url.includes("Genshin")) throw new Error("ETIMEDOUT");
        return new Response("<html><event></event><event></event></html>");
      },
    });

    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("failed");
    expect(summary.outcomes[1]?.result).toBe("fetched");
    expect(summary.warnings).toHaveLength(1);
    expect(summary.hardFailure).toBeNull();
    // The old snapshot is untouched, so the feed keeps this game's events.
    expect((await store.read("genshin-game8-events"))?.html).toBe(
      "<html><event></event></html>",
    );
  });

  test("every source failing is a hard failure", async () => {
    const { opts, rebuilds } = options({
      adapters: [adapter(), adapter({ id: "nte-game8-events", game: "nte" })],
      responder: () => new Response("", { status: 503 }),
    });
    const summary = await runRefresh(opts);

    expect(summary.hardFailure).toContain("all 2 attempted sources failed");
    expect(rebuilds.count).toBe(0);
  });

  test("a body that no longer parses keeps the previous snapshot", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts } = options({
      responder: () => new Response("<broken>"),
    });
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("rejected");
    expect(summary.warnings[0]).toContain("did not parse");
    expect((await store.read("genshin-game8-events"))?.html).toBe(
      "<html><event></event></html>",
    );
  });

  test("a body that suddenly yields no events keeps the previous snapshot", async () => {
    await seed("<html><event></event></html>", "2026-08-01T00:00:00.000Z", 1);
    const { opts } = options({
      responder: () => new Response("<html>redesigned</html>"),
    });
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("rejected");
    expect(summary.warnings[0]).toContain("0 events");
    expect((await store.read("genshin-game8-events"))?.meta.eventCount).toBe(1);
  });

  test("a first fetch that yields nothing is not stored either", async () => {
    // With no snapshot yet, storing an empty parse would make build-feed prefer
    // it over the checked-in fixture and quietly empty that game's calendar.
    const { opts } = options({
      responder: () => new Response("<html>redesigned</html>"),
    });
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("rejected");
    expect(summary.changed).toBe(0);
    expect(await store.read("genshin-game8-events")).toBeNull();
  });

  test("a steep drop is stored but flagged", async () => {
    await seed("<html>" + "<event></event>".repeat(10) + "</html>", "2026-08-01T00:00:00.000Z", 10);
    const { opts } = options({
      responder: () => new Response("<html><event></event></html>"),
    });
    const summary = await runRefresh(opts);

    expect(summary.outcomes[0]?.result).toBe("fetched");
    expect(summary.outcomes[0]?.note).toContain("down from 10");
  });

  test("a feed that will not rebuild fails the run", async () => {
    const { opts } = options({
      rebuildFeed: async () => {
        throw new Error("build-feed exited 1");
      },
    });
    const summary = await runRefresh(opts);
    expect(summary.hardFailure).toContain("feed rebuild failed");
  });
});

describe("flags", () => {
  test("--dry-run makes no requests and writes nothing", async () => {
    const { opts, calls, rebuilds } = options({ dryRun: true });
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(0);
    expect(rebuilds.count).toBe(0);
    expect(summary.outcomes[0]?.result).toBe("planned");
    expect(summary.outcomes[0]?.note).toContain("would GET");
    expect(await store.read("genshin-game8-events")).toBeNull();
    expect(await store.readState("genshin-game8-events")).toMatchObject({
      lastCheckedAt: null,
    });
  });

  test("--only refreshes one source", async () => {
    const { opts, calls } = options({
      adapters: [adapter(), adapter({ id: "nte-game8-events", game: "nte" })],
      only: "nte-game8-events",
    });
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(1);
    expect(summary.outcomes).toHaveLength(1);
    expect(summary.outcomes[0]?.sourceId).toBe("nte-game8-events");
  });

  test("--only with an unknown id is a hard failure", async () => {
    const { opts, calls } = options({ only: "does-not-exist" });
    const summary = await runRefresh(opts);

    expect(calls).toHaveLength(0);
    expect(summary.hardFailure).toContain("unknown source");
  });

  test("parseArgs reads the flags", () => {
    const args = parseArgs([
      "--dry-run",
      "--only",
      "nte-game8-events",
      "--snapshots",
      "/tmp/x",
      "--no-feed",
    ]);
    expect(args).toMatchObject({
      dryRun: true,
      only: "nte-game8-events",
      root: "/tmp/x",
      rebuild: false,
    });
  });

  test("parseArgs rejects an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["--force"])).toThrow("unknown flag");
  });
});
