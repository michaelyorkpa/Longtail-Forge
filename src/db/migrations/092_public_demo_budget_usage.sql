CREATE TABLE public_demo_budget_usage (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used_units INTEGER NOT NULL DEFAULT 0 CHECK (used_units >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_public_demo_budget_usage_workspace
  ON public_demo_budget_usage(workspace_id, updated_at);