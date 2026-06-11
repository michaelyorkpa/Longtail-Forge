CREATE TABLE IF NOT EXISTS list_links (
  list_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_list_links_workspace_list
ON list_links (workspace_id, list_id, removed_at);

CREATE INDEX IF NOT EXISTS idx_list_links_workspace_target
ON list_links (workspace_id, module_id, target_type, target_id, removed_at);

CREATE INDEX IF NOT EXISTS idx_list_links_workspace_created
ON list_links (workspace_id, created_at);
