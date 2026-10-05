import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-tracking-reporting.js");
const host = reader.readText("public/js/reporting.js");

const LIFTED = [
  "reportRecord", "reportRecordList", "reportText",
  "initializeFilters", "synchronizeFilters", "synchronizeProjectOptions", "validateFilters",
  "renderProjectTimeBillingResult", "renderProjectTimeBillingTable", "createProjectCell",
  "flattenVisibleRows", "appendRunnerTotals",
  "readRequestedScopeId", "workspaceProjectsLabel", "noTagsFilterValue",
  "formatRate", "formatHours", "formatCurrency", "getReportRowId",
  "sortProjectTree", "sortScopeTree", "getScopeTreeSortKey",
  "getScopeDepth", "getProjectDepth", "compareByName", "treeIndent", "normalizeListValue",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.bootstrap] the body `/api/reporting/bootstrap` answered
 * @param {Record<string, unknown>[]} [options.tags] what `loadTags` answered
 * @param {Record<string, unknown>} [options.filterValues] the host's current filter values
 * @param {string} [options.search] the page's query string
 */
function reportingCase(options = {}) {
  const document = new FakeDocument();

  /** @type {{ filterId: string, options: unknown, config: unknown }[]} */
  const optionCalls = [];
  /** @type {{ filterId: string, hidden: unknown }[]} */
  const hiddenCalls = [];
  /** @type {{ filterId: string, disabled: unknown }[]} */
  const disabledCalls = [];
  /** @type {{ tag: string, options: Record<string, unknown> }[]} */
  const viewCalls = [];

  const filterValues = options.filterValues || {};

  /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
  const recordElement = (tag, createOptions = {}) => {
    viewCalls.push({ tag, options: createOptions });
    const element = document.createElement(tag);
    if (typeof createOptions.text === "string") element.textContent = createOptions.text;
    return element;
  };

  const view = {
    createElement: recordElement,
    /**
     * Builds a real `table > tbody > tr` for each row, because this renderer reaches back into
     * what the factory returned - it marks each drawn row by depth and appends the totals foot
     * to the table it finds. A bare wrapper would let both of those silently do nothing.
     * @param {Record<string, unknown>} createOptions
     */
    createDataTable(createOptions) {
      viewCalls.push({ tag: "#data-table", options: createOptions });
      const wrapper = document.createElement("div");
      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      for (const _row of Array.isArray(createOptions.rows) ? createOptions.rows : []) {
        tbody.appendChild(document.createElement("tr"));
      }
      table.appendChild(tbody);
      wrapper.appendChild(table);
      return wrapper;
    },
    /** @param {Record<string, unknown>} createOptions */
    createActionButton(createOptions) {
      viewCalls.push({ tag: "#action-button", options: createOptions });
      return document.createElement("button");
    },
  };

  const context = {
    queryParams: new URLSearchParams(options.search || ""),
    view,
    /** @param {string} filterId */
    getFilterValue: (filterId) => filterValues[filterId],
    /** @param {string} filterId @param {unknown} filterOptions @param {unknown} config */
    setFilterOptions: (filterId, filterOptions, config) => optionCalls.push({ filterId, options: filterOptions, config }),
    /** @param {string} filterId @param {unknown} hidden */
    setFilterHidden: (filterId, hidden) => hiddenCalls.push({ filterId, hidden }),
    /** @param {string} filterId @param {unknown} disabled */
    setFilterDisabled: (filterId, disabled) => disabledCalls.push({ filterId, disabled }),
  };

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    URLSearchParams,
    window: {
      LongtailForge: {
        tags: { NO_TAGS_FILTER_VALUE: "__no_tags__" },
        getWorkspaceProjectsLabel: () => "Workspace Projects",
      },
    },
    formatters: undefined,
    expandedProjectRows: new Set(),
    reportBootstrap: null,
    loadReportBootstrap: () => Promise.resolve(options.bootstrap),
    loadTagOptions: () => Promise.resolve(options.tags || []),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);

  return { api, sandbox, context, document, optionCalls, hiddenCalls, disabledCalls, viewCalls };
}

/** @param {{ optionCalls: { filterId: string, options: unknown, config: unknown }[] }} testCase @param {string} filterId */
const lastOptions = (testCase, filterId) => {
  const call = [...testCase.optionCalls].reverse().find((entry) => entry.filterId === filterId);
  return call ? { options: plain(call.options), config: plain(call.config) } : null;
};

