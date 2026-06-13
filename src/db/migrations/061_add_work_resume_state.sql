CREATE TABLE IF NOT EXISTS work_resume_state (
  resume_state_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  source_url TEXT,
  title_snapshot TEXT NOT NULL DEFAULT '',
  context_label_snapshot TEXT NOT NULL DEFAULT '',
  last_action_type TEXT NOT NULL DEFAULT '',
  last_action_label TEXT NOT NULL DEFAULT '',
  last_worked_at TEXT,
  handoff_note TEXT,
  next_action TEXT,
  blocked_reason TEXT,
  status_snapshot TEXT,
  priority_snapshot TEXT,
  due_at_snapshot TEXT,
  resume_rank_hint INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  dismissed_at TEXT,
  dismissed_source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id),
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  UNIQUE (workspace_id, user_id, module_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_workspace_user_default
ON work_resume_state (workspace_id, user_id, dismissed_at, last_worked_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_record_cleanup
ON work_resume_state (workspace_id, module_id, record_type, record_id);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_workspace_module
ON work_resume_state (workspace_id, user_id, module_id, record_type);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_workspace_client
ON work_resume_state (workspace_id, user_id, client_id, dismissed_at, last_worked_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_workspace_project
ON work_resume_state (workspace_id, user_id, project_id, dismissed_at, last_worked_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_dismissed
ON work_resume_state (workspace_id, user_id, dismissed_at, dismissed_source_updated_at);

CREATE INDEX IF NOT EXISTS idx_work_resume_state_last_worked
ON work_resume_state (workspace_id, user_id, last_worked_at DESC, due_at_snapshot, priority_snapshot);
