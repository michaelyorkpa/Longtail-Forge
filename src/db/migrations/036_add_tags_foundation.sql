CREATE TABLE IF NOT EXISTS tags (
  tag_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'disabled')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS tag_assignments (
  tag_assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_by_user_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_workspace_slug
ON tags (workspace_id, slug);

CREATE INDEX IF NOT EXISTS idx_tags_workspace_status
ON tags (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_target
ON tag_assignments (workspace_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag_target
ON tag_assignments (workspace_id, tag_id, target_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_assignments_unique_target_tag
ON tag_assignments (workspace_id, tag_id, target_type, target_id);

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('tags.manage', 'Manage Tags', 'Create, update, archive, disable, and restore workspace tag definitions.'),
  ('tags.view', 'View Tags', 'View workspace tag definitions and assigned tags.'),
  ('tags.assign', 'Assign Tags', 'Assign workspace tags to taggable records.'),
  ('tags.remove', 'Remove Tags', 'Remove tag assignments from taggable records.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', permission_id
FROM permissions
WHERE permission_id LIKE 'tags.%';

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('workspace_admin', 'tags.manage'),
  ('workspace_admin', 'tags.view'),
  ('workspace_admin', 'tags.assign'),
  ('workspace_admin', 'tags.remove'),
  ('client_admin', 'tags.view'),
  ('client_admin', 'tags.assign'),
  ('client_admin', 'tags.remove'),
  ('project_admin', 'tags.view'),
  ('project_admin', 'tags.assign'),
  ('project_admin', 'tags.remove'),
  ('client_user', 'tags.view'),
  ('client_user', 'tags.assign'),
  ('client_user', 'tags.remove'),
  ('project_user', 'tags.view'),
  ('project_user', 'tags.assign'),
  ('project_user', 'tags.remove'),
  ('client_external_user', 'tags.view');
