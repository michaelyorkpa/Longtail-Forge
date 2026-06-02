import { listModules } from "./registry.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";

async function syncModuleRegistry(organizationId) {
  const modules = listModules();
  const now = new Date().toISOString();
  const statements = modules.flatMap((moduleDefinition) => {
    const moduleStatus = "active";
    const organizationStatus = moduleDefinition.enabledByDefault ? "enabled" : "disabled";

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
INSERT INTO organization_modules (organization_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (
  ${sqlText(organizationId)},
  ${sqlText(moduleDefinition.id)},
  ${sqlText(organizationStatus)},
  ${moduleDefinition.enabledByDefault ? sqlText(now) : "NULL"},
  ${moduleDefinition.enabledByDefault ? "NULL" : sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(organization_id, module_id) DO NOTHING;
UPDATE organization_modules
SET workspace_id = ${sqlText(organizationId)}
WHERE organization_id = ${sqlText(organizationId)}
  AND module_id = ${sqlText(moduleDefinition.id)}
  AND workspace_id IS NULL;
`,
    ];
  });

  if (statements.length > 0) {
    await runSql(statements.join("\n"));
  }
}

async function decorateWorkspaceSettings(settings, organizationId) {
  const moduleContext = await readWorkspaceModuleContext(organizationId);

  return {
    ...settings,
    workspaceId: organizationId,
    workspace_id: organizationId,
    timeTrackingEnabled: moduleContext.moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled",
    enabledModules: moduleContext.enabledModules,
    modules: moduleContext.modules,
  };
}

async function readWorkspaceModuleContext(organizationId) {
  const installedModules = listModules();
  const rows = await querySql(`
SELECT module_id, status
FROM organization_modules
WHERE organization_id = ${sqlText(organizationId)}
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

async function readEnabledModuleIds(organizationId) {
  const rows = await querySql(`
SELECT module_id
FROM organization_modules
WHERE organization_id = ${sqlText(organizationId)}
  AND status = 'enabled'
ORDER BY module_id;
`);

  return rows.map((row) => row.module_id);
}

async function canReadModule(organizationId, moduleId) {
  const moduleDefinition = listModules().find((definition) => definition.id === moduleId);

  if (!moduleDefinition) {
    return false;
  }

  return moduleDefinition.historicalReadAccess !== false ||
    await readModuleStatus(organizationId, moduleId) === "enabled";
}

async function canWriteModule(organizationId, moduleId) {
  return Boolean(organizationId && moduleId) &&
    await readModuleStatus(organizationId, moduleId) === "enabled";
}

async function readModuleStatus(organizationId, moduleId) {
  const rows = await querySql(`
SELECT status
FROM organization_modules
WHERE organization_id = ${sqlText(organizationId)}
  AND module_id = ${sqlText(moduleId)}
LIMIT 1;
`);

  return rows[0]?.status === "enabled" ? "enabled" : "disabled";
}

async function setModuleStatus(organizationId, moduleId, enabled) {
  const now = new Date().toISOString();
  const status = enabled ? "enabled" : "disabled";

  await runSql(`
UPDATE organization_modules
SET status = ${sqlText(status)},
    enabled_at = CASE WHEN ${sqlText(status)} = 'enabled' THEN COALESCE(enabled_at, ${sqlText(now)}) ELSE enabled_at END,
    disabled_at = CASE WHEN ${sqlText(status)} = 'disabled' THEN ${sqlText(now)} ELSE NULL END,
    updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)}
  AND module_id = ${sqlText(moduleId)};
UPDATE organization_modules
SET workspace_id = ${sqlText(organizationId)}
WHERE organization_id = ${sqlText(organizationId)}
  AND module_id = ${sqlText(moduleId)}
  AND workspace_id IS NULL;
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
