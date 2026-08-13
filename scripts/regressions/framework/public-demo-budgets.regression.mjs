export const regressionMeta = Object.freeze({
  id: "framework.public-demo-budgets",
  area: "framework",
  tier: "release-gate",
  tags: ["database", "demo", "http", "limits", "routes", "security"],
  description: "Proves persistent atomic public-demo growth, input, and query budgets plus protected browser-document access and fail-closed API catalog coverage without changing normal mode.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import express from "express";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("public-demo-budgets");
const { initializeDatabase, closeDatabase, db } = await import("../../../src/db/index.js");
const { attachRequestContext } = await import("../../../src/core/request-context.js");
const {
  createPublicDemoBudgetMiddleware,
  reserveAdditionalPublicDemoBudgetUnits,
} = await import("../../../src/core/public-demo-budgets.js");
const {
  resolvePublicDemoMutation,
  resolvePublicDemoQuery,
} = await import("../../../src/core/public-demo-budget-catalog.js");
const { apiRouteBoundary } = await import("../../../src/core/http-error-contract.js");
const { createErrorHandler } = await import("../../../src/middleware/error-handler.js");
const { readJsonBody } = await import("../../../src/utils/http.js");

const limits = Object.freeze({
  accountMutationUnits: 4,
  workspaceMutationUnits: 6,
  maxArrayItems: 3,
  maxFieldBytes: 16,
  maxRichTextBytes: 32,
  maxObjectDepth: 3,
  maxObjectFields: 4,
  maxPayloadNodes: 12,
  maxQueryBytes: 80,
  maxQueryFields: 3,
  maxQueryListItems: 2,
  maxPageSize: 3,
  maxOffset: 5,
  maxPage: 2,
  maxQueryTextBytes: 16,
  maxSearchTextBytes: 8,
});

try {
  await initializeDatabase();
  const primaryUser = await db.get("SELECT user_id, active_workspace_id FROM users ORDER BY user_id LIMIT 1");
  assert.ok(primaryUser?.user_id && primaryUser?.active_workspace_id);
  const workspaceId = primaryUser.active_workspace_id;
  const secondUserId = "22222222-2222-4222-a222-222222222222";
  await db.run(`
    INSERT INTO users (
      user_id, home_workspace_id, username, display_name, timezone, password,
      user_status, protected_user, active_workspace_id
    ) VALUES (
      :userId, :workspaceId, :username, 'Budget Visitor', 'America/New_York',
      :password, 'active', 'no', :workspaceId
    )
  `, {
    password: "regression-password-hash",
    userId: secondUserId,
    username: "budget-visitor-2@example.test",
    workspaceId,
  });

  await proveNormalModeBypass(primaryUser.user_id, workspaceId);
  await proveBrowserDocumentsBypassApiCatalog(primaryUser.user_id, workspaceId);
  await proveInputAndQueryCeilings(primaryUser.user_id, workspaceId);
  await clearUsage();
  await proveAccountBoundaryAndRestart(primaryUser.user_id, workspaceId);
  await clearUsage();
  await proveConcurrentAccountBoundary(primaryUser.user_id, workspaceId);
  await clearUsage();
  await proveConcurrentWorkspaceBoundary(primaryUser.user_id, secondUserId, workspaceId);
  await clearUsage();
  await proveFailureRollbackAndBulkAtomicity(primaryUser.user_id, workspaceId);
  await proveCatalogCompleteness();

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity.integrity_check, "ok");
  console.log("Public-demo budgets regression passed.");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

async function proveBrowserDocumentsBypassApiCatalog(userId, workspaceId) {
  const app = createProbeApp({ userIds: [userId], workspaceId });
  const server = await listen(app);
  try {
    const dashboard = await request(server, "/dashboard.html", {
      headers: visitorHeaders(userId),
    });
    assert.equal(dashboard.status, 200, "a marked visitor must reach the authenticated Dashboard document");
    assert.equal(dashboard.body, "dashboard");

    const root = await request(server, "/", {
      headers: visitorHeaders(userId),
    });
    assert.equal(root.status, 200, "an authenticated marked visitor must reach the root browser document");
    assert.equal(root.body, "root");

    const undeclaredApiRead = await request(server, "/api/future-read", {
      headers: visitorHeaders(userId),
    });
    assert.equal(undeclaredApiRead.status, 403, "non-API document access must not weaken the API allowlist");
    assert.equal(undeclaredApiRead.body.error.code, "public_demo_budget_undeclared");
  } finally {
    await closeServer(server);
  }
}

async function proveNormalModeBypass(userId, workspaceId) {
  const app = createProbeApp({ enabled: false, userIds: [userId], workspaceId });
  const server = await listen(app);
  try {
    const response = await request(server, "/api/future-write", {
      body: JSON.stringify({ title: "normal" }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(response.status, 201);
  } finally {
    await closeServer(server);
  }
}

async function proveInputAndQueryCeilings(userId, workspaceId) {
  const app = createProbeApp({ userIds: [userId], workspaceId });
  const server = await listen(app);
  try {
    const boundary = await request(server, "/api/tasks", {
      body: JSON.stringify({ title: "x".repeat(16) }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(boundary.status, 201);

    const oversized = await request(server, "/api/tasks", {
      body: JSON.stringify({ title: "secret-value-" + "x".repeat(16) }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.error.code, "public_demo_input_limit");
    assert.deepEqual(oversized.body.error.fields, [{
      code: "limit_reached",
      field: "request",
      hint: "The hourly reset restores the public demo baseline.",
    }]);
    assert.doesNotMatch(JSON.stringify(oversized.body), /secret-value/);

    const tooMany = await request(server, "/api/tasks/bulk", {
      body: JSON.stringify({ tasks: [{}, {}, {}, {}] }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.error.code, "public_demo_input_limit");

    const allowedQuery = await request(server, "/api/search?q=12345678&limit=3", { headers: visitorHeaders(userId) });
    assert.equal(allowedQuery.status, 200);
    const pageDenied = await request(server, "/api/search?limit=4", { headers: visitorHeaders(userId) });
    assert.equal(pageDenied.status, 400);
    assert.equal(pageDenied.body.error.code, "public_demo_query_limit");
    const textDenied = await request(server, "/api/search?q=123456789", { headers: visitorHeaders(userId) });
    assert.equal(textDenied.status, 400);
    assert.equal(textDenied.body.error.code, "public_demo_query_limit");

    const undeclared = await request(server, "/api/future-write", {
      body: JSON.stringify({ title: "blocked" }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(undeclared.status, 403);
    assert.equal(undeclared.body.error.code, "public_demo_budget_undeclared");

    const capabilityDenied = await request(server, "/api/users", {
      body: JSON.stringify({ title: "x".repeat(40) }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(capabilityDenied.status, 403);
    assert.equal(capabilityDenied.body.error.code, "public_demo_capability_disabled");
  } finally {
    await closeServer(server);
  }
}

async function proveAccountBoundaryAndRestart(userId, workspaceId) {
  const firstApp = createProbeApp({ userIds: [userId], workspaceId });
  const firstServer = await listen(firstApp);
  try {
    const bulk = await request(firstServer, "/api/tasks/bulk", {
      body: JSON.stringify({ tasks: [{ title: "a" }, { title: "b" }, { title: "c" }] }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(bulk.status, 201);
    const one = await request(firstServer, "/api/tasks", {
      body: JSON.stringify({ title: "d" }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(one.status, 201);
  } finally {
    await closeServer(firstServer);
  }

  const restartedApp = createProbeApp({ userIds: [userId], workspaceId });
  const restartedServer = await listen(restartedApp);
  try {
    const denied = await request(restartedServer, "/api/tasks", {
      body: JSON.stringify({ title: "after restart" }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(denied.status, 429);
    assert.equal(denied.body.error.code, "public_demo_budget_exceeded");
  } finally {
    await closeServer(restartedServer);
  }
}

async function proveConcurrentAccountBoundary(userId, workspaceId) {
  const app = createProbeApp({ userIds: [userId], workspaceId });
  const server = await listen(app);
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => request(server, "/api/tasks", {
      body: JSON.stringify({ title: `item-${index}` }),
      headers: visitorHeaders(userId),
      method: "POST",
    })));
    assert.equal(results.filter((item) => item.status === 201).length, 4);
    assert.equal(results.filter((item) => item.status === 429).length, 4);
    assert.equal(await usedUnits(userId, workspaceId), 4);
  } finally {
    await closeServer(server);
  }
}

async function proveConcurrentWorkspaceBoundary(firstUserId, secondUserId, workspaceId) {
  const app = createProbeApp({ userIds: [firstUserId, secondUserId], workspaceId });
  const server = await listen(app);
  try {
    const userIds = [firstUserId, secondUserId, firstUserId, secondUserId, firstUserId, secondUserId, firstUserId, secondUserId];
    const results = await Promise.all(userIds.map((userId, index) => request(server, "/api/tasks", {
      body: JSON.stringify({ title: `shared-${index}` }),
      headers: visitorHeaders(userId),
      method: "POST",
    })));
    assert.equal(results.filter((item) => item.status === 201).length, 6);
    assert.equal(results.filter((item) => item.status === 429).length, 2);
    const workspace = await db.get("SELECT SUM(used_units) AS used_units FROM public_demo_budget_usage WHERE workspace_id = :workspaceId", { workspaceId });
    assert.equal(Number(workspace.used_units), 6);
  } finally {
    await closeServer(server);
  }
}

async function proveFailureRollbackAndBulkAtomicity(userId, workspaceId) {
  let committedRows = 0;
  const app = createProbeApp({ userIds: [userId], workspaceId, onCommit: (count) => { committedRows += count; } });
  const server = await listen(app);
  try {
    const failed = await request(server, "/api/tasks", {
      body: JSON.stringify({ fail: true, title: "failed" }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(failed.status, 409);
    await waitFor(async () => await usedUnits(userId, workspaceId) === 0);
    assert.equal(committedRows, 0);

    const generatedDenied = await request(server, "/api/lists/source/duplicate", {
      body: JSON.stringify({ generatedRows: 4 }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(generatedDenied.status, 429);
    await waitFor(async () => await usedUnits(userId, workspaceId) === 0);
    assert.equal(committedRows, 0, "state-dependent generated rows must reserve before persistence");

    const first = await request(server, "/api/tasks/bulk", {
      body: JSON.stringify({ tasks: [{ title: "a" }, { title: "b" }, { title: "c" }] }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(first.status, 201);
    assert.equal(committedRows, 3);

    const denied = await request(server, "/api/tasks/bulk", {
      body: JSON.stringify({ tasks: [{ title: "d" }, { title: "e" }] }),
      headers: visitorHeaders(userId),
      method: "POST",
    });
    assert.equal(denied.status, 429);
    assert.equal(committedRows, 3, "denied bulk work must not reach persistence");
    assert.equal(await usedUnits(userId, workspaceId), 3);
  } finally {
    await closeServer(server);
  }
}

/** @param {{ enabled?: boolean, onCommit?: (count: number) => void, userIds: string[], workspaceId: string }} options */
function createProbeApp({ enabled = true, onCommit = () => {}, userIds, workspaceId }) {
  const app = express();
  app.set("query parser", "extended");
  app.use(attachRequestContext);
  app.use((request, _response, next) => {
    request.session = {
      user_id: String(request.get("x-demo-user") || userIds[0]),
      workspace_id: workspaceId,
    };
    next();
  });
  app.use(createPublicDemoBudgetMiddleware({
    database: db,
    enabled,
    isVisitor: (userId) => userIds.includes(userId),
    limits,
  }));
  app.get("/api/search", (_request, response) => response.json({ ok: true }));
  app.post("/api/tasks", asyncHandler(async (request, response) => {
    const payload = await readJsonBody(request);
    if (payload.fail) {
      response.status(409).json({ error: { code: "probe_failure" } });
      return;
    }
    onCommit(1);
    response.status(201).json({ ok: true });
  }));
  app.post("/api/tasks/bulk", asyncHandler(async (request, response) => {
    const payload = await readJsonBody(request);
    onCommit(payload.tasks.length);
    response.status(201).json({ ok: true });
  }));
  app.post("/api/lists/:listId/duplicate", asyncHandler(async (request, response) => {
    const payload = await readJsonBody(request);
    await reserveAdditionalPublicDemoBudgetUnits(payload.generatedRows);
    onCommit(payload.generatedRows + 1);
    response.status(201).json({ ok: true });
  }));
  app.post("/api/users", (_request, response) => response.status(403).json({
    error: { code: "public_demo_capability_disabled" },
  }));
  app.get("/api/future-read", (_request, response) => response.status(200).json({ ok: true }));
  app.post("/api/future-write", (_request, response) => response.status(201).json({ ok: true }));
  app.use("/api", apiRouteBoundary);
  app.get("/dashboard.html", (_request, response) => response.status(200).type("html").send("dashboard"));
  app.get("/", (_request, response) => response.status(200).type("html").send("root"));
  app.use(createErrorHandler({ logger: { error() {} } }));
  return app;
}

async function proveCatalogCompleteness() {
  const roots = ["src/routes", "src/modules"];
  const files = (await Promise.all(roots.map((root) => listRouteFiles(root)))).flat();
  const excluded = new Set([
    "src/routes/app-info.routes.js",
    "src/routes/auth.routes.js",
    "src/routes/operational-health.routes.js",
    "src/routes/public-demo-account.routes.js",
    "src/routes/static.routes.js",
  ]);

  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    if (excluded.has(normalized) || normalized.endsWith("/public-api.routes.js")) continue;
    const source = await fs.readFile(file, "utf8");
    const pattern = /\.(get|post|put|patch|delete)\("([^"]+)"/g;
    for (const match of source.matchAll(pattern)) {
      const method = match[1].toUpperCase();
      const pathname = `/api${match[2]}`;
      const operation = ["GET", "HEAD"].includes(method)
        ? resolvePublicDemoQuery(method, pathname)
        : resolvePublicDemoMutation(method, pathname);
      assert.ok(operation, `${method} ${pathname} from ${normalized} must declare a stable public-demo budget operation`);
      assert.match(operation.id, /^[a-z][a-z0-9.-]+$/);
    }
  }
}

async function listRouteFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listRouteFiles(candidate));
    else if (entry.name.endsWith(".routes.js")) files.push(candidate);
  }
  return files;
}

async function clearUsage() {
  await db.run("DELETE FROM public_demo_budget_usage");
}

async function usedUnits(userId, workspaceId) {
  const row = await db.get("SELECT used_units FROM public_demo_budget_usage WHERE user_id = :userId AND workspace_id = :workspaceId", { userId, workspaceId });
  return Number(row?.used_units || 0);
}

function visitorHeaders(userId) {
  return { "Content-Type": "application/json", "X-Demo-User": userId };
}

function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function request(server, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || "";
    const nextRequest = http.request({
      headers: { ...options.headers, ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) },
      host: "127.0.0.1",
      method: options.method || "GET",
      path: requestPath,
      port: server.address().port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const contentType = String(response.headers["content-type"] || "");
        resolve({
          body: text && contentType.includes("application/json") ? JSON.parse(text) : text,
          status: response.statusCode,
        });
      });
    });
    nextRequest.on("error", reject);
    nextRequest.end(body);
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for asynchronous budget rollback");
}
