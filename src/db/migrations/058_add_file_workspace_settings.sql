CREATE TABLE IF NOT EXISTS file_workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  file_type_policy_mode TEXT NOT NULL DEFAULT 'safe_default' CHECK (file_type_policy_mode IN ('safe_default', 'allowlist', 'blocklist')),
  allowed_extensions_json TEXT NOT NULL DEFAULT '[]',
  blocked_extensions_json TEXT NOT NULL DEFAULT '[]',
  internal_storage_limit_bytes INTEGER,
  per_user_storage_limit_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

INSERT OR IGNORE INTO file_workspace_settings (
  workspace_id,
  file_type_policy_mode,
  allowed_extensions_json,
  blocked_extensions_json,
  internal_storage_limit_bytes,
  per_user_storage_limit_bytes,
  created_at,
  updated_at,
  metadata_json
)
SELECT
  workspace_id,
  'safe_default',
  '[".csv",".doc",".docx",".gif",".jpg",".jpeg",".md",".pdf",".png",".ppt",".pptx",".txt",".xls",".xlsx"]',
  '[".exe",".bat",".cmd",".com",".msi",".ps1",".sh",".js",".vbs",".jar",".dll",".zip",".rar",".7z",".tar",".gz"]',
  NULL,
  NULL,
  STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
  STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
  '{}'
FROM workspaces;
