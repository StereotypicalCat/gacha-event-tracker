import { GachaEvent } from "../../src/shared/schema.ts";
const at = "2026-10-16T12:00:00.000Z";
export const sampleEvent = GachaEvent.parse({
  id: "genshin:test:2026-10-01",
  game: "genshin",
  title: "Test",
  type: "story",
  summary: null,
  startsAt: "2026-10-01T00:00:00.000Z",
  startPrecision: "day",
  endsAt: "2026-10-20T00:00:00.000Z",
  endPrecision: "day",
  regionScoped: false,
  regionEnds: null,
  sourceUrl: "https://example.com",
  sourceId: "test",
  confidence: 1,
  extractionMethod: "parser",
  version: 1,
  firstSeenAt: at,
  updatedAt: at,
  status: "published",
});

export class MemoryStorage implements Storage {
  values = new Map<string, string>();
  fail = "";
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  setItem(k: string, v: string) {
    if (k === this.fail) throw new DOMException("Full", "QuotaExceededError");
    this.values.set(k, v);
  }
}
