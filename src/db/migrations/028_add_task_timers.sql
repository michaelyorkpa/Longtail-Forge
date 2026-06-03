ALTER TABLE workspace_settings ADD COLUMN task_timers_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE time_entries ADD COLUMN task_id TEXT;

CREATE TABLE IF NOT EXISTS active_task_timers (
  active_task_timer_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  billable TEXT NOT NULL DEFAULT 'yes',
  accumulated_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  last_active_start_time TEXT,
  timer_status TEXT NOT NULL DEFAULT 'paused',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_task_timers_user_task
ON active_task_timers (workspace_id, user_id, task_id);

CREATE INDEX IF NOT EXISTS idx_active_task_timers_running
ON active_task_timers (workspace_id, user_id, timer_status);

CREATE INDEX IF NOT EXISTS idx_active_task_timers_task
ON active_task_timers (workspace_id, task_id, timer_status);

CREATE INDEX IF NOT EXISTS idx_time_entries_workspace_task
ON time_entries (workspace_id, task_id, end_time);
