import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.14a";
const booleanTimeSliceVersion = "0.33.5.27.5";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-boolean-time-seams-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-boolean-time-seams.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Database-Boolean-Time-Seams-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const settingsRepoSource = readText("src/repositories/settings.repo.js");
const activeTimersRepoSource = readText("src/modules/time-tracking/active-timers.repo.js");
const parameterAuditRegression = readText("scripts/parameter-binding-audit-regression.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { settingsRepository } = await import("../src/repositories/settings.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertBooleanHelpers(db.dialect);
  await assertTimestampHelpers(db.dialect);
  await assertWorkspaceSettingsProofPath();
  await assertIntegrity();

  console.log("Database boolean and timestamp seam regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the boolean/time seam version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the boolean/time seam version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the boolean/time seam version");

  assert.match(sqliteDialectSource, new RegExp(`contractVersion: "${escapeRegExp(appVersion)}"`), "SQLite dialect contract should report the current seam contract version");
  assert.match(sqliteDialectSource, /bindFields: bindSqliteBooleanFields/, "SQLite dialect seams should expose boolean bind-field mapping");
  assert.match(sqliteDialectSource, /readFields: readSqliteBooleanFields/, "SQLite dialect seams should expose boolean read-field mapping");
  assert.match(sqliteDialectSource, /elapsedSecondsSince/, "SQLite dialect seams should expose an elapsed-seconds helper");

  assert.match(settingsRepoSource, /db\.dialect\.boolean\.bindFields/, "workspace settings should bind logical booleans through the dialect seam");
  assert.match(settingsRepoSource, /db\.dialect\.boolean\.readFields/, "workspace settings should read logical booleans through the dialect seam");
  assert.doesNotMatch(settingsRepoSource, /Number\(row\.(?:rounding_enabled|audit_logging_enabled|task_timers_enabled)\) === 1/, "workspace settings should not own SQLite integer boolean row mapping");
  assert.doesNotMatch(settingsRepoSource, /\? 1 : 0/, "workspace settings save path should not own SQLite integer boolean binding");

  const pauseOtherRunningTimers = functionBlock(activeTimersRepoSource, "pauseOtherRunningTimers");
  const pauseRunningForUser = functionBlock(activeTimersRepoSource, "pauseRunningForUser");
  for (const proofPath of [pauseOtherRunningTimers, pauseRunningForUser]) {
    assert.match(proofPath, /db\.run\(`/, "active timer pause proof paths should use the bound database API");
    assert.match(proofPath, /db\.dialect\.time\.elapsedSecondsSince/, "active timer pause proof paths should use the timestamp seam");
    assert.doesNotMatch(proofPath, /julianday/, "active timer pause proof paths should not own raw SQLite interval math");
    assert.doesNotMatch(proofPath, /runSql\(`/, "active timer pause proof paths should not remain on the interpolated compatibility helper");
  }

  assert.match(auditDocs, /0\.33\.5\.27\.5 Boolean and Timestamp\/Interval Seams[\s\S]*1,481 runtime literal-helper invocations[\s\S]*230 direct interpolated SQL operation sites/, "parameter-binding audit should retain the boolean/time proof burndown");
  assert.match(parameterAuditRegression, /\["time-tracking\/active-timers\.repo", 12\]/, "parameter-binding audit should track the converted active timer row");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.5 - Boolean and timestamp\/interval seams[\s\S]*- \[x\] Implement adapter-owned logical boolean normalization[\s\S]*- \[x\] Implement the provider date\/time helper[\s\S]*- \[x\] Convert one small proof path/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.5[\s\S]*`db\.dialect\.boolean\.bindFields\(\.\.\.\)`[\s\S]*`db\.dialect\.time\.elapsedSecondsSince\(\.\.\.\)`/, "database docs should describe the boolean and timestamp seam implementation");
  assert.match(auditDocs, /0\.33\.5\.27\.5 Boolean and Timestamp\/Interval Seams[\s\S]*`settings\.repo`[\s\S]*`time-tracking\/active-timers\.repo`/, "audit docs should record the boolean/time proof paths");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(booleanTimeSliceVersion)} - [\\s\\S]*Boolean and timestamp\\/interval seams[\\s\\S]*active timer pause`), "changelog should record the boolean/time seam slice");
  assert.match(regressionSuite, /scripts\/database-boolean-time-seam-regression\.mjs/, "regression suite should include boolean/time seam coverage");
}

async function assertBooleanHelpers(dialect) {
  await db.run(`
CREATE TABLE boolean_time_seam_records (
  record_id TEXT PRIMARY KEY,
  enabled INTEGER,
  hidden INTEGER,
  optional_flag INTEGER,
  started_at TEXT NOT NULL
);
`);

  const bound = dialect.boolean.bindFields({
    enabled: true,
    hidden: "no",
    optional_flag: null,
    untouched: "kept",
  }, ["enabled", "hidden", "optional_flag"]);
  assert.deepEqual(bound, {
    enabled: 1,
    hidden: 0,
    optional_flag: null,
    untouched: "kept",
  }, "boolean bind-field helper should map logical booleans without mutating unrelated values");

  await db.run(`
