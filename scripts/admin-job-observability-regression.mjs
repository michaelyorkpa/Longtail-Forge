/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-admin-job-observability-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-admin-job-observability.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Admin-Job-Observability-Test-123!";

import { requireRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} ObservabilityClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */
/** @typedef {import("../src/types/database-contracts.js").DatabaseRow} DatabaseRow */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks. That matters most here, because this owner exists to
 * prove the readouts do not leak job payloads.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown>} ObservabilityResponse
 */

/** @typedef {{ get: (url: string, options?: ObservabilityClientOptions) => Promise<ObservabilityResponse> }} ObservabilityApiClient */

/** Both routes publish their service results unchanged. */
/** @typedef {{ jobs: Awaited<ReturnType<typeof import("../src/services/jobs.service.js").jobsService.readAdminReadout>> }} JobsReadoutEnvelope */
/** The worker status fields this owner asserts on, from the shape runtime diagnostics publishes. */
/**
 * @typedef {{
 *   diagnostics: {
 *     worker: {
 *       mode: string,
 *       status: {
 *         lastErrorAt: string | null,
 *         lastRunAt: string | null,
 *         lastSuccessAt: string | null,
 *         lockTtlSeconds: number,
 *         pollIntervalMs: number,
 *         registeredJobTypes: string[],
 *         running: boolean,
 *         state: string,
 *         timerActive: boolean,
 *         workerId: string | null,
 *       },
 *     },
 *   },
 * }} RuntimeDiagnosticsEnvelope
 */

/** @typedef {Awaited<ReturnType<typeof seedFixtures>>} ObservabilityFixtures */

/** The columns insertJob writes; every one is a column this owner controls. */
/**
 * @typedef {{
 *   attemptCount?: number,
 *   availableAt?: string,
 *   completedAt?: string | null,
 *   createdAt?: string,
 *   deadAt?: string | null,
 *   dedupeKey?: string | null,
 *   jobId: string,
 *   jobType?: string,
 *   lastError?: string | null,
 *   lockedAt?: string | null,
 *   lockedBy?: string | null,
 *   maxAttempts?: number,
 *   payload?: unknown,
 *   priority?: number,
 *   status?: string,
 *   updatedAt?: string,
 * }} InsertJobOptions
 */
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const workspaceSettingsView = readText("views/protected/workspace-settings.html");
const settingsHostScript = readText("public/js/shared/settings-host.js");
const workspaceSettingsScript = readText("public/js/workspace-settings.js");
const styles = readText("public/css/longtail-forge.css");
const jobsRouteSource = readText("src/routes/jobs.routes.js");
const jobsServiceSource = readText("src/services/jobs.service.js");
const runtimeDiagnosticsSource = readText("src/services/runtime-diagnostics.service.js");

