CREATE TABLE IF NOT EXISTS search_index (
  search_index_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags_text TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  project_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'normal',
  record_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT '',
  record_created_at TEXT,
  record_updated_at TEXT,
  indexed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id),
  UNIQUE (workspace_id, module_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_record_type
ON search_index (workspace_id, record_type);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_module
ON search_index (workspace_id, module_id);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_client
ON search_index (workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_project
ON search_index (workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_record_status
ON search_index (workspace_id, record_status);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_indexed_at
ON search_index (workspace_id, indexed_at);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_title
ON search_index (workspace_id, title);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_body
ON search_index (workspace_id, body);
