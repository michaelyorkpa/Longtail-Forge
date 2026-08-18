export const regressionMeta = Object.freeze({
  id: "database.development-data-seed",
  area: "database",
  tier: "release-gate",
  tags: ["demo", "development", "files", "permissions", "seed", "sqlite"],
  description: "Proves deterministic rich development/demo data, safe reset ownership, disabled persona logins, and production/live target refusal.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { verifyPassword } from "../../../src/security/passwords.js";
import {
  assertOperatorPassword,
  resolveSeedTarget,
} from "../../lib/development-data-safety.mjs";
import {
  loadSanitizedDemoRoleFixtures,
  LOCAL_ROLE_FIXTURE_MODE,
  ROLE_CREDENTIALS_FILE_ENV,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "../../lib/sanitized-demo-role-fixtures.mjs";

if (process.argv.includes("--exercise-seeded-task-timers")) {
  await exerciseSeededTaskTimers();
  process.exit(0);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-development-data-regression-"));
const markedRoot = path.join(root, "development-seed");
const firstDir = path.join(markedRoot, "first");
const secondDir = path.join(markedRoot, "second");
const demoDir = path.join(root, "sanitized-demo", "preview");
const secondDemoDir = path.join(root, "sanitized-demo", "second-preview");
const credentialsDir = path.join(root, "credentials");
const demoCredentialsFile = path.join(credentialsDir, "demo-roles.json");
const secondDemoCredentialsFile = path.join(credentialsDir, "demo-roles-second.json");
const repositoryCredentialFile = path.join(
  process.cwd(),
  ".local",
  `sanitized-demo-role-regression-${process.pid}.json`,
);
const password = "Regression-Only-Seed-Operator-17!";
const operatorUsername = "seed-operator@example.test";

try {
  await fs.mkdir(credentialsDir, { recursive: true });
  await writeRoleCredentials(demoCredentialsFile, "First");
  await writeRoleCredentials(secondDemoCredentialsFile, "Second");
  await fs.mkdir(path.dirname(repositoryCredentialFile), { recursive: true });
  await writeRoleCredentials(repositoryCredentialFile, "Ignored");
  await assert.doesNotReject(loadSanitizedDemoRoleFixtures({
    env: {
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://localhost:8001",
      [ROLE_CREDENTIALS_FILE_ENV]: repositoryCredentialFile,
    },
    mode: LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }));
  assert.throws(() => resolveSeedTarget({ profile: "development", environment: "production", dataDir: firstDir }), /environment development/);
  assert.throws(() => resolveSeedTarget({ profile: "development", environment: "development", dataDir: path.join(root, "ordinary") }), /exact development marker/);
  assert.throws(() => resolveSeedTarget({ profile: "development", environment: "development", dataDir: path.join(root, "production", "development-seed") }), /production\/live/);
  assert.throws(() => resolveSeedTarget({ profile: "development", environment: "development", dataDir: firstDir, database: path.join(root, "outside.db") }), /child of the marked data directory/);

  const previousEnvironment = process.env.LONGTAIL_ENV;
  process.env.LONGTAIL_ENV = "production";
  assert.throws(() => resolveSeedTarget({ profile: "development", environment: "development", dataDir: firstDir }), /LONGTAIL_ENV=production/);
  if (previousEnvironment === undefined) delete process.env.LONGTAIL_ENV;
  else process.env.LONGTAIL_ENV = previousEnvironment;

  assert.throws(() => assertOperatorPassword({ SUPER_ADMIN_PASSWORD: "Shared-Password-Value-1!" }), /unique local value/);
  assert.doesNotThrow(() => assertOperatorPassword({ SUPER_ADMIN_PASSWORD: password }));

  const first = runSeed(firstDir, password, "development", operatorUsername, demoCredentialsFile);
  const second = runSeed(secondDir, "Regression-Only-Seed-Operator-18!", "development", operatorUsername, secondDemoCredentialsFile);
  const demo = runSeed(demoDir, password, "sanitized-demo", operatorUsername, demoCredentialsFile);
  const secondDemo = runSeed(secondDemoDir, password, "sanitized-demo", operatorUsername, secondDemoCredentialsFile);
  assert.equal(first.semanticFingerprint, second.semanticFingerprint, "semantic seed output should be reproducible across fresh bootstrap IDs and unique operator passwords");
  assert.equal(demo.semanticFingerprint, secondDemo.semanticFingerprint, "sanitized-demo role fixtures should be reproducible across unique private passwords");
  assert.notEqual(first.semanticFingerprint, demo.semanticFingerprint, "sanitized-demo role identities should be an explicit semantic addition to the login-disabled development profile");
  assert.equal(demo.profile, "sanitized-demo");
  assert.deepEqual(first.counts, second.counts);
  assert.deepEqual(demo.counts, secondDemo.counts);
  assert.equal(first.counts.workspaces, 5);
  assert.equal(first.counts.tasks, 400);
  assert.equal(first.counts.users, 25);
  assert.equal(demo.counts.users, 24);
  assert.equal(first.counts.notes, 200);
  assert.equal(first.counts.lists, 24);
  assert.equal(first.counts.active_work_timers, 2);
  assert.equal(first.counts.time_entries, 602);
  assert.equal(first.search.backend, "sqlite");
  assert.equal(first.search.rebuiltCount, first.counts.search_index);
  assert.equal(first.workbench.focusSelectionUrl, "workbench.html");
  assert.match(first.workbench.taskFocusUrl, /^workbench\.html\?taskId=/);
  assert.equal(first.workbench.secureNotesSeeded, false);
  assert.equal(first.workbench.personaLoginEnabled, true);
  assert.equal(first.workbench.roleFixtureLoginCount, 7);
  assert.equal(demo.workbench.personaLoginEnabled, true);
  assert.equal(demo.workbench.roleFixtureLoginCount, 7);
  assert.doesNotMatch(JSON.stringify(first), /Regression-Only-Seed-Operator/);
  assert.doesNotMatch(JSON.stringify(demo), /First-Private|Second-Private/);

  const database = new Database(path.join(firstDir, "longtail-forge.db"), { readonly: true });
  try {
    const earliestWorkspace = /** @type {{ workspace_id: string, workspace_type: string }} */ (database.prepare("SELECT workspace_id, workspace_type FROM workspaces ORDER BY created_at, workspace_id LIMIT 1").get());
    const operator = /** @type {{ home_workspace_id: string, username: string }} */ (database.prepare("SELECT home_workspace_id, username FROM users WHERE protected_user = 'yes' LIMIT 1").get());
    assert.equal(earliestWorkspace.workspace_type, "business", "startup must retain the Business bootstrap workspace as the deterministic first workspace");
    assert.equal(operator.home_workspace_id, earliestWorkspace.workspace_id, "startup super-admin lookup must remain anchored to the operator's Business workspace");
    assert.equal(operator.username, operatorUsername, "explicit process configuration must win when the seed CLI loads the root .env");
    const taskStates = database.prepare("SELECT status, due_date, recurrence_template_id, next_action, blocked_reason, resume_note FROM tasks").all();
    assert.ok(taskStates.some((row) => row.status === "blocked" && row.blocked_reason));
    assert.ok(taskStates.some((row) => row.status === "complete"), "seeded tasks must use the canonical complete status token");
    assert.ok(taskStates.some((row) => row.status === "archived"));
    assert.ok(taskStates.some((row) => row.due_date === null));
    assert.ok(taskStates.some((row) => row.recurrence_template_id));
    assert.ok(taskStates.some((row) => row.next_action && row.resume_note));
    /** @typedef {Record<string, unknown> & { timer_status: string, task_title: string, source_metadata_json: string }} SeededTaskTimerRow */
    const taskTimers = /** @type {SeededTaskTimerRow[]} */ (database.prepare(`
      SELECT
        active_work_timers.*,
        tasks.title AS task_title,
        tasks.status AS task_status,
        tasks.client_id AS task_client_id,
        tasks.project_id AS task_project_id,
        clients.name AS expected_client_name,
        projects.name AS expected_project_name
      FROM active_work_timers
      JOIN tasks
        ON tasks.workspace_id = active_work_timers.workspace_id
       AND tasks.task_id = active_work_timers.source_id
      JOIN users ON users.user_id = active_work_timers.user_id
      JOIN workspaces ON workspaces.workspace_id = active_work_timers.workspace_id
      LEFT JOIN clients
        ON clients.workspace_id = active_work_timers.workspace_id
       AND clients.id = active_work_timers.client_id
      JOIN projects
        ON projects.workspace_id = active_work_timers.workspace_id
       AND projects.id = active_work_timers.project_id
      WHERE active_work_timers.source_module_id = 'tasks'
        AND active_work_timers.source_type = 'task'
      ORDER BY tasks.title
    `).all());
    assert.equal(taskTimers.length, 2, "both seeded timers should join to their Task, user, workspace, and readable context");
    for (const timer of taskTimers) {
      assert.ok(["running", "paused"].includes(timer.timer_status), "seeded Task timers must use canonical status tokens");
      assert.equal(timer.timer_slot, `source:tasks:task:${timer.source_id}`, "seeded Task timers must use the canonical sourced slot");
      assert.equal(timer.task_status, "in_progress", "timer evidence must agree with the Task lifecycle state");
      assert.equal(timer.client_id, timer.task_client_id);
      assert.equal(timer.project_id, timer.task_project_id);
      assert.equal(timer.client_name, timer.expected_client_name);
      assert.equal(timer.project_name, timer.expected_project_name);
      assert.equal(timer.source_label, timer.task_title);
      assert.equal(timer.description, timer.task_title);
      assert.equal(timer.source_url, `tasks.html?task=${timer.source_id}`);
      assert.equal(Boolean(timer.last_active_start_time), timer.timer_status === "running");
      const metadata = JSON.parse(timer.source_metadata_json);
      assert.equal(metadata.fake, true);
      assert.equal(typeof metadata.taskTimerStatusTransition?.movedTaskToInProgress, "boolean");
      assert.ok(["open", "in_progress"].includes(metadata.taskTimerStatusTransition?.previousStatus));
    }
    const runningTransition = JSON.parse(/** @type {SeededTaskTimerRow} */ (taskTimers.find((timer) => timer.task_title === "Validate POS receipt layout")).source_metadata_json).taskTimerStatusTransition;
    assert.deepEqual(runningTransition, {
      movedTaskToInProgress: true,
      movedTaskFromOpen: true,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "open",
    });
    const pausedTransition = JSON.parse(/** @type {SeededTaskTimerRow} */ (taskTimers.find((timer) => timer.task_title === "Fix mobile checkout overlap")).source_metadata_json).taskTimerStatusTransition;
    assert.deepEqual(pausedTransition, {
      movedTaskToInProgress: false,
      movedTaskFromOpen: false,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "in_progress",
    });
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL").get()).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM users WHERE protected_user = 'no' AND username NOT LIKE 'role-%@example.test' AND (user_status != 'inactive' OR password != ?)").get("!development-persona-login-disabled!")).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM search_index_fts").get()).count, first.counts.search_index, "the backend Search index must materialize every canonical seed document");
    assert.ok(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM search_index_fts WHERE search_index_fts MATCH 'checkout'").get()).count > 0, "the fictional checkout scenario must be discoverable through SQLite FTS");
    assert.deepEqual(database.prepare("SELECT extension FROM files ORDER BY storage_key").all(), [{ extension: ".md" }, { extension: ".txt" }], "seeded Files must retain the canonical dotted extension used by preview classification");
    assertSeedIdentifierCompatibility(database, earliestWorkspace, operator);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    database.close();
  }
  await verifyRoleFixtureDatabase(firstDir, demoCredentialsFile, [operatorUsername]);
  await verifyRoleFixtureDatabase(demoDir, demoCredentialsFile);
  runSeededTimerLifecycle(secondDir, "Regression-Only-Seed-Operator-18!");
  assert.equal(await fs.readFile(path.join(firstDir, "files", "seed", "checkout-findings.md"), "utf8"), "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n");

  const duplicate = spawnCli(["seed", "--profile", "development", "--environment", "development", "--data-dir", firstDir, "--role-fixtures", LOCAL_ROLE_FIXTURE_MODE], password, operatorUsername, demoCredentialsFile);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /non-empty marked data directory/);

  const wrongReset = spawnCli(["reset", "--profile", "development", "--environment", "development", "--data-dir", firstDir, "--confirm", "sanitized-demo"], password);
  assert.notEqual(wrongReset.status, 0);
  assert.match(wrongReset.stderr, /--confirm development-seed/);
  const reset = spawnCli(["reset", "--profile", "development", "--environment", "development", "--data-dir", firstDir, "--confirm", "development-seed"], password);
  assert.equal(reset.status, 0, reset.stderr || reset.stdout);
  await assert.rejects(fs.access(firstDir));

  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
  for (const command of ["dev:data:seed", "dev:data:reset", "demo:data:seed", "demo:data:reset"]) {
    assert.ok(packageJson.scripts[command], `${command} should be independently runnable`);
  }
  assert.match(packageJson.scripts["demo:data:seed"], /sanitized-demo/);
  assert.match(packageJson.scripts["dev:data:seed"], /--role-fixtures local-sanitized-demo/);
  const demoTarget = resolveSeedTarget({ profile: "sanitized-demo", environment: "development", dataDir: path.join(root, "sanitized-demo", "preview") });
  assert.equal(demoTarget.marker, "sanitized-demo");
  const fixtureEnv = {
    LONGTAIL_ENV: "development",
    LONGTAIL_PUBLIC_URL: "http://localhost:8001",
    [ROLE_CREDENTIALS_FILE_ENV]: demoCredentialsFile,
  };
  const developmentFixtures = await loadSanitizedDemoRoleFixtures({
    env: fixtureEnv,
    mode: LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: "development" },
  });
  assert.equal(developmentFixtures.usesBootstrapSuperAdmin, false);
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: fixtureEnv,
      mode: null,
      target: { profile: "development" },
    }),
    /development seeding requires --role-fixtures/i,
  );
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, LONGTAIL_ENV: "production" },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /LONGTAIL_ENV=development/,
  );
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, LONGTAIL_PUBLIC_URL: "https://preview.example.test" },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /local loopback/,
  );
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, LONGTAIL_RELEASE_BRANCH: "nightly" },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /release\/deployment runtime/,
  );
  const duplicateCredentialFile = path.join(credentialsDir, "duplicate.json");
  await writeRoleCredentials(duplicateCredentialFile, "Duplicate", {
    project_user: rolePassword("Duplicate", 0),
  });
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, [ROLE_CREDENTIALS_FILE_ENV]: duplicateCredentialFile },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /must be unique/,
  );
  const weakCredentialFile = path.join(credentialsDir, "weak.json");
  await writeRoleCredentials(weakCredentialFile, "Weak", { client_user: "weak" });
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, [ROLE_CREDENTIALS_FILE_ENV]: weakCredentialFile },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /at least 16 characters/,
  );
  const missingCredentialFile = path.join(credentialsDir, "missing.json");
  await assert.rejects(
    loadSanitizedDemoRoleFixtures({
      env: { ...fixtureEnv, [ROLE_CREDENTIALS_FILE_ENV]: missingCredentialFile },
      mode: LOCAL_ROLE_FIXTURE_MODE,
      target: { profile: "sanitized-demo" },
    }),
    /Create the ignored local credential file/,
  );

  const missingFixtureMode = spawnCli([
    "seed",
    "--profile",
    "sanitized-demo",
    "--environment",
    "development",
    "--data-dir",
    path.join(root, "sanitized-demo", "missing-mode"),
  ], password, operatorUsername, demoCredentialsFile);
  assert.notEqual(missingFixtureMode.status, 0);
  assert.match(missingFixtureMode.stderr, /--role-fixtures local-sanitized-demo/);
  const commandLineSecret = spawnCli([
    "seed",
    "--profile",
    "sanitized-demo",
    "--environment",
    "development",
    "--data-dir",
    path.join(root, "sanitized-demo", "command-line-secret"),
    "--password",
    "Never-Accept-This-Secret-1!",
  ], password, operatorUsername, demoCredentialsFile);
  assert.notEqual(commandLineSecret.status, 0);
  assert.match(commandLineSecret.stderr, /Unknown argument: --password/);

  const source = await fs.readFile("scripts/development-data.mjs", "utf8");
  const credentialSource = await fs.readFile("scripts/lib/sanitized-demo-role-fixtures.mjs", "utf8");
  const gitignore = await fs.readFile(".gitignore", "utf8");
  assert.match(
    source,
    /import \{ loadRuntimeEnvFile \} from "\.\.\/src\/runtime-env\.js";[\s\S]*loadRuntimeEnvFile\(\);[\s\S]*assertOperatorPassword\(\);/,
    "the seed CLI must load the root .env before validating bootstrap configuration",
  );
  assert.doesNotMatch(source, /Scale-Seed-Password|LONGTAIL_SECURE_NOTES_MASTER_KEY\s*=/);
  assert.match(source, /personaLoginEnabled:\s*Boolean\(roleFixtures\)/);
  assert.match(source, /roleFixtureLoginCount:/);
  assert.match(source, /secureNotesSeeded:\s*false/);
  assert.match(source, /focusSelectionUrl:\s*"workbench\.html"/);
  assert.match(source, /taskFocusUrl:/);
  assert.match(source, /--role-fixtures/);
  assert.doesNotMatch(source, /--password|--credential|--secret/);
  assert.match(credentialSource, /LONGTAIL_SANITIZED_DEMO_ROLE_CREDENTIALS_FILE/);
  assert.match(credentialSource, /validatePassword/);
  assert.match(credentialSource, /Every sanitized-demo role password must be unique/);
  assert.match(gitignore, /^\.local\/$/m);
  assert.match(packageJson.scripts["demo:data:seed"], /--role-fixtures local-sanitized-demo/);

  console.log("Development and sanitized demo data regression passed.");
} finally {
  await fs.rm(repositoryCredentialFile, { force: true });
  await fs.rm(root, { recursive: true, force: true });
}

