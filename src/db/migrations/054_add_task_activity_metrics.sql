ALTER TABLE tasks ADD COLUMN last_worked_at TEXT;

UPDATE tasks
SET last_worked_at = COALESCE(updated_at, completed_at, created_at)
WHERE last_worked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_last_worked_at
ON tasks (workspace_id, last_worked_at, status);
