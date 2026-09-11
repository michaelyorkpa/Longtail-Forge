import assert from "node:assert/strict";
import { URLSearchParams } from "node:url";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/audit-log.js");

const LIFTED = [
  "findAuditControl", "requireAuditValue", "buildFilterParams", "populateFilterOptions",
  "populateWorkspaceOptions", "replaceSelectOptions", "normalizeOptions", "normalizeEnumOptions",
  "createOption", "formatEnum",
];

const CONTROLS = [
  ["dateFromInput", "[data-audit-date-from]", "input", "HTMLInputElement"],
  ["dateToInput", "[data-audit-date-to]", "input", "HTMLInputElement"],
  ["userFilterSelect", "[data-audit-user-filter]", "select", "HTMLSelectElement"],
  ["clientFilterControl", "[data-audit-client-filter-control]", "div", "HTMLElement"],
  ["clientFilterSelect", "[data-audit-client-filter]", "select", "HTMLSelectElement"],
  ["projectFilterSelect", "[data-audit-project-filter]", "select", "HTMLSelectElement"],
  ["recordTypeFilterSelect", "[data-audit-record-type-filter]", "select", "HTMLSelectElement"],
  ["changeTypeFilterSelect", "[data-audit-change-type-filter]", "select", "HTMLSelectElement"],
  ["workspaceFilterControl", "[data-audit-workspace-filter-control]", "div", "HTMLElement"],
  ["workspaceFilterSelect", "[data-audit-workspace-filter]", "select", "HTMLSelectElement"],
  ["showUtcInput", "[data-audit-show-utc]", "input", "HTMLInputElement"],
];

/**
 * The eight names `normalizeFilters` in `src/services/audit.service.js` reads off the query.
 * `listSecurityEvents` calls `list` with `securityOnly`, so both audit endpoints share that one
 * receiver and this is the whole emitted contract - not a spelling convention.
 */
const RECEIVER_KEYS = [
  "actorUserId", "changeType", "clientId", "dateFrom", "dateTo", "projectId", "recordType",
  "workspaceId",
];

/** @param {{ omit?: string[] }} [options] */
function filterCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const conversions = [];

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  const context = vm.createContext({
    document,
    URLSearchParams,
    ...fakeDomConstructors(),
    requireTimezones: () => ({
      /**
       * @param {string} date
       * @param {string} time
       * @param {string | undefined} timezone
       */
      zonedDateTimeToUtcIso: (date, time, timezone) => {
        conversions.push({ date, time, timezone });
        return `${date}T${time}Z`;
      },
    }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findAuditControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  /** @param {string} selector */
  const optionValues = (selector) => control(selector).options.map((option) => option.value);
  /** @param {string} selector */
  const optionLabels = (selector) => control(selector).options.map((option) => option.textContent);
  return { api, context, document, conversions, control, optionValues, optionLabels };
}

/** @param {Record<string, unknown>} [overrides] */
const filterOptions = (overrides = {}) => ({
  changeTypes: ["create", "soft_delete"],
  clients: [{ label: "Client One", value: "c1" }],
  projects: [{ label: "Project One", value: "p1" }],
  recordTypes: ["time_entry"],
  users: [{ label: "Ada Lovelace", value: "u1" }],
  workspaces: [],
  ...overrides,
});

describe("Audit Log filter query", () => {
  it("emits nothing when no filter is set", () => {
    const testCase = filterCase();

    assert.equal(testCase.api.buildFilterParams().toString(), "");
    assert.deepEqual(testCase.conversions, []);
  });

  it("emits exactly the eight keys the audit service reads", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-date-from]").value = "2026-03-01";
    testCase.control("[data-audit-date-to]").value = "2026-03-31";
    testCase.control("[data-audit-user-filter]").value = "u1";
    testCase.control("[data-audit-client-filter]").value = "c1";
    testCase.control("[data-audit-project-filter]").value = "p1";
    testCase.control("[data-audit-record-type-filter]").value = "time_entry";
    testCase.control("[data-audit-change-type-filter]").value = "create";
    testCase.control("[data-audit-workspace-filter]").value = "w1";

    const params = testCase.api.buildFilterParams();

    assert.deepEqual([...params.keys()].sort(), RECEIVER_KEYS);
    assert.equal(params.get("actorUserId"), "u1");
    assert.equal(params.get("clientId"), "c1");
    assert.equal(params.get("projectId"), "p1");
    assert.equal(params.get("recordType"), "time_entry");
    assert.equal(params.get("changeType"), "create");
    assert.equal(params.get("workspaceId"), "w1");
  });

  it("sends the converted instant rather than the typed date, bounding each end of the day", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-date-from]").value = "2026-03-01";
    testCase.control("[data-audit-date-to]").value = "2026-03-31";

    const params = testCase.api.buildFilterParams();

    assert.equal(params.get("dateFrom"), "2026-03-01T00:00:00Z");
    assert.equal(params.get("dateTo"), "2026-03-31T23:59:59Z");
    assert.deepEqual(testCase.conversions, [
      { date: "2026-03-01", time: "00:00:00", timezone: undefined },
      { date: "2026-03-31", time: "23:59:59", timezone: undefined },
    ]);
  });

  it("converts in UTC only while the UTC toggle is checked", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-date-from]").value = "2026-03-01";
    testCase.control("[data-audit-show-utc]").checked = true;

    testCase.api.buildFilterParams();

    assert.deepEqual(testCase.conversions, [
      { date: "2026-03-01", time: "00:00:00", timezone: "UTC" },
    ]);
  });

  it("omits a blank date without converting it", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-date-to]").value = "2026-03-31";

    const params = testCase.api.buildFilterParams();

    assert.equal(params.has("dateFrom"), false);
    assert.equal(params.get("dateTo"), "2026-03-31T23:59:59Z");
    assert.equal(testCase.conversions.length, 1);
  });

  it("carries one filter without the others", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-record-type-filter]").value = "time_entry";

    assert.equal(testCase.api.buildFilterParams().toString(), "recordType=time_entry");
  });

  it("refuses to build a query when a control the markup should carry is absent", () => {
    const testCase = filterCase({ omit: ["[data-audit-workspace-filter]"] });

    assert.throws(() => testCase.api.buildFilterParams(), {
      name: "TypeError",
      message: "Audit Log requires its workspace filter.",
    });
  });
});

