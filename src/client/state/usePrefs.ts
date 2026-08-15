import { useCallback, useEffect, useState } from "react";
import type { GameId, Region } from "../../shared/schema.ts";
import { guessRegion } from "../../shared/time.ts";
import type { SortMode } from "./sort.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";

export interface Prefs {
  region: Region;
  /** Games the reader has switched off. Stored as hidden so a newly added game shows up by default. */
  hiddenGames: GameId[];
  /** How the list is ordered. Deadline order is the default and the fallback. */
  sort: SortMode;
  showCompleted: boolean;
  /** Reveal events the reader has ignored, so they can be restored. */
  showIgnored: boolean;
  /** False until the reader confirms or changes the guessed region. */
  regionConfirmed: boolean;
  /** False until the reader has picked their games on first run. */
  onboarded: boolean;
}

function defaults(): Prefs {
  return {
    region: guessRegion(),
    hiddenGames: [],
    sort: "ending",
    showCompleted: true,
    showIgnored: false,
    regionConfirmed: false,
    onboarded: false,
  };
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    ...defaults(),
    ...readJson<Partial<Prefs>>(KEYS.prefs, {}),
  }));

  useEffect(() => {
    writeJson(KEYS.prefs, prefs);
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleGame = useCallback((game: GameId) => {
    setPrefs((prev) => ({
      ...prev,
      hiddenGames: prev.hiddenGames.includes(game)
        ? prev.hiddenGames.filter((g) => g !== game)
        : [...prev.hiddenGames, game],
    }));
  }, []);

  return { prefs, update, toggleGame };
}
