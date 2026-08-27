import { describe, expect, test } from "bun:test";
import {
  asDisplayEvent,
  asOccurrenceEvent,
  CustomEvent,
  CustomGame,
  isCustomEventId,
  isCustomGameId,
  knownLane,
  mintCustomEventId,
  mintCustomGameId,
  precisionOf,
  recordFor,
  RESERVED_ID_SEGMENTS,
  type CustomGames,
} from "../src/shared/custom.ts";
import { metaFor } from "../src/shared/games.ts";
import { dailiesId } from "../src/shared/daily.ts";
import { nextOccurrences, Repeat } from "../src/shared/recurrence.ts";
import { eventId, GameId } from "../src/shared/schema.ts";
import { clockFor } from "../src/shared/time.ts";
import {
  occurrencesInFor,
  readerInstant,
  rowsFor,
  validRecords,
} from "../src/client/state/useCustom.ts";

const AT = "2026-08-17T12:00:00.000Z";

function ownEvent(over: Partial<CustomEvent> = {}): CustomEvent {
  return CustomEvent.parse({
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
    ...over,
  });
}

describe("reserved id segments", () => {
  test("no game id can ever occupy a reserved first segment", () => {
    // Every id in the app is colon-separated and the first segment decides
    // which key space it belongs to. The day a GameId is called "mygame" is the
    // day two spaces merge silently, and localStorage has no other copy.
    for (const reserved of RESERVED_ID_SEGMENTS) {
      expect(GameId.options as readonly string[]).not.toContain(reserved);
    }
  });

  test("the three spaces cannot produce the same key", () => {
    const feed = eventId("genshin", "Walpurgisnacht", "2026-08-20T00:00:00.000Z");
    const chore = dailiesId("genshin");
    const own = mintCustomEventId(() => 0.5);
    const ownGame = mintCustomGameId("Limbus Company");

    const keys = [feed, chore, own, ownGame];
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key.split(":").length).toBeGreaterThanOrEqual(2);
    }
  });

  test("a reader's event never collides with the scraped event it names", () => {
    // The whole reason for a random suffix: they can type a tracked event's
    // exact title and date. Under the feed's scheme that is byte-identical.
    const scraped = eventId("genshin", "Windblume Festival", "2026-03-14T00:00:00.000Z");
    const mine = mintCustomEventId(() => 0.123456);
    expect(mine).not.toBe(scraped);
    expect(isCustomEventId(mine)).toBe(true);
    expect(isCustomEventId(scraped)).toBe(false);
  });
});

describe("minting ids", () => {
  test("a game id is slug-derived and disambiguated rather than overwritten", () => {
    expect(mintCustomGameId("Limbus Company")).toBe("mygame:limbus-company");
    // Two games called Nikke are two games.
    expect(mintCustomGameId("Nikke", ["mygame:nikke"])).toBe("mygame:nikke-2");
    expect(mintCustomGameId("Nikke", ["mygame:nikke", "mygame:nikke-2"])).toBe(
      "mygame:nikke-3",
    );
  });

  test("a game whose name slugifies to nothing still gets an id", () => {
    expect(mintCustomGameId("???")).toBe("mygame:game");
  });

  test("event ids match their schema and vary with the source of randomness", () => {
    const a = mintCustomEventId(() => 0.1);
    const b = mintCustomEventId(() => 0.9);
    expect(a).toMatch(/^myevent:[a-z0-9]{10}$/);
    expect(b).toMatch(/^myevent:[a-z0-9]{10}$/);
    expect(a).not.toBe(b);
    expect(isCustomGameId(a)).toBe(false);
  });
});

describe("CustomEvent", () => {
  test("an unannounced end is expressible, and must pair with unknown", () => {
    // A reader entering an event nobody has dated must not be forced to invent
    // one — that is the failure this whole product is built against.
    const open = ownEvent({ endsAt: null, endPrecision: "unknown" });
    expect(open.endsAt).toBeNull();

    expect(() =>
      CustomEvent.parse({ ...ownEvent(), endsAt: null, endPrecision: "day" }),
    ).toThrow();
    expect(() =>
      CustomEvent.parse({
        ...ownEvent(),
        endsAt: "2026-09-03T00:00:00.000Z",
        endPrecision: "unknown",
      }),
    ).toThrow();
  });

  test("rejects an end before its start", () => {
    expect(() =>
      CustomEvent.parse({ ...ownEvent(), endsAt: "2026-08-19T00:00:00.000Z" }),
    ).toThrow();
  });

  test("rejects an empty or oversized title", () => {
    expect(() => CustomEvent.parse({ ...ownEvent(), title: "" })).toThrow();
    expect(() =>
      CustomEvent.parse({ ...ownEvent(), title: "x".repeat(201) }),
    ).toThrow();
  });
});

