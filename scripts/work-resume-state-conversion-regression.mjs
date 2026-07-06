import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.29";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const resumeServiceSource = readText("src/services/work-resume-state.service.js");
const initialProducersSource = readText("src/services/work-resume-state-initial-producers.js");
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
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));

  await assertConvertedRuntime(session);
  await assertIntegrity();

  console.log("Work resume state conversion regression passed.");
} finally {
  resetResumeStateReadResolvers();
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Work resume state conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Work resume state conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Work resume state conversion version");

  assert.match(resumeServiceSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "work resume state service should import the provider-neutral db facade");
  assert.doesNotMatch(resumeServiceSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "work resume state service should be fully off literal helpers");
  assert.match(resumeServiceSource, /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/, "work resume state upserts should use the provider conflict seam");
  assert.match(resumeServiceSource, /const CONTEXT_LOOKUPS[\s\S]*FROM clients[\s\S]*FROM projects/, "client and project context reads should stay behind static lookup statements");
  assert.equal(countMatches(resumeServiceSource, /\bdb\.run\(/g), 3, "work resume state service should keep upsert, dismiss, and remove writes as bound db.run calls");
  assert.equal(countMatches(resumeServiceSource, /\bdb\.query\(/g), 1, "work resume state service should keep list reads as one bound db.query call");
  assert.equal(countMatches(resumeServiceSource, /\bdb\.get\(/g), 3, "work resume state service should keep context, source, and ID reads as bound db.get calls");

  assert.match(initialProducersSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "initial producers should import the provider-neutral db facade");
  assert.doesNotMatch(initialProducersSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "initial producers should be fully off literal helpers");
  assert.equal(countMatches(initialProducersSource, /\bdb\.get\(/g), 2, "initial producers should keep active timer and safe note lifecycle reads as bound db.get calls");

  assert.match(auditDocs, /Current totals as of 0\.33\.5\.27\.29:[\s\S]*Remaining runtime literal-helper invocations: 18[\s\S]*Remaining direct interpolated SQL operation sites: 8[\s\S]*Existing direct bound-params operation sites: 375[\s\S]*Total runtime database operation calls seen by the audit scanner: 425/, "audit docs should record the Work resume state conversion ratchet");
  assert.match(auditDocs, /\| services\/work-resume-state\.service \| Converted \| 0 \| 0 \| 7 \| 7 \|/, "audit inventory should mark the work resume state service converted");
  assert.match(auditDocs, /\| services\/work-resume-state-initial-producers \| Converted \| 0 \| 0 \| 2 \| 2 \|/, "audit inventory should mark the initial producers converted");
  assert.match(auditDocs, /0\.33\.5\.27\.26 Work Resume State Conversion[\s\S]*`services\/work-resume-state\.service` and `services\/work-resume-state-initial-producers` are fully converted[\s\S]*304 runtime literal-helper invocations[\s\S]*57 direct interpolated SQL operation sites[\s\S]*302 existing bound operation sites/, "audit docs should record the Work resume state conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.26[\s\S]*`services\/work-resume-state\.service` and `services\/work-resume-state-initial-producers` are converted[\s\S]*304 remaining helper invocations/, "database docs should record the concrete Work resume state conversion");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.26 - Conversion wave: Work resume state[\s\S]*- \[x\] Convert `services\/work-resume-state\.service`[\s\S]*- \[x\] Preserve resume state upsert[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Work resume state conversion slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.26 - [\s\S]*Work resume state conversion[\s\S]*304 helper invocations[\s\S]*57 direct interpolated operation sites[\s\S]*302 bound operation sites/, "changelog should record the Work resume state conversion burndown");
  assert.match(regressionSuite, /scripts\/work-resume-state-conversion-regression\.mjs/, "regression suite should include the Work resume state conversion proof");
}

async function assertConvertedRuntime(session) {
  const now = "2026-07-06T18:00:00.000Z";
  const clientId = `resume-client-${randomUUID()}-' OR 1=1 --`;
  const projectId = `resume-project-${randomUUID()}-' OR 1=1 --`;
  const recordId = `resume-conversion-task-${randomUUID()}-' OR 1=1 --`;
  const timerRecordId = `resume-conversion-timer-${randomUUID()}`;

  await insertClient(session.workspace_id, clientId, "Resume Conversion Client", now);
  await insertProject(session.workspace_id, projectId, clientId, "Resume Conversion Project", now);

  const saved = await workResumeStateService.upsertResumeState(session, {
    clientId,
    lastActionType: "task.updated",
    lastWorkedAt: "2026-07-06T18:05:00.000Z",
    metadata: { source: "conversion-regression" },
    moduleId: "tasks",
    nextAction: "Review the converted resume row.",
    projectId,
    recordId,
    recordType: "task",
    resumeRankHint: 500,
    title: "Converted resume state task",
  });

  assert.equal(saved.client_id, clientId, "context client should round-trip through the bound context read");
  assert.equal(saved.project_id, projectId, "context project should round-trip through the bound context read");
  assert.equal(saved.metadata_json, JSON.stringify({ source: "conversion-regression" }));

  await workResumeStateService.upsertResumeState(session, {
    lastActionType: "timer.running",
    lastWorkedAt: "2026-07-06T18:02:00.000Z",
    moduleId: "tasks",
    recordId: timerRecordId,
    recordType: "task",
    resumeRankHint: -1000,
    title: "Running timer resume row",
  });

  const ranked = await workResumeStateService.listResumeState(session, { limit: 10, mode: "recent" });
  assert.equal(ranked.items[0]?.record_id, timerRecordId, "running timer rows should keep their list-ranking priority");
  assert.ok(ranked.items.some((item) => item.record_id === recordId), "converted list reads should include the saved task row");

  await workResumeStateService.dismissResumeState(session, saved.resume_state_id);
  const dismissed = await workResumeStateService.listResumeState(session, { limit: 10, mode: "left_off" });
  assert.equal(dismissed.items.some((item) => item.record_id === recordId), false, "dismissed rows should stay hidden before a newer source update");

  await workResumeStateService.upsertResumeState(session, {
    lastActionType: "task.updated",
    lastWorkedAt: "2026-07-06T18:20:00.000Z",
    moduleId: "tasks",
    recordId,
    recordType: "task",
    title: "Converted resume state task refreshed",
  });
  const refreshed = await workResumeStateService.listResumeState(session, { limit: 10, mode: "left_off" });
  assert.equal(refreshed.items.some((item) => item.record_id === recordId), true, "newer source updates should clear dismissal through the upsert seam");

  await workResumeStateService.removeResumeStateForRecord(session.workspace_id, "tasks", "task", recordId);
  const removedRow = await db.get(`
SELECT resume_state_id
FROM work_resume_state
WHERE workspace_id = :workspaceId
  AND module_id = 'tasks'
  AND record_type = 'task'
  AND record_id = :recordId
LIMIT 1;
`, {
    recordId,
    workspaceId: session.workspace_id,
  });
  assert.equal(removedRow, null, "source removal should delete the converted resume row");
}

async function insertClient(workspaceId, clientId, name, now) {
  await db.run(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  :clientId,
  :workspaceId,
  NULL,
  :name,
  'active',
  'yes',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  :now,
  :now
);
`, {
    clientId,
    name,
    now,
    workspaceId,
  });
}

async function insertProject(workspaceId, projectId, clientId, name, now) {
  await db.run(`
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  created_at,
  updated_at
)
VALUES (
  :projectId,
  :workspaceId,
  :clientId,
  NULL,
  :name,
  'active',
  'yes',
  :now,
  :now
);
`, {
    clientId,
    name,
    now,
    projectId,
    workspaceId,
  });
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "Work resume state conversion database should pass integrity check");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
