export const regressionMeta = Object.freeze({
  id: "time-tracking.project-time-billing-runner",
  area: "time-tracking",
  tier: "focused",
  tags: ["billing", "modules", "permissions", "reporting", "runner"],
  description: "Proves the module-owned Project Time & Billing runner, recursive mixed-setting rollups, compatibility reads, tag/task behavior, and framework decoupling.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TimeTrackingSession */
/** @typedef {{ id: string }} BillingReportProject */
/** @typedef {{ project: BillingReportProject, rawSeconds: number, billableSeconds: number, amount: number, displaySeconds: number, childRows?: BillingReportRow[] }} BillingReportRow */
/** @typedef {{ totals: { seconds: number, amount: number }, rows: BillingReportRow[], scope: { childScopeIds: string[] } }} BillingReportResult */
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

const fixture = await createDisposableDatabaseFixture("project-time-billing-runner");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");
const { timeEntriesService } = await import("../../../src/modules/time-tracking/time-entries.service.js");
const { timeTrackingBillingService } = await import("../../../src/modules/time-tracking/time-tracking-billing.service.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { reportingService } = await import("../../../src/services/reporting.service.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { activateModuleRuntime } = await import("../../../src/core/modules/module-runtime.js");
const { listReportRunnerIds } = await import("../../../src/core/reporting/report-runner-registry.js");
const { tagsService } = await import("../../../src/services/tags.service.js");

const REPORT_KEY = "time-tracking:project-time-billing";
const RUNNER_ID = "time-tracking.project-time-billing";

try {
  await initializeDatabase();
  activateModuleRuntime("app");
  const session = await readSeedSession();
  await modulesService.syncModuleRegistry(session.workspace_id);

  assert.ok(listReportRunnerIds().includes(RUNNER_ID), "Time Tracking must register its production report runner");
  assertFrameworkDecoupling();
  assertContributionDependency();

  const tag = (await tagsService.create(session, { name: "Runner Focus" })).tag;
  const client = (await clientsService.createClient({
    name: "Runner Client",
    billable: "yes",
    billing_rate: "120",
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: "Runner Project",
    billable: "yes",
  }, session)).project;
  const taskId = (await tasksService.create({
    title: "Runner Task",
    project_id: project.id,
  }, session)).task.task_id;

  await timeEntriesService.create({
    project_id: project.id,
    task_id: taskId,
    description: "Tagged task-linked report entry",
    start_time: "2026-07-10T13:00:00.000Z",
    end_time: "2026-07-10T14:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.0000",
    billable: "yes",
    tagIds: [tag.tag_id],
  }, session);
  await timeEntriesService.create({
    project_id: project.id,
    description: "Untagged report entry",
    start_time: "2026-07-10T14:00:00.000Z",
    end_time: "2026-07-10T14:30:00.000Z",
    duration_seconds: 1800,
    duration_hours: "0.5000",
    billable: "yes",
  }, session);

  const filters = {
    period: "custom",
    startDate: "2026-07-10",
    endDate: "2026-07-10",
    scopeId: client.id,
    projectIds: [project.id],
    tagIds: [tag.tag_id],
    includeDescendants: true,
  };
  const compatibility = await timeTrackingBillingService.readProjectSummary(session, filters);
  const execution = await reportingService.runReport(session, REPORT_KEY, filters);

  assert.equal(execution.statusCode, 200);
  assert.equal(execution.payload.status, "ready");
  assert.equal(execution.payload.renderer, "time-project-billing-table");
  assert.deepEqual(execution.payload.result, compatibility, "runner and retained read must share one result path");
  assert.equal(execution.payload.result.totals.seconds, 3600, "tag filtering must preserve the tagged task-linked entry");
  assert.equal(execution.payload.result.rows[0].rawSeconds, 3600);

  const taskFiltered = await timeTrackingBillingService.readProjectSummary(session, {
    ...filters,
    tagIds: [],
    taskId,
  });
  assert.deepEqual(taskFiltered.taskFilter, [taskId]);
  assert.equal(taskFiltered.totals.seconds, 3600, "retained task filtering must keep task-linked report behavior");

  const unfiltered = await reportingService.runReport(session, REPORT_KEY, {
    ...filters,
    tagIds: [],
  });
  const unfilteredResult = billingResult(unfiltered, "unfiltered billing report");
  assert.equal(unfilteredResult.totals.seconds, 5400);

  await assertRecursiveHierarchyBilling(session);

  await modulesService.setModuleStatus(session.workspace_id, "time-tracking", false, { session });
  const disabled = await reportingService.runReport(session, REPORT_KEY, filters);
  assert.equal(disabled.statusCode, 404, "disabled Time Tracking must remove the executable contribution");
  await assert.rejects(
    () => timeTrackingBillingService.readProjectSummary(session, filters),
    (error) => rejectionStatus(error) === 403 && !rejectionMessage(error).includes(project.name),
    "retained compatibility reads must also reject disabled-module execution safely",
  );

  console.log("Project Time & Billing runner regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

/** @param {TimeTrackingSession} session */
async function assertRecursiveHierarchyBilling(session) {
  const parentClient = (await clientsService.createClient({
    name: "Rollup Parent Client",
    billable: "yes",
    billing_rate: "100",
  }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Rollup Child Client",
    parent_client_id: parentClient.id,
    billable: "yes",
    billing_rate: "250",
  }, session)).client;
  assert.equal(childClient.parent_client_id, parentClient.id, "child client fixture must persist its parent");
  const parentProject = (await clientsService.createProject(parentClient.id, {
    name: "Rollup Parent Project",
    billable: "yes",
    billing_rate: "100",
    billing_rounding: { enabled: true, increment: "nearestQuarterHour" },
  }, session)).project;
  const childProject = (await clientsService.createProject(parentClient.id, {
    name: "Rollup Child Project",
    parent_project_id: parentProject.id,
    billable: "yes",
    billing_rate: "200",
    billing_rounding: { enabled: true, increment: "nearestHalfHour" },
  }, session)).project;
  const grandchildProject = (await clientsService.createProject(parentClient.id, {
    name: "Rollup Grandchild Project",
    parent_project_id: childProject.id,
    billable: "yes",
    billing_rate: "300",
    billing_rounding: { enabled: false, increment: "nearestQuarterHour" },
  }, session)).project;
  const childClientProject = (await clientsService.createProject(childClient.id, {
    name: "Rollup Child Client Project",
    billable: "yes",
  }, session)).project;

  await createBillingEntry(session, parentProject.id, 500, "Parent direct time");
  await createBillingEntry(session, childProject.id, 1000, "Child direct time");
  await createBillingEntry(session, grandchildProject.id, 2000, "Grandchild direct time");
  await createBillingEntry(session, childClientProject.id, 3600, "Child client direct time");

  const hierarchy = await clientsService.readClientProjects(session);
  const hierarchyParent = hierarchy.clients.find((client) => client.id === parentClient.id);
  assert.ok(hierarchyParent, "Clients/Projects provider must retain the hierarchy parent");
  assert.deepEqual(hierarchyParent.childScopeIds, [childClient.id], "Clients/Projects provider must expose descendant client IDs");

  const execution = await reportingService.runReport(session, REPORT_KEY, {
    period: "custom",
    startDate: "2026-07-12",
    endDate: "2026-07-12",
    scopeId: parentClient.id,
    projectIds: [],
    tagIds: [],
    includeDescendants: true,
  });
  const result = billingResult(execution, "recursive hierarchy billing report");
  const parentRow = result.rows.find((row) => row.project.id === parentProject.id);
  assert.ok(parentRow, "the parent project should appear as a report row");
  const childClientRow = result.rows.find((row) => row.project.id === childClientProject.id);
  assert.ok(parentRow.childRows, "the parent row should carry child rows");
  const childRow = parentRow.childRows.find((row) => row.project.id === childProject.id);
  assert.ok(childRow, "the child project should appear beneath its parent");
  assert.ok(childRow.childRows, "the child row should carry grandchild rows");
  const grandchildRow = childRow.childRows.find((row) => row.project.id === grandchildProject.id);
  assert.ok(grandchildRow, "the grandchild project should appear beneath its parent");

  assert.equal(execution.statusCode, 200);
  assert.ok(childClientRow, `Expected descendant-client project row; roots=${result.rows.map((row) => row.project.id).join(",")}; descendants=${result.scope.childScopeIds.join(",")}`);
  assert.equal(parentRow.rawSeconds, 3500);
  assert.equal(parentRow.billableSeconds, 4700);
  assert.ok(Math.abs(parentRow.amount - 291.6666667) < 0.0001);
  assert.equal(childRow.rawSeconds, 3000);
  assert.equal(childRow.billableSeconds, 3800);
  assert.ok(Math.abs(childRow.amount - 266.6666667) < 0.0001);
  assert.equal(grandchildRow.amount, 166.66666666666669);
  assert.equal(childClientRow.amount, 250, "child-client projects must keep the child client's inherited rate");
  assert.equal(result.totals.seconds, 8300);
  assert.ok(Math.abs(result.totals.amount - 541.6666667) < 0.0001);
  assert.equal(
    result.totals.seconds,
    result.rows.reduce((seconds, row) => seconds + row.displaySeconds, 0),
    "footer totals must count root branch totals without adding display-only child rows again",
  );
}

/** @param {TimeTrackingSession} session @param {string} projectId @param {number} durationSeconds @param {string} description */
async function createBillingEntry(session, projectId, durationSeconds, description) {
  await timeEntriesService.create({
    project_id: projectId,
    description,
    start_time: "2026-07-12T10:00:00.000Z",
    end_time: "2026-07-12T11:00:00.000Z",
    duration_seconds: durationSeconds,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    billable: "yes",
  }, session);
}

function assertFrameworkDecoupling() {
  const frameworkService = fs.readFileSync("src/services/reporting.service.js", "utf8");
  const frameworkRoutes = fs.readFileSync("src/routes/reporting.routes.js", "utf8");
  const moduleRoutes = fs.readFileSync("src/modules/time-tracking/reporting.routes.js", "utf8");

  assert.doesNotMatch(
    frameworkService,
    /\.\.\/modules\/|clientsService|timeEntriesService|tasksService|project-time-billing|time-tracking/,
    "framework Reporting must not import or name a first-party report implementation",
  );
  assert.doesNotMatch(frameworkRoutes, /\/reporting\/bootstrap|\/reporting\/project-summary/);
  assert.match(moduleRoutes, /\/reporting\/bootstrap[\s\S]*\/reporting\/project-summary/);
}

function assertContributionDependency() {
  const timeTracking = modulesService.getModule("time-tracking");
  assert.ok(timeTracking, "the Time Tracking module should be registered");
  const contribution = timeTracking.reporting
    .find((report) => report.id === "project-time-billing");
  assert.ok(contribution, "time-tracking should publish the project-time-billing report");

  assert.deepEqual(contribution.requiresEnabledModules, ["time-tracking", "client-projects"]);
}

async function readSeedSession() {
  const users = await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const user = users[0];

  assert.ok(user, "Expected a protected seed user");
  return workspaceSessionFixture(user);
}

/**
 * Prove a report execution carried a result payload before its rows and
 * totals are read. The runner publishes the payload as an open value, so an
 * absent result would otherwise compare `undefined` against a real total.
 * @param {{ payload?: { result?: unknown } }} execution
 * @param {string} label
 * @returns {BillingReportResult}
 */
function billingResult(execution, label) {
  const result = execution.payload?.result;
  assert.ok(
    result !== null && typeof result === "object",
    `${label} should carry a result payload`,
  );
  return /** @type {BillingReportResult} */ (result);
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
