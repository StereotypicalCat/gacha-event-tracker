import type { CustomEvents, CustomGames } from "../../shared/custom.ts";
import type { DailyLogMap } from "./useDailyLog.ts";
import type { Prefs } from "./usePrefs.ts";
import type { ProgressMap } from "./useProgress.ts";

export interface ExportData {
  format: "gacha-tracker-export";
  version: 1;
  exportedAt: string;
  progress: Record<string, unknown>;
  daily: DailyLogMap;
  ignored: Record<string, { at: string }>;
  customGames: CustomGames;
  customEvents: CustomEvents;
  prefs?: Prefs | undefined;
}

export interface ParsedImport {
  progress: ProgressMap | null;
  daily: DailyLogMap | null;
  ignored: Record<string, { at: string }> | null;
  customGames: unknown;
  customEvents: unknown;
  prefs: unknown | null;
}

/**
 * Builds the serializable JSON export object.
 * When `prefs` is provided, includes preferences for moving hosts ("Export all").
 * When omitted, exports progress and custom data only ("Export").
 */
export function buildExportData(
  progress: Record<string, unknown>,
  daily: DailyLogMap,
  ignored: Record<string, { at: string }>,
  own: { games: CustomGames; events: CustomEvents },
  prefs?: Prefs | undefined,
): ExportData {
  return {
    format: "gacha-tracker-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
    daily,
    ignored,
    customGames: own.games,
    customEvents: own.events,
    ...(prefs !== undefined ? { prefs } : {}),
  };
}

/**
 * Validates and parses raw JSON from an import file.
 * Returns null if the file is not a valid Event Clock export.
 */
export function parseImportData(parsed: unknown): ParsedImport | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const data = parsed as {
    format?: string;
    progress?: unknown;
    completions?: unknown;
    daily?: unknown;
    ignored?: unknown;
    customGames?: unknown;
    customEvents?: unknown;
    prefs?: unknown;
  };
  if (data.format !== "gacha-tracker-export") return null;

  const asRecord = (v: unknown) =>
    typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  const asMarks = (v: unknown) =>
    typeof v === "object" && v !== null
      ? (v as Record<string, { at: string }>)
      : null;

  let progress: ProgressMap | null = asRecord(data.progress) as ProgressMap | null;
  const legacy = asRecord(data.completions) as Record<string, { at: string }> | null;
  if (progress === null && legacy !== null) {
    progress = Object.fromEntries(
      Object.entries(legacy).map(([id, m]) => [id, { ...m, status: "done" }]),
    );
  }

  const daily =
    typeof data.daily === "object" && data.daily !== null
      ? (data.daily as DailyLogMap)
      : null;
  const ignored = asMarks(data.ignored);
  const prefs =
    typeof data.prefs === "object" && data.prefs !== null ? data.prefs : null;

  return {
    progress,
    daily,
    ignored,
    customGames: data.customGames,
    customEvents: data.customEvents,
    prefs,
  };
}

/**
 * Initiates a browser download of a JSON object as a file.
 */
export function triggerDownload(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
