import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cadenceLabel,
  endStated,
  repeatOf,
  unknownEndNote,
  EventForm,
  repeatFrom,
  strandedNotice,
} from "../src/client/components/CustomForms.tsx";
import { eventCaption, YourOwn } from "../src/client/components/YourOwn.tsx";
import { EventRow } from "../src/client/components/EventRow.tsx";
import { EventDetail } from "../src/client/components/EventDetail.tsx";
import { AUTHOR, Colophon, REPO_URL } from "../src/client/components/Colophon.tsx";
import { GameMetaProvider } from "../src/client/state/gameMeta.tsx";
import {
  asDisplayEvent,
  CustomEvent,
  type CustomEvents,
  type CustomGames,
  type DisplayEvent,
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
    now: Date.parse("2026-10-01T12:00:00.000Z"),
    onOpen: noop,
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

  test("puts the reader's own games at the top of the picker, and defaults to one", () => {
    // Someone entering an event by hand is usually doing it because the game
    // isn't tracked. Two of theirs to prove the group order, not just a swap.
    const twoOfMine: CustomGames = {
      ...GAMES,
      "mygame:silver-palace": {
        id: "mygame:silver-palace",
        name: "Silver Palace",
        hue: "#5C7CE0",
        at: AT,
      },
    };
    const html = renderToStaticMarkup(
      <GameMetaProvider value={(id) => metaFor(id, twoOfMine)}>
        <EventForm
          lanes={["genshin", "hsr", "mygame:limbus-company", "mygame:silver-palace"]}
          customGames={twoOfMine}
          onSave={() => {}}
          onCancel={() => {}}
        />
      </GameMetaProvider>,
    );

    // The game picker is the first select; the second is the event kind.
    const picker = html.slice(0, html.indexOf("</select>"));
    const order = [...picker.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      "mygame:limbus-company",
      "mygame:silver-palace",
      // Tracked games keep their feed order behind them — the sort groups, it
      // does not reshuffle.
      "genshin",
      "hsr",
    ]);
    // The default follows the top of the list rather than staying on Genshin.
    expect(html).toContain('value="mygame:limbus-company" selected');
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
        <EventRow
          row={row(OWN.id)}
          now={Date.parse(AT)}
          completed={false}
          onOpen={() => {}}
        />
      </ul>,
    );
    expect(html).toContain("yours");
  });

  test("does not mark a scraped event as theirs", () => {
    const html = render(
      <ul>
        <EventRow
          row={row("genshin:windblume-festival:2026-03-14")}
          now={Date.parse(AT)}
          completed={false}
          onOpen={() => {}}
        />
      </ul>,
    );
    expect(html).not.toContain(">yours<");
  });

  test("counts from the instant it is handed, not from the wall clock", () => {
    // The row used to ask `Date.now()` for its caption and its "starts in",
    // which is why neither could be asserted at all: the numbers moved with
    // whenever the suite happened to run. Rendering the same row at two instants
    // has to produce two different countdowns, and both have to be the ones the
    // injected clock implies.
    const event = { ...asDisplayEvent(OWN), id: OWN.id };
    const at = Date.parse(AT);
    // A window opening in two days, so the row takes its "starts in" branch.
    const upcoming = {
      ...event,
      startsAt: new Date(at + 2 * 24 * 3_600_000).toISOString(),
    };
    const at2 = (ms: number) =>
      render(
        <ul>
          <EventRow
            row={{ event: upcoming, clock: clockFor(upcoming, "europe", ms) }}
            now={ms}
            completed={false}
            onOpen={() => {}}
          />
        </ul>,
      );

    expect(at2(at)).toContain("starts in 2d");
    // A day later the same row says one day, with nothing about the real clock
    // involved in either answer.
    expect(at2(at + 24 * 3_600_000)).toContain("starts in 1d");
  });
});