describe("Time Tracking reporting wire readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = reportingCase();
    assert.deepEqual(plain(api.reportRecord({ id: "a" })), { id: "a" });
    assert.equal(api.reportRecord(null), null);
    assert.equal(api.reportRecord(["a"]), null);
    assert.equal(api.reportRecord("a"), null);
  });

  it("keeps a malformed list entry as an empty record rather than dropping the row", () => {
    const { api } = reportingCase();
    assert.deepEqual(plain(api.reportRecordList([{ id: "a" }, "b", null, 3])), [{ id: "a" }, {}, {}, {}]);
    assert.deepEqual(plain(api.reportRecordList("a")), []);
    assert.deepEqual(plain(api.reportRecordList(undefined)), []);
  });

  it("reads a member as text the way the untyped reads did", () => {
    const { api } = reportingCase();
    assert.equal(api.reportText(0), "");
    assert.equal(api.reportText(false), "");
    assert.equal(api.reportText(null), "");
    assert.equal(api.reportText("scope-1"), "scope-1");
    assert.equal(api.reportText(7), "7");
  });
});

describe("Time Tracking reporting scope filter", () => {
  const bootstrap = {
    defaultScopeId: "acme",
    clientFiltersVisible: true,
    scopes: [
      { id: "workspace", name: "Everything", isWorkspaceScope: true, projects: [] },
      { id: "acme", name: "Acme", projects: [] },
      { id: "acme-eu", name: "Acme EU", parentScopeId: "acme", projects: [] },
    ],
  };

  it("labels the workspace scope from the published surface and indents the tree", async () => {
    const testCase = reportingCase({ bootstrap });
    await testCase.api.initializeFilters(testCase.context);
    assert.deepEqual(lastOptions(testCase, "scope")?.options, [
      { label: "Workspace Projects", value: "workspace" },
      { label: "Acme", value: "acme" },
      { label: "  - Acme EU", value: "acme-eu" },
    ]);
  });

  it("selects the default scope when the url requests none", async () => {
    const testCase = reportingCase({ bootstrap });
    await testCase.api.initializeFilters(testCase.context);
    assert.equal(lastOptions(testCase, "scope")?.config.value, "acme");
  });

  /** Three query names reach the same filter, and only a scope the bootstrap holds is honoured. */
  it("honours a requested scope from any of its three query names", async () => {
    for (const search of ["?scopeId=acme-eu", "?client=acme-eu", "?scope=acme-eu"]) {
      const testCase = reportingCase({ bootstrap, search });
      await testCase.api.initializeFilters(testCase.context);
      assert.equal(lastOptions(testCase, "scope")?.config.value, "acme-eu", search);
    }
  });

  it("falls back to the default when the requested scope is unknown", async () => {
    const testCase = reportingCase({ bootstrap, search: "?scopeId=not-a-scope" });
    await testCase.api.initializeFilters(testCase.context);
    assert.equal(lastOptions(testCase, "scope")?.config.value, "acme");
  });

  it("hides the scope filter only when the workspace says client filters are off", async () => {
    const visible = reportingCase({ bootstrap });
    await visible.api.initializeFilters(visible.context);
    assert.equal(visible.hiddenCalls.find((call) => call.filterId === "scope")?.hidden, false);

    const hidden = reportingCase({ bootstrap: { ...bootstrap, clientFiltersVisible: false } });
    await hidden.api.initializeFilters(hidden.context);
    assert.equal(hidden.hiddenCalls.find((call) => call.filterId === "scope")?.hidden, true);
  });

  /** Only an explicit `false` hides it, so an absent member leaves the filter showing. */
  it("leaves the scope filter showing when the workspace says nothing", async () => {
    const testCase = reportingCase({ bootstrap: { scopes: [] } });
    await testCase.api.initializeFilters(testCase.context);
    assert.equal(testCase.hiddenCalls.find((call) => call.filterId === "scope")?.hidden, false);
  });

  it("survives a bootstrap that is not a record at all", async () => {
    const testCase = reportingCase({ bootstrap: undefined });
    await testCase.api.initializeFilters(testCase.context);
    assert.deepEqual(lastOptions(testCase, "scope")?.options, []);
  });
});

