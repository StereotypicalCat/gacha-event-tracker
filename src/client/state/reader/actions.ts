import { mintLocalId } from "./ids.ts";
export function actionMeta() {
  return { at: new Date().toISOString(), opId: mintLocalId() };
}
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
