CREATE TABLE IF NOT EXISTS task_checklist_items (
  task_checklist_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_by_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task
ON task_checklist_items (workspace_id, task_id, deleted_at, sort_order);

CREATE INDEX IF NOT EXISTS idx_task_checklist_items_workspace_updated
ON task_checklist_items (workspace_id, updated_at);
