ALTER TABLE clients ADD COLUMN workspace_id TEXT;

UPDATE clients
SET workspace_id = organization_id
WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_workspace_status_updated
ON clients (workspace_id, status, updated_at);