describe("Colophon freshness notice (PRD F7)", () => {
  const NOW = Date.parse("2026-08-17T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  const fresh = {
    sourceId: "genshin-game8-events",
    game: "genshin" as const,
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    lastSuccessAt: new Date(NOW - 3 * HOUR).toISOString(),
    eventCount: 9,
  };

  test("states when the data was refreshed, unprompted", () => {
    // Always rendered, not only on a problem: a footer that says nothing about
    // its own age reads as current.
    const html = renderToStaticMarkup(<Colophon sources={[fresh]} now={NOW} />);
    expect(html).toContain("Event data last refreshed");
    expect(html).toContain("3h 0m ago");
    // The machine-readable instant is there for anyone checking the claim.
    // Matched case-insensitively: React emits the JSX spelling verbatim, and
    // HTML attribute names are case-insensitive, so either is correct.
    expect(html).toMatch(
      new RegExp(`<time [^>]*datetime="${fresh.lastSuccessAt}"`, "i"),
    );
    expect(html).not.toContain("not refreshed in over two days");
  });

  test("names the games that are behind, with how far", () => {
    const html = renderToStaticMarkup(
      <Colophon
        sources={[
          fresh,
          { ...fresh, sourceId: "nikki-game8-events", game: "nikki", lastSuccessAt: new Date(NOW - 80 * HOUR).toISOString() },
        ]}
        now={NOW}
      />,
    );
    // A count cannot be acted on; a name tells the reader which source page to
    // go and check.
    expect(html).toContain("Infinity Nikki");
    expect(html).toContain("not refreshed in over two days");
    expect(html).toContain("3d 8h ago");
    // The headline still reports the freshest confirmation.
    expect(html).toContain("3h 0m ago");
  });

  test("summarises instead of listing when every game is behind", () => {
    // What a refresh that stopped running looks like. Ten names each repeating
    // the same age is less readable than the count this replaced.
    const behind = (["genshin", "hsr", "zzz"] as const).map((game, i) => ({
      ...fresh,
      sourceId: `${game}-src`,
      game,
      lastSuccessAt: new Date(NOW - (80 + i) * HOUR).toISOString(),
    }));
    const html = renderToStaticMarkup(<Colophon sources={behind} now={NOW} />);
    expect(html).toContain("Nothing has refreshed in over two days");
    expect(html).not.toContain("Genshin Impact (");
  });

  test("caps the list and counts the remainder", () => {
    const behind = (["hsr", "zzz", "wuwa", "nte", "nikki", "p5x"] as const).map(
      (game, i) => ({
        ...fresh,
        sourceId: `${game}-src`,
        game,
        lastSuccessAt: new Date(NOW - (80 + i) * HOUR).toISOString(),
      }),
    );
    // `fresh` is Genshin, a game absent from the list above — otherwise its
    // sibling source would drag Genshin stale too and every game would be
    // behind, which is the other branch.
    const html = renderToStaticMarkup(
      <Colophon sources={[...behind, fresh]} now={NOW} />,
    );
    expect(html).toContain("and 2 other games");
    // Oldest first, so the two dropped are the *least* overdue, not an
    // arbitrary pair: P5X at 85h is named, Star Rail at 80h is summarised.
    expect(html).toContain("Persona 5: The Phantom X (");
    expect(html).not.toContain("Honkai: Star Rail (");
  });

  test("says so plainly when nothing has ever been fetched", () => {
    // A fresh checkout with no fixtures. The headline must not format a null,
    // and with every game unfetched the list collapses to the sentence.
    const html = renderToStaticMarkup(
      <Colophon sources={[{ ...fresh, lastSuccessAt: null }]} now={NOW} />,
    );
    expect(html).toContain("no source has been fetched yet");
    expect(html).toContain("Nothing has refreshed in over two days");
  });

  test("marks a never-fetched source as never, beside games that have", () => {
    const html = renderToStaticMarkup(
      <Colophon
        sources={[fresh, { ...fresh, sourceId: "r1999-src", game: "r1999", lastSuccessAt: null }]}
        now={NOW}
      />,
    );
    expect(html).toContain("Reverse: 1999 (never)");
  });

  test("the author's links sit together, above the ideas credit", () => {
    // The row is who built this and where to find them; the credit below it is
    // other people. Reading order follows that, so a reader scanning the footer
    // does not pass a stranger's handle on the way to the author's own links.
    const html = renderToStaticMarkup(<Colophon sources={[fresh]} now={NOW} />);
    const links = html.indexOf("@StereotypicalCat");
    const ideas = html.indexOf("Additional ideas");
    expect(links).toBeGreaterThan(-1);
    expect(ideas).toBeGreaterThan(-1);
    expect(links).toBeLessThan(ideas);
  });

  test("carries the Ko-fi link, in the row and not as an appeal", () => {
    const html = renderToStaticMarkup(<Colophon sources={[fresh]} now={NOW} />);
    expect(html).toContain(AUTHOR.kofi);
    // Last in the author's row, so it never lands between the disclaimer and
    // the reader — and never louder than the links beside it.
    expect(html.indexOf(AUTHOR.kofi)).toBeGreaterThan(html.indexOf(REPO_URL));
    expect(html.indexOf(AUTHOR.kofi)).toBeLessThan(html.indexOf("Additional ideas"));
    // Unobtrusive is a property of the markup, not a matter of taste: the same
    // muted class as its neighbours, and no ask anywhere in the footer.
    expect(html).not.toMatch(/support me|buy me|donate|tip jar/i);
  });
});

