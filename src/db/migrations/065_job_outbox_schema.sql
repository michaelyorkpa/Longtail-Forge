CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  dedupe_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead')),
  priority INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  locked_at TEXT,
  locked_by TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  dead_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE INDEX idx_jobs_pending_available
ON jobs (status, available_at, priority DESC, created_at, job_id)
WHERE status IN ('pending', 'failed');

CREATE INDEX idx_jobs_running_locked
ON jobs (status, locked_at, job_id)
WHERE status = 'running';

CREATE INDEX idx_jobs_workspace_status_updated
ON jobs (workspace_id, status, updated_at DESC, job_id);

CREATE INDEX idx_jobs_type_status_available
ON jobs (job_type, status, available_at, priority DESC);

CREATE UNIQUE INDEX idx_jobs_active_dedupe
ON jobs (workspace_id, job_type, dedupe_key)
WHERE dedupe_key IS NOT NULL
  AND status IN ('pending', 'running', 'failed');
