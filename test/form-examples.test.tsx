import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stillNeededLine } from "../src/client/components/formParts.tsx";
import {
  TaskForm,
  taskDraftFrom,
  taskStillNeeded,
  withTaskTemplate,
  type TaskFields,
} from "../src/client/components/TaskForm.tsx";
import { TASK_TEMPLATES } from "../src/shared/templates.ts";

/**
 * The examples row and the "still needed" line (spec 2026-10-14-form-examples).
 *
 * Nothing in this suite can click, so what a tap does is proved on the pure
 * functions the forms call, and the markup tests only pin where the row shows.
 */

const noop = () => {};

const typed: TaskFields = {
  game: "zzz",
  title: "Ridu Weekly",
  unit: "week",
  weekday: 3,
  monthDay: "15",
  kind: "amount",
  required: "2",
  target: "1300",
  amountUnit: "points",
};

describe("the still-needed line", () => {
  test("reads as a sentence, and says nothing when nothing is missing", () => {
    expect(stillNeededLine(["a name"])).toBe("Still needed: a name.");
    expect(stillNeededLine(["a name", "a start date"])).toBe(
      "Still needed: a name and a start date.",
    );
    expect(stillNeededLine(["a name", "a start date", "an end date"])).toBe(
      "Still needed: a name, a start date and an end date.",
    );
    expect(stillNeededLine([])).toBeNull();
  });
});

describe("a task example", () => {
  const byId = (id: string) => TASK_TEMPLATES.find((t) => t.id === id)!;

  test("keeps everything the reader typed that is not the shape", () => {
    const after = withTaskTemplate(typed, byId("monthly-target"));
    expect(after.game).toBe("zzz");
    expect(after.title).toBe("Ridu Weekly");
    expect(after.target).toBe("1300");
    expect(after.weekday).toBe(3);
    expect(after.monthDay).toBe("15");
    expect(after.unit).toBe("month");
    expect(after.kind).toBe("amount");
  });

  test("a few days each week leaves the count for the reader, and Save says so", () => {
    const after = withTaskTemplate(typed, byId("few-days"));
    expect(after.required).toBe("");
    expect(taskStillNeeded(after)).toEqual(["how many days"]);
    expect(taskDraftFrom(after)).toBeNull();
  });

  test("every example, once named and given its figure, can be saved", () => {
    for (const t of TASK_TEMPLATES) {
      const blank = { ...typed, title: "", target: "", required: "" };
      const shaped = withTaskTemplate(blank, t);
      expect(taskStillNeeded(shaped)).toContain("a name");
      const filled = {
        ...shaped,
        title: "x",
        target: "100",
        required: shaped.required === "" ? "2" : shaped.required,
      };
      expect(taskStillNeeded(filled)).toEqual([]);
      expect(taskDraftFrom(filled)).not.toBeNull();
    }
  });
});

describe("what a task still needs", () => {
  test("names each gap in the order the form asks", () => {
    expect(taskStillNeeded({ ...typed, title: " " })).toEqual(["a name"]);
    expect(taskStillNeeded({ ...typed, unit: "month", monthDay: "" })).toEqual([
      "a day of the month",
    ]);
    expect(taskStillNeeded({ ...typed, kind: "days", required: "" })).toEqual(["how many days"]);
    expect(taskStillNeeded({ ...typed, kind: "days", required: "9" })).toEqual(["how many days"]);
    expect(taskStillNeeded({ ...typed, unit: "month", kind: "days", required: "9" })).toEqual([]);
    expect(taskStillNeeded({ ...typed, target: "" })).toEqual(["the target"]);
    expect(taskStillNeeded(typed)).toEqual([]);
  });
});

