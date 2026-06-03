ALTER TABLE tasks ADD COLUMN reminder_override_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS task_reminder_offsets (
  reminder_offset_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'client', 'project', 'task')),
  target_id TEXT NOT NULL,
  due_kind TEXT NOT NULL CHECK (due_kind IN ('date_only', 'date_time')),
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_reminder_offsets_target
ON task_reminder_offsets (workspace_id, target_type, target_id, due_kind, sort_order);

CREATE INDEX IF NOT EXISTS idx_task_reminder_offsets_workspace
ON task_reminder_offsets (workspace_id, due_kind);
