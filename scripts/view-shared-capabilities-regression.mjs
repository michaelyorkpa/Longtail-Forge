import assert from "node:assert/strict";
import vm from "node:vm";

import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";
import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("view-shared-capabilities-regression");
const { validateModuleManifest } = await import("../src/core/modules/manifest-contract.js");

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const responseRecords = readText("public/js/shared/view-response-records.js");
const surfaceDescriptor = readText("public/js/shared/view-surface-descriptor.js");
const contract = readText("src/core/modules/manifest-contract.js");

// --- Source guards: the three shared capabilities live in the framework, not modules. ---
assert.match(renderer, /function appendFilterQuery/, "Renderer should build dataSource query params from filters");
assert.match(renderer, /function renderRegions/, "Renderer should render descriptor mount regions");
assert.match(renderer, /function flushMounts/, "Renderer should flush region mount behaviors");
assert.match(renderer, /mountType: "fieldOptions"/, "Renderer should mount descriptor option-source behaviors for filter fields");
assert.match(renderer, /function setFieldOptions/, "Renderer should route descriptor option-source hydration by control type");
assert.match(renderer, /function setSelectOptions/, "Renderer should hydrate descriptor select options through a shared helper");
assert.match(renderer, /function mountSearchOptions/, "Renderer should hydrate descriptor search suggestions through a shared popover helper");
assert.match(renderer, /function tableColumnRenderer/, "Renderer should route table display hooks through framework-owned formatters");
assert.match(renderer, /function renderItemRow/, "Renderer should render rich item rows");
assert.match(renderer, /function evaluateVisibleWhen/, "Renderer should evaluate row-action visibility predicates");
assert.match(renderer, /function interpolateRoute/, "Renderer should interpolate row-action route tokens");
assert.match(contract, /function validateRegionsDescriptor/, "Manifest contract should validate descriptor regions");

// --- Manifest validation of the new descriptor fields. ---
const validErrors = validateModuleManifest(createModule());
assert.deepEqual(validErrors, [], `Shared-capability descriptor should pass validation: ${validErrors.join("; ")}`);

const missingBehaviorErrors = validateModuleManifest(createModule({
  viewSurfaces: [{ ...validSurface(), regions: [{ id: "side" }] }],
}));
assert.match(missingBehaviorErrors.join("\n"), /viewSurfaces\[0\]\.regions\[0\]\.behavior is required/, "Regions must declare a mount behavior");

const unknownRegionKeyErrors = validateModuleManifest(createModule({
  viewSurfaces: [{ ...validSurface(), regions: [{ id: "side", behavior: "x.mount", surprise: true }] }],
}));
assert.match(unknownRegionKeyErrors.join("\n"), /viewSurfaces\[0\]\.regions\[0\]\.surprise is not a supported field/, "Regions reject unknown keys");

const badVisibleWhenErrors = validateModuleManifest(createModule({
  viewSurfaces: [{
    ...validSurface(),
    detail: {
      itemRows: {
        itemsField: "items",
        rowActions: [{ id: "x", label: "X", behavior: "x.run", visibleWhen: { equals: "open" } }],
      },
    },
  }],
}));
assert.match(badVisibleWhenErrors.join("\n"), /visibleWhen\.field is required/, "Row-action visibleWhen must declare a field");

