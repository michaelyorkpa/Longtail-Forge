CREATE TABLE IF NOT EXISTS api_keys (
  api_key_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id, created_by_user_id) REFERENCES users(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_key_scopes (
  api_key_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (api_key_id, scope),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(api_key_id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_status
ON api_keys (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
ON api_keys (key_hash);
