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
FROM active_timers
WHERE NOT EXISTS (
  SELECT 1
  FROM active_work_timers
  WHERE active_work_timers.workspace_id = active_timers.workspace_id
    AND active_work_timers.user_id = active_timers.user_id
    AND active_work_timers.timer_slot = active_timers.timer_slot
);

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
  'source:tasks:task:' || task_id,
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
FROM active_task_timers
WHERE NOT EXISTS (
  SELECT 1
  FROM active_work_timers
  WHERE active_work_timers.workspace_id = active_task_timers.workspace_id
    AND active_work_timers.user_id = active_task_timers.user_id
    AND active_work_timers.source_module_id = 'tasks'
    AND active_work_timers.source_type = 'task'
    AND active_work_timers.source_id = active_task_timers.task_id
);

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

DROP TABLE IF EXISTS active_task_timers;
DROP TABLE IF EXISTS active_timers;
