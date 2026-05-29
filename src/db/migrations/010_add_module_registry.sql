CREATE TABLE IF NOT EXISTS modules (
  module_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_modules (
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled',
  enabled_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, module_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_modules_org_status
  ON organization_modules (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_organization_modules_module
  ON organization_modules (module_id);