describe("CustomGame", () => {
  test("a hue must be a hex colour, because it reaches a style attribute", () => {
    // An imported file is not necessarily one this reader wrote.
    const ok = CustomGame.parse({
      id: "mygame:limbus-company",
      name: "Limbus Company",
      hue: "#C74B50",
      at: AT,
    });
    expect(ok.hue).toBe("#C74B50");

    for (const hue of ["red", "url(javascript:alert(1))", "#fff", "#12345g", ""]) {
      expect(() =>
        CustomGame.parse({ id: "mygame:x", name: "X", hue, at: AT }),
      ).toThrow();
    }
  });

  test("rejects an id from another key space", () => {
    expect(() =>
      CustomGame.parse({ id: "genshin", name: "Genshin", hue: "#4EA8DE", at: AT }),
    ).toThrow();
  });
});

describe("asDisplayEvent", () => {
  test("carries no source and claims no region split", () => {
    const shown = asDisplayEvent(ownEvent());
    // Never attributed to a source: there is no page to send a sceptic to.
    expect(shown.sourceUrl).toBeNull();
    // One instant was entered, so inventing three would fabricate two of them.
    expect(shown.regionScoped).toBe(false);
    expect(shown.regionEnds).toBeNull();
    expect(shown.extractionMethod).toBe("manual");
    expect(shown.status).toBe("published");
  });

  test("runs on the same clock as a scraped event", () => {
    // Not a second countdown implementation — the identical one.
    const clock = clockFor(
      asDisplayEvent(ownEvent()),
      "europe",
      Date.parse("2026-08-27T00:00:00.000Z"),
    );
    expect(clock.live).toBe(true);
    expect(clock.msRemaining).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("an unannounced end yields no countdown, exactly as the feed's does", () => {
    const clock = clockFor(
      asDisplayEvent(ownEvent({ endsAt: null, endPrecision: "unknown" })),
      "europe",
      Date.parse("2026-08-27T00:00:00.000Z"),
    );
    expect(clock.msRemaining).toBeNull();
    expect(clock.urgency).toBe("calm");
  });
});

describe("precisionOf", () => {
  test("a date with no time of day is day precision", () => {
    // So the detail sheet's "accurate to the day only" note is honest about
    // the reader's input too, rather than presenting midnight as their choice.
    expect(precisionOf(false)).toBe("day");
    expect(precisionOf(true)).toBe("exact");
  });
});

describe("metaFor", () => {
  const mine: CustomGames = {
    "mygame:limbus-company": {
      id: "mygame:limbus-company",
      name: "Limbus Company",
      hue: "#C74B50",
      at: AT,
    },
  };

  test("answers for a tracked game unchanged", () => {
    expect(metaFor("genshin", mine).name).toBe("Genshin Impact");
    expect(metaFor("genshin", mine).studio).toBe("HoYoverse");
  });

  test("answers for one the reader defined, with no studio or chore", () => {
    const meta = metaFor("mygame:limbus-company", mine);
    expect(meta.name).toBe("Limbus Company");
    expect(meta.hue).toBe("#C74B50");
    // Nothing to credit in the colophon and no routine we could name for them.
    expect(meta.studio).toBe("");
    expect(meta.dailyTasks).toBe("");
  });

  test("is total, so a lane that outlived its game cannot blank the page", () => {
    // An import can carry an event whose game did not come with it.
    const meta = metaFor("mygame:deleted", mine);
    expect(meta.name).toBe("Unknown game");
    expect(meta.hue).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test("shortens a long name rather than overflowing a chip", () => {
    const long: CustomGames = {
      "mygame:x": { id: "mygame:x", name: "Chaos Zero Nightmare", hue: "#123456", at: AT },
    };
    expect(metaFor("mygame:x", long).short.length).toBeLessThanOrEqual(12);
  });
});

describe("knownLane", () => {
  test("a tracked lane is always known; a reader's lane must still exist", () => {
    const mine: CustomGames = {
      "mygame:a": { id: "mygame:a", name: "A", hue: "#123456", at: AT },
    };
    expect(knownLane("genshin", mine)).toBe(true);
    expect(knownLane("mygame:a", mine)).toBe(true);
    expect(knownLane("mygame:gone", mine)).toBe(false);
  });
});

describe("readerInstant", () => {
  // Timezone-independent assertions on purpose: the point of this helper is
  // that it reads a typed date in the *reader's* zone, so the tests check the
  // relationships that must hold in any of them rather than pinning UTC.
  const localDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

  test("a typed date comes back as that same date where the reader is", () => {
    // Someone who types 20 August means the 20th where they are, and has to see
    // the 20th back — not the 19th because a server is five hours behind.
    for (const boundary of ["start", "end"] as const) {
      const iso = readerInstant("2026-08-20", null, boundary);
      expect(iso).not.toBeNull();
      expect(localDate(iso!)).toBe("2026-08-20");
    }
  });

  test("a bare start is the beginning of the day and a bare end is the end of it", () => {
    // Which is how a person reads "20 Aug – 3 Sep": through the 3rd, not up to
    // the first second of it.
    const start = readerInstant("2026-08-20", null, "start")!;
    const end = readerInstant("2026-08-20", null, "end")!;
    expect(Date.parse(end) - Date.parse(start)).toBe(86_399_000);
  });

  test("a stated time is kept", () => {
    const iso = readerInstant("2026-08-20", "18:30", "start")!;
    const d = new Date(iso);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(30);
  });

  test("returns null for a date it cannot read, rather than a wrong one", () => {
    expect(readerInstant("", null, "start")).toBeNull();
    expect(readerInstant("not-a-date", null, "start")).toBeNull();
    expect(readerInstant("2026-02-30", null, "start")).toBeNull();
  });
});

describe("validRecords — the import gate", () => {
  test("keeps the good records and drops only the bad ones", () => {
    // A partly-corrupt file must not cost the reader the parts that are fine.
    const kept = validRecords(
      {
        "mygame:a": { id: "mygame:a", name: "A", hue: "#123456", at: AT },
        "mygame:b": { id: "mygame:b", name: "B", hue: "not-a-colour", at: AT },
        "mygame:c": "nonsense",
      },
      CustomGame,
    );
    expect(Object.keys(kept)).toEqual(["mygame:a"]);
  });

  test("refuses a hue that is not a hex colour", () => {
    // It reaches a style attribute, and an import is not necessarily a file
    // this reader wrote.
    const kept = validRecords(
      {
        "mygame:x": {
          id: "mygame:x",
          name: "X",
          hue: "red; background:url(javascript:alert(1))",
          at: AT,
        },
      },
      CustomGame,
    );
    expect(kept).toEqual({});
  });

  test("an export written before F13 simply has none", () => {
    // Not an error — a file from a device that had nothing of its own.
    expect(validRecords(undefined, CustomEvent)).toEqual({});
    expect(validRecords(null, CustomEvent)).toEqual({});
  });

  test("drops an event whose dates contradict themselves", () => {
    const kept = validRecords(
      {
        "myevent:aaaaaaaaaa": {
          ...ownEvent(),
          id: "myevent:aaaaaaaaaa",
          endsAt: "2026-08-01T00:00:00.000Z",
        },
      },
      CustomEvent,
    );
    expect(kept).toEqual({});
  });
});

describe("retiring a game, a source or a page", () => {
  /**
   * The reader's own events are the only copy that exists — no server has ever
   * seen them (AGENTS.md § Three constraints). We retire things routinely: a
   * source moves, a page goes stale, a game shuts down. None of that may cost
   * them a row they typed.
   *
   * The load path is what makes this sharp rather than theoretical.
   * `useCustom` reads through `validRecords`, which **drops** a record that
   * fails its schema, and the surviving set is what the next write persists.
   * So a record that stops parsing is not hidden until someone fixes it — it is
   * deleted from the device, permanently, by the act of opening the app.
   *
   * `CustomEvent.game` is therefore `z.string()` and not `GameId`, which reads
   * like missing validation and is the load-bearing decision here. Narrowing it
   * to the enum would look like a tightening and would arm every future game
   * removal to erase reader data on next launch.
   */
  const retired = "a-game-we-no-longer-track";

  test("a game id we retire is not one the enum still holds", () => {
    // Guards the premise: if this ever became a real id the test below stops
    // testing anything.
    expect(GameId.options).not.toContain(retired as never);
  });

  test("keeps an event the reader filed under a game we later dropped", () => {
    const orphaned = { ...ownEvent(), game: retired };
    // Parses on its own...
    expect(CustomEvent.safeParse(orphaned).success).toBe(true);
    // ...and survives the gate that decides what stays on the device.
    const kept = validRecords({ [orphaned.id]: orphaned }, CustomEvent);
    expect(kept[orphaned.id]).toBeDefined();
    expect(kept[orphaned.id]?.game).toBe(retired);
  });

  test("keeps the neighbours of an event that genuinely is unreadable", () => {
    // The drop is per record and always has been; this pins that a retired
    // lane is not what triggers it, and that one bad row is not contagious.
    const good = ownEvent();
    const kept = validRecords(
      { [good.id]: good, "myevent:broken": { id: "myevent:broken" } },
      CustomEvent,
    );
    expect(Object.keys(kept)).toEqual([good.id]);
  });

  test("still names the lane, so a retired game shows a row rather than nothing", () => {
    const meta = metaFor(retired, {});
    expect(meta.name).toBe("Unknown game");
    expect(meta.hue).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test("still clocks it, so the countdown does not need the game to exist", () => {
    const orphaned = CustomEvent.parse({ ...ownEvent(), game: retired });
    const c = clockFor(asDisplayEvent(orphaned), "europe", Date.parse("2026-08-25T00:00:00.000Z"));
    expect(c.live).toBe(true);
    expect(c.endsMs).not.toBeNull();
  });
});

describe("a custom event may carry a repeat rule", () => {
  test("a record stored before this field existed still parses", () => {
    // THE migration guarantee. readValid drops records that fail this schema,
    // and the survivors are what the next write persists — so a required or
    // bare-nullable field here would silently delete every custom event on
    // every device that has one, with no server-side copy to restore from.
    const legacy = {
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
      // no `repeat` key at all — this is the shape already in localStorage
    };
    const parsed = CustomEvent.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.repeat).toBe(null);
  });

  test("accepts a rule whose window closes before it comes round again", () => {
    const event = ownEvent({
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-08T00:00:00.000Z",
      repeat: Repeat.parse({ unit: "weeks", interval: 2, until: null }),
    });
    expect(event.repeat?.interval).toBe(2);
  });

  test("rejects a rule that comes round before it ends", () => {
    // A 14-day window repeating every 7 days puts two live occurrences of one
    // rule in the same list, which makes "what ends soonest" ambiguous. Refused
    // at the schema so an imported file cannot carry one in either.
    const overlapping = CustomEvent.safeParse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Walpurgisnacht",
      type: "banner",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-15T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 1, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(overlapping.success).toBe(false);
  });

  test("no stated end means there is no overlap to check", () => {
    // The window runs to the next opening by definition, so it cannot overlap.
    const parsed = CustomEvent.safeParse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Weekly missions",
      type: "other",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: null,
      endPrecision: "unknown",
      repeat: { unit: "weeks", interval: 1, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("asOccurrenceEvent", () => {
  const repeating = () =>
    ownEvent({
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
    });

  test("carries the occurrence's id and dates, and the rule's everything else", () => {
    const rule = repeating();
    const occ = nextOccurrences(rule, new Date("2026-09-15T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.id).toBe("myevent:k3f9qa2m01#2026-09-15");
    expect(row.startsAt).toBe(occ.startsAt);
    expect(row.endsAt).toBe(occ.endsAt);
    expect(row.title).toBe(rule.title);
    expect(row.game).toBe(rule.game);
    expect(row.type).toBe(rule.type);
  });

  test("is still the reader's own, and still claims no source", () => {
    const rule = repeating();
    const occ = nextOccurrences(rule, new Date("2026-09-01T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.sourceUrl).toBe(null);
    expect(row.sourceId).toBe("you");
    expect(row.extractionMethod).toBe("manual");
    expect(isCustomEventId(row.id)).toBe(true);
  });

  test("renaming a rule does not move its occurrence ids", () => {
    // The token is random precisely so fixing a typo never costs the marks
    // attached to an occurrence. Exercised here rather than against
    // occurrenceId, which never takes a title and so could not fail it: this
    // path passes the whole rule, so a rename is a real input to the result.
    const rule = repeating();
    const renamed = { ...rule, title: "Abyss, actually" };
    const now = new Date("2026-09-15T12:00:00").getTime();
    const before = asOccurrenceEvent(rule, nextOccurrences(rule, now, 1)[0]!);
    const after = asOccurrenceEvent(renamed, nextOccurrences(renamed, now, 1)[0]!);

    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Abyss, actually");
  });

  test("a derived end is a real end, so the clock counts down to it", () => {
    // The rule stores endsAt: null; the occurrence resolves it. A row reaching
    // a view must never carry the unresolved form, or it renders as
    // live-with-unknown-end forever — the exact failure this design exists to
    // avoid.
    const rule = ownEvent({
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: null,
      endPrecision: "unknown",
      repeat: { unit: "weeks", interval: 1, until: null },
    });
    const occ = nextOccurrences(rule, new Date("2026-09-02T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.endsAt).not.toBe(null);
    expect(row.endPrecision).not.toBe("unknown");
    const clock = clockFor(row, "europe", new Date("2026-09-02T12:00:00").getTime());
    expect(clock.msRemaining).not.toBe(null);
    expect(clock.live).toBe(true);
  });
});

describe("expanding rules into rows", () => {
  const NOW = new Date("2026-09-03T12:00:00").getTime();

  const plain = ownEvent({ id: "myevent:plain00001" });
  const repeating = ownEvent({
    id: "myevent:k3f9qa2m01",
    startsAt: new Date("2026-09-01T09:00:00").toISOString(),
    startPrecision: "exact",
    endsAt: new Date("2026-09-08T09:00:00").toISOString(),
    endPrecision: "exact",
    repeat: { unit: "weeks", interval: 2, until: null },
  });
  const store = { [plain.id]: plain, [repeating.id]: repeating };

  test("a non-repeating event still yields exactly one row, unchanged", () => {
    const rows = rowsFor({ [plain.id]: plain }, NOW);
    expect(rows.map((r) => r.id)).toEqual(["myevent:plain00001"]);
  });

  test("a rule yields two rows however often it repeats", () => {
    // The lists answer "what ends soonest". Thirteen rows for one weekly rule
    // is the clutter F1 exists to avoid.
    const rows = rowsFor(store, NOW);
    expect(rows.filter((r) => r.id.startsWith("myevent:k3f9qa2m01")).map((r) => r.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
  });

  test("each occurrence is a separate key, so marks do not bleed between them", () => {
    const rows = rowsFor(store, NOW);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("occurrencesIn covers a whole range, not just the next two", () => {
    const rows = occurrencesInFor(
      store,
      new Date("2026-09-01T00:00:00").getTime(),
      new Date("2026-11-01T00:00:00").getTime(),
    );
    expect(rows.filter((r) => r.id.startsWith("myevent:k3f9qa2m01"))).toHaveLength(5);
  });

  test("occurrencesIn ignores non-repeating events", () => {
    // They are already in `rows`; returning them here would double every one of
    // the reader's plain events on the board.
    const rows = occurrencesInFor(
      { [plain.id]: plain },
      new Date("2026-01-01T00:00:00").getTime(),
      new Date("2027-01-01T00:00:00").getTime(),
    );
    expect(rows).toEqual([]);
  });
});

describe("recordFor", () => {
  const rule = ownEvent({
    id: "myevent:k3f9qa2m01",
    startsAt: new Date("2026-09-01T09:00:00").toISOString(),
    startPrecision: "exact",
    endsAt: new Date("2026-09-08T09:00:00").toISOString(),
    endPrecision: "exact",
    repeat: { unit: "weeks", interval: 2, until: null },
  });
  const store = { [rule.id]: rule };

  test("an occurrence row finds the rule behind it", () => {
    // Marks key off the occurrence — that is what gives each time round its own
    // completion — but the record to edit is the rule. Without this the detail
    // sheet looks up a key that does not exist and edit and delete vanish.
    expect(recordFor(store, "myevent:k3f9qa2m01#2026-09-15")?.id).toBe("myevent:k3f9qa2m01");
  });

  test("a plain event finds itself", () => {
    const plain = ownEvent({ id: "myevent:plain00001", repeat: null });
    expect(recordFor({ [plain.id]: plain }, "myevent:plain00001")?.id).toBe("myevent:plain00001");
  });

  test("a feed event belongs to nobody here", () => {
    expect(recordFor(store, "genshin:some-event:2026-09-01")).toBeUndefined();
  });

  test("an occurrence of a rule the reader has since deleted finds nothing", () => {
    expect(recordFor({}, "myevent:k3f9qa2m01#2026-09-15")).toBeUndefined();
  });
});
