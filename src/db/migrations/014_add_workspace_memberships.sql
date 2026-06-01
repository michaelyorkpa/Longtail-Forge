ALTER TABLE organizations ADD COLUMN owner_user_id TEXT;

CREATE TABLE IF NOT EXISTS user_workspaces (
  user_workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, workspace_id),
  FOREIGN KEY (workspace_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_status
ON user_workspaces (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_workspace_status
ON user_workspaces (workspace_id, status);

INSERT OR IGNORE INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  user_id,
  organization_id,
  CASE WHEN user_status = 'inactive' THEN 'inactive' ELSE 'active' END,
  datetime('now'),
  datetime('now')
FROM users;

UPDATE organizations
SET owner_user_id = (
  SELECT user_id
  FROM users
  WHERE users.organization_id = organizations.id
    AND users.protected_user = 'yes'
  ORDER BY username
  LIMIT 1
)
WHERE owner_user_id IS NULL;

UPDATE organizations
SET owner_user_id = (
  SELECT user_id
  FROM users
  WHERE users.organization_id = organizations.id
  ORDER BY username
  LIMIT 1
)
WHERE owner_user_id IS NULL;
