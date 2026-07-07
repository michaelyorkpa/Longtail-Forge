import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { clearInterval, setImmediate, setInterval } from "node:timers";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const appVersion = "0.33.5.29.5";
const scenarioArgIndex = process.argv.indexOf("--scenario");
const scannerSecretExecutable = "secret-clamscan-path";
const scannerSecretOutput = "Eicar-Test-Signature FOUND";

if (scenarioArgIndex !== -1) {
  await runLifecycleScenario(process.argv[scenarioArgIndex + 1] || "clean");
  process.exit(0);
}

assertStaticContracts();
await runAdapterOutcomeChecks();

const cleanLifecycle = runLifecycleChild("clean");
assert.equal(cleanLifecycle.status, "available", "clean clamscan result should make the file available");
assert.equal(cleanLifecycle.scanStatus, "passed", "clean clamscan result should mark scan passed");
assert.equal(cleanLifecycle.downloadText, "clamscan clean body", "clean files should remain downloadable after scan");
assert.equal(cleanLifecycle.storageText, "clamscan clean body", "clean files should remain in storage");

const infectedLifecycle = runLifecycleChild("infected");
assert.equal(infectedLifecycle.status, "quarantined", "infected clamscan result should quarantine the file");
assert.equal(infectedLifecycle.scanStatus, "failed", "infected clamscan result should mark scan failed");
assert.equal(infectedLifecycle.downloadBlocked, true, "infected files should not be downloadable");
assert.equal(infectedLifecycle.restoreBlocked, true, "infected files should require scanner-safe review before restore");
assert.equal(infectedLifecycle.storageText, "clamscan infected body", "infected files should not be auto-deleted");

const unavailableLifecycle = runLifecycleChild("unavailable");
assert.equal(unavailableLifecycle.status, "quarantined", "scanner unavailable should quarantine the file for review");
assert.equal(unavailableLifecycle.scanStatus, "error", "scanner unavailable should record scan error");
assert.equal(unavailableLifecycle.downloadBlocked, true, "scanner-unavailable files should not be downloadable");
assert.equal(unavailableLifecycle.storageText, "clamscan unavailable body", "scanner-unavailable files should not be auto-deleted");

console.log("File clamscan adapter regression passed.");

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const scannerAdapterSource = readText("src/core/files/scanner-adapter.js");
  const filesServiceSource = readText("src/services/files.service.js");
  const runtimeDiagnosticsSource = readText("src/services/runtime-diagnostics.service.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the clamscan adapter version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the clamscan adapter version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the clamscan adapter version");

  assert.match(scannerAdapterSource, /function createClamscanFileScannerAdapter/, "scanner adapter module should expose clamscan");
  assert.match(scannerAdapterSource, /CLAMSCAN_HEALTH_ARGS = Object\.freeze\(\["--version"\]\)/, "clamscan health should probe --version");
  assert.match(scannerAdapterSource, /CLAMSCAN_SCAN_ARGS = Object\.freeze\(\["--no-summary", "-"\]\)/, "clamscan scans should stream file bytes through stdin");
  assert.match(scannerAdapterSource, /Scanner timed out\./, "clamscan adapter should have timeout behavior");
  assert.match(scannerAdapterSource, /result: "infected"[\s\S]*scanStatus: "failed"/, "infected clamscan results should fail scan safely");
  assert.match(scannerAdapterSource, /scanner:\s*"clamscan"[\s\S]*exitCode/, "clamscan metadata should be bounded to safe scanner result fields");
  assert.doesNotMatch(scannerAdapterSource, /storageKey|storage_key|storagePath|protectedPath|clamscanPath|process\.env/, "clamscan adapter should not receive storage keys, paths, scanner config names, or raw env");
  assert.match(filesServiceSource, /"clamscan", createClamscanFileScannerAdapter\(\{ executablePath: config\.scanner\?\.clamscanPath \}\)/, "Files service should register clamscan from runtime config");
  assert.match(filesServiceSource, /status === "quarantined"[\s\S]*file\.quarantined/, "scan lifecycle should keep quarantine review behavior service-owned");
  assert.doesNotMatch(runtimeDiagnosticsSource, /clamscanPath|process\.env|storageKey|protectedPath/i, "runtime diagnostics must not expose clamscan paths or storage internals");
  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*`clamscan`[\s\S]*executable scanner adapter[\s\S]*executable paths/, "runtime docs should describe clamscan adapter redaction");
  assert.match(changelog, /clamscan[\s\S]*unavailable or timed-out scanner executions[\s\S]*without auto-deleting stored files/i, "tracked docs should record clamscan quarantine policy");
  assert.match(changelog, /## Version 0\.33\.5\.22\.9 - /, "changelog should include the clamscan adapter slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-clamscan-adapter-regression\.mjs/, "regression suite should include clamscan adapter coverage");
}

