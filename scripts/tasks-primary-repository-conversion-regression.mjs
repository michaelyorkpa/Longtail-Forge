import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.31";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tasks-primary-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tasks-primary-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Tasks-Primary-Repository-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksRepoSource = readText("src/modules/tasks/tasks.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { normalizeUtcIso } = await import("../src/utils/timezones.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertTaskReadsAndFilters(session, fixtures);
  await assertDueReminderAndRecurrenceReads(session, fixtures);
  await assertLastWorkedUpdate(session, fixtures.assigned.task_id);

  console.log("Tasks primary repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Tasks primary repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Tasks primary repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Tasks primary repository conversion version");

  assert.match(tasksRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Tasks repository should import only the provider-neutral db facade");
  assert.doesNotMatch(tasksRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Tasks repository should not use SQL literal helpers or compatibility query wrappers");
  assert.doesNotMatch(tasksRepoSource, /COLLATE NOCASE/, "Tasks repository should not spell raw SQLite NOCASE collation");
  assert.match(tasksRepoSource, /tasks\.task_id IN \(:taskIds\)/, "Tasks repository should use array-valued named params for task id batches");
  assert.match(tasksRepoSource, /task_assignees\.task_id IN \(:taskIds\)/, "Tasks assignee reads should use array-valued named params");
  assert.match(tasksRepoSource, /db\.dialect\.comparison\.orderByNoCase\("tasks\.title", "ASC"\)/, "Tasks repository should route case-insensitive ordering through the dialect seam");
  assert.match(tasksRepoSource, /db\.dialect\.boolean\.bind\(Boolean\(task\.reminder_override_enabled\)\)/, "Tasks repository should bind reminder override booleans through the dialect seam");
  assert.match(tasksRepoSource, /db\.dialect\.boolean\.read\(row\.reminder_override_enabled\)/, "Tasks repository should read reminder override booleans through the dialect seam");
  assert.match(tasksRepoSource, /async function readDueBetween[\s\S]*db\.query/, "Tasks due-window reads should be bound db.query calls");
  assert.match(tasksRepoSource, /async function markWorkedAt[\s\S]*db\.run/, "Tasks last-worked writes should be bound db.run calls");

  assert.match(auditDocs, /0\.33\.5\.27\.8 Tasks Primary Repository Conversion[\s\S]*`tasks\/tasks\.repo`[\s\S]*1,370 runtime literal-helper invocations[\s\S]*221 direct interpolated SQL operation sites[\s\S]*116 existing bound operation sites/, "audit docs should record the Tasks conversion ratchet");
  assert.match(auditDocs, /\| tasks\/tasks\.repo \| Converted \| 0 \| 0 \| 15 \| 15 \|/, "audit inventory should mark tasks/tasks.repo converted");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.8[\s\S]*`tasks\/tasks\.repo`[\s\S]*1,370 remaining helper invocations/, "database docs should record the Tasks repository conversion");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.8 - Conversion wave: Tasks primary repository[\s\S]*- \[x\] Convert `tasks\/tasks\.repo`[\s\S]*- \[x\] Preserve task list\/detail reads[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Tasks primary repository slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.8 - [\s\S]*Tasks primary repository conversion[\s\S]*1,370 helper invocations[\s\S]*221 direct interpolated operation sites[\s\S]*116 bound operation sites/, "changelog should record the Tasks conversion burndown");
  assert.match(regressionSuite, /scripts\/tasks-primary-repository-conversion-regression\.mjs/, "regression suite should include the Tasks repository conversion proof");
}

async function createFixtures(session) {
  const client = (await clientsService.createClient({ name: "Tasks Repo Conversion Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Tasks Repo Conversion Project" }, session)).project;
  const today = localDateKey(new Date(), session.timezone);
  const tomorrow = addCalendarDaysKey(today, 1);
  const inTwoDays = addCalendarDaysKey(today, 2);
  const dueTimezone = session.timezone || "America/New_York";

  const assigned = (await tasksService.create({
    assignee_ids: [session.user_id],
    due_at_utc: normalizeUtcIso(`${tomorrow}T09:30:00`, dueTimezone),
    due_date: tomorrow,
    due_time: "09:30",
    due_timezone: dueTimezone,
    next_action: "Verify converted task repository reads.",
    project_id: project.id,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateOnly: [1440],
      dateTime: [15],
    },
    title: `Tasks repo conversion assigned ${randomUUID()}`,
  }, session)).task;

  const unassigned = (await tasksService.create({
    assignee_ids: [],
    due_date: inTwoDays,
    project_id: project.id,
    title: `Tasks repo conversion unassigned ${randomUUID()}`,
  }, session)).task;

  const recurrenceTemplateId = `tasks-repo-conversion-template-${randomUUID()}`;
  const recurrence = await tasksRepository.create(session.workspace_id, {
    assignee_ids: [session.user_id],
    billable: "yes",
    created_by_user_id: session.user_id,
    due_at_utc: "",
    due_date: inTwoDays,
    due_time: "",
    due_timezone: dueTimezone,
    priority: "normal",
    recurrence_instance_date: inTwoDays,
    recurrence_template_id: recurrenceTemplateId,
    reminder_override_enabled: false,
    status: "open",
    title: `Tasks repo conversion recurrence ${randomUUID()}`,
    updated_by_user_id: session.user_id,
  });

  return {
    assigned,
    client,
    inTwoDays,
    project,
    recurrence,
    recurrenceTemplateId,
    session,
    today,
    tomorrow,
    unassigned,
  };
}