function assertSeedIdentifierCompatibility(database, earliestWorkspace, operator) {
  assertUuidVersion(earliestWorkspace.workspace_id, 7, "fresh bootstrap workspace");
  const operatorId = database.prepare("SELECT user_id FROM users WHERE username = ?").get(operator.username).user_id;
  assertUuidVersion(operatorId, 7, "fresh bootstrap operator");

  const client = database.prepare("SELECT id, workspace_id FROM clients ORDER BY name LIMIT 1").get();
  const project = database.prepare("SELECT id, client_id FROM projects WHERE client_id = ? ORDER BY name LIMIT 1").get(client.id);
  const taskId = database.prepare("SELECT task_id FROM tasks ORDER BY title LIMIT 1").get().task_id;
  const representativeIds = [
    [client.id, "deterministic development Client"],
    [project.id, "deterministic development Project"],
    [taskId, "deterministic development Task"],
    [database.prepare("SELECT note_id FROM notes ORDER BY title LIMIT 1").get().note_id, "deterministic development Note"],
    [database.prepare("SELECT list_id FROM lists ORDER BY title LIMIT 1").get().list_id, "deterministic development List"],
  ];
  representativeIds.forEach(([value, label]) => assertUuidVersion(value, 4, label));
  assert.equal(project.client_id, client.id, "deterministic UUIDv4 seed relationships must remain intact beneath a UUIDv7 bootstrap workspace");
  const indexedTask = database.prepare("SELECT record_id FROM search_index WHERE record_type = 'task' AND record_id = ?").get(taskId);
  assert.deepEqual(indexedTask, { record_id: taskId }, "Search must retain the deterministic seed Task UUIDv4 byte-for-byte");
}

