import type { Region } from "../../../shared/schema.ts";
import type { View } from "../usePrefs.ts";
import { routinesFor, offered } from "../../../shared/routines.ts";
import { createAccount, changeAccountRegion } from "./accounts.ts";
import type { AccountId, ReaderState, TrackingIntent } from "./schema.ts";
import { cadenceOf } from "../../../shared/period.ts";
export interface SetupDraft {
  region: Region;
  interface: "relaxed" | "structured";
  theme: "dark" | "light" | "system";
  scheme: string;
  timezone: string | null;
  games: string[];
  tracking: Record<string, TrackingIntent>;
  showUpcoming: boolean;
  view: View;
  /** Asked only when the reader picks Timeline; absent keeps the default look. */
  timelineLook?: "new" | "classic";
}
export function setupReader(
  draft: SetupDraft,
  existing: ReaderState,
  at: string,
  mint: () => AccountId,
): ReaderState {
  const accounts = { ...existing.accounts };
  for (const game of draft.games) {
    let a =
      Object.values(accounts).find((a) => a.game === game && !a.retiredAt) ??
      createAccount(game, draft.region, at, mint());
    if (a.region !== draft.region)
      a = changeAccountRegion(a, draft.region, at, `setup-${at}`);
    const intent = draft.tracking[game] ?? {
      events: true,
      dailies: false,
      weeklyMonthly: false,
      cycles: false,
    };
    const routines = {
      ...a.routines,
      [`dailies:${game}`]: {
        followed: intent.dailies,
        checklist: intent.dailies,
        timeline: intent.dailies,
      },
    };
    for (const r of routinesFor(game)) {
      const followed =
        offered(r, existing.prefs.standardPulls === true) &&
        (cadenceOf(r.period) === "cycle" ? intent.cycles : intent.weeklyMonthly);
      routines[r.id] = { followed, checklist: followed, timeline: followed };
    }
    accounts[a.id] = { ...a, intent, routines };
  }
  for (const [id, a] of Object.entries(accounts))
    if (!draft.games.includes(a.game))
      accounts[id] = {
        ...a,
        intent: {
          events: false,
          dailies: false,
          weeklyMonthly: false,
          cycles: false,
        },
        routines: Object.fromEntries(
          Object.entries(a.routines).map(([id, p]) => [
            id,
            { ...p, followed: false },
          ]),
        ),
      };
  return {
    ...existing,
    accounts,
    prefs: {
      ...existing.prefs,
      region: draft.region,
      interface: draft.interface,
      theme: draft.theme,
      scheme: draft.scheme,
      timezone: draft.timezone,
      showUpcoming: draft.showUpcoming,
      view: draft.view,
      ...(draft.view === "timeline" && draft.timelineLook
        ? { timelineLook: draft.timelineLook }
        : {}),
      onboarded: true,
      // Straight into the tour, which a new reader must finish; setup has
      // already settled their look.
      redesignTourSeen: "new",
      hiddenGames: Object.values(accounts)
        .map((a) => a.game)
        .filter((g) => !draft.games.includes(g)),
    },
  };
}
