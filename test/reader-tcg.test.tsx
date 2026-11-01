import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GameSettings } from "../src/client/components/redesign/GameSettings.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { readerEventRows } from "../src/client/state/reader/eventRows.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";
import { pairKey } from "../src/client/state/reader/schema.ts";
import { sampleEvent } from "./helpers/reader.ts";
const at = "2026-11-01T12:00:00.000Z";
const event = { ...sampleEvent, id: "genshin:the-forge-realms-temper-clever-stratagems:2026-09-23", title: "The Forge Realm's Temper: Clever Stratagems", endsAt: "2026-11-03T00:00:00.000Z", sourceUrl: "https://genshin-impact.fandom.com/wiki/The_Forge_Realm%27s_Temper/2026-09-23" };
test("TCG defaults on; off hides remembered events and dailies without changing history", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.seenEvents[pairKey("account:one", event.id)] = { accountId: "account:one", event, firstSeenAt: at, lastSeenAt: at, clockRevision: "initial" };
  s.data["account:one"]!.progress[event.id] = { daily: true, note: "keep" };
  expect(readerEventRows(s, [], Date.parse(at))).toHaveLength(1);
  s.prefs.genshinTcg = false;
  expect(readerEventRows(s, [], Date.parse(at))).toHaveLength(0);
  expect(routineRows(s, "account:one", Date.parse(at)).find(r => r.id === event.id)).toBeUndefined();
  expect(s.data["account:one"]!.progress[event.id]).toHaveProperty("note", "keep");
  expect(s.seenEvents[pairKey("account:one", event.id)]).toBeDefined();
});
test("Genshin About offers the TCG tracking preference", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const html = renderToStaticMarkup(<GameSettings state={s} sources={[]} initialGame="genshin" tab="about" now={Date.parse(at)} onAction={async () => ({ ok: true })} />);
  expect(html).toContain("Track TCG events");
});
