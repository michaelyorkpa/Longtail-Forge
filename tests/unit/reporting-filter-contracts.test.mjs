import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/reporting.js");
const tasks = reader.readText("public/js/tasks.js");

const LIFTED = [
  "requireReportingValue", "filterQueryKeys", "filterIsVisible", "readExecutionEnvelope",
  "registerRenderer", "parseBoolean", "normalizeListValue", "formatDateInput",
  "setSelectValueWhenAvailable", "getFilterValue", "setFilterValue", "getFilterControl",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {{ fields?: Record<string, unknown> }} [options] */
function reportingCase(options = {}) {
  const document = new FakeDocument();
  const reportRenderers = new Map();
  const reportingState = {
    reports: [],
    selectedReport: null,
    renderer: null,
    filterFields: new Map(Object.entries(options.fields || {})),
    selectionGeneration: 0,
    executionGeneration: 0,
  };
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: { LongtailForge: {} },
    reportRenderers,
    reportingState,
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);

  /** @param {string} tag @param {Record<string, unknown>} [props] */
  const control = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  /**
   * @param {string} id
   * @param {Record<string, unknown>} filter
   * @param {Record<string, unknown>} controls
   * @param {unknown} [tagFilterController]
   */
  const field = (id, filter, controls, tagFilterController) => {
    reportingState.filterFields.set(id, {
      controls: new Map(Object.entries(controls)),
      filter: { id, ...filter },
      wrapper: document.createElement("div"),
      ...(tagFilterController === undefined ? {} : { tagFilterController }),
    });
  };

  return { api, context, document, reportingState, reportRenderers, control, field };
}

