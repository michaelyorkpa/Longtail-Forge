ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address
  ON audit_logs (organization_id, ip_address);
