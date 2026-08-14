/*
 * Service worker: keep the app usable without a network.
 *
 * This app is a good offline candidate — the reader's question ("what expires
 * next?") is answered entirely by data already on the device, and countdowns
 * tick from the local clock. Losing signal on a train should not lose the app.
 *
 * Two strategies, chosen per resource:
 *
 *   shell (html/css/js)  cache-first  — it changes only on deploy
 *   feed (events.json)   network-first with cache fallback — fresher is better,
 *                        but stale events beat a blank screen
 *
 * Bump CACHE_VERSION on any shell change; old caches are deleted on activate.
 */

const CACHE_VERSION = "event-clock-v1";
// Paths are derived from the registration scope, so the same worker is
// correct at a domain root and under a subpath (GitHub Pages) alike.
const BASE = new URL("./", self.registration.scope);
const at = (path) => new URL(path, BASE).toString();
const SHELL = ["", "index.html", "styles.css", "main.js"].map(at);
const FEED = new URL("data/events.v1.json", BASE).pathname;
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll is atomic — one 404 would leave nothing cached, so failures are
      // tolerated per-item and the fetch handler fills gaps later.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Webfonts are cross-origin but part of the shell: without them an offline
  // load silently falls back to system faces and the whole thing changes
  // character. Opaque responses cache fine for this purpose.
  if (FONT_HOSTS.has(url.host)) {
    event.respondWith(shellFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname === FEED) {
    event.respondWith(feedFirst(request));
    return;
  }

  event.respondWith(shellFirst(request));
});

/**
 * Network first. A successful response is cached so the next offline load has
 * the freshest events we ever saw; a failure falls back to that copy.
 */
async function feedFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;
    // No network and nothing cached: say so in the feed's own shape, so the
    // client renders its error state rather than failing to parse.
    return new Response(
      JSON.stringify({ error: "offline", message: "No events stored yet." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * Cache first, revalidating in the background so a deploy is picked up on the
 * next visit without ever blocking this one.
 */
async function shellFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request)
    .then((response) => {
      // Opaque cross-origin font responses report ok === false but are still
      // worth storing — they render fine from cache.
      if (response.ok || response.type === "opaque") {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached !== undefined) return cached;

  const response = await network;
  if (response !== undefined) return response;

  // A navigation with no cache and no network still gets the app shell if we
  // have it — the client then shows its own offline message.
  if (request.mode === "navigate") {
    const shell = await cache.match("/index.html");
    if (shell !== undefined) return shell;
  }
  return new Response("Offline", { status: 503 });
}
