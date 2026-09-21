import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
const names = ["requireWorkbenchElement", "buildWorkbenchHost", "createWorkbenchShell", "createGuidedFocusPanel", "createCalendarWeekLink", "createRecommendedActionPanel", "createSecondaryWorkbenchPanel", "createTimerSection", "createWorkbenchCardSection", "createWorkbenchSectionSummary", "createTaskFocusPanel", "renderFocusModes", "populateFocusScopeOptions", "replaceOptions", "renderRecommendedAction", "updateRecommendedCycleControls", "clampRecommendedCandidateIndex", "renderWorkbenchViewState", "toggleWorkbenchStatePanel", "handleClientFocusChange", "handleProjectFocusChange", "renderTimers", "flashActivatedTimer"];
const handleNames = ["focusModeList", "clientFocusControl", "clientFocusInput", "projectFocusInput", "focusPanelElement", "calendarWeekLinkElement", "recommendedActionBody", "recommendedCycleControls", "recommendedCycleNextButton", "recommendedCyclePreviousButton", "recommendedActionPanelElement", "secondaryWorkbenchPanelElement", "taskFocusActionMount", "taskFocusBody", "taskFocusPanelElement", "changeFocusButton", "timerSectionElement", "timerCountText", "timerList"];

function fixture() {
  const browser = createFakeBrowserContext();
  const document = browser.document;
  /** @type {string[]} */ const order = [];
  const scope = vm.createContext({ ...browser, order, workbenchHost: document.createElement("main"),
    state: { focusModes: [], clients: [], selectedClientId: "", selectedProjectId: "", recommendedCandidateIndex: 0 },
    workbenchInspectorOpenButton: null, workbenchInspectorBackdrop: null, statusText: null, projectFocusControl: null,
    initializeWorkbenchInspectorSlideOut() {}, createWorkbenchInspectorPanel: () => document.createElement("aside"),
    changeFocus() {}, cycleRecommendedCandidate() {}, shouldOpenTimerSectionByDefault: () => false,
    setWorkbenchDisclosureOpen: (/** @type {HTMLDetailsElement} */ element, /** @type {boolean} */ open) => { element.open = open; },
    usesClientScope: () => true, clientFocusOptions: () => [], projectFocusOptions: () => [], clientOptionLabel: (/** @type {{label:string}} */ client) => client.label,
    option: (/** @type {string} */ value, /** @type {string} */ label) => { const node = document.createElement("option"); node.value = value; node.textContent = label; return node; },
    resolvedWorkbenchViewState: () => "focus-selection", pendingActivatedTimerKey: "",
    resetTaskFocusState: () => order.push("reset"), refreshFocusCandidates: async () => { order.push("refresh"); },
  });
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  scope.requireView = () => scope.window.LongtailForge.view;
  for (const constant of ["PROJECT_FOCUS_MODE_ID", "FOCUS_QUESTION_COPY", "WORKBENCH_VIEW_STATE_TASK_FOCUS", "WORKBENCH_CLIENT_FOCUS_KEY", "WORKBENCH_PROJECT_FOCUS_KEY"]) {
    const start = source.indexOf(`const ${constant} =`); assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), scope);
  }
  const declarations = handleNames.map(name => { const match = source.match(new RegExp(`^  let ${name} = null;$`, "m")); assert.ok(match); return match[0]; });
  vm.runInContext(declarations.join("\n") + "\n" + names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  const api = vm.runInContext(`({${names.join(",")}})`, scope);
  api.buildWorkbenchHost();
  const handles = vm.runInContext(`({${handleNames.join(",")}})`, scope);
  return { scope, api, handles, order, document };
}

