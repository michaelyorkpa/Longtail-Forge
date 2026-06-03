import { querySql, runSql, sqlInteger, sqlText } from "../db/index.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const DEFAULT_WORKSPACE_NAME = "Raymond Tec";

async function readWorkspaceSettings(workspaceId) {
  const rows = await querySql(`
SELECT
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  workspace_settings.fiscal_year_start_month,
  workspace_settings.fiscal_year_start_day,
  workspace_settings.default_billing_rate,
  workspace_settings.billing_period_type,
  workspace_settings.billing_period_start_day,
  workspace_settings.rounding_enabled,
  workspace_settings.rounding_increment,
  workspace_settings.audit_logging_enabled,
  workspace_settings.audit_retention_days,
  workspace_settings.audit_settings_updated_at,
  workspace_settings.task_timers_enabled
FROM workspaces
INNER JOIN workspace_settings ON workspace_settings.workspace_id = workspaces.workspace_id
WHERE workspaces.workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  if (rows.length === 0) {
    return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
  }

  return settingsRowToWorkspaceSettings(rows[0]);
}

async function saveWorkspaceSettings(workspaceId, settings) {
  const workspaces = await querySql(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  if (workspaces.length === 0) {
    throw new AppError("No workspace exists for workspace settings.", 404);
  }

  const now = new Date().toISOString();

  await runSql(`
UPDATE workspaces
SET name = ${sqlText(settings.workspaceName)},
    workspace_type = ${sqlText(settings.workspaceType)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)};

UPDATE workspace_settings
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
  task_timers_enabled = ${sqlInteger(settings.taskTimersEnabled === false ? 0 : 1)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

function settingsRowToWorkspaceSettings(row) {
  return normalizeSettings({
    workspaceName: row.workspace_name,
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
    taskTimersEnabled: row.task_timers_enabled === undefined
      ? true
      : Number(row.task_timers_enabled) === 1,
  });
}

export const settingsRepository = {
  readWorkspaceSettings,
  saveWorkspaceSettings,
};
