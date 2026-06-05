CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT,
  event_type TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  record_type TEXT,
  record_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recipient_user_id) REFERENCES users(user_id),
  FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status_created
ON notifications (workspace_id, recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_module
ON notifications (workspace_id, module_id);

CREATE INDEX IF NOT EXISTS idx_notifications_record
ON notifications (workspace_id, record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_notifications_event_type
ON notifications (workspace_id, event_type);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
ON notifications (created_at);

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('notifications.view_own', 'View Own Notifications', 'View notification records addressed to the current user.'),
  ('notifications.manage_preferences', 'Manage Notification Preferences', 'Manage personal notification preferences.'),
  ('notifications.manage_workspace_defaults', 'Manage Workspace Notification Defaults', 'Manage workspace-level notification defaults.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', permission_id
FROM permissions
WHERE permission_id LIKE 'notifications.%';

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('workspace_admin', 'notifications.view_own'),
  ('workspace_admin', 'notifications.manage_preferences'),
  ('workspace_admin', 'notifications.manage_workspace_defaults'),
  ('client_admin', 'notifications.view_own'),
  ('client_admin', 'notifications.manage_preferences'),
  ('project_admin', 'notifications.view_own'),
  ('project_admin', 'notifications.manage_preferences'),
  ('client_user', 'notifications.view_own'),
  ('client_user', 'notifications.manage_preferences'),
  ('project_user', 'notifications.view_own'),
  ('project_user', 'notifications.manage_preferences'),
  ('client_external_user', 'notifications.view_own'),
  ('client_external_user', 'notifications.manage_preferences');
