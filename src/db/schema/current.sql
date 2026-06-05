CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  module_id TEXT NOT NULL DEFAULT 'core',
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  workspace_type TEXT NOT NULL DEFAULT 'business',
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
  task_timers_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS sessions (
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

CREATE TABLE IF NOT EXISTS user_workspaces (
  user_workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS user_workspace_creation_permissions (
  user_id TEXT PRIMARY KEY,
  can_create_workspaces INTEGER NOT NULL DEFAULT 1,
  allowed_workspace_types_json TEXT NOT NULL DEFAULT '["business","personal","family"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  role_id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  description TEXT NOT NULL,
  assignable_scope_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_id TEXT PRIMARY KEY,
  permission_name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
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

CREATE TABLE IF NOT EXISTS modules (
  module_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS clients (
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

CREATE TABLE IF NOT EXISTS projects (
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

CREATE TABLE IF NOT EXISTS time_entries (
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
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entry_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS active_work_timers (
  active_timer_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timer_slot TEXT NOT NULL,
  source_module_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
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
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS api_keys (
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

CREATE TABLE IF NOT EXISTS api_key_scopes (
  api_key_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (api_key_id, scope),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(api_key_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,
  due_time TEXT,
  due_timezone TEXT,
  due_at_utc TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  archived_at TEXT,
  completed_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  completed_by_user_id TEXT,
  archived_by_user_id TEXT,
  reminder_override_enabled INTEGER NOT NULL DEFAULT 0,
  recurrence_template_id TEXT,
  recurrence_instance_date TEXT,
  billable TEXT NOT NULL DEFAULT 'yes',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, task_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_assignee_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  user_id TEXT,
  role_id TEXT,
  assigned_by_user_id TEXT,
  assigned_at TEXT NOT NULL,
  removed_at TEXT,
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_reminder_offsets (
  reminder_offset_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'client', 'project', 'task')),
  target_id TEXT NOT NULL,
  due_kind TEXT NOT NULL CHECK (due_kind IN ('date_only', 'date_time')),
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS task_recurrence_templates (
  recurrence_template_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  recurrence_anchor_date TEXT NOT NULL,
  due_time TEXT,
  due_timezone TEXT,
  due_at_utc TEXT,
  rrule TEXT NOT NULL,
  recurrence_end_date TEXT,
  template_status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE TABLE IF NOT EXISTS task_recurrence_assignees (
  recurrence_assignee_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  user_id TEXT,
  role_id TEXT,
  assigned_by_user_id TEXT,
  assigned_at TEXT NOT NULL,
  removed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_type
ON workspaces (workspace_type);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
ON workspaces (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_active_workspace
ON sessions (active_workspace_id);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_status
ON user_workspaces (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_workspace_status
ON user_workspaces (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_workspace
ON user_workspaces (user_id, workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_user_id
ON users (user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_user
ON user_role_assignments (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_scope
ON user_role_assignments (workspace_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_workspace_modules_workspace_status
ON workspace_modules (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_workspace_modules_module
ON workspace_modules (module_id);

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

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_task
ON time_entries (workspace_id, task_id, end_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_work_timers_user_slot
ON active_work_timers (workspace_id, user_id, timer_slot);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_work_timers_user_source
ON active_work_timers (workspace_id, user_id, source_module_id, source_type, source_id)
WHERE source_id IS NOT NULL AND source_id != '';

CREATE INDEX IF NOT EXISTS idx_active_work_timers_running
ON active_work_timers (workspace_id, user_id, timer_status);

CREATE INDEX IF NOT EXISTS idx_active_work_timers_source
ON active_work_timers (workspace_id, source_module_id, source_type, source_id, timer_status);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_status
ON api_keys (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
ON api_keys (key_hash);

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

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_updated
ON tasks (workspace_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_client_status
ON tasks (workspace_id, client_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project_status
ON tasks (workspace_id, project_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_due_date
ON tasks (workspace_id, due_date, due_time);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_archived
ON tasks (workspace_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template
ON tasks (workspace_id, recurrence_template_id, recurrence_instance_date);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task
ON task_assignees (workspace_id, task_id, removed_at);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user
ON task_assignees (workspace_id, user_id, removed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignees_active_user_unique
ON task_assignees (workspace_id, task_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';

CREATE INDEX IF NOT EXISTS idx_task_reminder_offsets_target
ON task_reminder_offsets (workspace_id, target_type, target_id, due_kind, sort_order);

CREATE INDEX IF NOT EXISTS idx_task_reminder_offsets_workspace
ON task_reminder_offsets (workspace_id, due_kind);

CREATE INDEX IF NOT EXISTS idx_task_recurrence_templates_workspace
ON task_recurrence_templates (workspace_id, template_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_task_recurrence_assignees_template
ON task_recurrence_assignees (workspace_id, recurrence_template_id, removed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_recurrence_assignees_active_user_unique
ON task_recurrence_assignees (workspace_id, recurrence_template_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';

INSERT OR IGNORE INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES
  ('super_admin', 'Super Admin', 'Controls all workspaces and all app administration.', 'global', 10),
  ('workspace_admin', 'Workspace Administrator', 'Controls users, settings, clients, projects, time, reporting, and audit logs inside one workspace.', 'workspace', 20),
  ('client_admin', 'Client Administrator', 'Controls client details, projects, and users for one client.', 'client', 30),
  ('project_admin', 'Project Administrator', 'Controls projects and project assignments for one client.', 'client', 40),
  ('client_user', 'Client User', 'Can contribute time to projects within one client.', 'client', 50),
  ('project_user', 'Project User', 'Can contribute time to one project.', 'project', 60),
  ('client_external_user', 'Client User (External)', 'External collaborator who can contribute time for one client.', 'client', 70);

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('users.manage', 'Manage Users', 'Create, update, deactivate, and assign users.'),
  ('roles.assign', 'Assign Roles', 'Add and remove scoped role assignments.'),
  ('workspace_settings.manage', 'Manage Workspace Settings', 'View and change workspace settings.'),
  ('clients.manage', 'Manage Clients', 'Create, update, archive, and view clients.'),
  ('projects.manage', 'Manage Projects', 'Create, update, archive, and view projects.'),
  ('billing.manage', 'Manage Billing Details', 'Change billable status, rates, billing periods, and rounding.'),
  ('time_entries.create', 'Create Time Entries', 'Create stopwatch and manual time entries.'),
  ('time_entries.edit_all', 'Edit All Time Entries', 'Edit or delete time entries in scope.'),
  ('time_entries.edit_own', 'Edit Own Time Entries', 'Edit or delete only the actor''s own time entries in scope.'),
  ('reporting.view', 'View Reporting', 'View reports in scope.'),
  ('audit_logs.view', 'View Audit Logs', 'View workspace audit logs.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', permission_id FROM permissions;

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
  ('client_admin', 'roles.assign'),
  ('client_admin', 'clients.manage'),
  ('client_admin', 'projects.manage'),
  ('client_admin', 'billing.manage'),
  ('client_admin', 'time_entries.create'),
  ('client_admin', 'time_entries.edit_all'),
  ('client_admin', 'reporting.view'),
  ('project_admin', 'roles.assign'),
  ('project_admin', 'projects.manage'),
  ('project_admin', 'billing.manage'),
  ('project_admin', 'time_entries.create'),
  ('project_admin', 'time_entries.edit_all'),
  ('project_admin', 'reporting.view'),
  ('client_user', 'time_entries.create'),
  ('client_user', 'time_entries.edit_own'),
  ('client_user', 'reporting.view'),
  ('project_user', 'time_entries.create'),
  ('project_user', 'time_entries.edit_own'),
  ('project_user', 'reporting.view'),
  ('client_external_user', 'time_entries.create'),
  ('client_external_user', 'time_entries.edit_own');
