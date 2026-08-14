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
const ROOT = "public";
const ROOT_DIR = resolve(ROOT);

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
      return new Response(file, {
        headers: {
          "cache-control": CACHE[extname(path)] ?? "public, max-age=600",
          // The service worker must never be served stale, or a deploy can be
          // pinned by an old worker indefinitely.
          ...(path === "/sw.js"
            ? { "cache-control": "no-cache", "service-worker-allowed": "/" }
            : {}),
        },
      });
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