describe("Audit Log filter option population", () => {
  it("gives every catalogue its own all-label placeholder ahead of the options", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions(), "");

    assert.deepEqual(testCase.optionValues("[data-audit-user-filter]"), ["", "u1"]);
    assert.deepEqual(testCase.optionLabels("[data-audit-user-filter]"), ["All users", "Ada Lovelace"]);
    assert.deepEqual(testCase.optionLabels("[data-audit-client-filter]"), ["All clients", "Client One"]);
    assert.deepEqual(testCase.optionLabels("[data-audit-project-filter]"), ["All projects", "Project One"]);
  });

  it("labels the two bare-string vocabularies through formatEnum", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions(), "");

    assert.deepEqual(testCase.optionValues("[data-audit-record-type-filter]"), ["", "time_entry"]);
    assert.deepEqual(testCase.optionLabels("[data-audit-record-type-filter]"), ["All record types", "Time Entry"]);
    assert.deepEqual(testCase.optionLabels("[data-audit-change-type-filter]"), [
      "All change types", "Create", "Soft Delete",
    ]);
  });

  it("hides the client filter when the catalogue leaves only the placeholder", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions({ clients: [] }), "");

    assert.equal(testCase.control("[data-audit-client-filter-control]").hidden, true);
    assert.deepEqual(testCase.optionValues("[data-audit-client-filter]"), [""]);
  });

  it("shows the client filter as soon as one client is offered", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions(), "");

    assert.equal(testCase.control("[data-audit-client-filter-control]").hidden, false);
  });

  it("rebuilds each catalogue on a repaint rather than accumulating a second copy", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions(), "");
    testCase.api.populateFilterOptions(filterOptions(), "");

    assert.deepEqual(testCase.optionValues("[data-audit-user-filter]"), ["", "u1"]);
    assert.deepEqual(testCase.optionValues("[data-audit-change-type-filter]"), ["", "create", "soft_delete"]);
  });

  /**
   * The catalogue is rebuilt rather than appended to, so a value it no longer carries is gone
   * from the list. What the control then *reads* as is the browser's own doing - a real
   * `<select>` derives `value` from its options - and this fixture models `value` as a plain
   * property, so that reset is deliberately not asserted here rather than asserted wrongly.
   */
  it("rebuilds the catalogue without a value it no longer offers", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-user-filter]").value = "gone";

    testCase.api.populateFilterOptions(filterOptions(), "");

    assert.deepEqual(testCase.optionValues("[data-audit-user-filter]"), ["", "u1"]);
  });

  it("forwards the workspace catalogue and the resolved scope", () => {
    const testCase = filterCase();

    testCase.api.populateFilterOptions(filterOptions({
      workspaces: [{ label: "All workspaces", value: "all" }, { label: "Second", value: "w2" }],
    }), "w2");

    assert.equal(testCase.control("[data-audit-workspace-filter]").value, "w2");
    assert.equal(testCase.control("[data-audit-workspace-filter-control]").hidden, false);
  });
});

