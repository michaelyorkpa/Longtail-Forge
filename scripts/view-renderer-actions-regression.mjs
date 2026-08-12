import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const responseRecords = readText("public/js/shared/view-response-records.js");
const surfaceDescriptor = readText("public/js/shared/view-surface-descriptor.js");
const changelog = readText("CHANGELOG.md");

assert.match(renderer, /function registerBehavior\(id, handler\)/, "Renderer should expose behavior registration");
assert.match(renderer, /runRouteAction\(action, state, record\)/, "Renderer should route declarative route actions");
assert.match(renderer, /requiredPermissions/, "Renderer should read action permission metadata");
assert.match(renderer, /Missing view behavior handler/, "Missing behavior handlers should fail visibly");
assert.match(renderer, /openDescriptorModal\(state, modalId, record\)/, "Renderer should own descriptor modal opening");

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
  confirm(message) {
    this.confirmMessages.push(message);
    return true;
  },
  iconButton: { iconClass: false, iconOnlyText: true },
  window: { confirmMessages: [] },
  workspaceContext: {
    permissionIds: ["sample.view"],
    workspaceId: "actions-workspace",
  },
});
vm.runInNewContext(surfaceDescriptor, context, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, context, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const { view } = context.window.LongtailForge;
assert.equal(typeof view.registerBehavior, "function", "LongtailForge.view.registerBehavior should be exposed");

const behaviorCalls = [];
view.registerBehavior("sample.open", async (actionContext) => {
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
assert.equal(behaviorCalls[0].record.title, "Alpha", "Behavior context should include the selected record");
assert.equal(typeof behaviorCalls[0].refresh, "function", "Behavior context should include refresh");
assert.equal(typeof behaviorCalls[0].openModal, "function", "Behavior context should include openModal");
assert.equal(behaviorCalls[0].workspaceContext.workspaceId, "actions-workspace", "Behavior context should include workspace context");
assert(context.document.body.querySelector("dialog"), "Behavior openModal should append a descriptor modal");

const routeButton = findButtonByText(surface, "Delete selected");
await routeButton.click();
assert.deepEqual(context.window.confirmMessages, ["Delete this record?"], "Route actions should honor confirm metadata");
assert.deepEqual(context.window.LongtailForge.api.deleteCalls, ["/api/sample/alpha"], "Route actions should call the shared API client");
assert.equal(context.window.LongtailForge.api.getCalls.length, 2, "Route actions should refresh after mutation");

const missingButton = findButtonByText(surface, "Missing behavior");
await missingButton.click();
assert.match(surface.textContent, /Missing view behavior handler: sample\.missing/, "Missing behavior handlers should render a recoverable status");

assert.equal(hasButtonByText(surface, "Denied route"), false, "Actions with absent declared permissions should not render");
assert.equal(hasButtonByText(surface, "Denied row"), false, "Row actions with absent declared permissions should not render");

context.window.LongtailForge.workspaceContext.permissionIds = [];
await openButton.click();
assert.match(surface.textContent, /You do not have permission to run this action/, "A rendered action should still recheck live permission hints before dispatch");
assert.equal(behaviorCalls.length, 1, "A permission hint removed after render should block the behavior dispatch");

assert.match(changelog, /## Version 0\.33\.5\.16\.8 - /, "Changelog should include renderer action version");

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

function findButtonByText(root, text) {
  const button = root.querySelectorAll("button").find((candidate) => candidate.textContent === text);
  assert.ok(button, `Expected button '${text}'`);
  return button;
}

function hasButtonByText(root, text) {
  return root.querySelectorAll("button").some((candidate) => candidate.textContent === text);
}
