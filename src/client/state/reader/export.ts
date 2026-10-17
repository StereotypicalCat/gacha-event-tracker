import { ReaderStateSchema, type ReaderState } from "./schema.ts";
import { migrateLegacy } from "./migration.ts";
export function buildReaderExport(
  state: ReaderState,
  legacy: Record<string, string>,
  at: string,
) {
  return {
    format: "gacha-tracker-export" as const,
    version: 2 as const,
    exportedAt: at,
    reader: state,
    legacy: Object.fromEntries(
      Object.entries(legacy).filter(([k]) => k.startsWith("gacha-tracker:v1:")),
    ),
  };
}
export function parseReaderExport(value: unknown): ReaderState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const v = value as Record<string, unknown>;
  if (v.format !== "gacha-tracker-export") return null;
  if (v.version === 2) {
    const parsed = ReaderStateSchema.safeParse(v.reader);
    return parsed.success ? parsed.data : null;
  }
  if (v.version !== undefined && v.version !== 1) return null;
  if (
    typeof v.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(v.exportedAt))
  )
    return null;
  const raw: Record<string, string> = {};
  for (const key of [
    "progress",
    "completions",
    "daily",
    "ignored",
    "prefs",
    "customGames",
    "customEvents",
    "tasks",
    "amounts",
  ]) {
    if (v[key] !== undefined) {
      if (
        typeof v[key] !== "object" ||
        v[key] === null ||
        Array.isArray(v[key])
      )
        return null;
      raw[`gacha-tracker:v1:${key}`] = JSON.stringify(v[key]);
    }
  }
  let n = 0;
  return migrateLegacy(raw, [], v.exportedAt, () => `account:import${++n}`);
}
