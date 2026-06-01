ALTER TABLE organizations ADD COLUMN workspace_type TEXT NOT NULL DEFAULT 'business';

CREATE INDEX IF NOT EXISTS idx_organizations_workspace_type
ON organizations (workspace_type);
