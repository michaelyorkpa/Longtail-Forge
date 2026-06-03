PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS workspace_modules (
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled',
  enabled_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, module_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id)
);

INSERT OR REPLACE INTO workspace_modules (
  workspace_id,
  module_id,
  status,
  enabled_at,
  disabled_at,
  updated_at
)
SELECT
  COALESCE(workspace_id, organization_id),
  module_id,
  status,
  enabled_at,
  disabled_at,
  updated_at
FROM organization_modules;

UPDATE roles
SET role_id = 'workspace_admin',
    role_name = 'Workspace Administrator',
    description = 'Controls users, settings, clients, projects, time, reporting, and audit logs inside one workspace.',
    assignable_scope_type = 'workspace'
WHERE role_id = 'organization_admin';

INSERT OR IGNORE INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES (
  'workspace_admin',
  'Workspace Administrator',
  'Controls users, settings, clients, projects, time, reporting, and audit logs inside one workspace.',
  'workspace',
  20
);

UPDATE permissions
SET permission_id = 'workspace_settings.manage',
    permission_name = 'Manage Workspace Settings',
    description = 'View and change workspace settings.'
WHERE permission_id = 'organization_settings.manage';

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES ('workspace_settings.manage', 'Manage Workspace Settings', 'View and change workspace settings.');

UPDATE role_permissions
SET role_id = 'workspace_admin'
WHERE role_id = 'organization_admin';

UPDATE role_permissions
SET permission_id = 'workspace_settings.manage'
WHERE permission_id = 'organization_settings.manage';

DELETE FROM role_permissions
WHERE role_id IN ('client_admin', 'project_admin')
  AND permission_id = 'users.manage';

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('workspace_admin', 'users.manage'),
  ('workspace_admin', 'roles.assign'),
  ('workspace_admin', 'workspace_settings.manage'),
  ('workspace_admin', 'clients.manage'),
  ('workspace_admin', 'projects.manage'),
  ('workspace_admin', 'billing.manage'),
  ('workspace_admin', 'time_entries.create'),
  ('workspace_admin', 'time_entries.edit_all'),
  ('workspace_admin', 'reporting.view'),
  ('workspace_admin', 'audit_logs.view'),
  ('project_admin', 'roles.assign');

UPDATE user_role_assignments
SET role_id = 'workspace_admin'
WHERE role_id = 'organization_admin';

UPDATE user_role_assignments
SET scope_type = 'workspace'
WHERE scope_type = 'organization';

