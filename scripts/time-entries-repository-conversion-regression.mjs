import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12o";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-time-entries-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-time-entries-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Time-Entries-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const timeEntriesRepoSource = readText("src/modules/time-tracking/time-entries.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const timeTrackingDocs = readText("docs/time-tracking-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { timeEntriesRepository } = await import("../src/modules/time-tracking/time-entries.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRepositoryLifecycle(session);

  console.log("Time entries repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Time entries repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Time entries repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Time entries repository conversion version");

  assert.match(timeEntriesRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Time entries repository should import the provider-neutral db facade");
  assert.doesNotMatch(timeEntriesRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Time entries repository should not use SQL literal helpers or compatibility query wrappers");
  assert.match(timeEntriesRepoSource, /db\.query\(`/, "Time entry reads should use the bound query API");
  assert.match(timeEntriesRepoSource, /db\.get\(`/, "Time entry single-row reads should use the bound get API");
  assert.match(timeEntriesRepoSource, /db\.run\(`/, "Time entry writes should use the bound run API");
  assert.doesNotMatch(timeEntriesRepoSource, /\$\{/, "Time entries repository should not interpolate runtime values into SQL templates");
  assert.doesNotMatch(timeEntriesRepoSource, /\b(?:julianday|ON CONFLICT|COLLATE|LOWER\s*\(|BEGIN TRANSACTION|COMMIT|ROLLBACK)\b/, "Time entries repository should not add dialect-sensitive raw SQL while converting");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.12n:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 402[\s\S]*Total runtime database operation calls seen by the audit scanner: 446/, "audit docs should record the current Files lifecycle/settings/quota conversion ratchet");
  assert.match(auditDocs, /\| time-tracking\/time-entries\.repo \| Converted \| 0 \| 0 \| 8 \| 8 \|/, "audit inventory should mark time-tracking/time-entries.repo converted");
  assert.match(auditDocs, /0\.33\.5\.27\.13 Time Entries Repository Conversion[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*1,116 runtime literal-helper invocations[\s\S]*180 direct interpolated SQL operation sites[\s\S]*162 existing bound operation sites/, "audit docs should record the Time entries repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.13[\s\S]*`time-tracking\/time-entries\.repo`[\s\S]*named params[\s\S]*1,116 remaining helper invocations/, "database docs should record the Time entries repository conversion");
  assert.match(timeTrackingDocs, /As of version 0\.33\.5\.27\.13[\s\S]*time entry repository uses named bound params[\s\S]*project-scope updates[\s\S]*reporting-facing reads/, "Time Tracking docs should describe the converted time entry persistence boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.13 - Conversion wave: Time entries[\s\S]*- \[x\] Convert `time-tracking\/time-entries\.repo`[\s\S]*- \[x\] Preserve entry reads[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.13 - [\s\S]*Time entries repository conversion[\s\S]*1,116 helper invocations[\s\S]*180 direct interpolated operation sites[\s\S]*162 bound operation sites/, "changelog should record the Time entries conversion burndown");
  assert.match(regressionSuite, /scripts\/time-entries-repository-conversion-regression\.mjs/, "regression suite should include the Time entries repository conversion proof");
}

async function assertRepositoryLifecycle(session) {
  const projectA = randomUUID();
  const projectB = randomUUID();
  const taskId = randomUUID();
  const entryEarly = randomUUID();
  const entryLate = randomUUID();
  const entryOtherProject = randomUUID();

  await timeEntriesRepository.create(entryValue(session, {
    client_id: "",
    client_name: "",
    description: "Late project A entry",
    duration_seconds: "not-a-number",
    duration_hours: "bad",
    end_time: "2026-07-06T11:00:00.000Z",
    entry_id: entryLate,
    project_id: projectA,
    project_name: "Project A",
    start_time: "2026-07-06T10:30:00.000Z",
    task_id: "",
  }));
  await timeEntriesRepository.create(entryValue(session, {
    client_id: "client-a",
    client_name: "Client A",
    description: "Early project A entry",
    duration_seconds: 1800,
    duration_hours: "0.50",
    end_time: "2026-07-06T09:30:00.000Z",
    entry_id: entryEarly,
    project_id: projectA,
    project_name: "Project A",
    start_time: "2026-07-06T09:00:00.000Z",
    task_id: taskId,
  }));
  await timeEntriesRepository.create(entryValue(session, {
    client_id: "client-b",
    client_name: "Client B",
    description: "Other project entry",
    duration_seconds: 3600,
    duration_hours: "1.00",
    end_time: "2026-07-06T12:00:00.000Z",
    entry_id: entryOtherProject,
    project_id: projectB,
    project_name: "Project B",
    start_time: "2026-07-06T11:00:00.000Z",
  }));

  const rawLate = await db.get(`
SELECT client_id, task_id, duration_seconds
FROM time_entries
WHERE workspace_id = :workspaceId
  AND entry_id = :entryId;
`, {
    entryId: entryLate,
    workspaceId: session.workspace_id,
  });
  assert.equal(rawLate.client_id, null, "blank optional client ids should keep nullable text behavior");
  assert.equal(rawLate.task_id, null, "blank optional task ids should keep nullable text behavior");
  assert.equal(Number(rawLate.duration_seconds), 0, "invalid durations should keep integer coercion behavior");

  const ourIds = new Set([entryEarly, entryLate, entryOtherProject]);
  const createdRows = (await timeEntriesRepository.readAll(session.workspace_id))
    .filter((entry) => ourIds.has(entry.entry_id));
  assert.deepEqual(
    createdRows.map((entry) => entry.entry_id),
    [entryEarly, entryLate, entryOtherProject],
    "workspace reads should preserve end-time ordering for reporting inputs",
  );

  const lateEntry = await timeEntriesRepository.readById(session.workspace_id, entryLate);
  assert.equal(lateEntry.client_id, "", "nullable client ids should normalize back to an empty app value");
  assert.equal(lateEntry.task_id, "", "nullable task ids should normalize back to an empty app value");
  assert.equal(lateEntry.duration_seconds, "0", "integer-coerced durations should normalize as the existing app string shape");

  const projectARows = await timeEntriesRepository.readByProjectId(session.workspace_id, projectA);
  assert.deepEqual(projectARows.map((entry) => entry.entry_id), [entryEarly, entryLate], "project reads should preserve end-time ordering");
  assert.equal(await timeEntriesRepository.countByProjectId(session.workspace_id, projectA), 2, "project count should include only matching entries");

  await timeEntriesRepository.update(entryValue(session, {
    billable: "no",
    client_id: "client-updated",
    client_name: "Updated Client",
    description: "Updated early entry",
    duration_seconds: 2400,
    duration_hours: "0.67",
    end_time: "2026-07-06T10:00:00.000Z",
    entry_id: entryEarly,
    invoice_status: "billed",
    project_id: projectA,
    project_name: "Project A",
    start_time: "2026-07-06T09:20:00.000Z",
    task_id: "",
  }));
  const updatedEarly = await timeEntriesRepository.readById(session.workspace_id, entryEarly);
  assert.equal(updatedEarly.description, "Updated early entry");
  assert.equal(updatedEarly.duration_seconds, "2400");
  assert.equal(updatedEarly.invoice_status, "billed");
  assert.equal(updatedEarly.task_id, "", "updates should preserve nullable task behavior");

  await timeEntriesRepository.updateProjectScope(session.workspace_id, projectA, {
    client_id: "scope-client",
    client_name: "Scoped Client",
    project_name: "Scoped Project",
  });
  const scopedRows = await timeEntriesRepository.readByProjectId(session.workspace_id, projectA);
  assert.deepEqual(
    scopedRows.map((entry) => [entry.client_id, entry.client_name, entry.project_name]),
    [
      ["scope-client", "Scoped Client", "Scoped Project"],
      ["scope-client", "Scoped Client", "Scoped Project"],
    ],
    "project-scope updates should rewrite only scope labels for matching project entries",
  );
  const untouchedOtherProject = await timeEntriesRepository.readById(session.workspace_id, entryOtherProject);
  assert.equal(untouchedOtherProject.client_name, "Client B", "project-scope updates should not touch other projects");

  await timeEntriesRepository.remove(session.workspace_id, entryLate);
  assert.equal(await timeEntriesRepository.readById(session.workspace_id, entryLate), null, "remove should delete the matching workspace entry");
  assert.equal(await timeEntriesRepository.countByProjectId(session.workspace_id, projectA), 1, "project count should reflect removed entries");
}

function entryValue(session, overrides = {}) {
  return {
    billable: "yes",
    client_id: "",
    client_name: "",
    description: "",
    duration_hours: "1.00",
    duration_seconds: 3600,
    end_time: "2026-07-06T10:00:00.000Z",
    entry_id: randomUUID(),
    invoice_status: "unbilled",
    project_id: randomUUID(),
    project_name: "Converted Time Entry Project",
    start_time: "2026-07-06T09:00:00.000Z",
    task_id: null,
    user_id: session.user_id,
    workspace_id: session.workspace_id,
    ...overrides,
  };
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
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
