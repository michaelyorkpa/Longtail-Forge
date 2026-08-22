export const regressionMeta = Object.freeze({
  id: "tasks.task-estimate-minutes",
  area: "tasks",
  tier: "focused",
  tags: ["api", "contracts", "editor", "migration", "recurrence", "tasks"],
  description: "Proves nullable quarter-hour Task estimates across storage constraints, service and public API payloads, the canonical editor duplicate flow, read models, and recurrence materialization.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readPayload } from "../../test-support/http-payload-assertions.mjs";
import { requireRow } from "../../test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
/** @typedef {{ data: { estimate_minutes: unknown, task_id: unknown } }} EstimateRecordPayload */
/** @typedef {{ data: { task_id: unknown, estimate_minutes: unknown }[] }} EstimateListPayload */
/** @typedef {{ error: { message: unknown } }} EstimateErrorPayload */
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-estimate-minutes-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "task-estimate-minutes.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Estimate-Minutes-Test-123!";

const [contractsSource, dialogSource, migrationSource, recurrenceServiceSource] = await Promise.all([
  readText("src/modules/tasks/tasks.contracts.js"),
  readText("public/js/task-dialog.js"),
  readText("src/db/migrations/081_task_estimate_minutes.sql"),
  readText("src/modules/tasks/task-recurrence.service.js"),
]);

const { createApp } = await import("../../../src/core/app.js");
const { db } = await import("../../../src/core/database.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { apiKeysService } = await import("../../../src/services/api-keys.service.js");
const { taskRecurrenceRepository } = await import("../../../src/modules/tasks/task-recurrence.repo.js");
const { taskRecurrenceService } = await import("../../../src/modules/tasks/task-recurrence.service.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

/** @type {import("node:http").Server | undefined} */
let server;

try {
  assertStaticContract();
  await initializeDatabase();
  const session = await readSeedSession();

  await assertSchemaContract();
  await assertServiceRoundTrips(session);
  await assertRecurrencePreservation(session);

  const apiKey = await apiKeysService.create({
    name: "Task estimate regression",
    scopes: ["tasks:read", "tasks:write"],
  }, session);
  server = await listen(createApp());
  const listeningServer = server;
  assert.ok(listeningServer, "the public API fixture server should be listening");
  const address = listeningServer.address();
  assert.ok(address && typeof address === "object", "the public API fixture server should bind a TCP port");
  await assertPublicApiRoundTrips(`http://127.0.0.1:${address.port}`, apiKey.rawKey);

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");
  console.log("Task estimate minutes regression passed.");
} finally {
  if (server) {
    const listening = server;
    await new Promise((resolve) => listening.close(() => resolve(undefined)));
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.match(migrationSource, /ALTER TABLE tasks[\s\S]*ADD COLUMN estimate_minutes INTEGER[\s\S]*estimate_minutes % 15 = 0/);
  assert.match(migrationSource, /ALTER TABLE task_recurrence_templates[\s\S]*ADD COLUMN estimate_minutes INTEGER[\s\S]*estimate_minutes % 15 = 0/);
  assert.match(contractsSource, /estimate_minutes: optionalNullableNumberInput\("Estimate minutes"\)/);
  assert.match(dialogSource, /data-task-estimate-minutes/);
  assert.match(dialogSource, /taskEditorInput\(view, "number", \{[\s\S]*min: "0"[\s\S]*step: "15"/);
  assert.match(dialogSource, /fields\.estimate\.value = task\?\.estimate_minutes \?\?/,
    "duplicate mode should hydrate the source Task estimate through the canonical editor");
  assert.match(dialogSource, /estimate_minutes: fields\.estimate\.value === "" \? null : Number\(fields\.estimate\.value\)/);
  assert.match(recurrenceServiceSource, /estimate_minutes: task\.estimate_minutes/);
  assert.match(recurrenceServiceSource, /estimate_minutes: template\.estimate_minutes/);
}

async function assertSchemaContract() {
  const taskColumns = await querySql("PRAGMA table_info(tasks);");
  const templateColumns = await querySql("PRAGMA table_info(task_recurrence_templates);");
  assert.ok(taskColumns.some((column) => column.name === "estimate_minutes"));
  assert.ok(templateColumns.some((column) => column.name === "estimate_minutes"));

  const schemaRows = await querySql(`
SELECT name, sql
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('tasks', 'task_recurrence_templates')
ORDER BY name;
`);
  assert.equal(schemaRows.length, 2);
  for (const row of schemaRows) {
    assert.match(String(row.sql), /estimate_minutes INTEGER[\s\S]*estimate_minutes >= 0[\s\S]*estimate_minutes % 15 = 0/);
  }
}

/** @param {TasksSession} session */
async function assertServiceRoundTrips(session) {
  const blank = (await tasksService.create({ title: "No estimate" }, session)).task;
  assert.equal(blank.estimate_minutes, null);

  const zero = (await tasksService.create({ estimate_minutes: 0, title: "Zero estimate" }, session)).task;
  assert.equal(zero.estimate_minutes, 0);

  const estimated = (await tasksService.create({ estimate_minutes: "45", title: "Estimated task" }, session)).task;
  assert.equal(estimated.estimate_minutes, 45);

  const read = (await tasksService.read(estimated.task_id, session)).task;
  assert.equal(read.estimate_minutes, 45);

  const listed = await tasksService.listAll(session);
  assert.equal(listed.tasks.find((task) => task.task_id === estimated.task_id)?.estimate_minutes, 45);

  const workItems = await tasksService.listWorkbenchItems(session);
  assert.equal(workItems.items.find((task) => task.task_id === estimated.task_id)?.estimate_minutes, 45);

  const updated = (await tasksService.update(estimated.task_id, { estimate_minutes: 90 }, session)).task;
  assert.equal(updated.estimate_minutes, 90);

  const cleared = (await tasksService.update(estimated.task_id, { estimate_minutes: null }, session)).task;
  assert.equal(cleared.estimate_minutes, null);

  for (const invalid of [-15, 1, 14, 16, 22.5, "not-a-duration"]) {
    await assert.rejects(
      tasksService.create({ estimate_minutes: invalid, title: `Invalid estimate ${invalid}` }, session),
      (error) => rejectionStatus(error) === 400 && /multiple of 15 minutes/.test(rejectionMessage(error)),
    );
  }

  await assert.rejects(
    db.run(`
UPDATE tasks
SET estimate_minutes = :estimateMinutes
WHERE workspace_id = :workspaceId
  AND task_id = :taskId;
`, {
      estimateMinutes: 10,
      taskId: zero.task_id,
      workspaceId: session.workspace_id,
    }),
    /CHECK constraint failed/,
    "storage should reject values that bypass service validation",
  );
}

/** @param {TasksSession} session */
async function assertRecurrencePreservation(session) {
  const recurring = (await tasksService.create({
    due_date: "2026-07-22",
    estimate_minutes: 30,
    recurrence: {
      enabled: true,
      endDate: "2026-07-31",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Estimated recurring task",
  }, session)).task;

  let template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, recurring.recurrence_template_id);
  assert.ok(template, "created recurrence template should remain readable");
  assert.equal(template.estimate_minutes, 30);

  const updated = (await tasksService.update(recurring.task_id, {
    estimate_minutes: 75,
    recurrence: {
      applyTo: "future",
      enabled: true,
      endDate: "2026-07-31",
      frequency: "DAILY",
      interval: 1,
    },
  }, session)).task;
  assert.equal(updated.estimate_minutes, 75);

  template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, recurring.recurrence_template_id);
  assert.ok(template, "updated recurrence template should remain readable");
  assert.equal(template.estimate_minutes, 75);

  const next = await taskRecurrenceService.createNextInstance({
    session,
    completedTask: updated,
    createTask: {
      findExisting: (templateId, instanceDate) => tasksRepository.readByRecurrenceInstance(
        session.workspace_id,
        templateId,
        instanceDate,
      ),
      create: (task) => tasksRepository.create(session.workspace_id, {
        ...task,
        created_by_user_id: session.user_id,
        updated_by_user_id: session.user_id,
      }),
    },
  });
  assert.ok(next, "materializing the next recurrence occurrence should return a result");
  assert.equal(next.wasCreated, true);
  assert.equal(next.task.estimate_minutes, 75);
}

/** @param {string} baseUrl @param {string} rawKey */
async function assertPublicApiRoundTrips(baseUrl, rawKey) {
  const created = await apiRequest(baseUrl, "/api/v1/tasks", {
    body: { estimate_minutes: 30, title: "Public API estimated task" },
    method: "POST",
    rawKey,
  });
  assert.equal(created.status, 201);
  assert.equal(/** @type {EstimateRecordPayload} */ (readPayload(created, ["data"], "public API create")).data.estimate_minutes, 30);

  const taskId = String(/** @type {EstimateRecordPayload} */ (readPayload(created, ["data"], "public API create")).data.task_id);
  const updated = await apiRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    body: { estimate_minutes: 60 },
    method: "PUT",
    rawKey,
  });
  assert.equal(updated.status, 200);
  assert.equal(/** @type {EstimateRecordPayload} */ (readPayload(updated, ["data"], "public API update")).data.estimate_minutes, 60);

  const read = await apiRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(taskId)}`, { rawKey });
  assert.equal(read.status, 200);
  assert.equal(/** @type {EstimateRecordPayload} */ (readPayload(read, ["data"], "public API read")).data.estimate_minutes, 60);

  const listed = await apiRequest(baseUrl, "/api/v1/tasks", { rawKey });
  assert.equal(listed.status, 200);
  const listedTasks = /** @type {EstimateListPayload} */ (readPayload(listed, ["data"], "public API list")).data;
  assert.ok(Array.isArray(listedTasks), "the public API list payload should carry an array of tasks");
  assert.equal(listedTasks.find((task) => task.task_id === taskId)?.estimate_minutes, 60);

  const invalid = await apiRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    body: { estimate_minutes: 10 },
    method: "PUT",
    rawKey,
  });
  assert.equal(invalid.status, 400);
  assert.match(String(/** @type {EstimateErrorPayload} */ (readPayload(invalid, ["error"], "public API rejection")).error.message), /multiple of 15 minutes/);

  const cleared = await apiRequest(baseUrl, `/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    body: { estimate_minutes: null },
    method: "PUT",
    rawKey,
  });
  assert.equal(cleared.status, 200);
  assert.equal(/** @type {EstimateRecordPayload} */ (readPayload(cleared, ["data"], "public API clear")).data.estimate_minutes, null);
}

/** @param {string} baseUrl @param {string} route @param {{ body?: unknown, method?: string, rawKey?: string }} [options] @returns {Promise<{ body: unknown, status: number }>} */
async function apiRequest(baseUrl, route, { body, method = "GET", rawKey } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      authorization: `Bearer ${rawKey}`,
    },
    method,
  });
  const text = await response.text();
  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
}

/** @param {import("node:http").Server | { listen: (port: number, host: string, callback: () => void) => import("node:http").Server }} app */
async function listen(app) {
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
    nextServer.on("error", reject);
  });
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];
  return workspaceSessionFixture(requireRow(user, "fresh database should seed a protected super admin"));
}

/**
 * Read the HTTP status a rejected service call carries, proving the value
 * really is an error object first. A rejection without a numeric status
 * resolves to -1 so the predicate fails rather than passing vacuously.
 * @param {unknown} error
 * @returns {number}
 */
function rejectionStatus(error) {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return -1;
  const status = /** @type {{ statusCode: unknown }} */ (error).statusCode;
  return typeof status === "number" ? status : -1;
}

/**
 * Read a rejected service call's message as text without assuming a shape.
 * @param {unknown} error
 * @returns {string}
 */
function rejectionMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
