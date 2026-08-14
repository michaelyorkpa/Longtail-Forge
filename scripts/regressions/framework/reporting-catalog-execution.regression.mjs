export const regressionMeta = Object.freeze({
  id: "framework.reporting-catalog-execution",
  area: "framework",
  tier: "focused",
  tags: ["catalog", "modules", "permissions", "reporting", "routes"],
  description: "Proves permission-safe Reporting catalog delivery, stable runner dispatch, basic filter validation, and safe execution errors.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

const fixture = await createDisposableDatabaseFixture("reporting-catalog-execution");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { errorHandler } = await import("../../../src/middleware/error-handler.js");
const { reportingRoutes } = await import("../../../src/routes/reporting.routes.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const {
  clearReportRunnersForTests,
  listReportRunnerIds,
  registerReportRunner,
} = await import("../../../src/core/reporting/report-runner-registry.js");
const { AppError } = await import("../../../src/core/errors.js");
const { timeTrackingModule } = await import("../../../src/modules/time-tracking/module.js");

const REPORT_KEY = "time-tracking:project-time-billing";
const RUNNER_ID = "time-tracking.project-time-billing";
let server;

try {
  await initializeDatabase();
  const adminSession = await readSeedSession();
  const unauthorizedSession = {
    ...adminSession,
    user_id: randomUUID(),
    username: `reporting-no-role-${randomUUID()}@example.test`,
  };
  await modulesService.syncModuleRegistry(adminSession.workspace_id);
  clearReportRunnersForTests();

  assertRegistryContract();
  assertContributionRequirementFiltering();

  server = await listen(createTestApp({ adminSession, unauthorizedSession }));
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const catalog = await api.get("/api/reporting/catalog");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("cache-control"), "no-store");
  assert.equal(catalog.body.reports.length, 1);
  assertCatalogReport(catalog.body.reports[0]);
  assert.deepEqual(listReportRunnerIds(), [], "Catalog listing must not require or execute a runner");

  const unauthorizedCatalog = await api.get("/api/reporting/catalog", { session: "unauthorized" });
  assert.deepEqual(unauthorizedCatalog.body, { reports: [] });
  const unauthorizedRun = await run(api, "?scopeId=scope-one", { session: "unauthorized" });
  assertExecutionError(unauthorizedRun, 404, "report_not_found", "Report not found.");

  const unavailable = await run(api, "?scopeId=scope-one");
  assertExecutionError(unavailable, 503, "report_unavailable", "This report is temporarily unavailable.");
  assert.doesNotMatch(JSON.stringify(unavailable.body), /time-tracking\.project-time-billing/);

  const calls = [];
  registerReportRunner(RUNNER_ID, async (context) => {
    calls.push(context);
    return { rows: [{ label: "Safe result" }], totals: { seconds: 90 } };
  });

  const ready = await run(api, "?scopeId=scope-one&projectIds=project-a,project-b&tagIds=tag-a&includeDescendants=false");
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body, {
    status: "ready",
    reportKey: REPORT_KEY,
    renderer: "time-project-billing-table",
    result: { rows: [{ label: "Safe result" }], totals: { seconds: 90 } },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].report.runner, RUNNER_ID);
  assert.equal(calls[0].reportKey, REPORT_KEY);
  assert.equal(calls[0].workspaceId, adminSession.workspace_id);
  assert.deepEqual(calls[0].filters, {
    period: "current",
    scopeId: "scope-one",
    projectIds: ["project-a", "project-b"],
    tagIds: ["tag-a"],
    includeDescendants: false,
  });

  const custom = await run(api, "?period=custom&startDate=2026-07-01&endDate=2026-07-14&scopeId=scope-two");
  assert.equal(custom.status, 200);
  assert.deepEqual(calls.at(-1).filters, {
    period: "custom",
    startDate: "2026-07-01",
    endDate: "2026-07-14",
    scopeId: "scope-two",
    projectIds: [],
    tagIds: [],
    includeDescendants: true,
  });

  assertExecutionError(await run(api, "?scopeId=scope&unknown=value"), 400, "invalid_filters");
  assertExecutionError(await run(api, "?period=quarter&scopeId=scope"), 400, "invalid_filters");
  assertExecutionError(await run(api, ""), 400, "invalid_filters");
  assertExecutionError(
    await run(api, "?period=custom&startDate=2026-07-01&scopeId=scope"),
    400,
    "invalid_filters",
  );
  assertExecutionError(
    await run(api, "?period=current&startDate=2026-07-01&endDate=2026-07-02&scopeId=scope"),
    400,
    "invalid_filters",
  );
  assertExecutionError(await run(api, "?scopeId=scope&includeDescendants=maybe"), 400, "invalid_filters");
  assert.equal(calls.length, 2, "Invalid filters must fail before runner dispatch");

  const unknown = await api.get("/api/reporting/reports/unknown%3Areport/run?scopeId=scope");
  assertExecutionError(unknown, 404, "report_not_found", "Report not found.");
  const malformed = await api.get("/api/reporting/reports/not-a-key/run?scopeId=scope");
  assertExecutionError(malformed, 404, "report_not_found", "Report not found.");

  registerReportRunner(RUNNER_ID, async () => {
    throw new Error("secret database and implementation detail");
  }, { replace: true });
  const originalConsoleError = console.error;
  let loggedRunnerFailure = "";
  console.error = (...args) => {
    loggedRunnerFailure += args.map(String).join(" ");
  };
  let failed;
  try {
    failed = await run(api, "?scopeId=scope");
  } finally {
    console.error = originalConsoleError;
  }
  assertExecutionError(failed, 500, "report_execution_failed", "The report could not be run.");
  assert.doesNotMatch(JSON.stringify(failed.body), /secret|database|implementation/i);
  assert.match(loggedRunnerFailure, /secret database and implementation detail/);

  registerReportRunner(RUNNER_ID, async () => {
    throw new AppError("Hidden record label and identifier", 403);
  }, { replace: true });
  const denied = await run(api, "?scopeId=scope");
  assertExecutionError(
    denied,
    403,
    "report_access_denied",
    "The report could not be run with your current access.",
  );
  assert.doesNotMatch(JSON.stringify(denied.body), /Hidden record label|identifier/);

  await modulesService.setModuleStatus(adminSession.workspace_id, "time-tracking", false, { session: adminSession });
  assert.equal(timeTrackingModule.historicalReadAccess, true);
  assert.deepEqual((await api.get("/api/reporting/catalog")).body, { reports: [] });
  assertExecutionError(await run(api, "?scopeId=scope"), 404, "report_not_found");
  await modulesService.setModuleStatus(adminSession.workspace_id, "time-tracking", true, { session: adminSession });
  assert.equal((await api.get("/api/reporting/catalog")).body.reports.length, 1);

  console.log("Reporting catalog and execution regression passed.");
} finally {
  clearReportRunnersForTests();
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fixture.cleanup();
}

