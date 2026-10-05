import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/tasks-dashboard.js");
const hostSource = read("public/js/dashboard.js");
const service = read("src/modules/tasks/tasks.service.js");
const names = ["isTasksDashboardRecord", "tasksDashboardRecord", "requireTasksDashboardContext",
  "renderTasksNeedsAttentionContribution", "renderTasksTodayUpcomingContribution", "renderTasksPressureContribution",
  "renderTasksCalendarContribution", "renderTasksDashboardContribution", "hydrateTasksDashboardPanel",
  "createTasksNeedsAttentionContent", "createTasksTodayUpcomingContent", "createTasksPressureContent",
  "createDashboardTaskMetricGrid", "createTaskMetric", "createDashboardTaskRows", "createDashboardTaskRow", "createDashboardTaskActions"];

function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const loads = [];
  /** @type {unknown[][]} */ const statuses = [];
  /** @type {unknown[][]} */ const errors = [];
  const context = vm.createContext({ ...browser, ...fakeDomConstructors(), console: { error: (/** @type {unknown[]} */ ...args) => errors.push(args) },
    dashboardData: {}, findDashboardContribution: () => null,
    loadContributionData: (/** @type {unknown[]} */ ...args) => { loads.push(args); return Promise.resolve({}); },
    setDashboardStatus: (/** @type {unknown[]} */ ...args) => statuses.push(args),
    createDashboardPanel: (/** @type {unknown} */ contribution, /** @type {Record<string, unknown>} */ options) => context.window.LongtailForge.view.createElement("article", options),
    DEFAULT_TASK_SUMMARY_ROUTE: "/api/tasks/dashboard-summary",
    DASHBOARD_WORKBENCH_URL: "workbench.html", DASHBOARD_TASKS_URL: "tasks.html", TASKS_MODULE_ID: "tasks",
    dashboardTaskContextLabel: () => "Client / Project", dashboardTaskDueLabel: () => "Due today",
  });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  vm.runInContext(extractFunctionBlock(hostSource, "createDashboardRendererContext"), context);
  for (const name of ["dashboardTaskMetric", "dashboardTaskActions", "dashboardTaskWorkbenchAction", "dashboardTaskRow"])
    vm.runInContext(extractFunctionBlock(service, name), context);
  const api = vm.runInContext(`({${names.join(",")}, createDashboardRendererContext, dashboardTaskMetric, dashboardTaskActions, dashboardTaskRow})`, context);
  const host = api.createDashboardRendererContext({ id: "tasks.test" });
  return { ...browser, context, api, host, loads, statuses, errors };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