describe("Time Tracking reporting tag filter", () => {
  const bootstrap = { scopes: [] };

  it("offers the shared No Tags value ahead of the workspace's tags", async () => {
    const testCase = reportingCase({
      bootstrap,
      tags: [{ tag_id: "t1", name: "Billable" }, { tag_id: "t2", name: "Internal" }],
    });
    await testCase.api.initializeFilters(testCase.context);
    assert.deepEqual(lastOptions(testCase, "tags")?.options, [
      { value: "__no_tags__", label: "No Tags" },
      { value: "t1", label: "Billable" },
      { value: "t2", label: "Internal" },
    ]);
  });

  it("hides the tag filter when the workspace has no tags", async () => {
    const withTags = reportingCase({ bootstrap, tags: [{ tag_id: "t1", name: "Billable" }] });
    await withTags.api.initializeFilters(withTags.context);
    assert.equal(withTags.hiddenCalls.find((call) => call.filterId === "tags")?.hidden, false);

    const withoutTags = reportingCase({ bootstrap, tags: [] });
    await withoutTags.api.initializeFilters(withoutTags.context);
    assert.equal(withoutTags.hiddenCalls.find((call) => call.filterId === "tags")?.hidden, true);
  });

  it("carries a requested tag selection in from the url", async () => {
    const testCase = reportingCase({ bootstrap, search: "?tagIds=t1,t2" });
    await testCase.api.initializeFilters(testCase.context);
    assert.equal(lastOptions(testCase, "tags")?.config.value, "t1,t2");
  });

  it("falls back to the shared default when the tag surface is absent", () => {
    const { api, sandbox } = reportingCase();
    sandbox.window.LongtailForge = {};
    assert.equal(api.noTagsFilterValue(), "__no_tags__");
    assert.equal(api.workspaceProjectsLabel(), "Projects");
  });
});

describe("Time Tracking reporting project filter", () => {
  const bootstrap = {
    scopes: [{
      id: "acme",
      name: "Acme",
      projects: [
        { id: "p2", name: "Beta" },
        { id: "p1", name: "Alpha" },
        { id: "p1a", name: "Alpha child", parentProjectId: "p1" },
      ],
    }],
  };

  it("orders projects parent-before-child and indents by depth", () => {
    const testCase = reportingCase({ bootstrap, filterValues: { scope: "acme" } });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, {});
    assert.deepEqual(lastOptions(testCase, "projects")?.options, [
      { label: "Alpha", value: "p1" },
      { label: "  - Alpha child", value: "p1a" },
      { label: "Beta", value: "p2" },
    ]);
  });

  it("selects every project when the url requests none", () => {
    const testCase = reportingCase({ bootstrap, filterValues: { scope: "acme" } });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, {});
    assert.deepEqual(lastOptions(testCase, "projects")?.config, { selectedValues: [], selectAll: true });
  });

  it("carries a requested project selection in from the url", () => {
    const testCase = reportingCase({ bootstrap, filterValues: { scope: "acme" }, search: "?projectIds=p1&projectIds=p2" });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, {});
    assert.deepEqual(lastOptions(testCase, "projects")?.config, { selectedValues: ["p1", "p2"], selectAll: false });
  });

  /** Changing scope clears the selection, because the previous scope's projects are gone. */
  it("clears the selection when the scope changed", () => {
    const testCase = reportingCase({
      bootstrap,
      filterValues: { scope: "acme", projects: ["p1"] },
      search: "?projectIds=p2",
    });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, { scopeChanged: true });
    assert.deepEqual(lastOptions(testCase, "projects")?.config, { selectedValues: [], selectAll: true });
  });

  it("prefers the live filter value over the url when the scope did not change", () => {
    const testCase = reportingCase({
      bootstrap,
      filterValues: { scope: "acme", projects: ["p1a"] },
      search: "?projectIds=p2",
    });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, {});
    assert.deepEqual(lastOptions(testCase, "projects")?.config.selectedValues, ["p1a"]);
  });

  it("disables the project filter when no scope resolves", () => {
    const testCase = reportingCase({ bootstrap, filterValues: { scope: "missing" } });
    testCase.sandbox.reportBootstrap = bootstrap;
    testCase.api.synchronizeProjectOptions(testCase.context, {});
    assert.deepEqual(lastOptions(testCase, "projects")?.options, []);
    assert.equal(testCase.disabledCalls.at(-1)?.disabled, true);
  });

  /** The scope change has to be reported onward, or the previous scope's selection survives it. */
  it("reports a scope change onward, so the stale selection is cleared", async () => {
    const testCase = reportingCase({
      bootstrap,
      filterValues: { scope: "acme", projects: ["p1"] },
      search: "?projectIds=p2",
    });
    testCase.sandbox.reportBootstrap = bootstrap;
    await testCase.api.synchronizeFilters(testCase.context, "scope");
    assert.deepEqual(lastOptions(testCase, "projects")?.config, { selectedValues: [], selectAll: true });
  });

  it("keeps the selection when the host reports a first sync rather than a scope change", async () => {
    const testCase = reportingCase({
      bootstrap,
      filterValues: { scope: "acme", projects: ["p1a"] },
    });
    testCase.sandbox.reportBootstrap = bootstrap;
    await testCase.api.synchronizeFilters(testCase.context, null);
    assert.deepEqual(lastOptions(testCase, "projects")?.config.selectedValues, ["p1a"]);
  });

  it("resynchronizes for a scope change and ignores every other filter", async () => {
    const testCase = reportingCase({ bootstrap, filterValues: { scope: "acme" } });
    testCase.sandbox.reportBootstrap = bootstrap;
    await testCase.api.synchronizeFilters(testCase.context, "tags");
    assert.equal(testCase.optionCalls.length, 0);
    await testCase.api.synchronizeFilters(testCase.context, "scope");
    await testCase.api.synchronizeFilters(testCase.context, null);
    assert.equal(testCase.optionCalls.length, 2, "a scope change and a first sync both resynchronize");
  });
});

