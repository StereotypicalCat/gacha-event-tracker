import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { ArchiveDetail } from "../src/client/components/redesign/ArchiveDetail.tsx";
import { ArchivePage } from "../src/client/components/redesign/ArchivePage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { pairKey, type ArchiveRecord } from "../src/client/state/reader/schema.ts";
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

test("unfinished archive rows offer Mark completed without Restore, and ended completed rows hide Restore", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const afterEnd = Date.parse("2026-11-01T12:00:00.000Z");
  const s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  const unfinished: ArchiveRecord = {
    accountId: "account:test",
    event: { ...sampleEvent, id: "genshin:missed:2026-10-01", title: "Missed Event" },
    outcome: "unfinished",
    outcomeAt: "2026-10-20T00:00:00.000Z",
    resolvedEnd: Date.parse("2026-10-20T00:00:00.000Z"),
    clockRevision: "initial",
    progress: {},
    days: [],
    amounts: {},
  };
  s.archive[pairKey("account:test", unfinished.event.id)] = unfinished;

  const unfinishedHtml = render(
    <ArchivePage
      state={s}
      now={afterEnd}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(unfinishedHtml).toContain("Mark completed");
  expect(unfinishedHtml).not.toContain(">Restore<");

  s.archive[pairKey("account:test", unfinished.event.id)] = {
    ...unfinished,
    outcome: "done",
    outcomeAt: "2026-11-01T12:00:00.000Z",
  };
  const endedDoneHtml = render(
    <ArchivePage
      state={s}
      now={afterEnd}
      onAction={async () => ({ ok: true })}
      onOpen={() => {}}
    />,
  );
  expect(endedDoneHtml).not.toContain("Mark completed");
  expect(endedDoneHtml).not.toContain(">Restore<");
});

test("ArchiveDetail offers Completed, Ended unfinished and Ignored for ended records, and Restore only while live", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  const endedRecord: ArchiveRecord = {
    accountId: "account:test",
    event: sampleEvent,
    outcome: "unfinished",
    outcomeAt: "2026-10-20T00:00:00.000Z",
    resolvedEnd: Date.parse("2026-10-20T00:00:00.000Z"),
    clockRevision: "initial",
    progress: {},
    days: [],
    amounts: {},
  };
  const endedDetail = render(
    <ArchiveDetail
      record={endedRecord}
      state={s}
      now={Date.parse("2026-11-01T12:00:00.000Z")}
      onAction={async () => ({ ok: true })}
      onClose={() => {}}
    />,
  );
  expect(endedDetail).toContain("Completed");
  expect(endedDetail).toContain("Ended unfinished");
  expect(endedDetail).toContain("Ignored");
  expect(endedDetail).not.toContain("Restore event");

  const liveRecord: ArchiveRecord = {
    ...endedRecord,
    outcome: "done",
    outcomeAt: at,
    resolvedEnd: Date.parse("2026-10-20T00:00:00.000Z"),
  };
  const liveDetail = render(
    <ArchiveDetail
      record={liveRecord}
      state={s}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
      onClose={() => {}}
    />,
  );
  expect(liveDetail).toContain("Completed");
  expect(liveDetail).toContain("Ignored");
  expect(liveDetail).toContain("Restore event");
  expect(liveDetail).not.toContain("Ended unfinished");
});
