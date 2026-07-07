import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.6";
const caseInsensitiveSliceVersion = "0.33.5.27.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-case-insensitive-seams-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-case-insensitive-seams.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Database-Case-Insensitive-Seams-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const filesServiceSource = readText("src/services/files.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { filesService } = await import("../src/services/files.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertComparisonHelpers(db.dialect);
  await assertAttachableTargetOptionProofPath();
  await assertIntegrity();

  console.log("Database case-insensitive seam regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the case-insensitive seam version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the case-insensitive seam version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the case-insensitive seam version");

  assert.match(sqliteDialectSource, new RegExp(`contractVersion: "${escapeRegExp(appVersion)}"`), "SQLite dialect contract should report the current seam contract version");
  assert.match(sqliteDialectSource, /containsNoCase/, "SQLite dialect seams should expose a case-insensitive contains helper");
  assert.match(sqliteDialectSource, /escapeLikePattern/, "SQLite dialect seams should expose LIKE pattern escaping");
  assert.match(sqliteDialectSource, /likePattern/, "SQLite dialect seams should expose pattern construction");

  const proofPath = functionBlock(filesServiceSource, "readAttachableTargetOptionRows");
  assert.match(proofPath, /db\.query\(`/, "Files attachable target options should use the bound database API");
  assert.match(proofPath, /db\.dialect\.comparison\.containsNoCase/, "Files attachable target search should use the case-insensitive comparison seam");
  assert.match(proofPath, /db\.dialect\.comparison\.likePattern/, "Files attachable target search should use the dialect LIKE pattern helper");
  assert.match(proofPath, /db\.dialect\.comparison\.orderByNoCase/, "Files attachable target ordering should use the case-insensitive ordering seam");
  assert.doesNotMatch(proofPath, /LOWER\(COALESCE\(\$\{labelField\}/, "converted proof path should not own raw LOWER(...) LIKE syntax");
  assert.doesNotMatch(proofPath, /sqlLikePattern/, "converted proof path should not own local LIKE escaping");
  assert.doesNotMatch(proofPath, /LIMIT \$\{sqlInteger\(limit\)\}/, "converted proof path should bind the limit value");
  assert.doesNotMatch(filesServiceSource, /function sqlLikePattern/, "Files service should not keep a second local LIKE escaping helper for the proof path");

  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.4 - Case-insensitive comparison and ordering seams[\s\S]*- \[x\] Implement provider-neutral helpers[\s\S]*- \[x\] Convert one proof read\/filter path[\s\S]*- \[x\] Add focused regressions/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.4[\s\S]*case-insensitive[\s\S]*`db\.dialect\.comparison\.containsNoCase\(\.\.\.\)`[\s\S]*LIKE pattern/, "database docs should describe the case-insensitive comparison seam implementation");
  assert.match(auditDocs, /0\.33\.5\.27\.4 Case-Insensitive Comparison and Ordering Seams[\s\S]*`services\/files\.service` attachable-target option read/, "audit docs should record the converted proof path");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(caseInsensitiveSliceVersion)} - [\\s\\S]*case-insensitive comparison and ordering seams[\\s\\S]*Files attachable-target option`), "changelog should record the case-insensitive seam slice");
  assert.match(regressionSuite, /scripts\/database-case-insensitive-seam-regression\.mjs/, "regression suite should include case-insensitive seam coverage");
}

