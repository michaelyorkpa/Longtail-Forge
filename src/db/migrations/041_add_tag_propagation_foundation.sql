DROP INDEX IF EXISTS idx_tag_assignments_target;
DROP INDEX IF EXISTS idx_tag_assignments_tag_target;
DROP INDEX IF EXISTS idx_tag_assignments_unique_target_tag;

ALTER TABLE tag_assignments RENAME TO tag_assignments_previous;

CREATE TABLE tag_assignments (
  tag_assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_by_user_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'propagated', 'system')),
  source_assignment_id TEXT,
  source_target_type TEXT,
  source_target_id TEXT,
  propagation_rule_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

INSERT INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  created_by_user_id,
  source,
  source_assignment_id,
  source_target_type,
  source_target_id,
  propagation_rule_id,
  created_at
)
SELECT
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  created_by_user_id,
  CASE WHEN source IN ('manual', 'system') THEN source ELSE 'manual' END,
  NULL,
  NULL,
  NULL,
  NULL,
  created_at
FROM tag_assignments_previous;

DROP TABLE tag_assignments_previous;

CREATE INDEX IF NOT EXISTS idx_tag_assignments_target
ON tag_assignments (workspace_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag_target
ON tag_assignments (workspace_id, tag_id, target_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_assignments_unique_target_tag
ON tag_assignments (workspace_id, tag_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_propagation_source
ON tag_assignments (workspace_id, source_target_type, source_target_id, propagation_rule_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_source_assignment
ON tag_assignments (workspace_id, source_assignment_id);

CREATE TABLE IF NOT EXISTS tag_assignment_suppressions (
  tag_assignment_suppression_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_target_type TEXT NOT NULL,
  source_target_id TEXT NOT NULL,
  propagation_rule_id TEXT NOT NULL DEFAULT '',
  suppressed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
  FOREIGN KEY (suppressed_by_user_id) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_assignment_suppressions_unique
ON tag_assignment_suppressions (
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source_target_type,
  source_target_id,
  propagation_rule_id
);

CREATE INDEX IF NOT EXISTS idx_tag_assignment_suppressions_target
ON tag_assignment_suppressions (workspace_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignment_suppressions_source
ON tag_assignment_suppressions (workspace_id, source_target_type, source_target_id, propagation_rule_id);

CREATE INDEX IF NOT EXISTS idx_tag_assignment_suppressions_tag
ON tag_assignment_suppressions (workspace_id, tag_id);