const { createApp } = await import("../src/core/app.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;
let workspaceId = "";

try {
  assertStaticContract();

  await initializeDatabase();
  const fixtures = await seedFixtures();
  workspaceId = String(fixtures.workspaceId);
  await seedJobs();

  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  await assertJobsAdminReadout(api, fixtures);
  await assertRuntimeDiagnosticsReadout(api, fixtures);
  await assertIntegrity();

  console.log("Admin job observability regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

  assert.match(workspaceSettingsView, /data-settings-host="workspace"/, "Workspace Settings should expose the minimal framework host");
  assert.match(settingsHostScript, /jobObservabilityFieldset/, "Workspace Settings should include a Jobs readout fieldset");
  assert.match(settingsHostScript, /jobObservabilitySummary/, "Workspace Settings should include a Jobs summary target");
  assert.match(settingsHostScript, /jobObservabilityFailures/, "Workspace Settings should include a recent failures target");
  assert.match(settingsHostScript, /jobObservabilityMore/, "Workspace Settings should include a bounded pagination load-more control");
  assert.match(workspaceSettingsView, /js\/workspace-settings\.js/, "Workspace Settings should bump its script cache key");

  assert.match(workspaceSettingsScript, /loadJobObservability\(\)/, "Workspace Settings should load job observability separately");
  assert.match(workspaceSettingsScript, /\/api\/jobs\/status\?\$\{params\.toString\(\)\}/, "Workspace Settings should consume the protected jobs route");
  assert.match(workspaceSettingsScript, /JOB_FAILURE_PAGE_SIZE = 5/, "Jobs UI should request a bounded recent-failure page");
  assert.match(workspaceSettingsScript, /pagination\.nextCursor/, "Jobs UI should consume the bounded pagination cursor");
  assert.match(workspaceSettingsScript, /Pending[\s\S]*Running[\s\S]*Failed[\s\S]*Dead-letter/, "Jobs UI should render queue counts");
  assert.match(workspaceSettingsScript, /Worker Last Poll[\s\S]*Worker Last Success[\s\S]*Worker Completed[\s\S]*Registered Job Types/, "Runtime Diagnostics should render worker health details");
  assert.doesNotMatch(workspaceSettingsScript, /payload_json|dedupe_key|dedupeKey|storageKey|signedUrl|localRoot|CLAMD|CLAMSCAN|masterKey|process\.env/i, "admin UI must not expose sensitive job/runtime internals");

  assert.match(styles, /\.job-observability-readout/, "styles should cover the Jobs readout fieldset");
  assert.match(styles, /\.job-observability-row/, "styles should cover recent failure rows");
  assert.match(jobsRouteSource, /jobsRoutes\.get\("\/jobs\/status"/, "jobs route should remain the protected admin readout source");
  assert.match(jobsServiceSource, /boundedPaginationEnvelope/, "jobs service should return the shared bounded pagination envelope");
  assert.doesNotMatch(jobsServiceSource, /payload_json|dedupe_key/, "jobs service must not expose job payloads or dedupe keys");
  assert.match(runtimeDiagnosticsSource, /lastRunAt[\s\S]*lastSuccessAt/, "runtime diagnostics should include worker health timestamps");
  assert.doesNotMatch(runtimeDiagnosticsSource, /payload_json|dedupe_key|process\.env|storageKey|signedUrl|clamdHost|clamscanPath|masterKey/i, "runtime diagnostics must not expose sensitive internals");

  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.7\.5[\s\S]*admin job observability/, "database docs should document admin job observability");
  assert.match(runtimeDocs, /Jobs Admin Readout[\s\S]*Workspace Settings[\s\S]*recent failures/, "runtime docs should document the admin jobs readout placement");
}

/** @param {ObservabilityApiClient} api @param {ObservabilityFixtures} fixtures */
async function assertJobsAdminReadout(api, fixtures) {
  const unauthenticated = await api.get("/api/jobs/status");
  assert.equal(unauthenticated.status, 401, "jobs status should require login");

  const forbidden = await api.get("/api/jobs/status", { cookie: fixtures.unprivilegedSessionId });
  assert.equal(forbidden.status, 403, "jobs status should require workspace_settings.manage");

  const firstPage = await api.get("/api/jobs/status?limit=1", { cookie: fixtures.adminSessionId });
  assert.equal(firstPage.status, 200, "workspace settings managers should read job status");
  assert.equal(firstPage.headers.get("cache-control"), "no-store");
  /** @type {JobsReadoutEnvelope} */
  const firstPagePayload = readPayload(firstPage, ["jobs"], "GET /api/jobs/status");
  assert.deepEqual(firstPagePayload.jobs.counts, {
    dead: 1,
    failed: 1,
    pending: 1,
    running: 1,
  });
  assert.equal(firstPagePayload.jobs.recentFailures.items.length, 1);
  assert.equal(firstPagePayload.jobs.recentFailures.pagination.limit, 1);
  assert.equal(firstPagePayload.jobs.recentFailures.pagination.maxPageSize, 50);
  assert.equal(firstPagePayload.jobs.recentFailures.pagination.hasMore, true);
  assert.ok(firstPagePayload.jobs.recentFailures.pagination.nextCursor, "first failures page should include a next cursor");

  const secondPage = await api.get(`/api/jobs/status?limit=1&cursor=${encodeURIComponent(firstPagePayload.jobs.recentFailures.pagination.nextCursor)}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(secondPage.status, 200);
  /** @type {JobsReadoutEnvelope} */
  const secondPagePayload = readPayload(secondPage, ["jobs"], "GET /api/jobs/status");
  assert.equal(secondPagePayload.jobs.recentFailures.items.length, 1);
  assert.equal(secondPagePayload.jobs.recentFailures.pagination.hasMore, false);

  const serialized = JSON.stringify(firstPagePayload.jobs) + JSON.stringify(secondPagePayload.jobs);
  assert.doesNotMatch(serialized, /payload|dedupe|storageKey|signedUrl|scanner|Admin-Job-Observability-Test/i, "jobs readout should not expose sensitive job/runtime internals");
}

/** @param {ObservabilityApiClient} api @param {ObservabilityFixtures} fixtures */
async function assertRuntimeDiagnosticsReadout(api, fixtures) {
  const diagnosticsResponse = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(diagnosticsResponse.status, 200, "workspace settings managers should read runtime diagnostics");

  /** @type {RuntimeDiagnosticsEnvelope} */
  const diagnostics = readPayload(diagnosticsResponse, ["diagnostics"], "GET /api/runtime-diagnostics");
  const workerStatus = diagnostics.diagnostics.worker.status;
  assert.equal(diagnostics.diagnostics.worker.mode, "disabled");
  assert.equal(workerStatus.state, "disabled");
  assert.equal(workerStatus.timerActive, false);
  assert.equal(workerStatus.pollIntervalMs, 5000);
  assert.equal(workerStatus.lockTtlSeconds, 300);
  assert.equal(workerStatus.lastRunAt, null);
  assert.equal(workerStatus.lastSuccessAt, null);
  assert.ok(Array.isArray(workerStatus.registeredJobTypes), "worker status should include registered job types");

  const serialized = JSON.stringify(diagnostics.diagnostics);
  assert.doesNotMatch(serialized, /payload|dedupe|storageKey|signedUrl|Admin-Job-Observability-Test|LONGTAIL_DATABASE_FILE|CLAMD|CLAMSCAN|masterKey/i, "runtime diagnostics should remain redacted");
}

async function seedFixtures() {
  /** @type {{ active_workspace_id: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const admin = requireRow(await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`), "protected admin");
  assert.ok(admin.user_id, "fresh database should seed a protected admin");

  const workspace = admin.active_workspace_id || admin.home_workspace_id;
  const unprivilegedUser = {
    userId: `job-observability-user-${randomUUID()}`,
    username: `job-observability-${randomUUID()}@example.test`,
  };
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  :userId,
  :workspaceId,
  :username,
  :displayName,
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  :workspaceId
);
`, {
    displayName: unprivilegedUser.username,
    userId: unprivilegedUser.userId,
    username: unprivilegedUser.username,
    workspaceId: workspace,
  });

  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  :membershipId,
  :userId,
  :workspaceId,
  'active',
  :now,
  :now
);
`, {
    membershipId: randomUUID(),
    now,
    userId: unprivilegedUser.userId,
    workspaceId: workspace,
  });

  return {
    adminSessionId: (await createSession({
      active_workspace_id: workspace,
      home_workspace_id: admin.home_workspace_id,
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
    })).sessionId,
    unprivilegedSessionId: (await createSession({
      active_workspace_id: workspace,
      home_workspace_id: workspace,
      timezone: "America/New_York",
      user_id: unprivilegedUser.userId,
      username: unprivilegedUser.username,
    })).sessionId,
    workspaceId: workspace,
  };
}

