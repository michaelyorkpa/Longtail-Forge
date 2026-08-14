export const regressionMeta = Object.freeze({
  id: "framework.reporting-contribution-contract",
  area: "framework",
  tier: "focused",
  tags: ["assets", "modules", "permissions", "reporting"],
  description: "Proves the data-only report manifest contract, Reporting asset ownership, and enabled/permission-filtered report listing seam.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

const fixture = await createDisposableDatabaseFixture("reporting-contribution-contract");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const {
  validateModuleManifest,
  validateModuleManifests,
} = await import("../../../src/core/modules/manifest-contract.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { timeTrackingModule } = await import("../../../src/modules/time-tracking/module.js");

try {
  assert.deepEqual(
    validateModuleManifest(timeTrackingModule, new Set(modulesService.listModules().map((module) => module.id))),
    [],
    "The Time Tracking report contribution should satisfy the runtime manifest contract",
  );
  assertRealContributionShape();
  assertValidatorRejectsInvalidShapesAndReferences();

  await initializeDatabase();
  const session = await readSeedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  const frameworkPermission = modulesService.listPermissionEntries().find((permission) => permission.id === "reporting.view");
  assert.equal(frameworkPermission?.moduleId, "framework", "reporting.view must be owned by the framework catalog");
  assert.equal(
    modulesService.listModulePermissionEntries().some((permission) => permission.id === "reporting.view"),
    false,
    "The disable-able Time Tracking manifest must not own reporting.view",
  );
  assert.equal(
    modulesService.listResourceDefinitions().find((resource) => resource.key === "reporting")?.moduleId,
    "framework",
    "The Reporting resource must be framework-owned",
  );
  assert.deepEqual(
    modulesService.listRolePermissionDefaults()
      .filter((mapping) => mapping.permissions.includes("reporting.view"))
      .map((mapping) => mapping.roleId),
    ["super_admin", "workspace_admin", "client_admin", "project_admin", "client_user", "project_user"],
    "Moving permission ownership must preserve existing role defaults",
  );

  const allowed = await modulesService.listReportingReports(session.workspace_id, session);
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].id, "project-time-billing");
  assert.equal(allowed[0].moduleId, "time-tracking");
  assert.equal(allowed[0].runner, "time-tracking.project-time-billing");
  assert.equal(allowed[0].renderer, "time-project-billing-table");
  assert.deepEqual(allowed[0].browserAssetIds, ["time-tracking-reporting-script"]);
  assert.equal(containsFunction(allowed[0]), false, "Catalog listing must remain data-only and execute no report behavior");
  assert.equal(
    (await modulesService.listActiveModuleBrowserAssets(session.workspace_id, session, "framework:reporting"))
      .some((asset) => asset.id === "time-tracking-reporting-script"),
    true,
    "An eligible report may deliver its owning module renderer asset",
  );

  const unauthorized = await modulesService.listReportingReports(session.workspace_id, {
    ...session,
    user_id: randomUUID(),
    username: `no-reporting-role-${randomUUID()}@example.test`,
  });
  assert.deepEqual(unauthorized, [], "Missing reporting.view must remove the contribution before catalog delivery");
  assert.equal(
    (await modulesService.listActiveModuleBrowserAssets(session.workspace_id, {
      ...session,
      user_id: randomUUID(),
      username: `no-reporting-asset-role-${randomUUID()}@example.test`,
    }, "framework:reporting")).some((asset) => asset.id === "time-tracking-reporting-script"),
    false,
    "Missing reporting.view must prevent renderer asset delivery",
  );

  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", false, { session });
  assert.deepEqual(
    await modulesService.listReportingReports(session.workspace_id, session),
    [],
    "Disabled modules must not contribute executable reports even when historical reads remain allowed",
  );
  assert.equal(
    (await modulesService.listActiveModuleBrowserAssets(session.workspace_id, session, "framework:reporting"))
      .some((asset) => asset.id === "time-tracking-reporting-script"),
    false,
    "Historical read access must not keep a disabled module renderer asset active",
  );
  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", true, { session });
  assert.equal((await modulesService.listReportingReports(session.workspace_id, session)).length, 1);

  console.log("Reporting contribution contract regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

function assertRealContributionShape() {
  const report = timeTrackingModule.reporting[0];
  const asset = timeTrackingModule.browserAssets.find((item) => item.id === report.browserAssetIds[0]);
  const filterTypes = report.filters.map((filter) => filter.type);

  assert.deepEqual(filterTypes, [
    "billing-period",
    "custom-date-range",
    "scope",
    "project-multi-select",
    "tag",
    "boolean",
  ]);
  assert.ok(asset, "The report renderer asset must be registered by its owning module");
  assert.equal(asset.moduleId, report.moduleId);
  assert.ok(asset.views.includes("framework:reporting"));
  assert.deepEqual(report.requiresEnabledModules, ["time-tracking", "client-projects"]);
  assert.equal(containsFunction(report), false);
}

function assertValidatorRejectsInvalidShapesAndReferences() {
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), requiredPermissions: ["sample.view"] }],
    })]),
    /requiredPermissions must include framework permission 'reporting\.view'/,
    "Every report must require the framework Reporting permission in addition to owner-specific permissions",
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), execute: () => {} }],
    })]),
    /reporting\[0\]\.execute is not a supported field/,
    "Executable manifest fields must be rejected",
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), renderer: "" }],
    })]),
    /reporting\[0\]\.renderer is required/,
  );
  assert.throws(
    () => {
      const report = sampleReport();
      delete report.requiredWorkspaceCapabilities;
      validateModuleManifests([sampleModule({ reporting: [report] })]);
    },
    /reporting\[0\]\.requiredWorkspaceCapabilities is required and must be an array of non-empty strings/,
    "Every report must declare its workspace-capability boundary explicitly, even when it is empty",
  );
  assert.throws(
    () => {
      const report = sampleReport();
      delete report.filters;
      validateModuleManifests([sampleModule({ reporting: [report] })]);
    },
    /reporting\[0\]\.filters is required and must be an array/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [{ id: "bad", label: "Bad", type: "freeform-javascript" }],
      }],
    })]),
    /reporting\[0\]\.filters\[0\]\.type must be one of/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), requiredPermissions: ["sample.missing"] }],
    })]),
    /requiredPermissions references unknown permission 'sample\.missing'/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [{ id: "scope", label: "Scope", type: "scope" }],
      }],
    })]),
    /filters\[0\]\.queryKeys is required and must be a non-empty array/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [{ id: "dates", label: "Dates", type: "custom-date-range", queryKeys: ["startDate"] }],
      }],
    })]),
    /queryKeys must contain exactly 2 keys/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [
          { id: "scope", label: "Scope", type: "scope", queryKeys: ["scopeId"] },
          { id: "tags", label: "Tags", type: "tag", queryKeys: ["scopeId"] },
        ],
      }],
    })]),
    /queryKeys entry 'scopeId' is duplicated across report filters/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [{
          id: "include-archived",
          label: "Include archived",
          type: "boolean",
          queryKeys: ["includeArchived"],
          defaultValue: "yes",
        }],
      }],
    })]),
    /defaultValue must be a boolean for 'boolean'/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), requiresEnabledModules: ["missing-module"] }],
    })]),
    /requiresEnabledModules references unknown module 'missing-module'/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{ ...sampleReport(), browserAssetIds: ["missing-asset"] }],
    })]),
    /browserAssetIds references unknown module browser asset 'missing-asset'/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      browserAssets: [{ ...sampleAsset(), views: ["sample-page"] }],
    })]),
    /must declare the 'framework:reporting' host target/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      browserAssets: [{ ...sampleAsset(), path: "https://example.test/renderer.js" }],
    })]),
    /must use a safe local browser path without a query or fragment/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      browserAssets: [sampleAsset(), sampleAsset()],
    })]),
    /browserAssets\[1\]\.id 'sample-reporting-script' is duplicated/,
  );
  assert.throws(
    () => validateModuleManifests([sampleModule({
      reporting: [{
        ...sampleReport(),
        filters: [{
          id: "dates",
          label: "Dates",
          type: "custom-date-range",
          visibleWhen: { filterId: "missing-filter", equals: "custom" },
        }],
      }],
    })]),
    /visibleWhen\.filterId references unknown filter 'missing-filter'/,
  );
}

function sampleModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Synthetic report contribution owner.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    browserAssets: [sampleAsset()],
    permissions: [{
      id: "sample.view",
      moduleId: "sample-module",
      label: "View Sample Reports",
      description: "View sample reports.",
      operation: "read",
    }],
    reporting: [sampleReport()],
    ...overrides,
  };
}

function sampleAsset() {
  return {
    id: "sample-reporting-script",
    moduleId: "sample-module",
    path: "/js/sample-reporting.js",
    type: "script",
    views: ["framework:reporting"],
  };
}

function sampleReport() {
  return {
    id: "sample-report",
    moduleId: "sample-module",
    label: "Sample Report",
    description: "Synthetic report contract proof.",
    category: "sample",
    renderer: "sample.report-table",
    runner: "sample.report-runner",
    requiredPermissions: ["reporting.view", "sample.view"],
    requiredWorkspaceCapabilities: ["time_tracking"],
    requiresEnabledModules: ["sample-module"],
    filters: [{ id: "scope", label: "Scope", type: "scope", queryKeys: ["scopeId"] }],
    browserAssetIds: ["sample-reporting-script"],
  };
}

function containsFunction(value) {
  if (typeof value === "function") {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.values(value).some(containsFunction);
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user, "Fresh database should seed a protected super admin");

  return workspaceSessionFixture(user);
}