describe("Audit Log workspace options", () => {
  it("hides the control and offers only the current workspace when the catalogue is empty", () => {
    const testCase = filterCase();

    testCase.api.populateWorkspaceOptions([], "w1");

    assert.equal(testCase.control("[data-audit-workspace-filter-control]").hidden, true);
    assert.deepEqual(testCase.optionLabels("[data-audit-workspace-filter]"), ["Current workspace"]);
    assert.deepEqual(testCase.optionValues("[data-audit-workspace-filter]"), [""]);
  });

  it("shows the control and honours the resolved workspace when it is offered", () => {
    const testCase = filterCase();

    testCase.api.populateWorkspaceOptions([
      { label: "First", value: "w1" }, { label: "Second", value: "w2" },
    ], "w2");

    assert.equal(testCase.control("[data-audit-workspace-filter-control]").hidden, false);
    assert.deepEqual(testCase.optionValues("[data-audit-workspace-filter]"), ["", "w1", "w2"]);
    assert.equal(testCase.control("[data-audit-workspace-filter]").value, "w2");
  });

  it("honours the super-administrator all-workspaces scope like any other offered value", () => {
    const testCase = filterCase();

    testCase.api.populateWorkspaceOptions([
      { label: "All workspaces", value: "all" }, { label: "First", value: "w1" },
    ], "all");

    assert.equal(testCase.control("[data-audit-workspace-filter]").value, "all");
  });

  it("leaves the standing selection alone when the resolved scope is not offered", () => {
    const testCase = filterCase();
    testCase.control("[data-audit-workspace-filter]").value = "w1";

    testCase.api.populateWorkspaceOptions([{ label: "First", value: "w1" }], "absent");

    assert.equal(testCase.control("[data-audit-workspace-filter]").value, "w1");
  });

  it("refuses to populate when the workspace control is absent", () => {
    const testCase = filterCase({ omit: ["[data-audit-workspace-filter-control]"] });

    assert.throws(() => testCase.api.populateWorkspaceOptions([], ""), {
      name: "TypeError",
      message: "Audit Log requires its workspace filter control.",
    });
  });
});

describe("Audit Log filter acquisition", () => {
  it("acquires every filter control through the checked lookup at the markup's own subtype", () => {
    for (const [name, selector, , constructor] of CONTROLS) {
      const expected = `const ${name} = findAuditControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  it("keeps one lookup helper and no suppression", () => {
    assert.equal(source.split("function findAuditControl(").length - 1, 1);
    assert.equal(source.split("element instanceof constructor ? element : null").length - 1, 1);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  /**
   * **A scope pin, not a durable contract.** `0.33.33.44.20` owns the filter query and the option
   * catalogues; the page's pagination, export, status and table controls are a later checkpoint's
   * work and still acquire themselves bare. A checkpoint that converts one of them should move
   * this number down, not work around it - and it cannot reach zero while the helper's own query
   * remains, which is the twelfth.
   */
  it("leaves exactly the eleven controls outside this checkpoint's scope unconverted", () => {
    const UNCONVERTED = [
      "auditFilterForm", "auditViewSelect", "resetButton", "exportFilteredButton", "exportAllButton",
      "pageSizeSelect", "previousPageButton", "nextPageButton", "pageSummary", "auditStatus",
      "auditLogBody",
    ];

    for (const name of UNCONVERTED) {
      assert.match(source, new RegExp(`const ${name} = document\\.querySelector\\(`));
    }
    assert.equal(source.split("document.querySelector").length - 1, UNCONVERTED.length + 1);
  });
});
