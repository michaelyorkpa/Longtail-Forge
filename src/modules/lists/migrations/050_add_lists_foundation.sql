CREATE TABLE IF NOT EXISTS lists (
  list_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  list_type TEXT NOT NULL DEFAULT 'procurement' CHECK (list_type IN ('shopping', 'procurement', 'packing', 'supplies', 'parts', 'checklist', 'bill_of_materials')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'finalized', 'archived', 'deleted')),
  is_reusable INTEGER NOT NULL DEFAULT 0 CHECK (is_reusable IN (0, 1)),
  source_list_id TEXT,
  duplicated_from_list_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  finalized_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  finalized_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (source_list_id) REFERENCES lists(list_id),
  FOREIGN KEY (duplicated_from_list_id) REFERENCES lists(list_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_list
ON lists (workspace_id, list_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_status
ON lists (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_type
ON lists (workspace_id, list_type);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_reusable
ON lists (workspace_id, is_reusable);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_source
ON lists (workspace_id, source_list_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_duplicated_from
ON lists (workspace_id, duplicated_from_list_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_client
ON lists (workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_project
ON lists (workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_created_by
ON lists (workspace_id, created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_updated_at
ON lists (workspace_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_lists_workspace_finalized_at
ON lists (workspace_id, finalized_at);

CREATE TABLE IF NOT EXISTS list_items (
  list_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  catalog_item_id TEXT,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT,
  needed_by_date TEXT,
  vendor_name TEXT,
  url TEXT,
  estimated_cost REAL CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost REAL CHECK (actual_cost IS NULL OR actual_cost >= 0),
  purchase_status TEXT NOT NULL DEFAULT 'needed' CHECK (purchase_status IN ('needed', 'planned', 'ordered', 'received', 'cancelled', 'not_needed')),
  tracking_id TEXT,
  notes TEXT,
  assigned_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  checked_at TEXT,
  checked_by_user_id TEXT,
  completed_at TEXT,
  completed_by_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (checked_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (completed_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_list_items_workspace_list_sort
ON list_items (workspace_id, list_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_list_items_workspace_list_status
ON list_items (workspace_id, list_id, purchase_status);

CREATE INDEX IF NOT EXISTS idx_list_items_workspace_assigned_user
ON list_items (workspace_id, assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_list_items_workspace_needed_by
ON list_items (workspace_id, needed_by_date);
