CREATE INDEX IF NOT EXISTS idx_tasks_workspace_due_updated
ON tasks (workspace_id, due_date, due_time, updated_at);

CREATE INDEX IF NOT EXISTS idx_task_assignees_workspace_active_user
ON task_assignees (workspace_id, removed_at, user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_end
ON time_entries (workspace_id, end_time);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_name
ON clients (workspace_id, name);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_name
ON projects (workspace_id, name);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_workspace_user_updated
ON user_role_assignments (workspace_id, user_id, updated_at, assignment_id);
