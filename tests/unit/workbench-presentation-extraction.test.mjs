import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
const presentation = read("public/js/workbench-task-focus-presentation.js");
const before = JSON.parse(read("tests/unit/fixtures/workbench-presentation-before-extraction.json"));
const mountNames = ["taskFocusActionMount", "taskFocusBody", "taskFocusPanelElement", "workbenchInspectorElement", "workbenchInspectorList", "workbenchInspectorCountText", "workbenchInspectorCollapseButton"];
const hostNames = source.slice(source.indexOf("function requireTaskFocusPresentation()"), source.indexOf("const WORKBENCH_CARD_STATE_KEY"))
  .match(/^ {8}[a-zA-Z]+,$/gm)?.map(line => line.trim().slice(0, -1)).filter(name => name !== "state") || [];
const realNames = ["requireView", "requireWorkbenchElement", "setWorkbenchInspectorCopy", "emptyState", "safeCandidateText", "looksLikeRawId", "safeTaskFocusText", "safeRelatedContextText", "relatedContextSourceLabel", "workbenchDetailField", "badge", "formatToken", "formatCandidateDate", "formatDuration", "readElapsedSeconds", "workbenchSourceField", "actionButton", "createWorkbenchSectionSummary", "setWorkbenchDisclosureOpen", "updateDisclosureExpandedState", "taskFocusContextLabel", "taskFocusRelatedContextState", "taskFocusRelatedContextGroups", "requireTaskFocusChecklistRenderer", "createTaskFocusChecklistSection"];

/** @param {import("../../scripts/test-support/fake-dom.mjs").FakeElement} node @returns {object} */
function tree(node) {
  return { tag: node.tagName, text: node.textContent, className: node.className, dataset: { ...node.dataset },
    attributes: [...node.attributes], hidden: node.hidden, disabled: node.disabled, open: node.open,
    children: node.children.map(tree) };
}
/** @param {boolean} [baseline] */
function fixture(baseline = false) {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({ ...browser, calls, mode: "task-focus", taskFocusInspectorCollapsed: false,
    state: { activeTaskFocus: null }, timer: null, timerAvailable: true,
    resolvedWorkbenchViewState: () => scope.mode,
    currentTaskFocusTimer: () => scope.timer,
    taskTimerSurfaceAvailable: () => scope.timerAvailable,
    taskFocusTimerEligibility: () => ({ eligible: true, reason: "" }),
    taskFocusLifecycleDisabledReason: () => "",
  });
  for (const name of ["openFocusedTaskEditor", "completeFocusedTask", "blockFocusedTask", "resumeFocusedTask", "saveFocusedTaskTimer", "finalizeFocusedTaskTimer", "resetFocusedTaskTimer", "openTaskFocusRelatedContextItem", "handleTaskFocusChecklistChange"]) {
    scope[name] = function (/** @type {unknown[]} */ ...args) { calls.push([name, this, ...args]); };
  }
  for (const name of [...mountNames, "workbenchInspectorHeadingText", "workbenchInspectorHelperText"]) scope[name] = browser.document.createElement(name.includes("Button") ? "button" : "div");
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  vm.runInContext(read("public/js/workbench-task-focus-checklist.js"), scope);
  vm.runInContext('let taskFocusChecklistRenderer = null; const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";\n' + realNames.map(n => extractFunctionBlock(source, n)).join("\n"), scope);
  if (baseline) {
    vm.runInContext(Object.values(before.functions).join("\n"), scope);
    scope.renderer = vm.runInContext('({createPanel: createTaskFocusPanel, renderSurface: renderTaskFocusSurface, renderInspector: renderTaskFocusInspector, syncInspectorCollapse: syncTaskFocusInspectorCollapseState, title: taskFocusTitle})', scope);
  } else {
    vm.runInContext(presentation, scope);
    vm.runInContext('let taskFocusPresentation = null;\n' + extractFunctionBlock(source, "requireTaskFocusPresentation"), scope);
    scope.renderer = scope.requireTaskFocusPresentation();
  }
  return { scope, calls, browser };
}