function assertUuidVersion(value, version, label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(version), `${label} should use UUIDv${version}`);
}

function runSeed(dataDir, operatorPassword, profile = "development", username = operatorUsername, credentialsFile) {
  const args = ["seed", "--profile", profile, "--environment", "development", "--data-dir", dataDir];
  args.push("--role-fixtures", LOCAL_ROLE_FIXTURE_MODE);
  const result = spawnCli(args, operatorPassword, username, credentialsFile);
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
}

function spawnCli(args, operatorPassword, username = operatorUsername, credentialsFile) {
  const env = {
    ...process.env,
    LONGTAIL_ENV: "development",
    LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
    LONGTAIL_RELEASE_BRANCH: "",
    SUPER_ADMIN_PASSWORD: operatorPassword,
    SUPER_ADMIN_USERNAME: username,
  };
  if (credentialsFile) {
    env[ROLE_CREDENTIALS_FILE_ENV] = credentialsFile;
  } else {
    delete env[ROLE_CREDENTIALS_FILE_ENV];
  }
  return spawnSync(process.execPath, ["scripts/development-data.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
}

async function writeRoleCredentials(file, prefix, overrides = {}) {
  const passwords = Object.fromEntries(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture, index) => [
    fixture.roleId,
    overrides[fixture.roleId] ?? rolePassword(prefix, index),
  ]));
  await fs.writeFile(file, `${JSON.stringify({ version: 1, passwords }, null, 2)}\n`, "utf8");
}

