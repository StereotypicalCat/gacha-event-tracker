import type { GameId, Region } from "../../shared/schema.ts";
import { gameMeta } from "../../shared/games.ts";
import type { Prefs } from "../state/usePrefs.ts";

const REGIONS: Array<{ id: Region; label: string }> = [
  { id: "america", label: "America" },
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia" },
];

export function Controls({
  games,
  prefs,
  onToggleGame,
  onUpdate,
  ignoredCount,
  onExport,
  onImport,
}: {
  games: GameId[];
  prefs: Prefs;
  onToggleGame: (g: GameId) => void;
  onUpdate: (p: Partial<Prefs>) => void;
  ignoredCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <section className="border-t border-hairline px-4 py-5">
      <p className="eyebrow">Games</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {games.map((id) => {
          const game = gameMeta(id);
          const on = !prefs.hiddenGames.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleGame(id)}
              aria-pressed={on}
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: on ? game.hue : "var(--color-hairline)",
                color: on ? game.hue : "var(--color-faint)",
                background: on
                  ? `color-mix(in srgb, ${game.hue} 12%, transparent)`
                  : "transparent",
              }}
            >
              {game.short}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
        <div>
          <p className="eyebrow">Server region</p>
          <div className="mt-2 flex gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onUpdate({ region: r.id, regionConfirmed: true })}
                aria-pressed={prefs.region === r.id}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  prefs.region === r.id
                    ? "border-ink/70 text-ink"
                    : "border-hairline text-faint hover:text-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={prefs.showCompleted}
              onChange={(e) => onUpdate({ showCompleted: e.target.checked })}
              className="size-4 accent-[var(--color-near)]"
            />
            Show events I've finished
          </label>

          {ignoredCount > 0 && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={prefs.showIgnored}
                onChange={(e) => onUpdate({ showIgnored: e.target.checked })}
                className="size-4 accent-[var(--color-near)]"
              />
              Show the {ignoredCount} event{ignoredCount > 1 ? "s" : ""} I'm
              ignoring
            </label>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-hairline pt-4">
        <p className="eyebrow">Your progress</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-faint">
          What you've finished, and every daily you've ticked off, are saved in
          this browser only — there is no account. Move them to another device
          with a file.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onExport}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            Export
          </button>
          <label className="cursor-pointer rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink">
            Import
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
