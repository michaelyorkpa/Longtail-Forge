import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12j";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-reminders-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-reminders-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Reminders-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const recurrenceRepoSource = readText("src/modules/tasks/task-recurrence.repo.js");
const remindersRepoSource = readText("src/modules/tasks/task-reminders.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const tasksDocs = readText("docs/tasks-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { taskRecurrenceRepository } = await import("../src/modules/tasks/task-recurrence.repo.js");
const { taskRemindersRepository } = await import("../src/modules/tasks/task-reminders.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRecurrenceTemplateRepository(session);
  await assertReminderOffsetRepository(session);

  console.log("Task recurrence and reminders repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Task recurrence/reminders repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Task recurrence/reminders repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task recurrence/reminders repository conversion version");

  assert.match(recurrenceRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Task recurrence repository should import only the provider-neutral db facade");
  assert.match(remindersRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Task reminders repository should import only the provider-neutral db facade");
  assert.doesNotMatch(`${recurrenceRepoSource}\n${remindersRepoSource}`, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Task recurrence/reminder repositories should not use SQL literal helpers or compatibility query wrappers");
  assert.match(recurrenceRepoSource, /db\.get\(templateSelectSql\(`[\s\S]*recurrence_template_id = :templateId/, "Template reads should use named params through db.get");
  assert.match(recurrenceRepoSource, /db\.transaction\(async \(transaction\)[\s\S]*transaction\.run\(`[\s\S]*UPDATE task_recurrence_assignees[\s\S]*transaction\.run\(`[\s\S]*INSERT INTO task_recurrence_assignees/, "Template assignee replacement should use provider-neutral transaction writes");
  assert.match(remindersRepoSource, /target_type = :targetType[\s\S]*target_id = :targetId/, "Reminder single-target reads should use named params");
  assert.match(remindersRepoSource, /targetTypeKey = `targetType\$\{index\}`[\s\S]*target_id = :\$\{targetIdKey\}/, "Reminder batch reads should build dynamic OR clauses from generated named params");
  assert.match(remindersRepoSource, /db\.transaction\(async \(transaction\)[\s\S]*DELETE FROM task_reminder_offsets[\s\S]*INSERT INTO task_reminder_offsets/, "Reminder offset replacement should use provider-neutral transaction writes");
  assert.doesNotMatch(`${recurrenceRepoSource}\n${remindersRepoSource}`, /BEGIN TRANSACTION|COMMIT;|ROLLBACK;/, "Converted repositories should not hand-compose transaction scripts");

  assert.match(auditDocs, /0\.33\.5\.27\.11 Task Recurrence and Reminders Repository Conversion[\s\S]*`tasks\/task-recurrence\.repo`[\s\S]*`tasks\/task-reminders\.repo`[\s\S]*1,218 runtime literal-helper invocations[\s\S]*197 direct interpolated SQL operation sites[\s\S]*144 existing bound operation sites/, "audit docs should retain the Task recurrence/reminders conversion ratchet");
  assert.match(auditDocs, /\| tasks\/task-recurrence\.repo \| Converted \| 0 \| 0 \| 10 \| 10 \|/, "audit inventory should mark tasks/task-recurrence.repo converted");
  assert.match(auditDocs, /\| tasks\/task-reminders\.repo \| Converted \| 0 \| 0 \| 4 \| 4 \|/, "audit inventory should mark tasks/task-reminders.repo converted");
  assert.match(auditDocs, /0\.33\.5\.27\.11 Task Recurrence and Reminders Repository Conversion[\s\S]*`tasks\/task-recurrence\.repo`[\s\S]*`tasks\/task-reminders\.repo`[\s\S]*1,218 runtime literal-helper invocations[\s\S]*197 direct interpolated SQL operation sites[\s\S]*144 existing bound operation sites/, "audit docs should record the Task recurrence/reminders repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.11[\s\S]*`tasks\/task-recurrence\.repo`[\s\S]*`tasks\/task-reminders\.repo`[\s\S]*1,218 remaining helper invocations/, "database docs should record the Task recurrence/reminders repository conversion");
  assert.match(tasksDocs, /As of version 0\.33\.5\.27\.11[\s\S]*task recurrence and reminder repositories use named bound params[\s\S]*[Tt]emplate assignee replacement[\s\S]*reminder offset replacement/, "Tasks docs should describe the converted recurrence/reminder persistence boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.11 - Conversion wave: Task recurrence and reminders[\s\S]*- \[x\] Convert `tasks\/task-recurrence\.repo` and `tasks\/task-reminders\.repo`[\s\S]*- \[x\] Preserve recurrence template reads\/writes[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.11 - [\s\S]*Task recurrence and reminders repository conversion[\s\S]*1,218 helper invocations[\s\S]*197 direct interpolated operation sites[\s\S]*144 bound operation sites/, "changelog should record the Task recurrence/reminders conversion burndown");
  assert.match(regressionSuite, /scripts\/task-recurrence-reminders-repository-conversion-regression\.mjs/, "regression suite should include the Task recurrence/reminders repository conversion proof");
}

async function assertRecurrenceTemplateRepository(session) {
  const created = await taskRecurrenceRepository.createTemplate(session.workspace_id, {
    assignee_ids: [session.user_id],
    created_by_user_id: session.user_id,
    description: "Initial recurrence template context.",
    due_at_utc: "2026-07-06T13:30:00.000Z",
    due_time: "09:30",
    due_timezone: session.timezone,
    priority: "high",
    recurrence_anchor_date: "2026-07-06",
    recurrence_end_date: "2026-08-31",
    rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
    status: "open",
    template_status: "active",
    title: "Converted recurrence template",
    updated_by_user_id: session.user_id,
  });

  assert.equal(created.title, "Converted recurrence template");
  assert.equal(created.priority, "high");
  assert.deepEqual(created.assignee_ids, [session.user_id]);

  const updated = await taskRecurrenceRepository.updateTemplate(session.workspace_id, {
    ...created,
    assignee_ids: [],
    description: "",
    due_at_utc: "",
    due_time: "",
    due_timezone: "",
    priority: "normal",
    recurrence_end_date: "",
    rrule: "FREQ=DAILY;INTERVAL=2",
    title: "Converted recurrence template updated",
    updated_by_user_id: session.user_id,
  });

  assert.equal(updated.title, "Converted recurrence template updated");
  assert.equal(updated.description, "");
  assert.equal(updated.due_time, "");
  assert.equal(updated.recurrence_end_date, "");
  assert.deepEqual(updated.assignee_ids, [], "template assignee replacement should remove previous active assignees");

  const reassigned = await taskRecurrenceRepository.updateTemplate(session.workspace_id, {
    ...updated,
    assignee_ids: [session.user_id],
    updated_by_user_id: session.user_id,
  });
  assert.deepEqual(reassigned.assignee_ids, [session.user_id], "template assignee replacement should insert active assignees");
  assert.equal(
    (await taskRecurrenceRepository.readTemplateById(session.workspace_id, created.recurrence_template_id)).rrule,
    "FREQ=DAILY;INTERVAL=2",
  );
}

async function assertReminderOffsetRepository(session) {
  const taskTargetId = randomUUID();
  const projectTargetId = randomUUID();

  await taskRemindersRepository.replaceOffsets(session.workspace_id, "task", taskTargetId, [
    { due_kind: "date_time", offset_minutes: "5" },
    { due_kind: "ignored", offset_minutes: "999" },
    { due_kind: "date_only", offset_minutes: "1440" },
  ]);
  await taskRemindersRepository.replaceOffsets(session.workspace_id, "project", projectTargetId, [
    { due_kind: "date_time", offset_minutes: "15" },
  ]);
  await taskRemindersRepository.replaceOffsets(session.workspace_id, "unknown", randomUUID(), [
    { due_kind: "date_time", offset_minutes: "1" },
  ]);

  const taskOffsets = await taskRemindersRepository.readOffsets(session.workspace_id, "task", taskTargetId);
  assert.deepEqual(
    taskOffsets.map((offset) => `${offset.due_kind}:${offset.offset_minutes}:${offset.sort_order}`),
    ["date_only:1440:2", "date_time:5:0"],
    "reminder offsets should preserve existing due-kind ordering and original sort indexes",
  );
  assert.deepEqual(await taskRemindersRepository.readOffsets(session.workspace_id, "invalid", taskTargetId), []);

  const offsetsByTarget = await taskRemindersRepository.readOffsetsForTargets(session.workspace_id, [
    { targetId: taskTargetId, targetType: "task" },
    { targetId: projectTargetId, targetType: "project" },
    { targetId: "", targetType: "task" },
    { targetId: randomUUID(), targetType: "unknown" },
  ]);
  assert.deepEqual(
    offsetsByTarget.get(taskRemindersRepository.reminderKey("task", taskTargetId)).map((offset) => offset.offset_minutes),
    [1440, 5],
  );
  assert.deepEqual(
    offsetsByTarget.get(taskRemindersRepository.reminderKey("project", projectTargetId)).map((offset) => offset.offset_minutes),
    [15],
  );

  await taskRemindersRepository.replaceOffsets(session.workspace_id, "task", taskTargetId, []);
  assert.deepEqual(await taskRemindersRepository.readOffsets(session.workspace_id, "task", taskTargetId), [], "empty offset replacement should delete existing offsets");
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