async function assertTaskReadsAndFilters(session, fixtures) {
  const detail = (await tasksService.read(fixtures.assigned.task_id, session)).task;
  assert.equal(detail.task_id, fixtures.assigned.task_id, "detail reads should return the converted task");
  assert.equal(detail.project_id, fixtures.project.id, "detail reads should preserve project context");
  assert.equal(detail.reminder_override_enabled, true, "detail reads should preserve reminder override booleans");
  assert.deepEqual(detail.assignee_ids, [session.user_id], "detail reads should preserve assignees");

  const byIds = await tasksRepository.readByIds(session.workspace_id, [
    fixtures.unassigned.task_id,
    fixtures.assigned.task_id,
    fixtures.assigned.task_id,
  ]);
  assert.deepEqual(
    new Set(byIds.map((task) => task.task_id)),
    new Set([fixtures.assigned.task_id, fixtures.unassigned.task_id]),
    "readByIds should use the converted named array binding and de-duplicate ids",
  );

  assertIncludes(
    await taskIds(session, { limit: 50, status: "active", task_view: "my" }),
    fixtures.assigned.task_id,
    "My Tasks saved view should include assigned active tasks",
  );
  assertIncludes(
    await taskIds(session, { assignee: "unassigned", limit: 50, status: "active", task_view: "all" }),
    fixtures.unassigned.task_id,
    "advanced assignee filter should find unassigned active tasks",
  );
  assertIncludes(
    await taskIds(session, { limit: 50, project_id: fixtures.project.id, status: "active", task_view: "all" }),
    fixtures.assigned.task_id,
    "project filter should compose with the converted list query",
  );
}

async function assertDueReminderAndRecurrenceReads(session, fixtures) {
  const calendar = await tasksService.calendarWindow(session, {
    end: fixtures.inTwoDays,
    start: fixtures.today,
  });
  const calendarIds = new Set(calendar.tasks.map((task) => task.task_id));
  assert.ok(calendarIds.has(fixtures.assigned.task_id), "due-window reads should include the assigned task");
  assert.ok(calendarIds.has(fixtures.unassigned.task_id), "due-window reads should include the unassigned task");

  const candidates = await tasksRepository.readReminderSchedulingCandidates(session.workspace_id, { limit: 50 });
  const candidateIds = new Set(candidates.map((task) => task.task_id));
  assert.ok(candidateIds.has(fixtures.assigned.task_id), "reminder candidate reads should include active due tasks");
  assert.ok(candidateIds.has(fixtures.recurrence.task_id), "reminder candidate reads should include repository-created active due tasks");

  const recurrenceRead = await tasksRepository.readByRecurrenceInstance(
    session.workspace_id,
    fixtures.recurrenceTemplateId,
    fixtures.recurrence.recurrence_instance_date,
  );
  assert.equal(recurrenceRead?.task_id, fixtures.recurrence.task_id, "recurrence instance lookup should stay bound and exact");
}

async function assertLastWorkedUpdate(session, taskId) {
  const before = await tasksRepository.readById(session.workspace_id, taskId);
  const workedAt = new Date(Date.now() + 1_000).toISOString();
  const after = await tasksRepository.markWorkedAt(session.workspace_id, taskId, workedAt, "");

  assert.equal(after.last_worked_at, workedAt, "last_worked_at should update through the converted write path");
  assert.equal(after.updated_by_user_id, before.updated_by_user_id, "blank updated-by input should preserve the previous updater");
}

async function taskIds(session, query) {
  const result = await tasksService.list(session, query);
  return result.tasks.map((task) => task.task_id);
}

function assertIncludes(ids, id, message) {
  assert.ok(ids.includes(id), message);
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

function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone || "America/New_York",
    year: "numeric",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDaysKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