function rolePassword(prefix, index) {
  return `Q${index}a!${prefix}-Private-92746zZ`;
}

async function verifyRoleFixtureDatabase(dataDir, credentialsFile, expectedExtraActiveUsernames = []) {
  const credentialDocument = JSON.parse(await fs.readFile(credentialsFile, "utf8"));
  const database = new Database(path.join(dataDir, "longtail-forge.db"), { readonly: true });
  try {
    const activeUsers = database.prepare(`
SELECT user_id, username, password, protected_user
FROM users
WHERE user_status = 'active'
ORDER BY username;
`).all();
    assert.equal(activeUsers.length, SANITIZED_DEMO_ROLE_FIXTURES.length + expectedExtraActiveUsernames.length);
    assert.deepEqual(
      activeUsers.filter((row) => !expectedExtraActiveUsernames.includes(row.username)).map((row) => row.username),
      SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => fixture.username).sort(),
    );
    for (const username of expectedExtraActiveUsernames) {
      assert.ok(activeUsers.some((row) => row.username === username && row.protected_user === "yes"));
    }

    for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
      const user = activeUsers.find((row) => row.username === fixture.username);
      assert.ok(user, `${fixture.roleId} fixture user should exist`);
      assert.equal(
        (await verifyPassword(credentialDocument.passwords[fixture.roleId], user.password)).matches,
        true,
      );
      assert.equal(user.protected_user, fixture.roleId === "super_admin" ? "yes" : "no");

      const assignments = database.prepare(`
SELECT
  assignment.role_id,
  assignment.scope_type,
  assignment.scope_id,
  assignment.permission_overrides_json,
  workspace.name AS workspace_name,
  client.name AS client_name,
  project.name AS project_name
FROM user_role_assignments AS assignment
JOIN workspaces AS workspace ON workspace.workspace_id = assignment.workspace_id
LEFT JOIN clients AS client
  ON client.workspace_id = assignment.workspace_id
 AND client.id = assignment.scope_id
LEFT JOIN projects AS project
  ON project.workspace_id = assignment.workspace_id
 AND project.id = assignment.scope_id
WHERE assignment.user_id = ?
ORDER BY assignment.assignment_id;
`).all(user.user_id);
      assert.equal(assignments.length, 1, `${fixture.roleId} should have exactly one role assignment`);
      const [assignment] = assignments;
      assert.equal(assignment.role_id, fixture.roleId);
      assert.equal(assignment.scope_type, fixture.scopeType);
      assert.equal(assignment.permission_overrides_json, null);
      if (fixture.scopeKey === "all") assert.equal(assignment.scope_id, "all");
      if (fixture.scopeKey === "northwind") assert.equal(assignment.workspace_name, "Northwind Studio");
      if (fixture.scopeKey === "cedar") assert.equal(assignment.client_name, "Cedar & Bloom");
      if (fixture.scopeKey === "website") assert.equal(assignment.project_name, "Website Refresh");

      const memberships = database.prepare(`
SELECT workspaces.name, user_workspaces.status
FROM user_workspaces
JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = ?;
`).all(user.user_id);
      if (fixture.roleId !== "super_admin") {
        assert.deepEqual(memberships, [{ name: "Northwind Studio", status: "active" }]);
      }
    }

    assert.equal(
      /** @type {{ count: number }} */ (database.prepare(`
SELECT COUNT(*) AS count
FROM users
WHERE protected_user = 'no'
  AND username NOT LIKE 'role-%@example.test'
  AND (user_status != 'inactive' OR password != '!development-persona-login-disabled!');
`).get()).count,
      0,
      "ordinary fictional personas must remain inactive",
    );
    assert.equal(
      /** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM users WHERE username LIKE 'role-%@example.test' AND alt_email IS NOT NULL AND alt_email != ''").get()).count,
      0,
      "active role fixtures must not reuse realistic alternate addresses",
    );
    assert.equal(
      /** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL").get()).count,
      0,
    );
    assert.ok(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM files").get()).count >= 2);
    assert.ok(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM search_index_fts WHERE search_index_fts MATCH 'checkout'").get()).count > 0);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
}

function runSeededTimerLifecycle(dataDir, operatorPassword) {
  const childEnv = {
    ...process.env,
    LONGTAIL_DATA_DIR: dataDir,
    LONGTAIL_DATABASE_FILE: path.join(dataDir, "longtail-forge.db"),
    LONGTAIL_DATABASE_PROVIDER: "sqlite",
    LONGTAIL_ENV: "development",
    LONGTAIL_LOCAL_STORAGE_ROOT: path.join(dataDir, "files"),
    SUPER_ADMIN_PASSWORD: operatorPassword,
  };
  delete childEnv.LTF_REGRESSION_BASELINE_DB;
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--exercise-seeded-task-timers"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
}

async function exerciseSeededTaskTimers() {
  const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../../../src/db/index.js");
  const { taskTimersService } = await import("../../../src/modules/tasks/task-timers.service.js");

  try {
    await initializeDatabase();
    const seededRows = await querySql(`
SELECT
  tasks.task_id,
  tasks.title,
  tasks.workspace_id,
  tasks.status AS task_status,
  users.user_id,
  users.username,
  users.timezone,
  users.home_workspace_id
FROM tasks
JOIN active_work_timers
  ON active_work_timers.workspace_id = tasks.workspace_id
 AND active_work_timers.source_module_id = 'tasks'
 AND active_work_timers.source_type = 'task'
 AND active_work_timers.source_id = tasks.task_id
JOIN users ON users.user_id = active_work_timers.user_id
WHERE tasks.title IN ('Validate POS receipt layout', 'Fix mobile checkout overlap')
ORDER BY tasks.title;
`);
    assert.equal(seededRows.length, 2, "the lifecycle probe requires both deterministic seeded task timers");

    const sessionUser = seededRows[0];
    assert.ok(seededRows.every((row) => row.user_id === sessionUser.user_id && row.workspace_id === sessionUser.workspace_id));
    const session = /** @type {import("../../../src/types/task-workflow-contracts.js").TaskWorkflowSession} */ (/** @type {unknown} */ ({
      home_workspace_id: sessionUser.home_workspace_id,
      ip: "127.0.0.1",
      timezone: sessionUser.timezone || "America/New_York",
      user_id: sessionUser.user_id,
      username: sessionUser.username,
      workspace_id: sessionUser.workspace_id,
    }));
    const byTitle = new Map(seededRows.map((row) => [row.title, row]));
    const runningTask = /** @type {{ task_id: string }} */ (byTitle.get("Validate POS receipt layout"));
    const pausedTask = /** @type {{ task_id: string }} */ (byTitle.get("Fix mobile checkout overlap"));

    const started = await taskTimersService.save(runningTask.task_id, {
      accumulated_elapsed_seconds: 780,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    }, session);
    assert.equal(started.task.status, "in_progress");
    assert.equal(started.timer.timer_status, "running");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 1);

    const paused = await taskTimersService.save(runningTask.task_id, {
      accumulated_elapsed_seconds: 781,
      timer_status: "paused",
    }, session);
    assert.equal(paused.timer.timer_status, "paused");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 1);

    const seededReset = await taskTimersService.remove(runningTask.task_id, session);
    assert.equal(seededReset.removed, true);
    assert.equal(seededReset.task.status, "open", "Reset should honor the seeded prior-Open transition metadata when no independent work evidence exists");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 0);

    const restarted = await taskTimersService.save(runningTask.task_id, {
      accumulated_elapsed_seconds: 781,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    }, session);
    assert.equal(restarted.task.status, "in_progress");
    assert.equal(restarted.timer.timer_status, "running");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 1);

    const pausedAgain = await taskTimersService.save(runningTask.task_id, {
      accumulated_elapsed_seconds: 782,
      timer_status: "paused",
    }, session);
    assert.equal(pausedAgain.timer.timer_status, "paused");

    const resumed = await taskTimersService.save(runningTask.task_id, {
      accumulated_elapsed_seconds: 782,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    }, session);
    assert.equal(resumed.timer.timer_status, "running");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 1);

    const finalized = await taskTimersService.finalize(runningTask.task_id, {}, session);
    assert.equal(finalized.task_timer_removed, true);
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, runningTask.task_id), 0);
    const finalizedEntries = await querySql(`
SELECT COUNT(*) AS count
FROM time_entries
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND user_id = ${sqlText(session.user_id)}
  AND task_id = ${sqlText(runningTask.task_id)};
`);
    assert.ok(Number(finalizedEntries[0]?.count) >= 1, "Save Time should create a task-attributed time entry");

    const secondStarted = await taskTimersService.save(pausedTask.task_id, {
      accumulated_elapsed_seconds: 2460,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    }, session);
    assert.equal(secondStarted.timer.timer_status, "running");
    const secondPaused = await taskTimersService.save(pausedTask.task_id, {
      accumulated_elapsed_seconds: 2461,
      timer_status: "paused",
    }, session);
    assert.equal(secondPaused.timer.timer_status, "paused");
    const reset = await taskTimersService.remove(pausedTask.task_id, session);
    assert.equal(reset.removed, true);
    assert.equal(reset.task.status, "in_progress", "independent checklist/time evidence should keep the seeded Task in progress after Reset");
    assert.equal(await readSeededSourceTimerCount(querySql, sqlText, session, pausedTask.task_id), 0);

    console.log("Seeded task timer lifecycle probe passed.");
  } finally {
    await closeSqlite();
  }
}

async function readSeededSourceTimerCount(querySql, sqlText, session, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM active_work_timers
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND user_id = ${sqlText(session.user_id)}
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = ${sqlText(taskId)};
`);
  return Number(rows[0]?.count || 0);
}
