import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The nine-member `LongtailForge.taskCalendar` surface, declared by `0.33.33.38.2.2.6.6.4`.
 *
 * The declaration states all nine published methods, not only the ones a consumer has been seen
 * to call. These tests drive the **shipped** helper: the file is evaluated as it ships against a
 * controlled global, and the frozen publication is what gets exercised.
 *
 * The date arithmetic is deliberately local-time - `addDays` and `parseDateKey` build
 * `new Date(year, monthIndex, day)` and `dateKeyOf` reads the local components back - so these
 * tests assert local behaviour rather than replacing it with UTC expectations.
 */

const source = readFileSync(new URL("../../public/js/shared/task-calendar.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/**
 * @typedef {{ [key: string]: unknown, attrs: Record<string, string>, children: FakeNode[],
 *   className: string, dataset: Record<string, string>, listeners: Array<() => void>,
 *   tag: string, text: string }} FakeNode
 */
/**
 * @typedef {{ attrs?: Record<string, string>, children?: FakeNode[],
 *   className?: string | string[], dataset?: Record<string, string>, text?: string }} FakeElementOptions
 */

/** A recording element with just enough surface for the renderer. */
function fakeElement(tag = "div") {
  /** @type {FakeNode} */
  const element = {
    attrs: /** @type {Record<string, string>} */ ({}),
    children: /** @type {FakeNode[]} */ ([]),
    className: "",
    dataset: /** @type {Record<string, string>} */ ({}),
    listeners: /** @type {Array<() => void>} */ ([]),
    tag,
    text: "",
  };
  element.addEventListener = (/** @type {string} */ _name, /** @type {() => void} */ handler) => {
    element.listeners.push(handler);
  };
  element.appendChild = (/** @type {FakeNode} */ child) => {
    element.children.push(child);
    return child;
  };
  element.append = (/** @type {FakeNode[]} */ ...nodes) => {
    element.children.push(...nodes);
  };
  element.replaceChildren = (/** @type {FakeNode[]} */ ...nodes) => {
    element.children = [...nodes];
  };
  element.setAttribute = (/** @type {string} */ name, /** @type {string} */ value) => {
    element.attrs[name] = value;
  };
  return element;
}

/** The `LongtailForge.view` factory the renderer builds through. */
function fakeViewFactory() {
  return {
    createElement(/** @type {string} */ tag, /** @type {FakeElementOptions} */ options = {}) {
      const element = fakeElement(tag);
      element.className = Array.isArray(options.className)
        ? options.className.filter(Boolean).join(" ")
        : (options.className || "");
      element.text = options.text || "";
      Object.assign(element.dataset, options.dataset || {});
      Object.assign(element.attrs, options.attrs || {});
      if (options.children) {
        element.children.push(...options.children);
      }
      return element;
    },
    createEmptyState(/** @type {Record<string, string>} */ options) {
      const element = fakeElement("empty-state");
      element.text = options.title;
      element.attrs = { message: options.message, title: options.title };
      return element;
    },
  };
}

/** Evaluate the shipped helper and hand back its frozen publication. */
function loadTaskCalendar(namespaceExtras = {}, globalExtras = {}) {
  /** @type {Record<string, unknown>} */
  const namespace = { view: fakeViewFactory(), ...namespaceExtras };
  const global = {
    LongtailForge: namespace,
    matchMedia: () => ({ matches: false }),
    ...globalExtras,
  };
  new Function("window", "fetch", source)(global, async () => ({ ok: true, status: 200, json: async () => ({}) }));
  return /** @type {Record<string, Function>} */ (namespace.taskCalendar);
}

/**
 * Walk a rendered tree and collect every element the predicate accepts.
 * @param {FakeNode} node @param {(node: FakeNode) => boolean} accept @param {FakeNode[]} [found]
 * @returns {FakeNode[]}
 */
function collect(node, accept, found = []) {
  if (!node || typeof node !== "object") {
    return found;
  }
  if (accept(node)) {
    found.push(node);
  }
  for (const child of node.children || []) {
    collect(child, accept, found);
  }
  return found;
}

const persistedRow = (overrides = {}) => ({
  allDay: false,
  client_name: "Acme",
  due_date: "2026-09-10",
  due_time: "09:00",
  endDate: "2026-09-10",
  id: "task-1",
  priority: "high",
  project_name: "Rollout",
  startDate: "2026-09-10",
  status: "open",
  task_id: "task-1",
  title: "Ship it",
  ...overrides,
});

const virtualRow = (overrides = {}) => ({
  allDay: true,
  client_name: "",
  due_date: "2026-09-10",
  due_time: "",
  endDate: "2026-09-10",
  id: "recurrence:template-9:2026-09-10",
  instanceDate: "2026-09-10",
  priority: "normal",
  project_name: "",
  startDate: "2026-09-10",
  status: "open",
  task_id: "",
  templateId: "template-9",
  title: "Weekly review",
  virtual: true,
  ...overrides,
});

const reminderMarker = (overrides = {}) => ({
  date: "2026-09-10",
  due_at_utc: "2026-09-18T13:00:00.000Z",
  due_kind: "date_time",
  offset_minutes: 60,
  reminder_at_utc: "2026-09-10T12:00:00.000Z",
  source: "workspace",
  task_id: "task-later",
  title: "Renewal",
  url: "tasks.html?task=task-later",
  ...overrides,
});

const emptyWindow = (overrides = {}) => ({
  range: { endDate: "2026-09-30", startDate: "2026-09-01" },
  reminders: [],
  source_enabled: true,
  tasks: [],
  ...overrides,
});

describe("the publication is exactly nine members and still frozen", () => {
  it("publishes the nine methods the declaration states", () => {
    const surface = loadTaskCalendar();
    assert.deepEqual(Object.keys(surface).sort(), [
      "addDays", "calendarRange", "dateKeyOf", "fetchCalendarWindow", "normalizeCalendarView",
      "parseDateKey", "readPreferredCalendarView", "renderCalendarBody", "resolveDefaultView",
    ]);
    assert.ok(Object.isFrozen(surface), "the surface stays frozen");
    for (const member of Object.keys(surface)) {
      assert.equal(typeof surface[member], "function", `${member} is a method`);
    }
  });
});

describe("calendarRange builds all three periods", () => {
  it("answers one day for the day branch, with no monthIndex", () => {
    const { calendarRange } = loadTaskCalendar();
    const range = calendarRange("day", new Date(2026, 8, 10));

    assert.deepEqual(range.days, ["2026-09-10"]);
    assert.equal(range.fetchStart, "2026-09-10");
    assert.equal(range.fetchEnd, "2026-09-10");
    assert.ok(range.label.includes("2026"), "the day branch labels the full date");
    assert.equal("monthIndex" in range, false, "only the month branch carries monthIndex");
  });

  it("answers the anchor's Sunday-to-Saturday week, with no monthIndex", () => {
    const { calendarRange } = loadTaskCalendar();
    const range = calendarRange("week", new Date(2026, 8, 10));

    assert.equal(range.days.length, 7);
    assert.equal(range.days[0], "2026-09-06", "the week starts on the anchor's Sunday");
    assert.equal(range.days[6], "2026-09-12");
    assert.equal(range.fetchStart, range.days[0]);
    assert.equal(range.fetchEnd, range.days[6]);
    assert.ok(range.label.startsWith("Week of "));
    assert.equal("monthIndex" in range, false);
  });

  it("answers the whole weeks covering the month, and only this branch sets monthIndex", () => {
    const { calendarRange } = loadTaskCalendar();
    const range = calendarRange("month", new Date(2026, 8, 10));

    assert.equal(range.monthIndex, 8, "September is month index 8");
    assert.equal(range.days.length % 7, 0, "the grid is whole weeks");
    assert.ok(range.days.includes("2026-09-01") && range.days.includes("2026-09-30"));
    assert.ok(range.days[0] < "2026-09-01", "the grid starts before the month");
    assert.ok(range.days[range.days.length - 1] > "2026-09-30", "and ends after it");
    assert.ok(range.label.includes("2026"));
  });

  it("falls into the month branch for an unrecognised view", () => {
    const { calendarRange } = loadTaskCalendar();
    const range = calendarRange("fortnight", new Date(2026, 8, 10));
    assert.equal(range.monthIndex, 8, "an unknown id draws a month rather than failing");
  });

  it("crosses a year boundary in both directions", () => {
    const { calendarRange } = loadTaskCalendar();
    const december = calendarRange("month", new Date(2026, 11, 15));
    const january = calendarRange("month", new Date(2027, 0, 15));

    assert.equal(december.monthIndex, 11);
    assert.ok(december.days.some((/** @type {string} */ day) => day.startsWith("2027-01")),
      "December's grid reaches into January");
    assert.equal(january.monthIndex, 0);
    assert.ok(january.days.some((/** @type {string} */ day) => day.startsWith("2026-12")),
      "January's grid reaches back into December");
    assert.equal(january.days.length % 7, 0);
  });
});

describe("the local-time date arithmetic this surface is built on", () => {
  it("keys a date by its local calendar day", () => {
    const { dateKeyOf } = loadTaskCalendar();
    assert.equal(dateKeyOf(new Date(2026, 0, 5)), "2026-01-05", "month and day are zero-padded");
    assert.equal(dateKeyOf(new Date(2026, 11, 31, 23, 59)), "2026-12-31",
      "a late local hour still keys to its own day");
  });

  it("shifts by whole local days, forwards and backwards, across a month end", () => {
    const { addDays, dateKeyOf } = loadTaskCalendar();
    assert.equal(dateKeyOf(addDays(new Date(2026, 8, 30), 1)), "2026-10-01");
    assert.equal(dateKeyOf(addDays(new Date(2026, 0, 1), -1)), "2025-12-31");
    assert.equal(addDays(new Date(2026, 8, 10, 14, 30), 0).getHours(), 0,
      "the result is local midnight, not an offset of the original instant");
  });

  it("round-trips a day key through parseDateKey and back", () => {
    const { dateKeyOf, parseDateKey } = loadTaskCalendar();
    assert.equal(dateKeyOf(parseDateKey("2026-09-10")), "2026-09-10");
    assert.equal(parseDateKey("2026-09-10").getMonth(), 8, "the key's month is zero-based on the Date");
  });

  it("coerces rather than validates, which is what the Calendar page relies on", () => {
    // `calendar.js` tests `Number.isFinite(anchor.getTime())` after calling this. A nullable
    // return would describe a producer that does not exist.
    const { parseDateKey } = loadTaskCalendar();
    assert.ok(parseDateKey("not-a-date") instanceof Date);
    assert.equal(Number.isFinite(parseDateKey("not-a-date").getTime()), false,
      "an unreadable key yields an invalid Date, not null");
    assert.equal(parseDateKey("2026").getMonth(), 0, "a missing month defaults to January");
    assert.equal(parseDateKey("2026").getDate(), 1, "a missing day defaults to the first");
  });
});

describe("view selection", () => {
  it("normalizes only the three known ids", () => {
    const { normalizeCalendarView } = loadTaskCalendar();
    assert.equal(normalizeCalendarView("day"), "day");
    assert.equal(normalizeCalendarView("week"), "week");
    assert.equal(normalizeCalendarView("month"), "month");
    for (const value of ["fortnight", "", null, undefined, 3, {}]) {
      assert.equal(normalizeCalendarView(value), null, `${String(value)} is not a view`);
    }
  });

  it("returns the stored preference through the same normalization", () => {
    assert.equal(loadTaskCalendar({ userPreferences: { preferredCalendarView: "week" } })
      .readPreferredCalendarView(), "week");
    assert.equal(loadTaskCalendar({ userPreferences: { preferredCalendarView: "fortnight" } })
      .readPreferredCalendarView(), null, "an unrecognised stored value never escapes");
    assert.equal(loadTaskCalendar().readPreferredCalendarView(), null, "no preference is null");
  });

  it("prefers a valid saved view over the device default", () => {
    const surface = loadTaskCalendar({}, { matchMedia: () => ({ matches: true }) });
    assert.equal(surface.resolveDefaultView("week"), "week", "the user's choice wins on mobile too");
  });

  it("falls back to the device default, and honours the two-argument override", () => {
    const mobile = loadTaskCalendar({}, { matchMedia: () => ({ matches: true }) });
    const desktop = loadTaskCalendar({}, { matchMedia: () => ({ matches: false }) });

    assert.equal(mobile.resolveDefaultView(null), "day", "a narrow viewport opens on the day view");
    assert.equal(desktop.resolveDefaultView(null), "month");
    assert.equal(desktop.resolveDefaultView(null, { isMobile: true }), "day",
      "the second argument overrides the media query");
    assert.equal(mobile.resolveDefaultView(null, { isMobile: false }), "month");
    assert.equal(mobile.resolveDefaultView(null, {}), "day",
      "a non-boolean isMobile falls through to the media query rather than to false");
  });
});

describe("renderCalendarBody", () => {
  it("answers false and draws nothing when the target is absent", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const range = calendarRange("day", new Date(2026, 8, 10));
    assert.equal(renderCalendarBody(null, { data: emptyWindow(), range, viewId: "day" }), false);
  });

  it("answers false when the view factory is unpublished, without touching the target", () => {
    const surface = loadTaskCalendar({ view: undefined });
    const target = fakeElement();
    const range = surface.calendarRange("day", new Date(2026, 8, 10));

    assert.equal(surface.renderCalendarBody(target, { data: emptyWindow(), range, viewId: "day" }), false);
    assert.deepEqual(target.children, [], "nothing is drawn at all");
  });

  it("answers false and renders an empty state for a valid but empty window", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("month", new Date(2026, 8, 10));

    assert.equal(renderCalendarBody(target, { data: emptyWindow(), range, viewId: "month" }), false,
      "false here means the period drew successfully with nothing in it");
    assert.equal(collect(target, (node) => node.tag === "empty-state").length, 1);
  });

  it("answers true and draws the entries when the window has rows", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("month", new Date(2026, 8, 10));
    const data = emptyWindow({ tasks: [persistedRow()] });

    assert.equal(renderCalendarBody(target, { data, range, viewId: "month" }), true);
    assert.equal(collect(target, (node) => node.tag === "empty-state").length, 0);
    assert.equal(collect(target, (node) => node.dataset?.calendarEntry === "task-1").length, 1);
  });

  it("opens a persisted task with its id, the trigger, and no occurrence", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("day", new Date(2026, 8, 10));
    /** @type {unknown[][]} */
    const opened = [];

    renderCalendarBody(target, {
      data: emptyWindow({ tasks: [persistedRow()] }),
      onOpenTask: (/** @type {unknown[]} */ ...args) => opened.push(args),
      range,
      viewId: "day",
    });
    const [entry] = collect(target, (node) => node.dataset?.calendarEntry === "task-1");
    entry.listeners[0]();

    assert.equal(opened.length, 1);
    assert.equal(opened[0][0], "task-1");
    assert.equal(opened[0][1], entry, "the trigger is the button, so return focus still works");
    assert.equal(opened[0][2], null, "a saved task carries no recurrence identity");
    assert.equal(entry.dataset.virtual, "false");
  });

  it("opens a virtual occurrence with its recurrence identity and an empty task id", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("day", new Date(2026, 8, 10));
    /** @type {unknown[][]} */
    const opened = [];

    renderCalendarBody(target, {
      data: emptyWindow({ tasks: [virtualRow()] }),
      onOpenTask: (/** @type {unknown[]} */ ...args) => opened.push(args),
      range,
      viewId: "day",
    });
    const [entry] = collect(target, (node) => node.dataset?.virtual === "true");
    entry.listeners[0]();

    assert.equal(entry.dataset.calendarEntry, "recurrence:template-9:2026-09-10",
      "a projected occurrence is keyed by its composed id, not by an empty task id");
    assert.equal(opened[0][0], "", "the occurrence has no saved task");
    assert.deepEqual(opened[0][2], {
      instanceDate: "2026-09-10",
      templateId: "template-9",
      virtual: true,
    });
  });

  it("opens a reminder with its task id and the row, and no third argument", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("day", new Date(2026, 8, 10));
    /** @type {unknown[][]} */
    const opened = [];

    renderCalendarBody(target, {
      data: emptyWindow({ reminders: [reminderMarker()] }),
      onOpenTask: (/** @type {unknown[]} */ ...args) => opened.push(args),
      range,
      viewId: "day",
    });
    const [row] = collect(target, (node) => node.dataset?.calendarReminder === "task-later");
    row.listeners[0]();

    assert.equal(opened[0][0], "task-later");
    assert.equal(opened[0][1], row);
    assert.equal(opened[0].length, 2, "the reminder row sends no occurrence at all");
  });

  it("dims the days outside the month only when a monthIndex is present", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const monthTarget = fakeElement();
    const weekTarget = fakeElement();
    const anchor = new Date(2026, 8, 10);

    renderCalendarBody(monthTarget, { data: emptyWindow(), range: calendarRange("month", anchor), viewId: "month" });
    renderCalendarBody(weekTarget, { data: emptyWindow(), range: calendarRange("week", anchor), viewId: "week" });

    assert.ok(collect(monthTarget, (node) => String(node.className).includes("is-outside")).length > 0,
      "the month grid marks the days either side");
    assert.equal(collect(weekTarget, (node) => String(node.className).includes("is-outside")).length, 0,
      "the week grid has no month to be outside of");
  });

  it("survives a window with neither key present", () => {
    const { calendarRange, renderCalendarBody } = loadTaskCalendar();
    const target = fakeElement();
    const range = calendarRange("day", new Date(2026, 8, 10));
    assert.equal(renderCalendarBody(target, { data: null, range, viewId: "day" }), false);
  });
});