// --- Renderer capability execution via a fake DOM. ---
const context = createFakeBrowserContext({ responses: [
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
  { records: [{ record_id: "r1", name: "Record One", depth: 1, parent_id: "root", path: "root/r1", tags: [{ name: "Focus" }], children: [{ label: "Item A", qty: "x2", note: "hello", state: "open" }] }] },
], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, context, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, context, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const view = context.window.LongtailForge.view;
let mountedWith = null;
view.registerBehavior("caps.mount", (ctx) => {
  mountedWith = ctx;
  ctx.container.appendChild(context.document.createElement("p")).textContent = "REGION_MOUNTED";
});
let optionMount = null;
view.registerBehavior("caps.statusOptions", (ctx) => {
  optionMount = ctx;
  return [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
  ];
});

const host = context.document.createElement("main");
const surface = view.renderSurface(capabilityDescriptor(), host);
await surface.refresh();
await Promise.resolve();

// Capability 1: filter -> refetch query params (default + dynamic).
assert.equal(context.window.LongtailForge.api.calls[0], "/api/caps?status=open", "Filter defaults should be applied to the dataSource query");
const statusSelect = surface.querySelector("[data-view-input=\"status\"]");
assert.equal(optionMount.control, statusSelect, "Option-source behaviors should receive the select control");
assert.equal(typeof optionMount.setOptions, "function", "Option-source behaviors should receive a shared setOptions helper");
assert.equal(typeof optionMount.mountSearchOptions, "function", "Option-source behaviors should receive a shared search-options helper");
assert.match(statusSelect.textContent, /OpenClosed/, "Option-source behaviors should hydrate select option labels");
surface.viewState.filterValues.status = "closed";
await surface.refresh();
assert.ok(context.window.LongtailForge.api.calls.includes("/api/caps?status=closed"), "Changing a filter should refetch with new query params");

// Capability 2: mount slot/region filled by a registered behavior.
assert.ok(mountedWith && typeof mountedWith.refresh === "function", "Mount behavior should receive a safe context with refresh");
assert.match(surface.textContent, /REGION_MOUNTED/, "Registered mount behavior should fill its region container");

// Capability 2b: display-only hierarchy metadata + chip-list table display hooks.
const hierarchyLabel = surface.querySelectorAll(".view-hierarchy-label")
  .find((element) => element.dataset.viewHierarchyDepth === "1");
assert.ok(hierarchyLabel, "Hierarchy display labels should render when requested by a table column formatter");
assert.equal(hierarchyLabel.dataset.viewHierarchyDepth, "1", "Hierarchy display labels should carry display-only depth metadata");
assert.match(surface.textContent, /Focus/, "Chip-list table display hooks should render safe chip labels");

// Capability 3: rich item rows + state-gated row actions.
assert.match(surface.textContent, /Item A/, "Item rows should render the item title");
assert.match(surface.textContent, /x2/, "Item rows should render chip values");
assert.match(surface.textContent, /hello/, "Item rows should render meta fields");
assert.match(surface.textContent, /Complete/, "Row actions matching visibleWhen should render");
assert.doesNotMatch(surface.textContent, /Reopen/, "Row actions failing visibleWhen should not render");

// Region-only detail surfaces should not invent an item collection placeholder.
const regionOnlyContext = createFakeBrowserContext({ responses: [], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, regionOnlyContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, regionOnlyContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, regionOnlyContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, regionOnlyContext, { filename: "view-renderer.js" });
regionOnlyContext.window.LongtailForge.view.registerBehavior("caps.regionOnly", (ctx) => {
  ctx.container.appendChild(regionOnlyContext.document.createElement("p")).textContent = "REGION_ONLY_MOUNT";
});
const regionOnlyHost = regionOnlyContext.document.createElement("main");
const regionOnlySurface = regionOnlyContext.window.LongtailForge.view.renderSurface({
  id: "region-only-detail",
  layout: "single-column",
  detail: {
    regions: [{ id: "main-region", behavior: "caps.regionOnly" }],
  },
}, regionOnlyHost);
assert.match(regionOnlySurface.textContent, /REGION_ONLY_MOUNT/, "Region-only detail surfaces should mount registered regions");
assert.doesNotMatch(regionOnlySurface.textContent, /Items|No records loaded/, "Region-only detail surfaces should not render the generic item placeholder");

// Missing mount behavior fails visibly without breaking the surface.
const missingContext = createFakeBrowserContext({ responses: [{ records: [{ record_id: "r1", name: "Record One" }] }], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, missingContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, missingContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, missingContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, missingContext, { filename: "view-renderer.js" });
const missingHost = missingContext.document.createElement("main");
const missingSurface = missingContext.window.LongtailForge.view.renderSurface({
  id: "missing-region",
  layout: "single-column",
  regions: [{ id: "side", behavior: "not.registered" }],
  dataSource: { route: "/api/caps", fieldBindings: { id: "record_id" } },
}, missingHost);
await missingSurface.refresh();
assert.match(missingSurface.textContent, /Missing view behavior handler: not\.registered/, "Missing mount behaviors should fail visibly");

console.log("View shared capabilities regression passed.");
const { closeDatabase } = await import("../src/db/provider.js");
await closeDatabase();
await fixture.cleanup();

function capabilityDescriptor() {
  return {
    id: "caps-sample",
    layout: "single-column",
    filters: [{ field: "status", type: "select", queryKey: "status", default: "open", optionsSource: "caps.statusOptions" }],
    indexPanel: {
      title: "Caps index",
      itemTitleField: "title",
      itemDepthField: "depth",
      itemParentField: "parentId",
      itemPathField: "path",
    },
    table: {
      hierarchy: { depthField: "depth", parentField: "parentId", pathField: "path" },
      columns: [
        { field: "title", label: "Title", formatter: "hierarchy-label", depthField: "depth" },
        { field: "tags", label: "Tags", formatter: "chip-list", chipsField: "tags", chipLabelField: "name" },
      ],
    },
    regions: [{ id: "side", behavior: "caps.mount", title: "Side" }],
    detail: {
      header: { titleField: "title" },
      itemRows: {
        itemsField: "items",
        itemTitleField: "label",
        chips: [{ field: "qty" }],
        metaFields: ["note"],
        rowActions: [
          { id: "complete", label: "Complete", behavior: "item.complete", visibleWhen: { field: "state", equals: "open" } },
          { id: "reopen", label: "Reopen", behavior: "item.reopen", visibleWhen: { field: "state", equals: "done" } },
        ],
      },
    },
    dataSource: {
      route: "/api/caps",
      fieldBindings: { id: "record_id", title: "name", depth: "depth", parentId: "parent_id", path: "path", tags: "tags", items: "children" },
    },
  };
}

function createModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Sample module used by shared-capability validation regressions.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    protectedViews: [{ id: "sample", path: "/sample.html", moduleId: "sample-module", file: "sample.html" }],
    viewSurfaces: [validSurface()],
    ...overrides,
  };
}

function validSurface() {
  return {
    id: "sample-surface",
    moduleId: "sample-module",
    viewId: "sample",
    layout: "single-column",
    filters: [{ field: "status", type: "select", queryKey: "status", default: "active", optionsSource: "sample.statusOptions" }],
    indexPanel: {
      title: "Samples",
      itemTitleField: "title",
      itemDepthField: "depth",
      itemParentField: "parentId",
      itemPathField: "path",
    },
    regions: [{ id: "side", behavior: "sample.mount", title: "Side panel" }],
    table: {
      hierarchy: { depthField: "depth", parentField: "parentId", pathField: "path" },
      columns: [
        { field: "title", label: "Title", formatter: "hierarchy-label", depthField: "depth" },
        { field: "tags", label: "Tags", formatter: "chip-list", chipsField: "tags", chipLabelField: "name" },
      ],
    },
    detail: {
      header: { titleField: "title" },
      itemRows: {
        itemsField: "items",
        itemTitleField: "label",
        itemSubtitleField: "description",
        chips: [{ field: "qty", label: "Qty" }],
        metaFields: ["note"],
        actionsLabel: "Item actions",
        rowActions: [
          {
            id: "complete-item",
            label: "Complete",
            role: "primary",
            route: "/api/items/{id}/complete",
            method: "POST",
            visibleWhen: { field: "state", equals: "open" },
          },
        ],
      },
      regions: [{ id: "detail-side", behavior: "sample.detailMount" }],
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: { id: "record_id", title: "title", depth: "depth", parentId: "parent_id", path: "path", tags: "tags", items: "children" },
    },
  };
}
