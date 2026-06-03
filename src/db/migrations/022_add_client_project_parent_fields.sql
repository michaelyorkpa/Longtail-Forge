ALTER TABLE clients ADD COLUMN parent_client_id TEXT;
ALTER TABLE projects ADD COLUMN parent_project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_workspace_parent
ON clients (workspace_id, parent_client_id, status, name);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_parent
ON projects (workspace_id, parent_project_id, status, name);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_client_parent
ON projects (workspace_id, client_id, parent_project_id, status, name);
