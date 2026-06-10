CREATE TABLE IF NOT EXISTS notes (
  note_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  body_plaintext_index TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  library_bucket_source TEXT NOT NULL DEFAULT 'derived' CHECK (library_bucket_source IN ('derived', 'manual', 'imported')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  client_id TEXT,
  project_id TEXT,
  task_id TEXT,
  ticket_id TEXT,
  linked_user_id TEXT,
  owner_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (linked_user_id) REFERENCES users(user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);

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

CREATE TABLE IF NOT EXISTS note_links (
  note_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  scope_role TEXT NOT NULL DEFAULT 'related' CHECK (scope_role IN ('primary', 'context', 'related')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_workspace_note
ON note_links (workspace_id, note_id);

CREATE INDEX IF NOT EXISTS idx_note_links_workspace_target
ON note_links (workspace_id, module_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_note_links_workspace_scope
ON note_links (workspace_id, note_id, scope_role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_links_unique_active_target
ON note_links (workspace_id, note_id, module_id, target_type, target_id, link_role)
WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS note_library_collections (
  note_library_collection_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  library_bucket TEXT CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  parent_collection_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (parent_collection_id) REFERENCES note_library_collections(note_library_collection_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_note_library_collections_workspace_slug
ON note_library_collections (workspace_id, slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_note_library_collections_workspace_bucket
ON note_library_collections (workspace_id, library_bucket);

CREATE INDEX IF NOT EXISTS idx_note_library_collections_workspace_status
ON note_library_collections (workspace_id, status);
