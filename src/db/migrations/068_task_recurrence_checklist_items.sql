CREATE TABLE task_recurrence_checklist_items (
  recurrence_checklist_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id)
);

CREATE INDEX idx_task_recurrence_checklist_items_template
ON task_recurrence_checklist_items (workspace_id, recurrence_template_id, deleted_at, sort_order);
