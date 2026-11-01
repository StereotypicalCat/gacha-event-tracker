import { expect, test } from "bun:test";
import { mergeEvents } from "../src/ingest/merge.ts";
import { aliasesFrom } from "../src/client/state/retiredIds.ts";
import { applyReaderAliases } from "../src/client/state/reader/aliases.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { sampleEvent } from "./helpers/reader.ts";

const at = "2026-11-01T12:00:00.000Z";
const generic = {
  ...sampleEvent,
  id: "genshin:character-test-runs:2026-10-13",
  title: "Character Test Runs",
  startsAt: "2026-10-13T00:00:00.000Z",
  endsAt: "2026-11-03T00:00:00.000Z",
  sourceId: "genshin-game8-events",
  sourceUrl: "https://game8.co/games/Genshin-Impact/archives/301601",
  confidence: 0.85,
};
const named = {
  ...generic,
  id: "genshin:test-run-skirk-escoffier-dahlia-candace-mika:2026-10-13",
  title: "Test Run - Skirk, Escoffier, Dahlia, Candace, Mika",
  sourceId: "genshin-fandom-events",
  sourceUrl: "https://genshin-impact.fandom.com/wiki/Test_Run_-_Character_Trial_Event/2026-10-13",
};
test("generic and character-named copies of the same Genshin trial phase merge", () => {
  const result = mergeEvents([[generic], [named]]);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.id).toBe(generic.id);
  expect(result.events[0]?.mergedIds).toEqual([named.id]);
  expect(result.conflicts).toHaveLength(0);
});
test("separate banner phases and unrelated events remain separate", () => {
  const previous = { ...generic, id: "genshin:character-test-runs:2026-09-23", startsAt: "2026-09-23T00:00:00.000Z", endsAt: generic.startsAt };
  expect(mergeEvents([[previous], [named]]).events).toHaveLength(2);
  expect(mergeEvents([[generic], [{ ...named, sourceUrl: "https://genshin-impact.fandom.com/wiki/Some_Other_Challenge" }]]).events).toHaveLength(2);
  expect(mergeEvents([[generic], [{ ...named, game: "hsr" }]]).events).toHaveLength(2);
});
test("trial identity works for future character names and flags conflicting ends", () => {
  const next = { ...named, title: "Test Run - Different Characters", id: "genshin:test-run-different-characters:2026-10-13", endsAt: "2026-11-06T00:00:00.000Z" };
  const result = mergeEvents([[generic], [next]]);
  expect(result.events).toHaveLength(1);
  expect(result.conflicts).toHaveLength(1);
  expect(result.events[0]?.endsAt).toBe(generic.endsAt);
});
test("progress under either trial copy follows the surviving ID", () => {
  const result = mergeEvents([[generic], [named]]);
  const s = migrateLegacy({}, ["genshin"], at, () => "account:trial");
  s.data["account:trial"]!.progress[named.id] = { status: "done", note: "collected", at };
  s.data["account:trial"]!.daily.initial = { [named.id]: { days: ["2026-11-01"], at } };
  const next = applyReaderAliases(s, aliasesFrom(result.events));
  expect(next.data["account:trial"]!.progress[generic.id]).toHaveProperty("status", "done");
  expect(next.data["account:trial"]!.progress[generic.id]).toHaveProperty("note", "collected");
  expect(next.data["account:trial"]!.daily.initial?.[generic.id]).toHaveProperty("days", ["2026-11-01"]);
  expect(next.data["account:trial"]!.progress[named.id]).toBeUndefined();
});