CREATE TABLE users_workspace (
  user_id TEXT PRIMARY KEY,
  home_workspace_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  alt_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  password TEXT NOT NULL,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  user_status TEXT NOT NULL DEFAULT 'active',
  protected_user TEXT NOT NULL DEFAULT 'no',
  active_workspace_id TEXT,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO users_workspace (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
SELECT
  user_id,
  organization_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  COALESCE(active_workspace_id, organization_id)
FROM users
ORDER BY rowid;

DROP TABLE users;
ALTER TABLE users_workspace RENAME TO users;

CREATE TABLE sessions_workspace (
  session_id TEXT PRIMARY KEY,
  home_workspace_id TEXT NOT NULL,
  active_workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

INSERT OR REPLACE INTO sessions_workspace (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  ip_address,
  expires_at,
  created_at,
  updated_at
)
SELECT
  session_id,
  organization_id,
  COALESCE(active_workspace_id, organization_id),
  user_id,
  username,
  timezone,
  ip_address,
  expires_at,
  created_at,
  updated_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_workspace RENAME TO sessions;

CREATE TABLE clients_workspace (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  parent_client_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  billing_contact_name TEXT NOT NULL,
  billing_contact_email TEXT NOT NULL,
  billing_contact_alternate_name TEXT NOT NULL,
  billing_contact_alternate_email TEXT NOT NULL,
  billing_contact_phone_number TEXT NOT NULL,
  billing_contact_alternate_phone_number TEXT NOT NULL,
  billing_contact_street_address_1 TEXT NOT NULL,
  billing_contact_street_address_2 TEXT NOT NULL,
  billing_contact_city TEXT NOT NULL,
  billing_contact_state TEXT NOT NULL,
  billing_contact_zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO clients_workspace (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
SELECT
  id,
  COALESCE(workspace_id, organization_id),
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
FROM clients;

DROP TABLE clients;
ALTER TABLE clients_workspace RENAME TO clients;

CREATE TABLE projects_workspace (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  parent_project_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO projects_workspace (
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
  billing_rounding_increment,
  created_at,
  updated_at
)
SELECT
  id,
  COALESCE(workspace_id, organization_id),
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
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_workspace RENAME TO projects;

CREATE TABLE time_entries_workspace (
  entry_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_hours TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  invoice_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entry_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO time_entries_workspace (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
SELECT
  entry_id,
  COALESCE(workspace_id, organization_id),
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries;

DROP TABLE time_entries;
ALTER TABLE time_entries_workspace RENAME TO time_entries;

CREATE TABLE audit_logs_workspace (
  audit_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_user_name TEXT,
  action TEXT NOT NULL,
  change_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  record_label TEXT,
  record_url TEXT,
  previous_value_json TEXT,
  new_value_json TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO audit_logs_workspace (
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  previous_value_json,
  new_value_json,
  metadata_json,
  ip_address
)
SELECT
  audit_id,
  COALESCE(workspace_id, organization_id),
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  CASE
    WHEN record_type = 'organization' THEN 'workspace'
    WHEN record_type = 'organization_setting' THEN 'workspace_setting'
    ELSE record_type
  END,
  record_id,
  record_label,
  record_url,
  previous_value_json,
  new_value_json,
  metadata_json,
  ip_address
FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_workspace RENAME TO audit_logs;

CREATE TABLE api_keys_workspace (
  api_key_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

INSERT OR REPLACE INTO api_keys_workspace (
  api_key_id,
  workspace_id,
  created_by_user_id,
  name,
  key_hash,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
)
SELECT
  api_key_id,
  COALESCE(workspace_id, organization_id),
  created_by_user_id,
  name,
  key_hash,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
FROM api_keys;

DROP TABLE api_keys;
ALTER TABLE api_keys_workspace RENAME TO api_keys;

CREATE TABLE user_role_assignments_workspace (
  assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  client_id TEXT,
  project_id TEXT,
  permission_overrides_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id, role_id, scope_type, scope_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

INSERT OR REPLACE INTO user_role_assignments_workspace (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
SELECT
  assignment_id,
  COALESCE(workspace_id, organization_id),
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments;

DROP TABLE user_role_assignments;
ALTER TABLE user_role_assignments_workspace RENAME TO user_role_assignments;

CREATE TABLE active_timers_workspace (
  active_timer_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timer_slot TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  billable TEXT NOT NULL DEFAULT 'yes',
  accumulated_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  last_active_start_time TEXT,
  timer_status TEXT NOT NULL DEFAULT 'paused',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id, timer_slot),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR REPLACE INTO active_timers_workspace (
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
)
SELECT
  active_timer_id,
  organization_id,
  user_id,
  timer_slot,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
FROM active_timers;

DROP TABLE active_timers;
ALTER TABLE active_timers_workspace RENAME TO active_timers;

DROP TABLE IF EXISTS organization_modules;
DROP TABLE IF EXISTS organization_settings;
DROP TABLE IF EXISTS organizations;

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_active_workspace
ON sessions (active_workspace_id);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_status_updated
ON clients (workspace_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_parent
ON clients (workspace_id, parent_client_id, status, name);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_client_status_updated
ON projects (workspace_id, client_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_status_updated
ON projects (workspace_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_parent
ON projects (workspace_id, parent_project_id, status, name);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_client_parent
ON projects (workspace_id, client_id, parent_project_id, status, name);

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_project_end
ON time_entries (workspace_id, project_id, end_time);

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_user_end
ON time_entries (workspace_id, user_id, end_time);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created
ON audit_logs (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_actor
ON audit_logs (workspace_id, actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_record_type
ON audit_logs (workspace_id, record_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_change_type
ON audit_logs (workspace_id, change_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_record_id
ON audit_logs (workspace_id, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address
ON audit_logs (workspace_id, ip_address);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_status
ON api_keys (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_user
ON user_role_assignments (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_scope
ON user_role_assignments (workspace_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_workspace_modules_workspace_status
ON workspace_modules (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_workspace_modules_module
ON workspace_modules (module_id);

CREATE INDEX IF NOT EXISTS idx_active_timers_workspace_user
ON active_timers (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_active_timers_running
ON active_timers (workspace_id, user_id, timer_status);

PRAGMA foreign_keys = ON;
