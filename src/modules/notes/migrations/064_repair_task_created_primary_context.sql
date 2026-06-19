WITH task_created_context AS (
  SELECT
    notes.workspace_id,
    notes.note_id,
    MAX(NULLIF(TRIM(tasks.client_id), '')) AS client_id,
    MAX(NULLIF(TRIM(tasks.project_id), '')) AS project_id,
    COUNT(*) AS task_link_count
  FROM notes
  JOIN note_links
    ON note_links.workspace_id = notes.workspace_id
   AND note_links.note_id = notes.note_id
   AND note_links.module_id = 'tasks'
   AND note_links.target_type = 'task'
   AND note_links.removed_at IS NULL
  JOIN tasks
    ON tasks.workspace_id = note_links.workspace_id
   AND tasks.task_id = note_links.target_id
  WHERE notes.note_type = 'log'
    AND notes.library_bucket = 'active_work'
    AND ABS(strftime('%s', note_links.created_at) - strftime('%s', notes.created_at)) <= 60
  GROUP BY notes.workspace_id, notes.note_id
  HAVING COUNT(*) = 1
)
UPDATE notes
SET
  client_id = COALESCE(
    NULLIF(TRIM(client_id), ''),
    (
      SELECT task_created_context.client_id
      FROM task_created_context
      WHERE task_created_context.workspace_id = notes.workspace_id
        AND task_created_context.note_id = notes.note_id
    ),
    client_id
  ),
  project_id = COALESCE(
    NULLIF(TRIM(project_id), ''),
    (
      SELECT task_created_context.project_id
      FROM task_created_context
      WHERE task_created_context.workspace_id = notes.workspace_id
        AND task_created_context.note_id = notes.note_id
    ),
    project_id
  )
WHERE EXISTS (
    SELECT 1
    FROM task_created_context
    WHERE task_created_context.workspace_id = notes.workspace_id
      AND task_created_context.note_id = notes.note_id
  )
  AND (
    (
      client_id IS NULL
      OR TRIM(client_id) = ''
    )
    AND EXISTS (
      SELECT 1
      FROM task_created_context
      WHERE task_created_context.workspace_id = notes.workspace_id
        AND task_created_context.note_id = notes.note_id
        AND task_created_context.client_id IS NOT NULL
    )
    OR (
      project_id IS NULL
      OR TRIM(project_id) = ''
    )
    AND EXISTS (
      SELECT 1
      FROM task_created_context
      WHERE task_created_context.workspace_id = notes.workspace_id
        AND task_created_context.note_id = notes.note_id
        AND task_created_context.project_id IS NOT NULL
    )
  );