describe("the task form", () => {
  test("adding offers the examples, and names its field Name", () => {
    const html = renderToStaticMarkup(<TaskForm lanes={["zzz"]} onSave={noop} onCancel={noop} />);
    expect(html).toContain("Start from an example");
    for (const t of TASK_TEMPLATES) expect(html).toContain(t.label);
    expect(html).toContain("Name");
    // A fresh form has no name yet, and says so rather than greying Save out
    // in silence.
    expect(html).toContain("Still needed: a name.");
  });

  test("editing never shows the examples", () => {
    const html = renderToStaticMarkup(
      <TaskForm
        lanes={["zzz"]}
        initial={{
          game: "zzz",
          title: "Ridu Weekly",
          period: { unit: "week", startsOn: 1 },
          measure: { kind: "amount", target: 1300, unit: "points" },
        }}
        onSave={noop}
        onCancel={noop}
      />,
    );
    expect(html).not.toContain("Start from an example");
    expect(html).not.toContain("Still needed");
  });
});

import {
  EventForm,
  eventFormState,
  eventStillNeeded,
  withCadence,
  withEventTemplate,
  type EventFormValues,
  type EventShape,
} from "../src/client/components/CustomForms.tsx";
import { EVENT_TEMPLATES } from "../src/shared/templates.ts";

const blankEvent: EventFormValues = {
  game: "mygame:limbus-company",
  title: "",
  summary: "",
  type: "other",
  cadence: "one-off",
  repeatMode: "never",
  endKnown: true,
  ownCadence: false,
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  cadenceUnit: "weeks",
  cadenceAmount: "1",
};
const eventById = (id: string) => EVENT_TEMPLATES.find((t) => t.id === id)!;
const shaped = (v: EventFormValues, id: string): EventFormValues => ({
  ...v,
  ...withEventTemplate(v, eventById(id)),
});

describe("an event example", () => {
  test("sets the shape and nothing the reader typed", () => {
    const typedEvent = {
      ...blankEvent,
      title: "Walpurgisnacht",
      startDate: "2026-10-01",
      endDate: "2026-10-15",
      summary: "pull for her",
      ownCadence: true,
    };
    const after = shaped(typedEvent, "endgame-cycle");
    expect(after.title).toBe("Walpurgisnacht");
    expect(after.startDate).toBe("2026-10-01");
    expect(after.endDate).toBe("2026-10-15");
    expect(after.summary).toBe("pull for her");
    expect(after.type).toBe("challenge");
    expect(after.cadence).toBe("custom");
    expect(after.repeatMode).toBe("forever");
    // A cycle the reader stated by hand under another example is not theirs
    // to keep under this one: the measured reading is shown again.
    expect(after.ownCadence).toBe(false);
  });

  test("every example, once named and dated, can be saved", () => {
    for (const t of EVENT_TEMPLATES) {
      const v = {
        ...shaped(blankEvent, t.id),
        title: "x",
        startDate: "2026-10-01",
        endDate: "2026-10-15",
      };
      const state = eventFormState(v, null);
      expect({ id: t.id, needs: state.needs, valid: state.valid }).toEqual({
        id: t.id,
        needs: [],
        valid: true,
      });
      expect(state.draft).not.toBeNull();
    }
  });

  test("a fresh banner says what it still needs", () => {
    expect(eventFormState(shaped(blankEvent, "banner"), null).needs).toEqual([
      "a name",
      "a start date",
      "an end date",
    ]);
  });

  test("moving from a cycle to a banner leaves nothing repeating", () => {
    const dated = { ...blankEvent, title: "x", startDate: "2026-10-01", endDate: "2026-10-15" };
    const cycle = eventFormState(shaped(dated, "endgame-cycle"), null);
    expect(cycle.repeat).not.toBeNull();
    const banner = eventFormState(shaped(shaped(dated, "endgame-cycle"), "banner"), null);
    expect(banner.repeat).toBeNull();
    expect(banner.valid).toBe(true);
  });
});

describe("choosing how often", () => {
  const shape: EventShape = {
    type: "other",
    cadence: "one-off",
    repeatMode: "never",
    endKnown: true,
    ownCadence: false,
  };

  test("a cycle of its own never opens on 'doesn't repeat'", () => {
    expect(withCadence(shape, "custom").repeatMode).toBe("forever");
  });

  test("an answer the reader already gave is kept", () => {
    expect(withCadence({ ...shape, repeatMode: "delay" }, "custom").repeatMode).toBe("delay");
    expect(withCadence({ ...shape, cadence: "custom", repeatMode: "forever" }, "one-off")).toEqual({
      ...shape,
      repeatMode: "forever",
    });
  });
});

