CREATE TABLE IF NOT EXISTS files (
  file_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  extension TEXT,
  mime_type_claimed TEXT,
  mime_type_detected TEXT,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'quarantined', 'deleted')),
  scan_status TEXT NOT NULL DEFAULT 'not_required' CHECK (scan_status IN ('not_required', 'pending', 'passed', 'failed', 'error')),
  quarantine_reason TEXT,
  uploaded_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS file_attachments (
  file_attachment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  attachment_role TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  attached_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (file_id) REFERENCES files(file_id),
  FOREIGN KEY (attached_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_files_workspace_file
ON files (workspace_id, file_id);

CREATE INDEX IF NOT EXISTS idx_files_workspace_status
ON files (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_files_workspace_hash
ON files (workspace_id, sha256_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_storage_provider_key
ON files (storage_provider, storage_key);

CREATE INDEX IF NOT EXISTS idx_file_attachments_workspace_file
ON file_attachments (workspace_id, file_id);

CREATE INDEX IF NOT EXISTS idx_file_attachments_workspace_module
ON file_attachments (workspace_id, module_id);

CREATE INDEX IF NOT EXISTS idx_file_attachments_workspace_target
ON file_attachments (workspace_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_file_attachments_workspace_client
ON file_attachments (workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_file_attachments_workspace_project
ON file_attachments (workspace_id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_attachments_unique_active_target
ON file_attachments (workspace_id, file_id, module_id, target_type, target_id)
WHERE removed_at IS NULL;

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('files.view', 'View Files', 'View file metadata and attachments in authorized record context.'),
  ('files.upload', 'Upload Files', 'Upload and attach files through framework file services.'),
  ('files.download', 'Download Files', 'Download available files through framework file services.'),
  ('files.delete', 'Delete Files', 'Remove attachments and delete files through framework file services.'),
  ('files.manage_quarantine', 'Manage File Quarantine', 'Review and manage quarantined files.'),
  ('files.manage_workspace_settings', 'Manage File Workspace Settings', 'Manage workspace-level file settings.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('super_admin', 'files.view'),
  ('super_admin', 'files.upload'),
  ('super_admin', 'files.download'),
  ('super_admin', 'files.delete'),
  ('super_admin', 'files.manage_quarantine'),
  ('super_admin', 'files.manage_workspace_settings'),
  ('workspace_admin', 'files.view'),
  ('workspace_admin', 'files.upload'),
  ('workspace_admin', 'files.download'),
  ('workspace_admin', 'files.delete'),
  ('workspace_admin', 'files.manage_quarantine'),
  ('workspace_admin', 'files.manage_workspace_settings'),
  ('client_admin', 'files.view'),
  ('client_admin', 'files.upload'),
  ('client_admin', 'files.download'),
  ('client_admin', 'files.delete'),
  ('project_admin', 'files.view'),
  ('project_admin', 'files.upload'),
  ('project_admin', 'files.download'),
  ('project_admin', 'files.delete'),
  ('client_user', 'files.view'),
  ('client_user', 'files.upload'),
  ('client_user', 'files.download'),
  ('project_user', 'files.view'),
  ('project_user', 'files.upload'),
  ('project_user', 'files.download'),
  ('client_external_user', 'files.view'),
  ('client_external_user', 'files.download');
