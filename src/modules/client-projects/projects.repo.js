import {
  querySql,
  runSql,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";
import {
  normalizeBillableFlag,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
} from "../../utils/normalizers.js";

async function readAll(organizationId) {
  const rows = await querySql(`
SELECT
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment
FROM projects
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY name;
`);

  return rows.map(projectRowToAppProject);
}

async function readById(organizationId, projectId) {
  const rows = await querySql(`
SELECT
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment
FROM projects
WHERE organization_id = ${sqlText(organizationId)}
  AND id = ${sqlText(projectId)}
LIMIT 1;
`);

  return rows[0] ? projectRowToAppProject(rows[0]) : null;
}

async function readByClientId(organizationId, clientId) {
  const rows = await querySql(`
SELECT
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment
FROM projects
WHERE organization_id = ${sqlText(organizationId)}
  AND client_id = ${sqlText(clientId)}
ORDER BY name;
`);

  return rows.map(projectRowToAppProject);
}

async function readByNameInScope(organizationId, clientId, projectName, excludeProjectId = "") {
  const normalizedClientId = String(clientId || "").trim();
  const clientScopeSql = normalizedClientId
    ? `client_id = ${sqlText(normalizedClientId)}`
    : "(client_id IS NULL OR client_id = '')";
  const excludeSql = excludeProjectId
    ? `AND id <> ${sqlText(excludeProjectId)}`
    : "";
  const rows = await querySql(`
SELECT
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment
FROM projects
WHERE organization_id = ${sqlText(organizationId)}
  AND ${clientScopeSql}
  AND lower(trim(name)) = lower(trim(${sqlText(projectName)}))
  ${excludeSql}
LIMIT 1;
`);

  return rows[0] ? projectRowToAppProject(rows[0]) : null;
}

async function create(organizationId, clientId, project) {
  const now = new Date().toISOString();
  await runSql(createInsertSql(organizationId, clientId, project, now));
}

async function update(organizationId, project) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE projects
SET
  workspace_id = ${sqlText(organizationId)},
  client_id = ${sqlNullableText(project.client_id)},
  parent_project_id = ${sqlNullableText(project.parent_project_id)},
  name = ${sqlText(project.name)},
  status = ${sqlText(project.status)},
  billable = ${sqlText(project.billable)},
  billing_rate = ${sqlNullableText(project.billing_rate)},
  billing_period_type = ${sqlNullableText(project.billing_period?.type)},
  billing_period_start_day = ${sqlNullableInteger(project.billing_period?.startDay)},
  billing_rounding_enabled = ${sqlNullableInteger(project.billing_rounding ? (project.billing_rounding.enabled ? 1 : 0) : null)},
  billing_rounding_increment = ${sqlNullableText(project.billing_rounding?.increment)},
  updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)}
  AND id = ${sqlText(project.id)};
`);
}

async function archive(organizationId, projectId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE projects
SET status = 'Inactive',
    updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)}
  AND id = ${sqlText(projectId)};
`);
}

function createInsertSql(organizationId, clientId, project, now) {
  return `
INSERT INTO projects (
  id,
  organization_id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(organizationId)},
  ${sqlText(organizationId)},
  ${sqlNullableText(clientId)},
  ${sqlNullableText(project.parent_project_id)},
  ${sqlText(project.name)},
  ${sqlText(project.status)},
  ${sqlText(project.billable)},
  ${sqlNullableText(project.billing_rate)},
  ${sqlNullableText(project.billing_period?.type)},
  ${sqlNullableInteger(project.billing_period?.startDay)},
  ${sqlNullableInteger(project.billing_rounding ? (project.billing_rounding.enabled ? 1 : 0) : null)},
  ${sqlNullableText(project.billing_rounding?.increment)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function projectRowToAppProject(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id || row.organization_id || "",
    client_id: row.client_id || "",
    parent_project_id: row.parent_project_id || "",
    name: row.name,
    billable: normalizeBillableFlag(row.billable),
    billing_rate: normalizeBillingRate(row.billing_rate),
    billing_period: billingPeriodRowToAppValue(row),
    billing_rounding: billingRoundingRowToAppValue(row),
    status: row.status,
  };
}

function billingPeriodRowToAppValue(row) {
  if (!row.billing_period_type) {
    return null;
  }

  return normalizeBillingPeriod({
    type: row.billing_period_type,
    startDay: row.billing_period_start_day,
  });
}

function billingRoundingRowToAppValue(row) {
  if (row.billing_rounding_enabled === null || row.billing_rounding_enabled === undefined) {
    return null;
  }

  return normalizeBillingRounding({
    enabled: Number(row.billing_rounding_enabled) === 1,
    increment: row.billing_rounding_increment,
  });
}

export const projectsRepository = {
  archive,
  create,
  createInsertSql,
  readAll,
  readByClientId,
  readById,
  readByNameInScope,
  update,
};
