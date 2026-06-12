ALTER TABLE files ADD COLUMN storage_kind TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE files ADD COLUMN external_source_provider TEXT;
ALTER TABLE files ADD COLUMN external_source_id TEXT;
ALTER TABLE files ADD COLUMN external_availability_status TEXT NOT NULL DEFAULT 'not_external';
ALTER TABLE files ADD COLUMN external_reported_bytes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS file_storage_accounting (
  storage_accounting_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('internal', 'external')),
  storage_provider TEXT NOT NULL DEFAULT '',
  external_source_provider TEXT NOT NULL DEFAULT '',
  availability_status TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  internal_bytes INTEGER NOT NULL DEFAULT 0,
  external_reported_bytes INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_storage_accounting_unique_scope
ON file_storage_accounting (
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status
);

CREATE INDEX IF NOT EXISTS idx_file_storage_accounting_workspace_kind
ON file_storage_accounting (workspace_id, storage_kind);

INSERT OR REPLACE INTO file_storage_accounting (
  storage_accounting_id,
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status,
  file_count,
  internal_bytes,
  external_reported_bytes,
  calculated_at,
  metadata_json
)
SELECT
  workspace_id || ':internal:' || COALESCE(uploaded_by_user_id, '') || ':' || COALESCE(storage_provider, 'local') || ':' || COALESCE(status, ''),
  workspace_id,
  COALESCE(uploaded_by_user_id, ''),
  'internal',
  COALESCE(storage_provider, 'local'),
  '',
  COALESCE(status, ''),
  COUNT(*),
  COALESCE(SUM(file_size_bytes), 0),
  0,
  STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'),
  '{}'
FROM files
WHERE COALESCE(storage_kind, 'internal') = 'internal'
  AND status IN ('pending', 'available', 'quarantined', 'deleted')
GROUP BY workspace_id, COALESCE(uploaded_by_user_id, ''), COALESCE(storage_provider, 'local'), COALESCE(status, '');
