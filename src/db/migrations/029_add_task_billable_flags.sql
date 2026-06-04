ALTER TABLE tasks ADD COLUMN billable TEXT NOT NULL DEFAULT 'yes';

UPDATE tasks
SET billable = COALESCE((
  SELECT projects.billable
  FROM projects
  WHERE projects.workspace_id = tasks.workspace_id
    AND projects.id = tasks.project_id
), (
  SELECT clients.billable
  FROM clients
  WHERE clients.workspace_id = tasks.workspace_id
    AND clients.id = tasks.client_id
), 'yes');
