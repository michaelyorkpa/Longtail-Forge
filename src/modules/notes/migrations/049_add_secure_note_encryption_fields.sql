ALTER TABLE notes ADD COLUMN secure_payload TEXT;
ALTER TABLE notes ADD COLUMN secure_payload_version TEXT;
ALTER TABLE notes ADD COLUMN encrypted_data_key TEXT;
ALTER TABLE notes ADD COLUMN encryption_key_version TEXT;
ALTER TABLE notes ADD COLUMN encryption_algorithm TEXT;
ALTER TABLE notes ADD COLUMN key_wrapping_algorithm TEXT;
ALTER TABLE notes ADD COLUMN encryption_nonce TEXT;
ALTER TABLE notes ADD COLUMN encryption_auth_tag TEXT;
ALTER TABLE notes ADD COLUMN key_wrapping_nonce TEXT;
ALTER TABLE notes ADD COLUMN key_wrapping_auth_tag TEXT;
ALTER TABLE notes ADD COLUMN encrypted_at TEXT;

ALTER TABLE note_revisions ADD COLUMN secure_payload TEXT;
ALTER TABLE note_revisions ADD COLUMN secure_payload_version TEXT;
ALTER TABLE note_revisions ADD COLUMN encrypted_data_key TEXT;
ALTER TABLE note_revisions ADD COLUMN encryption_key_version TEXT;
ALTER TABLE note_revisions ADD COLUMN encryption_algorithm TEXT;
ALTER TABLE note_revisions ADD COLUMN key_wrapping_algorithm TEXT;
ALTER TABLE note_revisions ADD COLUMN encryption_nonce TEXT;
ALTER TABLE note_revisions ADD COLUMN encryption_auth_tag TEXT;
ALTER TABLE note_revisions ADD COLUMN key_wrapping_nonce TEXT;
ALTER TABLE note_revisions ADD COLUMN key_wrapping_auth_tag TEXT;
ALTER TABLE note_revisions ADD COLUMN encrypted_at TEXT;

CREATE TABLE IF NOT EXISTS secure_note_placeholder_warnings (
  warning_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  body_markdown_present INTEGER NOT NULL DEFAULT 0,
  body_excerpt_present INTEGER NOT NULL DEFAULT 0,
  body_plaintext_index_present INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO secure_note_placeholder_warnings (
  warning_id,
  workspace_id,
  note_id,
  detected_at,
  reason,
  body_markdown_present,
  body_excerpt_present,
  body_plaintext_index_present
)
SELECT
  note_id || ':secure-placeholder',
  workspace_id,
  note_id,
  datetime('now'),
  'secure_note_plaintext_placeholder',
  CASE WHEN COALESCE(body_markdown, '') != '' THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(body_excerpt, '') != '' THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(body_plaintext_index, '') != '' THEN 1 ELSE 0 END
FROM notes
WHERE security_mode = 'secure'
  AND secure_payload IS NULL
  AND (
    COALESCE(body_markdown, '') != ''
    OR COALESCE(body_excerpt, '') != ''
    OR COALESCE(body_plaintext_index, '') != ''
  );

CREATE INDEX IF NOT EXISTS idx_notes_secure_encryption_state
ON notes (workspace_id, security_mode, encrypted_at);

CREATE INDEX IF NOT EXISTS idx_note_revisions_secure_encryption_state
ON note_revisions (workspace_id, note_id, security_mode, encrypted_at);

CREATE INDEX IF NOT EXISTS idx_secure_note_placeholder_warnings_workspace
ON secure_note_placeholder_warnings (workspace_id, note_id);
