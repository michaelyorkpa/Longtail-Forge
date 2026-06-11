CREATE TABLE IF NOT EXISTS list_item_catalog (
  catalog_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  list_type TEXT,
  client_id TEXT,
  project_id TEXT,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT,
  vendor_name TEXT,
  url TEXT,
  estimated_cost REAL CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  notes TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_list_item_catalog_workspace_name
ON list_item_catalog (workspace_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_list_item_catalog_workspace_type
ON list_item_catalog (workspace_id, list_type);

CREATE INDEX IF NOT EXISTS idx_list_item_catalog_workspace_context
ON list_item_catalog (workspace_id, client_id, project_id);

CREATE INDEX IF NOT EXISTS idx_list_item_catalog_workspace_usage
ON list_item_catalog (workspace_id, use_count, last_used_at);

CREATE INDEX IF NOT EXISTS idx_list_items_workspace_catalog
ON list_items (workspace_id, catalog_item_id);
