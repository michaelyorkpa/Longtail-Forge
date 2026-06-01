PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS projects_new (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billable TEXT NOT NULL,
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

INSERT INTO projects_new (
  id,
  organization_id,
  client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE TABLE IF NOT EXISTS time_entries_new (
  entry_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_hours TEXT NOT NULL,
  billable TEXT NOT NULL,
  invoice_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, entry_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

INSERT INTO time_entries_new (
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
SELECT
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries;

DROP TABLE time_entries;
ALTER TABLE time_entries_new RENAME TO time_entries;

CREATE INDEX IF NOT EXISTS idx_projects_organization_client_status_updated
ON projects (organization_id, client_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_organization_status_updated
ON projects (organization_id, status, updated_at);

PRAGMA foreign_keys = ON;
