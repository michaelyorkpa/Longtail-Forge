UPDATE task_recurrence_templates
SET status = 'open',
    updated_at = datetime('now')
WHERE status != 'open';
