ALTER TABLE users ADD COLUMN active_workspace_id TEXT;

UPDATE users
SET active_workspace_id = organization_id
WHERE active_workspace_id IS NULL OR active_workspace_id = '';
