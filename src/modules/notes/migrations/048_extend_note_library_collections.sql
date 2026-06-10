ALTER TABLE note_library_collections ADD COLUMN path_cache TEXT;
ALTER TABLE note_library_collections ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE note_library_collections ADD COLUMN collection_source TEXT NOT NULL DEFAULT 'manual' CHECK (collection_source IN ('manual', 'imported'));
ALTER TABLE note_library_collections ADD COLUMN updated_by_user_id TEXT;

ALTER TABLE notes ADD COLUMN note_collection_id TEXT;

ALTER TABLE search_index ADD COLUMN note_collection_id TEXT;
ALTER TABLE search_index ADD COLUMN collection_path TEXT;

UPDATE note_library_collections
SET path_cache = title
WHERE path_cache IS NULL OR path_cache = '';

DROP INDEX IF EXISTS idx_note_library_collections_workspace_slug;

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_library_collections_workspace_sibling_slug
ON note_library_collections (
  workspace_id,
  library_bucket,
  COALESCE(parent_collection_id, '__root__'),
  slug
)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_note_library_collections_workspace_parent
ON note_library_collections (workspace_id, parent_collection_id, status);

CREATE INDEX IF NOT EXISTS idx_note_library_collections_workspace_path
ON note_library_collections (workspace_id, library_bucket, path_cache);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_collection
ON notes (workspace_id, note_collection_id);

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_note_collection
ON search_index (workspace_id, note_collection_id);