describe("stating a repeat", () => {
  const repeating = (over: Record<string, unknown> = {}) =>
    CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Abyss",
      type: "challenge",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 2, until: null },
      at: AT,
      updatedAt: AT,
      ...over,
    });

  // The fixture runs 1-8 Sep inclusive with no times given, so it closes at
  // 23:59:59 on the 8th and a successor opening "the moment it closes" opens
  // at midnight on the 9th — eight days after the anchor, not seven. Its rule
  // is every two weeks, which leaves a gap, so `repeating()` is the delay
  // case; `forever()` narrows the interval to exactly that eight-day step.
  const forever = () => repeating({ repeat: { unit: "days", interval: 8, until: null } });

  test("a custom cadence offers the three answers", () => {
    // The three-way control lives under `custom` now: a preset answers the
    // question by construction and a one-off has nothing to answer, so this
    // is the only cadence that has to ask.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating()}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Repeat");
    expect(html).toContain("with a delay");
  });

  test("a rule that reopens as it closes shows its cadence rather than a control", () => {
    // The whole point of "forever": the dates already say how often, so the
    // form reports what it measured instead of asking for a number.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={forever()}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("on an 8-day cycle");
    expect(html).toContain("from your dates");
    expect(html).not.toContain("Wait");
  });

  test("a measured cadence can still be overridden by hand", () => {
    // Measuring is the convenience, not a cage — an irregular rotation has to
    // be sayable even when the first window does not describe it.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={forever()}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("state it myself");
  });

  test("a rule with a gap opens as a delay, showing the gap", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating()}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Wait");
    expect(html).toContain("after it ends");
    // A week's gap after a week's window is a fortnightly rule; both readings
    // are shown so the reader can check the one against the other.
    expect(html).toContain("on a 2-week cycle");
  });

  test("with no end date there is nothing to measure, so it asks", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown", repeat: { unit: "weeks", interval: 2, until: null } })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Cycle length");
  });

  test("with no end date, the delay option is closed off", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown", repeat: { unit: "weeks", interval: 2, until: null } })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("needs an end date");
  });

  test("an unknown end with a rule stops claiming there is no countdown", () => {
    // "It'll show with no countdown and no daily checklist" is true of an
    // unbounded event and false once an interval bounds it. Leaving it there
    // would talk a reader out of the simplest way to record a weekly reset.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown" })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("until the next one opens");
    expect(html).not.toContain("no countdown");
  });

  test("an unknown end with no rule keeps the original note", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown", repeat: null })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("no countdown");
  });
});

