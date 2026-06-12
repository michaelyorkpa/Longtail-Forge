ALTER TABLE tasks ADD COLUMN next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN resume_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_resume_context
ON tasks (workspace_id, status, updated_at, next_action, blocked_reason, resume_note);
