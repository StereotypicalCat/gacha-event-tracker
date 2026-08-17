import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether a newer build of the app is sitting on the device, and how to take it.
 *
 * The service worker serves the shell cache-first (PRD F10), which is what makes
 * this app work on a train — and also what makes a deploy invisible. Someone who
 * leaves the tab open for a week keeps running the bundle they first loaded: a
 * new game, a fixed parser or a corrected date reaches their device and then sits
 * there, with nothing anywhere saying why the app looks unchanged. That is the
 * same class of failure as presenting stale events as current.
 *
 * So the deal is: the worker installs quietly and waits, this hook notices it
 * waiting, and the reader decides when to lose their scroll position. Nothing
 * they have marked, typed or ticked lives in the bundle — it is all in
 * localStorage — so reloading costs them nothing but the scroll, and dismissing
 * costs them nothing at all, because the offer comes back on the next load.
 */

/** What a page sends a waiting worker to ask it to take over. Matches sw.js. */
export const SKIP_WAITING = "skip-waiting";

/** How often an open page asks the server whether a newer build exists. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Is there a new version waiting *for this page*?
 *
 * A worker that finished installing with no controller in charge is a first
 * install, not an update: nothing is being replaced, the reader is already
 * looking at the newest thing there is, and telling them a new version is
 * available would be a lie on their first visit.
 */
export function isUpdateReady(
  registration: { waiting: object | null },
  hasController: boolean,
): boolean {
  return registration.waiting !== null && hasController;
}

/**
 * Whether enough time has passed to ask again.
 *
 * Hourly, against our own origin — not a source wiki, so § Scraping conduct is
 * not in play. The feed itself refreshes twice a day, so anything faster would
 * be asking a question that cannot have a new answer.
 */
export function dueForCheck(
  lastCheckedMs: number,
  nowMs: number,
  intervalMs = CHECK_INTERVAL_MS,
): boolean {
  return nowMs - lastCheckedMs >= intervalMs;
}

export interface AppUpdate {
  /** A newer version is installed, and the reader has not waved it away. */
  available: boolean;
  /** The reader asked for it; the reload is in flight. */
  applying: boolean;
  apply: () => void;
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  /** The worker the Reload button is wired to. */
  const waiting = useRef<ServiceWorker | null>(null);
  const reloaded = useRef(false);

  const reload = useCallback(() => {
    if (reloaded.current) return;
    reloaded.current = true;
    location.reload();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!location.protocol.startsWith("http")) return;

    let stopped = false;
    let registration: ServiceWorkerRegistration | null = null;
    let lastChecked = Date.now();

    const offer = (worker: ServiceWorker | null) => {
      if (stopped || worker === null) return;
      if (!isUpdateReady({ waiting: worker }, navigator.serviceWorker.controller !== null)) return;
      if (waiting.current === worker) return;
      waiting.current = worker;
      // A second, different version arriving re-opens an offer the reader
      // dismissed: they declined *that* build, not every future one.
      setDismissed(false);
      setReady(true);
    };

    const watch = (worker: ServiceWorker) => {
      const onState = () => {
        if (worker.state === "installed") offer(worker);
        // Superseded, or it failed to install. Drop the offer rather than
        // leaving a Reload button wired to a worker that can never take over.
        if (worker.state === "redundant" && waiting.current === worker) {
          waiting.current = null;
          setReady(false);
        }
      };
      worker.addEventListener("statechange", onState);
    };

    const check = () => {
      lastChecked = Date.now();
      // A failure here is a reader who is offline or a server that is down.
      // Both are normal and neither is worth a word on screen.
      void registration?.update().catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!dueForCheck(lastChecked, Date.now())) return;
      check();
    };

    const timer = setInterval(() => {
      if (dueForCheck(lastChecked, Date.now())) check();
    }, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);

    // `ready` rather than registering here: main.tsx registers after load so the
    // worker never delays first paint, and this resolves once that has happened.
    void navigator.serviceWorker.ready.then((reg) => {
      if (stopped) return;
      registration = reg;
      // A worker that finished installing during an earlier visit is already
      // waiting when this page loads — a reload does not release it. Without
      // this the reader is never told about a version already on their device.
      offer(reg.waiting);
      if (reg.installing !== null) watch(reg.installing);
      reg.addEventListener("updatefound", () => {
        if (reg.installing !== null) watch(reg.installing);
      });
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const apply = useCallback(() => {
    const worker = waiting.current;
    if (worker === null) return;
    setApplying(true);
    // Reload when the new worker takes over, not when the message is sent:
    // reloading first would re-run the old bundle, because a plain reload does
    // not release a waiting worker.
    navigator.serviceWorker.addEventListener("controllerchange", reload, {
      once: true,
    });
    worker.postMessage({ type: SKIP_WAITING });
    // Belt and braces: if the handover never lands, reload anyway rather than
    // leaving a button that visibly did nothing. Worst case they get the same
    // version back and the notice returns, which is honest.
    setTimeout(reload, 3000);
  }, [reload]);

  return {
    available: ready && !dismissed,
    applying,
    apply,
    dismiss: () => setDismissed(true),
  };
}
