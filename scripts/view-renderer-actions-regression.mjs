import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
// 0.33.33.35.2 moved permission/route security, field option hydration, and
// descriptor data binding into sibling modules. The renderer reaches them through the
// namespace at call time, so every context that executes it has to provide them too.
const viewActionSecuritySource = readText("public/js/shared/view-action-security.js");
const viewSearchOptionsSource = readText("public/js/shared/view-search-options.js");
const viewDataBindingSource = readText("public/js/shared/view-data-binding.js");
const responseRecords = readText("public/js/shared/view-response-records.js");
const surfaceDescriptor = readText("public/js/shared/view-surface-descriptor.js");

assert.match(renderer, /function registerBehavior\(id, handler\)/, "Renderer should expose behavior registration");
// 0.33.33.35.2 moved permission checking, confirmation, and route interpolation into
// LongtailForge.viewActionSecurity. The renderer keeps the dispatch, so what this owns now is
// the order: confirm, then assert permissions, then run the route - never the reverse.
assert.match(
  renderer,
  /actionSecurity\.confirmDescriptorAction\(action\)[\s\S]*actionSecurity\.assertActionPermissions\(action\)[\s\S]*actionSecurity\.runRouteAction\(action, \{[\s\S]*api: requireApiClient\(\)[\s\S]*readValue: readDescriptorValue/,
  "Renderer should confirm, then check permissions, then dispatch declarative route actions through the published security contract",
);
assert.match(renderer, /requiredPermissions/, "Renderer should read action permission metadata");
assert.match(renderer, /Missing view behavior handler/, "Missing behavior handlers should fail visibly");
assert.match(renderer, /openDescriptorModal\(state, modalId, record\)/, "Renderer should own descriptor modal opening");

/**
 * The action API this owner installs into the fake browser context.
 *
 * Declared here because the shared harness casts a caller-supplied API to its
 * own `FakeQueuedJsonApi` shape, which declares only `calls` and `getJson`.
 * The installation is proven below and the assertions then read this typed
 * local, so nothing is read back through that cast.
 * @typedef {{
 *   deleteCalls: string[],
 *   getCalls: string[],
 *   postCalls: Array<{ body: unknown, url: string }>,
 *   deleteJson: (url: string) => Promise<unknown>,
 *   getJson: (url: string) => Promise<unknown>,
 *   postJson: (url: string, body: unknown) => Promise<unknown>,
 * }} ActionApi
 */

/** @type {string[]} */
const confirmMessages = [];

/** @type {ActionApi} */
const actionApi = {
  deleteCalls: [],
  getCalls: [],
  postCalls: [],
  async getJson(url) {
    this.getCalls.push(url);
    return { records: [{ id: "alpha", title: "Alpha" }] };
  },
  async deleteJson(url) {
    this.deleteCalls.push(url);
    return { ok: true };
  },
  async postJson(url, body) {
    this.postCalls.push({ url, body });
    return { ok: true };
  },
};
const context = createFakeBrowserContext({
  api: actionApi,
  /** @param {string} message */
  confirm(message) {
    confirmMessages.push(message);
    return true;
  },
  iconButton: { iconClass: false, iconOnlyText: true },
  window: { confirmMessages },
  workspaceContext: {
    permissionIds: ["sample.view"],
    workspaceId: "actions-workspace",
  },
});
vm.runInNewContext(surfaceDescriptor, context, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, context, { filename: "view-response-records.js" });
vm.runInNewContext(viewActionSecuritySource, context, { filename: "view-action-security.js" });
vm.runInNewContext(viewSearchOptionsSource, context, { filename: "view-search-options.js" });
vm.runInNewContext(viewDataBindingSource, context, { filename: "view-data-binding.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

/** @typedef {import("./test-support/fake-dom.mjs").FakeNode} FakeNode */
/** @typedef {import("./test-support/fake-dom.mjs").FakeLongtailForgeGlobal} FakeLongtailForgeGlobal */
/**
 * A rendered action surface: fake-DOM anatomy plus the renderer-owned refresh
 * path this regression awaits.
 * @typedef {FakeNode & { refresh: () => Promise<unknown> }} ActionSurface
 */
/**
 * The published `LongtailForge.view` action entry points under test.
 * @typedef {{ registerBehavior: (id: string, handler: Function) => void, renderSurface: (descriptor: object, host: FakeNode) => ActionSurface }} ActionsViewSurface
 */
const { view } = /** @type {FakeLongtailForgeGlobal & { view: ActionsViewSurface }} */ (context.window.LongtailForge);
assert.equal(typeof view.registerBehavior, "function", "LongtailForge.view.registerBehavior should be exposed");

/**
 * One behavior invocation, as the renderer hands it to a registered handler.
 * @typedef {{
 *   openModal: (modalId: string, record?: unknown) => unknown,
 *   record: { title?: unknown },
 *   refresh: () => unknown,
 *   workspaceContext: { workspaceId?: unknown },
 * }} BehaviorContext
 */

/** @type {BehaviorContext[]} */
const behaviorCalls = [];
view.registerBehavior("sample.open", /** @param {BehaviorContext} actionContext */ async (actionContext) => {
  behaviorCalls.push(actionContext);
  actionContext.openModal("edit-sample", actionContext.record);
});

const host = context.document.createElement("main");
const surface = view.renderSurface(descriptor(), host);
await surface.refresh();

const openButton = findButtonByText(surface, "Open selected");
assert.equal(openButton.disabled, false, "Behavior actions should be enabled after rendering");
await openButton.click();
assert.equal(behaviorCalls.length, 1, "Registered behavior should run once");
const behaviorContext = behaviorCalls[0];
assert.ok(behaviorContext, "the registered behavior should have captured its action context");
assert.equal(behaviorContext.record.title, "Alpha", "Behavior context should include the selected record");
assert.equal(typeof behaviorContext.refresh, "function", "Behavior context should include refresh");
assert.equal(typeof behaviorContext.openModal, "function", "Behavior context should include openModal");
assert.equal(behaviorContext.workspaceContext.workspaceId, "actions-workspace", "Behavior context should include workspace context");
assert(context.document.body.querySelector("dialog"), "Behavior openModal should append a descriptor modal");

const routeButton = findButtonByText(surface, "Delete selected");
await routeButton.click();
assert.deepEqual(context.window.confirmMessages, ["Delete this record?"], "Route actions should honor confirm metadata");
// The harness casts a caller-supplied API to its own shape, so the install is
// proven here and the counters are then read off the typed local rather than
// back through that cast.
assert.equal(context.window.LongtailForge.api, actionApi, "the fake browser context should install the provided action API");
assert.deepEqual(actionApi.deleteCalls, ["/api/sample/alpha"], "Route actions should call the shared API client");
assert.equal(actionApi.getCalls.length, 2, "Route actions should refresh after mutation");

const missingButton = findButtonByText(surface, "Missing behavior");
await missingButton.click();
assert.match(surface.textContent, /Missing view behavior handler: sample\.missing/, "Missing behavior handlers should render a recoverable status");

assert.equal(hasButtonByText(surface, "Denied route"), false, "Actions with absent declared permissions should not render");
assert.equal(hasButtonByText(surface, "Denied row"), false, "Row actions with absent declared permissions should not render");

context.window.LongtailForge.workspaceContext.permissionIds = [];
await openButton.click();
assert.match(surface.textContent, /You do not have permission to run this action/, "A rendered action should still recheck live permission hints before dispatch");
assert.equal(behaviorCalls.length, 1, "A permission hint removed after render should block the behavior dispatch");


console.log("View renderer actions regression passed.");

function descriptor() {
  return {
    id: "sample-actions",
    layout: "table-page",
    pageHeader: {
      title: "Action Samples",
      primaryAction: {
        id: "open-selected",
        label: "Open selected",
        role: "primary",
        behavior: "sample.open",
        requiredPermissions: ["sample.view"],
      },
    },
    table: {
      columns: [{ field: "title", label: "Title" }],
      rowActions: [{
        id: "denied-row",
        label: "Denied row",
        role: "secondary",
        behavior: "sample.open",
        requiredPermissions: ["sample.manage"],
      }],
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: {
        id: "id",
        title: "title",
      },
    },
    actions: [
      {
        id: "delete-selected",
        label: "Delete selected",
        role: "destructive",
        route: "/api/sample/alpha",
        method: "DELETE",
        confirm: "Delete this record?",
      },
      {
        id: "missing",
        label: "Missing behavior",
        role: "secondary",
        behavior: "sample.missing",
      },
      {
        id: "denied",
        label: "Denied route",
        role: "secondary",
        route: "/api/sample/denied",
        method: "POST",
        requiredPermissions: ["sample.manage"],
      },
    ],
    modals: [
      {
        id: "edit-sample",
        title: "Edit Sample",
        fields: [
          { field: "title", label: "Title", type: "text" },
        ],
      },
    ],
  };
}

/** @param {FakeNode} root @param {string} text @returns {FakeNode} */
function findButtonByText(root, text) {
  const button = root.querySelectorAll("button").find((candidate) => candidate.textContent === text);
  assert.ok(button, `Expected button '${text}'`);
  return button;
}

/** @param {FakeNode} root @param {string} text @returns {boolean} */
function hasButtonByText(root, text) {
  return root.querySelectorAll("button").some((candidate) => candidate.textContent === text);
}
