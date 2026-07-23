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
import {
  assertOperatorPassword,
  resolveSeedTarget,
} from "../../lib/development-data-safety.mjs";

if (process.argv.includes("--exercise-seeded-task-timers")) {
  await exerciseSeededTaskTimers();
  process.exit(0);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-development-data-regression-"));
const markedRoot = path.join(root, "development-seed");
const firstDir = path.join(markedRoot, "first");
const secondDir = path.join(markedRoot, "second");
const demoDir = path.join(root, "sanitized-demo", "preview");
const password = "Regression-Only-Seed-Operator-17!";
const operatorUsername = "seed-operator@example.test";

try {
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

  const first = runSeed(firstDir, password, "development", operatorUsername);
  const second = runSeed(secondDir, "Regression-Only-Seed-Operator-18!", "development", operatorUsername);
  const demo = runSeed(demoDir, "Regression-Only-Demo-Operator-19!", "sanitized-demo", operatorUsername);
  assert.equal(first.semanticFingerprint, second.semanticFingerprint, "semantic seed output should be reproducible across fresh bootstrap IDs and unique operator passwords");
  assert.equal(first.semanticFingerprint, demo.semanticFingerprint, "sanitized demo data should use the same reproducible fake scenario contract");
  assert.equal(demo.profile, "sanitized-demo");
  assert.deepEqual(first.counts, second.counts);
  assert.equal(first.counts.workspaces, 5);
  assert.equal(first.counts.tasks, 400);
  assert.equal(first.counts.users, 18);
  assert.equal(first.counts.notes, 200);
  assert.equal(first.counts.lists, 24);
  assert.equal(first.counts.active_work_timers, 2);
  assert.equal(first.counts.time_entries, 602);
  assert.equal(first.search.backend, "sqlite");
  assert.equal(first.search.rebuiltCount, first.counts.search_index);
  assert.equal(first.workbench.focusSelectionUrl, "workbench.html");
  assert.match(first.workbench.taskFocusUrl, /^workbench\.html\?taskId=/);
  assert.equal(first.workbench.secureNotesSeeded, false);
  assert.equal(first.workbench.personaLoginEnabled, false);
  assert.doesNotMatch(JSON.stringify(first), /Regression-Only-Seed-Operator/);

  const database = new Database(path.join(firstDir, "longtail-forge.db"), { readonly: true });
  try {
    const earliestWorkspace = database.prepare("SELECT workspace_id, workspace_type FROM workspaces ORDER BY created_at, workspace_id LIMIT 1").get();
    const operator = database.prepare("SELECT home_workspace_id, username FROM users WHERE protected_user = 'yes' LIMIT 1").get();
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
    const taskTimers = database.prepare(`
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
    `).all();
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
    const runningTransition = JSON.parse(taskTimers.find((timer) => timer.task_title === "Validate POS receipt layout").source_metadata_json).taskTimerStatusTransition;
    assert.deepEqual(runningTransition, {
      movedTaskToInProgress: true,
      movedTaskFromOpen: true,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "open",
    });
    const pausedTransition = JSON.parse(taskTimers.find((timer) => timer.task_title === "Fix mobile checkout overlap").source_metadata_json).taskTimerStatusTransition;
    assert.deepEqual(pausedTransition, {
      movedTaskToInProgress: false,
      movedTaskFromOpen: false,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "in_progress",
    });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users WHERE protected_user = 'no' AND (user_status != 'inactive' OR password != ?)").get("!development-persona-login-disabled!").count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM search_index_fts").get().count, first.counts.search_index, "the backend Search index must materialize every canonical seed document");
    assert.ok(database.prepare("SELECT COUNT(*) AS count FROM search_index_fts WHERE search_index_fts MATCH 'checkout'").get().count > 0, "the fictional checkout scenario must be discoverable through SQLite FTS");
    assert.deepEqual(database.prepare("SELECT extension FROM files ORDER BY storage_key").all(), [{ extension: ".md" }, { extension: ".txt" }], "seeded Files must retain the canonical dotted extension used by preview classification");
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    database.close();
  }
  runSeededTimerLifecycle(secondDir, "Regression-Only-Seed-Operator-18!");
  assert.equal(await fs.readFile(path.join(firstDir, "files", "seed", "checkout-findings.md"), "utf8"), "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n");

  const duplicate = spawnCli(["seed", "--profile", "development", "--environment", "development", "--data-dir", firstDir], password);
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
  const demoTarget = resolveSeedTarget({ profile: "sanitized-demo", environment: "development", dataDir: path.join(root, "sanitized-demo", "preview") });
  assert.equal(demoTarget.marker, "sanitized-demo");

  const source = await fs.readFile("scripts/development-data.mjs", "utf8");
  assert.match(
    source,
    /import \{ loadRuntimeEnvFile \} from "\.\.\/src\/runtime-env\.js";[\s\S]*loadRuntimeEnvFile\(\);[\s\S]*assertOperatorPassword\(\);/,
    "the seed CLI must load the root .env before validating bootstrap configuration",
  );
  assert.doesNotMatch(source, /Scale-Seed-Password|LONGTAIL_SECURE_NOTES_MASTER_KEY\s*=/);
  assert.match(source, /personaLoginEnabled:\s*false/);
  assert.match(source, /secureNotesSeeded:\s*false/);
  assert.match(source, /focusSelectionUrl:\s*"workbench\.html"/);
  assert.match(source, /taskFocusUrl:/);

  console.log("Development and sanitized demo data regression passed.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

function runSeed(dataDir, operatorPassword, profile = "development", username = operatorUsername) {
  const result = spawnCli(["seed", "--profile", profile, "--environment", "development", "--data-dir", dataDir], operatorPassword, username);
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
}

function spawnCli(args, operatorPassword, username = operatorUsername) {
  return spawnSync(process.execPath, ["scripts/development-data.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LONGTAIL_ENV: "development",
      SUPER_ADMIN_PASSWORD: operatorPassword,
      SUPER_ADMIN_USERNAME: username,
    },
  });
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
    const session = {
      home_workspace_id: sessionUser.home_workspace_id,
      ip: "127.0.0.1",
      timezone: sessionUser.timezone || "America/New_York",
      user_id: sessionUser.user_id,
      username: sessionUser.username,
      workspace_id: sessionUser.workspace_id,
    };
    const byTitle = new Map(seededRows.map((row) => [row.title, row]));
    const runningTask = byTitle.get("Validate POS receipt layout");
    const pausedTask = byTitle.get("Fix mobile checkout overlap");

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
