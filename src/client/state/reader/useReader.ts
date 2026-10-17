import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReaderStore } from "./store.ts";
export const ReaderContext = createContext<ReaderStore | null>(null);
export function useReader() {
  const store = useContext(ReaderContext);
  if (!store) throw new Error("Reader store missing");
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const saveError = useSyncExternalStore(
    store.subscribe,
    store.getError,
    store.getError,
  );
  return { state, dispatch: store.dispatch, saveError };
}