describe("Time Tracking reporting filter validation", () => {
  it("asks for a scope before anything else", () => {
    const testCase = reportingCase({ filterValues: {} });
    assert.equal(testCase.api.validateFilters(testCase.context), "Choose a reporting scope.");
  });

  it("asks for at least one project once a scope is chosen", () => {
    const testCase = reportingCase({ filterValues: { scope: "acme" } });
    assert.equal(testCase.api.validateFilters(testCase.context), "Select at least one project.");
  });

  it("accepts a scope with projects", () => {
    const testCase = reportingCase({ filterValues: { scope: "acme", projects: ["p1"] } });
    assert.equal(testCase.api.validateFilters(testCase.context), "");
  });
});

describe("Time Tracking reporting result", () => {
  const summary = {
    rows: [{
      project: { id: "p1", name: "Alpha" },
      billableSeconds: 3600,
      displaySeconds: 3600,
      amount: 100,
      rate: 50,
      childRows: [{ project: { id: "p1a", name: "Alpha child" }, billableSeconds: 1800, displaySeconds: 1800, amount: 25, rate: 50 }],
    }],
    totals: { seconds: 5400, amount: 125 },
  };

  /**
   * **The run's answer arrives first and the context second**, which is the order the host calls
   * this in - `renderer.render(envelope.result, createRendererContext())`.
   */
  it("is called with the result first and the context second, as the host calls it", () => {
    assert.match(host, /renderer\.render\(envelope\.result, createRendererContext\(\)\)/);
    assert.match(source, /function renderProjectTimeBillingResult\(summaryBody, context\)/);
    assert.match(host, /@property \{\(result\?: unknown, context\?: unknown\) => unknown\} render/);
  });

  it("answers the empty state for a run with no rows", () => {
    const testCase = reportingCase();
    for (const body of [{ rows: [] }, { rows: "none" }, {}, null, "not-a-record"]) {
      const result = testCase.api.renderProjectTimeBillingResult(body, testCase.context);
      assert.equal(result.state, "empty");
      assert.equal(result.title, "No report results");
      assert.equal(result.message, "No time entries match these filters.");
    }
  });

  it("answers a ready result with the table inside its own results element", () => {
    const testCase = reportingCase();
    const result = testCase.api.renderProjectTimeBillingResult(summary, testCase.context);
    assert.equal(result.state, "ready");
    const root = testCase.viewCalls.find((call) => call.tag === "div");
    assert.deepEqual(plain(root?.options.dataset), { timeProjectBillingResults: "" });
  });

  it("builds the four report columns through the framework data table", () => {
    const testCase = reportingCase();
    testCase.api.renderProjectTimeBillingResult(summary, testCase.context);
    const table = testCase.viewCalls.find((call) => call.tag === "#data-table");
    assert.deepEqual(
      plain(table?.options.columns).map((/** @type {{label: string}} */ column) => column.label),
      ["Project", "Billing Rate", "Total Time", "Billable Amount"],
    );
    assert.deepEqual(plain(table?.options.hierarchy), { depthField: "depth", parentField: "parentId", pathField: "path" });
  });

  it("appends the runner totals as a table foot", () => {
    const testCase = reportingCase();
    const table = testCase.document.createElement("table");
    testCase.api.appendRunnerTotals(table, summary.totals, testCase.context);
    const cells = testCase.viewCalls.filter((call) => call.tag === "th" || call.tag === "td");
    assert.deepEqual(cells.map((call) => call.options.text), ["Totals", "1.50 hrs", "$125.00"]);
    assert.equal(testCase.viewCalls.some((call) => call.tag === "tfoot"), true);
  });

  it("reads absent totals as zero and skips a table it was not given", () => {
    const testCase = reportingCase();
    testCase.api.appendRunnerTotals(testCase.document.createElement("table"), undefined, testCase.context);
    const cells = testCase.viewCalls.filter((call) => call.tag === "td");
    assert.deepEqual(cells.map((call) => call.options.text), ["0.00 hrs", "$0.00"]);

    const skipped = reportingCase();
    skipped.api.appendRunnerTotals(null, summary.totals, skipped.context);
    assert.equal(skipped.viewCalls.length, 0);
  });
});

