import { querySql, runSql, sqlInteger, sqlText } from "../db/index.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const DEFAULT_WORKSPACE_NAME = "Raymond Tec";

async function readOrganizationSettings(organizationId) {
  const rows = await querySql(`
SELECT
  organizations.name AS organization_name,
  organizations.workspace_type,
  organization_settings.fiscal_year_start_month,
  organization_settings.fiscal_year_start_day,
  organization_settings.default_billing_rate,
  organization_settings.billing_period_type,
  organization_settings.billing_period_start_day,
  organization_settings.rounding_enabled,
  organization_settings.rounding_increment,
  organization_settings.audit_logging_enabled,
  organization_settings.audit_retention_days,
  organization_settings.audit_settings_updated_at
FROM organizations
INNER JOIN organization_settings ON organization_settings.organization_id = organizations.id
WHERE organizations.id = ${sqlText(organizationId)}
LIMIT 1;
`);

  if (rows.length === 0) {
    return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
  }

  return settingsRowToOrganizationSettings(rows[0]);
}

async function saveOrganizationSettings(organizationId, settings) {
  const organizations = await querySql(`
SELECT id
FROM organizations
WHERE id = ${sqlText(organizationId)}
LIMIT 1;
`);

  if (organizations.length === 0) {
    throw new AppError("No workspace exists for workspace settings.", 404);
  }

  const now = new Date().toISOString();

  await runSql(`
UPDATE organizations
SET name = ${sqlText(settings.organizationName)},
    workspace_type = ${sqlText(settings.workspaceType)},
    updated_at = ${sqlText(now)}
WHERE id = ${sqlText(organizationId)};
UPDATE organization_settings
SET
  fiscal_year_start_month = ${sqlInteger(settings.fiscalYear.startMonth)},
  fiscal_year_start_day = ${sqlInteger(settings.fiscalYear.startDay)},
  default_billing_rate = ${sqlText(settings.defaultBillingRate)},
  billing_period_type = ${sqlText(settings.billingPeriod.type)},
  billing_period_start_day = ${sqlInteger(settings.billingPeriod.startDay)},
  rounding_enabled = ${sqlInteger(settings.billingRounding.enabled ? 1 : 0)},
  rounding_increment = ${sqlText(settings.billingRounding.increment)},
  audit_logging_enabled = ${sqlInteger(settings.audit.loggingEnabled ? 1 : 0)},
  audit_retention_days = ${sqlInteger(settings.audit.retentionDays)},
  audit_settings_updated_at = ${sqlText(now)},
  updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)};
`);
}

function settingsRowToOrganizationSettings(row) {
  return normalizeSettings({
    organizationName: row.organization_name,
    workspaceType: row.workspace_type,
    fiscalYear: {
      startMonth: row.fiscal_year_start_month,
      startDay: row.fiscal_year_start_day,
    },
    defaultBillingRate: row.default_billing_rate,
    billingPeriod: {
      type: row.billing_period_type,
      startDay: row.billing_period_start_day,
    },
    billingRounding: {
      enabled: Number(row.rounding_enabled) === 1,
      increment: row.rounding_increment,
    },
    audit: {
      loggingEnabled: row.audit_logging_enabled === undefined
        ? true
        : Number(row.audit_logging_enabled) === 1,
      retentionDays: row.audit_retention_days,
    },
  });
}

export const settingsRepository = {
  readOrganizationSettings,
  saveOrganizationSettings,
};
