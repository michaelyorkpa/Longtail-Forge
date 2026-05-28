CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_user_name TEXT,
  action TEXT NOT NULL,
  change_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  record_label TEXT,
  record_url TEXT,
  previous_value_json TEXT,
  new_value_json TEXT,
  metadata_json TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_created
ON audit_logs (organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_actor
ON audit_logs (organization_id, actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_record_type
ON audit_logs (organization_id, record_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_change_type
ON audit_logs (organization_id, change_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_record_id
ON audit_logs (organization_id, record_id);