describe("Time Tracking reporting row expansion", () => {
  // `displaySeconds` and `billableSeconds` deliberately differ: the time column shows what the
  // row displays, while the rate and amount are shown only when there is billable time.
  const rows = [{
    project: { id: "p1", name: "Alpha" },
    billableSeconds: 3600,
    displaySeconds: 5400,
    amount: 100,
    rate: 50,
    childRows: [{ project: { id: "p1a", name: "Alpha child" }, billableSeconds: 0, displaySeconds: 1800, amount: 0, rate: 0 }],
  }];

  it("hides child rows until their parent is expanded", () => {
    const collapsed = reportingCase();
    assert.deepEqual(plain(collapsed.api.flattenVisibleRows(rows)).map((/** @type {{rowId: string}} */ row) => row.rowId), ["p1"]);

    const expanded = reportingCase();
    expanded.sandbox.expandedProjectRows.add("p1");
    const flattened = plain(expanded.api.flattenVisibleRows(rows));
    assert.deepEqual(flattened.map((/** @type {{rowId: string}} */ row) => row.rowId), ["p1", "p1a"]);
    assert.deepEqual(flattened.map((/** @type {{depth: number}} */ row) => row.depth), [0, 1]);
    assert.deepEqual(flattened[1].path, ["p1", "p1a"]);
    assert.equal(flattened[1].parentId, "p1");
  });

  it("marks a row as having children whether or not it is open", () => {
    const testCase = reportingCase();
    const [row] = plain(testCase.api.flattenVisibleRows(rows));
    assert.equal(row.hasChildren, true);
    assert.equal(row.isExpanded, false);
  });

  /** A row with no billable time shows its total time but no rate or amount. */
  it("blanks the rate and amount for a row with no billable time", () => {
    const testCase = reportingCase();
    testCase.sandbox.expandedProjectRows.add("p1");
    const [parent, child] = plain(testCase.api.flattenVisibleRows(rows));
    assert.deepEqual([parent.rateLabel, parent.amountLabel], ["$50.00/hr", "$100.00"]);
    assert.deepEqual([child.rateLabel, child.amountLabel], ["", ""]);
    assert.equal(child.timeLabel, "0.50 hrs", "the child still reports the time it displays");
  });

  /** The time column shows what the row displays, which is not the billable figure. */
  it("shows the displayed time rather than the billable time", () => {
    const testCase = reportingCase();
    const [parent] = plain(testCase.api.flattenVisibleRows(rows));
    assert.equal(parent.timeLabel, "1.50 hrs");
  });

  it("identifies a row by project id, then by name, then not at all", () => {
    const { api } = reportingCase();
    assert.equal(api.getReportRowId({ project: { id: "p1", name: "Alpha" } }), "p1");
    assert.equal(api.getReportRowId({ project: { name: "Alpha" } }), "Alpha");
    assert.equal(api.getReportRowId({ project: "Alpha" }), "");
    assert.equal(api.getReportRowId({}), "");
  });

  it("titles a row whose project carries no name", () => {
    const testCase = reportingCase();
    const [row] = plain(testCase.api.flattenVisibleRows([{ project: {} }]));
    assert.equal(row.projectName, "Project");
  });

  /** The toggle names the action it will perform, so the label flips with the row's state. */
  it("offers a toggle that names the action, and a spacer where there is none", () => {
    const testCase = reportingCase();
    const summary = { rows, totals: {} };
    const root = testCase.document.createElement("div");
    const [parent] = testCase.api.flattenVisibleRows(rows);

    testCase.api.createProjectCell(parent, summary, root, testCase.context);
    const toggle = testCase.viewCalls.find((call) => call.tag === "#action-button");
    assert.equal(toggle?.options.label, "Expand Alpha");
    assert.equal(toggle?.options.text, "+");

    const childless = reportingCase();
    const [leaf] = childless.api.flattenVisibleRows([{ project: { id: "p", name: "Leaf" } }]);
    childless.api.createProjectCell(leaf, summary, root, childless.context);
    assert.equal(childless.viewCalls.some((call) => call.tag === "#action-button"), false);
    assert.equal(
      childless.viewCalls.some((call) => call.options.className === "report-project-toggle-spacer"),
      true,
    );
  });

  it("names the collapse action once the row is open", () => {
    const testCase = reportingCase();
    testCase.sandbox.expandedProjectRows.add("p1");
    const [parent] = testCase.api.flattenVisibleRows(rows);
    testCase.api.createProjectCell(parent, { rows, totals: {} }, testCase.document.createElement("div"), testCase.context);
    const toggle = testCase.viewCalls.find((call) => call.tag === "#action-button");
    assert.equal(toggle?.options.label, "Collapse Alpha");
    assert.equal(toggle?.options.text, "-");
  });

  /** Activating the toggle flips the row and redraws the table from the same summary. */
  it("flips the row and redraws when the toggle is activated", () => {
    const testCase = reportingCase();
    const [parent] = testCase.api.flattenVisibleRows(rows);
    testCase.api.createProjectCell(parent, { rows, totals: {} }, testCase.document.createElement("div"), testCase.context);
    const toggle = testCase.viewCalls.find((call) => call.tag === "#action-button");

    const before = testCase.viewCalls.filter((call) => call.tag === "#data-table").length;
    /** @type {() => void} */ (toggle?.options.onClick)();
    assert.equal(testCase.sandbox.expandedProjectRows.has("p1"), true);
    assert.equal(testCase.viewCalls.filter((call) => call.tag === "#data-table").length, before + 1);

    /** @type {() => void} */ (toggle?.options.onClick)();
    assert.equal(testCase.sandbox.expandedProjectRows.has("p1"), false);
  });

  it("marks each drawn row as a parent or a child row", () => {
    const testCase = reportingCase();
    testCase.sandbox.expandedProjectRows.add("p1");
    const root = testCase.document.createElement("div");
    testCase.api.renderProjectTimeBillingTable(root, { rows, totals: {} }, testCase.context);
    const table = testCase.viewCalls.find((call) => call.tag === "#data-table");
    assert.deepEqual(
      plain(table?.options.rows).map((/** @type {{depth: number}} */ row) => row.depth),
      [0, 1],
    );

    const drawn = root.querySelectorAll("tbody tr");
    assert.deepEqual(
      drawn.map((/** @type {{classList: {contains: (name: string) => boolean}}} */ tableRow) => (
        tableRow.classList.contains("report-child-row") ? "child" : "parent"
      )),
      ["parent", "child"],
    );
  });

  /**
   * The totals reach the table through the render path, not only when called directly - and they
   * are read from the run's own `totals` rather than from the body that carries it.
   */
  it("appends the run's totals when it draws the table", () => {
    const testCase = reportingCase();
    const root = testCase.document.createElement("div");
    testCase.api.renderProjectTimeBillingTable(root, { rows, totals: { seconds: 7200, amount: 200 } }, testCase.context);
    const cells = testCase.viewCalls.filter((call) => call.tag === "td");
    assert.deepEqual(cells.map((call) => call.options.text), ["2.00 hrs", "$200.00"]);
    assert.equal(testCase.viewCalls.some((call) => call.tag === "tfoot"), true);
  });
});

