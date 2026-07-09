import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12j";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-active-timers-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-active-timers-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Active-Timers-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const activeTimersRepoSource = readText("src/modules/time-tracking/active-timers.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const timeTrackingDocs = readText("docs/time-tracking-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRepositoryLifecycle(session);

  console.log("Active timers repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Active timers repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Active timers repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Active timers repository conversion version");

  assert.match(activeTimersRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Active timers repository should import only the provider-neutral db facade");
  assert.doesNotMatch(activeTimersRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Active timers repository should not use SQL literal helpers or compatibility query wrappers");
  assert.match(activeTimersRepoSource, /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/, "Active timer upsert should use the provider conflict seam");
  assert.doesNotMatch(activeTimersRepoSource, /\bON CONFLICT\b/, "Active timer repository should not spell raw conflict SQL at the call site");
  assert.match(activeTimersRepoSource, /db\.dialect\.time\.elapsedSecondsSince\("last_active_start_time", ":updatedAt"\)/, "Active timer pause updates should keep elapsed-time math behind the time seam");
  assert.match(activeTimersRepoSource, /sourceModuleSql = source\.sourceModuleId[\s\S]*source_module_id IS NULL/, "Manual timer reads should preserve source-module NULL filtering");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.12j:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 395[\s\S]*Total runtime database operation calls seen by the audit scanner: 439/, "audit docs should record the current Files lifecycle/settings/quota conversion ratchet");
  assert.match(auditDocs, /\| time-tracking\/active-timers\.repo \| Converted \| 0 \| 0 \| 12 \| 12 \|/, "audit inventory should mark time-tracking/active-timers.repo converted");
  assert.match(auditDocs, /0\.33\.5\.27\.12 Active Timers Repository Conversion[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*1,165 runtime literal-helper invocations[\s\S]*187 direct interpolated SQL operation sites[\s\S]*154 existing bound operation sites/, "audit docs should record the Active timers repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.12[\s\S]*`time-tracking\/active-timers\.repo`[\s\S]*named params[\s\S]*conflict seam[\s\S]*1,165 remaining helper invocations/, "database docs should record the Active timers repository conversion");
  assert.match(timeTrackingDocs, /As of version 0\.33\.5\.27\.12[\s\S]*active timer repository uses named bound params[\s\S]*conflict seam[\s\S]*slot compaction/, "Time Tracking docs should describe the converted active timer persistence boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.12 - Conversion wave: Active timers[\s\S]*- \[x\] Convert `time-tracking\/active-timers\.repo`[\s\S]*- \[x\] Preserve active timer reads[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.12 - [\s\S]*Active timers repository conversion[\s\S]*1,165 helper invocations[\s\S]*187 direct interpolated operation sites[\s\S]*154 bound operation sites/, "changelog should record the Active timers conversion burndown");
  assert.match(regressionSuite, /scripts\/active-timers-repository-conversion-regression\.mjs/, "regression suite should include the Active timers repository conversion proof");
}

async function assertRepositoryLifecycle(session) {
  const manualTwo = await activeTimersRepository.upsert(timerValue(session, {
    accumulated_elapsed_seconds: 15,
    description: "Manual slot two",
    last_active_start_time: minutesAgo(2),
    timer_slot: "2",
    timer_status: "running",
  }));

  await activeTimersRepository.upsert(timerValue(session, {
    accumulated_elapsed_seconds: 5,
    description: "Manual slot four",
    timer_slot: "4",
    timer_status: "paused",
  }));

  const updatedSlotTwo = await activeTimersRepository.upsert(timerValue(session, {
    active_timer_id: randomUUID(),
    accumulated_elapsed_seconds: 20,
    description: "Manual slot two updated",
    timer_slot: "2",
    timer_status: "paused",
  }));
  assert.equal(updatedSlotTwo.active_timer_id, manualTwo.active_timer_id, "conflict upsert should preserve the existing active timer identity for a slot");
  assert.equal(updatedSlotTwo.description, "Manual slot two updated");

  await activeTimersRepository.upsert({
    ...updatedSlotTwo,
    accumulated_elapsed_seconds: 20,
    last_active_start_time: minutesAgo(2),
    timer_status: "running",
  });

  const taskId = randomUUID();
  const sourcedTimer = await activeTimersRepository.upsert(timerValue(session, {
    accumulated_elapsed_seconds: 30,
    description: "Task sourced timer",
    last_active_start_time: minutesAgo(1),
    source_id: taskId,
    source_label: "Task timer source",
    source_metadata_json: { taskTimerStatusTransition: { movedTaskFromOpen: true } },
    source_module_id: "tasks",
    source_type: "task",
    source_url: `tasks.html?task=${encodeURIComponent(taskId)}`,
    timer_slot: `source:tasks:task:${taskId}`,
    timer_status: "running",
  }));

  const pausedSlotTwo = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "2");
  assert.equal(pausedSlotTwo.timer_status, "paused", "starting a sourced timer should pause other running timers for the user");
  assert.equal(pausedSlotTwo.last_active_start_time, null);
  assert.ok(pausedSlotTwo.accumulated_elapsed_seconds >= 100, "paused timer should include the elapsed active segment");

  const manualTimers = await activeTimersRepository.readAll(session.workspace_id, session.user_id);
  assert.deepEqual(manualTimers.map((timer) => timer.timer_slot), ["2", "4"], "manual timer reads should exclude sourced timers and preserve numeric ordering");

  const taskTimers = await activeTimersRepository.readAllBySource(session.workspace_id, session.user_id, {
    sourceModuleId: "tasks",
    sourceType: "task",
  });
  assert.deepEqual(taskTimers.map((timer) => timer.source_id), [taskId], "sourced timer reads should preserve source filters");

  const readBySource = await activeTimersRepository.readBySource(session.workspace_id, session.user_id, {
    sourceId: taskId,
    sourceModuleId: "tasks",
    sourceType: "task",
  });
  assert.equal(readBySource.active_timer_id, sourcedTimer.active_timer_id);
  assert.equal(readBySource.sourceMetadata.taskTimerStatusTransition.movedTaskFromOpen, true);
  assert.equal(await activeTimersRepository.hasSource(session.workspace_id, {
    sourceId: taskId,
    sourceModuleId: "tasks",
    sourceType: "task",
  }), true);

  await activeTimersRepository.removeBySource(session.workspace_id, session.user_id, {
    sourceId: taskId,
    sourceModuleId: "tasks",
    sourceType: "task",
  });
  assert.equal(await activeTimersRepository.hasSource(session.workspace_id, {
    sourceId: taskId,
    sourceModuleId: "tasks",
    sourceType: "task",
  }), false, "source removal should delete only the matching sourced timer");

  await activeTimersRepository.remove(session.workspace_id, session.user_id, "2");
  const compactedTimers = await activeTimersRepository.compactManualTimerSlots(session.workspace_id, session.user_id);
  assert.deepEqual(compactedTimers.map((timer) => timer.timer_slot), ["1"], "manual slot compaction should close numeric gaps");
  assert.equal(compactedTimers[0].description, "Manual slot four");

  await activeTimersRepository.upsert(timerValue(session, {
    accumulated_elapsed_seconds: 1,
    description: "Pause all running",
    last_active_start_time: minutesAgo(1),
    timer_slot: "3",
    timer_status: "running",
  }));
  await activeTimersRepository.pauseRunningForUser(session.workspace_id, session.user_id);
  const pausedSlotThree = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "3");
  assert.equal(pausedSlotThree.timer_status, "paused", "pauseRunningForUser should pause active timers");
  assert.equal(pausedSlotThree.last_active_start_time, null);
  assert.ok(pausedSlotThree.accumulated_elapsed_seconds >= 30, "pauseRunningForUser should preserve elapsed running time");
}

function timerValue(session, overrides = {}) {
  return {
    accumulated_elapsed_seconds: 0,
    active_timer_id: overrides.active_timer_id || randomUUID(),
    billable: "yes",
    client_id: "",
    client_name: "",
    description: "",
    last_active_start_time: null,
    project_id: randomUUID(),
    project_name: "Converted Active Timer Project",
    source_id: null,
    source_label: "Manual",
    source_metadata_json: "{}",
    source_module_id: null,
    source_type: "manual",
    source_url: "",
    timer_slot: "1",
    timer_status: "paused",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
    ...overrides,
  };
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