async function runAdapterOutcomeChecks() {
  const fake = {
    executablePath: path.join(os.tmpdir(), scannerSecretExecutable, "mock-clamscan.exe"),
  };
  const { createClamscanFileScannerAdapter } = await import("../src/core/files/scanner-adapter.js");

  try {
    const adapter = createClamscanFileScannerAdapter({
      executablePath: fake.executablePath,
      spawn: createMockClamscanSpawn(),
      timeoutMs: 10000,
    });

    process.env.LTF_FAKE_CLAMSCAN_RESULT = "clean";
    const health = await adapter.health();
    assert.deepEqual(health, { available: true, status: "ok" }, "fake clean scanner should be healthy");

    const clean = await adapter.scan(fakeFileContext("clean"));
    assert.equal(clean.status, "available");
    assert.equal(clean.scanStatus, "passed");
    assert.deepEqual(clean.metadata, { scanner: "clamscan", result: "clean", exitCode: 0 });

    process.env.LTF_FAKE_CLAMSCAN_RESULT = "infected";
    const infected = await adapter.scan(fakeFileContext("infected"));
    assert.equal(infected.status, "quarantined");
    assert.equal(infected.scanStatus, "failed");
    assert.match(infected.reason, /threat/i);
    assert.deepEqual(infected.metadata, { scanner: "clamscan", result: "infected", exitCode: 1 });
    assertSafeScannerResult(infected, fake);

    process.env.LTF_FAKE_CLAMSCAN_RESULT = "unavailable";
    const unavailableHealth = await adapter.health();
    assert.deepEqual(unavailableHealth, { available: false, status: "unavailable" }, "fake unavailable scanner should report unavailable health");
    const unavailable = await adapter.scan(fakeFileContext("unavailable"));
    assert.equal(unavailable.status, "quarantined");
    assert.equal(unavailable.scanStatus, "error");
    assert.match(unavailable.reason, /unavailable/i);
    assert.deepEqual(unavailable.metadata, { scanner: "clamscan", result: "unavailable", exitCode: 2 });
    assertSafeScannerResult(unavailable, fake);

    process.env.LTF_FAKE_CLAMSCAN_RESULT = "timeout";
    const timeoutAdapter = createClamscanFileScannerAdapter({
      executablePath: fake.executablePath,
      spawn: createMockClamscanSpawn(),
      timeoutMs: 150,
    });
    const timeout = await timeoutAdapter.scan(fakeFileContext("timeout"));
    assert.equal(timeout.status, "quarantined");
    assert.equal(timeout.scanStatus, "error");
    assert.match(timeout.reason, /timed out/i);
    assert.equal(timeout.metadata.scanner, "clamscan");
    assert.equal(timeout.metadata.result, "timeout");
    assertSafeScannerResult(timeout, fake);
  } finally {
    delete process.env.LTF_FAKE_CLAMSCAN_RESULT;
  }
}

