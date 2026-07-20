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
import Database from "better-sqlite3";
import {
  assertOperatorPassword,
  resolveSeedTarget,
} from "../../lib/development-data-safety.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-development-data-regression-"));
const markedRoot = path.join(root, "development-seed");
const firstDir = path.join(markedRoot, "first");
const secondDir = path.join(markedRoot, "second");
const demoDir = path.join(root, "sanitized-demo", "preview");
const password = "Regression-Only-Seed-Operator-17!";

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

  const first = runSeed(firstDir, password);
  const second = runSeed(secondDir, "Regression-Only-Seed-Operator-18!");
  const demo = runSeed(demoDir, "Regression-Only-Demo-Operator-19!", "sanitized-demo");
  assert.equal(first.semanticFingerprint, second.semanticFingerprint, "semantic seed output should be reproducible across fresh bootstrap IDs and unique operator passwords");
  assert.equal(first.semanticFingerprint, demo.semanticFingerprint, "sanitized demo data should use the same reproducible fake scenario contract");
  assert.equal(demo.profile, "sanitized-demo");
  assert.deepEqual(first.counts, second.counts);
  assert.equal(first.counts.workspaces, 3);
  assert.equal(first.counts.tasks, 12);
  assert.equal(first.counts.notes, 4);
  assert.equal(first.counts.lists, 5);
  assert.equal(first.counts.active_work_timers, 2);
  assert.equal(first.counts.time_entries, 2);
  assert.equal(first.workbench.focusSelectionUrl, "workbench.html");
  assert.match(first.workbench.taskFocusUrl, /^workbench\.html\?taskId=/);
  assert.equal(first.workbench.secureNotesSeeded, false);
  assert.equal(first.workbench.personaLoginEnabled, false);
  assert.doesNotMatch(JSON.stringify(first), /Regression-Only-Seed-Operator/);

  const database = new Database(path.join(firstDir, "longtail-forge.db"), { readonly: true });
  try {
    const earliestWorkspace = database.prepare("SELECT workspace_id, workspace_type FROM workspaces ORDER BY created_at, workspace_id LIMIT 1").get();
    const operator = database.prepare("SELECT home_workspace_id FROM users WHERE protected_user = 'yes' LIMIT 1").get();
    assert.equal(earliestWorkspace.workspace_type, "business", "startup must retain the Business bootstrap workspace as the deterministic first workspace");
    assert.equal(operator.home_workspace_id, earliestWorkspace.workspace_id, "startup super-admin lookup must remain anchored to the operator's Business workspace");
    const taskStates = database.prepare("SELECT status, due_date, recurrence_template_id, next_action, blocked_reason, resume_note FROM tasks").all();
    assert.ok(taskStates.some((row) => row.status === "blocked" && row.blocked_reason));
    assert.ok(taskStates.some((row) => row.status === "completed"));
    assert.ok(taskStates.some((row) => row.due_date === null));
    assert.ok(taskStates.some((row) => row.recurrence_template_id));
    assert.ok(taskStates.some((row) => row.next_action && row.resume_note));
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM users WHERE protected_user = 'no' AND (user_status != 'inactive' OR password != ?)").get("!development-persona-login-disabled!").count, 0);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    database.close();
  }
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
  assert.doesNotMatch(source, /Scale-Seed-Password|LONGTAIL_SECURE_NOTES_MASTER_KEY\s*=/);
  assert.match(source, /personaLoginEnabled:\s*false/);
  assert.match(source, /secureNotesSeeded:\s*false/);
  assert.match(source, /focusSelectionUrl:\s*"workbench\.html"/);
  assert.match(source, /taskFocusUrl:/);

  console.log("Development and sanitized demo data regression passed.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

function runSeed(dataDir, operatorPassword, profile = "development") {
  const result = spawnCli(["seed", "--profile", profile, "--environment", "development", "--data-dir", dataDir], operatorPassword);
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
}

function spawnCli(args, operatorPassword) {
  return spawnSync(process.execPath, ["scripts/development-data.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, LONGTAIL_ENV: "development", SUPER_ADMIN_PASSWORD: operatorPassword },
  });
}
