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
  // Long and repetitive, so gzip is unambiguously smaller than the original —
  // a short string compresses to *more* bytes than it started with.
  await writeFile(join(root, "main.js"), `console.log("hello");\n`.repeat(400));
  // Already-compressed bytes, which must be served untouched.
  await writeFile(join(root, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  await writeFile(
    join(root, "data", "events.v1.json"),
    JSON.stringify({ schemaVersion: 1, generatedAt: "", events: [], sources: [] }),
  );

  const port = 3200 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  proc = Bun.spawn(["bun", "run", "serve.ts"], {
    env: { ...process.env, PORT: String(port), PUBLIC_DIR: root },
    stdout: "ignore",
    stderr: "pipe",
  });

  // Bail as soon as the process dies rather than retrying against a corpse:
  // a missing serve.ts otherwise shows up only as "a hook timed out", which
  // says nothing about the cause.
  for (let i = 0; i < 40; i += 1) {
    if (proc.exitCode !== null) {
      const stderr = proc.stderr;
      const why =
        stderr instanceof ReadableStream
          ? await new Response(stderr).text()
          : "(no stderr captured)";
      throw new Error(
        `serve.ts exited with ${proc.exitCode} before listening:\n${why.slice(0, 500)}`,
      );
    }
    try {
      await fetch(`${base}/api/health`);
      return;
    } catch {
      await Bun.sleep(50);
    }
  }
  throw new Error(`server did not listen on ${base} within 2s`);
}, 10_000);

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

/**
 * Compression, which is the whole difference between the Docker image and the
 * deployed site.
 *
 * GitHub Pages gzips on our behalf, so the bundle crosses the wire at a third of
 * its size there and did not here — and this file is what the image runs. Three
 * times the bytes is the only thing a self-hoster would ever have seen.
 */
describe("static server: compression", () => {
  test("gzips a text asset for a client that asks", async () => {
    const res = await fetch(`${base}/main.js`, {
      headers: { "accept-encoding": "gzip" },
    });
    expect(res.headers.get("content-encoding")).toBe("gzip");
    // Decoded by `fetch` on the way in, so this is the original text back —
    // which is the property that matters: compression must be lossless.
    expect(await res.text()).toBe(`console.log("hello");\n`.repeat(400));
  });

  test("and is actually smaller on the wire", async () => {
    // Announcing gzip while sending the same number of bytes would be a pure
    // regression, so compare the two content-lengths rather than trusting the
    // header.
    const gz = await fetch(`${base}/main.js`, {
      headers: { "accept-encoding": "gzip" },
    });
    const raw = await fetch(`${base}/main.js`, {
      headers: { "accept-encoding": "identity" },
    });
    const len = (r: Response) => Number(r.headers.get("content-length"));
    expect(len(gz)).toBeGreaterThan(0);
    expect(len(gz)).toBeLessThan(len(raw) / 2);
  });

  test("sends it raw to a client that does not ask", async () => {
    const res = await fetch(`${base}/main.js`, {
      headers: { "accept-encoding": "identity" },
    });
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  test("varies on accept-encoding either way", async () => {
    // A shared cache that does not know the response depends on the request
    // header will hand gzipped bytes to a client that never asked, so the header
    // has to be there on the uncompressed answer too.
    for (const encoding of ["gzip", "identity"]) {
      const res = await fetch(`${base}/main.js`, {
        headers: { "accept-encoding": encoding },
      });
      expect(res.headers.get("vary")).toBe("accept-encoding");
    }
  });

  test("leaves already-compressed bytes alone", async () => {
    // Gzipping a PNG spends CPU to make the file bigger.
    const res = await fetch(`${base}/shot.png`, {
      headers: { "accept-encoding": "gzip" },
    });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("vary")).toBeNull();
  });
});
