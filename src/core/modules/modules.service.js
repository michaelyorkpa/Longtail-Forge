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

export const modulesService = {
  readEnabledModuleIds,
  syncModuleRegistry,
};
