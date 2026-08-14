import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * The static server is small, but it reads from the filesystem based on a
 * user-supplied path, so its confinement is worth pinning down.
 */
let proc: Bun.Subprocess;
let base: string;

beforeAll(async () => {
  const port = 3200 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  proc = Bun.spawn(["bun", "run", "serve.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdout: "ignore",
    stderr: "ignore",
  });

  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`${base}/api/health`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error("server did not start");
});

afterAll(() => {
  proc.kill();
});

describe("static server", () => {
  test("serves the shell and the feed", async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
    const feed = await fetch(`${base}/data/events.v1.json`);
    expect(feed.status).toBe(200);
    expect((await feed.json()).schemaVersion).toBe(1);
  });

  test("reports health", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  test("falls back to the shell for unknown routes", async () => {
    const res = await fetch(`${base}/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<!doctype html>");
  });

  test("404s missing data rather than serving the shell", async () => {
    // A JSON fetch that silently receives HTML is far harder to debug than a
    // clean 404.
    expect((await fetch(`${base}/data/nope.json`)).status).toBe(404);
  });

  test("never serves a file outside public/", async () => {
    for (const path of [
      "/..%2fpackage.json",
      "/..%2f..%2fetc/passwd",
      "/%2e%2e/package.json",
      "/%2e%2e%2f%2e%2e%2fpackage.json",
    ]) {
      const res = await fetch(`${base}${path}`);
      const body = await res.text();
      // Either refused, or normalised to something inside public/ — but never
      // the repository file itself.
      expect(body).not.toContain('"name": "gacha-event-tracker"');
      expect(body).not.toContain("root:x:0:0");
    }
  });

  test("keeps the service worker uncached", async () => {
    // A stale worker can pin an old deploy indefinitely.
    const res = await fetch(`${base}/sw.js`);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });
});
