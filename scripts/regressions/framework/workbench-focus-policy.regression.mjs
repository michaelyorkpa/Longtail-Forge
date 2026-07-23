export const regressionMeta = Object.freeze({
  id: "framework.workbench-focus-policy",
  area: "framework",
  tier: "focused",
  tags: ["permissions", "settings", "workbench"],
  description: "Proves the protected Workbench focus-policy catalog, persistence, validation, defaults, and server-owned ordering contract.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("workbench-focus-policy");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const {
  DEFAULT_WORKBENCH_FOCUS_POLICY,
  WORKBENCH_FOCUS_ORDER_PRESETS,
  WORKBENCH_FOCUS_SETTING_IDS,
} = await import("../../../src/core/settings/workbench-focus-policy.js");
const { settingsCatalogService } = await import("../../../src/services/settings-catalog.service.js");
const { settingsService } = await import("../../../src/services/settings.service.js");
const { FOCUS_MODE_IDS, workFocusModesService } = await import("../../../src/services/work-focus-modes.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  assert.equal(
    modulesService.listModules().some((moduleDefinition) => moduleDefinition.id === "workbench"),
    false,
    "Workbench settings must not require a fake feature-module manifest",
  );

  const catalog = await settingsCatalogService.read(session);
  const section = catalog.attachments.module.workbench?.[0];
  assert.ok(section, "Authorized workspace administrators should receive a Workbench module-settings section");
  assert.equal(section.displayName, "Workbench");
  assert.deepEqual(
    section.settings.map((setting) => setting.id).sort(),
    Object.values(WORKBENCH_FOCUS_SETTING_IDS).sort(),
  );
  assert.equal(section.settings.every((setting) => setting.target === "framework" && setting.protected === true), true);
  assert.deepEqual(
    section.settings.find((setting) => setting.id === WORKBENCH_FOCUS_SETTING_IDS.candidateGroups)?.value,
    [...DEFAULT_WORKBENCH_FOCUS_POLICY.candidateGroups],
    "An absent policy should hydrate the 0.33.21.3.1-compatible candidate groups",
  );
  assert.equal(
    section.settings.find((setting) => setting.id === WORKBENCH_FOCUS_SETTING_IDS.priorityOrder)?.value,
    DEFAULT_WORKBENCH_FOCUS_POLICY.priorityOrder,
  );

  const unauthorizedSession = {
    ...session,
    user_id: randomUUID(),
    username: `workbench-settings-no-role-${randomUUID()}@example.test`,
  };
  const unauthorizedCatalog = await settingsCatalogService.read(unauthorizedSession);
  assert.equal(
    Object.hasOwn(unauthorizedCatalog.attachments.module, "workbench"),
    false,
    "The normal workspace-settings permission filter should remove Workbench policy",
  );
  await assert.rejects(
    () => settingsService.save({
      frameworkSettings: {
        [WORKBENCH_FOCUS_SETTING_IDS.priorityOrder]: WORKBENCH_FOCUS_ORDER_PRESETS.recentFirst,
      },
    }, unauthorizedSession),
    (error) => error?.statusCode === 403,
  );

  const defaultFocus = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.startMyDay,
    today: "2026-07-21",
  });
  assert.deepEqual(defaultFocus.candidateQuery.rankBuckets, [
    "running_timer",
    "paused_timer",
    "overdue_assigned_work",
    "due_today",
    "blocked_or_stale",
    "recently_touched",
  ]);
  assert.deepEqual(defaultFocus.candidateQuery.excludeStatusFilters, ["blocked"]);

  await settingsService.save({
    frameworkSettings: {
      [WORKBENCH_FOCUS_SETTING_IDS.candidateGroups]: [...DEFAULT_WORKBENCH_FOCUS_POLICY.candidateGroups],
      [WORKBENCH_FOCUS_SETTING_IDS.priorityOrder]: WORKBENCH_FOCUS_ORDER_PRESETS.recentFirst,
    },
  }, session);
  assert.deepEqual(
    await querySql(`
SELECT module_id, setting_id, setting_value_json
FROM workspace_module_settings
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'framework'
  AND setting_id LIKE 'workbench.%'
ORDER BY setting_id;
`),
    [{
      module_id: "framework",
      setting_id: WORKBENCH_FOCUS_SETTING_IDS.priorityOrder,
      setting_value_json: JSON.stringify(WORKBENCH_FOCUS_ORDER_PRESETS.recentFirst),
    }],
    "Only changed framework values should persist through the canonical generic settings table",
  );

  const adjustedFocus = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.startMyDay,
    today: "2026-07-21",
  });
  assert.deepEqual(adjustedFocus.candidateQuery.rankBuckets, [
    "running_timer",
    "paused_timer",
    "recently_touched",
    "overdue_assigned_work",
    "due_today",
    "blocked_or_stale",
  ]);
  assert.deepEqual(
    new Set(adjustedFocus.candidateQuery.rankBuckets),
    new Set(defaultFocus.candidateQuery.rankBuckets),
    "Changing priority should reorder the same eligible candidate groups",
  );
  assert.deepEqual(adjustedFocus.candidateQuery.excludeStatusFilters, ["blocked"]);
  assert.deepEqual(adjustedFocus.candidateQuery.rankBuckets.slice(0, 2), ["running_timer", "paused_timer"]);

  await assert.rejects(
    () => settingsService.save({
      frameworkSettings: {
        [WORKBENCH_FOCUS_SETTING_IDS.priorityOrder]: "free_form_weighting",
      },
    }, session),
    (error) => error?.statusCode === 400 && /registered options/.test(error.message),
    "Unknown policy presets must fail canonical settings validation",
  );

  await runSql(`
UPDATE workspace_module_settings
SET setting_value_json = '"unsupported"'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'framework'
  AND setting_id = ${sqlText(WORKBENCH_FOCUS_SETTING_IDS.priorityOrder)};
`);
  const invalidStoredFallback = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.startMyDay,
    today: "2026-07-21",
  });
  assert.deepEqual(
    invalidStoredFallback.candidateQuery.rankBuckets,
    defaultFocus.candidateQuery.rankBuckets,
    "An invalid stored value should fall back deterministically to the compatible default",
  );

  assertBrowserAndNavigationContract();
  console.log("Workbench focus policy regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

function assertBrowserAndNavigationContract() {
  const view = readFileSync("views/protected/workbench-settings.html", "utf8");
  const adapter = readFileSync("public/js/module-settings.js", "utf8");
  const navigation = readFileSync("src/services/app-shell.service.js", "utf8");
  const moduleContract = readFileSync("docs/module-contract.md", "utf8");
  const settingsOwnership = readFileSync("docs/settings-ownership.md", "utf8");

  assert.match(view, /data-settings-host="module" data-settings-module-id="workbench"/);
  assert.match(view, /js\/shared\/settings-renderer\.js[\s\S]*js\/shared\/settings-host\.js[\s\S]*js\/module-settings\.js/);
  assert.match(adapter, /setting\.target !== "framework"[\s\S]*frameworkSettings\[setting\.id\]/);
  assert.doesNotMatch(adapter, /moduleId\s*===\s*["']workbench["']/, "The shared page adapter must not branch on Workbench");
  assert.match(navigation, /permissionHints\.workspaceSettingsManage[\s\S]*label: "Workbench"[\s\S]*href: "workbench-settings\.html"/);
  assert.match(moduleContract, /0\.33\.21\.3\.2[\s\S]*bounded workspace focus policy[\s\S]*Running and paused timers remain fixed first/);
  assert.match(settingsOwnership, /workbench\.focusCandidateGroups[\s\S]*workbench\.focusPriorityOrder[\s\S]*Blocked work appears only in Review blocked work/);
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
