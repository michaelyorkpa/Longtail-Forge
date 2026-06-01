ALTER TABLE sessions ADD COLUMN active_workspace_id TEXT;

UPDATE sessions
SET active_workspace_id = organization_id
WHERE active_workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_active_workspace
ON sessions (active_workspace_id);
