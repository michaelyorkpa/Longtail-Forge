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
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  client_id TEXT,
  project_id TEXT,
  permission_overrides_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id, role_id, scope_type, scope_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user
ON user_role_assignments (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_scope
ON user_role_assignments (organization_id, scope_type, scope_id);

INSERT OR IGNORE INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES
  ('super_admin', 'Super Admin', 'Controls all organizations and all app administration.', 'global', 10),
  ('organization_admin', 'Organization Administrator', 'Controls users, settings, clients, projects, time, reporting, and audit logs inside one organization.', 'organization', 20),
  ('client_admin', 'Client Administrator', 'Controls client details, projects, and users for one client.', 'client', 30),
  ('project_admin', 'Project Administrator', 'Controls projects and project assignments for one client.', 'client', 40),
  ('client_user', 'Client User', 'Can contribute time to projects within one client.', 'client', 50),
  ('project_user', 'Project User', 'Can contribute time to one project.', 'project', 60),
  ('client_external_user', 'Client User (External)', 'External collaborator who can contribute time for one client.', 'client', 70);

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('users.manage', 'Manage Users', 'Create, update, deactivate, and assign users.'),
  ('roles.assign', 'Assign Roles', 'Add and remove scoped role assignments.'),
  ('organization_settings.manage', 'Manage Organization Settings', 'View and change organization settings.'),
  ('clients.manage', 'Manage Clients', 'Create, update, archive, and view clients.'),
  ('projects.manage', 'Manage Projects', 'Create, update, archive, and view projects.'),
  ('billing.manage', 'Manage Billing Details', 'Change billable status, rates, billing periods, and rounding.'),
  ('time_entries.create', 'Create Time Entries', 'Create stopwatch and manual time entries.'),
  ('time_entries.edit_all', 'Edit All Time Entries', 'Edit or delete time entries in scope.'),
  ('time_entries.edit_own', 'Edit Own Time Entries', 'Edit or delete only the actor''s own time entries in scope.'),
  ('reporting.view', 'View Reporting', 'View reports in scope.'),
  ('audit_logs.view', 'View Audit Logs', 'View organization audit logs.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', permission_id FROM permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('organization_admin', 'users.manage'),
  ('organization_admin', 'roles.assign'),
  ('organization_admin', 'organization_settings.manage'),
  ('organization_admin', 'clients.manage'),
  ('organization_admin', 'projects.manage'),
  ('organization_admin', 'billing.manage'),
  ('organization_admin', 'time_entries.create'),
  ('organization_admin', 'time_entries.edit_all'),
  ('organization_admin', 'reporting.view'),
  ('organization_admin', 'audit_logs.view'),
  ('client_admin', 'users.manage'),
  ('client_admin', 'roles.assign'),
  ('client_admin', 'clients.manage'),
  ('client_admin', 'projects.manage'),
  ('client_admin', 'billing.manage'),
  ('client_admin', 'time_entries.create'),
  ('client_admin', 'time_entries.edit_all'),
  ('client_admin', 'reporting.view'),
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

INSERT OR IGNORE INTO user_role_assignments (
  assignment_id,
  organization_id,
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
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  organization_id,
  user_id,
  'super_admin',
  'all',
  'all',
  NULL,
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
FROM users
WHERE protected_user = 'yes';
