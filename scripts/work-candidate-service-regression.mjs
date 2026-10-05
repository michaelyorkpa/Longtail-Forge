import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} CandidateSession */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-candidate-service-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-candidate-service.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Candidate-Service-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const { workCandidateService } = await import("../src/services/work-candidate.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));

  await assertResumeRowsUseStableCandidateShape(session);
  await assertTaskCandidatesUseWorkItemSourceGate(session);
  await assertLiveTimersContributeCandidates(session);
  await assertLiveTimersRespectTimerSourceGate(session);
  await assertSourcePermissionsFilterCandidates(session);

  console.log("Work candidate service regression passed.");
} finally {
  resetResumeStateReadResolvers();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}
/** @param {CandidateSession} session */
async function assertResumeRowsUseStableCandidateShape(session) {
  const taskId = `candidate-task-${randomUUID()}`;
  const sourceUrl = `tasks.html?task=${encodeURIComponent(taskId)}`;

  await workResumeStateService.upsertResumeState(session, {
    blockedReason: "Waiting for final estimate.",
    contextLabelSnapshot: "Client Alpha / Project Roadrunner",
    metadata: {
      body_markdown: "Hidden task body",
      nested: {
        checkpoint: "kept",
        secure_payload: "hidden",
      },
      safe_context: "visible",
    },
    moduleId: "tasks",
    nextAction: "Review the normalized candidate contract.",
    prioritySnapshot: "high",
    recordId: taskId,
    recordType: "task",
    resumeRankHint: 900,
    sourceUrl,
    title: "Normalized Candidate Task",
  });

  const result = await workCandidateService.listResumeCandidates(session, { limit: 100, mode: "recent" });
  const candidate = result.items.find((item) => item.recordId === taskId);

  assert.ok(candidate, "resume rows should normalize into work candidates");
  assert.deepEqual(Object.keys(candidate).sort(), stableCandidateKeys());
  assert.equal(candidate.moduleId, "tasks");
  assert.equal(candidate.recordType, "task");
  assert.equal(candidate.recordId, taskId);
  assert.equal(candidate.title, "Normalized Candidate Task");
  assert.equal(candidate.contextLabel, "Client Alpha / Project Roadrunner");
  assert.equal(candidate.reason, "Review the normalized candidate contract.");
  assert.ok(candidate.primaryAction, "a resume candidate should publish its primary action");
  assert.equal(candidate.primaryAction.href, sourceUrl);
  assert.equal(candidate.primaryAction.type, "link");
  assert.equal(candidate.sourceUrl, sourceUrl);
  assert.equal(candidate.priority, "high");
  assert.equal(candidate.blockedReason, "Waiting for final estimate.");
  assert.equal(candidate.rankHint, 900);
  assert.ok(candidate.metadata, "a resume candidate should publish its metadata");
  const nestedMetadata = requireJsonRecord(candidate.metadata.nested, "candidate nested metadata");
  assert.equal(Object.hasOwn(candidate.metadata, "body_markdown"), false, "candidate metadata must not carry note bodies");
  assert.equal(Object.hasOwn(nestedMetadata, "secure_payload"), false, "nested candidate metadata must not carry secure payloads");
  assert.equal(nestedMetadata.checkpoint, "kept");
}

/** @param {CandidateSession} session */
async function assertTaskCandidatesUseWorkItemSourceGate(session) {
  const taskId = `candidate-source-task-${randomUUID()}`;

  await workResumeStateService.upsertResumeState(session, {
    dueAtSnapshot: "2026-07-07",
    moduleId: "tasks",
    nextAction: "Use the existing task work item source.",
    recordId: taskId,
    recordType: "task",
    sourceUrl: `tasks.html?task=${encodeURIComponent(taskId)}`,
    title: "Task Source Candidate",
  });

  const enabledResult = await workCandidateService.listWorkCandidates(session, {
    limit: 100,
    moduleId: "tasks",
    recordType: "task",
  });

  assert.ok(
    enabledResult.items.some((candidate) => candidate.recordId === taskId),
    "task resume rows should contribute work candidates while the task work item source is active",
  );

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-07-07T15:10:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  const disabledResult = await workCandidateService.listWorkCandidates(session, {
    limit: 100,
    moduleId: "tasks",
    recordType: "task",
  });

  assert.equal(
    disabledResult.items.some((candidate) => candidate.recordId === taskId),
    false,
    "disabled task work item source should suppress task work candidates",
  );

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
}