describe("what an event still needs", () => {
  const base = {
    title: "x",
    startDate: "2026-10-01",
    datedWindow: true,
    endKnown: true,
    endDate: "2026-10-15",
    delayNeedsEnd: false,
    needsCycle: false,
  };

  test("names each gap in the order the form asks", () => {
    expect(eventStillNeeded(base)).toEqual([]);
    expect(eventStillNeeded({ ...base, title: "  " })).toEqual(["a name"]);
    expect(eventStillNeeded({ ...base, startDate: "" })).toEqual(["a start date"]);
    expect(eventStillNeeded({ ...base, endDate: "" })).toEqual(["an end date"]);
    expect(eventStillNeeded({ ...base, endDate: "", endKnown: false })).toEqual([]);
    expect(eventStillNeeded({ ...base, endDate: "", datedWindow: false })).toEqual([]);
    expect(eventStillNeeded({ ...base, endKnown: false, delayNeedsEnd: true })).toEqual([
      "an end date",
    ]);
    expect(eventStillNeeded({ ...base, needsCycle: true })).toEqual(["a cycle length"]);
  });
});

describe("the event form", () => {
  const props = {
    lanes: ["mygame:limbus-company"],
    customGames: {},
    onSave: noop,
    onCancel: noop,
  };

  test("adding offers the examples, in plain words, and says what Save needs", () => {
    const html = renderToStaticMarkup(<EventForm {...props} />);
    expect(html).toContain("Start from an example");
    for (const t of EVENT_TEMPLATES) expect(html).toContain(t.label);
    expect(html).toContain("How often");
    for (const answer of ["Once", "Every day", "Every week", "Every month", "On its own cycle"]) {
      expect(html).toContain(`>${answer}</button>`);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>Once</);
    expect(html).toContain(">Login rewards</option>");
    expect(html).toContain("Name");
    expect(html).toContain("Still needed: a name, a start date and an end date.");
  });

  test("the name is asked before how often, and the kind after the dates", () => {
    const html = renderToStaticMarkup(<EventForm {...props} />);
    const at = (s: string) => html.indexOf(s);
    expect(at("Name")).toBeLessThan(at("How often"));
    expect(at("How often")).toBeLessThan(at("Starts"));
    expect(at("Starts")).toBeLessThan(at("Kind"));
    expect(at("Kind")).toBeLessThan(at("Note (optional)"));
  });
});

describe("review fixes: Save never sits disabled without a reason", () => {
  test("a task's needs are empty exactly when it would save", () => {
    const cases: TaskFields[] = [
      typed,
      { ...typed, target: "0" },
      { ...typed, target: "0.4" },
      { ...typed, target: "2000000000" },
      { ...typed, target: "" },
      { ...typed, title: "" },
      { ...typed, kind: "days", required: "" },
      { ...typed, kind: "days", required: "7" },
      { ...typed, kind: "days", required: "8" },
      { ...typed, unit: "month", kind: "days", required: "31" },
      { ...typed, unit: "month", monthDay: "" },
    ];
    for (const f of cases) {
      expect({ target: f.target, required: f.required, empty: taskStillNeeded(f).length === 0 })
        .toEqual({ target: f.target, required: f.required, empty: taskDraftFrom(f) !== null });
    }
    expect(taskStillNeeded({ ...typed, target: "0" })).toEqual(["a target of at least 1"]);
  });

  test("an emptied wait is asked for, not blamed on the times", () => {
    const v: EventFormValues = {
      ...blankEvent,
      title: "x",
      cadence: "custom",
      repeatMode: "delay",
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      cadenceAmount: "",
    };
    const s = eventFormState(v, null);
    expect(s.valid).toBe(false);
    expect(s.needs).toEqual(["a wait"]);
    expect(s.unstatableWait).toBe(false);
    const filled = eventFormState({ ...v, cadenceAmount: "1" }, null);
    expect(filled.valid).toBe(true);
    expect(filled.needs).toEqual([]);
  });
});
