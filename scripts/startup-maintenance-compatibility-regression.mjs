import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12j";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-startup-maintenance-compatibility-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-startup-maintenance-compatibility.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Startup-Maintenance-Compatibility-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const dbIndexSource = readText("src/db/index.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertFreshStartupMaintenance();
  await assertRedactedSeedRepairRerun();
  await assertIntegrity();

  console.log("Startup maintenance compatibility regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the startup maintenance compatibility version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the startup maintenance compatibility version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the startup maintenance compatibility version");

  assertNoLiteralHelperCalls("db/index startup maintenance", dbIndexSource);
  assert.doesNotMatch(dbIndexSource, /\bINSERT OR IGNORE\b/, "startup maintenance should use the conflict seam instead of raw INSERT OR IGNORE");
  assert.doesNotMatch(dbIndexSource, /PRAGMA table_info/, "startup table metadata checks should use the introspection seam");
  assert.doesNotMatch(dbIndexSource, /\browid\b/, "startup physical identity use should route through the identity seam");
  assert.match(dbIndexSource, /FRAMEWORK_MODULE_UPSERT_SQL[\s\S]*buildInsertOnConflictDoUpdate/, "framework module startup upsert should use the conflict update seam");
  assert.match(dbIndexSource, /USER_WORKSPACE_INSERT_SQL[\s\S]*buildInsertOrIgnore/, "workspace membership startup repair should use the conflict insert-or-ignore seam");
  assert.match(dbIndexSource, /USER_ROLE_ASSIGNMENT_INSERT_SQL[\s\S]*buildInsertOrIgnore/, "protected role startup repair should use the conflict insert-or-ignore seam");
  assert.match(dbIndexSource, /databaseDialect\.boolean\.bind\(seedSettings\.billingRounding\.enabled\)/, "startup workspace settings should bind logical booleans through the dialect seam");
  assert.match(dbIndexSource, /databaseDialect\.identity\.rowId/, "startup physical identity reads should use the rowid seam");
  assert.match(dbIndexSource, /databaseDialect\.introspection\.tableInfo\(tableName\)/, "startup column checks should use the introspection seam");
  assert.match(dbIndexSource, /await db\.transaction\(async \(transaction\) => \{[\s\S]*transaction\.run/, "multi-step startup repairs should use transaction clients");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.12j:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 395[\s\S]*Total runtime database operation calls seen by the audit scanner: 439/, "audit docs should record the current parameter-binding ratchet after interpolation enforcement");
  assert.match(auditDocs, /\| db\/migrations \| Migration compatibility \| 0 \| 0 \| 10 \| 28 \|[\s\S]*\| db\/index \| Startup compatibility \| 0 \| 0 \| 31 \| 40 \|/, "audit inventory should mark migrations and startup as compatibility-tracked after value conversion");
  assert.match(auditDocs, /0\.33\.5\.27\.29 Startup Maintenance Compatibility Path[\s\S]*`src\/db\/index\.js` no longer has literal-helper calls or direct interpolated operation sites[\s\S]*18 runtime literal-helper invocations[\s\S]*8 direct interpolated SQL operation sites[\s\S]*375 existing bound operation sites/, "audit docs should record the startup maintenance compatibility slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.29[\s\S]*`src\/db\/index\.js` startup maintenance has no remaining literal-helper calls or direct interpolated operation sites[\s\S]*18 remaining helper invocations/, "database docs should record the startup maintenance compatibility outcome");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.29 - Startup maintenance compatibility path[\s\S]*- \[x\] Review `src\/db\/index\.js`[\s\S]*- \[x\] Convert paths that can safely move[\s\S]*- \[x\] Account for dialect-sensitive startup statements[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.29 - [\s\S]*Startup maintenance compatibility path[\s\S]*18 helper invocations[\s\S]*8 direct interpolated operation sites[\s\S]*375 bound operation sites/, "changelog should record the startup maintenance compatibility burndown");
  assert.match(regressionSuite, /scripts\/startup-maintenance-compatibility-regression\.mjs/, "regression suite should include the startup maintenance compatibility proof");
}

async function assertFreshStartupMaintenance() {
  const frameworkModule = await db.get(`
SELECT module_id, version
FROM modules
WHERE module_id = :moduleId;
`, { moduleId: "framework" });
  assert.deepEqual(frameworkModule, { module_id: "framework", version: appVersion }, "framework module startup upsert should preserve the current app version");

  const workspace = await db.get(`
SELECT workspace_id, workspace_type, owner_user_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);
  assert.ok(workspace?.workspace_id, "startup should create or preserve a default workspace");
  assert.equal(workspace.workspace_type, "business", "startup should preserve the default business workspace type");
  assert.ok(workspace.owner_user_id, "startup should repair workspace owner from protected users");

  const settings = await db.get(`
SELECT workspace_id, rounding_enabled
FROM workspace_settings
WHERE workspace_id = :workspaceId;
`, { workspaceId: workspace.workspace_id });
  assert.equal(settings.workspace_id, workspace.workspace_id, "startup should create workspace settings with bound params");
  assert.equal([0, 1].includes(settings.rounding_enabled), true, "startup should store boolean settings using SQLite boolean storage");

  const membership = await db.get(`
SELECT status
FROM user_workspaces
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, {
    userId: workspace.owner_user_id,
    workspaceId: workspace.workspace_id,
  });
  assert.equal(membership?.status, "active", "startup should create active workspace membership for the protected user");

  const roleAssignment = await db.get(`
SELECT scope_type, scope_id
FROM user_role_assignments
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND role_id = 'super_admin';
`, {
    userId: workspace.owner_user_id,
    workspaceId: workspace.workspace_id,
  });
  assert.deepEqual(roleAssignment, { scope_type: "all", scope_id: "all" }, "startup should repair protected super-admin role scope");
}

async function assertRedactedSeedRepairRerun() {
  const workspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  const userId = `redacted-user-${randomUUID()}`;
  const sessionId = `redacted-session-${randomUUID()}`;
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  :userId,
  :workspaceId,
  :username,
  :displayName,
  NULL,
  :timezone,
  :password,
  'light',
  'active',
  'no',
  :workspaceId
);
`, {
    displayName: "Redacted Placeholder",
    password: "not-a-real-login-hash",
    timezone: "America/New_York",
    userId,
    username: "[REDACTED]",
    workspaceId: workspace.workspace_id,
  });

  await db.run(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  ip_address,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  :sessionId,
  :workspaceId,
  :workspaceId,
  :userId,
  :username,
  :timezone,
  NULL,
  :expiresAt,
  :createdAt,
  :updatedAt
);
`, {
    createdAt: now,
    expiresAt: "2099-01-01T00:00:00.000Z",
    sessionId,
    timezone: "America/New_York",
    updatedAt: now,
    userId,
    username: "[REDACTED]",
    workspaceId: workspace.workspace_id,
  });

  await initializeDatabase();

  const repairedUser = await db.get(`
SELECT username, display_name, user_status, protected_user
FROM users
WHERE user_id = :userId;
`, { userId });
  assert.match(repairedUser.username, /^retired-placeholder-1-redacted-user-/, "redacted startup repair should retire placeholder usernames");
  assert.equal(repairedUser.display_name, "Retired Placeholder User", "redacted startup repair should rename the placeholder user");
  assert.equal(repairedUser.user_status, "inactive", "redacted startup repair should deactivate the placeholder user");
  assert.equal(repairedUser.protected_user, "no", "redacted startup repair should not leave the placeholder protected");

  const session = await db.get(`
SELECT session_id
FROM sessions
WHERE session_id = :sessionId;
`, { sessionId });
  assert.equal(session, null, "redacted startup repair should remove placeholder sessions");

  const auditLog = await db.get(`
SELECT action, change_type, record_id
FROM audit_logs
WHERE record_id = :userId
  AND action = 'redacted_seed_user_repaired'
LIMIT 1;
`, { userId });
  assert.deepEqual(auditLog, {
    action: "redacted_seed_user_repaired",
    change_type: "repair",
    record_id: userId,
  }, "redacted startup repair should preserve an audit trail");
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row.integrity_check, "ok", "startup maintenance disposable database should pass integrity_check");
}

function assertNoLiteralHelperCalls(label, source) {
  const helperCallPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
  const helperCalls = [...source.matchAll(helperCallPattern)]
    .filter((match) => !/function\s+$/.test(source.slice(Math.max(0, match.index - 16), match.index)))
    .map((match) => match[0]);
  assert.deepEqual(helperCalls, [], `${label} should not call literal SQL helpers`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
