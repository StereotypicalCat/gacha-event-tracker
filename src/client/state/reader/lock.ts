/** Serialize the envelope across tabs, including browsers without Web Locks. */
export async function withReaderLock<T>(run: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("gacha-tracker:v2:reader", run);
  // Node tests execute synchronous localStorage writes in one process. Browsers
  // instead use a readwrite IndexedDB transaction as the cross-context mutex.
  if (typeof window === "undefined") return run();
  if (typeof indexedDB === "undefined") throw new Error("unavailable");
  return new Promise<T>((resolve, reject) => {
    const request = indexedDB.open("gacha-tracker-reader-lock", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("mutex");
    request.onerror = () => reject(new Error("unavailable"));
    request.onblocked = () => reject(new Error("unavailable"));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("mutex", "readwrite");
      let value: T;
      const gate = transaction.objectStore("mutex").get("reader");
      gate.onsuccess = () => {
        try {
          value = run();
        } catch (e) {
          transaction.abort();
          reject(e);
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(value);
      };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        reject(new Error("unavailable"));
      };
    };
  });
}