it("acquires the handles from real factory writers and retains optional state panels and controls", () => {
  const f = fixture(), h = f.handles;
  for (const name of ["clientFocusInput", "projectFocusInput"]) assert.equal(h[name].tagName, "SELECT");
  for (const name of ["changeFocusButton", "recommendedCycleNextButton", "recommendedCyclePreviousButton"]) assert.equal(h[name].tagName, "BUTTON");
  assert.equal(h.timerSectionElement.tagName, "DETAILS");
  assert.equal(h.calendarWeekLinkElement.tagName, "A");
  f.api.renderWorkbenchViewState();
  assert.equal(h.taskFocusPanelElement.hidden, true);
  assert.equal(h.focusPanelElement.hidden, false);
  assert.equal(h.changeFocusButton.disabled, true);
  f.scope.resolvedWorkbenchViewState = () => "task-focus";
  f.api.renderWorkbenchViewState();
  assert.equal(h.focusPanelElement.hidden, true);
  assert.equal(h.taskFocusPanelElement.hidden, false);
  assert.equal(h.changeFocusButton.disabled, false);
  vm.runInContext("changeFocusButton = null; taskFocusPanelElement = null; recommendedCycleControls = null; recommendedCyclePreviousButton = null; recommendedCycleNextButton = null", f.scope);
  assert.doesNotThrow(() => f.api.renderWorkbenchViewState());
  assert.doesNotThrow(() => f.api.updateRecommendedCycleControls(2));
});

it("renders empty/populated focus modes and preserves select option order and selected values", () => {
  const f = fixture(), h = f.handles;
  f.api.renderFocusModes();
  assert.match(h.focusModeList.textContent, /No focus choices/);
  f.scope.clientFocusOptions = () => [{ id: "c2", label: "Second" }, { id: "c1", label: "First" }];
  f.scope.projectFocusOptions = () => [{ id: "p2", label: "Two" }, { id: "p1", label: "One" }];
  Object.assign(f.scope.state, { selectedClientId: "c1", selectedProjectId: "p2", focusModeId: "custom", focusModes: [{ id: "custom", label: "Custom focus", description: "Own copy" }] });
  f.api.renderFocusModes();
  assert.equal(h.focusModeList.children.length, 1);
  assert.match(h.focusModeList.textContent, /Custom focus/);
  assert.equal(h.focusModeList.children[0].getAttribute("aria-pressed"), "true");
  assert.deepEqual(h.clientFocusInput.children.map((/** @type {HTMLOptionElement} */ node) => node.value), ["", "c2", "c1"]);
  assert.deepEqual(h.projectFocusInput.children.map((/** @type {HTMLOptionElement} */ node) => node.value), ["", "p2", "p1"]);
  assert.equal(h.clientFocusInput.value, "c1"); assert.equal(h.projectFocusInput.value, "p2");
  f.scope.usesClientScope = () => false; f.api.populateFocusScopeOptions();
  assert.equal(h.clientFocusControl.hidden, true); assert.equal(h.clientFocusInput.disabled, true);
  assert.equal(h.clientFocusInput.value, "");
});

it("fails on required focus receivers at the original operation and does not make optional client handles required", () => {
  const f = fixture();
  vm.runInContext("clientFocusInput = null; clientFocusControl = null", f.scope);
  assert.doesNotThrow(() => f.api.populateFocusScopeOptions());
  vm.runInContext("focusModeList = null", f.scope);
  f.scope.populateFocusScopeOptions = () => { throw new Error("must not reach scope population"); };
  assert.throws(() => f.api.renderFocusModes(), { name: "TypeError", message: "Workbench required element is unavailable." });
});

it("captures project assignment receivers before computing values and re-reads handles between assignments", () => {
  const f = fixture(), select = f.handles.projectFocusInput;
  const projects = [{ id: "p", label: "Project" }];
  f.scope.state.selectedProjectId = "p";
  projects.some = predicate => { vm.runInContext("projectFocusInput = null", f.scope); return Array.prototype.some.call(projects, predicate); };
  f.scope.projectFocusOptions = () => projects;
  f.api.populateFocusScopeOptions();
  assert.equal(select.value, "p");
  let lengths = 0;
  f.scope.projectFocusOptions = () => new Proxy([], { get(target, key, receiver) { if (key === "length") lengths += 1; return Reflect.get(target, key, receiver); } });
  assert.throws(() => f.api.populateFocusScopeOptions(), { name: "TypeError" });
  // Option label, map and disabled RHS all run before the required disabled write fails.
  assert.equal(lengths, 3);
});

it("preserves recommendation receiver ordering, empty state and optional cycle controls", () => {
  const f = fixture(), body = f.handles.recommendedActionBody;
  f.scope.recommendedCandidateWindow = () => [];
  f.scope.recommendedEmptyState = () => { f.order.push("empty"); return f.document.createElement("p"); };
  f.api.renderRecommendedAction(); assert.deepEqual(f.order, ["empty"]); assert.equal(body.children.length, 1);
  f.scope.recommendedCandidateWindow = () => [{ id: "one" }, { id: "two" }];
  f.scope.createRecommendedCandidateCard = () => { f.order.push("card"); vm.runInContext("recommendedActionBody = null", f.scope); return f.document.createElement("article"); };
  f.api.renderRecommendedAction(); assert.equal(body.children[0].tagName, "ARTICLE");
  assert.equal(f.handles.recommendedCycleNextButton.disabled, false);
  assert.throws(() => f.api.renderRecommendedAction(), { name: "TypeError" });
  assert.deepEqual(f.order, ["empty", "card"]);
});

