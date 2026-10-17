import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { ArchivePage } from "../src/client/components/redesign/ArchivePage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { sampleEvent } from "./helpers/reader.ts";
test("per-game archive retains the description, outcome, Restore and optional history view", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  s.archive.a = {
    accountId: "account:test",
    event: { ...sampleEvent, summary: "Saved description" },
    outcome: "done",
    outcomeAt: at,
    resolvedEnd: null,
    clockRevision: "initial",
    progress: {},
    days: [],
    amounts: {},
  };
  const html = render(
    <ArchivePage
      state={s}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  for (const label of [
    "Saved description",
    "Restore",
    "History timeline",
    "Your recorded history",
    "completed this month",
  ])
    expect(html).toContain(label);
});
