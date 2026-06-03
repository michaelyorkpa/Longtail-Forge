ALTER TABLE tasks ADD COLUMN recurrence_template_id TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_instance_date TEXT;

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
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template
ON tasks (workspace_id, recurrence_template_id, recurrence_instance_date);

CREATE INDEX IF NOT EXISTS idx_task_recurrence_templates_workspace
ON task_recurrence_templates (workspace_id, template_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_task_recurrence_assignees_template
ON task_recurrence_assignees (workspace_id, recurrence_template_id, removed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_recurrence_assignees_active_user_unique
ON task_recurrence_assignees (workspace_id, recurrence_template_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';
