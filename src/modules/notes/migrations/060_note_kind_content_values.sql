PRAGMA foreign_keys = OFF;

CREATE TABLE notes_060_note_kind (
  note_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  body_plaintext_index TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'decision', 'procedure', 'reference', 'idea', 'log', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  library_bucket_source TEXT NOT NULL DEFAULT 'derived' CHECK (library_bucket_source IN ('derived', 'manual', 'imported')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  secure_payload TEXT,
  secure_payload_version TEXT,
  encrypted_data_key TEXT,
  encryption_key_version TEXT,
  encryption_algorithm TEXT,
  key_wrapping_algorithm TEXT,
  encryption_nonce TEXT,
  encryption_auth_tag TEXT,
  key_wrapping_nonce TEXT,
  key_wrapping_auth_tag TEXT,
  encrypted_at TEXT,
  client_id TEXT,
  project_id TEXT,
  task_id TEXT,
  ticket_id TEXT,
  linked_user_id TEXT,
  note_collection_id TEXT,
  owner_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  import_source TEXT,
  import_source_id TEXT,
  import_source_path TEXT,
  imported_at TEXT,
  import_batch_id TEXT,
  original_notebook TEXT,
  original_section_group TEXT,
  original_section TEXT,
  original_page_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (linked_user_id) REFERENCES users(user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);

INSERT INTO notes_060_note_kind (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  client_id,
  project_id,
  task_id,
  ticket_id,
  linked_user_id,
  note_collection_id,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
)
SELECT
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  client_id,
  project_id,
  task_id,
  ticket_id,
  linked_user_id,
  note_collection_id,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
FROM notes;

DROP TABLE notes;
ALTER TABLE notes_060_note_kind RENAME TO notes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_workspace_slug
ON notes (workspace_id, slug)
WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_workspace_note
ON notes (workspace_id, note_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_library
ON notes (workspace_id, library_bucket);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_library_status
ON notes (workspace_id, library_bucket, status);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_status
ON notes (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_visibility
ON notes (workspace_id, visibility);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_security_mode
ON notes (workspace_id, security_mode);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_owner
ON notes (workspace_id, owner_user_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_created_by
ON notes (workspace_id, created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_updated_at
ON notes (workspace_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_client
ON notes (workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_project
ON notes (workspace_id, project_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_task
ON notes (workspace_id, task_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_ticket
ON notes (workspace_id, ticket_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_linked_user
ON notes (workspace_id, linked_user_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_library_visibility
ON notes (workspace_id, library_bucket, visibility);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_library_security
ON notes (workspace_id, library_bucket, security_mode);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_slug_lookup
ON notes (workspace_id, slug);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_import_source
ON notes (workspace_id, import_source);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_import_batch
ON notes (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_collection
ON notes (workspace_id, note_collection_id);

CREATE INDEX IF NOT EXISTS idx_notes_secure_encryption_state
ON notes (workspace_id, security_mode, encrypted_at);

CREATE TABLE note_revisions_060_note_kind (
  note_revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'decision', 'procedure', 'reference', 'idea', 'log', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  secure_payload TEXT,
  secure_payload_version TEXT,
  encrypted_data_key TEXT,
  encryption_key_version TEXT,
  encryption_algorithm TEXT,
  key_wrapping_algorithm TEXT,
  encryption_nonce TEXT,
  encryption_auth_tag TEXT,
  key_wrapping_nonce TEXT,
  key_wrapping_auth_tag TEXT,
  encrypted_at TEXT,
  changed_by_user_id TEXT,
  change_summary TEXT,
  change_reason TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  import_source TEXT,
  import_source_id TEXT,
  import_source_path TEXT,
  imported_at TEXT,
  import_batch_id TEXT,
  original_notebook TEXT,
  original_section_group TEXT,
  original_section TEXT,
  original_page_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (changed_by_user_id) REFERENCES users(user_id)
);

INSERT INTO note_revisions_060_note_kind (
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  body_markdown,
  body_excerpt,
  note_type,
  library_bucket,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  changed_by_user_id,
  change_summary,
  change_reason,
  created_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
)
SELECT
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  body_markdown,
  body_excerpt,
  note_type,
  library_bucket,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  changed_by_user_id,
  change_summary,
  change_reason,
  created_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
FROM note_revisions;

DROP TABLE note_revisions;
ALTER TABLE note_revisions_060_note_kind RENAME TO note_revisions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_revisions_workspace_note_revision
ON note_revisions (workspace_id, note_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_note
ON note_revisions (workspace_id, note_id);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_note_library
ON note_revisions (workspace_id, note_id, library_bucket);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_changed_by
ON note_revisions (workspace_id, changed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_created_at
ON note_revisions (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_import_source
ON note_revisions (workspace_id, import_source);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_import_batch
ON note_revisions (workspace_id, import_batch_id);

CREATE INDEX IF NOT EXISTS idx_note_revisions_secure_encryption_state
ON note_revisions (workspace_id, note_id, security_mode, encrypted_at);

PRAGMA foreign_keys = ON;
