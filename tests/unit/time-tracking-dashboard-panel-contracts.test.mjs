import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-tracking-dashboard.js");

const LIFTED = [
  "timeTrackingRecord", "timeTrackingRecordList", "requirePanelContext",
  "renderActiveTimersPanel", "renderRecentTimePanel", "hydrateTimeTrackingPanel",
  "loadEffortSummary", "contextLoad",
  "createActiveTimersContent", "createRecentTimeContent",
  "createMetricStrip", "createTimeTrackingRows", "createTimeTrackingRow", "createActionRow",
  "createPanelBody", "renderError", "formatHours",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Drains the microtask queue, so a panel's own hydration has settled before it is read. */
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/**
 * The words of every span that carries nothing but text - the metric labels and the row meta line.
 *
 * A row's status badge is also a span but carries a class beside its text, and the metric wrapper
 * carries children. Both of those fooled an earlier spelling of this filter, so it is written once
 * here rather than at each call site.
 * @param {{ callsOf: (tag: string) => { options: Record<string, unknown> }[] }} testCase
 */
const textSpans = (testCase) => testCase.callsOf("span")
  .filter((call) => "text" in call.options && Object.keys(call.options).length === 1)
  .map((call) => call.options.text);

/**
 * The destinations and words of every link drawn.
 * @param {{ callsOf: (tag: string) => { options: Record<string, unknown> }[] }} testCase
 */
const links = (testCase) => testCase.callsOf("a")
  .map((call) => ({ href: plain(call.options.attrs)?.href, text: call.options.text }));

/**
 * @param {object} [options]
 * @param {unknown} [options.effortSummary] what the route answers
 * @param {boolean} [options.failLoad]
 * @param {Record<string, unknown>} [options.formatters]
 * @param {((route: string) => Promise<unknown>) | null} [options.loadRoute]
 */
function panelCase(options = {}) {
  const document = new FakeDocument();

  /** @type {{ tag: string, options: Record<string, unknown> }[]} */
  const viewCalls = [];
  /** @type {Record<string, unknown>[]} */
  const panelCalls = [];
  /** @type {string[]} */
  const apiRoutes = [];
  /** @type {{ route: string, options: unknown }[]} */
  const apiCalls = [];
  /** @type {string[]} */
  const bootstrapRoutes = [];

  /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
  const record = (tag, createOptions = {}) => {
    viewCalls.push({ tag, options: createOptions });
    const element = document.createElement(tag);
    if (typeof createOptions.text === "string") element.textContent = createOptions.text;
    if (Array.isArray(createOptions.children)) {
      for (const child of createOptions.children) {
        if (child) element.appendChild(/** @type {never} */ (child));
      }
    }
    return element;
  };

  const view = {
    /** @param {string} tag @param {Record<string, unknown>} [createOptions] */
    createElement: (tag, createOptions) => record(tag, createOptions),
    /** @param {Record<string, unknown>} createOptions */
    createEmptyState: (createOptions) => record("#empty-state", createOptions),
  };

  const context = {
    view,
    /** @param {Record<string, unknown>} [createOptions] */
    createPanel: (createOptions = {}) => {
      panelCalls.push(createOptions);
      return record("#panel", createOptions);
    },
  };

  const effortSummaryPromises = new Map();
  const loadRoute = options.loadRoute === undefined
    ? (/** @type {string} */ route) => {
      bootstrapRoutes.push(route);
      return options.failLoad ? Promise.reject(new Error("no")) : Promise.resolve(options.effortSummary);
    }
    : options.loadRoute;

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    console: { error: () => {} },
    formatters: options.formatters,
    effortSummaryPromises,
    DEFAULT_EFFORT_SUMMARY_ROUTE: "/api/time-tracking/dashboard/effort-summary",
    window: { LongtailForge: { dashboardBootstrap: loadRoute ? { loadRoute } : {} } },
    requireApi: () => ({
      /** @param {string} route @param {unknown} [requestOptions] */
      getJson: (route, requestOptions) => {
        apiRoutes.push(route);
        apiCalls.push({ route, options: requestOptions });
        return options.failLoad ? Promise.reject(new Error("no")) : Promise.resolve(options.effortSummary);
      },
    }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);

  /** @param {string} tag */
  const callsOf = (tag) => viewCalls.filter((call) => call.tag === tag);

  return { api, sandbox, document, context, view, viewCalls, callsOf, panelCalls, apiRoutes, apiCalls, bootstrapRoutes, effortSummaryPromises };
}

describe("Time Tracking dashboard wire readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = panelCase();
    assert.deepEqual(plain(api.timeTrackingRecord({ a: 1 })), { a: 1 });
    assert.equal(api.timeTrackingRecord(null), null);
    assert.equal(api.timeTrackingRecord(["a"]), null);
    assert.equal(api.timeTrackingRecord("a"), null);
  });

  it("keeps a malformed row as an empty record rather than dropping it", () => {
    const { api } = panelCase();
    const rows = api.timeTrackingRecordList([{ title: "A" }, "b", null, 3]);
    assert.equal(rows.length, 4);
    assert.deepEqual(plain(rows), [{ title: "A" }, {}, {}, {}]);
    assert.deepEqual(plain(api.timeTrackingRecordList("rows")), []);
  });

  /**
   * **`DashboardPanelRenderer` types the context as `unknown` on purpose**, so the narrowing
   * belongs here - and what it checks must be everything the returned type promises.
   *
   * The three `view` cases below are the ones an earlier spelling accepted: it tested `view` for
   * truthiness only, so `view: true` and `view: {}` passed and were handed back as something that
   * says it can build elements. A guard that admits those is not narrowing, it is asserting.
   */
  it("requires a panel builder and a view that can actually build, and names what is missing", () => {
    const testCase = panelCase();
    const panelBuilder = () => testCase.document.createElement("div");
    const element = () => testCase.document.createElement("div");
    assert.equal(testCase.api.requirePanelContext(testCase.context), testCase.context);

    const refused = [
      null, undefined, "context", ["view"],
      { view: testCase.view },
      { createPanel: panelBuilder },
      { view: testCase.view, createPanel: "no" },
      { view: true, createPanel: panelBuilder },
      { view: {}, createPanel: panelBuilder },
      { view: { createElement: element }, createPanel: panelBuilder },
      { view: { createEmptyState: element }, createPanel: panelBuilder },
      { view: { createElement: "no", createEmptyState: element }, createPanel: panelBuilder },
    ];
    for (const bad of refused) {
      assert.throws(
        () => testCase.api.requirePanelContext(bad),
        /panel builder and a view factory that can create elements and empty states/,
        `must refuse ${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("Time Tracking dashboard panels", () => {
  it("registers both panels under their contributed renderer ids", () => {
    assert.match(source, /registerPanelRenderer\("time-tracking\.active-timers", renderActiveTimersPanel\)/);
    assert.match(source, /registerPanelRenderer\("time-tracking\.recent-time", renderRecentTimePanel\)/);
  });

  it("titles each panel from its contribution, with its own fallback", () => {
    const named = panelCase();
    named.api.renderActiveTimersPanel({ label: "My Timers" }, named.context);
    assert.equal(named.panelCalls[0].title, "My Timers");

    const unnamed = panelCase();
    unnamed.api.renderActiveTimersPanel({}, unnamed.context);
    assert.equal(unnamed.panelCalls[0].title, "Active Timers");

    const recent = panelCase();
    recent.api.renderRecentTimePanel({}, recent.context);
    assert.equal(recent.panelCalls[0].title, "Recent Time");
  });

  it("titles a panel whose contribution is not a record at all", () => {
    const testCase = panelCase();
    testCase.api.renderRecentTimePanel("contribution", testCase.context);
    assert.equal(testCase.panelCalls[0].title, "Recent Time");
  });

  /**
   * **An array is the one non-record a contribution can still be read through**, because an array
   * can carry named members while a string or a number cannot. That is the whole runtime effect of
   * `timeTrackingRecord` refusing arrays at this call site, so it is what this asserts: the panel
   * keeps its own title and its own route rather than taking either from the array.
   */
  it("refuses a contribution that is an array, even one carrying named members", async () => {
    const testCase = panelCase({ effortSummary: {} });
    /** @type {string[] & { label?: string, dataRoute?: string }} */
    const contribution = [];
    contribution.label = "From an array";
    contribution.dataRoute = "/api/somewhere-else";

    testCase.api.renderRecentTimePanel(contribution, testCase.context);
    await flush();
    assert.equal(testCase.panelCalls[0].title, "Recent Time");
    assert.deepEqual(testCase.bootstrapRoutes, ["/api/time-tracking/dashboard/effort-summary"]);
  });

  /**
   * Each panel hydrates with **its own** content builder. Nothing else says so: the builders are
   * exercised directly, and the panels were only read for their titles - so swapping the two drew
   * the wrong metrics under the right heading and no assertion moved.
   */
  it("hydrates each panel with its own content", async () => {
    const effortSummary = {
      activeTimers: { count: 3, runningCount: 2, pausedCount: 1, rows: [] },
      recentTime: { windowDays: 30, totalSeconds: 7200, todaySeconds: 3600, entriesCount: 12, rows: [] },
    };

    const active = panelCase({ effortSummary });
    active.api.renderActiveTimersPanel({}, active.context);
    await flush();
    assert.deepEqual(textSpans(active), ["Active/paused", "Running", "Paused"]);

    const recent = panelCase({ effortSummary });
    recent.api.renderRecentTimePanel({}, recent.context);
    await flush();
    assert.deepEqual(textSpans(recent), ["Last 30 days", "Today", "Entries"]);
  });

  it("shows a loading body that announces itself before the data arrives", () => {
    const active = panelCase();
    const body = active.api.createPanelBody(active.context, "Loading active timers...");
    assert.equal(body.textContent, "Loading active timers...");
    const call = active.callsOf("div")[0];
    assert.equal(call.options.className, "dashboard-panel-body");
    assert.deepEqual(plain(call.options.attrs), { role: "status" });
  });

  it("replaces the body with an empty state when the summary cannot be loaded", async () => {
    const testCase = panelCase({ failLoad: true });
    const body = testCase.document.createElement("div");
    body.appendChild(testCase.document.createElement("span"));
    await testCase.api.hydrateTimeTrackingPanel(body, {}, testCase.context, () => testCase.document.createElement("p"));
    // Assert the empty state exists before reading it. Reading `[0].options` straight away turns
    // a missing announcement into a TypeError, which fails the suite without any assertion having
    // decided anything - and a crash is not proof this test would have noticed.
    assert.equal(testCase.callsOf("#empty-state").length, 1, "a failed summary must be announced");
    const emptyState = testCase.callsOf("#empty-state")[0];
    assert.equal(emptyState.options.title, "Time Tracking data unavailable");
    assert.equal(emptyState.options.message, "Time Tracking summary could not be loaded.");
  });

  it("replaces the loading body with the rendered content on success", async () => {
    const testCase = panelCase({ effortSummary: { activeTimers: { count: 2 } } });
    const body = testCase.document.createElement("div");
    /** @type {unknown[]} */
    const seen = [];
    await testCase.api.hydrateTimeTrackingPanel(body, {}, testCase.context, (/** @type {unknown} */ data) => {
      seen.push(data);
      return testCase.document.createElement("p");
    });
    assert.deepEqual(plain(seen), [{ activeTimers: { count: 2 } }]);
    assert.equal(body.children.length, 1);
  });

  it("hands the content builder an empty record when the summary is not one", async () => {
    const testCase = panelCase({ effortSummary: "summary" });
    /** @type {unknown[]} */
    const seen = [];
    await testCase.api.hydrateTimeTrackingPanel(
      testCase.document.createElement("div"), {}, testCase.context,
      (/** @type {unknown} */ data) => { seen.push(data); return testCase.document.createElement("p"); },
    );
    assert.deepEqual(plain(seen), [{}]);
  });
});

describe("Time Tracking dashboard effort summary loading", () => {
  /** The prewarmed promise map is shared with the entry module, so a route is requested once. */
  it("requests each route once and answers the memoized promise", async () => {
    const testCase = panelCase({ effortSummary: { ok: true } });
    const first = await testCase.api.loadEffortSummary({});
    const second = await testCase.api.loadEffortSummary({});
    assert.deepEqual(plain(first), { ok: true });
    assert.deepEqual(plain(second), { ok: true });
    assert.deepEqual(testCase.bootstrapRoutes, ["/api/time-tracking/dashboard/effort-summary"]);
  });

  it("uses the contribution's own route when it carries one", async () => {
    const testCase = panelCase({ effortSummary: {} });
    await testCase.api.loadEffortSummary({ dataRoute: "/api/custom/effort" });
    assert.deepEqual(testCase.bootstrapRoutes, ["/api/custom/effort"]);
  });

  it("falls back to the module's own route when the contribution names none", async () => {
    const testCase = panelCase({ effortSummary: {} });
    await testCase.api.loadEffortSummary({ dataRoute: "" });
    assert.deepEqual(testCase.bootstrapRoutes, ["/api/time-tracking/dashboard/effort-summary"]);
  });

  it("keeps the shared promise keyed by route", async () => {
    const testCase = panelCase({ effortSummary: {} });
    await testCase.api.loadEffortSummary({});
    await testCase.api.loadEffortSummary({ dataRoute: "/api/custom/effort" });
    assert.deepEqual(
      [...testCase.effortSummaryPromises.keys()],
      ["/api/time-tracking/dashboard/effort-summary", "/api/custom/effort"],
    );
  });

  /** The entry module's loader is preferred; this page's own fetch is the fallback. */
  it("prefers the published loader and falls back to its own fetch", async () => {
    const withLoader = panelCase({ effortSummary: {} });
    await withLoader.api.contextLoad("/api/effort");
    assert.deepEqual(withLoader.bootstrapRoutes, ["/api/effort"]);
    assert.deepEqual(withLoader.apiRoutes, []);

    const withoutLoader = panelCase({ effortSummary: {}, loadRoute: null });
    await withoutLoader.api.contextLoad("/api/effort");
    assert.deepEqual(withoutLoader.apiRoutes, ["/api/effort"]);
  });

  it("uses its own fetch when the published loader is not callable", async () => {
    const testCase = panelCase({ effortSummary: {} });
    testCase.sandbox.window.LongtailForge.dashboardBootstrap = { loadRoute: "/api/effort" };
    // Calling a published `loadRoute` that is not callable throws, and `contextLoad` is not an
    // async function, so it throws **synchronously**. The callback is `async` for exactly that
    // reason: it turns the synchronous throw into a rejection, so `doesNotReject` reports an
    // assertion failure instead of letting the raw TypeError be the whole result. The check is
    // that this page does not call what it did not verify.
    await assert.doesNotReject(async () => testCase.api.contextLoad("/api/effort"));
    assert.deepEqual(testCase.apiRoutes, ["/api/effort"]);
  });

  /**
   * A dashboard panel reports what is running *now*, so its own fetch bypasses the cache. The
   * published loader is not asked to - it owns that decision for every panel it serves.
   */
  it("asks its own fetch not to serve the summary from cache", async () => {
    const testCase = panelCase({ effortSummary: {}, loadRoute: null });
    await testCase.api.contextLoad("/api/effort");
    assert.deepEqual(plain(testCase.apiCalls), [{ route: "/api/effort", options: { cache: "no-store" } }]);
  });
});

describe("Time Tracking dashboard content", () => {
  const activeSummary = {
    activeTimers: {
      count: 3, runningCount: 2, pausedCount: 1,
      rows: [{ title: "Draft the brief", status: "running" }],
      action: { href: "/workbench.html", label: "Open Workbench" },
    },
  };

  it("shows the three active-timer metrics in order", () => {
    const testCase = panelCase();
    testCase.api.createActiveTimersContent(activeSummary, testCase.context);
    assert.deepEqual(textSpans(testCase), ["Active/paused", "Running", "Paused"]);
    assert.deepEqual(testCase.callsOf("strong").map((call) => call.options.text), ["3", "2", "1", "Draft the brief"]);
  });

  it("shows zero for each metric the summary omits", () => {
    const testCase = panelCase();
    testCase.api.createActiveTimersContent({}, testCase.context);
    assert.deepEqual(testCase.callsOf("strong").map((call) => call.options.text), ["0", "0", "0"]);
  });

  it("shows the recent-time window, its totals and its entry count", () => {
    const testCase = panelCase();
    testCase.api.createRecentTimeContent({
      recentTime: { windowDays: 30, totalSeconds: 7200, todaySeconds: 3600, entriesCount: 12, rows: [] },
    }, testCase.context);
    assert.equal(textSpans(testCase)[0], "Last 30 days");
    assert.deepEqual(testCase.callsOf("strong").map((call) => call.options.text), ["2.00 hrs", "1.00 hrs", "12"]);
  });

  it("defaults the recent-time window to seven days", () => {
    const testCase = panelCase();
    testCase.api.createRecentTimeContent({ recentTime: { rows: [] } }, testCase.context);
    assert.equal(textSpans(testCase)[0], "Last 7 days");
  });

  it("reads a summary branch that is not a record as an absent one", () => {
    const testCase = panelCase();
    testCase.api.createRecentTimeContent({ recentTime: "recent" }, testCase.context);
    assert.deepEqual(testCase.callsOf("strong").map((call) => call.options.text), ["0.00 hrs", "0.00 hrs", "0"]);
  });

  /** The array case, for the same reason it matters for a contribution: an array can carry names. */
  it("reads a summary branch that is an array as an absent one", () => {
    const testCase = panelCase();
    /** @type {unknown[] & { windowDays?: number, entriesCount?: number }} */
    const recentTime = [];
    recentTime.windowDays = 30;
    recentTime.entriesCount = 12;
    testCase.api.createRecentTimeContent({ recentTime }, testCase.context);
    assert.equal(textSpans(testCase)[0], "Last 7 days");
    assert.deepEqual(testCase.callsOf("strong").map((call) => call.options.text), ["0.00 hrs", "0.00 hrs", "0"]);
  });

  /**
   * **Each count falls back to zero where it is read, not only where it is drawn.** The strip
   * answers `0` for a metric that is absent, but a count the wire sends as an empty value or as
   * `NaN` is present - so without the fallback at the call site a dashboard shows a blank or the
   * word `NaN` where a number belongs.
   */
  it("shows zero for a count that arrives unreadable rather than absent", () => {
    const active = panelCase();
    active.api.createActiveTimersContent({
      activeTimers: { count: Number.NaN, runningCount: "", pausedCount: 1, rows: [] },
    }, active.context);
    assert.deepEqual(active.callsOf("strong").map((call) => call.options.text), ["0", "0", "1"]);

    const recent = panelCase();
    recent.api.createRecentTimeContent({ recentTime: { entriesCount: "", rows: [] } }, recent.context);
    assert.deepEqual(recent.callsOf("strong").map((call) => call.options.text), ["0.00 hrs", "0.00 hrs", "0"]);
  });

  /** Each panel offers the action its own branch of the summary carries. */
  it("offers the action each summary branch carries", () => {
    const active = panelCase();
    active.api.createActiveTimersContent(activeSummary, active.context);
    assert.deepEqual(links(active), [{ href: "/workbench.html", text: "Open Workbench" }]);

    const recent = panelCase();
    recent.api.createRecentTimeContent({
      recentTime: { rows: [], actions: [{ href: "/reports.html", label: "Open reports" }] },
    }, recent.context);
    assert.deepEqual(links(recent), [{ href: "/reports.html", text: "Open reports" }]);
  });

  it("names a metric that carries no label", () => {
    const testCase = panelCase();
    testCase.api.createMetricStrip(testCase.context, [{ label: "", value: 4 }]);
    assert.equal(textSpans(testCase)[0], "Metric");
  });

  it("shows zero for a metric with no value at all", () => {
    const testCase = panelCase();
    testCase.api.createMetricStrip(testCase.context, [{ label: "Running", value: undefined }]);
    assert.equal(testCase.callsOf("strong")[0].options.text, "0");
  });
});

describe("Time Tracking dashboard rows", () => {
  const row = {
    title: "Draft the brief",
    status: "running",
    sourceLabel: "Tasks",
    contextLabel: "Acme / Rebuild",
    elapsedLabel: "1h 20m",
    endedAtLabel: "Ended 14:05",
    action: { href: "/tasks.html?task=1", label: "Open task" },
  };

  it("says so when there is nothing to list, rather than drawing an empty list", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRows(testCase.context, [], "No active or paused timers.");
    assert.equal(testCase.callsOf("p").length, 1, "an empty list must say so rather than draw nothing");
    const empty = testCase.callsOf("p")[0];
    assert.equal(empty.options.text, "No active or paused timers.");
    assert.equal(empty.options.className, "dashboard-task-empty");
    assert.equal(testCase.callsOf("ul").length, 0);
  });

  it("lists one row per entry", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRows(testCase.context, [row, row], "empty");
    assert.equal(testCase.callsOf("ul").length, 1);
    assert.equal(testCase.callsOf("li").length, 2);
  });

  it("titles a row and badges its status", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, row);
    assert.equal(testCase.callsOf("strong")[0].options.text, "Draft the brief");
    const badge = testCase.callsOf("span").find((call) => call.options.className === "dashboard-task-row-badge");
    assert.equal(badge?.options.text, "running");
  });

  it("titles a row that carries none and omits an absent badge", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, {});
    assert.equal(testCase.callsOf("strong")[0].options.text, "Time Tracking item");
    assert.equal(testCase.callsOf("span").some((call) => call.options.className === "dashboard-task-row-badge"), false);
  });

  /** The meta line is built from four optional labels, in order, with the blanks dropped. */
  it("builds the meta line from the labels the row carries, in order", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, row);
    const meta = textSpans(testCase);
    assert.deepEqual(meta, ["Tasks", "Acme / Rebuild", "1h 20m", "Ended 14:05"]);
  });

  it("falls back from an elapsed label to a duration label", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, { ...row, elapsedLabel: "", durationLabel: "45m" });
    const meta = textSpans(testCase);
    assert.deepEqual(meta, ["Tasks", "Acme / Rebuild", "45m", "Ended 14:05"]);
  });

  it("drops every meta label the row does not carry", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, { title: "Bare" });
    const meta = textSpans(testCase);
    assert.deepEqual(meta, []);
  });

  /** A row links out only when its action carries somewhere to go. */
  it("links a row that has an action and leaves one that does not", () => {
    const linked = panelCase();
    linked.api.createTimeTrackingRow(linked.context, row);
    assert.equal(linked.callsOf("a").length, 1, "a row with somewhere to go must link there");
    const anchor = linked.callsOf("a")[0];
    assert.deepEqual(plain(anchor.options.attrs), { href: "/tasks.html?task=1" });
    assert.equal(anchor.options.text, "Open task");

    const unlinked = panelCase();
    unlinked.api.createTimeTrackingRow(unlinked.context, { ...row, action: { label: "Nowhere" } });
    assert.equal(unlinked.callsOf("a").length, 0);
  });

  it("names a row action that carries no label", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, { ...row, action: { href: "/x" } });
    assert.equal(testCase.callsOf("a")[0].options.text, "Open");
  });

  it("reads a row action that is not a record as an absent one", () => {
    const testCase = panelCase();
    testCase.api.createTimeTrackingRow(testCase.context, { ...row, action: "/x" });
    assert.equal(testCase.callsOf("a").length, 0);

    const asArray = panelCase();
    /** @type {unknown[] & { href?: string, label?: string }} */
    const action = [];
    action.href = "/from-an-array";
    action.label = "Open";
    asArray.api.createTimeTrackingRow(asArray.context, { ...row, action });
    assert.deepEqual(links(asArray), []);
  });
});

describe("Time Tracking dashboard action row", () => {
  it("offers only the actions that carry somewhere to go", () => {
    const testCase = panelCase();
    testCase.api.createActionRow(testCase.context, [
      { href: "/a", label: "A" }, { label: "B" }, { href: "/c", label: "C" },
    ]);
    assert.deepEqual(testCase.callsOf("a").map((call) => call.options.text), ["A", "C"]);
  });

  it("answers nothing at all when no action can be offered", () => {
    const testCase = panelCase();
    assert.equal(testCase.api.createActionRow(testCase.context, [{ label: "B" }]), null);
    assert.equal(testCase.api.createActionRow(testCase.context, []), null);
    assert.equal(testCase.api.createActionRow(testCase.context), null);
    assert.equal(testCase.callsOf("div").length, 0);
  });

  it("names an action that carries no label", () => {
    const testCase = panelCase();
    testCase.api.createActionRow(testCase.context, [{ href: "/a" }]);
    assert.equal(testCase.callsOf("a")[0].options.text, "Open");
  });
});

describe("Time Tracking dashboard hours", () => {
  it("formats through the shared formatter when it is published", () => {
    const testCase = panelCase({ formatters: { hours: () => "2h" } });
    assert.equal(testCase.api.formatHours(7200), "2h");
  });

  it("falls back to its own formatting when the formatter is absent or not callable", () => {
    assert.equal(panelCase().api.formatHours(5400), "1.50 hrs");
    // A published `hours` that is not callable must not be called. Asserting no throw is what
    // makes that an assertion rather than a crash the suite merely reports.
    const uncallable = panelCase({ formatters: { hours: "nope" } });
    assert.doesNotThrow(() => uncallable.api.formatHours(5400));
    assert.equal(uncallable.api.formatHours(5400), "1.50 hrs");
  });

  it("answers zero hours for a value it cannot read", () => {
    const { api } = panelCase();
    assert.equal(api.formatHours("nope"), "0.00 hrs");
    assert.equal(api.formatHours(undefined), "0.00 hrs");
    assert.equal(api.formatHours(null), "0.00 hrs");
  });
});

describe("Time Tracking dashboard shapes this renderer states rather than invents", () => {
  /**
   * The contribution and the effort summary are both untrusted, and their vocabularies belong to
   * whichever module contributed them - so this renderer reads them as records and publishes
   * nothing for them.
   */
  it("reads the contribution and the summary as unguaranteed records", () => {
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(source, /@typedef \{Record<string, unknown>\} TimeTrackingRecord/);
    assert.match(contracts, /export type DashboardPanelRenderer = \(contribution\?: unknown, context\?: unknown\) => unknown;/);
    assert.equal(/export interface Browser(?:TimeTrackingEffortSummary|TimeTrackingPanelRow)\b/.test(contracts), false);
  });

  /**
   * The narrowing belongs here rather than in the contract, which types the context `unknown` on
   * purpose - and it checks rather than asserts.
   */
  /**
   * **The declared context shape must not promise more than the guard checks.** This is the pin
   * that would have caught the earlier spelling, where `view` was declared as the published
   * `BrowserViewFactory` and only tested for truthiness.
   */
  it("narrows the host context by checking every member the returned type declares", () => {
    assert.match(source, /function requirePanelContext\(value\)/);
    assert.match(source, /const view = context && timeTrackingRecord\(context\.view\);/);
    assert.match(source, /typeof context\.createPanel !== "function"/);
    assert.match(source, /typeof view\.createElement !== "function"/);
    assert.match(source, /typeof view\.createEmptyState !== "function"/);

    // The view is declared as exactly the two functions checked above - no published factory type.
    assert.match(source, /@typedef \{object\} TimeTrackingPanelView/);
    assert.match(source, /@property \{\(tag: string, options\?: Record<string, unknown>\) => HTMLElement\} createElement/);
    assert.match(source, /@property \{\(options\?: Record<string, unknown>\) => HTMLElement\} createEmptyState/);
    assert.match(source, /@property \{TimeTrackingPanelView\} view/);
    assert.doesNotMatch(source, /BrowserViewFactory\} view/);
  });

  it("keeps the prewarmed promise map it shares with the entry module", () => {
    assert.match(source, /const effortSummaryPromises = window\.LongtailForge\?\.dashboardBootstrap\?\.dataPromises \|\| new Map\(\)/);
    assert.match(source, /if \(!effortSummaryPromises\.has\(route\)\) \{\s*\n\s*effortSummaryPromises\.set\(route, contextLoad\(route\)\);/);
  });

  /**
   * The panel is a compact summary, not the reporting surface: these names belong to the Time
   * Tracking report and must never appear here. Asserted in this file's own suite as well as in
   * the sibling that owns the claim.
   */
  it("names no billing table, billables chart or currency formatter", () => {
    assert.doesNotMatch(
      source,
      /current-month-billables|hours-billables-chart|Current Month Billables|Hours & Billables|Billable Amount|createBillablesChart|formatCurrency|billing-summary/,
    );
  });

  it("carries no suppression and no document query of its own", () => {
    assert.equal(source.includes("document.querySelector"), false);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