describe("Time Tracking reporting tree ordering", () => {
  it("keeps a child directly after its parent and sorts siblings by name", () => {
    const { api } = reportingCase();
    const sorted = api.sortProjectTree([
      { id: "b", name: "Beta" },
      { id: "a", name: "Alpha" },
      { id: "b1", name: "Beta child", parentProjectId: "b" },
      { id: "a1", name: "Alpha child", parentProjectId: "a" },
    ]);
    assert.deepEqual(plain(sorted).map((/** @type {{id: string}} */ project) => project.id), ["a", "a1", "b", "b1"]);
  });

  /** An orphan whose parent is missing is still emitted, after the rooted branches. */
  it("emits an orphaned project rather than losing it", () => {
    const { api } = reportingCase();
    const sorted = api.sortProjectTree([
      { id: "a", name: "Alpha" },
      { id: "orphan", name: "Orphan", parentProjectId: "gone" },
    ]);
    assert.deepEqual(plain(sorted).map((/** @type {{id: string}} */ project) => project.id), ["a", "orphan"]);
  });

  it("emits a project in a parent cycle exactly once", () => {
    const { api } = reportingCase();
    const sorted = api.sortProjectTree([
      { id: "x", name: "X", parentProjectId: "y" },
      { id: "y", name: "Y", parentProjectId: "x" },
    ]);
    assert.deepEqual(plain(sorted).map((/** @type {{id: string}} */ project) => project.id), ["x", "y"]);
  });

  it("orders scopes by their ancestry path, with the workspace scope first", () => {
    const { api } = reportingCase();
    const scopes = [
      { id: "b", name: "Beta" },
      { id: "a-child", name: "Child", parentScopeId: "a" },
      { id: "a", name: "Alpha" },
      { id: "w", name: "Everything", isWorkspaceScope: true },
    ];
    assert.deepEqual(plain(api.sortScopeTree(scopes)).map((/** @type {{id: string}} */ scope) => scope.id), ["w", "a", "a-child", "b"]);
  });

  it("builds a scope sort key from its ancestry and stops at a cycle", () => {
    const { api } = reportingCase();
    const scopes = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta", parentScopeId: "a" },
      { id: "x", name: "X", parentScopeId: "y" },
      { id: "y", name: "Y", parentScopeId: "x" },
    ];
    assert.equal(api.getScopeTreeSortKey(scopes[1], scopes), "Alpha/Beta");
    assert.equal(api.getScopeTreeSortKey({ isWorkspaceScope: true, name: "Everything" }, scopes), "");
    assert.equal(api.getScopeTreeSortKey(scopes[2], scopes), "Y/X");
  });

  it("prefers a declared scope depth over walking the ancestry", () => {
    const { api } = reportingCase();
    const scopes = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta", parentScopeId: "a", depth: 4 }];
    assert.equal(api.getScopeDepth(scopes[1], scopes), 4);
    assert.equal(api.getScopeDepth({ id: "c", parentScopeId: "a" }, scopes), 1);
    assert.equal(api.getScopeDepth(undefined, scopes), 0);
  });

  /**
   * The walk counts each node it has not seen, so a two-node cycle answers 2 and then stops -
   * the point being that it terminates, not that it reports a meaningful depth for a cycle the
   * server cannot produce.
   */
  it("stops a depth walk at a cycle rather than recurring forever", () => {
    const { api } = reportingCase();
    const scopes = [{ id: "x", parentScopeId: "y" }, { id: "y", parentScopeId: "x" }];
    assert.equal(api.getScopeDepth(scopes[0], scopes), 2);
    const projects = [{ id: "x", parentProjectId: "y" }, { id: "y", parentProjectId: "x" }];
    assert.equal(api.getProjectDepth(projects[0], projects), 2);
  });

  it("indents only below the root", () => {
    const { api } = reportingCase();
    assert.equal(api.treeIndent(0), "");
    assert.equal(api.treeIndent(1), "  - ");
    assert.equal(api.treeIndent(2), "    - ");
  });

  /**
   * **`sensitivity: "base"` makes case and accent variants compare *equal*, not merely ordered.**
   * A workspace naming one client `Acme` and another `ácme` gets them adjacent in input order
   * rather than split apart by a collation rule nobody chose.
   */
  it("compares names case- and accent-insensitively, and tolerates a missing one", () => {
    const { api } = reportingCase();
    assert.equal(api.compareByName({ name: "alpha" }, { name: "Beta" }) < 0, true);
    assert.equal(api.compareByName({}, { name: "Alpha" }) < 0, true);
    assert.equal(api.compareByName({ name: "ácme" }, { name: "Acme" }), 0);
    assert.equal(api.compareByName({ name: "ZETA" }, { name: "zeta" }), 0);
  });

  it("orders scopes case- and accent-insensitively too", () => {
    const { api } = reportingCase();
    const scopes = [{ id: "b", name: "Beta" }, { id: "lower", name: "ácme" }, { id: "upper", name: "Acme" }];
    assert.deepEqual(
      plain(api.sortScopeTree(scopes)).map((/** @type {{id: string}} */ scope) => scope.id),
      ["lower", "upper", "b"],
    );
  });
});

