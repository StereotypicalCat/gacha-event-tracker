import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UpdateNotice } from "../src/client/components/UpdateNotice.tsx";
import {
  CHECK_INTERVAL_MS,
  dueForCheck,
  isUpdateReady,
  SKIP_WAITING,
} from "../src/client/state/useAppUpdate.ts";
import {
  BUILD_PLACEHOLDER,
  buildId,
  injectBuild,
} from "../scripts/build-static.ts";

/**
 * Telling a reader that a new version exists.
 *
 * The mechanism spans three files that cannot import each other — the worker is
 * a copied script, the hook is a module, the build stamps one from the other —
 * so what is pinned here is each seam between them: the message the page sends
 * is the message the worker answers, the placeholder the build replaces is the
 * one the worker carries, and a worker that installs does not take over on its
 * own.
 */

// ---------------------------------------------------------------------------
// A service worker global, enough of one to run src/client/sw.js against.
// ---------------------------------------------------------------------------

type Listener = (event: Record<string, unknown>) => void;

async function loadWorker(build = "abcdef123456") {
  const source = injectBuild(
    await Bun.file(new URL("../src/client/sw.js", import.meta.url)).text(),
    build,
  );

  const listeners = new Map<string, Listener[]>();
  const calls = { skipWaiting: 0, claim: 0 };
  const opened: string[] = [];
  const fetched: Request[] = [];
  const stores = new Map<string, Map<string, Response>>();

  const caches = {
    open: async (name: string) => {
      opened.push(name);
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (request: Request | string, response: Response) => {
          store.set(typeof request === "string" ? request : request.url, response);
        },
        match: async () => undefined,
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const self: Record<string, unknown> = {
    registration: { scope: "https://example.test/app/" },
    location: { origin: "https://example.test" },
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
    },
  };

  const fetchStub = async (request: Request) => {
    fetched.push(request);
    return new Response("ok", { status: 200 });
  };

  // sw.js is a classic script with no imports, so it evaluates against injected
  // globals — which is the only way to exercise it offline.
  new Function("self", "caches", "fetch", source)(self, caches, fetchStub);

  /** Fire a worker lifecycle event and settle whatever it kept alive. */
  const dispatch = async (type: string, event: Record<string, unknown> = {}) => {
    const kept: Array<Promise<unknown>> = [];
    const full = {
      ...event,
      waitUntil: (p: Promise<unknown>) => kept.push(p),
    };
    for (const fn of listeners.get(type) ?? []) fn(full);
    await Promise.all(kept);
  };

  return { dispatch, self, calls, opened, fetched, stores };
}

describe("the service worker's side of an update", () => {
  test("installing does not take over the page on its own", async () => {
    const w = await loadWorker();
    await w.dispatch("install");
    // The whole point: the reader is asked first. A worker that claims the page
    // at install leaves the running bundle and the cached shell on two
    // different builds and says nothing about either.
    expect(w.calls.skipWaiting).toBe(0);
  });

  test("takes over when the page asks it to", async () => {
    const w = await loadWorker();
    await w.dispatch("message", { data: { type: SKIP_WAITING } });
    expect(w.calls.skipWaiting).toBe(1);
  });

  test("ignores messages it does not understand", async () => {
    const w = await loadWorker();
    await w.dispatch("message", { data: { type: "something-else" } });
    await w.dispatch("message", { data: "skip-waiting" });
    await w.dispatch("message", { data: null });
    expect(w.calls.skipWaiting).toBe(0);
  });

  test("refetches the shell rather than trusting the HTTP cache", async () => {
    const w = await loadWorker();
    await w.dispatch("install");
    // main.js is main.js at every version, so an unqualified fetch can hand a
    // brand new worker the previous deploy's bundle — and then the update the
    // reader just accepted is the one they already had.
    expect(w.fetched.length).toBeGreaterThan(0);
    expect(w.fetched.every((r) => r.cache === "reload")).toBe(true);
    expect(w.fetched.map((r) => r.url)).toContain(
      "https://example.test/app/main.js",
    );
  });

  test("caches under a name that does not move with the build", async () => {
    const w = await loadWorker("deadbeef0000");
    await w.dispatch("install");
    // A per-build cache name would mean every deploy discards the stored feed —
    // the copy an offline reader is reading. Everything in here is refetched on
    // install, so a new bucket buys nothing and costs that.
    expect(w.opened).not.toContain("event-clock-deadbeef0000");
    expect(w.opened.every((name) => !name.includes("deadbeef"))).toBe(true);
    expect([...w.stores.keys()]).toEqual(["event-clock-v2"]);
  });

  test("activating clears older caches and keeps the current one", async () => {
    const w = await loadWorker();
    await w.dispatch("install");
    w.stores.set("event-clock-v1", new Map());
    await w.dispatch("activate");
    expect([...w.stores.keys()]).toEqual(["event-clock-v2"]);
    expect(w.calls.claim).toBe(1);
  });

  test("exposes the build it was stamped with", async () => {
    const w = await loadWorker("0123456789ab");
    // Both a debugging aid and a guard: a constant nothing reads is one the next
    // person deletes, and without it in sw.js a deploy is undetectable.
    expect(w.self.BUILD).toBe("0123456789ab");
  });
});

// ---------------------------------------------------------------------------
// The build stamp
// ---------------------------------------------------------------------------

describe("the build stamp", () => {
  test("the worker carries the placeholder the build replaces", async () => {
    const source = await Bun.file(
      new URL("../src/client/sw.js", import.meta.url),
    ).text();
    expect(source).toContain(BUILD_PLACEHOLDER);
  });

  test("identical bytes produce an identical id", () => {
    // Otherwise a rebuild that changed nothing tells every reader to reload, and
    // a notice that cries wolf is a notice they learn to dismiss unread.
    expect(buildId(["shell", "worker"])).toBe(buildId(["shell", "worker"]));
  });

  test("a changed bundle produces a different id", () => {
    const before = buildId(["shell", "worker", new Uint8Array([1, 2, 3])]);
    const after = buildId(["shell", "worker", new Uint8Array([1, 2, 4])]);
    expect(after).not.toBe(before);
  });

  test("substitution reaches every copy of the placeholder", () => {
    const stamped = injectBuild(
      `const BUILD = "${BUILD_PLACEHOLDER}"; log("${BUILD_PLACEHOLDER}");`,
      "cafe12345678",
    );
    expect(stamped).not.toContain(BUILD_PLACEHOLDER);
    expect(stamped).toContain('const BUILD = "cafe12345678"');
  });

  test("a worker with no placeholder fails the build", () => {
    // The silent failure this mechanism is prone to: an edit drops the marker,
    // the substitution matches nothing, and updates stop being offered with
    // nothing visibly broken.
    expect(() => injectBuild("const BUILD = \"fixed\";", "abc")).toThrow(
      /undetectable/,
    );
  });
});

// ---------------------------------------------------------------------------
// When to say something
// ---------------------------------------------------------------------------

describe("deciding there is an update", () => {
  test("a waiting worker with a page to replace is an update", () => {
    expect(isUpdateReady({ waiting: {} }, true)).toBe(true);
  });

  test("a first install is not an update", () => {
    // No controller means nothing is being replaced: the reader is looking at
    // the newest thing there is, and "a new version is ready" would be a lie on
    // their first visit.
    expect(isUpdateReady({ waiting: {} }, false)).toBe(false);
  });

  test("nothing waiting is nothing to say", () => {
    expect(isUpdateReady({ waiting: null }, true)).toBe(false);
  });

  test("checks are hourly, not per wake-up", () => {
    const now = 1_760_000_000_000;
    expect(dueForCheck(now, now)).toBe(false);
    expect(dueForCheck(now - 60_000, now)).toBe(false);
    expect(dueForCheck(now - CHECK_INTERVAL_MS, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// What the reader sees
// ---------------------------------------------------------------------------

describe("UpdateNotice", () => {
  const noop = () => {};

  test("says a new version is ready and offers the reload", () => {
    const html = renderToStaticMarkup(
      <UpdateNotice applying={false} onApply={noop} onDismiss={noop} />,
    );
    expect(html).toContain("A new version");
    expect(html).toContain("Reload");
    // Reloading is a decision with a visible cost and an invisible one; only the
    // visible one is real, and saying so is what makes the button safe to press.
    expect(html).toContain("marks and notes are kept");
    expect(html).toContain('aria-label="Not now"');
  });

  test("cannot be asked for twice while it is happening", () => {
    const html = renderToStaticMarkup(
      <UpdateNotice applying onApply={noop} onDismiss={noop} />,
    );
    expect(html).toContain("Reloading…");
    expect(html).toContain("disabled");
  });
});
