import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-performance-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-performance-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Performance-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { settingsService } = await import("../src/services/settings.service.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { reportingService } = await import("../src/services/reporting.service.js");

try {
  await initializeDatabase();
  const session = await createTestSession();
  const databaseReadMs = await measureDatabaseReadOverhead();
  const serviceTimings = {
    settings: await measureMedian(() => settingsService.read(session)),
    clientProjects: await measureMedian(() => clientsService.readClientProjects(session)),
    tasks: await measureMedian(() => tasksService.list(session)),
    reportingBootstrap: await measureMedian(() => reportingService.readReportingBootstrap(session)),
    dashboard: await measureMedian(() => reportingService.readDashboard(session)),
  };
  const integrity = await querySql("PRAGMA integrity_check;");

  assert.equal(integrity[0]?.integrity_check, "ok");
  assert.ok(databaseReadMs < 100, `50 database reads should stay under 100 ms, got ${databaseReadMs.toFixed(2)} ms`);
  assert.ok(serviceTimings.settings < 75, `settingsService.read exceeded threshold: ${serviceTimings.settings.toFixed(2)} ms`);
  assert.ok(serviceTimings.clientProjects < 125, `clientsService.readClientProjects exceeded threshold: ${serviceTimings.clientProjects.toFixed(2)} ms`);
  assert.ok(serviceTimings.tasks < 175, `tasksService.list exceeded threshold: ${serviceTimings.tasks.toFixed(2)} ms`);
  assert.ok(serviceTimings.reportingBootstrap < 175, `reportingService.readReportingBootstrap exceeded threshold: ${serviceTimings.reportingBootstrap.toFixed(2)} ms`);
  assert.ok(serviceTimings.dashboard < 300, `reportingService.readDashboard exceeded threshold: ${serviceTimings.dashboard.toFixed(2)} ms`);

  console.log("Performance regression passed.", JSON.stringify({
    databaseReadMs: Number(databaseReadMs.toFixed(2)),
    serviceTimings: Object.fromEntries(
      Object.entries(serviceTimings).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
  }));
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createTestSession() {
  const users = await querySql(`
SELECT user_id, home_workspace_id, active_workspace_id, username, timezone
FROM users
ORDER BY protected_user DESC, username
LIMIT 1;
`);
  const user = users[0];
  const session = await createSession({
    ...user,
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
  });

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    session_id: session.sessionId,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function measureDatabaseReadOverhead() {
  const start = performance.now();

  for (let index = 0; index < 50; index += 1) {
    await querySql("SELECT 1 AS ok;");
  }

  return performance.now() - start;
}

async function measureMedian(fn, iterations = 5) {
  const samples = [];

  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }

  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)];
}
