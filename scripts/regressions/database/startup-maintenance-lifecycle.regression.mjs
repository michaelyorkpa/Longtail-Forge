export const regressionMeta = Object.freeze({
  id: "database.startup-maintenance-lifecycle",
  area: "database",
  tier: "release-gate",
  tags: ["bootstrap", "database", "maintenance", "migrations", "readiness", "sqlite"],
  description: "Proves explicit startup lifecycle ownership, fail-fast ordering, timed phase reporting, one-time repair tracking, fresh bootstrap behavior, and worker schema readiness.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("startup-maintenance-lifecycle");
process.env.SUPER_ADMIN_USERNAME = "startup-maintenance-admin@example.test";
process.env.SUPER_ADMIN_PASSWORD = "Startup-Maintenance-Lifecycle-123!";

const {
  closeDatabase,
  createDatabaseStartupActions,
  createWorkerStartupActions,
  db,
  initializeDatabase,
  initializeWorkerDatabase,
  querySql,
} = await import("../../../src/db/index.js");
const {
  runStartupActions,
  STARTUP_LIFECYCLES,
} = await import("../../../src/db/startup-coordinator.js");

const EXPECTED_DATABASE_ACTIONS = [
  "database.initialize-runtime",
  "database.run-migrations",
  "app.ensure-framework-module",
  "repair.normalize-stored-times-utc-v1",
  "app.ensure-install-settings",
  "repair.protect-first-user-v1",
  "bootstrap.ensure-default-workspace",
  "app.ensure-workspace-settings",
  "app.sync-module-registry",
  "repair.redacted-seed-users-v1",
  "bootstrap.ensure-super-admin",
  "repair.local-time-entry-user-v1",
  "app.ensure-workspace-memberships",
  "repair.deduplicate-workspace-users-v1",
  "repair.user-active-workspaces-v1",
  "repair.workspace-type-v1",
  "app.sync-workspace-permission-contracts",
  "repair.personal-workspace-memberships-v1",
  "app.ensure-protected-user-roles",
];

try {
  await assertCoordinatorOrderAndFailureBehavior();
  assertLifecycleInventory();
  await assertFreshInstallAndRepeatStartup();
  await assertWorkerReadinessInventory();
  await assertIntegrity();
  console.log("Startup maintenance lifecycle regression passed.");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

async function assertCoordinatorOrderAndFailureBehavior() {
  const calls = [];
  const reports = [];
  const failure = new Error("planned startup failure");
  const actions = [
    action("test.first", async () => calls.push("first")),
    action("test.failure", async () => {
      calls.push("failure");
      throw failure;
    }),
    action("test.must-not-run", async () => calls.push("must-not-run")),
  ];
  const ticks = [10, 14, 20, 29];

  await assert.rejects(
    runStartupActions(actions, {
      now: () => ticks.shift(),
      report: (event) => reports.push(event),
    }),
    (error) => error === failure,
  );

  assert.deepEqual(calls, ["first", "failure"], "startup should stop at the first failed action");
  assert.deepEqual(
    reports.map((event) => [event.id, event.status, event.durationMs]),
    [
      ["test.first", "started", 0],
      ["test.first", "completed", 4],
      ["test.failure", "started", 0],
      ["test.failure", "failed", 9],
    ],
    "phase reports should expose stable IDs, order, status, and elapsed milliseconds",
  );
  assert.equal(reports.at(-1).errorType, "Error");
}

function assertLifecycleInventory() {
  const actions = createDatabaseStartupActions();
  assert.deepEqual(actions.map((action) => action.id), EXPECTED_DATABASE_ACTIONS);
  assert.equal(actions[0].lifecycle, STARTUP_LIFECYCLES.EVERY_BOOT);
  assert.equal(actions[1].lifecycle, STARTUP_LIFECYCLES.VERSIONED_REPAIR);
  assert.equal(readLifecycle(actions, "bootstrap.ensure-default-workspace"), STARTUP_LIFECYCLES.FIRST_INSTALL);
  assert.equal(readLifecycle(actions, "app.sync-module-registry"), STARTUP_LIFECYCLES.RECURRING_CHECK);
  assert.equal(readLifecycle(actions, "repair.normalize-stored-times-utc-v1"), STARTUP_LIFECYCLES.VERSIONED_REPAIR);
  assert.deepEqual(
    createWorkerStartupActions().map(({ id, lifecycle, owner }) => ({ id, lifecycle, owner })),
    [
      {
        id: "worker.initialize-database-runtime",
        lifecycle: STARTUP_LIFECYCLES.EVERY_BOOT,
        owner: "database-provider",
      },
      {
        id: "worker.verify-schema-readiness",
        lifecycle: STARTUP_LIFECYCLES.READINESS_ASSERTION,
        owner: "worker-schema-readiness",
      },
    ],
  );
}

async function assertFreshInstallAndRepeatStartup() {
  const firstReports = [];
  await initializeDatabase({ report: (event) => firstReports.push(event) });

  assert.deepEqual(
    completedReports(firstReports).map((event) => event.id),
    EXPECTED_DATABASE_ACTIONS,
    "fresh startup should preserve the declared dependency order",
  );
  assert.ok(completedReports(firstReports).every((event) => Number.isSafeInteger(event.durationMs) && event.durationMs >= 0));

  const workspace = await db.get("SELECT workspace_id, workspace_type FROM workspaces ORDER BY created_at LIMIT 1;");
  const user = await db.get("SELECT user_id, protected_user FROM users WHERE username = :username;", {
    username: process.env.SUPER_ADMIN_USERNAME,
  });
  assert.ok(workspace?.workspace_id, "fresh startup should create its default workspace");
  assert.equal(workspace.workspace_type, "business");
  assert.ok(user?.user_id, "fresh startup should create its super administrator");
  assert.equal(user.protected_user, "yes");
  assert.ok(await db.get(`
SELECT user_workspace_id
FROM user_workspaces
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND status = 'active';
`, { userId: user.user_id, workspaceId: workspace.workspace_id }));

  const repairRows = await querySql(`
SELECT maintenance_id, lifecycle
FROM startup_maintenance_runs
ORDER BY maintenance_id;
`);
  assert.equal(repairRows.length, 8, "all versioned application repairs should record durable completion");
  assert.ok(repairRows.every((row) => row.lifecycle === STARTUP_LIFECYCLES.VERSIONED_REPAIR));

  await db.run(`
INSERT INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  'post-repair-timestamp-proof',
  :workspaceId,
  :userId,
  '',
  '',
  'Post-repair timestamp proof',
  '2026-07-20 09:00:00',
  '2026-07-20 09:30:00',
  1800,
  '0.50',
  'not_invoiced',
  '2026-07-20 09:00:00',
  '2026-07-20 09:30:00'
);
`, { userId: user.user_id, workspaceId: workspace.workspace_id });

  const secondReports = [];
  await initializeDatabase({ report: (event) => secondReports.push(event) });
  const secondCompleted = completedReports(secondReports);
  assert.deepEqual(secondCompleted.map((event) => event.id), EXPECTED_DATABASE_ACTIONS);
  assert.equal(readStatus(secondCompleted, "bootstrap.ensure-default-workspace"), "skipped");
  assert.equal(readStatus(secondCompleted, "bootstrap.ensure-super-admin"), "skipped");
  assert.ok(
    secondCompleted
      .filter((event) => event.lifecycle === STARTUP_LIFECYCLES.VERSIONED_REPAIR && event.id.startsWith("repair."))
      .every((event) => event.status === "skipped" && event.reason === "versioned-repair-complete"),
    "completed versioned repairs should not repeat on later boots",
  );

  const postRepairRow = await db.get("SELECT start_time FROM time_entries WHERE entry_id = 'post-repair-timestamp-proof';");
  assert.equal(postRepairRow.start_time, "2026-07-20 09:00:00", "the retired full-table timestamp repair should not rescan on every boot");
}

async function assertWorkerReadinessInventory() {
  const reports = [];
  await initializeWorkerDatabase({ report: (event) => reports.push(event) });
  assert.deepEqual(
    completedReports(reports).map((event) => [event.id, event.lifecycle, event.status]),
    [
      ["worker.initialize-database-runtime", STARTUP_LIFECYCLES.EVERY_BOOT, "completed"],
      ["worker.verify-schema-readiness", STARTUP_LIFECYCLES.READINESS_ASSERTION, "completed"],
    ],
  );
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function action(id, run) {
  return {
    id,
    lifecycle: STARTUP_LIFECYCLES.EVERY_BOOT,
    owner: "regression",
    run,
  };
}

function completedReports(reports) {
  return reports.filter((event) => event.status !== "started");
}

function readLifecycle(actions, id) {
  return actions.find((action) => action.id === id)?.lifecycle;
}

function readStatus(reports, id) {
  return reports.find((event) => event.id === id)?.status;
}
