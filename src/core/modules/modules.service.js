import { listModules } from "./registry.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";

async function syncModuleRegistry(workspaceId) {
  const modules = listModules();
  const now = new Date().toISOString();
  const statements = modules.flatMap((moduleDefinition) => {
    const moduleStatus = "active";
    const workspaceStatus = moduleDefinition.enabledByDefault ? "enabled" : "disabled";

    return [
      `
INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES (
  ${sqlText(moduleDefinition.id)},
  ${sqlText(moduleDefinition.name)},
  ${sqlText(moduleDefinition.description)},
  ${sqlText(moduleDefinition.category)},
  ${sqlText(moduleStatus)},
  ${sqlText(moduleDefinition.version)},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(module_id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  version = excluded.version,
  updated_at = excluded.updated_at;
`,
      `
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(moduleDefinition.id)},
  ${sqlText(workspaceStatus)},
  ${moduleDefinition.enabledByDefault ? sqlText(now) : "NULL"},
  ${moduleDefinition.enabledByDefault ? "NULL" : sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, module_id) DO NOTHING;
`,
    ];
  });

  if (statements.length > 0) {
    await runSql(statements.join("\n"));
  }
}

async function decorateWorkspaceSettings(settings, workspaceId) {
  const moduleContext = await readWorkspaceModuleContext(workspaceId);

  return {
    ...settings,
    workspaceId,
    workspace_id: workspaceId,
    timeTrackingEnabled: moduleContext.moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled",
    enabledModules: moduleContext.enabledModules,
    modules: moduleContext.modules,
  };
}

async function readWorkspaceModuleContext(workspaceId) {
  const installedModules = listModules();
  const rows = await querySql(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY module_id;
`);
  const statusById = rows.reduce((statusMap, row) => {
    statusMap[row.module_id] = row.status === "enabled" ? "enabled" : "disabled";
    return statusMap;
  }, {});
  const modules = installedModules.map((moduleDefinition) => {
    const status = statusById[moduleDefinition.id] || "disabled";

    return {
      id: moduleDefinition.id,
      name: moduleDefinition.name,
      displayName: moduleDefinition.displayName || moduleDefinition.name,
      category: moduleDefinition.category,
      version: moduleDefinition.version,
      status,
      historicalReadAccess: moduleDefinition.historicalReadAccess !== false,
      navigation: moduleDefinition.navigation || [],
      dashboard: moduleDefinition.dashboard || [],
      reporting: moduleDefinition.reporting || [],
      publicApiEndpoints: moduleDefinition.publicApiEndpoints || [],
      requiredPermissions: moduleDefinition.requiredPermissions || [],
      settings: moduleDefinition.settings || [],
      workspaceCapabilityRequirements: moduleDefinition.workspaceCapabilityRequirements || [],
    };
  });
  const moduleStatusById = modules.reduce((statusMap, moduleDefinition) => {
    statusMap[moduleDefinition.id] = moduleDefinition.status;
    return statusMap;
  }, {});

  return {
    enabledModules: modules
      .filter((moduleDefinition) => moduleDefinition.status === "enabled")
      .map((moduleDefinition) => moduleDefinition.id),
    moduleStatusById,
    modules,
  };
}

async function readEnabledModuleIds(workspaceId) {
  const rows = await querySql(`
SELECT module_id
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
  AND status = 'enabled'
ORDER BY module_id;
`);

  return rows.map((row) => row.module_id);
}

async function canReadModule(workspaceId, moduleId) {
  const moduleDefinition = listModules().find((definition) => definition.id === moduleId);

  if (!moduleDefinition) {
    return false;
  }

  return moduleDefinition.historicalReadAccess !== false ||
    await readModuleStatus(workspaceId, moduleId) === "enabled";
}

async function canWriteModule(workspaceId, moduleId) {
  return Boolean(workspaceId && moduleId) &&
    await readModuleStatus(workspaceId, moduleId) === "enabled";
}

async function readModuleStatus(workspaceId, moduleId) {
  const rows = await querySql(`
SELECT status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
LIMIT 1;
`);

  return rows[0]?.status === "enabled" ? "enabled" : "disabled";
}

async function setModuleStatus(workspaceId, moduleId, enabled) {
  const now = new Date().toISOString();
  const status = enabled ? "enabled" : "disabled";

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    enabled_at = CASE WHEN ${sqlText(status)} = 'enabled' THEN COALESCE(enabled_at, ${sqlText(now)}) ELSE enabled_at END,
    disabled_at = CASE WHEN ${sqlText(status)} = 'disabled' THEN ${sqlText(now)} ELSE NULL END,
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
;
`);
}

export const modulesService = {
  canReadModule,
  canWriteModule,
  decorateWorkspaceSettings,
  readEnabledModuleIds,
  readModuleStatus,
  readWorkspaceModuleContext,
  setModuleStatus,
  syncModuleRegistry,
};
