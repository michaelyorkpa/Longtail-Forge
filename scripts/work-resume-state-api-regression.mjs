/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-api-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-api.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Api-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");
const {
  resetInitialResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-initial-producers.js");
const {
  resetResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-producers.js");
const {
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");

let server;

try {
  await initializeDatabase();
  const app = createApp();
  const fixture = await seedFixture();
  server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl, fixture.sessionId);

  await assertProtectedRouteRequiresAuth(baseUrl);
  await assertPublicApiRouteIsNotExposed(baseUrl);
  await assertReadRouteReturnsBrowserSafeRows(api, fixture);
  await assertFiltersAndActiveMode(api, fixture);
  await assertDismissRouteHidesDefaultRows(api, fixture);
  await assertEmptyStateIsGeneric(api);

  console.log("Work resume state API regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  resetInitialResumeStateProducersForTests();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixture() {
  const session = await readSeedSession();
  const sessionId = await createSession(session);
  const taskId = `resume-api-task-${randomUUID()}`;
  const hiddenTaskId = `resume-api-filtered-task-${randomUUID()}`;
  const activeTimerId = `resume-api-timer-${randomUUID()}`;

  await tasksService.create({
    next_action: "Use the browser resume API.",
    priority: "high",
    task_id: taskId,
    title: "Resume API Task",
  }, session);
  await tasksService.create({
    task_id: hiddenTaskId,
    title: "Other Resume API Task",
  }, session);
  await activeTimersRepository.upsert({
    active_timer_id: activeTimerId,
    accumulated_elapsed_seconds: 60,
    client_id: "",
    description: "Resume API manual timer",
    last_active_start_time: "2026-06-13T19:00:00.000Z",
    project_id: "",
    timer_slot: "7",
    timer_status: "running",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });
  await workResumeStateService.upsertResumeState(session, {
    lastActionType: "timer.started",
    moduleId: "time-tracking",
    recordId: activeTimerId,
    recordType: "active_work_timer",
    statusSnapshot: "active",
    title: "Resume API manual timer",
  });

  return {
    activeTimerId,
    hiddenTaskId,
    session,
    sessionId,
    taskId,
  };
}

async function assertProtectedRouteRequiresAuth(baseUrl) {
  const response = await fetch(`${baseUrl}/api/work-resume`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "Login required.");
}

async function assertPublicApiRouteIsNotExposed(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/work-resume`);

  assert.notEqual(response.status, 200, "resume state must not be exposed through public API routes");
}

async function assertReadRouteReturnsBrowserSafeRows(api, fixture) {
  const response = await api.get("/api/work-resume?mode=recent&limit=50");

  assert.equal(response.status, 200);
  assert.equal(response.body.mode, "recent");
  assert.equal(response.body.emptyState.message, "No resumable work found.");

  const task = response.body.items.find((item) => item.recordId === fixture.taskId);
  assert.ok(task, "read route should include the seeded task resume row");
  assert.equal(task.moduleId, "tasks");
  assert.equal(task.recordType, "task");
  assert.equal(task.title, "Resume API Task");
  assert.equal(task.nextAction, "Use the browser resume API.");
  assert.equal(task.resumeStateId.length > 0, true);
  assert.equal(task.resume_state_id, undefined, "browser response should not expose raw snake_case fields");
}

async function assertFiltersAndActiveMode(api, fixture) {
  const tasksResponse = await api.get("/api/work-resume?mode=recent&module_id=tasks&record_type=task&limit=50");
  assert.equal(tasksResponse.status, 200);
  assert.ok(tasksResponse.body.items.some((item) => item.recordId === fixture.taskId));
  assert.equal(tasksResponse.body.items.every((item) => item.moduleId === "tasks" && item.recordType === "task"), true);

  const activeResponse = await api.get("/api/work-resume?mode=active&limit=50");
  assert.equal(activeResponse.status, 200);
  assert.ok(activeResponse.body.items.some((item) => item.recordId === fixture.activeTimerId));
  assert.equal(activeResponse.body.items.some((item) => item.recordId === fixture.hiddenTaskId), false);
}

async function assertDismissRouteHidesDefaultRows(api, fixture) {
  const recentResponse = await api.get("/api/work-resume?mode=recent&limit=50");
  const task = recentResponse.body.items.find((item) => item.recordId === fixture.taskId);
  assert.ok(task);

  const dismissResponse = await api.post(`/api/work-resume/${encodeURIComponent(task.resumeStateId)}/dismiss`);
  assert.equal(dismissResponse.status, 200);
  assert.equal(dismissResponse.body.dismissed, true);
  assert.equal(dismissResponse.body.resumeStateId, task.resumeStateId);

  const leftOffResponse = await api.get("/api/work-resume?mode=left_off&limit=50");
  assert.equal(leftOffResponse.status, 200);
  assert.equal(leftOffResponse.body.items.some((item) => item.recordId === fixture.taskId), false);

  const recentAfterDismiss = await api.get("/api/work-resume?mode=recent&limit=50");
  assert.equal(recentAfterDismiss.body.items.some((item) => item.recordId === fixture.taskId), true);
}

async function assertEmptyStateIsGeneric(api) {
  const response = await api.get(`/api/work-resume?module_id=notes&record_type=note&client_id=${encodeURIComponent(`missing-${randomUUID()}`)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items, []);
  assert.equal(response.body.emptyState.message, "No resumable work found.");
}

function createApi(baseUrl, sessionId) {
  return {
    get: (url) => request(baseUrl, url, { sessionId }),
    post: (url) => request(baseUrl, url, { method: "POST", sessionId }),
  };
}

async function request(baseUrl, url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: options.method || "GET",
    headers: {
      Cookie: `longtail_forge_session=${options.sessionId}`,
    },
  });
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
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
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function createSession(session) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(sessionId)},
  ${sqlText(session.home_workspace_id)},
  ${sqlText(session.workspace_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.username)},
  ${sqlText(session.timezone)},
  ${sqlText(expiresAt)},
  ${sqlText(now)},
  ${sqlText(now)}
);`);

  return sessionId;
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(nextServer) {
  return new Promise((resolve, reject) => {
    nextServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