describe("Time Tracking reporting value normalization", () => {
  it("splits, trims and de-duplicates a filter value however it arrives", () => {
    const { api } = reportingCase();
    assert.deepEqual(plain(api.normalizeListValue("a, b ,a")), ["a", "b"]);
    assert.deepEqual(plain(api.normalizeListValue(["a", "b,c"])), ["a", "b", "c"]);
    assert.deepEqual(plain(api.normalizeListValue("single")), ["single"]);
  });

  it("answers nothing for an absent value", () => {
    const { api } = reportingCase();
    assert.deepEqual(plain(api.normalizeListValue(undefined)), []);
    assert.deepEqual(plain(api.normalizeListValue(null)), []);
    assert.deepEqual(plain(api.normalizeListValue("")), []);
    assert.deepEqual(plain(api.normalizeListValue(",, ,")), []);
  });

  it("formats through the shared formatters when they are published", () => {
    const testCase = reportingCase();
    testCase.sandbox.formatters = { hours: () => "2h", currency: () => "EUR 1" };
    assert.equal(testCase.api.formatHours(7200), "2h");
    assert.equal(testCase.api.formatCurrency(1), "EUR 1");
    assert.equal(testCase.api.formatRate(1), "EUR 1/hr");
  });

  it("falls back to its own formatting when they are not", () => {
    const { api } = reportingCase();
    assert.equal(api.formatHours(5400), "1.50 hrs");
    assert.equal(api.formatCurrency(12.5), "$12.50");
    assert.equal(api.formatRate("50"), "$50.00/hr");
    assert.equal(api.formatHours(undefined), "0.00 hrs");
    assert.equal(api.formatCurrency("not-a-number"), "$0.00");
  });
});

