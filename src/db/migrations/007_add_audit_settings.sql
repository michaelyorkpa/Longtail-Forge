ALTER TABLE organization_settings ADD COLUMN audit_logging_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organization_settings ADD COLUMN audit_retention_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE organization_settings ADD COLUMN audit_settings_updated_at TEXT;