async function seedJobs() {
  await insertJob({
    jobId: "observability-pending",
    jobType: "search.index",
    status: "pending",
  });
  await insertJob({
    jobId: "observability-running",
    jobType: "file.scan",
    lockedAt: new Date().toISOString(),
    lockedBy: "observability-worker",
    status: "running",
  });
  await insertJob({
    jobId: "observability-failed",
    jobType: "notification.event",
    lastError: "Recipient lookup failed safely.",
    status: "failed",
    updatedAt: new Date(Date.now() - 1000).toISOString(),
  });
  await insertJob({
    deadAt: new Date().toISOString(),
    jobId: "observability-dead",
    jobType: "task.reminder",
    lastError: "Reminder retry budget exhausted.",
    status: "dead",
  });
}

/** @param {InsertJobOptions} options */
async function insertJob(options) {
  const now = new Date().toISOString();
  const status = options.status || "pending";

  await db.run(`
INSERT INTO jobs (
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
  payload_json,
  status,
  priority,
  available_at,
  attempt_count,
  max_attempts,
  locked_at,
  locked_by,
  last_error,
  created_at,
  updated_at,
  completed_at,
  dead_at
)
VALUES (
  :jobId,
  :workspaceId,
  :jobType,
  :dedupeKey,
  :payloadJson,
  :status,
  0,
  :availableAt,
  :attemptCount,
  3,
  :lockedAt,
  :lockedBy,
  :lastError,
  :createdAt,
  :updatedAt,
  NULL,
  :deadAt
);
`, {
    attemptCount: status === "running" ? 1 : status === "dead" ? 3 : status === "failed" ? 1 : 0,
    availableAt: options.availableAt || now,
    createdAt: options.createdAt || now,
    deadAt: options.deadAt || null,
    dedupeKey: `dedupe:${options.jobId}`,
    jobId: options.jobId,
    jobType: options.jobType || "observability.test",
    lastError: options.lastError || null,
    lockedAt: options.lockedAt || null,
    lockedBy: options.lockedBy || null,
    payloadJson: JSON.stringify({ hidden: "payload should not be exposed" }),
    status,
    updatedAt: options.updatedAt || now,
    workspaceId,
  });
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "admin job observability regression database should pass integrity check");
}

/** @param {string} baseUrl @returns {ObservabilityApiClient} */
function createApi(baseUrl) {
  return {
    /** @param {string} url @param {ObservabilityClientOptions} [options] @returns {Promise<ObservabilityResponse>} */
    async get(url, options = {}) {
      /** @type {Record<string, string>} */
      const headers = {};
      if (options.cookie) {
        headers.Cookie = `longtail_forge_session=${options.cookie}`;
      }

      const response = await fetch(`${baseUrl}${url}`, { headers });
      const text = await response.text();
      return {
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
        status: response.status,
      };
    },
  };
}

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {HttpFixtureServer} serverInstance @returns {Promise<void>} */
function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    });
  });
}