/** @param {CandidateSession} session */
async function assertLiveTimersContributeCandidates(session) {
  const activeTimerId = `candidate-timer-${randomUUID()}`;

  await activeTimersRepository.upsert({
    accumulated_elapsed_seconds: 120,
    active_timer_id: activeTimerId,
    client_id: "",
    client_name: "",
    description: "Candidate manual timer",
    last_active_start_time: "2026-07-07T14:00:00.000Z",
    project_id: "",
    project_name: "",
    source_label: "Manual focus timer",
    source_url: "time-tracker.html",
    timer_slot: "42",
    timer_status: "running",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });

  const result = await workCandidateService.listWorkCandidates(session, {
    limit: 100,
    moduleId: "time-tracking",
    recordType: "active_work_timer",
  });
  const candidate = result.items.find((item) => item.recordId === activeTimerId);

  assert.ok(candidate, "running timers should contribute live work candidates");
  assert.equal(candidate.moduleId, "time-tracking");
  assert.equal(candidate.recordType, "active_work_timer");
  assert.equal(candidate.title, "Manual focus timer");
  assert.equal(candidate.reason, "Timer is running.");
  assert.ok(candidate.primaryAction, "a live timer candidate should publish its primary action");
  const timerActionPayload = requireJsonRecord(candidate.primaryAction.payload, "timer candidate action payload");
  assert.equal(candidate.primaryAction.id, "timer.pause");
  assert.equal(candidate.primaryAction.method, "POST");
  assert.equal(candidate.primaryAction.route, "/api/active-timers/42/pause");
  assert.equal(timerActionPayload.timer_status, "paused");
  assert.equal(candidate.sourceUrl, "time-tracker.html");
  assert.equal(candidate.rankHint, 1000);
  assert.ok(candidate.metadata, "a live timer candidate should publish its metadata");
  assert.equal(candidate.metadata.timer_slot, "42");
}

/** @param {CandidateSession} session */
async function assertLiveTimersRespectTimerSourceGate(session) {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-07-07T15:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'time-tracking';
`);

  const disabledResult = await workCandidateService.listWorkCandidates(session, {
    limit: 100,
    moduleId: "time-tracking",
    recordType: "active_work_timer",
  });

  assert.deepEqual(disabledResult.items, [], "disabled timer source should suppress live timer candidates");

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'time-tracking';
`);
}

/** @param {CandidateSession} session */
async function assertSourcePermissionsFilterCandidates(session) {
  const limitedSession = await createLimitedSession(session.workspace_id);
  const limitedTaskId = `candidate-permission-task-${randomUUID()}`;
  const limitedTimerId = `candidate-permission-timer-${randomUUID()}`;

  await workResumeStateService.upsertResumeState(limitedSession, {
    moduleId: "tasks",
    recordId: limitedTaskId,
    recordType: "task",
    sourceUrl: `tasks.html?task=${encodeURIComponent(limitedTaskId)}`,
    title: "Permission Filtered Task",
  });
  await activeTimersRepository.upsert({
    accumulated_elapsed_seconds: 60,
    active_timer_id: limitedTimerId,
    client_id: "",
    client_name: "",
    description: "Permission filtered timer",
    last_active_start_time: "2026-07-07T15:20:00.000Z",
    project_id: "",
    project_name: "",
    source_label: "Permission filtered timer",
    source_url: "time-tracker.html",
    timer_slot: "74",
    timer_status: "running",
    user_id: limitedSession.user_id,
    workspace_id: limitedSession.workspace_id,
  });

  const result = await workCandidateService.listWorkCandidates(limitedSession, { limit: 100 });

  assert.equal(
    result.items.some((candidate) => candidate.recordId === limitedTaskId || candidate.recordId === limitedTimerId),
    false,
    "candidate sources should honor contribution permissions for non-privileged sessions",
  );
}

function stableCandidateKeys() {
  return [
    "blockedReason",
    "candidateId",
    "clientId",
    "contextLabel",
    "createdAt",
    "dismissedAt",
    "dueAt",
    "handoffNote",
    "lastActionLabel",
    "lastActionType",
    "lastWorkedAt",
    "metadata",
    "moduleId",
    "nextAction",
    "primaryAction",
    "priority",
    "projectId",
    "rankHint",
    "reason",
    "recordId",
    "recordType",
    "resumeStateId",
    "sourceKind",
    "sourceUrl",
    "status",
    "title",
    "updatedAt",
  ].sort();
}

/** @param {string} workspaceId @returns {Promise<CandidateSession>} */
async function createLimitedSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, password, protected_user, active_workspace_id)
VALUES (${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(`${userId}@example.test`)}, 'Limited Candidate User', 'x', 'no', ${sqlText(workspaceId)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});
`);

  return workspaceSessionFixture({
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: userId,
    username: `${userId}@example.test`,
    workspace_id: workspaceId,
  });
}

/** @returns {Promise<CandidateSession>} */
async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture(user);
}
