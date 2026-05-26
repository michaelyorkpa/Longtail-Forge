import {
  querySql,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "../db/index.js";
import {
  normalizeBillableFlag,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
} from "../utils/normalizers.js";

async function readAll(organizationId) {
  const rows = await querySql(`
SELECT
  id,
  client_id,
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

function createInsertSql(organizationId, clientId, project, now) {
  return `
INSERT INTO projects (
  id,
  organization_id,
  client_id,
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
  ${sqlText(clientId)},
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
    client_id: row.client_id,
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
  createInsertSql,
  readAll,
};
