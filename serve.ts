/**
 * Static file server for the built app.
 *
 * A placeholder for the Bun server in docs/ARCHITECTURE.md: it serves what is
 * in public/ and nothing else. When the real server lands it will add /api/*
 * and the ingest scheduler, and this file goes away.
 *
 * Deliberately minimal — no framework, no dependencies beyond Bun.
 */
import { resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
/** Overridable so tests can point at a fixture tree instead of the build. */
const ROOT = process.env.PUBLIC_DIR ?? "public";
const ROOT_DIR = resolve(ROOT);

/**
 * Types worth compressing, and the only ones that are.
 *
 * Everything this app serves is text — JS, CSS, JSON, HTML, SVG — and the two
 * biggest files are also the two most compressible: the bundle is 344 KB raw and
 * 100 KB gzipped, the feed 90 KB and 10 KB. Serving them raw is roughly three
 * times the bytes and, on anything slower than a laptop on wifi, three times the
 * download.
 *
 * GitHub Pages compresses for us, so the deployed site never had this problem;
 * the Docker image serves through this file and did. An image whose payload is
 * 3x the site's is not a placeholder detail — it is the only thing a self-hoster
 * ever sees.
 */
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".webmanifest",
]);

/**
 * Compressed bytes, keyed by path and invalidated by the file's mtime.
 *
 * These files change only on deploy, so gzipping the bundle on every request is
 * pure waste — and at 344 KB it is not cheap waste. Keyed on mtime rather than
 * held forever so `bun run dev` still serves what was just rebuilt.
 */
const gzipped = new Map<string, { mtimeMs: number; body: Uint8Array<ArrayBuffer> }>();

async function gzipFor(
  path: string,
  file: Bun.BunFile,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const { mtimeMs } = await file.stat();
    const hit = gzipped.get(path);
    if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.body;
    // `gzipSync` is typed over `ArrayBufferLike` to allow a SharedArrayBuffer it
    // never returns here, and `Response` only takes the plain-buffer view.
    const body = Bun.gzipSync(
      new Uint8Array(await file.arrayBuffer()),
    ) as Uint8Array<ArrayBuffer>;
    gzipped.set(path, { mtimeMs, body });
    return body;
  } catch {
    // Compression is an optimisation, never a reason to fail a request: fall
    // back to sending the file as it is.
    return null;
  }
}

/** Long-lived for fingerprint-free assets is wrong; keep it short and revalidate. */
const CACHE: Record<string, string> = {
  ".html": "public, max-age=0, must-revalidate",
  ".json": "public, max-age=300",
  ".js": "public, max-age=3600",
  ".css": "public, max-age=3600",
  ".svg": "public, max-age=86400",
  ".webmanifest": "public, max-age=3600",
};

function extname(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i);
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const feed = Bun.file(resolve(ROOT_DIR, "data/events.v1.json"));
      const ok = await feed.exists();
      return Response.json(
        { status: ok ? "ok" : "no-feed", generatedAt: new Date().toISOString() },
        { status: ok ? 200 : 503 },
      );
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (decoded.includes("\0")) {
      return new Response("Bad request", { status: 400 });
    }

    const path = decoded === "/" ? "/index.html" : decoded;

    // Confine every read to public/ by resolving the path and checking it is
    // still inside the root. String-matching ".." is not enough: encodings and
    // URL normalisation both change what the string looks like, and only the
    // resolved path tells the truth about which file would be opened.
    const resolved = resolve(ROOT_DIR, `.${path}`);
    if (resolved !== ROOT_DIR && !resolved.startsWith(`${ROOT_DIR}/`)) {
      return new Response("Bad request", { status: 400 });
    }

    const file = Bun.file(resolved);

    if (await file.exists()) {
      const ext = extname(path);
      const headers: Record<string, string> = {
        "cache-control": CACHE[ext] ?? "public, max-age=600",
        // The service worker must never be served stale, or a deploy can be
        // pinned by an old worker indefinitely.
        ...(path === "/sw.js"
          ? { "cache-control": "no-cache", "service-worker-allowed": "/" }
          : {}),
      };

      // `Vary` whether or not this response is compressed: the answer depends on
      // the request header either way, and a cache that does not know that will
      // hand gzipped bytes to a client that never asked for them.
      if (COMPRESSIBLE.has(ext)) headers["vary"] = "accept-encoding";

      const wantsGzip =
        COMPRESSIBLE.has(ext) &&
        (request.headers.get("accept-encoding") ?? "").includes("gzip");

      if (wantsGzip) {
        const body = await gzipFor(resolved, file);
        if (body !== null) {
          return new Response(body, {
            headers: {
              ...headers,
              "content-type": file.type,
              "content-encoding": "gzip",
            },
          });
        }
      }

      return new Response(file, { headers });
    }

    // Single-page app: unknown paths fall back to the shell so client routing
    // and deep links work. Anything under /data or /api is a genuine 404.
    if (!path.startsWith("/data") && !path.startsWith("/api")) {
      const shell = Bun.file(resolve(ROOT_DIR, "index.html"));
      if (await shell.exists()) {
        return new Response(shell, {
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Event Clock serving ${ROOT} on http://localhost:${server.port}`);