describe("repeatFrom", () => {
  test("a fresh rule has no `until` to carry — there is no control for one", () => {
    expect(repeatFrom("weeks", 2, null)).toEqual({ unit: "weeks", interval: 2, until: null });
  });

  test("an edit preserves the `until` already on the record", () => {
    // The form has no field for this, so the only way it can end up on the
    // save is by surviving from what was already there — an import-sourced
    // rule, since that is the only door `until` has today.
    const existing = "2027-01-01T00:00:00.000Z";
    expect(repeatFrom("weeks", 2, existing)).toEqual({
      unit: "weeks",
      interval: 2,
      until: existing,
    });
    // It survives a schedule change too — changing the unit or interval is a
    // different edit from changing when the series stops, and the reader
    // never touched the latter.
    expect(repeatFrom("months", 1, existing)).toEqual({
      unit: "months",
      interval: 1,
      until: existing,
    });
  });

  test("turning the repeat off drops it, existing `until` included", () => {
    expect(repeatFrom("never", 2, "2027-01-01T00:00:00.000Z")).toBeNull();
  });

  test("an invalid interval is refused the same way regardless of `until`", () => {
    expect(repeatFrom("weeks", 0, "2027-01-01T00:00:00.000Z")).toBeNull();
    expect(repeatFrom("weeks", 400, null)).toBeNull();
  });
});

describe("what a reschedule costs", () => {
  test("says nothing when nothing would be stranded", () => {
    expect(strandedNotice(0)).toBe(null);
  });

  test("counts, and agrees with itself about plurals", () => {
    expect(strandedNotice(1)).toContain("1 tick");
    expect(strandedNotice(1)).not.toContain("ticks");
    expect(strandedNotice(3)).toContain("3 ticks");
  });

  test("says what happens, not what is forbidden", () => {
    // It informs; it never blocks. Their data is theirs to reorganise, and a
    // form that refused the edit would be a worse answer than one that says
    // what it costs — removeGame refuses because a cascade is unrecoverable,
    // and an orphaned mark is not.
    expect(strandedNotice(3)!.toLowerCase()).toContain("strand");
  });
});

describe("the sheet says how often", () => {
  test("a repeating event shows its cadence", () => {
    const rule = CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Abyss",
      type: "challenge",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 2, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(cadenceLabel(rule.repeat)).toBe("on a 2-week cycle");
  });

  test("a cycle of one unit is named, not numbered", () => {
    // "on a 1-week cycle" is what the general form would produce and nobody
    // says it. The adverb is the natural reading and costs one lookup.
    expect(cadenceLabel({ unit: "days", interval: 1, until: null })).toBe("on a daily cycle");
    expect(cadenceLabel({ unit: "weeks", interval: 1, until: null })).toBe("on a weekly cycle");
    expect(cadenceLabel({ unit: "months", interval: 1, until: null })).toBe("on a monthly cycle");
  });

  test("a longer cycle takes the singular unit as an adjective", () => {
    // "26-day", not "26-days" — the hyphenated form is adjectival.
    expect(cadenceLabel({ unit: "days", interval: 26, until: null })).toBe("on a 26-day cycle");
    expect(cadenceLabel({ unit: "months", interval: 3, until: null })).toBe("on a 3-month cycle");
  });

  test("the article follows how the number sounds, not how it is spelled", () => {
    // "a 8-day cycle" is the kind of wrong that reads as sloppiness rather
    // than as a bug. Eight, eleven and eighteen open on a vowel; so does
    // everything in the eighties, which is still inside the 365 ceiling.
    expect(cadenceLabel({ unit: "days", interval: 8, until: null })).toBe("on an 8-day cycle");
    expect(cadenceLabel({ unit: "days", interval: 11, until: null })).toBe("on an 11-day cycle");
    expect(cadenceLabel({ unit: "days", interval: 18, until: null })).toBe("on an 18-day cycle");
    expect(cadenceLabel({ unit: "days", interval: 84, until: null })).toBe("on an 84-day cycle");
    expect(cadenceLabel({ unit: "days", interval: 7, until: null })).toBe("on a 7-day cycle");
    expect(cadenceLabel({ unit: "days", interval: 80, until: null })).toBe("on an 80-day cycle");
  });

  test("a non-repeating event has no cadence to show", () => {
    expect(cadenceLabel(null)).toBe(null);
  });
});

