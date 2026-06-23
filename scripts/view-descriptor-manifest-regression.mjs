import assert from "node:assert/strict";

import {
  ACTIVE_MANIFEST_FIELDS,
  validateModuleManifest,
} from "../src/core/modules/manifest-contract.js";

assert.equal(ACTIVE_MANIFEST_FIELDS.has("viewSurfaces"), true, "viewSurfaces should be an active manifest field");

const validErrors = validateModuleManifest(createModule());
assert.deepEqual(validErrors, [], `Valid viewSurfaces descriptor should pass validation: ${validErrors.join("; ")}`);

const sidebarDetailErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      layout: "sidebar-detail",
    },
  ],
}));
assert.deepEqual(sidebarDetailErrors, [], `sidebar-detail layout should pass validation: ${sidebarDetailErrors.join("; ")}`);

const slideOutSidebarErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      layout: "slide-out-sidebar",
      sidebarLabel: "Record tools",
      sidebarPanels: [
        {
          id: "controls",
          type: "filters",
          title: "Controls",
          open: true,
        },
      ],
    },
  ],
}));
assert.deepEqual(slideOutSidebarErrors, [], `slide-out-sidebar layout should pass validation: ${slideOutSidebarErrors.join("; ")}`);

const sidebarPanelErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      layout: "sidebar-detail",
      sidebarLabel: "Record tools",
      sidebarPanels: [
        {
          id: "controls",
          type: "filters",
          title: "Controls",
          open: true,
        },
        {
          id: "library",
          type: "navigation",
          title: "Library",
          behavior: "sample.library",
          collapsible: false,
        },
        {
          id: "records",
          type: "index",
          title: "Samples",
          open: false,
          footer: {
            title: "Sort and pagination",
            behavior: "sample.recordsFooter",
          },
        },
      ],
    },
  ],
}));
assert.deepEqual(sidebarPanelErrors, [], `sidebar panel descriptors should pass validation: ${sidebarPanelErrors.join("; ")}`);

const unknownTopLevelErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      unsupportedSurfaceKey: true,
    },
  ],
}));
assert.match(
  unknownTopLevelErrors.join("\n"),
  /viewSurfaces\[0\]\.unsupportedSurfaceKey is not a supported field/,
  "Unknown descriptor fields should fail fast",
);

const missingRequiredErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      id: "sample-table",
      layout: "table-page",
    },
  ],
}));
assert.match(missingRequiredErrors.join("\n"), /viewSurfaces\[0\]\.moduleId is required/, "moduleId should be required");
assert.match(missingRequiredErrors.join("\n"), /viewSurfaces\[0\]\.viewId is required/, "viewId should be required");
assert.match(
  missingRequiredErrors.join("\n"),
  /viewSurfaces\[0\]\.dataSource is required and must be an object/,
  "dataSource should be required",
);

const nestedShapeErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      table: {
        columns: [
          {
            label: "Title",
            surprise: "nope",
          },
        ],
      },
      dataSource: {
        route: "/api/sample-records",
        fieldBindings: {
          id: 123,
        },
      },
    },
  ],
}));
assert.match(
  nestedShapeErrors.join("\n"),
  /viewSurfaces\[0\]\.table\.columns\[0\]\.surprise is not a supported field/,
  "Nested descriptor fields should reject unknown keys",
);
assert.match(
  nestedShapeErrors.join("\n"),
  /viewSurfaces\[0\]\.table\.columns\[0\]\.field is required/,
  "Table columns should require a field binding",
);
assert.match(
  nestedShapeErrors.join("\n"),
  /viewSurfaces\[0\]\.dataSource\.fieldBindings\.id must be a non-empty string/,
  "Field bindings should map descriptor fields to source field names",
);

const invalidLayoutErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      layout: "kanban",
    },
  ],
}));
assert.match(
  invalidLayoutErrors.join("\n"),
  /viewSurfaces\[0\]\.layout must be single-column, stacked, sidebar-detail, slide-out-sidebar, or table-page/,
  "Unsupported layouts should fail before a renderer exists",
);

const invalidIndexSelectionErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      indexPanel: {
        title: "Samples",
        initialSelection: "latest",
      },
    },
  ],
}));
assert.match(
  invalidIndexSelectionErrors.join("\n"),
  /viewSurfaces\[0\]\.indexPanel\.initialSelection must be first or none/,
  "Index panel initial selection should be constrained to framework-known values",
);

const invalidSidebarPanelErrors = validateModuleManifest(createModule({
  viewSurfaces: [
    {
      ...validSurface(),
      layout: "sidebar-detail",
      sidebarPanels: [
        {
          id: "bad-panel",
          type: "custom",
          surprise: true,
          footer: {
            surprise: true,
          },
        },
        {
          id: "library",
          type: "navigation",
        },
      ],
    },
  ],
}));
assert.match(
  invalidSidebarPanelErrors.join("\n"),
  /viewSurfaces\[0\]\.sidebarPanels\[0\]\.surprise is not a supported field/,
  "Sidebar panel descriptors should reject unknown fields",
);
assert.match(
  invalidSidebarPanelErrors.join("\n"),
  /viewSurfaces\[0\]\.sidebarPanels\[0\]\.type must be filters, navigation, or index/,
  "Sidebar panel descriptors should reject unknown panel types",
);
assert.match(
  invalidSidebarPanelErrors.join("\n"),
  /viewSurfaces\[0\]\.sidebarPanels\[0\]\.footer\.surprise is not a supported field/,
  "Sidebar panel footer descriptors should reject unknown fields",
);
assert.match(
  invalidSidebarPanelErrors.join("\n"),
  /viewSurfaces\[0\]\.sidebarPanels\[1\]\.behavior is required/,
  "Navigation sidebar panels should require a module-owned mount behavior",
);

console.log("View descriptor manifest regression passed.");

function createModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Sample module used by manifest validation regressions.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    protectedViews: [
      {
        id: "sample",
        path: "/sample.html",
        moduleId: "sample-module",
        file: "sample.html",
      },
    ],
    viewSurfaces: [validSurface()],
    ...overrides,
  };
}

function validSurface() {
  return {
    id: "sample-table",
    moduleId: "sample-module",
    viewId: "sample",
    layout: "table-page",
    pageHeader: {
      title: "Sample Records",
      description: "Review sample records.",
      primaryAction: {
        id: "create-sample",
        label: "Create",
        role: "primary",
        behavior: "sample.create",
      },
    },
    filters: [
      {
        field: "status",
        type: "select",
        label: "Status",
        optionsSource: "sample.statuses",
        default: "active",
      },
    ],
    indexPanel: {
      title: "Sample Selector",
      initialSelection: "none",
      collapseOnSelect: true,
    },
    table: {
      columns: [
        {
          field: "title",
          label: "Title",
          widthHint: "wide",
        },
      ],
      rowActions: [
        {
          id: "open-sample",
          label: "Open",
          role: "secondary",
          behavior: "sample.open",
        },
      ],
      emptyState: {
        title: "No sample records",
      },
      overflow: true,
    },
    dataSource: {
      route: "/api/sample-records",
      fieldBindings: {
        id: "record_id",
        title: "title",
      },
    },
    actions: [
      {
        id: "refresh-samples",
        label: "Refresh",
        role: "secondary",
        behavior: "sample.refresh",
      },
    ],
  };
}