async function assertComparisonHelpers(dialect) {
  await db.run(`
CREATE TABLE case_insensitive_seam_records (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
`);
  await db.run(`
INSERT INTO case_insensitive_seam_records (id, label)
VALUES
  ('alpha', 'alpha'),
  ('beta', 'Beta'),
  ('gamma', 'gamma'),
  ('literal-wildcards', 'Case 100%_Ready Task'),
  ('broad-wildcards', 'Case 100X_Ready Task');
`);

  assert.equal(dialect.comparison.escapeLikePattern("100%_\\done"), "100\\%\\_\\\\done");
  assert.equal(dialect.comparison.likePattern("100%_Ready"), "%100\\%\\_Ready%");
  assert.equal(dialect.comparison.likePattern("alpha", { mode: "starts-with" }), "alpha%");
  assert.equal(dialect.comparison.likePattern("gamma", { mode: "ends_with" }), "%gamma");
  assert.equal(dialect.comparison.likePattern("Beta", { mode: "exact" }), "Beta");
  assert.equal(dialect.comparison.containsNoCase("label", ":pattern"), "label LIKE :pattern COLLATE NOCASE ESCAPE '\\'");
  assert.throws(
    () => dialect.comparison.likePattern("alpha", { mode: "unknown" }),
    /Invalid LIKE pattern mode/,
    "LIKE pattern helper should reject non-allowlisted match modes",
  );

  const equalRows = await db.query(`
SELECT id
FROM case_insensitive_seam_records
WHERE ${dialect.comparison.equalsNoCase("label", ":label")}
ORDER BY id;
`, { label: "ALPHA" });
  assert.deepEqual(equalRows.map((row) => row.id), ["alpha"], "case-insensitive equality seam should match different casing");

  const literalRows = await db.query(`
SELECT id
FROM case_insensitive_seam_records
WHERE ${dialect.comparison.containsNoCase("label", ":pattern")}
ORDER BY id;
`, { pattern: dialect.comparison.likePattern("100%_READY") });
  assert.deepEqual(literalRows.map((row) => row.id), ["literal-wildcards"], "LIKE pattern helper should escape wildcard characters before matching");

  const orderedRows = await db.query(`
SELECT label
FROM case_insensitive_seam_records
WHERE id IN ('alpha', 'beta', 'gamma')
ORDER BY ${dialect.comparison.orderByNoCase("label", "ASC")}, id;
`);
  assert.deepEqual(orderedRows.map((row) => row.label), ["alpha", "Beta", "gamma"], "case-insensitive ordering seam should preserve SQLite NOCASE ordering");
}

async function assertAttachableTargetOptionProofPath() {
  const admin = await db.get(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  assert.ok(admin, "fresh database should have a protected admin user");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const literalTaskId = randomUUID();
  const broadTaskId = randomUUID();
  const now = "2026-07-05T15:30:00.000Z";
  const session = {
    active_workspace_id: workspaceId,
    display_name: admin.display_name,
    home_workspace_id: workspaceId,
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };

  await db.run(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  archived_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  :taskId,
  :workspaceId,
  NULL,
  NULL,
  :title,
  '',
  'open',
  'normal',
  NULL,
  :userId,
  :userId,
  :now,
  :now
);
`, {
    now,
    taskId: literalTaskId,
    title: "Case 100%_Ready Task",
    userId: admin.user_id,
    workspaceId,
  });
  await db.run(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  archived_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  :taskId,
  :workspaceId,
  NULL,
  NULL,
  :title,
  '',
  'open',
  'normal',
  NULL,
  :userId,
  :userId,
  :now,
  :now
);
`, {
    now,
    taskId: broadTaskId,
    title: "Case 100X_Ready Task",
    userId: admin.user_id,
    workspaceId,
  });

  const result = await filesService.listAttachableTargetOptions(session, {
    moduleId: "tasks",
    search: "100%_READY",
    targetType: "task",
  });

  assert.equal(result.count, 1, "escaped wildcard search should not broaden Files attachable-target options");
  assert.equal(result.options[0]?.targetId, literalTaskId);
  assert.equal(result.options[0]?.label, "Case 100%_Ready Task");
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "case-insensitive seam regression database should pass integrity check");
}

function functionBlock(source, functionName) {
  const marker = `function ${functionName}`;
  let start = source.indexOf(marker);
  if (start < 0) {
    start = source.indexOf(`async ${marker}`);
  }
  assert.notEqual(start, -1, `Could not find ${functionName} in source.`);

  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `Could not find ${functionName} body.`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not parse ${functionName} body.`);
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
