CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  workspace_type TEXT NOT NULL DEFAULT 'business',
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workspaces (
  workspace_id,
  name,
  status,
  workspace_type,
  owner_user_id,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  status,
  workspace_type,
  owner_user_id,
  created_at,
  updated_at
FROM organizations;

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL,
  fiscal_year_start_day INTEGER NOT NULL,
  default_billing_rate TEXT NOT NULL,
  billing_period_type TEXT NOT NULL,
  billing_period_start_day INTEGER NOT NULL,
  rounding_enabled INTEGER NOT NULL,
  rounding_increment TEXT NOT NULL,
  audit_logging_enabled INTEGER NOT NULL DEFAULT 1,
  audit_retention_days INTEGER NOT NULL DEFAULT 30,
  audit_settings_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR IGNORE INTO workspace_settings (
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
  created_at,
  updated_at
)
SELECT
  organization_id,
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
  created_at,
  updated_at
FROM organization_settings;

ALTER TABLE projects ADD COLUMN workspace_id TEXT;
UPDATE projects SET workspace_id = organization_id WHERE workspace_id IS NULL;

ALTER TABLE time_entries ADD COLUMN workspace_id TEXT;
UPDATE time_entries SET workspace_id = organization_id WHERE workspace_id IS NULL;

ALTER TABLE audit_logs ADD COLUMN workspace_id TEXT;
UPDATE audit_logs SET workspace_id = organization_id WHERE workspace_id IS NULL;

ALTER TABLE api_keys ADD COLUMN workspace_id TEXT;
UPDATE api_keys SET workspace_id = organization_id WHERE workspace_id IS NULL;

ALTER TABLE user_role_assignments ADD COLUMN workspace_id TEXT;
UPDATE user_role_assignments SET workspace_id = organization_id WHERE workspace_id IS NULL;

ALTER TABLE organization_modules ADD COLUMN workspace_id TEXT;
UPDATE organization_modules SET workspace_id = organization_id WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_type
ON workspaces (workspace_type);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
ON workspaces (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_workspace
ON user_workspaces (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_status_updated
ON projects (workspace_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_project_end
ON time_entries (workspace_id, project_id, end_time);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created
ON audit_logs (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_status
ON api_keys (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_user
ON user_role_assignments (workspace_id, user_id);
