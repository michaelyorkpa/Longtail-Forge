import { listModules } from "./registry.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";

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
  readEnabledModuleIds,
  readModuleStatus,
  setModuleStatus,
  syncModuleRegistry,
};