// These cases exercise real producer bodies and real view coercion. No mutation campaign:
// parameter annotations are compiler proof; no equivalent/invalid case is credited as a kill.
describe("Tasks dashboard consumer boundaries", () => {
  it("accepts the actual host producer and refuses each missing/noncallable consumed channel", () => {
    const f = fixture();
    assert.equal(f.api.requireTasksDashboardContext(f.host), undefined);
    for (const key of ["createPanel", "loadContributionData", "setStatus"])
      for (const bad of [undefined, null, true, {}]) assert.throws(() => f.api.requireTasksDashboardContext({ ...f.host, [key]: bad }), /host panel/);
    for (const key of ["createElement", "createEmptyState"])
      assert.throws(() => f.api.requireTasksDashboardContext({ ...f.host, view: { ...f.host.view, [key]: "opaque" } }), /host panel/);
    for (const bad of [null, [], true, { ...f.host, view: {} }])
      assert.throws(() => f.api.requireTasksDashboardContext(bad), /host panel/);
    // Callable channels inherited from a host prototype remain legitimate host channels.
    assert.doesNotThrow(() => f.api.requireTasksDashboardContext(Object.create(f.host)));
  });

  it("keeps the absent-calendar path ahead of host acquisition", () => {
    const f = fixture(); assert.equal(f.api.renderTasksCalendarContribution(null, null), null);
  });

  it("builds the real ordered calendar switch and activates its selected view once", async () => {
    const f = fixture();
    /** @type {string[]} */ const views = [];
    /** @type {() => void} */ let markRendered = () => {};
    /** @type {Promise<void>} */ const rendered = new Promise((resolve) => { markRendered = resolve; });
    f.context.window.LongtailForge.taskCalendar = {
      readPreferredCalendarView: () => null, resolveDefaultView: () => "month",
      calendarRange: (/** @type {string} */ view) => { views.push(view); return { label: view }; },
      fetchCalendarWindow: () => Promise.resolve({}), renderCalendarBody: () => { markRendered(); return true; },
    };
    const panel = f.api.renderTasksCalendarContribution({}, f.host);
    const buttons = panel.querySelectorAll("button");
    assert.deepEqual(buttons.map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ button) => button.dataset.dashboardCalendarView), ["month", "week", "day"]);
    buttons[1].dispatchEvent({ type: "click" });
    assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
    assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
    buttons[1].dispatchEvent({ type: "click" });
    assert.deepEqual(views, ["month", "week"]);
    await rendered;
    assert.equal(panel.querySelector(".dashboard-calendar-period").textContent, "week");
  });

  it("retains own opaque wire values and metadata without admitting inherited members", () => {
    const f = fixture(), extra = { untouched: true };
    const value = Object.assign(Object.create({ title: "inherited", href: "wrong" }), { label: 42, extra });
    const result = f.api.tasksDashboardRecord(value);
    assert.deepEqual(plain(result), { label: 42, extra: { untouched: true } });
    assert.equal(result.extra, extra); assert.notEqual(result, value);
    for (const bad of [null, undefined, false, 12, "text", []]) assert.deepEqual(plain(f.api.tasksDashboardRecord(bad)), {});
  });

  it("renders the real server metric/action/row producers with ordered reasons and handoffs", () => {
    const f = fixture();
    const task = { task_id: "task/a", title: "Real task", assignee_ids: ["me"], estimate_minutes: 8 };
    const row = f.api.dashboardTaskRow(task, { timerByTaskId: new Map([[task.task_id, { timer_status: "running" }]]),
      reasons: ["Overdue", "Timer running"], currentUserId: "me", workspaceType: "business" });
    const node = f.api.createDashboardTaskRow(f.host, row);
    assert.equal(node.querySelector(".dashboard-task-row-title").textContent, "Real task");
    assert.deepEqual(node.querySelectorAll(".dashboard-task-row-reasons span").map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ entry) => entry.textContent), ["Overdue", "Timer running"]);
    assert.equal(node.querySelector("a").getAttribute("href"), "workbench.html?taskId=task%2Fa");
    assert.equal(node.querySelector(".dashboard-task-row-meta").textContent, "TasksClient / ProjectDue todayrunning");
    const metrics = Object.fromEntries(["assignedToMe", "blocked", "dueSoon", "overdue"].map((key, index) => [key, f.api.dashboardTaskMetric(key, index)]));
    const grid = f.api.createDashboardTaskMetricGrid(f.host, metrics);
    assert.deepEqual(grid.querySelectorAll("span").map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ entry) => entry.textContent), ["overdue", "dueSoon", "blocked", "assignedToMe"]);
    const actions = f.api.createDashboardTaskActions(f.host, Object.values(f.api.dashboardTaskActions()));
    assert.deepEqual(actions.querySelectorAll("a").map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ entry) => entry.getAttribute("href")), ["workbench.html", "tasks.html"]);
  });

  it("keeps text coercions and fallbacks local when one display record is unreadable", () => {
    const f = fixture();
    const list = f.api.createDashboardTaskRows(f.host, [{ title: "Before" }, null, { title: 123, reasons: ["One", 2], action: { href: "workbench.html", label: 9 } }], "empty");
    assert.deepEqual(list.querySelectorAll(".dashboard-task-row-title").map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ entry) => entry.textContent), ["Before", "Untitled task", "123"]);
    assert.equal(list.querySelector("a").textContent, "9");
    assert.equal(f.api.createDashboardTaskRows(f.host, null, "Nothing here").textContent, "Nothing here");
    assert.equal(f.api.createTaskMetric(f.host, { value: false, label: 17 }).textContent, "false17");
    assert.equal(f.api.createTaskMetric(f.host).textContent, "0Metric");
    assert.equal(f.api.createDashboardTaskActions(f.host, [null, {}, { label: "No link" }]), null);
    const inherited = Object.create({ title: "Wrong", action: { href: "wrong" } });
    const node = f.api.createDashboardTaskRow(f.host, inherited);
    assert.equal(node.querySelector(".dashboard-task-row-title").textContent, "Untitled task");
    assert.equal(node.querySelector("a"), null);
  });

  it("retains pressure's one-row cap and the independent attention/upcoming summaries", () => {
    const f = fixture(), summary = { pressureRows: [{ title: "First" }, { title: "Second" }],
      attentionRows: [{ title: "Attention" }], upcomingRows: [{ title: "Upcoming" }], actions: f.api.dashboardTaskActions() };
    const pressure = f.api.createTasksPressureContent(f.host, summary);
    assert.deepEqual(pressure.querySelectorAll(".dashboard-task-row-title").map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ node) => node.textContent), ["First"]);
    assert.equal(pressure.querySelectorAll(".dashboard-task-actions a").length, 2);
    assert.equal(f.api.createTasksNeedsAttentionContent(f.host, summary).querySelector("strong").textContent, "Attention");
    assert.equal(f.api.createTasksTodayUpcomingContent(f.host, summary).querySelector("strong").textContent, "Upcoming");
    assert.match(f.api.createTasksPressureContent(f.host, { pressureRows: "unreadable" }).textContent, /No task pressure/);
  });

  it("preserves route/contribution identity and replaces loading content on success or failure", async () => {
    const f = fixture(), body = f.document.createElement("div"), contribution = { dataRoute: "custom" };
    body.textContent = "Loading";
    const options = { errorTitle: "Unavailable", errorMessage: "Failed", renderContent: f.api.createTasksNeedsAttentionContent };
    await f.api.hydrateTasksDashboardPanel(body, contribution, f.host, options);
    assert.equal(f.loads[0][0], contribution); assert.equal(f.loads[0][1], "/api/tasks/dashboard-summary");
    assert.match(body.textContent, /No urgent task signals/); assert.doesNotMatch(body.textContent, /Loading/);
    f.host.loadContributionData = () => Promise.reject(new Error("unavailable"));
    await f.api.hydrateTasksDashboardPanel(body, contribution, f.host, options);
    assert.match(body.textContent, /Unavailable/); assert.match(body.textContent, /Failed/);
    assert.doesNotMatch(body.textContent, /No urgent/); assert.equal(f.errors.length, 1);
  });
});
