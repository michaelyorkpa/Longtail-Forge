import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-candidate-service-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-candidate-service.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Candidate-Service-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const { workCandidateService, normalizeWorkCandidate } = await import("../src/services/work-candidate.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));

  await assertDirectNormalizationScrubsUnsafeFields();
  await assertResumeRowsUseStableCandidateShape(session);
  await assertLiveTimersContributeCandidates(session);
  await assertLiveTimersRespectTimerSourceGate(session);

  console.log("Work candidate service regression passed.");
} finally {
  resetResumeStateReadResolvers();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertDirectNormalizationScrubsUnsafeFields() {
  const candidate = normalizeWorkCandidate({
    bodyHtml: "<p>hidden</p>",
    contextLabel: "Client Alpha / Project Roadrunner",
    metadata: {
      body_markdown: "Hidden body",
      nested: {
        safe: "kept",
        storage_key: "hidden/key",
      },
      safe_context: "visible",
    },
    moduleId: "tasks",
    primaryAction: {
      id: "unsafe.open",
      label: "Open work",
      method: "DELETE",
      payload: {
        body: "hidden",
        safe: "kept",
        scanner_status: "hidden",
      },
      route: "javascript:alert(1)",
      type: "route",
    },
    reason: "Review the safe candidate.",
    recordId: "candidate-task-1",
    recordType: "task",
    sourceUrl: "javascript:alert(1)",
    storage_key: "hidden/key",
    title: "Candidate Task",
  });

  assert.equal(candidate.sourceUrl, "");
  assert.equal(candidate.primaryAction.route, "");
  assert.equal(candidate.primaryAction.method, "GET");
  assert.equal(candidate.primaryAction.payload.body, undefined);
  assert.equal(candidate.primaryAction.payload.scanner_status, undefined);
  assert.equal(candidate.primaryAction.payload.safe, "kept");
  assert.equal(candidate.metadata.body_markdown, undefined);
  assert.equal(candidate.metadata.nested.storage_key, undefined);
  assert.equal(candidate.metadata.nested.safe, "kept");
  assert.equal(candidate.metadata.safe_context, "visible");
  assert.equal(candidate.title, "Candidate Task");
  assert.equal(candidate.contextLabel, "Client Alpha / Project Roadrunner");
}

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
  assert.equal(candidate.primaryAction.href, sourceUrl);
  assert.equal(candidate.primaryAction.type, "link");
  assert.equal(candidate.sourceUrl, sourceUrl);
  assert.equal(candidate.priority, "high");
  assert.equal(candidate.blockedReason, "Waiting for final estimate.");
  assert.equal(candidate.rankHint, 900);
  assert.equal(candidate.metadata.body_markdown, undefined);
  assert.equal(candidate.metadata.nested.secure_payload, undefined);
  assert.equal(candidate.metadata.nested.checkpoint, "kept");
}

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
  assert.equal(candidate.primaryAction.id, "timer.pause");
  assert.equal(candidate.primaryAction.method, "POST");
  assert.equal(candidate.primaryAction.route, "/api/active-timers/42/pause");
  assert.equal(candidate.primaryAction.payload.timer_status, "paused");
  assert.equal(candidate.sourceUrl, "time-tracker.html");
  assert.equal(candidate.rankHint, 1000);
  assert.equal(candidate.metadata.timer_slot, "42");
}

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

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

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
