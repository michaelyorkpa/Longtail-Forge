export const regressionMeta = Object.freeze({
  id: "framework.operational-security-basics",
  area: "framework",
  tier: "integration",
  tags: ["health", "logging", "production", "security", "startup"],
  description: "Proves secret-free JSON production logs, server-generated request correlation, minimal health/readiness responses, and fail-closed readiness checks.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import express from "express";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("operational-security-basics");
const secretMarker = "never-log-this-password-or-token";
const {
  createOperationalLogger,
  createRequestLoggingMiddleware,
  installProductionConsoleBridge,
} = await import("../../../src/core/operational-logger.js");
const { attachRequestContext, getRequestContext } = await import("../../../src/core/request-context.js");
const { createOperationalHealthRoutes } = await import("../../../src/routes/operational-health.routes.js");
const { createOperationalReadinessService } = await import("../../../src/services/operational-readiness.service.js");
const { readSeparateWorkerReadiness } = await import("../../../src/core/jobs/worker-process-lock.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { readMigrationReadiness } = await import("../../../src/db/migrations.js");

try {
  await assertStructuredLogContract();
  await assertRequestCorrelation();
  await assertMinimalHealthRoutes();
  await assertReadinessContract();
  await assertSecurityDocumentation();
  await initializeDatabase();
  assert.equal(await readMigrationReadiness(), true, "the initialized fixture should report current migrations");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Operational security basics regression passed.");

async function assertStructuredLogContract() {
  const lines = [];
  const logger = createOperationalLogger({
    minimumLevel: "trace",
    writeLine: (line) => lines.push(line),
  });

  logger.info("security.probe", {
    component: "http",
    password: secretMarker,
    requestId: "36bd50cb-32d2-4b11-924f-705721552c4d",
    token: secretMarker,
  });
  const first = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(first), ["timestamp", "level", "event", "component", "requestId"]);
  assert.equal(first.level, "info");
  assert.equal(first.event, "security.probe");
  assert.match(first.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(lines[0], new RegExp(secretMarker));
  assert.equal(Object.hasOwn(first, "password"), false);
  assert.equal(Object.hasOwn(first, "token"), false);

  const restoreConsole = installProductionConsoleBridge({ environment: "production", logger });
  try {
    console.error(`[authentication] ${secretMarker}`, new Error(secretMarker));
  } finally {
    restoreConsole();
  }
  const bridged = JSON.parse(lines.at(-1));
  assert.deepEqual(bridged, {
    timestamp: bridged.timestamp,
    level: "error",
    event: "console.output",
    source: "authentication",
  });
  assert.doesNotMatch(lines.at(-1), new RegExp(secretMarker));
}

async function assertRequestCorrelation() {
  const lines = [];
  const logger = createOperationalLogger({
    writeLine: (line) => lines.push(line),
  });
  const app = express();
  app.use(attachRequestContext);
  app.use(createRequestLoggingMiddleware({ environment: "production", logger }));
  app.get("/probe", (request, response) => {
    response.json({ requestId: getRequestContext(request).requestId });
  });
  const server = await listen(app);

  try {
    const inboundId = "attacker-controlled-correlation-id";
    const result = await request(server, "/probe", { "x-request-id": inboundId });
    await waitForImmediate();
    assert.equal(result.status, 200);
    assert.match(result.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
    assert.notEqual(result.headers["x-request-id"], inboundId, "inbound IDs should not control trusted correlation fields");
    assert.equal(result.body.requestId, result.headers["x-request-id"]);
    const requestLog = JSON.parse(lines.at(-1));
    assert.equal(requestLog.event, "http.request.completed");
    assert.equal(requestLog.requestId, result.headers["x-request-id"]);
    assert.equal(requestLog.method, "GET");
    assert.equal(requestLog.statusCode, 200);
    assert.equal(Object.hasOwn(requestLog, "path"), false, "request logs should omit paths and queries");
  } finally {
    await closeServer(server);
  }
}

async function assertMinimalHealthRoutes() {
  const app = express();
  app.use(attachRequestContext);
  app.use(createOperationalHealthRoutes({
    readinessService: { isReady: async () => false },
  }));
  const server = await listen(app);

  try {
    const health = await request(server, "/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: "ok" });
    assert.match(health.headers["x-request-id"], /^[0-9a-f-]{36}$/i);

    const notReady = await request(server, "/readyz");
    assert.equal(notReady.status, 503);
    assert.deepEqual(notReady.body, { status: "not_ready" });
    assert.doesNotMatch(JSON.stringify(notReady.body), /database|migration|worker|path|secret|error/i);
  } finally {
    await closeServer(server);
  }

  const readyApp = express();
  readyApp.use(createOperationalHealthRoutes({ readinessService: { isReady: async () => true } }));
  const readyServer = await listen(readyApp);
  try {
    const ready = await request(readyServer, "/readyz");
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.body, { status: "ready" });
  } finally {
    await closeServer(readyServer);
  }
}

async function assertReadinessContract() {
  const healthyDatabase = {
    busyTimeoutMs: 5000,
    databaseFileWritable: true,
    foreignKeysEnabled: true,
    journalMode: "wal",
    provider: "sqlite",
  };
  const base = {
    getJobWorkerStatus: () => ({ mode: "inline", state: "idle", timerActive: true }),
    readDatabaseHealth: async () => healthyDatabase,
    readMigrationReadiness: async () => true,
    workerMode: "inline",
  };

  assert.equal(await createOperationalReadinessService(base).isReady(), true);
  assert.equal(await createOperationalReadinessService({
    ...base,
    readDatabaseHealth: async () => ({ ...healthyDatabase, foreignKeysEnabled: false }),
  }).isReady(), false, "unsafe database runtime state should fail readiness");
  assert.equal(await createOperationalReadinessService({
    ...base,
    readDatabaseHealth: async () => ({ ...healthyDatabase, journalMode: "delete" }),
  }).isReady(), false, "database runtime state that drifts from configuration should fail readiness");
  assert.equal(await createOperationalReadinessService({
    ...base,
    readMigrationReadiness: async () => false,
  }).isReady(), false, "pending migrations should fail readiness");
  assert.equal(await createOperationalReadinessService({
    ...base,
    getJobWorkerStatus: () => ({ mode: "inline", state: "stopped", timerActive: false }),
  }).isReady(), false, "a stopped inline worker should fail readiness");
  assert.equal(await createOperationalReadinessService({
    ...base,
    workerMode: "disabled",
  }).isReady(), false, "disabled background work should fail readiness");

  const heartbeatPath = path.join(fixture.root, "worker-heartbeat.lock");
  await fs.writeFile(heartbeatPath, JSON.stringify({ ready: false }));
  assert.equal(await readSeparateWorkerReadiness({ lockPath: heartbeatPath, staleAfterMs: 10_000 }), false);
  await fs.writeFile(heartbeatPath, JSON.stringify({ ready: true }));
  assert.equal(await readSeparateWorkerReadiness({ lockPath: heartbeatPath, staleAfterMs: 10_000 }), true);
  assert.equal(await readSeparateWorkerReadiness({
    lockPath: heartbeatPath,
    nowMs: Date.now() + 20_000,
    staleAfterMs: 10_000,
  }), false, "a stale separate-worker heartbeat should fail readiness");
}

async function assertSecurityDocumentation() {
  const securityPolicy = await fs.readFile("SECURITY.md", "utf8");
  const operations = await fs.readFile("docs/operational-security.md", "utf8");
  const preview = await fs.readFile("docs/marketing/friends-and-family-preview.md", "utf8");

  assert.match(securityPolicy, /security\/advisories\/new/);
  assert.match(securityPolicy, /Do not open a public issue/);
  assert.match(securityPolicy, /Private vulnerability reporting must be enabled and tested before any friends-and-family invitation/);
  for (const requiredControl of [
    "Dependabot",
    "npm audit",
    "dependency review",
    "CodeQL",
    "secret scanning",
    "push protection",
  ]) {
    assert.match(operations, new RegExp(requiredControl, "i"), `${requiredControl} guidance should be documented`);
  }
  assert.match(operations, /clean dependency, code, or secret scan does not prove the application is secure/i);
  assert.match(operations, /## Minimum private-preview incident response/);
  assert.match(operations, /Contain[\s\S]*Preserve and scope[\s\S]*Eradicate and recover[\s\S]*Communicate privately/);
  assert.match(operations, /Backup and restore from 0\.33\.17 have been tested end to end/);
  assert.match(operations, /## Manual security review before invitations/);
  assert.match(preview, /manual operational-security review/);
  assert.match(preview, /Invitations remain blocked until that exact-candidate review records an explicit invite decision/);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(server, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const outgoing = http.request({
      headers,
      host: "127.0.0.1",
      method: "GET",
      path: requestPath,
      port: address.port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}
