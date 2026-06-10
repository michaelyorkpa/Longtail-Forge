CREATE TABLE IF NOT EXISTS file_reports (
  file_report_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_attachment_id TEXT,
  report_reason TEXT NOT NULL,
  report_notes TEXT,
  reported_by_user_id TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (file_id) REFERENCES files(file_id),
  FOREIGN KEY (file_attachment_id) REFERENCES file_attachments(file_attachment_id),
  FOREIGN KEY (reported_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_file_reports_workspace_file
ON file_reports (workspace_id, file_id, created_at);

CREATE INDEX IF NOT EXISTS idx_file_reports_workspace_attachment
ON file_reports (workspace_id, file_attachment_id, created_at);

DELETE FROM role_permissions
WHERE permission_id = 'files.upload'
  AND role_id IN ('client_user', 'project_user', 'client_external_user');
