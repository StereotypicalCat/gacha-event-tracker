import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  ChecklistEvent,
  LedgerColumns,
  NextDeadline,
} from "../src/client/components/redesign/ChecklistEvent.tsx";
import { readerEventRows } from "../src/client/state/reader/eventRows.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { sampleEvent } from "./helpers/reader.ts";
const at = "2026-10-16T12:00:00.000Z";
const rows = () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const events = [1, 2, 3, 4, 5].map((n) => ({
    ...sampleEvent,
    id: `${sampleEvent.id}-${n}`,
    title: `Event ${n}`,
    summary: null,
    endsAt: new Date(Date.parse(at) + n * 86_400_000).toISOString(),
  }));
  return readerEventRows(s, events, Date.parse(at)).filter((r) => r.clock.live);
};
test("every row has a time-left bar, with or without a description", () => {
  const [row] = rows();
  const html = render(
    <ChecklistEvent
      row={row!}
      now={Date.parse(at)}
      compact
      onOpen={() => {}}
    />,
  );
  expect(html).toContain('class="ledger-row"');
  expect(html).toContain('class="gcell"');
  expect(html).toContain('class="meter"');
  expect(html).not.toContain("event-entry");
  expect(render(<LedgerColumns />)).toContain("Time left");
  // Standard rows without a description show the time-left bar too (the
  // owner chose this over the mockup's shorter row).
  expect(
    render(
      <ChecklistEvent row={row!} now={Date.parse(at)} onOpen={() => {}} />,
    ),
  ).toContain('class="meter"');
});
test("the next deadline lists the following three, as in the Round 6 rail", () => {
  const live = rows();
  const html = render(
    <NextDeadline row={live[0]} then={live.slice(1, 4)} onOpen={() => {}} />,
  );
  expect(html).toContain('class="then"');
  for (const n of [2, 3, 4]) expect(html).toContain(`Event ${n}`);
  expect(html).not.toContain("Event 5");
});
