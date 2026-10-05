import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/calendar.js");

/**
 * These aim at **what this checkpoint actually changed at runtime**, which is a short list.
 *
 * Twenty-eight of the thirty-three diagnostics were cleared by annotations, and an annotation is
 * proved by the compiler, not by a test. What gained real behaviour is `requireCalendarElement`
 * and the five points that now read through it, plus the two shapes this file newly names for
 * itself - the flattened project row and what the filter does with it. Those are what is tested.
 */

const LIFTED = [
  "requireCalendarElement", "flattenCalendarProjectOptions",
  "populateCalendarProjectFilter", "createCalendarOption", "setCalendarStatus",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * These three are sandbox values handed straight to the lifted code, so they are as open as the
 * code that reads them: a fake element, `null`, or anything a test wants to prove is refused.
 * @param {unknown} [options.projectFilter]
 * @param {unknown} [options.clientFilter]
 * @param {unknown} [options.status]
 * @param {Record<string, unknown>} [options.state]
 */
function calendarCase(options = {}) {
  const document = new FakeDocument();
  /** @type {{ tag: string, options: Record<string, unknown> }[]} */
  const viewCalls = [];

  const calendarState = {
    workspaceType: "business",
    clientId: "",
    projectId: "",
    /** @type {Record<string, unknown>[]} */
    projects: [],
    ...options.state,
  };

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    calendarState,
    calendarProjectFilter: options.projectFilter === undefined ? document.createElement("select") : options.projectFilter,
    calendarClientFilter: options.clientFilter === undefined ? null : options.clientFilter,
    calendarStatus: options.status === undefined ? document.createElement("p") : options.status,
    // **The published label must differ from the raw name**, or preferring it is unobservable and
    // a mutation that stops calling it survives. An earlier fixture answered `displayName` here.
    window: { LongtailForge: { clientProjectOptions: { optionLabel: (/** @type {{ displayName?: string }} */ client) => (client?.displayName ? `${client.displayName} Ltd` : "") } } },
    requireView: () => ({
      /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
      createElement: (tag, createOptions = {}) => {
        viewCalls.push({ tag, options: createOptions });
        const element = document.createElement(tag);
        if (typeof createOptions.text === "string") element.textContent = createOptions.text;
        return element;
      },
    }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
  return { api, sandbox, document, calendarState, viewCalls };
}

describe("Calendar cached-element refusal", () => {
  /**
   * The only new runtime guard this checkpoint adds. It exists where a cached element is read from
   * a scope the compiler cannot narrow through - another function, or a callback that runs later.
   */
  it("answers the element it was given, whatever kind it is", () => {
    const { api, document } = calendarCase();
    const element = document.createElement("select");
    assert.equal(api.requireCalendarElement(element, "client filter"), element);
    // A falsy value that is not `null` must come back untouched. Asserting it does not throw is
    // what makes a widened guard an assertion failure rather than a TypeError the suite reports.
    for (const falsy of [0, "", false, Number.NaN]) {
      assert.doesNotThrow(() => api.requireCalendarElement(falsy, "zero"), `must not refuse ${String(falsy)}`);
    }
    assert.equal(api.requireCalendarElement(0, "zero"), 0);
    assert.equal(api.requireCalendarElement("", "empty"), "");
  });

  it("refuses null and names which element is missing", () => {
    const { api } = calendarCase();
    assert.throws(() => api.requireCalendarElement(null, "period label"), /requires its period label/);
    assert.throws(() => api.requireCalendarElement(null, "body region"), /requires its body region/);
  });

  /**
   * **It checks `null`, not falsiness**, because `null` is exactly what the eight declarations hold
   * before the host is built. An element is never falsy, so a truthiness test would have been a
   * wider check than the declared domain - the mistake `0.33.33.44.35` corrected elsewhere.
   */
  it("lets undefined through, because that is not a state these declarations reach", () => {
    const { api } = calendarCase();
    assert.equal(api.requireCalendarElement(undefined, "client filter"), undefined);
  });
});

describe("Calendar project option rows", () => {
  const clients = [
    { id: "c1", displayName: "Acme", projects: [{ id: "p1", name: "Rebuild" }, { id: "p2", optionLabel: "Retainer" }] },
    { id: "ws", isWorkspaceScope: true, displayName: "", projects: [{ id: "p3", name: "Internal" }] },
  ];

  /** The four members this file names for itself, and nothing else. */
  it("builds exactly the four members the filter reads", () => {
    const { api } = calendarCase();
    const rows = api.flattenCalendarProjectOptions(clients);
    assert.deepEqual(plain(rows), [
      { id: "p1", clientId: "c1", label: "Acme Ltd / Rebuild", projectLabel: "Rebuild" },
      { id: "p2", clientId: "c1", label: "Acme Ltd / Retainer", projectLabel: "Retainer" },
      { id: "p3", clientId: "", label: "Internal", projectLabel: "Internal" },
    ]);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ["clientId", "id", "label", "projectLabel"]);
  });

  it("gives a workspace-scope client an empty client id, so it is never filtered away", () => {
    const { api } = calendarCase();
    assert.equal(api.flattenCalendarProjectOptions(clients).at(-1).clientId, "");
  });

  it("drops a project with no id and names one with no label", () => {
    const { api } = calendarCase();
    const rows = api.flattenCalendarProjectOptions([
      { id: "c1", displayName: "Acme", projects: [{ name: "No id" }, { id: "p9" }] },
    ]);
    assert.deepEqual(plain(rows), [{ id: "p9", clientId: "c1", label: "Acme Ltd / Untitled Project", projectLabel: "Untitled Project" }]);
  });

  /**
   * **A string is iterable**, so it cannot prove the `Array.isArray` guard: `for...of` walks its
   * characters, each carries no `id`, and the result is empty either way. A record and a number
   * are the values that actually throw without the guard, so those are what this asserts.
   */
  it("reads a client whose projects are not a list as having none", () => {
    const { api } = calendarCase();
    for (const projects of ["nope", {}, 42, null, undefined, true]) {
      const client = { id: "c1", displayName: "Acme", projects };
      assert.doesNotThrow(() => api.flattenCalendarProjectOptions([client]), `projects: ${String(projects)}`);
      assert.deepEqual(plain(api.flattenCalendarProjectOptions([client])), []);
    }
  });
});

describe("Calendar project filter", () => {
  const projects = [
    { id: "p1", clientId: "c1", label: "Acme / Rebuild", projectLabel: "Rebuild" },
    { id: "p2", clientId: "c2", label: "Globex / Retainer", projectLabel: "Retainer" },
    { id: "p3", clientId: "", label: "Internal", projectLabel: "Internal" },
  ];
  /** @param {{ viewCalls: { tag: string, options: Record<string, unknown> }[] }} testCase */
  const optionText = (testCase) => testCase.viewCalls.filter((call) => call.tag === "option").map((call) => call.options.text);

  it("does nothing at all when the filter has not been built", () => {
    const testCase = calendarCase({ projectFilter: null, state: { projects } });
    assert.doesNotThrow(() => testCase.api.populateCalendarProjectFilter());
    assert.deepEqual(optionText(testCase), []);
  });

  it("offers every project and its full label when no client is selected", () => {
    const testCase = calendarCase({ state: { projects } });
    testCase.api.populateCalendarProjectFilter();
    assert.deepEqual(optionText(testCase), ["All projects", "Acme / Rebuild", "Globex / Retainer", "Internal"]);
  });

  /** With a client chosen the client name is already implied, so the shorter label is used. */
  it("narrows to the selected client and shows the project label alone", () => {
    const clientFilter = new FakeDocument().createElement("select");
    clientFilter.value = "c1";
    const testCase = calendarCase({ clientFilter, state: { projects } });
    testCase.api.populateCalendarProjectFilter();
    assert.deepEqual(optionText(testCase), ["All projects", "Rebuild"]);
  });

  it("ignores client scope outside a business workspace", () => {
    const clientFilter = new FakeDocument().createElement("select");
    clientFilter.value = "c1";
    const testCase = calendarCase({ clientFilter, state: { projects, workspaceType: "personal" } });
    testCase.api.populateCalendarProjectFilter();
    assert.deepEqual(optionText(testCase), ["All projects", "Acme / Rebuild", "Globex / Retainer", "Internal"]);
  });

  it("keeps a selection that survives the new list and clears one that does not", () => {
    const kept = calendarCase({ state: { projects } });
    kept.sandbox.calendarProjectFilter.value = "p2";
    kept.api.populateCalendarProjectFilter();
    assert.equal(kept.sandbox.calendarProjectFilter.value, "p2");

    const clientFilter = new FakeDocument().createElement("select");
    clientFilter.value = "c1";
    const cleared = calendarCase({ clientFilter, state: { projects } });
    cleared.sandbox.calendarProjectFilter.value = "p2";
    cleared.api.populateCalendarProjectFilter();
    assert.equal(cleared.sandbox.calendarProjectFilter.value, "");
  });
});

describe("Calendar status message", () => {
  it("does nothing at all when the status element has not been built", () => {
    const testCase = calendarCase({ status: null });
    assert.doesNotThrow(() => testCase.api.setCalendarStatus("Loading calendar..."));
  });

  it("shows a message and hides itself when there is none", () => {
    const testCase = calendarCase();
    testCase.api.setCalendarStatus("Loading calendar...");
    assert.equal(testCase.sandbox.calendarStatus.textContent, "Loading calendar...");
    assert.equal(testCase.sandbox.calendarStatus.hidden, false);

    testCase.api.setCalendarStatus("");
    assert.equal(testCase.sandbox.calendarStatus.textContent, "");
    assert.equal(testCase.sandbox.calendarStatus.hidden, true);
  });

  it("announces an error more urgently than an ordinary message", () => {
    const ordinary = calendarCase();
    ordinary.api.setCalendarStatus("Loading calendar...");
    assert.equal(ordinary.sandbox.calendarStatus.dataset.viewTone, "info");
    assert.equal(ordinary.sandbox.calendarStatus.getAttribute("role"), "status");
    assert.equal(ordinary.sandbox.calendarStatus.getAttribute("aria-live"), "polite");

    const failed = calendarCase();
    failed.api.setCalendarStatus("Could not load", { isError: true });
    assert.equal(failed.sandbox.calendarStatus.dataset.viewTone, "danger");
    assert.equal(failed.sandbox.calendarStatus.getAttribute("role"), "alert");
    assert.equal(failed.sandbox.calendarStatus.getAttribute("aria-live"), "assertive");
  });

  it("treats an absent options bag as an ordinary message", () => {
    const testCase = calendarCase();
    testCase.api.setCalendarStatus("Loading calendar...");
    assert.equal(testCase.sandbox.calendarStatus.getAttribute("role"), "status");
  });
});

describe("Calendar shapes this adapter states rather than invents", () => {
  /** The eight declarations that carried twenty-two of the thirty-three diagnostics. */
  it("declares every cached element, with the three filters as select elements", () => {
    for (const declaration of [
      /@type \{HTMLElement \| null\} \*\/\s*\n\s*let calendarStatus = null;/,
      /@type \{HTMLElement \| null\} \*\/\s*\n\s*let calendarPeriodLabel = null;/,
      /@type \{HTMLButtonElement\[\]\} \*\/\s*\n\s*let calendarViewButtons = \[\];/,
      /@type \{HTMLElement \| null\} \*\/\s*\n\s*let calendarBodyRegion = null;/,
      /@type \{HTMLSelectElement \| null\} \*\/\s*\n\s*let calendarClientFilter = null;/,
      /@type \{HTMLSelectElement \| null\} \*\/\s*\n\s*let calendarProjectFilter = null;/,
      /@type \{HTMLElement \| null\} \*\/\s*\n\s*let calendarClientFilterControl = null;/,
      /@type \{HTMLSelectElement \| null\} \*\/\s*\n\s*let calendarStatusFilter = null;/,
    ]) {
      assert.match(source, declaration);
    }
  });

  /**
   * **The handlers read the cached control when the event fires**, not a local captured when the
   * listener was attached. Capturing would have satisfied the compiler just as well and quietly
   * changed which control a handler follows, so the spelling is pinned rather than left to drift.
   */
  it("keeps each filter handler reading the cached control at event time", () => {
    assert.match(source, /calendarClientFilter\.addEventListener\("change", \(\) => \{\s*\n\s*calendarState\.clientId = requireCalendarElement\(calendarClientFilter, "client filter"\)\.value;/);
    assert.match(source, /calendarProjectFilter\.addEventListener\("change", \(\) => \{\s*\n\s*calendarState\.projectId = requireCalendarElement\(calendarProjectFilter, "project filter"\)\.value;/);
    assert.match(source, /const statusFilter = requireCalendarElement\(calendarStatusFilter, "status filter"\);/);
  });

  it("names its own project row rather than the published project option", () => {
    assert.match(source, /@typedef \{\{ id: string, clientId: string, label: string, projectLabel: string \}\} CalendarProjectOption/);
    assert.match(source, /@type \{CalendarProjectOption\[\]\} \*\/\s*\n\s*projects: \[\],/);
    // Only as an annotation: the prose above the typedef names it to say why it is not used.
    assert.doesNotMatch(source, /@type \{[^}]*NormalizedProjectOption/);
    assert.doesNotMatch(source, /@returns \{[^}]*NormalizedProjectOption/);
  });

  it("carries no suppression, no cast and no hand-built anatomy", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    // A type assertion is spelled `/** @type {X} */ (value)`. This file needs none: every
    // annotation is a declaration the assignment already satisfies.
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
    assert.doesNotMatch(source, /document\.createElement\(/);
    assert.doesNotMatch(source, /innerHTML/);
  });
});
