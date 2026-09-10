import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-entries.js");

const LIFTED = [
  "findTimeEntryControl", "requireTimeEntryValue",
  "isTimeEntryRecord", "isTimeEntryRow", "readTimeEntryCollection", "readTimeEntryRows",
  "normalizeEntryBillable",
  "isTagWithIdentity", "getSelectedUserIds", "matchesStatusFilter", "isEntryInRange",
  "getSelectedDateRange", "getCustomDateRange", "parseDateInput", "addDateInputDays",
  "compareEntries", "getFilteredEntries", "setDefaultCustomDates", "updateFilterDateState",
  "noTagsFilterValue",
];

const CONTROLS = [
  ["filterClientSelect", "[data-time-entry-filter-client]", "select"],
  ["filterProjectSelect", "[data-time-entry-filter-project]", "select"],
  ["filterStatusSelect", "[data-time-entry-filter-status]", "select"],
  ["filterPeriodSelect", "[data-time-entry-filter-period]", "select"],
  ["filterCustomDates", "[data-time-entry-filter-custom-dates]", "div"],
  ["filterStartDateInput", "[data-time-entry-filter-start-date]", "input"],
  ["filterEndDateInput", "[data-time-entry-filter-end-date]", "input"],
  ["filterUsersSelect", "[data-time-entry-filter-users]", "select"],
  ["filterTagSelect", "[data-time-entry-filter-tag]", "select"],
  ["sortSelect", "[data-time-entry-sort]", "select"],
];

/**
 * Values built inside the sandbox carry that realm's prototypes, so a structural comparison has
 * to be normalized first. This is only about identity - every asserted value is the real one.
 * @param {unknown} value
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {unknown} value */
const isDate = (value) => Object.prototype.toString.call(value) === "[object Date]";

/** @param {{ entryId: string }[]} rows */
const entryIds = (rows) => rows.map((entry) => entry.entryId);

/**
 * The rows a body could be read as. `0.33.33.44.14` split the reader in two - what was read,
 * and how much was refused - so the cases that only care about the rows say so here.
 * @typedef {{ billable: string, clientId: string, clientName: string, description: string,
 *   durationSeconds: number, endTime: Date, entryId: string, invoiceStatus: string,
 *   projectId: string, projectName: string, startTime: Date, tags: unknown[],
 *   userId: string }} LiftedTimeEntry
 *
 * @param {{ readTimeEntryCollection: (body: unknown) => { entries: LiftedTimeEntry[], refused: number } }} api
 * @param {unknown} body
 * @returns {LiftedTimeEntry[]}
 */
const readEntries = (api, body) => api.readTimeEntryCollection(body).entries;

/** @param {string} source_ @param {string} name */
function constant(source_, name) {
  const match = source_.match(new RegExp(`const ${name} = [\\s\\S]*?;`));
  assert.ok(match, name);
  return match[0];
}

/**
 * A row the server's `normalizeTimeEntry` would have produced: every one of the ten
 * columns present as text, which is what the page's own check requires.
 * @param {Record<string, unknown>} [overrides]
 */
function wireRow(overrides = {}) {
  return {
    entry_id: "entry-1", user_id: "user-1", client_id: "client-1", client_name: "Client One",
    project_id: "project-1", project_name: "Project One", description: "Wrote things",
    start_time: "2026-03-02T09:00:00.000Z", end_time: "2026-03-02T10:00:00.000Z",
    invoice_status: "unbilled", duration_seconds: "3600", billable: "yes", tags: [],
    ...overrides,
  };
}

