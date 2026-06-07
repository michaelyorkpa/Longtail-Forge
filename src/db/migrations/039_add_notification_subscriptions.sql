CREATE TABLE IF NOT EXISTS notification_subscriptions (
  notification_subscription_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_subscriptions_unique_active
ON notification_subscriptions (
  workspace_id,
  user_id,
  module_id,
  target_type,
  target_id,
  COALESCE(event_type, '')
);

CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user
ON notification_subscriptions (workspace_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_target
ON notification_subscriptions (workspace_id, module_id, target_type, target_id, status);