describe("Time Tracking reporting shapes this file states rather than invents", () => {
  /**
   * The bootstrap body and the run result are untrusted wire values, and the scope, project and
   * row vocabularies are Time Tracking's own contribution rather than a framework contract - so
   * none of them is named in the shared declaration.
   */
  it("reads the responses as unguaranteed records and publishes no shape for them", () => {
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(source, /@typedef \{Record<string, unknown>\} ReportRecord/);
    assert.match(contracts, /registerRenderer\(rendererId\?: unknown, registration\?: unknown\): void;/);
    assert.equal(/export interface Browser(?:ReportScope|ReportProject|ReportSummary)\b/.test(contracts), false);
  });

  /** `flattenVisibleRows` is the producer of the display row, so that shape is named precisely. */
  it("names the display row it produces, and the published tag record it consumes", () => {
    assert.match(source, /@typedef \{object\} ReportDisplayRow/);
    assert.match(source, /BrowserTagCatalogRecord\} BrowserTagCatalogRecord/);
    assert.equal(source.includes("tag_id: string"), false, "the tag shape is imported, not restated");
  });

  /**
   * `view` is named as required and nothing here validates it: the host reads it optionally from
   * the same namespace, and every draw has always dereferenced it without a guard, so an absent
   * factory fails at exactly the line it failed at before.
   */
  it("states the view factory as a precondition without pretending to check it", () => {
    assert.match(source, /\*\*`view` is stated as required, and nothing here validates it\.\*\*/);
    assert.match(source, /context\.view\.createDataTable\(/);
    assert.equal(source.includes("requireReportView"), false);
  });

  it("carries no suppression and no document query of its own", () => {
    assert.equal(source.includes("document.querySelector"), false);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