describe("Reporting tag filter surface", () => {
  /**
   * The tag filter and `tasks.js` reach the **same published surface** -
   * `LongtailForge.tags.mountFilterPicker` - and both narrow to an input before mounting, because
   * the view primitive can answer a select or a textarea and the picker mounts only on an input.
   * There is no duplicated controller between the two pages to keep in step.
   */
  it("mounts the shared picker, narrowed to the control that can carry it", () => {
    assert.match(source, /mountFilterPicker\?\.\(control, \{/);
    assert.match(source, /fieldState\.tagFilterController = control instanceof HTMLInputElement/);
    assert.match(tasks, /instanceof HTMLInputElement/,
      "tasks.js reaches the same surface and narrows the same way");
    assert.equal(source.includes("function mountFilterPicker"), false,
      "and neither page carries its own copy of it");
  });

  it("types the picker from its published controller contract", () => {
    assert.match(source, /BrowserTagFilterPickerController\} BrowserTagFilterPickerController/);
    assert.match(source, /@property \{BrowserTagFilterPickerController \| null\} \[tagFilterController\]/);
  });
});

describe("Reporting filter query keys", () => {
  it("uses the keys a filter names", () => {
    const testCase = reportingCase();

    assert.deepEqual(plain(testCase.api.filterQueryKeys({ id: "range", queryKeys: ["from", "to"] })), ["from", "to"]);
  });

  /** A contribution may omit them, and every call site already fell back to the filter's id. */
  it("falls back to the filter's own id when it names none", () => {
    const testCase = reportingCase();

    assert.deepEqual(plain(testCase.api.filterQueryKeys({ id: "status" })), ["status"]);
    assert.deepEqual(plain(testCase.api.filterQueryKeys({ id: "status", queryKeys: [] })), ["status"]);
    assert.deepEqual(plain(testCase.api.filterQueryKeys({ id: "status", queryKeys: "from,to" })), ["status"]);
  });
});

describe("Reporting filter visibility", () => {
  it("shows a filter that names no condition", () => {
    const testCase = reportingCase();

    assert.equal(testCase.api.filterIsVisible({ id: "status" }), true);
  });

  it("shows a conditional filter only when the other filter matches", () => {
    const testCase = reportingCase();
    testCase.field("mode", { type: "select" }, { mode: testCase.control("select", { value: "custom" }) });

    assert.equal(
      testCase.api.filterIsVisible({ id: "range", visibleWhen: { filterId: "mode", equals: "custom" } }),
      true,
    );
    assert.equal(
      testCase.api.filterIsVisible({ id: "range", visibleWhen: { filterId: "mode", equals: "preset" } }),
      false,
    );
  });

  it("hides a filter whose condition is not a readable record", () => {
    const testCase = reportingCase();

    assert.equal(testCase.api.filterIsVisible({ id: "range", visibleWhen: "mode=custom" }), false);
    assert.equal(testCase.api.filterIsVisible({ id: "range", visibleWhen: 7 }), false);
  });
});

describe("Reporting execution envelope", () => {
  it("reads the four members the host acts on", () => {
    const testCase = reportingCase();

    const envelope = testCase.api.readExecutionEnvelope({
      status: "ready",
      reportKey: "time-summary",
      renderer: "table",
      result: { rows: [1, 2] },
      error: { message: "ignored when ready" },
    });

    assert.equal(envelope.status, "ready");
    assert.equal(envelope.reportKey, "time-summary");
    assert.equal(envelope.renderer, "table");
    assert.deepEqual(plain(envelope.result), { rows: [1, 2] });
    assert.equal(envelope.errorMessage, "ignored when ready");
  });

  it("reads the failure message two levels down", () => {
    const testCase = reportingCase();

    assert.equal(
      testCase.api.readExecutionEnvelope({ status: "failed", error: { message: "No permission." } }).errorMessage,
      "No permission.",
    );
    assert.equal(testCase.api.readExecutionEnvelope({ status: "failed", error: "No permission." }).errorMessage, "");
    assert.equal(testCase.api.readExecutionEnvelope({ status: "failed" }).errorMessage, "");
  });

  it("answers empty text for a body it cannot read, never undefined", () => {
    const testCase = reportingCase();

    for (const body of [null, undefined, "ready", 4, []]) {
      const envelope = testCase.api.readExecutionEnvelope(body);
      assert.equal(envelope.status, "");
      assert.equal(envelope.reportKey, "");
      assert.equal(envelope.renderer, "");
      assert.equal(envelope.errorMessage, "");
    }
  });

  /**
   * These three guards live in `executeSelectedReport`, which this fixture does not run - it owns
   * a fetch, two generation counters and a renderer. They are pinned as source facts so a guard
   * removed there is still refused here.
   */
  it("acts on the envelope only when it is ready and answers the report that was asked for", () => {
    assert.match(source, /if \(!response\.ok \|\| envelope\.status !== "ready"\) \{/);
    assert.match(source, /envelope\.reportKey !== report\.reportKey \|\| envelope\.renderer !== \(report\.renderer \|\| ""\)/);
    assert.match(source, /renderReportingError\(envelope\.errorMessage \|\| "The report could not be run\."\)/);
  });

  it("refuses a non-string member rather than coercing it", () => {
    const testCase = reportingCase();

    const envelope = testCase.api.readExecutionEnvelope({ status: 200, reportKey: 7, renderer: null });

    assert.equal(envelope.status, "", "a numeric status is not the word ready");
    assert.equal(envelope.reportKey, "");
    assert.equal(envelope.renderer, "");
  });
});

describe("Reporting renderer registration", () => {
  it("records a registration that can render", () => {
    const testCase = reportingCase();
    const render = () => {};

    testCase.api.registerRenderer("table", { render });

    assert.equal(testCase.reportRenderers.get("table").render, render);
  });

  it("accepts a bare function as the render itself", () => {
    const testCase = reportingCase();
    const render = () => {};

    testCase.api.registerRenderer("table", render);

    assert.equal(testCase.reportRenderers.get("table").render, render);
  });

  it("refuses an unusable id or a registration that cannot render", () => {
    const testCase = reportingCase();

    testCase.api.registerRenderer("", { render: () => {} });
    testCase.api.registerRenderer("   ", { render: () => {} });
    testCase.api.registerRenderer("table", {});
    testCase.api.registerRenderer("table", { render: "not callable" });
    testCase.api.registerRenderer("table", null);
    testCase.api.registerRenderer("table", "table");

    assert.equal(testCase.reportRenderers.size, 0);
  });

  /** Own members only: a `render` reached through the prototype chain is not this registration's. */
  it("refuses a render reached through the prototype chain", () => {
    const testCase = reportingCase();

    testCase.api.registerRenderer("table", Object.create({ render: () => {} }));

    assert.equal(testCase.reportRenderers.size, 0);
  });

  it("trims the identifier it records under", () => {
    const testCase = reportingCase();

    testCase.api.registerRenderer("  table  ", { render: () => {} });

    assert.equal(testCase.reportRenderers.has("table"), true);
  });
});

describe("Reporting filter values", () => {
  it("reads a boolean filter only from a control that carries checked", () => {
    const testCase = reportingCase();
    testCase.field("billable", { type: "boolean" }, { billable: testCase.control("input", { checked: true }) });

    assert.equal(testCase.api.getFilterValue("billable"), true);

    testCase.field("other", { type: "boolean" }, { other: testCase.control("select", { checked: true }) });
    assert.equal(testCase.api.getFilterValue("other"), false, "a select carries no checked state");
  });

  it("reads a multi-select filter as the values actually selected", () => {
    const testCase = reportingCase();
    const select = testCase.control("select", { multiple: true });
    /** @type {[string, boolean][]} */
    const choices = [["a", true], ["b", false], ["c", true]];

    for (const [value, selected] of choices) {
      const option = testCase.document.createElement("option");
      option.value = value;
      option.selected = selected;
      select.appendChild(option);
    }
    testCase.field("tags", { type: "select" }, { tags: select });

    assert.deepEqual(plain(testCase.api.getFilterValue("tags")), ["a", "c"]);

    // `multiple` is a select's member; a control of another kind carrying it is not a multi-select.
    const impostor = reportingCase();
    const input = impostor.control("input", { multiple: true, value: "typed" });
    impostor.field("tags", { type: "text" }, { tags: input });
    assert.equal(impostor.api.getFilterValue("tags"), "typed");
  });

  it("reads a tag filter through its controller, falling back to the control's own value", () => {
    const withController = reportingCase();
    withController.field("tag", { type: "tag" }, { tag: withController.control("input") }, {
      readValue: () => "t1",
    });
    assert.deepEqual(plain(withController.api.getFilterValue("tag")), ["t1"]);

    const withoutController = reportingCase();
    const input = withoutController.control("input");
    input.dataset.tagFilterValue = "t2";
    withoutController.field("tag", { type: "tag" }, { tag: input }, null);
    assert.deepEqual(plain(withoutController.api.getFilterValue("tag")), ["t2"]);
  });

  it("reads the everything choice as no filter at all", () => {
    const testCase = reportingCase();
    testCase.field("tag", { type: "tag" }, { tag: testCase.control("input") }, { readValue: () => "all" });

    assert.deepEqual(plain(testCase.api.getFilterValue("tag")), []);
  });

  it("writes a boolean filter only to a control that carries checked", () => {
    const testCase = reportingCase();
    const input = testCase.control("input");
    testCase.field("billable", { type: "boolean", defaultValue: false }, { billable: input });

    testCase.api.setFilterValue("billable", "yes");
    assert.equal(input.checked, true);

    testCase.api.setFilterValue("billable", "no");
    assert.equal(input.checked, false);

    // A control of another kind carries no checked state, so the write does not reach it.
    const impostor = reportingCase();
    const select = impostor.control("select");
    impostor.field("billable", { type: "boolean", defaultValue: false }, { billable: select });
    impostor.api.setFilterValue("billable", "yes");
    assert.equal(select.checked, false);
  });

  it("ignores an absent value rather than clearing the control", () => {
    const testCase = reportingCase();
    const input = testCase.control("input", { value: "kept" });
    testCase.field("search", { type: "text" }, { search: input });

    testCase.api.setFilterValue("search", undefined);
    testCase.api.setFilterValue("search", null);

    assert.equal(input.value, "kept");
  });

  it("writes each end of a custom range to its own control", () => {
    const testCase = reportingCase();
    const start = testCase.control("input");
    const end = testCase.control("input");
    testCase.field("range", { type: "custom-date-range" }, { from: start, to: end });

    testCase.api.setFilterValue("range", { from: "2026-03-01", to: "2026-03-31" });

    assert.equal(start.value, "2026-03-01");
    assert.equal(end.value, "2026-03-31");
  });

  it("leaves a range control alone when the value names no key for it", () => {
    const testCase = reportingCase();
    const start = testCase.control("input", { value: "2026-01-01" });
    const end = testCase.control("input", { value: "2026-01-31" });
    testCase.field("range", { type: "custom-date-range" }, { from: start, to: end });

    testCase.api.setFilterValue("range", { from: "2026-03-01" });

    assert.equal(start.value, "2026-03-01");
    assert.equal(end.value, "2026-01-31", "the untouched end keeps what it had");
  });

  it("refuses a range value that is not a record", () => {
    const testCase = reportingCase();
    const start = testCase.control("input", { value: "2026-01-01" });
    testCase.field("range", { type: "custom-date-range" }, { from: start });

    testCase.api.setFilterValue("range", "2026-03-01");

    assert.equal(start.value, "2026-01-01");
  });
});

describe("Reporting value helpers", () => {
  it("reads the words a boolean filter can arrive as", () => {
    const testCase = reportingCase();

    for (const truthy of [true, "true", "1", "yes", ["yes"]]) {
      assert.equal(testCase.api.parseBoolean(truthy), true, String(truthy));
    }
    assert.equal(testCase.api.parseBoolean(false), false);
    assert.equal(testCase.api.parseBoolean("no"), false);
    assert.equal(testCase.api.parseBoolean(undefined, true), true, "an absent value takes the caller's fallback");
    assert.equal(testCase.api.parseBoolean("", true), true);
    // A word in neither vocabulary takes the fallback, which is false unless the caller says so.
    assert.equal(testCase.api.parseBoolean("maybe"), false);
    assert.equal(testCase.api.parseBoolean("maybe", true), true);
    // A list is read at its first entry, not coerced whole - "yes,no" is in neither vocabulary.
    assert.equal(testCase.api.parseBoolean(["yes", "no"]), true);
  });

  it("splits, trims and de-duplicates a list value", () => {
    const testCase = reportingCase();

    assert.deepEqual(plain(testCase.api.normalizeListValue("a, b ,a")), ["a", "b"]);
    assert.deepEqual(plain(testCase.api.normalizeListValue(["a", "b,c"])), ["a", "b", "c"]);
    assert.deepEqual(plain(testCase.api.normalizeListValue(null)), []);
    assert.deepEqual(plain(testCase.api.normalizeListValue(undefined)), []);
    assert.deepEqual(plain(testCase.api.normalizeListValue("")), []);
  });

  it("formats a date for a date input", () => {
    const testCase = reportingCase();

    assert.equal(testCase.api.formatDateInput(new Date(2026, 2, 9)), "2026-03-09");
    assert.equal(testCase.api.formatDateInput(new Date(2026, 11, 31)), "2026-12-31");
  });

  it("selects a value only where the list offers it, and writes it directly otherwise", () => {
    const testCase = reportingCase();
    const select = testCase.document.createElement("select");
    const option = testCase.document.createElement("option");
    option.value = "a";
    select.appendChild(option);
    select.value = "a";

    testCase.api.setSelectValueWhenAvailable(select, "missing");
    assert.equal(select.value, "a", "a value the list does not offer leaves the selection alone");

    testCase.api.setSelectValueWhenAvailable(select, "a");
    assert.equal(select.value, "a");

    const input = testCase.document.createElement("input");
    testCase.api.setSelectValueWhenAvailable(input, "anything");
    assert.equal(input.value, "anything", "a control with no option list takes the value directly");
  });
});

describe("Reporting host acquisition", () => {
  it("refuses a host control the page never assembled, by name", () => {
    const testCase = reportingCase();

    assert.equal(testCase.api.requireReportingValue("present", "report selector"), "present");
    assert.throws(() => testCase.api.requireReportingValue(null, "results host"), {
      name: "TypeError",
      message: "Reporting requires its results host.",
    });
  });

  it("carries no suppression and one document query", () => {
    assert.equal(source.split("document.querySelector").length - 1, 1);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
