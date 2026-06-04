CREATE TABLE IF NOT EXISTS active_work_timers (
  active_timer_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timer_slot TEXT NOT NULL,
  source_module_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
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
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_work_timers_user_slot
ON active_work_timers (workspace_id, user_id, timer_slot);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_work_timers_user_source
ON active_work_timers (workspace_id, user_id, source_module_id, source_type, source_id)
WHERE source_id IS NOT NULL AND source_id != '';

CREATE INDEX IF NOT EXISTS idx_active_work_timers_running
ON active_work_timers (workspace_id, user_id, timer_status);

CREATE INDEX IF NOT EXISTS idx_active_work_timers_source
ON active_work_timers (workspace_id, source_module_id, source_type, source_id, timer_status);

INSERT OR IGNORE INTO active_work_timers (
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  source_module_id,
  source_type,
  source_id,
  source_label,
  source_url,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
)
SELECT
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  NULL,
  'manual',
  NULL,
  'Manual',
  '',
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
FROM active_timers;

INSERT OR IGNORE INTO active_work_timers (
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  source_module_id,
  source_type,
  source_id,
  source_label,
  source_url,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
)
SELECT
  active_task_timer_id,
  workspace_id,
  user_id,
  'task:' || task_id,
  'tasks',
  'task',
  task_id,
  description,
  'tasks.html?task=' || task_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
FROM active_task_timers;

WITH ranked_running AS (
  SELECT
    active_timer_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, user_id
      ORDER BY updated_at DESC, created_at DESC, active_timer_id
    ) AS running_rank
  FROM active_work_timers
  WHERE timer_status = 'running'
)
UPDATE active_work_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(last_active_start_time)) * 86400 AS INTEGER))
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE active_timer_id IN (
  SELECT active_timer_id
  FROM ranked_running
  WHERE running_rank > 1
);
