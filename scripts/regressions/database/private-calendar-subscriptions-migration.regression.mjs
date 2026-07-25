export const regressionMeta = Object.freeze({
  id: "database.private-calendar-subscriptions-migration",
  area: "database",
  tier: "focused",
  tags: ["calendar", "migration", "permissions", "security", "workspace-isolation"],
  description: "Proves legacy private calendar rows migrate with URL continuity only when still eligible, while invalid and disabled rows become revoked history under scoped workspace constraints.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import Database from "better-sqlite3";

const database = new Database(":memory:");
try {
  database.pragma("foreign_keys = ON");
  database.exec(`
CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, status TEXT NOT NULL, workspace_type TEXT NOT NULL);
CREATE TABLE users (
  user_id TEXT PRIMARY KEY, home_workspace_id TEXT NOT NULL, username TEXT NOT NULL,
  display_name TEXT NOT NULL, timezone TEXT NOT NULL, user_status TEXT NOT NULL, protected_user TEXT NOT NULL
);
CREATE TABLE user_workspaces (
  user_workspace_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE workspace_modules (workspace_id TEXT NOT NULL, module_id TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE user_role_assignments (
  assignment_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
  role_id TEXT NOT NULL, scope_type TEXT NOT NULL, permission_overrides_json TEXT
);
CREATE TABLE role_permissions (role_id TEXT NOT NULL, permission_id TEXT NOT NULL);
CREATE TABLE clients (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE projects (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL, client_id TEXT, name TEXT NOT NULL, status TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE private_feed_tokens (
  private_feed_token_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL, token_selector TEXT NOT NULL, token_hash TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, rotated_at TEXT, disabled_at TEXT,
  updated_at TEXT NOT NULL, UNIQUE (workspace_id, user_id, provider_id),
  UNIQUE (provider_id, token_selector)
);

INSERT INTO workspaces VALUES ('workspace-a', 'Active', 'business');
INSERT INTO workspaces VALUES ('workspace-b', 'Active', 'business');
INSERT INTO users VALUES ('eligible-user', 'workspace-a', 'eligible@example.test', 'Eligible', 'America/New_York', 'active', 'yes');
INSERT INTO users VALUES ('orphan-user', 'workspace-a', 'orphan@example.test', 'Orphan', 'America/New_York', 'active', 'no');
INSERT INTO users VALUES ('disabled-user', 'workspace-a', 'disabled@example.test', 'Disabled', 'America/New_York', 'active', 'yes');
INSERT INTO user_workspaces VALUES ('membership-eligible', 'eligible-user', 'workspace-a', 'active');
INSERT INTO user_workspaces VALUES ('membership-orphan', 'orphan-user', 'workspace-a', 'inactive');
INSERT INTO user_workspaces VALUES ('membership-disabled', 'disabled-user', 'workspace-a', 'active');
INSERT INTO workspace_modules VALUES ('workspace-a', 'tasks', 'enabled');
INSERT INTO workspace_modules VALUES ('workspace-b', 'tasks', 'enabled');
INSERT INTO clients VALUES ('workspace-a', 'client-a', 'Client A', 'Active');
INSERT INTO clients VALUES ('workspace-b', 'client-b', 'Client B', 'Active');
INSERT INTO projects VALUES ('workspace-a', 'project-a', 'client-a', 'Project A', 'Active');

INSERT INTO private_feed_tokens VALUES (
  'eligible-token', 'workspace-a', 'eligible-user', 'tasks.calendar', 'eligible-selector',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'active',
  '2026-01-01T00:00:00.000Z', NULL, NULL, '2026-01-01T00:00:00.000Z'
);
INSERT INTO private_feed_tokens VALUES (
  'orphan-token', 'workspace-a', 'orphan-user', 'tasks.calendar', 'orphan-selector',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'active',
  '2026-01-02T00:00:00.000Z', NULL, NULL, '2026-01-02T00:00:00.000Z'
);
INSERT INTO private_feed_tokens VALUES (
  'disabled-token', 'workspace-a', 'disabled-user', 'tasks.calendar', 'disabled-selector',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'disabled',
  '2026-01-03T00:00:00.000Z', NULL, '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
);
`);

  const migration = await fs.readFile("src/db/migrations/085_named_calendar_subscriptions.sql", "utf8");
  database.exec(migration);

  const rows = database.prepare(`
SELECT private_feed_token_id, name, scope_type, token_selector, token_hash, status,
       revocation_reason, revoked_at
FROM private_feed_tokens
ORDER BY private_feed_token_id;
`).all();
  assert.deepEqual(rows, [
    {
      name: "Calendar subscription",
      private_feed_token_id: "disabled-token",
      revocation_reason: "legacy_disabled",
      revoked_at: "2026-01-04T00:00:00.000Z",
      scope_type: "workspace",
      status: "revoked",
      token_hash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      token_selector: "disabled-selector",
    },
    {
      name: "Calendar subscription",
      private_feed_token_id: "eligible-token",
      revocation_reason: null,
      revoked_at: null,
      scope_type: "workspace",
      status: "active",
      token_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      token_selector: "eligible-selector",
    },
    {
      name: "Calendar subscription",
      private_feed_token_id: "orphan-token",
      revocation_reason: "membership_inactive",
      revoked_at: "2026-01-02T00:00:00.000Z",
      scope_type: "workspace",
      status: "revoked",
      token_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      token_selector: "orphan-selector",
    },
  ]);

  const insertCrossWorkspace = database.prepare(`
INSERT INTO private_feed_tokens (
  private_feed_token_id, workspace_id, user_id, provider_id, name, scope_type,
  scope_client_id, scope_project_id, token_selector, token_hash, status,
  created_at, updated_at
) VALUES (
  'cross-workspace', 'workspace-a', 'eligible-user', 'tasks.calendar', 'Cross workspace', 'client',
  'client-b', NULL, 'cross-selector',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'active',
  '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z'
);
`);
  assert.throws(() => insertCrossWorkspace.run(), /FOREIGN KEY constraint failed/);
  assert.equal(database.pragma("integrity_check", { simple: true }), "ok");

  console.log("Private calendar subscriptions migration regression passed.");
} finally {
  database.close();
}