async function runLifecycleScenario(outcome) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `ltf-clamscan-${outcome}-`));
  const fake = {
    executablePath: path.join(tempDir, scannerSecretExecutable, "unused-clamscan.exe"),
  };

  process.env.LONGTAIL_DATA_DIR = tempDir;
  process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, `longtail-forge-clamscan-${outcome}.db`);
  process.env.LONGTAIL_FILE_SCANNER = "clamscan";
  process.env.LONGTAIL_CLAMSCAN_PATH = fake.executablePath;
  process.env.LONGTAIL_WORKER_MODE = "disabled";
  process.env.SUPER_ADMIN_PASSWORD = `File-Clamscan-Test-${randomUUID()}`;

  const { filesService } = await import("../src/services/files.service.js");
  const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
  const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

  try {
    await initializeDatabase();
    filesService.registerFileScanJobHandlers({ replace: true });
    filesService.registerFileScannerAdapter("clamscan", createLifecycleClamscanAdapter(outcome));

    const scanner = filesService.resolveConfiguredFileScannerAdapter();
    assert.equal(scanner.scannerMode, "clamscan", "configured scanner should resolve clamscan");

    const session = await readSeedSession(querySql);
    const taskId = await createTask(runSql, sqlText, session, `Clamscan ${outcome} task`);
    const body = `clamscan ${outcome} body`;
    const upload = await filesService.uploadAndAttach(session, {
      contentBase64: Buffer.from(body).toString("base64"),
      moduleId: "tasks",
      originalFilename: `clamscan-${outcome}.txt`,
      targetId: taskId,
      targetType: "task",
    });
    const fileId = upload.file.fileId;

    const summary = await runJobWorkerOnce({
      claimLimit: 5,
      mode: "inline",
      workerId: `file-clamscan-${outcome}`,
    });
    assert.equal(summary.completed, 1, "file.scan job should complete");

    const fileRows = await querySql(`
SELECT file_id, status, scan_status, quarantine_reason, storage_provider, storage_key
FROM files
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);
    assert.equal(fileRows.length, 1, "uploaded file should still exist after scan");
    const row = fileRows[0];
    const storageText = await streamToText(await filesService.getFileStorageAdapter(row.storage_provider).read(row.storage_key));

    let downloadText = "";
    let downloadBlocked = false;
    let restoreBlocked = false;

    if (outcome === "clean") {
      const download = await filesService.downloadFile(session, fileId);
      downloadText = await streamToText(download.stream);
    } else {
      downloadBlocked = await rejectsWithMessage(
        () => filesService.downloadFile(session, fileId),
        /not available for download/i,
      );
      restoreBlocked = await rejectsWithMessage(
        () => filesService.restoreFile(session, fileId),
        /scan has passed/i,
      );
      assert.match(row.quarantine_reason, outcome === "infected" ? /threat/i : /unavailable/i, "quarantine reason should stay safe and bounded");
    }

    const result = {
      downloadBlocked,
      downloadText,
      restoreBlocked,
      scanStatus: row.scan_status,
      status: row.status,
      storageText,
    };
    assertSafeScannerResult(result, fake);
    console.log(JSON.stringify(result));
  } finally {
    await stopJobWorker().catch(() => {});
    await closeSqlite();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runLifecycleChild(outcome) {
  const child = spawnSync(process.execPath, [scriptPath, "--scenario", outcome], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
}

function fakeFileContext(label) {
  return {
    fileId: `fake-${label}`,
    async openReadStream() {
      return Readable.from([`fake ${label} body`]);
    },
  };
}

function createMockClamscanSpawn() {
  return (_executablePath, args = []) => {
    const outcome = process.env.LTF_FAKE_CLAMSCAN_RESULT || "clean";
    const child = new EventEmitter();

    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      final(callback) {
        callback();
        finishMockClamscan(child, outcome);
      },
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    child.kill = () => {
      if (child.holdTimer) {
        clearInterval(child.holdTimer);
        child.holdTimer = null;
      }
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit("close", null, "SIGTERM"));
      return true;
    };

    if (args.includes("--version")) {
      setImmediate(() => finishMockClamscanHealth(child, outcome));
    }

    return child;
  };
}

function finishMockClamscanHealth(child, outcome) {
  if (outcome === "unavailable") {
    child.stderr.end("scanner unavailable");
    child.stdout.end();
    child.emit("close", 2, null);
    return;
  }

  child.stdout.end("Fake ClamAV 1.0.0");
  child.stderr.end();
  child.emit("close", 0, null);
}

function finishMockClamscan(child, outcome) {
  if (outcome === "timeout") {
    child.holdTimer = setInterval(() => {}, 1000);
    return;
  }

  if (outcome === "infected") {
    child.stdout.end(scannerSecretOutput);
    child.stderr.end();
    child.emit("close", 1, null);
    return;
  }

  if (outcome === "unavailable") {
    child.stderr.end("scanner unavailable");
    child.stdout.end();
    child.emit("close", 2, null);
    return;
  }

  child.stdout.end("stream: OK");
  child.stderr.end();
  child.emit("close", 0, null);
}

function createLifecycleClamscanAdapter(outcome) {
  return {
    id: "clamscan",
    async health() {
      return {
        available: outcome !== "unavailable",
        status: outcome === "unavailable" ? "unavailable" : "ok",
      };
    },
    async scan(file = {}) {
      if (outcome === "clean") {
        return {
          metadata: { scanner: "clamscan", result: "clean", exitCode: 0 },
          reason: "",
          scanStatus: "passed",
          status: "available",
          fileId: file.fileId || "",
        };
      }

      if (outcome === "infected") {
        return {
          metadata: { scanner: "clamscan", result: "infected", exitCode: 1 },
          reason: "Scanner reported a threat.",
          scanStatus: "failed",
          status: "quarantined",
          fileId: file.fileId || "",
        };
      }

      return {
        metadata: { scanner: "clamscan", result: "unavailable", exitCode: 2 },
        reason: "Scanner unavailable.",
        scanStatus: "error",
        status: "quarantined",
        fileId: file.fileId || "",
      };
    },
  };
}

async function readSeedSession(querySql) {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  const workspaceId = user.active_workspace_id || user.home_workspace_id;

  return {
    active_workspace_id: workspaceId,
    display_name: "Admin User",
    role: "super_admin",
    timezone: user.timezone || "UTC",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}

async function createTask(runSql, sqlText, session, title) {
  const taskId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(session.workspace_id)},
  NULL,
  NULL,
  ${sqlText(title)},
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return taskId;
}

async function rejectsWithMessage(fn, pattern) {
  try {
    await fn();
    return false;
  } catch (error) {
    assert.match(error.message, pattern);
    return true;
  }
}

async function streamToText(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function assertSafeScannerResult(value, fake) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(fake.executablePath), "i"), "scanner results should not expose executable paths");
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(scannerSecretOutput), "i"), "scanner results should not expose raw scanner output");
  assert.doesNotMatch(serialized, /LONGTAIL_CLAMSCAN|storageKey|protectedPath|signedUrl/i, "scanner results should not expose env names or storage internals");
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key.startsWith("WORKSPACE_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "LTF_FAKE_CLAMSCAN_RESULT"
    ) {
      delete env[key];
    }
  }

  return env;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