describe("the derived-boundary note", () => {
  const NOW = Date.parse("2026-08-25T12:00:00.000Z");

  const noop = () => {};
  const detailProps = {
    completed: false,
    ignored: false,
    status: undefined,
    effort: undefined,
    note: "",
    region: "europe" as const,
    now: NOW,
    daily: false,
    detectedDaily: false,
    dailyDays: [],
    onDaily: noop,
    onToggleDay: noop,
    onIgnore: noop,
    onStatus: noop,
    onEffort: noop,
    onNote: noop,
    onClose: noop,
  };

  // A parser declining to guess a time of day — the case the note was written
  // for. `dates.ts` stores the placeholder as 00:00Z, and `boundaryMs` reads
  // it against the game's own server reset rather than literally.
  const PARSED: DisplayEvent = {
    id: "genshin:walpurgisnacht:2026-09-03",
    game: "genshin",
    title: "Walpurgisnacht",
    type: "banner",
    summary: null,
    startsAt: "2026-08-20T00:00:00.000Z",
    startPrecision: "day",
    endsAt: "2026-09-03T00:00:00.000Z",
    endPrecision: "day",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: "https://example.com/events",
    sourceId: "genshin-game8-events",
    status: "published",
    confidence: 1,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: AT,
    updatedAt: AT,
  };

  test("present for a parser-sourced day-precision event", () => {
    const html = renderToStaticMarkup(
      <GameMetaProvider value={(id) => metaFor(id, GAMES)}>
        <EventDetail
          {...detailProps}
          row={{ event: PARSED, clock: clockFor(PARSED, detailProps.region, NOW) }}
        />
      </GameMetaProvider>,
    );
    expect(html).toContain("server reset");
  });

  test("absent for a reader's own day-precision event", () => {
    // False three times over: no source, nobody "gave" a date, and
    // `boundaryMs` only applies the reset shift for `extractionMethod ===
    // "parser"` — a reader's own event is "manual" even at day precision.
    const own = asDisplayEvent(OWN);
    const html = renderToStaticMarkup(
      <GameMetaProvider value={(id) => metaFor(id, GAMES)}>
        <EventDetail
          {...detailProps}
          row={{ event: own, clock: clockFor(own, detailProps.region, NOW) }}
        />
      </GameMetaProvider>,
    );
    expect(html).not.toContain("server reset");
  });
});

describe("the cadence control", () => {
  const event = (over: Record<string, unknown> = {}) =>
    CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Mirror Dungeon",
      type: "challenge",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: null,
      at: AT,
      updatedAt: AT,
      ...over,
    });

  const render = (initial?: ReturnType<typeof event>) =>
    renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={initial}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

  test("a fresh form offers all five answers and opens on one-off", () => {
    const html = render();
    expect(html).toContain("Cadence");
    for (const answer of ["one-off", "daily", "weekly", "monthly", "custom"]) {
      expect(html).toContain(answer);
    }
    // A one-off is what the form was before any of this, so it still asks for
    // an end and still lets the reader say they do not know it.
    expect(html).toContain("Ends");
    expect(html).toContain("I don&#x27;t know when it ends");
  });

  test("a preset asks for a start and nothing else", () => {
    // The period is the window, so there is no end to type and no ignorance
    // to admit. This is the whole reason the presets exist.
    const html = render(
      event({
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "weeks", interval: 1, until: null },
      }),
    );
    expect(html).toContain("Starts");
    expect(html).not.toContain("Ends");
    expect(html).not.toContain("I don&#x27;t know when it ends");
    expect(html).not.toContain("Cycle length");
    expect(html).not.toContain("Wait");
  });

  test("each preset reopens as itself", () => {
    const daily = render(
      event({ endsAt: null, endPrecision: "unknown", repeat: { unit: "days", interval: 1, until: null } }),
    );
    expect(daily).toContain('value="daily" selected=""');
    const monthly = render(
      event({ endsAt: null, endPrecision: "unknown", repeat: { unit: "months", interval: 1, until: null } }),
    );
    expect(monthly).toContain('value="monthly" selected=""');
  });

  test("a dated recurring event reopens as a custom, with its window intact", () => {
    // Presets carry no window, so anything that states one has to land here —
    // and the end date it stated has to still be on screen.
    const html = render(event({ repeat: { unit: "days", interval: 26, until: null } }));
    expect(html).toContain('value="custom" selected=""');
    expect(html).toContain("Ends");
    expect(html).toContain("Repeat");
  });

  test("a one-off shows no repeat machinery at all", () => {
    const html = render(event());
    expect(html).toContain('value="one-off" selected=""');
    expect(html).not.toContain("Cycle length");
    expect(html).not.toContain("Wait");
    expect(html).not.toContain("worked out from your dates");
  });
});

