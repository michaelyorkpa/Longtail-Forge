ALTER TABLE projects ADD COLUMN task_default_priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE projects ADD COLUMN task_default_status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE projects ADD COLUMN task_default_sort_order_json TEXT NOT NULL DEFAULT '["due_date","priority","status"]';

CREATE TABLE workspace_settings_032 (
  workspace_id TEXT PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL,
  fiscal_year_start_day INTEGER NOT NULL,
  default_billing_rate TEXT,
  billing_period_type TEXT NOT NULL,
  billing_period_start_day INTEGER NOT NULL,
  rounding_enabled INTEGER NOT NULL,
  rounding_increment TEXT NOT NULL,
  audit_logging_enabled INTEGER NOT NULL DEFAULT 1,
  audit_retention_days INTEGER NOT NULL DEFAULT 30,
  audit_settings_updated_at TEXT,
  task_timers_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT INTO workspace_settings_032 (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  task_timers_enabled,
  created_at,
  updated_at
)
SELECT
  workspace_settings.workspace_id,
  CASE WHEN workspaces.workspace_type IN ('personal', 'family') THEN 1 ELSE workspace_settings.fiscal_year_start_month END,
  CASE WHEN workspaces.workspace_type IN ('personal', 'family') THEN 1 ELSE workspace_settings.fiscal_year_start_day END,
  CASE WHEN workspaces.workspace_type IN ('personal', 'family') THEN NULL ELSE workspace_settings.default_billing_rate END,
  workspace_settings.billing_period_type,
  workspace_settings.billing_period_start_day,
  workspace_settings.rounding_enabled,
  workspace_settings.rounding_increment,
  workspace_settings.audit_logging_enabled,
  workspace_settings.audit_retention_days,
  workspace_settings.audit_settings_updated_at,
  workspace_settings.task_timers_enabled,
  workspace_settings.created_at,
  workspace_settings.updated_at
FROM workspace_settings
INNER JOIN workspaces ON workspaces.workspace_id = workspace_settings.workspace_id;

DROP TABLE workspace_settings;
ALTER TABLE workspace_settings_032 RENAME TO workspace_settings;
