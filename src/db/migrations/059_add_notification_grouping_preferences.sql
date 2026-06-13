CREATE TABLE IF NOT EXISTS notification_user_display_preferences (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  grouping_mode TEXT NOT NULL DEFAULT 'client_project' CHECK (grouping_mode IN ('client_project', 'notification_type', 'record_type')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_user_display_preferences_user
ON notification_user_display_preferences (workspace_id, user_id);
