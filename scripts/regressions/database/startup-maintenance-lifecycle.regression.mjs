export const regressionMeta = Object.freeze({
  id: "database.startup-maintenance-lifecycle",
  area: "database",
  tier: "release-gate",
  tags: ["baseline-bypass", "bootstrap", "database", "maintenance", "migrations", "readiness", "sqlite"],
  description: "Proves explicit startup lifecycle ownership, fail-fast ordering, timed phase reporting, one-time repair tracking, fresh bootstrap behavior, and worker schema readiness.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..", "..", "..");
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
  "app.ensure-workspace-module-rows",
  "repair.redacted-seed-users-v1",
  "bootstrap.ensure-super-admin",
  "repair.local-time-entry-user-v1",
  "app.ensure-workspace-memberships",
  "repair.deduplicate-workspace-users-v1",
  "repair.user-active-workspaces-v1",
  "repair.workspace-type-v1",
  "app.sync-workspace-permission-contracts",
  "app.reconcile-calendar-subscriptions",
  "repair.personal-workspace-memberships-v1",
  "app.ensure-protected-user-roles",
];

try {
  await assertFreshInstallRejectsMissingBootstrapPassword();
  await assertExistingInstallationDoesNotInventAdministrator();
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

async function assertFreshInstallRejectsMissingBootstrapPassword() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-bootstrap-password-required-"));
  const probePassword = "Bootstrap-Password-Required-Probe-123!";
  const initialUsername = "initial-bootstrap-admin@example.test";
  const changedUsername = "changed-bootstrap-admin@example.test";
  const source = await fs.readFile(path.join(rootDir, "src", "db", "app-startup-maintenance.js"), "utf8");
  assert.doesNotMatch(source, /createGeneratedPassword|generated password:/i, "startup must not generate or print a bootstrap credential");

  const missingPasswordProbe = runBootstrapProbe(probeRoot, "", initialUsername);

  try {
    assert.equal(missingPasswordProbe.status, 0, missingPasswordProbe.stderr || missingPasswordProbe.stdout);
    assert.deepEqual(readProbeResult(missingPasswordProbe), {
      ok: false,
      message: "SUPER_ADMIN_PASSWORD is required to create the initial super administrator. Set it in the local .env file or the deployment secret store before first launch.",
    });
    assert.doesNotMatch(missingPasswordProbe.stdout, /generated password|password:/i, "startup output must not disclose a bootstrap credential");

    const configuredPasswordProbe = runBootstrapProbe(probeRoot, probePassword, initialUsername);
    assert.equal(configuredPasswordProbe.status, 0, configuredPasswordProbe.stderr || configuredPasswordProbe.stdout);
    assert.deepEqual(readProbeResult(configuredPasswordProbe), { ok: true });
    assert.doesNotMatch(configuredPasswordProbe.stdout, new RegExp(probePassword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "startup output must not contain the configured bootstrap credential");

    const existingInstallProbe = runBootstrapProbe(probeRoot, "", changedUsername);
    assert.equal(existingInstallProbe.status, 0, existingInstallProbe.stderr || existingInstallProbe.stdout);
    assert.deepEqual(readProbeResult(existingInstallProbe), { ok: true });

    const database = new Database(path.join(probeRoot, "bootstrap-password-required.db"), { readonly: true });
    try {
      assert.deepEqual(
        database.prepare(`
SELECT username, protected_user
FROM users
ORDER BY username;
`).all(),
        [{ username: initialUsername, protected_user: "yes" }],
        "changing SUPER_ADMIN_USERNAME after first install must neither rename the protected identity nor create another user",
      );
      assert.equal(
        database.prepare("SELECT COUNT(*) AS count FROM user_role_assignments WHERE role_id = 'super_admin';").get().count,
        1,
        "an environment username change must retain exactly one super-admin assignment",
      );
    } finally {
      database.close();
    }
  } finally {
    await fs.rm(probeRoot, { recursive: true, force: true });
  }
}

async function assertExistingInstallationDoesNotInventAdministrator() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-existing-install-bootstrap-"));
  const databaseFile = path.join(probeRoot, "bootstrap-password-required.db");
  const configuredUsername = "must-not-be-created@example.test";

  try {
    const initialProbe = runBootstrapProbe(probeRoot);
    assert.equal(initialProbe.status, 0, initialProbe.stderr || initialProbe.stdout);
    assert.equal(readProbeResult(initialProbe).ok, false, "the initial passwordless probe should create the schema but not a user");

    const database = new Database(databaseFile);
    try {
      const workspace = database.prepare("SELECT workspace_id FROM workspaces ORDER BY created_at, workspace_id LIMIT 1;").get();
      assert.ok(workspace?.workspace_id);
      database.prepare(`
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
  'existing-install-user',
  @workspaceId,
  'existing-user@example.test',
  'Existing User',
  NULL,
  'America/New_York',
  '!not-a-login-credential!',
  'light',
  'active',
  'no',
  @workspaceId
);
`).run({ workspaceId: workspace.workspace_id });
    } finally {
      database.close();
    }

    const updateProbe = runBootstrapProbe(
      probeRoot,
      "Existing-Install-Must-Not-Create-123!",
      configuredUsername,
    );
    assert.equal(updateProbe.status, 0, updateProbe.stderr || updateProbe.stdout);
    assert.deepEqual(readProbeResult(updateProbe), { ok: true });

    const verification = new Database(databaseFile, { readonly: true });
    try {
      assert.deepEqual(
        verification.prepare("SELECT username, protected_user FROM users ORDER BY username;").all(),
        [{ username: "existing-user@example.test", protected_user: "no" }],
        "startup over an existing nonempty installation must not invent a configured administrator",
      );
      assert.equal(
        verification.prepare("SELECT COUNT(*) AS count FROM user_role_assignments WHERE role_id = 'super_admin';").get().count,
        0,
      );
    } finally {
      verification.close();
    }
  } finally {
    await fs.rm(probeRoot, { recursive: true, force: true });
  }
}

function runBootstrapProbe(probeRoot, password = "", username = "missing-bootstrap-password@example.test") {
  const databaseFile = path.join(probeRoot, "bootstrap-password-required.db");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "SUPER_ADMIN_PASSWORD"),
  );
  Object.assign(env, {
    LONGTAIL_DATA_DIR: probeRoot,
    LONGTAIL_DATABASE_FILE: databaseFile,
    LONGTAIL_ENV: "development",
    SUPER_ADMIN_USERNAME: username,
  });
  if (password) {
    env.SUPER_ADMIN_PASSWORD = password;
  }

  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { closeDatabase, initializeDatabase } = await import("./src/db/index.js");
    try {
      await initializeDatabase();
      console.log(JSON.stringify({ ok: true }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, message: error.message }));
    } finally {
      await closeDatabase();
    }
  `], {
    cwd: rootDir,
    encoding: "utf8",
    env,
  });
}

function readProbeResult(probe) {
  return JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1));
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