function assertRegistryContract() {
  assert.throws(() => registerReportRunner("not a stable id", async () => null), /stable data identifier/);
  assert.throws(
    () => Reflect.apply(registerReportRunner, null, ["sample.runner", "not-a-function"]),
    /must be a function/,
  );
  const runner = async () => null;
  const unregister = registerReportRunner("sample.runner", runner);
  assert.deepEqual(listReportRunnerIds(), ["sample.runner"]);
  assert.throws(() => registerReportRunner("sample.runner", runner), /already registered/);
  unregister();
  assert.deepEqual(listReportRunnerIds(), []);
}

function assertContributionRequirementFiltering() {
  const moduleDefinition = {
    id: "sample-module",
    workspaceCapabilityRequirements: [],
  };
  const contribution = {
    moduleId: "sample-module",
    requiresEnabledModules: ["required-module"],
    requiredWorkspaceCapabilities: ["reports"],
  };

  assert.equal(modulesService.moduleContributionRequirementsAvailable(contribution, moduleDefinition, {
    enabledModuleIds: new Set(["sample-module", "required-module"]),
    availableTools: new Set(["reports"]),
  }), true);
  assert.equal(modulesService.moduleContributionRequirementsAvailable(contribution, moduleDefinition, {
    enabledModuleIds: new Set(["sample-module"]),
    availableTools: new Set(["reports"]),
  }), false, "Missing required modules must remove the contribution");
  assert.equal(modulesService.moduleContributionRequirementsAvailable(contribution, moduleDefinition, {
    enabledModuleIds: new Set(["sample-module", "required-module"]),
    availableTools: new Set(["unrelated-tool"]),
  }), false, "Workspace capability mismatches must remove the contribution");
}

function assertCatalogReport(report) {
  assert.equal(report.reportKey, REPORT_KEY);
  assert.equal(report.id, "project-time-billing");
  assert.equal(report.moduleId, "time-tracking");
  assert.equal(report.renderer, "time-project-billing-table");
  assert.equal(Object.hasOwn(report, "runner"), false, "Server runner IDs do not need browser delivery");
  assert.deepEqual(report.requiredPermissions, ["reporting.view"]);
  assert.deepEqual(report.defaultFilters, {
    "billing-period": "current",
    projects: [],
    "include-descendants": true,
  });
  assert.deepEqual(report.rendererAssets.map((asset) => asset.id), ["time-tracking-reporting-script"]);
  assert.match(report.rendererAssets[0].path, /^\/js\/time-tracking-reporting\.js\?v=/);
  assert.equal(JSON.stringify(report).includes("function"), false);
}

/** @param {{status: number, body: {error: {code: string, message: string, requestId: string}}}} response @param {number} status @param {string} code @param {string|null} [message] */
function assertExecutionError(response, status, code, message = null) {
  assert.equal(response.status, status);
  assert.equal(response.body.error.code, code);
  assert.match(response.body.error.requestId, /^[0-9a-f-]{36}$/i);
  if (message) {
    assert.equal(response.body.error.message, message);
  }
}

function createTestApp({ adminSession, unauthorizedSession }) {
  const app = express();
  app.use((request, _response, next) => {
    request.session = request.headers["x-test-session"] === "unauthorized"
      ? unauthorizedSession
      : adminSession;
    next();
  });
  app.use("/api", reportingRoutes);
  app.use(errorHandler);
  return app;
}

function createApi(baseUrl) {
  return {
    async get(url, options = {}) {
      const headers = options.session ? { "X-Test-Session": options.session } : {};
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

function run(api, query, options = {}) {
  return api.get(`/api/reporting/reports/${encodeURIComponent(REPORT_KEY)}/run${query}`, options);
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
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
  assert.ok(user, "Fresh database should seed a protected super admin");

  return workspaceSessionFixture(user);
}
