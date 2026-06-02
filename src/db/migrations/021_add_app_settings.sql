CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at)
VALUES
  ('workspace_install_mode', 'self_hosted', datetime('now'), datetime('now')),
  ('workspace_type_limit', '', datetime('now'), datetime('now')),
  ('workspace_creation_enabled', 'true', datetime('now'), datetime('now'))
ON CONFLICT(setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_workspace_creation_permissions (
  user_id TEXT PRIMARY KEY,
  can_create_workspaces INTEGER NOT NULL DEFAULT 1,
  allowed_workspace_types_json TEXT NOT NULL DEFAULT '["business","personal","family"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
