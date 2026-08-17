/*
 * Service worker: keep the app usable without a network, and hand a reader the
 * next version when there is one.
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
 * Serving the shell cache-first is also what makes a deploy invisible: the
 * reader this app is built for leaves the tab open for days, so without a
 * deliberate handshake they keep running the bundle they first loaded. So this
 * worker installs quietly, waits, and steps in only when the page asks — see
 * `message` below and src/client/state/useAppUpdate.ts.
 */

/*
 * Replaced at build time with a hash of the built shell (scripts/build-static.ts).
 *
 * Its whole job is to make this file's bytes differ when the app differs: the
 * browser decides an update exists by byte-comparing sw.js, so a deploy that
 * left this file untouched would never be offered to anyone. Left literal in an
 * unbuilt copy, where it is a harmless constant.
 */
const BUILD = "__BUILD__";
/*
 * Exposed rather than merely declared, for two reasons: it is the quickest way
 * to see which build a device is actually running (devtools → Application →
 * Service Workers → inspect), and a constant nothing reads is a constant the
 * next person deletes as dead code — which would silently end update detection.
 */
self.BUILD = BUILD;
/*
 * The cache's name, not the app's version — and deliberately *not* derived from
 * BUILD. Everything in here is refetched on install, so a deploy does not need
 * a new bucket; giving it one would throw away the cached feed, which is the
 * copy an offline reader is reading. Bump it only to abandon a cache whose
 * shape changed.
 */
const CACHE_NAME = "event-clock-v2";
// Paths are derived from the registration scope, so the same worker is
// correct at a domain root and under a subpath (GitHub Pages) alike.
const BASE = new URL("./", self.registration.scope);
const at = (path) => new URL(path, BASE).toString();
const SHELL = ["", "index.html", "styles.css", "main.js"].map(at);
const FEED = new URL("data/events.v1.json", BASE).pathname;
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
/** What a page sends to ask a waiting worker to take over now. */
const SKIP_WAITING = "skip-waiting";

self.addEventListener("install", (event) => {
  // No skipWaiting here. Taking over an open page unasked means the running
  // bundle and the cached shell come from two different builds, and the reader
  // is told nothing about either. A first install has no worker to wait for and
  // activates immediately regardless.
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Store the shell this worker was built with.
 *
 * Not `cache.addAll`: it is atomic, so one 404 would leave nothing cached at
 * all. Each item is allowed to fail on its own and the fetch handler fills the
 * gap later.
 *
 * `cache: "reload"` because none of these URLs are fingerprinted — main.js is
 * main.js at every version, and the HTTP cache would happily hand this brand
 * new worker the previous deploy's copy of it.
 */
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    SHELL.map(async (url) => {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (response.ok) await cache.put(url, response);
    }),
  );
}

/**
 * The one thing a page can ask of a worker that is waiting: step in now.
 *
 * Sent when the reader taps Reload on the update notice. The page reloads on
 * `controllerchange` rather than on send, so this message is the whole
 * handshake — and it exists only because the reader asked, which is why
 * `install` does not do it unprompted.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (typeof data === "object" && data !== null && data.type === SKIP_WAITING) {
    void self.skipWaiting();
  }
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
  const cache = await caches.open(CACHE_NAME);
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
  const cache = await caches.open(CACHE_NAME);
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
