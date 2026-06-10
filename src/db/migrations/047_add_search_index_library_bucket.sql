ALTER TABLE search_index
ADD COLUMN library_bucket TEXT;

CREATE INDEX IF NOT EXISTS idx_search_index_workspace_library_bucket
ON search_index (workspace_id, library_bucket);
