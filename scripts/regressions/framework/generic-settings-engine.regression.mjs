export const regressionMeta = Object.freeze({
  id: "framework.generic-settings-engine",
  area: "framework",
  tier: "focused",
  tags: ["database", "modules", "settings"],
  description: "Proves generic workspace/module settings persistence, scoped accessors, opt-in persistence handlers, and post-save effects.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("generic-settings-engine");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { settingsService } = await import("../../../src/services/settings.service.js");
const unregister = [];
let currentSession;

try {
  await initializeDatabase();
  const session = await readSeedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  assert.equal(
    await settingsService.getValue(session, "developer-example", "developerExampleHintsEnabled"),
    false,
    "An absent generic value should resolve from the descriptor default",
  );

  let moduleEffectCalls = 0;
  unregister.push(settingsService.registerOnChangeEffect(
    "developer-example.developerExampleHintsEnabled",
    async ({ moduleId, previousValue, settingId, value, workspaceId }) => {
      moduleEffectCalls += 1;
      assert.equal(workspaceId, session.workspace_id);
      assert.equal(moduleId, "developer-example");
      assert.equal(settingId, "developerExampleHintsEnabled");
      assert.equal(previousValue, false);
      assert.equal(value, true);
    },
  ));

  const saved = await settingsService.save({
    moduleSettings: {
      "developer-example": {
        developerExampleHintsEnabled: true,
      },
    },
  }, session);
  assert.equal(moduleEffectCalls, 1, "A successful changed save should run its effect exactly once");
  assert.equal(readSettingValue(saved.data, "developer-example", "developerExampleHintsEnabled"), true);
  assert.equal(
    await settingsService.getValue(session, "developer-example", "developerExampleHintsEnabled"),
    true,
    "The uniform accessor should return the stored generic value",
  );

  const storedRows = await querySql(`
SELECT module_id, setting_id, setting_value_json
FROM workspace_module_settings
WHERE workspace_id = '${session.workspace_id.replaceAll("'", "''")}'
  AND module_id = 'developer-example'
  AND setting_id = 'developerExampleHintsEnabled';
`);
  assert.deepEqual(storedRows, [{
    module_id: "developer-example",
    setting_id: "developerExampleHintsEnabled",
    setting_value_json: "true",
  }]);

  const workspaceColumns = await querySql("PRAGMA table_info(workspace_settings);");
  assert.equal(
    workspaceColumns.some((column) => column.name === "developer_example_hints_enabled"),
    false,
    "A generic module setting must not require a workspace_settings column",
  );

  await settingsService.save({
    moduleSettings: {
      "developer-example": {
        developerExampleHintsEnabled: true,
      },
    },
  }, session);
  assert.equal(moduleEffectCalls, 1, "Saving an unchanged value should not rerun its effect");

  await assertRejectedSave({
    "developer-example": { unknownSetting: true },
  }, /Unknown module setting 'developer-example\.unknownSetting'/);
  await assertRejectedSave({
    "developer-example": { developerExampleMode: "editable" },
  }, /developer-example\.developerExampleMode.*read-only/);
  await assertRejectedSave({
    "developer-example": { developerExampleHintsEnabled: "yes" },
  }, /developer-example\.developerExampleHintsEnabled.*boolean/);
  assert.equal(moduleEffectCalls, 1, "Rejected saves must never run on-change effects");

  await settingsService.save({
    moduleSettings: {
      tasks: { taskTimersEnabled: false },
    },
  }, session);
  assert.equal(
    await settingsService.getValue(session, "tasks", "taskTimersEnabled"),
    false,
    "A migrated ordinary setting should read from generic storage",
  );
  const taskGenericRows = await querySql(`
SELECT setting_value_json
FROM workspace_module_settings
WHERE workspace_id = '${session.workspace_id.replaceAll("'", "''")}'
  AND module_id = 'tasks'
  AND setting_id = 'taskTimersEnabled';
`);
  assert.deepEqual(taskGenericRows, [{ setting_value_json: "false" }], "Task timer enablement should use generic storage after migration");
  assert.equal(
    workspaceColumns.some((column) => column.name === "task_timers_enabled"),
    false,
    "The migrated Tasks value should no longer have a workspace_settings column",
  );

  unregister.push(settingsService.registerFrameworkSetting({
    id: "genericFlag",
    label: "Generic Framework Flag",
    type: "boolean",
  }));
  assert.equal(await settingsService.getFrameworkValue(session, "genericFlag"), false);
  assert.deepEqual(
    await settingsService.setFrameworkValue(session, "genericFlag", true),
    { changed: true, value: true },
  );
  const frameworkGenericRows = await querySql(`
SELECT setting_value_json
FROM workspace_module_settings
WHERE workspace_id = '${session.workspace_id.replaceAll("'", "''")}'
  AND module_id = 'framework'
  AND setting_id = 'genericFlag';
`);
  assert.deepEqual(frameworkGenericRows, [{ setting_value_json: "true" }]);

  let frameworkStoredValue = "safe";
  let frameworkWrites = 0;
  let frameworkEffects = 0;
  unregister.push(settingsService.registerFrameworkSetting({
    id: "exampleMode",
    label: "Example Mode",
    type: "select",
    options: [
      { label: "Safe", value: "safe" },
      { label: "Active", value: "active" },
    ],
  }));
  unregister.push(settingsService.registerPersistenceHandler("framework.exampleMode", {
    async read() {
      return frameworkStoredValue;
    },
    async write({ value }) {
      frameworkWrites += 1;
      frameworkStoredValue = value;
    },
  }));
  unregister.push(settingsService.registerOnChangeEffect("framework.exampleMode", async ({ value }) => {
    frameworkEffects += 1;
    assert.equal(value, "active");
  }));

  assert.equal(await settingsService.getFrameworkValue(session, "exampleMode"), "safe");
  assert.deepEqual(
    await settingsService.setFrameworkValue(session, "exampleMode", "active"),
    { changed: true, value: "active" },
  );
  assert.equal(frameworkWrites, 1, "Framework-target settings should use the same persistence registry");
  assert.equal(frameworkEffects, 1, "Framework-target settings should use the same effect registry");
  assert.equal(await settingsService.getFrameworkValue(session, "exampleMode"), "active");

  console.log("Generic settings engine regression passed.");
} finally {
  for (const remove of unregister.reverse()) {
    remove();
  }
  await closeSqlite();
  await fixture.cleanup();
}

async function assertRejectedSave(moduleSettings, messagePattern) {
  await assert.rejects(
    () => settingsService.save({ moduleSettings }, currentSession),
    (error) => error?.statusCode === 400 && messagePattern.test(error.message),
  );
}

function readSettingValue(settings, moduleId, settingId) {
  return settings.moduleSettings
    .find((moduleDefinition) => moduleDefinition.moduleId === moduleId)
    ?.settings.find((setting) => setting.id === settingId)
    ?.value;
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

  currentSession = {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
  return currentSession;
}
