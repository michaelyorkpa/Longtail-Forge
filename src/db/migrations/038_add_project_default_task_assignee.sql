ALTER TABLE projects
ADD COLUMN task_default_assignee_mode TEXT NOT NULL DEFAULT 'creator';