INSERT INTO boolean_time_seam_records (record_id, enabled, hidden, optional_flag, started_at)
VALUES (:recordId, :enabled, :hidden, :optionalFlag, :startedAt);
`, {
    enabled: bound.enabled,
    hidden: bound.hidden,
    optionalFlag: bound.optional_flag,
    recordId: "boolean-one",
    startedAt: "2026-07-05T19:00:00.000Z",
  });

  const stored = await db.get(`
SELECT enabled, hidden, optional_flag
FROM boolean_time_seam_records
WHERE record_id = :recordId;
`, { recordId: "boolean-one" });
  assert.deepEqual(stored, {
    enabled: 1,
    hidden: 0,
    optional_flag: null,
  }, "SQLite should still store boolean seam values as integer/null fields");

  assert.deepEqual(
    dialect.boolean.readFields(stored, ["enabled", "hidden", "optional_flag"], {
      fallbacks: {
        missing_flag: true,
      },
    }),
    {
      enabled: true,
      hidden: false,
      optional_flag: null,
    },
    "boolean read-field helper should map SQLite row values back to logical booleans",
  );
  assert.equal(dialect.boolean.readField({}, "missing_flag", { fallback: true }), true, "boolean read-field helper should support explicit fallbacks");
  assert.throws(
    () => dialect.boolean.bind("maybe"),
    /Boolean value must be/,
    "boolean bind helper should reject unrecognized string values",
  );
  assert.throws(
    () => dialect.boolean.readFields(stored, ["bad.field"]),
    /Invalid boolean read field/,
    "boolean row-mapping helpers should reject dotted or dynamic row keys",
  );
}

async function assertTimestampHelpers(dialect) {
  assert.equal(
    dialect.time.elapsedSecondsSince("started_at", ":now"),
    "MAX(0, CAST((julianday(:now) - julianday(started_at)) * 86400 AS INTEGER))",
    "elapsed-seconds helper should lower to the SQLite timestamp interval seam",
  );

  const row = await db.get(`
SELECT
  ${dialect.time.elapsedSecondsSince("started_at", ":now")} AS elapsed_seconds,
  ${dialect.time.elapsedSecondsSince("started_at", ":beforeStart")} AS clamped_seconds
FROM boolean_time_seam_records
WHERE record_id = :recordId;
`, {
    beforeStart: "2026-07-05T18:59:30.000Z",
    now: "2026-07-05T19:02:00.000Z",
    recordId: "boolean-one",
  });

  assert.ok(
    Number(row.elapsed_seconds) >= 119 && Number(row.elapsed_seconds) <= 120,
    "timestamp seam should return elapsed seconds through SQLite interval math",
  );
  assert.equal(Number(row.clamped_seconds), 0, "elapsed-seconds helper should clamp negative intervals to zero");
}

async function assertWorkspaceSettingsProofPath() {
  const workspace = await db.get(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);
  assert.ok(workspace, "fresh database should have a default workspace");

  const original = await settingsRepository.readWorkspaceSettings(workspace.workspace_id);
  await settingsRepository.saveWorkspaceSettings(workspace.workspace_id, {
    ...original,
    audit: {
      ...original.audit,
      loggingEnabled: false,
    },
    billingRounding: {
      ...original.billingRounding,
      enabled: false,
    },
    taskTimersEnabled: false,
  });

  const storedFalse = await db.get(`
SELECT rounding_enabled, audit_logging_enabled, task_timers_enabled
FROM workspace_settings
WHERE workspace_id = :workspaceId;
`, { workspaceId: workspace.workspace_id });
  assert.deepEqual(storedFalse, {
    audit_logging_enabled: 0,
    rounding_enabled: 0,
    task_timers_enabled: 0,
  }, "workspace settings proof path should store false booleans through the dialect seam");

  const readFalse = await settingsRepository.readWorkspaceSettings(workspace.workspace_id);
  assert.equal(readFalse.billingRounding.enabled, false);
  assert.equal(readFalse.audit.loggingEnabled, false);
  assert.equal(readFalse.taskTimersEnabled, false);

  await settingsRepository.saveWorkspaceSettings(workspace.workspace_id, {
    ...readFalse,
    audit: {
      ...readFalse.audit,
      loggingEnabled: true,
    },
    billingRounding: {
      ...readFalse.billingRounding,
      enabled: true,
    },
    taskTimersEnabled: true,
  });

  const storedTrue = await db.get(`
SELECT rounding_enabled, audit_logging_enabled, task_timers_enabled
FROM workspace_settings
WHERE workspace_id = :workspaceId;
`, { workspaceId: workspace.workspace_id });
  assert.deepEqual(storedTrue, {
    audit_logging_enabled: 1,
    rounding_enabled: 1,
    task_timers_enabled: 1,
  }, "workspace settings proof path should store true booleans through the dialect seam");

  const readTrue = await settingsRepository.readWorkspaceSettings(workspace.workspace_id);
  assert.equal(readTrue.billingRounding.enabled, true);
  assert.equal(readTrue.audit.loggingEnabled, true);
  assert.equal(readTrue.taskTimersEnabled, true);
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "boolean/time seam regression database should pass integrity check");
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

  throw new Error(`Could not extract ${functionName} body.`);
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
