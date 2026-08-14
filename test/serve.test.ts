import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The static server reads from the filesystem based on a user-supplied path, so
 * its confinement is worth pinning down.
 *
 * Served from a temporary tree rather than public/: these tests exercise
 * serve.ts, not the build, and coupling them to build output means `bun test`
 * fails on a clean checkout — which is exactly how CI found this.
 */
let proc: Bun.Subprocess;
let base: string;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "event-clock-serve-"));
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(
    join(root, "index.html"),
    "<!doctype html><html><body>shell</body></html>",
  );
  await writeFile(join(root, "sw.js"), "// worker");
  await writeFile(
    join(root, "data", "events.v1.json"),
    JSON.stringify({ schemaVersion: 1, generatedAt: "", events: [], sources: [] }),
  );

  const port = 3200 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  proc = Bun.spawn(["bun", "run", "serve.ts"], {
    env: { ...process.env, PORT: String(port), PUBLIC_DIR: root },
    stdout: "ignore",
    stderr: "ignore",
  });

  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${base}/api/health`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error("server did not start");
});

afterAll(async () => {
  proc.kill();
  await rm(root, { recursive: true, force: true });
});

describe("static server", () => {
  test("serves the shell and the feed", async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
    const feed = await fetch(`${base}/data/events.v1.json`);
    expect(feed.status).toBe(200);
    expect(((await feed.json()) as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  test("reports health", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
  });

  test("falls back to the shell for unknown routes", async () => {
    const res = await fetch(`${base}/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("shell");
  });

  test("404s missing data rather than serving the shell", async () => {
    // A JSON fetch that silently receives HTML is far harder to debug than a
    // clean 404.
    expect((await fetch(`${base}/data/nope.json`)).status).toBe(404);
  });

  test("never serves a file outside the root", async () => {
    for (const path of [
      "/..%2fpackage.json",
      "/..%2f..%2fetc/passwd",
      "/%2e%2e/package.json",
      "/%2e%2e%2f%2e%2e%2fpackage.json",
    ]) {
      const body = await (await fetch(`${base}${path}`)).text();
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