it("moves all 29 baseline bodies with only explicit live host paths and keeps three shared readers unchanged", () => {
  const normalize = (/** @type {string} */ text) => text.split(/\r?\n/).map(l => l.trim()).join("\n");
  assert.equal(Object.keys(before.functions).length, 29);
  assert.equal(Object.values(before.functions).reduce((sum, b) => sum + String(b).split(/\r?\n/).length, 0), 631);
  for (const [name, block] of Object.entries(before.functions)) {
    let expected = String(block);
    for (const mount of mountNames) expected = expected.replaceAll(new RegExp(`\\b${mount}\\b`, "g"), `mounts.${mount}`);
    expected = expected.replaceAll(/\btaskFocusInspectorCollapsed\b/g, "host.taskFocusInspectorCollapsed").replaceAll(/\bstate\.activeTaskFocus\b/g, "host.state.activeTaskFocus");
    assert.equal(normalize(extractFunctionBlock(presentation, name)), normalize(expected), name);
  }
  for (const [name, block] of Object.entries(before.retained)) assert.equal(extractFunctionBlock(source, name), block, name);
  assert.equal(hostNames.length, 33);
  assert.doesNotMatch(presentation, /requireApi|localStorage|sessionStorage|fetch\(|setTimeout/);
});

const activeStates = [null, { taskId: "task", isLoading: true }, { taskId: "task", error: "Task failed" },
  { taskId: "task", task: { title: "Task", status: "open", priority: "high", project_name: "Project", client_name: "Client", due_date: "2026-10-01", directTags: [{ name: "Tag" }], assignees: [{ username: "Alice" }], checklistItems: [{ label: "Next" }] } },
  { taskId: "task", task: { status: "blocked", blocked_reason: "Waiting", description: "Detail" }, relatedContext: { groups: [{ id: "notes", label: "Notes", items: [{ title: "Note", sourceLabel: "Notes", action: { moduleActionId: "notes.view" }, badges: [{ label: "Linked" }] }] }], error: "", isLoading: false } },
  { taskId: "task", task: {}, relatedContext: { groups: [], isLoading: true, error: "" } },
  { taskId: "task", task: {}, relatedContext: { groups: [], isLoading: false, error: "Related failure" } },
];
for (const [index, active] of activeStates.entries()) {
  it(`compares DOM for summary, timer, related, actions and composition state ${index}`, () => {
    const snapshots = [];
    for (const baseline of [true, false]) {
      const f = fixture(baseline), s = f.scope;
      s.state.activeTaskFocus = active;
      s.timer = { active_timer_id: "timer", timer_status: "paused", accumulated_elapsed_seconds: 65 };
      s.renderer.createPanel(); s.renderer.renderSurface(); s.renderer.renderInspector();
      snapshots.push([tree(s.taskFocusPanelElement), tree(s.workbenchInspectorElement), tree(s.workbenchInspectorList), tree(s.workbenchInspectorCountText), tree(s.workbenchInspectorCollapseButton)]);
    }
    assert.deepEqual(snapshots[1], snapshots[0]);
  });
}

it("preserves action callback identities, timer closures and related item identity through real rendering", () => {
  for (const baseline of [true, false]) {
    const { scope: s, calls } = fixture(baseline);
    const item = { title: "Linked", action: { moduleActionId: "notes.view" } };
    s.state.activeTaskFocus = { taskId: "task", task: { status: "open" }, relatedContext: { groups: [{ items: [item] }], isLoading: false, error: "" } };
    s.timer = { timer_status: "running", accumulated_elapsed_seconds: 6 };
    s.renderer.createPanel(); s.renderer.renderSurface(); s.renderer.renderInspector();
    const buttons = s.taskFocusActionMount.querySelectorAll("button");
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0].listeners.get("click")[0].listener, s.openFocusedTaskEditor);
    assert.equal(buttons[1].listeners.get("click")[0].listener, s.completeFocusedTask);
    assert.equal(buttons[2].listeners.get("click")[0].listener, s.blockFocusedTask);
    s.state.activeTaskFocus.task.status = "blocked"; s.renderer.renderSurface();
    assert.equal(s.taskFocusActionMount.querySelectorAll("button")[2].listeners.get("click")[0].listener, s.resumeFocusedTask);
    const timers = s.taskFocusBody.querySelectorAll("button").filter((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ b) => b.dataset.workbenchTaskFocusTimerAction);
    assert.deepEqual(timers.map((/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ b) => b.dataset.workbenchTaskFocusTimerAction), ["start", "pause", "save", "reset"]);
    const event = { currentTarget: timers[0] };
    timers[0].listeners.get("click")[0].listener.call(timers[0], event);
    timers[1].listeners.get("click")[0].listener.call(timers[1], event);
    assert.equal(calls[0][0], "saveFocusedTaskTimer"); assert.equal(calls[0][1], undefined); assert.equal(calls[0][2], "running");
    assert.equal(calls[1][2], "paused");
    assert.equal(timers[2].listeners.get("click")[0].listener, s.finalizeFocusedTaskTimer);
    assert.equal(timers[3].listeners.get("click")[0].listener, s.resetFocusedTaskTimer);
    const related = s.workbenchInspectorList.querySelector("button"); assert.ok(related);
    related.listeners.get("click")[0].listener({ currentTarget: related });
    assert.equal(calls.at(-1)?.[0], "openTaskFocusRelatedContextItem");
    assert.equal(calls.at(-1)?.[2], item); assert.equal(calls.at(-1)?.[3], related);
  }
});

