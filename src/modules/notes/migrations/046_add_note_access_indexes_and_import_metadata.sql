ALTER TABLE notes ADD COLUMN import_source TEXT;
ALTER TABLE notes ADD COLUMN import_source_id TEXT;
ALTER TABLE notes ADD COLUMN import_source_path TEXT;
ALTER TABLE notes ADD COLUMN imported_at TEXT;
ALTER TABLE notes ADD COLUMN import_batch_id TEXT;
ALTER TABLE notes ADD COLUMN original_notebook TEXT;
ALTER TABLE notes ADD COLUMN original_section_group TEXT;
ALTER TABLE notes ADD COLUMN original_section TEXT;
ALTER TABLE notes ADD COLUMN original_page_id TEXT;

ALTER TABLE note_revisions ADD COLUMN import_source TEXT;
ALTER TABLE note_revisions ADD COLUMN import_source_id TEXT;
ALTER TABLE note_revisions ADD COLUMN import_source_path TEXT;
ALTER TABLE note_revisions ADD COLUMN imported_at TEXT;
ALTER TABLE note_revisions ADD COLUMN import_batch_id TEXT;
ALTER TABLE note_revisions ADD COLUMN original_notebook TEXT;
ALTER TABLE note_revisions ADD COLUMN original_section_group TEXT;
ALTER TABLE note_revisions ADD COLUMN original_section TEXT;
ALTER TABLE note_revisions ADD COLUMN original_page_id TEXT;

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

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_import_source
ON note_revisions (workspace_id, import_source);

CREATE INDEX IF NOT EXISTS idx_note_revisions_workspace_import_batch
ON note_revisions (workspace_id, import_batch_id);
