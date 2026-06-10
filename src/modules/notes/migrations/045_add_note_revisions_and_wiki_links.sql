CREATE TABLE IF NOT EXISTS note_revisions (
  note_revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  changed_by_user_id TEXT,
  change_summary TEXT,
  change_reason TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (changed_by_user_id) REFERENCES users(user_id)
);

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

CREATE TABLE IF NOT EXISTS note_wiki_links (
  note_wiki_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  source_revision_id TEXT,
  raw_target TEXT NOT NULL,
  target_slug TEXT,
  display_text TEXT,
  target_note_id TEXT,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('resolved', 'unresolved', 'broken')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (source_revision_id) REFERENCES note_revisions(note_revision_id),
  FOREIGN KEY (target_note_id) REFERENCES notes(note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_wiki_links_workspace_note
ON note_wiki_links (workspace_id, note_id);

CREATE INDEX IF NOT EXISTS idx_note_wiki_links_workspace_target_slug
ON note_wiki_links (workspace_id, target_slug);

CREATE INDEX IF NOT EXISTS idx_note_wiki_links_workspace_target_note
ON note_wiki_links (workspace_id, target_note_id);

CREATE INDEX IF NOT EXISTS idx_note_wiki_links_workspace_status
ON note_wiki_links (workspace_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_wiki_links_unique_active_target
ON note_wiki_links (workspace_id, note_id, raw_target, display_text)
WHERE removed_at IS NULL;
