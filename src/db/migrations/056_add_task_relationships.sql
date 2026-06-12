CREATE TABLE IF NOT EXISTS task_relationships (
  task_relationship_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  parent_task_id TEXT NOT NULL,
  child_task_id TEXT NOT NULL,
  is_blocking INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  removed_at TEXT,
  removed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (parent_task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (child_task_id) REFERENCES tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_relationships_parent
ON task_relationships (workspace_id, parent_task_id, removed_at, is_blocking);

CREATE INDEX IF NOT EXISTS idx_task_relationships_child
ON task_relationships (workspace_id, child_task_id, removed_at, is_blocking);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_relationships_active_pair
ON task_relationships (workspace_id, parent_task_id, child_task_id)
WHERE removed_at IS NULL;
