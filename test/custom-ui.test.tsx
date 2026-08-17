import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EventForm } from "../src/client/components/CustomForms.tsx";
import { YourOwn } from "../src/client/components/YourOwn.tsx";
import { EventRow } from "../src/client/components/EventRow.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import {
  asDisplayEvent,
  CustomEvent,
  type CustomEvents,
  type CustomGames,
} from "../src/shared/custom.ts";
import { metaFor } from "../src/shared/games.ts";
import { clockFor } from "../src/shared/time.ts";

/**
 * Static-render checks on the F13 surfaces.
 *
 * Not a substitute for using the thing, but they pin the two claims the feature
 * makes to a reader: their event is marked as theirs, and the end date is
 * allowed to be unknown.
 */

const AT = "2026-08-17T12:00:00.000Z";

const GAMES: CustomGames = {
  "mygame:limbus-company": {
    id: "mygame:limbus-company",
    name: "Limbus Company",
    hue: "#C74B50",
    at: AT,
  },
};

const OWN = CustomEvent.parse({
  id: "myevent:k3f9qa2m01",
  game: "mygame:limbus-company",
  title: "Walpurgisnacht",
  type: "banner",
  summary: null,
  startsAt: "2026-08-20T00:00:00.000Z",
  startPrecision: "day",
  endsAt: "2026-09-03T00:00:00.000Z",
  endPrecision: "day",
  at: AT,
  updatedAt: AT,
});

const EVENTS: CustomEvents = { [OWN.id]: OWN };

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <GameMetaProvider value={(id) => metaFor(id, GAMES)}>{node}</GameMetaProvider>,
  );
}

describe("YourOwn", () => {
  const noop = () => {};
  const props = {
    games: GAMES,
    events: EVENTS,
    lanes: ["genshin", "mygame:limbus-company"],
    onAddGame: noop,
    onEditGame: noop,
    onRemoveGame: () => ({ removed: true, blockedBy: 0 }),
    onAddEvent: noop,
  };

  test("lists a reader's game with the events it holds", () => {
    const html = render(<YourOwn {...props} />);
    expect(html).toContain("Limbus Company");
    expect(html).toContain("1 event");
    expect(html).toContain("#C74B50");
  });

  test("shows a game with nothing in it rather than hiding it", () => {
    // A game they just made has to appear before it holds anything, or adding
    // one looks like it did nothing.
    const html = render(<YourOwn {...props} events={{}} />);
    expect(html).toContain("no events yet");
  });
});

describe("EventForm", () => {
  test("offers an unknown end rather than demanding a date", () => {
    // The whole point: a form that made the end mandatory would push the reader
    // into inventing one, which is the failure the parsers are forbidden from.
    const html = render(
      <EventForm
        lanes={["genshin", "mygame:limbus-company"]}
        customGames={GAMES}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("I don&#x27;t know when it ends");
  });

  test("lets an event be filed under a tracked game too", () => {
    // A source can miss an event in a game we do cover.
    const html = render(
      <EventForm
        lanes={["genshin", "mygame:limbus-company"]}
        customGames={GAMES}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Genshin Impact");
    expect(html).toContain("Limbus Company (yours)");
  });
});

describe("EventRow provenance", () => {
  const row = (id: string) => {
    const event = { ...asDisplayEvent(OWN), id };
    return { event, clock: clockFor(event, "europe", Date.parse(AT)) };
  };

  test("marks the reader's own event as theirs", () => {
    const html = render(
      <ul>
        <EventRow row={row(OWN.id)} completed={false} onOpen={() => {}} />
      </ul>,
    );
    expect(html).toContain("yours");
  });

  test("does not mark a scraped event as theirs", () => {
    const html = render(
      <ul>
        <EventRow
          row={row("genshin:windblume-festival:2026-03-14")}
          completed={false}
          onOpen={() => {}}
        />
      </ul>,
    );
    expect(html).not.toContain(">yours<");
  });
});