describe("a preset says its piece exactly once", () => {
  test("no end-date note tags along when there is no end-date field", () => {
    // Both of the older notes explain the end-date field. A preset has no such
    // field, so rendering them there left two sentences saying almost the same
    // thing — caught by looking at the form, not by any assertion on content.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={CustomEvent.parse({
          id: "myevent:k3f9qa2m01",
          game: "mygame:limbus-company",
          title: "Weekly missions",
          type: "challenge",
          summary: null,
          startsAt: "2026-09-01T00:00:00.000Z",
          startPrecision: "day",
          endsAt: null,
          endPrecision: "unknown",
          repeat: { unit: "weeks", interval: 1, until: null },
          at: AT,
          updatedAt: AT,
        })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("no end date to give");
    expect(html).not.toContain("still counts down");
    expect(html).not.toContain("no countdown");
  });
});

describe("endStated", () => {
  // Extracted because the bug it now pins was unreachable from any test in
  // this project: every static render drives the form through `initial`, and
  // `cadenceOf` never returns a preset for an event that has an end. The
  // broken state — a *fresh* form switched to a preset — needs a click.
  test("a cadence with no end field has nothing to answer", () => {
    // The Critical case. A fresh form has endKnown true and endDate empty;
    // picking weekly hides both the field and the checkbox, so requiring an
    // end here disables Save with nothing on screen that could satisfy it.
    expect(endStated(false, true, "")).toBe(true);
    expect(endStated(false, false, "")).toBe(true);
  });

  test("a cadence that asks still has to be answered", () => {
    expect(endStated(true, true, "")).toBe(false);
    expect(endStated(true, true, "2026-09-08")).toBe(true);
    expect(endStated(true, false, "")).toBe(true);
  });
});

describe("unknownEndNote", () => {
  // Keyed off the rule, not the cadence: `custom` with Repeat set to never is
  // a real state, and it has no interval to bound anything.
  test("no rule means no countdown, whatever the cadence", () => {
    expect(unknownEndNote(null)).toContain("no countdown");
  });

  test("a rule bounds it, so it still counts down", () => {
    const note = unknownEndNote({ unit: "weeks", interval: 1, until: null });
    expect(note).toContain("until the next one opens");
    expect(note).not.toContain("no countdown");
  });
});

describe("repeatOf", () => {
  const base = {
    mode: "forever" as const,
    measuring: false,
    measured: null,
    startMs: Date.parse("2026-09-01T00:00:00.000Z"),
    contiguousMs: Date.parse("2026-09-08T00:00:00.000Z"),
    unit: "weeks" as const,
    amount: 1,
    until: null as string | null,
  };

  test("a one-off states no rule", () => {
    expect(repeatOf({ ...base, cadence: "one-off" })).toBe(null);
  });

  test("each preset is its own unit, once", () => {
    expect(repeatOf({ ...base, cadence: "daily" })).toEqual({ unit: "days", interval: 1, until: null });
    expect(repeatOf({ ...base, cadence: "weekly" })).toEqual({ unit: "weeks", interval: 1, until: null });
    expect(repeatOf({ ...base, cadence: "monthly" })).toEqual({ unit: "months", interval: 1, until: null });
  });

  test("a preset carries an existing `until` through", () => {
    // The form has no control for `until`, so the only way it survives an
    // edit is by being threaded through every path that builds a rule — and
    // the preset path is the newest of them.
    const until = "2027-01-01T00:00:00.000Z";
    expect(repeatOf({ ...base, cadence: "weekly", until })?.until).toBe(until);
    expect(repeatOf({ ...base, cadence: "custom", until })?.until).toBe(until);
  });

  test("a delay that cannot land on a whole unit states no rule", () => {
    // Start at 10:00, end at midnight: no whole number of any unit steps from
    // one to the other, so there is nothing the schema could store.
    expect(
      repeatOf({
        ...base,
        cadence: "custom",
        mode: "delay",
        startMs: Date.parse("2026-09-01T10:00:00.000Z"),
        contiguousMs: Date.parse("2026-09-08T00:00:00.000Z"),
      }),
    ).toBe(null);
  });
});