it("retains live state and mounts, guards and partial construction failure order", () => {
  for (const baseline of [true, false]) {
    const { scope: s, browser } = fixture(baseline);
    s.renderer.createPanel(); s.state.activeTaskFocus = { taskId: "first", task: { title: "First" } };
    assert.equal(s.renderer.title(), "First");
    s.state = { activeTaskFocus: { taskId: "second", task: { title: "Second" } } }; assert.equal(s.renderer.title(), "Second");
    const oldBody = s.taskFocusBody; s.taskFocusBody = browser.document.createElement("div"); s.renderer.renderSurface();
    assert.equal(oldBody.children.length, 0); assert.equal(s.taskFocusBody.children.length, 4);
    s.taskFocusInspectorCollapsed = true; s.renderer.renderInspector(); assert.equal(s.workbenchInspectorList.hidden, true); assert.equal(s.workbenchInspectorList.children.length, 0);
    s.taskFocusBody = null; assert.doesNotThrow(() => s.renderer.renderSurface());
    s.mode = "focus-selection"; s.taskFocusBody = browser.document.createElement("div"); s.renderer.renderSurface(); assert.equal(s.taskFocusBody.hidden, true); assert.equal(s.taskFocusBody.children.length, 0);
    const view = s.window.LongtailForge.view, original = view.createElement; let creates = 0;
    const failure = new Error("construction");
    s.window.LongtailForge.view = { ...view, createElement: (/** @type {unknown[]} */ ...args) => { if (++creates === 2) throw failure; return original(...args); } };
    const previousPanel = s.taskFocusPanelElement;
    assert.throws(() => s.renderer.createPanel(), e => e === failure);
    assert.equal(s.taskFocusPanelElement, previousPanel); assert.notEqual(s.taskFocusActionMount, previousPanel.children[0]);
  }
});

it("preserves opaque getter receivers and read order through the complete live surface", () => {
  const traces = [];
  for (const baseline of [true, false]) {
    const { scope: s } = fixture(baseline);
    /** @type {string[]} */ const reads = [];
    const task = { get title() { assert.equal(this, task); reads.push("title"); return "Title"; }, get status() { assert.equal(this, task); reads.push("status"); return "open"; }, get client_name() { assert.equal(this, task); reads.push("client"); return "Client"; } };
    s.state.activeTaskFocus = { taskId: "task", task };
    s.renderer.createPanel(); s.renderer.renderSurface(); traces.push(reads);
  }
  assert.ok(traces[0].length > 0); assert.deepEqual(traces[1], traces[0]);
});

it("publishes synchronously, isolates internal functions and caches only the renderer", () => {
  const { scope: s } = fixture();
  assert.equal(s.requireTaskFocusPresentation(), s.renderer);
  assert.equal(s.createTaskFocusSummary, undefined); assert.equal(s.create, undefined);
  assert.equal(Object.isFrozen(s.window.LongtailForge.workbenchTaskFocusPresentation), true);
  assert.match(read("views/protected/workbench.html"), /workbench-task-focus-checklist\.js[\s\S]*workbench-task-focus-presentation\.js[\s\S]*workbench\.js/);
});
