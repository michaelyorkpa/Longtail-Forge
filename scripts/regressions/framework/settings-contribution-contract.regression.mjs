export const regressionMeta = Object.freeze({
  id: "framework.settings-contribution-contract",
  area: "framework",
  tier: "focused",
  tags: ["modules", "permissions", "settings"],
  description: "Proves the data-only settings manifest contract, protected framework boundary, and shared eligibility-filtered listing seam.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("settings-contribution-contract");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const {
  ACTIVE_MANIFEST_FIELDS,
  validateModuleManifest,
  validateModuleManifests,
} = await import("../../../src/core/modules/manifest-contract.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { settingsCatalogService } = await import("../../../src/services/settings-catalog.service.js");
const {
  registerFrameworkSettingDefinition,
} = await import("../../../src/core/settings/framework-settings-registry.js");
const { developerExampleModule } = await import("../../../src/modules/developer-example/module.js");
const { tasksModule } = await import("../../../src/modules/tasks/module.js");
const { timeTrackingModule } = await import("../../../src/modules/time-tracking/module.js");

try {
  assert.equal(ACTIVE_MANIFEST_FIELDS.has("settings"), true);
  assert.deepEqual(
    validateModuleManifest(developerExampleModule, new Set(modulesService.listModules().map((module) => module.id))),
    [],
    "The Developer Example settings should satisfy the runtime manifest contract",
  );
  assertRealContributionShape();
  assertValidatorContract();
  assertProtectedFrameworkBoundary();
  assertListingSeparation();
  assertOwnershipMigrationBoundary();
  assertDisabledModuleRecoveryBrowserContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  const disabledCatalog = await settingsCatalogService.read(session);
  assert.deepEqual(
    disabledCatalog.attachmentPoints.map((point) => point.id),
    ["workspace", "user", "module", "new-workspace"],
  );
  assert.equal(
    disabledCatalog.attachments.workspace.some((section) => (
      section.moduleId === "developer-example" && section.lifecycle === true
    )),
    true,
    "Framework-owned module lifecycle controls must remain available for disabled modules",
  );
  assert.equal(Object.hasOwn(disabledCatalog.attachments.module, "developer-example"), false);

  assert.equal(
    (await modulesService.listSettingsContributions(session.workspace_id, session))
      .some((setting) => setting.moduleId === "developer-example"),
    false,
    "Disabled modules must not contribute settings",
  );

  await modulesService.setModuleStatus(session.workspace_id, "developer-example", true, { session });
  const settings = await modulesService.listSettingsContributions(session.workspace_id, session);
  const hints = settings.find((setting) => (
    setting.moduleId === "developer-example" && setting.id === "developerExampleHintsEnabled"
  ));
  assert.ok(hints);
  assert.equal(hints.placement, "module");
  assert.equal(hints.target, "module", "An omitted target should normalize to the module target");
  assert.equal(hints.default, false);
  assert.deepEqual(hints.requiredPermissions, ["developer_example.view"]);
  assert.equal(Object.hasOwn(hints, "value"), false, "Contribution listing must not read or execute setting values");
  assert.equal(containsFunction(hints), false, "Catalog listing must remain data-only");
  const enabledCatalog = await settingsCatalogService.read(session);
  const developerSection = enabledCatalog.attachments.module["developer-example"]?.[0];
  assert.ok(developerSection, "Enabled module settings should attach to the owning module host");
  assert.equal(developerSection.placement, "module");
  assert.equal(
    developerSection.settings.find((setting) => setting.id === "developerExampleHintsEnabled")?.value,
    false,
    "The catalog should hydrate descriptor defaults without putting value access in contribution listing",
  );
  assert.equal(
    enabledCatalog.attachments.workspace
      .flatMap((section) => section.settings)
      .some((setting) => setting.id === "developerExampleHintsEnabled"),
    false,
    "Module placement settings must not leak into the workspace attachment",
  );
  assert.equal(
    settings.find((setting) => setting.moduleId === "lists" && setting.id === "listsEnabled")?.label,
    "Procurement Lists",
    "Settings listing should inherit workspace terminology resolution",
  );

  const unauthorized = await modulesService.listSettingsContributions(session.workspace_id, {
    ...session,
    user_id: randomUUID(),
    username: `settings-no-role-${randomUUID()}@example.test`,
  });
  assert.equal(
    unauthorized.some((setting) => (
      setting.moduleId === "developer-example" && setting.id === "developerExampleHintsEnabled"
    )),
    false,
    "Missing a setting's required permission must remove it before catalog delivery",
  );
  const unauthorizedCatalog = await settingsCatalogService.read({
    ...session,
    user_id: randomUUID(),
    username: `settings-catalog-no-role-${randomUUID()}@example.test`,
  });
  assert.deepEqual(unauthorizedCatalog.attachments.workspace, []);
  assert.equal(Object.hasOwn(unauthorizedCatalog.attachments.module, "developer-example"), false);

  assert.equal(
    settings.some((setting) => setting.moduleId === "tasks" && setting.id === "taskTimersEnabled"),
    true,
  );
  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", false, { session });
  assert.equal(
    (await modulesService.resolveProtectedModuleView(
      session.workspace_id,
      session,
      "/time-tracking-settings.html",
    ))?.status,
    "ok",
    "disabled Time Tracking must retain its in-context settings recovery route",
  );
  assert.equal(
    (await modulesService.listSettingsContributions(session.workspace_id, session))
      .some((setting) => setting.moduleId === "tasks" && setting.id === "taskTimersEnabled"),
    false,
    "A missing required enabled module must remove the dependent setting",
  );
  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", true, { session });
  await modulesService.setModuleStatus(session.workspace_id, "tasks", false, { session });
  assert.equal(
    (await modulesService.resolveProtectedModuleView(session.workspace_id, session, "/tasks-settings.html"))?.status,
    "ok",
    "disabled Tasks must retain its in-context settings recovery route",
  );
  await modulesService.setModuleStatus(session.workspace_id, "tasks", true, { session });

  assert.equal(modulesService.moduleContributionRequirementsAvailable({
    moduleId: "developer-example",
    requiredWorkspaceCapabilities: ["permissions"],
  }, developerExampleModule, {
    availableTools: new Set(["projects"]),
    enabledModuleIds: new Set(["developer-example"]),
  }), false);
  assert.equal(modulesService.moduleContributionRequirementsAvailable({
    moduleId: "developer-example",
    requiredWorkspaceCapabilities: ["permissions"],
  }, developerExampleModule, {
    availableTools: new Set(["permissions"]),
    enabledModuleIds: new Set(["developer-example"]),
  }), true, "Settings should inherit the shared workspace-capability filter");

  console.log("Settings contribution contract regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

function assertRealContributionShape() {
  const hints = developerExampleModule.settings.find((setting) => setting.id === "developerExampleHintsEnabled");
  const mode = developerExampleModule.settings.find((setting) => setting.id === "developerExampleMode");
  const taskTimers = tasksModule.settings.find((setting) => setting.id === "taskTimersEnabled");
  const developerSettingsView = developerExampleModule.protectedViews.find((view) => view.id === "developer-example");
  const developerSettingsAsset = developerExampleModule.browserAssets.find((asset) => asset.id === "developer-example-script");
  const tasksSettingsView = tasksModule.protectedViews.find((view) => view.id === "tasks-settings");
  const timeTrackingSettingsView = timeTrackingModule.protectedViews.find((view) => view.id === "time-tracking-settings");
  assert.equal(developerSettingsView?.path, "/developer-example.html");
  assert.equal(developerSettingsAsset?.path, "/js/module-settings.js");
  assert.deepEqual(developerSettingsAsset?.views, ["developer-example"]);
  assert.equal(tasksSettingsView?.allowDisabledRead, true);
  assert.equal(timeTrackingSettingsView?.allowDisabledRead, true);
  assert.equal(hints.placement, "module");
  assert.equal(hints.default, false);
  assert.deepEqual(mode.visibleWhen, { settingId: "developerExampleHintsEnabled", equals: true });
  assert.equal(taskTimers.handler, undefined, "Task timers should use ordinary generic persistence after migration");
  assert.deepEqual(taskTimers.requiredModules, ["time-tracking"]);
  assert.equal(
    tasksModule.settings.filter((setting) => setting.handler?.startsWith("tasks.reminder")).length,
    4,
    "Tasks reminder defaults should declare their four retained-table handlers",
  );
  assert.equal(
    modulesService.listModules().flatMap((module) => module.settings || []).some(containsFunction),
    false,
    "Settings manifests must contain IDs and metadata, never executable behavior",
  );
}

function assertDisabledModuleRecoveryBrowserContract() {
  const moduleSettingsSource = readFileSync("public/js/module-settings.js", "utf8");
  const rendererSource = readFileSync("public/js/shared/settings-renderer.js", "utf8");
  const navigationSource = readFileSync("public/js/navigation.js", "utf8");
  const footerSource = readFileSync("public/js/footer.js", "utf8");
  const workspaceSettingsSource = readFileSync("public/js/workspace-settings.js", "utf8");

  assert.match(moduleSettingsSource, /moduleDefinition\?\.status !== "enabled"[\s\S]*renderDisabledModuleRecovery/);
  assert.match(rendererSource, /renderDisabledModuleRecovery[\s\S]*Open Workspace Settings/);
  assert.match(rendererSource, /panel\.dataset\.disabledModuleRecovery = moduleId/);
  assert.match(navigationSource, /refreshAppShell = loadAppShellBootstrap[\s\S]*longtailforge:workspace-context-updated/);
  assert.match(workspaceSettingsSource, /await window\.LongtailForge\.refreshAppShell\?\.\(\)/);
  assert.match(footerSource, /longtailforge:workspace-context-updated[\s\S]*syncQuickActionCapture/);
}

function assertValidatorContract() {
  assert.doesNotThrow(() => validateModuleManifests([sampleModule({
    settings: [
      sampleSetting(),
      sampleSetting({ id: "toggleMode", type: "toggle", default: true }),
      sampleSetting({
        id: "radioMode",
        type: "radio",
        options: [{ label: "One", value: "one" }],
        default: "one",
      }),
      sampleSetting({
        id: "selectedModes",
        type: "multi-select",
        options: [{ label: "One", value: "one" }],
        default: ["one"],
      }),
    ],
  })]));

  assertInvalid(sampleSetting({ placement: undefined }), /settings\[0\]\.placement is required/);
  assertInvalid(sampleSetting({ placement: "somewhere" }), /placement must be one of workspace, user, module, new-workspace/);
  assertInvalid(sampleSetting({ target: "framework" }), /target 'framework' is reserved for framework-registered settings/);
  assertInvalid(sampleSetting({ protected: true }), /protected may only be set by a framework-registered setting/);
  assertInvalid(sampleSetting({ execute: () => {} }), /settings\[0\]\.execute is not a supported field/);
  assertInvalid(sampleSetting({ handler: () => {} }), /settings\[0\]\.handler must be a string/);
  assertInvalid(sampleSetting({ onChangeEffect: () => {} }), /settings\[0\]\.onChangeEffect must be a string/);
  assertInvalid(sampleSetting({ default: "yes" }), /default must be a boolean for 'boolean'/);
  assertInvalid(sampleSetting({
    type: "select",
    options: [{ label: "One", value: "one" }],
    default: "two",
  }), /default must match a registered option for 'select'/);
  assertInvalid(sampleSetting({ type: "info", readOnly: false }), /type 'info' must be read-only/);
  assertInvalid(sampleSetting({ visibleWhen: { settingId: "missingSetting", equals: true } }), /visibleWhen\.settingId references unknown setting 'missingSetting'/);
  assertInvalid(sampleSetting({ visibleWhen: { settingId: "sampleEnabled", equals: true } }), /visibleWhen\.settingId cannot reference itself/);
  assertInvalid([
    sampleSetting(),
    sampleSetting({ id: "dependent", visibleWhen: { settingId: "sampleEnabled", equals: "yes" } }),
  ], /visibleWhen\.equals must match setting 'sampleEnabled' type 'boolean'/);
  assertInvalid([
    sampleSetting({ visibleWhen: { settingId: "dependent", equals: true } }),
    sampleSetting({ id: "dependent", visibleWhen: { settingId: "sampleEnabled", equals: true } }),
  ], /visibleWhen dependencies must not form a cycle/);
  assertInvalid(sampleSetting({ requiredPermissions: ["sample.missing"] }), /requiredPermissions references unknown permission 'sample\.missing'/);
  assertInvalid(sampleSetting({ requiredModules: ["missing-module"] }), /requiredModules references unknown module 'missing-module'/);
  assertInvalid([
    sampleSetting(),
    sampleSetting(),
  ], /settings\[1\]\.id 'sampleEnabled' is duplicated/);
}

function assertProtectedFrameworkBoundary() {
  const unregister = registerFrameworkSettingDefinition({
    id: "reservedSetting",
    label: "Reserved Setting",
    type: "boolean",
    placement: "workspace",
    protected: true,
  });
  try {
    assertInvalid(sampleSetting({ id: "reservedSetting" }), /id 'reservedSetting' conflicts with a framework-registered setting/);
  } finally {
    unregister();
  }
}

function assertListingSeparation() {
  const source = readFileSync("src/core/modules/modules.service.js", "utf8");
  const routeSource = readFileSync("src/routes/settings.routes.js", "utf8");
  const catalogSource = readFileSync("src/services/settings-catalog.service.js", "utf8");
  assert.match(
    source,
    /async function listSettingsContributions\(workspaceId, session = null\)[\s\S]*listWorkspaceContributions\(workspaceId, session, "settings"\)/,
  );
  const listingBody = source.match(/async function listSettingsContributions[\s\S]*?\n}\n/)?.[0] || "";
  assert.doesNotMatch(listingBody, /settingsService|getValue|readModuleSetting/);
  assert.match(routeSource, /settingsRoutes\.get\("\/settings\/catalog"/);
  assert.match(catalogSource, /modulesService\.listSettingsContributions\(workspaceId, session\)/);
  assert.match(catalogSource, /attachments\.module/);
}

function assertOwnershipMigrationBoundary() {
  const serviceSource = readFileSync("src/services/settings.service.js", "utf8");
  const normalizersSource = readFileSync("src/utils/normalizers.js", "utf8");
  const repositorySource = readFileSync("src/repositories/settings.repo.js", "utf8");
  const migrationSource = readFileSync("src/db/migrations/071_migrate_module_settings_ownership.sql", "utf8");
  const filesSource = readFileSync("src/services/files.service.js", "utf8");
  const environmentExample = readFileSync(".env.example", "utf8");
  const forbiddenModuleKnowledge = /defaultBillingRate|billingPeriod(?:Type|StartDay)?|fiscalYear(?:StartMonth|StartDay)?|billingRounding(?:Enabled|Increment)?|taskTimersEnabled|taskReminderDefaults|fileTypePolicyMode|StorageLimitBytes/;

  assert.doesNotMatch(serviceSource, /from\s+["']\.\.\/modules\//, "The framework settings service must not import feature modules");
  assert.doesNotMatch(serviceSource, forbiddenModuleKnowledge, "The framework settings service must not name module-owned settings");
  assert.doesNotMatch(normalizersSource, forbiddenModuleKnowledge, "Framework settings normalization must remain module-agnostic");
  assert.doesNotMatch(repositorySource, /fiscal_year|default_billing_rate|billing_period|rounding_(?:enabled|increment)|task_timers_enabled/, "The framework repository must not retain module-owned columns");
  for (const migratedKey of [
    "client-projects', 'defaultBillingRate",
    "client-projects', 'billingPeriodType",
    "time-tracking', 'fiscalYearStartMonth",
    "time-tracking', 'billingRoundingEnabled",
    "tasks', 'taskTimersEnabled",
  ]) {
    assert.match(migrationSource, new RegExp(migratedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Migration 071 should preserve ${migratedKey}`);
  }
  assert.match(filesSource, /registerFrameworkSettingDefinition[\s\S]*files\.fileTypePolicyMode[\s\S]*files\.internalStorageLimitBytes[\s\S]*files\.perUserStorageLimitBytes/, "Files policy and quotas should be protected framework contributions");
  assert.match(environmentExample, /LONGTAIL_SECURE_NOTES_MASTER_KEY[\s\S]*LONGTAIL_STORAGE_PROVIDER[\s\S]*LONGTAIL_FILE_SCANNER/, "Secrets, storage providers, and scanner selection should remain environment configuration");
}

function assertInvalid(settings, pattern) {
  assert.throws(
    () => validateModuleManifests([sampleModule({ settings: Array.isArray(settings) ? settings : [settings] })]),
    pattern,
  );
}

function sampleModule(overrides = {}) {
  return {
    id: "sample-module",
    name: "Sample Module",
    displayName: "Sample Module",
    description: "Synthetic settings contribution owner.",
    category: "test",
    version: "0.0.0",
    enabledByDefault: true,
    permissions: [{
      id: "sample.view",
      moduleId: "sample-module",
      label: "View Sample Settings",
      description: "View sample settings.",
      operation: "read",
    }],
    settings: [sampleSetting()],
    ...overrides,
  };
}

function sampleSetting(overrides = {}) {
  return {
    id: "sampleEnabled",
    label: "Sample Enabled",
    type: "boolean",
    placement: "module",
    target: "module",
    default: false,
    requiredPermissions: ["sample.view"],
    requiredWorkspaceCapabilities: [],
    requiresEnabledModules: ["sample-module"],
    ...overrides,
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
  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