describe("eventCaption", () => {
  // What each row in the settings index says about itself. The point is to
  // explain why an event is not on the front page — a list of bare titles
  // leaves the reader guessing which of two entries is the dead one.
  const NOW = Date.parse("2026-10-01T12:00:00.000Z");
  const at = (over: Record<string, unknown>) =>
    CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Season 7",
      type: "story",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: null,
      at: AT,
      updatedAt: AT,
      ...over,
    });

  test("a repeating event says how often, not when", () => {
    // Its dates roll forward, so a date would be out of step with the row the
    // reader would find if they went looking on the front page.
    expect(
      eventCaption(at({ repeat: { unit: "weeks", interval: 1, until: null } }), NOW),
    ).toBe("on a weekly cycle");
  });

  test("an event whose end has passed says so", () => {
    // The whole reason this index exists: this one is on no other surface.
    expect(eventCaption(at({}), NOW)).toContain("ended");
  });

  test("an event still to come says when it starts", () => {
    // Asserted on what it says, not on what it avoids saying: `not.toContain`
    // passed even with this whole branch deleted, because the ended branch was
    // never the thing at risk.
    expect(
      eventCaption(
        at({ startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-08T00:00:00.000Z" }),
        NOW,
      ),
    ).toContain("starts");
  });

  test("an unannounced end says so rather than reading as passed", () => {
    // Date.parse(null) is NaN and NaN < now is false, so the null guard was
    // unobservable through a `not.toContain("ended")` assertion.
    expect(eventCaption(at({ endsAt: null, endPrecision: "unknown" }), NOW)).toBe(
      "no end date",
    );
  });

  test("a repeating series that has stopped says so, not just how often", () => {
    // This list's whole job is explaining why an event is on no other surface.
    // A finished series that reports a healthy cadence explains nothing.
    const caption = eventCaption(
      at({
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "weeks", interval: 1, until: "2026-09-20T00:00:00.000Z" },
      }),
      NOW,
    );
    expect(caption).toContain("stopped");
  });
});

describe("the settings index of your own events", () => {
  test("lists an ended event that no other surface shows", () => {
    const ended = CustomEvent.parse({
      id: "myevent:seasonseven",
      game: "mygame:limbus-company",
      title: "Season 7",
      type: "story",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: null,
      at: AT,
      updatedAt: AT,
    });
    const html = render(
      <YourOwn
        games={GAMES}
        events={{ [ended.id]: ended }}
        lanes={["mygame:limbus-company"]}
        now={Date.parse("2026-10-01T12:00:00.000Z")}
        onAddGame={() => {}}
        onEditGame={() => {}}
        onRemoveGame={() => ({ removed: true, blockedBy: 0 })}
        onAddEvent={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("Season 7");
    expect(html).toContain("ended");
  });
});

describe("the index covers events filed under a tracked game", () => {
  test("an event under Genshin is listed too", () => {
    // The form deliberately allows this — a source can miss an event — so an
    // index that only walked the reader's own games would leave exactly the
    // same hole it exists to close.
    const own = CustomEvent.parse({
      id: "myevent:undergenshin",
      game: "genshin",
      title: "Something the wiki missed",
      type: "other",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: null,
      at: AT,
      updatedAt: AT,
    });
    const html = render(
      <YourOwn
        games={GAMES}
        events={{ [own.id]: own }}
        lanes={["genshin", "mygame:limbus-company"]}
        now={Date.parse("2026-10-01T12:00:00.000Z")}
        onAddGame={() => {}}
        onEditGame={() => {}}
        onRemoveGame={() => ({ removed: true, blockedBy: 0 })}
        onAddEvent={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("Something the wiki missed");
    expect(html).toContain("ended");
  });
});