/** @param {{ omit?: string[] }} [options] */
function filteringCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  const context = vm.createContext({
    document,
    window: { LongtailForge: { tags: { NO_TAGS_FILTER_VALUE: "__no_tags__" } } },
    ...fakeDomConstructors(),
    timeEntries: [],
    timeEntryClients: [],
    timeEntrySettings: { billingPeriod: { type: "calendarMonth", startDay: 1 } },
    // Collaborators outside this boundary. Each records its call so the delegation itself is
    // the assertion, rather than a second implementation of it.
    getBillingPeriodRange: (/** @type {unknown} */ period, /** @type {unknown} */ mode) => {
      events.push(["billing-period", period, mode]);
      return { start: new Date("2026-03-01T00:00:00.000Z"), end: new Date("2026-04-01T00:00:00.000Z") };
    },
    getEffectiveEntryBillable: (/** @type {{ billable: string }} */ entry) => entry.billable,
    getClient: (/** @type {string} */ id) => (id ? { id } : null),
    getProject: (/** @type {string} */ clientId, /** @type {string} */ id) => (id ? { clientId, id } : null),
    matchesClient: (/** @type {{ clientId: string }} */ entry, /** @type {{ id: string } | null} */ client) =>
      Boolean(client) && entry.clientId === client?.id,
    matchesProject: (/** @type {{ projectId: string }} */ entry, /** @type {{ id: string } | null} */ project) =>
      Boolean(project) && entry.projectId === project?.id,
    requireTimezones: () => ({
      // The page's own date parsing is lifted; only the timezone crossing is stubbed, and it is
      // stubbed as the identity the tests can predict rather than as a second implementation.
      zonedDateTimeToUtcIso: (/** @type {string} */ value, /** @type {string} */ time) =>
        `${value}T${time}.000Z`,
    }),
    formatDateInput: (/** @type {Date} */ date) => date.toISOString().slice(0, 10),
  });

  vm.runInContext(constant(source, "TIME_ENTRY_TEXT_COLUMNS"), context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, tag] of CONTROLS) {
    const constructor = tag === "select" ? "HTMLSelectElement" : tag === "input" ? "HTMLInputElement" : "HTMLElement";
    vm.runInContext(`var ${name} = findTimeEntryControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  return { api, context, document, events, control };
}

/**
 * Set control values through the same lookup the page uses.
 * @param {Pick<ReturnType<typeof filteringCase>, "control">} testCase
 * @param {Record<string, string>} values
 */
function setFilters(testCase, values) {
  for (const [selector, value] of Object.entries(values)) {
    const element = testCase.control(selector);
    assert.ok(element, selector);
    element.value = value;
  }
}

describe("Time Entries filtering, date ranges and ordering", () => {
  it("keeps a row the server guarantees and establishes every declared member by running the check", () => {
    const { api } = filteringCase();
    const [entry] = readEntries(api, { entries: [wireRow()] });

    assert.equal(entry.entryId, "entry-1");
    assert.equal(entry.userId, "user-1");
    assert.equal(entry.clientId, "client-1");
    assert.equal(entry.projectId, "project-1");
    assert.equal(entry.projectName, "Project One");
    assert.equal(entry.description, "Wrote things");
    assert.equal(entry.invoiceStatus, "unbilled");
    // Established, not declared: the wire carries text and the page holds numbers and dates.
    assert.equal(entry.durationSeconds, 3600);
    assert.ok(isDate(entry.startTime));
    assert.ok(isDate(entry.endTime));
    assert.equal(entry.startTime.toISOString(), "2026-03-02T09:00:00.000Z");
    assert.equal(entry.endTime.toISOString(), "2026-03-02T10:00:00.000Z");
    assert.equal(entry.tags.length, 0);
  });

  it("refuses a row for every one of the ten columns, so none of the list is decorative", () => {
    const { api, context } = filteringCase();
    const columns = vm.runInContext("TIME_ENTRY_TEXT_COLUMNS", context);

    assert.equal(columns.length, 10);
    for (const column of columns) {
      assert.equal(
        readEntries(api, { entries: [wireRow({ [column]: 42 })] }).length, 0,
        `a non-string ${column} must not reach the page`,
      );
      assert.equal(
        readEntries(api, { entries: [wireRow({ [column]: undefined })] }).length, 0,
        `a missing ${column} must not reach the page`,
      );
      // And the refusal is counted, which is what stops the loader calling a short read whole.
      assert.equal(api.readTimeEntryCollection({ entries: [wireRow({ [column]: 42 })] }).refused, 1);
    }
  });

  it("leaves duration, billable and tags out of the text check because each has its own", () => {
    const { api } = filteringCase();

    // A numeric duration is not a text column and must still be admitted, then converted.
    const [numericDuration] = readEntries(api, { entries: [wireRow({ duration_seconds: 90 })] });
    assert.equal(numericDuration.durationSeconds, 90);
    const [unreadableDuration] = readEntries(api, { entries: [wireRow({ duration_seconds: "x" })] });
    assert.equal(unreadableDuration.durationSeconds, 0);

    assert.equal(readEntries(api, { entries: [wireRow({ billable: true })] })[0].billable, "yes");
    assert.equal(readEntries(api, { entries: [wireRow({ billable: false })] })[0].billable, "no");
    assert.equal(readEntries(api, { entries: [wireRow({ billable: "maybe" })] })[0].billable, "");

    // An empty status is text, so it passes the column check and then takes the default.
    assert.equal(readEntries(api, { entries: [wireRow({ invoice_status: "" })] })[0].invoiceStatus, "unbilled");
    assert.equal(readEntries(api, { entries: [wireRow({ invoice_status: "invoiced" })] })[0].invoiceStatus, "invoiced");

    assert.equal(readEntries(api, { entries: [wireRow({ tags: "nope" })] })[0].tags.length, 0);
    assert.deepEqual(plain(readEntries(api, { entries: [wireRow({ tags: [{ tag_id: "t1" }] })] })[0].tags), [{ tag_id: "t1" }]);
  });

  it("refuses an envelope it cannot read, and keeps that distinct from an empty one", () => {
    const { api } = filteringCase();

    // `0.33.33.44.15`: a body carrying no `entries` array made no claim about the workspace, so
    // it is refused outright rather than reported as a read that found nothing.
    for (const body of [null, undefined, 42, "entries", [], {}, { entries: null }, { entries: "no" }, { rows: [] }]) {
      assert.equal(api.readTimeEntryCollection(body), null, `body ${JSON.stringify(body ?? null)}`);
    }

    // An empty array is a real answer and is read as one, with nothing refused.
    const empty = api.readTimeEntryCollection({ entries: [] });
    assert.equal(empty.entries.length, 0);
    assert.equal(empty.refused, 0);
  });

  it("orders by end time through the same numbers the subtraction produced", () => {
    const { api, control } = filteringCase();
    const early = { endTime: new Date("2026-03-01T00:00:00.000Z"), durationSeconds: 60, projectName: "B" };
    const late = { endTime: new Date("2026-03-09T00:00:00.000Z"), durationSeconds: 30, projectName: "A" };

    setFilters({ control }, { "[data-time-entry-sort]": "end_asc" });
    assert.equal(api.compareEntries(early, late), early.endTime.getTime() - late.endTime.getTime());
    assert.ok(api.compareEntries(early, late) < 0);

    setFilters({ control }, { "[data-time-entry-sort]": "end_desc" });
    assert.ok(api.compareEntries(early, late) > 0);

    // The default arm is the descending one, which is what an unknown mode must fall back to.
    setFilters({ control }, { "[data-time-entry-sort]": "not-a-mode" });
    assert.equal(api.compareEntries(early, late), late.endTime.getTime() - early.endTime.getTime());

    setFilters({ control }, { "[data-time-entry-sort]": "duration_desc" });
    assert.ok(api.compareEntries(early, late) < 0);
    setFilters({ control }, { "[data-time-entry-sort]": "duration_asc" });
    assert.ok(api.compareEntries(early, late) > 0);
    setFilters({ control }, { "[data-time-entry-sort]": "project_asc" });
    assert.ok(api.compareEntries(early, late) > 0);
    // Base sensitivity is the whole point: these two names are the same name.
    assert.equal(api.compareEntries({ projectName: "a" }, { projectName: "A" }), 0);
    assert.ok(api.compareEntries({ projectName: "apple" }, { projectName: "Banana" }) < 0);
  });

  it("reads the three date-range answers and refuses every row for an invalid one", () => {
    const testCase = filteringCase();
    const { api, events } = testCase;

    setFilters(testCase, { "[data-time-entry-filter-period]": "all" });
    assert.equal(api.getSelectedDateRange(), null);

    for (const mode of ["current", "last"]) {
      setFilters(testCase, { "[data-time-entry-filter-period]": mode });
      api.getSelectedDateRange();
      assert.deepEqual(plain(events.at(-1)), ["billing-period", { type: "calendarMonth", startDay: 1 }, mode]);
    }

    setFilters(testCase, {
      "[data-time-entry-filter-period]": "custom",
      "[data-time-entry-filter-start-date]": "2026-03-01",
      "[data-time-entry-filter-end-date]": "2026-03-31",
    });
    const window_ = api.getSelectedDateRange();
    assert.equal(window_.start.toISOString(), "2026-03-01T00:00:00.000Z");
    // The end is exclusive: the day after the one typed, so the last day is inside the range.
    assert.equal(window_.end.toISOString(), "2026-04-01T00:00:00.000Z");
    assert.equal(window_.invalid, undefined);

    const lastDay = { endTime: new Date("2026-03-31T23:00:00.000Z") };
    assert.equal(api.isEntryInRange(lastDay, window_), true);
    // The start is inclusive and the end is not; both edges are asserted so neither can slide.
    assert.equal(api.isEntryInRange({ endTime: new Date("2026-03-01T00:00:00.000Z") }, window_), true);
    assert.equal(api.isEntryInRange({ endTime: new Date("2026-02-28T23:59:59.999Z") }, window_), false);
    assert.equal(api.isEntryInRange({ endTime: new Date("2026-04-01T00:00:00.000Z") }, window_), false);

    setFilters(testCase, { "[data-time-entry-filter-start-date]": "2026-03-31", "[data-time-entry-filter-end-date]": "2026-03-01" });
    assert.deepEqual(plain(api.getSelectedDateRange()), { invalid: true });
    // An invalid range shows nothing rather than everything.
    assert.equal(api.isEntryInRange(lastDay, { invalid: true }), false);
    assert.equal(api.isEntryInRange(lastDay, null), true);
    assert.equal(api.isEntryInRange({ endTime: new Date("nope") }, window_), false);

    setFilters(testCase, { "[data-time-entry-filter-start-date]": "", "[data-time-entry-filter-end-date]": "2026-03-31" });
    assert.deepEqual(plain(api.getSelectedDateRange()), { invalid: true });
  });

  it("ignores invoice status for an entry that is not billable and applies it when it is", () => {
    const testCase = filteringCase();
    const { api } = testCase;
    const billable = { billable: "yes", invoiceStatus: "invoiced" };
    const nonBillable = { billable: "no", invoiceStatus: "invoiced" };

    setFilters(testCase, { "[data-time-entry-filter-status]": "" });
    assert.equal(api.matchesStatusFilter(billable), true);
    assert.equal(api.matchesStatusFilter(nonBillable), true);

    setFilters(testCase, { "[data-time-entry-filter-status]": "invoiced" });
    assert.equal(api.matchesStatusFilter(billable), true);
    // A non-billable entry has no invoice status to match, so any chosen status excludes it.
    assert.equal(api.matchesStatusFilter(nonBillable), false);

    setFilters(testCase, { "[data-time-entry-filter-status]": "unbilled" });
    assert.equal(api.matchesStatusFilter(billable), false);
  });

  it("matches a tag only through an element carrying a string identity", () => {
    const { api } = filteringCase();

    assert.equal(api.isTagWithIdentity({ tag_id: "t1" }), true);
    assert.equal(api.isTagWithIdentity({ tag_id: 7 }), false);
    assert.equal(api.isTagWithIdentity(null), false);
    assert.equal(api.isTagWithIdentity(["t1"]), false);
    assert.equal(api.isTagWithIdentity("t1"), false);
  });

  it("survives a tag list the body never established, because only the array was checked", () => {
    const testCase = filteringCase();
    const { api, context } = testCase;
    // `tags` is `unknown[]`: the array was checked and its elements never were. A reader that
    // takes `tag_id` off these without narrowing throws on the first one.
    context.timeEntries = readEntries(api, {
      entries: [
        wireRow({ entry_id: "a", tags: [null, "t1", 7, { tag_id: 9 }] }),
        wireRow({ entry_id: "b", tags: [{ tag_id: "t1" }] }),
      ],
    });
    setFilters(testCase, {
      "[data-time-entry-filter-period]": "all", "[data-time-entry-filter-status]": "",
      "[data-time-entry-filter-client]": "", "[data-time-entry-filter-project]": "",
      "[data-time-entry-filter-tag]": "t1", "[data-time-entry-sort]": "end_asc",
    });

    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["b"]);
  });

  it("runs every filter together over the real rows", () => {
    const testCase = filteringCase();
    const { api, context } = testCase;
    context.timeEntries = readEntries(api, {
      entries: [
        wireRow({ entry_id: "a", user_id: "u1", client_id: "c1", project_id: "p1", end_time: "2026-03-02T10:00:00.000Z", tags: [{ tag_id: "t1" }] }),
        wireRow({ entry_id: "b", user_id: "u2", client_id: "c1", project_id: "p1", end_time: "2026-03-03T10:00:00.000Z", tags: [] }),
        wireRow({ entry_id: "c", user_id: "u1", client_id: "c2", project_id: "p2", end_time: "2026-03-04T10:00:00.000Z", tags: [{ tag_id: "t2" }] }),
      ],
    });

    setFilters(testCase, {
      "[data-time-entry-filter-period]": "all", "[data-time-entry-filter-status]": "",
      "[data-time-entry-filter-client]": "", "[data-time-entry-filter-project]": "",
      "[data-time-entry-filter-tag]": "", "[data-time-entry-sort]": "end_asc",
    });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["a", "b", "c"]);

    setFilters(testCase, { "[data-time-entry-sort]": "end_desc" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["c", "b", "a"]);

    setFilters(testCase, { "[data-time-entry-filter-tag]": "t1", "[data-time-entry-sort]": "end_asc" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["a"]);

    setFilters(testCase, { "[data-time-entry-filter-tag]": "__no_tags__" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["b"]);

    setFilters(testCase, { "[data-time-entry-filter-tag]": "__no_effective_tags__" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["b"]);

    setFilters(testCase, { "[data-time-entry-filter-tag]": "", "[data-time-entry-filter-client]": "c2" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["c"]);

    setFilters(testCase, { "[data-time-entry-filter-client]": "c1", "[data-time-entry-filter-project]": "p1" });
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["a", "b"]);
  });

  it("filters to the selected users through the select's own selection", () => {
    const testCase = filteringCase();
    const { api, context, document, control } = testCase;
    context.timeEntries = readEntries(api, {
      entries: [wireRow({ entry_id: "a", user_id: "u1" }), wireRow({ entry_id: "b", user_id: "u2" })],
    });
    setFilters(testCase, {
      "[data-time-entry-filter-period]": "all", "[data-time-entry-filter-status]": "",
      "[data-time-entry-filter-client]": "", "[data-time-entry-filter-project]": "",
      "[data-time-entry-filter-tag]": "", "[data-time-entry-sort]": "end_asc",
    });

    // No selection is "every user", which is why the empty list cannot mean "none".
    assert.deepEqual(plain(api.getSelectedUserIds()), []);
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["a", "b"]);

    const usersSelect = control("[data-time-entry-filter-users]");
    for (const [value, selected] of /** @type {[string, boolean][]} */ ([["u1", false], ["u2", true]])) {
      const option = document.createElement("option");
      option.value = value;
      option.selected = selected;
      usersSelect.appendChild(option);
    }

    // Both users are offered and only one is chosen, so reading every option is a different answer.
    assert.equal(usersSelect.options.length, 2);
    assert.deepEqual(plain(api.getSelectedUserIds()), ["u2"]);
    assert.deepEqual(plain(entryIds(api.getFilteredEntries())), ["b"]);
  });

  it("moves the custom date fields and their inputs together", () => {
    const testCase = filteringCase();
    const { api, control } = testCase;

    setFilters(testCase, { "[data-time-entry-filter-period]": "custom" });
    api.updateFilterDateState();
    assert.equal(control("[data-time-entry-filter-custom-dates]").hidden, false);
    assert.equal(control("[data-time-entry-filter-start-date]").disabled, false);
    assert.equal(control("[data-time-entry-filter-end-date]").disabled, false);

    setFilters(testCase, { "[data-time-entry-filter-period]": "all" });
    api.updateFilterDateState();
    assert.equal(control("[data-time-entry-filter-custom-dates]").hidden, true);
    assert.equal(control("[data-time-entry-filter-start-date]").disabled, true);
    assert.equal(control("[data-time-entry-filter-end-date]").disabled, true);
  });

  it("seeds the custom dates from the start of the current month to today", () => {
    const { api, control } = filteringCase();
    api.setDefaultCustomDates();

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    assert.equal(control("[data-time-entry-filter-start-date]").value, monthStart.toISOString().slice(0, 10));
    assert.equal(control("[data-time-entry-filter-end-date]").value, today.toISOString().slice(0, 10));
  });

  it("acquires every filter control through the checked lookup, at the markup's own subtype", () => {
    // The lifted cases build their controls the way the page does, so they cannot see the
    // declarations themselves. This is that half of the claim: the acquisition is the fact.
    /** @type {Record<string, string>} */
    const constructors = { select: "HTMLSelectElement", input: "HTMLInputElement", div: "HTMLElement" };
    for (const [name, selector, tag] of CONTROLS) {
      const expected = `const ${name} = findTimeEntryControl("${selector}", ${constructors[tag]});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
      assert.equal(
        source.includes(`const ${name} = document.querySelector`), false,
        `${name} must not go back to an unchecked query`,
      );
    }
  });

  it("reaches its diagnostics with no cast and no suppression", () => {
    assert.equal(/\/\*\* @type \{[^}]*\} \*\/ \(/.test(source), false, "no cast may stand in for a check");
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("keeps one record predicate rather than a rival beside it", () => {
    // This checkpoint found the page already carried this exact check under a caller-specific
    // name and reused it. A second copy is how the two drift apart, so the count is the claim.
    const bodies = source.split('typeof value === "object" && value !== null && !Array.isArray(value)').length - 1;
    assert.equal(bodies, 1, "the page must ask what a plain record is in exactly one place");
    assert.equal(source.includes("function isTimeEntryRecord("), true);
    assert.equal(source.includes("function isBulkRecord("), false);
  });

  it("acquires each control at the subtype the markup renders and refuses another", () => {
    const { context, document } = filteringCase();
    const findControl = vm.runInContext("findTimeEntryControl", context);

    // A control the page asks for as a select, rendered as something else, is absent rather than
    // a wrongly typed element: this is what makes the declaration a fact instead of a hope.
    const wrong = document.createElement("div");
    wrong.setAttribute("data-time-entry-wrong-shape", "");
    document.body.appendChild(wrong);
    const constructors = vm.runInContext("({ HTMLSelectElement, HTMLElement })", context);

    assert.equal(findControl("[data-time-entry-wrong-shape]", constructors.HTMLSelectElement), null);
    assert.equal(findControl("[data-time-entry-wrong-shape]", constructors.HTMLElement), wrong);
    assert.equal(findControl("[data-time-entry-missing]", constructors.HTMLElement), null);
  });

  it("fails at the access that already dereferenced a missing control, by name", () => {
    const testCase = filteringCase({ omit: ["[data-time-entry-filter-period]"] });

    // `instanceof` cannot answer this: the error is constructed inside the sandbox, so its
    // `TypeError` is a different realm's. The name is the same fact without the identity.
    assert.throws(() => testCase.api.updateFilterDateState(), (error) => {
      assert.ok(typeof error === "object" && error !== null && "name" in error && "message" in error);
      assert.equal(error.name, "TypeError");
      assert.match(String(error.message), /Time Entries requires its period filter\./);
      return true;
    });
  });
});