describe("the consumers this surface is declared for", () => {
  const calendarPage = readFileSync(new URL("../../public/js/calendar.js", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n");
  const dashboard = readFileSync(new URL("../../public/js/tasks-dashboard.js", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n");

  it("keeps the Dashboard's no-panel path when the helper is unpublished", () => {
    assert.match(dashboard,
      /const optionalTaskCalendar = window\.LongtailForge\?\.taskCalendar;\s*\n\s*\n\s*if \(!optionalTaskCalendar\) \{\s*\n\s*return null;/,
      "the Dashboard contributes no panel rather than throwing");
  });

  it("keeps the Calendar page's optional reads optional at each entry point", () => {
    for (const opener of ["applyCalendarQueryParams", "initializeCalendar", "loadCalendarWindow"]) {
      const at = calendarPage.indexOf("function " + opener);
      assert.notEqual(at, -1, opener + " must exist");
      const body = calendarPage.slice(at, calendarPage.indexOf("\n  }\n", at));
      assert.match(body, /!taskCalendar/, opener + " keeps its own absence check");
    }
  });

  it("keeps shiftCalendarPeriod's month branch working without the helper", () => {
    // The month branch never touched the surface and still does not; the other two dereferenced
    // it and threw, and they still fail there rather than silently doing nothing.
    const at = calendarPage.indexOf("function shiftCalendarPeriod");
    const body = calendarPage.slice(at, calendarPage.indexOf("\n  }\n", at));
    assert.match(body, /if \(calendarState\.view === "month"\) \{[\s\S]*new Date\(anchor\.getFullYear\(\)/);
    assert.match(body, /requireTaskCalendar\(\)/, "the non-month branches acquire it checked");
    assert.ok(body.indexOf("new Date(anchor.getFullYear()") < body.indexOf("requireTaskCalendar()"),
      "the month branch runs before anything requires the surface");
  });

  it("acquires nothing before the lazy Dashboard bridge has loaded", () => {
    assert.ok(!/taskCalendar/.test(dashboard.slice(0, dashboard.indexOf("function renderTasksCalendarContribution"))),
      "the surface is read inside the contribution, not at module scope");
  });

  it("keeps the Dashboard's hydration token, so an older request cannot replace a newer view", () => {
    const at = dashboard.indexOf("async function hydrate()");
    const body = dashboard.slice(at, dashboard.indexOf("\n  }\n", at));
    assert.match(body, /const token = \+\+hydrateToken;/);
    assert.equal((body.match(/if \(token !== hydrateToken\) \{/g) || []).length, 2,
      "both the success and the failure path check the token");
  });
});
