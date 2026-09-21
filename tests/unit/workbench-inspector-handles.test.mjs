import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
const names = ["requireWorkbenchElement", "buildWorkbenchHost", "createWorkbenchShell", "createWorkbenchInspectorPanel", "initializeWorkbenchInspectorSlideOut", "syncWorkbenchInspectorViewport", "syncTaskFocusInspectorCollapseState", "setWorkbenchInspectorCopy", "renderWorkbenchInspector", "renderTaskFocusInspector"];

function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[]} */ const calls = [];
  const scope = vm.createContext({ ...browser, calls, state: {}, changeFocusButton: null, statusText: null, taskFocusInspectorCollapsed: false,
    workbenchHost: browser.document.createElement("main"), changeFocus() {}, toggleTaskFocusInspectorCollapse() {},
    createTaskFocusPanel: () => browser.document.createElement("section"), createGuidedFocusPanel: () => browser.document.createElement("section"),
    createRecommendedActionPanel: () => browser.document.createElement("section"), createSecondaryWorkbenchPanel: () => browser.document.createElement("section"),
  });
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  const controller = { close: (/** @type {unknown} */ options) => calls.push(["close", options]) };
  const queries = [false, true].map(matches => ({ matches, addEventListener: (/** @type {unknown} */ event, /** @type {unknown} */ handler) => calls.push(["listen", event, handler]) }));
  let queryIndex = 0;
  browser.window.matchMedia = () => queries[queryIndex++];
  const view = { ...scope.window.LongtailForge.view,
    createSlideOutSidebarController: (/** @type {unknown} */ elements) => { calls.push(["controller", elements]); return controller; },
  };
  scope.window.LongtailForge.view = view;
  scope.requireView = () => view;
  for (const constant of ["WORKBENCH_MOBILE_INSPECTOR_MEDIA", "WORKBENCH_WIDE_INSPECTOR_MEDIA", "WORKBENCH_VIEW_STATE_TASK_FOCUS", "PROJECT_FOCUS_MODE_ID"]) {
    const start = source.indexOf(`const ${constant} =`); assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), scope);
  }
  const declarations = source.match(/^  let workbenchInspector\w+ = null;$/gm);
  assert.equal(declarations?.length, 12);
  vm.runInContext(declarations.join("\n") + "\n" + names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  const api = vm.runInContext(`({${names.join(",")}})`, scope);
  api.buildWorkbenchHost();
  const handles = vm.runInContext("({workbenchInspectorBackdrop,workbenchInspectorCollapseButton,workbenchInspectorController,workbenchInspectorCountText,workbenchInspectorCloseButton,workbenchInspectorElement,workbenchInspectorHeadingText,workbenchInspectorHelperText,workbenchInspectorList,workbenchInspectorMobileQuery,workbenchInspectorOpenButton,workbenchInspectorWideQuery})", scope);
  return { scope, api, handles, controller, queries, calls, view, document: browser.document };
}

it("uses the actual factory writers, preserves controller identity and installs viewport listeners", () => {
  const f = fixture(), h = f.handles;
  for (const name of ["workbenchInspectorOpenButton", "workbenchInspectorCloseButton", "workbenchInspectorCollapseButton"]) assert.equal(h[name].tagName, "BUTTON");
  assert.equal(h.workbenchInspectorElement.tagName, "ASIDE");
  assert.equal(h.workbenchInspectorCountText.tagName, "SPAN");
  assert.equal(h.workbenchInspectorController, f.controller);
  assert.equal(h.workbenchInspectorMobileQuery, f.queries[0]);
  assert.equal(h.workbenchInspectorWideQuery, f.queries[1]);
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === "listen").length, 2);
  assert.equal(h.workbenchInspectorOpenButton.hidden, true);
  assert.equal(h.workbenchInspectorElement.hasAttribute("aria-hidden"), false);
  f.queries[0].matches = true; f.queries[1].matches = false;
  f.api.syncWorkbenchInspectorViewport();
  assert.equal(h.workbenchInspectorOpenButton.hidden, false);
  assert.equal(h.workbenchInspectorCloseButton.hidden, false);
  assert.equal(h.workbenchInspectorElement.classList.contains("view-slideout-sidebar-drawer"), true);
  assert.equal(h.workbenchInspectorElement.getAttribute("aria-hidden"), "true");
});

it("keeps optional viewport prerequisites optional and refuses a missing close handle only after earlier writes", () => {
  const f = fixture(); f.calls.length = 0;
  vm.runInContext("workbenchInspectorController = null", f.scope);
  f.api.syncWorkbenchInspectorViewport(); assert.equal(f.calls.length, 0);
  f.scope.controller = f.controller;
  vm.runInContext("workbenchInspectorController = controller; workbenchInspectorCloseButton = null", f.scope);
  f.queries[0].matches = true;
  assert.throws(() => f.api.syncWorkbenchInspectorViewport(), { name: "TypeError", message: "Workbench required element is unavailable." });
  assert.equal(f.calls.length, 1);
  assert.equal(f.handles.workbenchInspectorOpenButton.hidden, false);
  assert.equal(f.handles.workbenchInspectorElement.classList.contains("view-slideout-sidebar-drawer"), false);
});

it("retains required count/list failure order after context work and before row creation", () => {
  const f = fixture();
  /** @type {string[]} */ const order = [];
  f.scope.taskFocusRelatedContextState = () => { order.push("context"); return {}; };
  f.scope.taskFocusRelatedContextGroups = () => { order.push("groups"); return [{ items: [{}] }]; };
  f.scope.createTaskFocusRelatedContextGroup = () => { order.push("row"); return f.document.createElement("div"); };
  vm.runInContext("workbenchInspectorCountText = null", f.scope);
  assert.throws(() => f.api.renderTaskFocusInspector(), { name: "TypeError" });
  assert.deepEqual(order, ["context", "groups"]);
  assert.equal(f.handles.workbenchInspectorHeadingText.textContent, "Task context");
  f.scope.count = f.handles.workbenchInspectorCountText;
  vm.runInContext("workbenchInspectorCountText = count; workbenchInspectorList = null", f.scope);
  order.length = 0;
  assert.throws(() => f.api.renderTaskFocusInspector(), { name: "TypeError" });
  assert.deepEqual(order, ["context", "groups"]);
  assert.equal(f.handles.workbenchInspectorCountText.textContent, "1");
  assert.doesNotThrow(() => f.api.renderWorkbenchInspector());
});

it("keeps per-row handle reads and captures the receiver before constructing append arguments", () => {
  const f = fixture(), list = f.handles.workbenchInspectorList;
  f.scope.taskFocusRelatedContextState = () => ({});
  f.scope.taskFocusRelatedContextGroups = () => [{ items: [{}] }, { items: [{}] }];
  let builds = 0;
  const row = f.document.createElement("article");
  f.scope.createTaskFocusRelatedContextGroup = () => { builds += 1; vm.runInContext("workbenchInspectorList = null", f.scope); return row; };
  assert.throws(() => f.api.renderTaskFocusInspector(), { name: "TypeError" });
  assert.equal(builds, 1); assert.deepEqual(list.children, [row]);
  assert.equal(f.handles.workbenchInspectorCountText.textContent, "2");
});