it("keeps focus-change reset, value reads, persistence and refresh ordering, including null failures", async () => {
  const f = fixture();
  f.scope.resolveClientSelection = (/** @type {string} */ value) => { f.order.push(`client:${value}`); return value; };
  f.scope.resolveProjectSelection = (/** @type {string} */ value) => { f.order.push(`project:${value}`); return value; };
  f.scope.window.localStorage = { setItem: (/** @type {string} */ key, /** @type {string} */ value) => f.order.push(`store:${key}:${value}`) };
  f.scope.populateFocusScopeOptions = () => f.order.push("populate");
  f.handles.clientFocusInput.value = "c"; f.handles.projectFocusInput.value = "p";
  await f.api.handleClientFocusChange();
  assert.equal(f.order[0], "reset"); assert.equal(f.order[1], "client:c");
  assert.equal(f.order[2], "project:"); assert.ok(f.order[3].startsWith("store:")); assert.ok(f.order[4].startsWith("store:"));
  assert.deepEqual(f.order.slice(5), ["populate", "refresh"]);
  f.order.length = 0; await f.api.handleProjectFocusChange();
  assert.deepEqual(f.order.slice(0, 2), ["reset", "project:p"]); assert.equal(f.order.at(-1), "refresh");
  for (const [slot, handler] of [["clientFocusInput", "handleClientFocusChange"], ["projectFocusInput", "handleProjectFocusChange"]]) {
    f.order.length = 0; vm.runInContext(`${slot} = null`, f.scope);
    await assert.rejects(f.api[handler](), { name: "TypeError" }); assert.deepEqual(f.order, ["reset"]);
  }
});

it("retains timer count coercion, per-row handle reads and receiver-before-row construction", () => {
  const f = fixture(), count = f.handles.timerCountText, list = f.handles.timerList;
  f.scope.visibleTimerPanelTimers = () => [];
  f.scope.sortedTimers = () => [];
  f.scope.timerPanelEmptyStateText = () => "No timers";
  f.scope.updateTimerSectionTitle = () => f.order.push("title");
  f.scope.syncTimerSectionOpenState = () => f.order.push("sync");
  f.scope.emptyState = (/** @type {string} */ text) => { const node = f.document.createElement("p"); node.textContent = text; return node; };
  f.api.renderTimers(); assert.equal(count.textContent, "0"); assert.equal(list.textContent, "No timers");
  f.scope.sortedTimers = () => [{}, {}];
  f.scope.createTimerCard = () => { f.order.push("row"); vm.runInContext("timerList = null", f.scope); return f.document.createElement("article"); };
  assert.throws(() => f.api.renderTimers(), { name: "TypeError" });
  assert.equal(count.textContent, "2"); assert.equal(list.children.length, 1);
  assert.deepEqual(f.order, ["title", "sync", "title", "sync", "row"]);
  vm.runInContext("timerCountText = null", f.scope);
  f.scope.sortedTimers = () => ({ get length() { f.order.push("length"); return 2; } });
  assert.throws(() => f.api.renderTimers(), { name: "TypeError" });
  assert.deepEqual(f.order.slice(-2), ["title", "length"]);
});

it("clears pending activation before a missing timer list fails and does not build the selector too early", () => {
  const f = fixture();
  f.scope.timerKey = () => { f.order.push("key"); return "t"; };
  f.scope.cssEscape = (/** @type {string} */ key) => { f.order.push("escape"); return key; };
  vm.runInContext('pendingActivatedTimerKey = "t"; timerList = null', f.scope);
  assert.throws(() => f.api.flashActivatedTimer([{ timer_status: "running" }]), { name: "TypeError" });
  assert.deepEqual(f.order, ["key"]); assert.equal(f.scope.pendingActivatedTimerKey, "");
  assert.doesNotThrow(() => f.api.flashActivatedTimer([]));
});
