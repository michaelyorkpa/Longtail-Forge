import assert from "node:assert/strict";

import {
  validateModuleManifests,
} from "../src/core/modules/manifest-contract.js";

assert.doesNotThrow(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      permissions: [
        {
          id: "sample.view",
          moduleId: "sample-module",
          label: "View Samples",
          description: "View sample records.",
          operation: "read",
        },
      ],
      requiredPermissions: ["sample.view"],
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({
          moduleId: "sample-module",
          requiredPermission: "sample.view",
          viewId: "sample",
        }),
      ],
    }),
  ]),
  "A descriptor with known module, view, permission, route, method, and role references should validate",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({ moduleId: "sample-module", surfaceId: "shared-surface", viewId: "sample" }),
      ],
    }),
    createModule({
      id: "other-module",
      protectedViews: [protectedView("other-module", "other")],
      viewSurfaces: [
        validSurface({ moduleId: "other-module", surfaceId: "shared-surface", viewId: "other" }),
      ],
    }),
  ]),
  /other-module: viewSurfaces id 'shared-surface' is duplicated/,
  "Surface IDs should be unique across loaded module manifests",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({ moduleId: "missing-module", viewId: "sample" }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.moduleId references unknown module 'missing-module'/,
  "Descriptors should reject unknown module references",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({ moduleId: "sample-module", viewId: "missing-view" }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.viewId references unknown protected view 'sample-module:missing-view'/,
  "Descriptors should reject protected-view references that do not exist",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({
          moduleId: "sample-module",
          requiredPermission: "sample.missing",
          viewId: "sample",
        }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.actions\[0\]\.requiredPermissions references unknown permission 'sample.missing'/,
  "Descriptor actions should reject unknown permission references",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({
          dataSourceRoute: "https://example.test/api/sample-records",
          moduleId: "sample-module",
          viewId: "sample",
        }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.dataSource\.route must be relative/,
  "Descriptor data sources should reject absolute URL routes",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({
          actionRoute: "api/sample-records",
          moduleId: "sample-module",
          viewId: "sample",
        }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.actions\[0\]\.route must be a local route path/,
  "Descriptor action routes should be local app paths",
);

assert.throws(
  () => validateModuleManifests([
    createModule({
      id: "sample-module",
      protectedViews: [protectedView("sample-module", "sample")],
      viewSurfaces: [
        validSurface({
          actionRole: "weird",
          dataSourceMethod: "FETCH",
          moduleId: "sample-module",
          viewId: "sample",
        }),
      ],
    }),
  ]),
  /sample-module: viewSurfaces\[0\]\.dataSource\.method must be a supported HTTP method[\s\S]*sample-module: viewSurfaces\[0\]\.actions\[0\]\.role must be primary, secondary, destructive, or utility/,
  "Descriptor data sources and actions should reject unsupported methods and roles",
);

console.log("View descriptor reference regression passed.");

function createModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Sample module used by view descriptor reference regressions.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    protectedViews: [protectedView("sample-module", "sample")],
    viewSurfaces: [
      validSurface({
        moduleId: "sample-module",
        viewId: "sample",
      }),
    ],
    ...overrides,
  };
}

function protectedView(moduleId, id) {
  return {
    id,
    path: `/${id}.html`,
    moduleId,
    file: `${id}.html`,
  };
}

function validSurface({
  actionRole = "secondary",
  actionRoute = "/api/sample-records",
  dataSourceMethod = "GET",
  dataSourceRoute = "/api/sample-records",
  moduleId,
  requiredPermission,
  surfaceId = "sample-table",
  viewId,
} = {}) {
  return {
    id: surfaceId,
    moduleId,
    viewId,
    layout: "table-page",
    pageHeader: {
      title: "Sample Records",
      primaryAction: {
        id: "create-sample",
        label: "Create",
        role: "primary",
        behavior: "sample.create",
      },
    },
    table: {
      columns: [
        {
          field: "title",
          label: "Title",
        },
      ],
    },
    dataSource: {
      route: dataSourceRoute,
      method: dataSourceMethod,
      fieldBindings: {
        id: "record_id",
        title: "title",
      },
    },
    actions: [
      {
        id: "open-sample",
        label: "Open",
        role: actionRole,
        route: actionRoute,
        method: "GET",
        requiredPermissions: requiredPermission ? [requiredPermission] : [],
      },
    ],
  };
}
