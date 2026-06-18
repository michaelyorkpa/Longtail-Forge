INSERT OR IGNORE INTO note_links (
  note_link_id,
  workspace_id,
  note_id,
  module_id,
  target_type,
  target_id,
  link_role,
  scope_role,
  created_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
SELECT
  '063-task-link-' || notes.note_id,
  notes.workspace_id,
  notes.note_id,
  'tasks',
  'task',
  notes.task_id,
  'related',
  'related',
  notes.created_by_user_id,
  COALESCE(notes.created_at, datetime('now')),
  NULL,
  '{"source":"063_task_note_link_context"}'
FROM notes
WHERE notes.task_id IS NOT NULL
  AND TRIM(notes.task_id) != ''
  AND NOT EXISTS (
    SELECT 1
    FROM note_links
    WHERE note_links.workspace_id = notes.workspace_id
      AND note_links.note_id = notes.note_id
      AND note_links.module_id = 'tasks'
      AND note_links.target_type = 'task'
      AND note_links.target_id = notes.task_id
      AND note_links.removed_at IS NULL
  );

UPDATE notes
SET task_id = NULL
WHERE task_id IS NOT NULL
  AND TRIM(task_id) != '';
