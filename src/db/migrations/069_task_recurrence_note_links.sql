CREATE TABLE task_recurrence_note_links (
  recurrence_note_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  scope_role TEXT NOT NULL DEFAULT 'related',
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id)
);

CREATE INDEX idx_task_recurrence_note_links_template
ON task_recurrence_note_links (workspace_id, recurrence_template_id, deleted_at, sort_order);

CREATE INDEX idx_task_recurrence_note_links_note
ON task_recurrence_note_links (workspace_id, note_id, deleted_at);
