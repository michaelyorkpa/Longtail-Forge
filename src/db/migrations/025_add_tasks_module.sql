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

CREATE INDEX IF NOT EXISTS idx_task_assignees_task
ON task_assignees (workspace_id, task_id, removed_at);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user
ON task_assignees (workspace_id, user_id, removed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignees_active_user_unique
ON task_assignees (workspace_id, task_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';

INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES (
  'tasks',
  'Tasks',
  'Workspace, client, and project task tracking with scoped assignment and due-date foundations.',
  'core-workflow',
  'active',
  '0.31.0',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(module_id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  version = excluded.version,
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO workspace_modules (
  workspace_id,
  module_id,
  status,
  enabled_at,
  disabled_at,
  updated_at
)
SELECT
  workspace_id,
  'tasks',
  'enabled',
  datetime('now'),
  NULL,
  datetime('now')
FROM workspaces;

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('tasks.create', 'Create Tasks', 'Create tasks in an authorized workspace, client, or project scope.'),
  ('tasks.view', 'View Tasks', 'View tasks in an authorized workspace, client, or project scope.'),
  ('tasks.edit_own', 'Edit Own Tasks', 'Edit tasks created by or assigned to the actor in scope.'),
  ('tasks.edit_all', 'Edit All Tasks', 'Edit all tasks in an authorized workspace, client, or project scope.'),
  ('tasks.assign', 'Assign Tasks', 'Assign tasks to eligible workspace users.'),
  ('tasks.complete', 'Complete Tasks', 'Complete and reopen authorized tasks.'),
  ('tasks.archive', 'Archive Tasks', 'Archive authorized tasks.'),
  ('tasks.restore', 'Restore Tasks', 'Restore archived tasks.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', permission_id
FROM permissions
WHERE permission_id LIKE 'tasks.%';

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('workspace_admin', 'tasks.create'),
  ('workspace_admin', 'tasks.view'),
  ('workspace_admin', 'tasks.edit_all'),
  ('workspace_admin', 'tasks.assign'),
  ('workspace_admin', 'tasks.complete'),
  ('workspace_admin', 'tasks.archive'),
  ('workspace_admin', 'tasks.restore'),
  ('client_admin', 'tasks.create'),
  ('client_admin', 'tasks.view'),
  ('client_admin', 'tasks.edit_all'),
  ('client_admin', 'tasks.assign'),
  ('client_admin', 'tasks.complete'),
  ('client_admin', 'tasks.archive'),
  ('client_admin', 'tasks.restore'),
  ('project_admin', 'tasks.create'),
  ('project_admin', 'tasks.view'),
  ('project_admin', 'tasks.edit_all'),
  ('project_admin', 'tasks.assign'),
  ('project_admin', 'tasks.complete'),
  ('project_admin', 'tasks.archive'),
  ('project_admin', 'tasks.restore'),
  ('client_user', 'tasks.create'),
  ('client_user', 'tasks.view'),
  ('client_user', 'tasks.edit_own'),
  ('client_user', 'tasks.complete'),
  ('project_user', 'tasks.create'),
  ('project_user', 'tasks.view'),
  ('project_user', 'tasks.edit_own'),
  ('project_user', 'tasks.complete'),
  ('client_external_user', 'tasks.create'),
  ('client_external_user', 'tasks.view'),
  ('client_external_user', 'tasks.edit_own'),
  ('client_external_user', 'tasks.complete');
