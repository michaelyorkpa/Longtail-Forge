CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
