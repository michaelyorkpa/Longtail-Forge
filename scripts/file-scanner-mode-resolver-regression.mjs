import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const appVersion = "0.33.6.6";
const scenarioArgIndex = process.argv.indexOf("--scenario");
const resolveArgIndex = process.argv.indexOf("--resolve-only");

if (scenarioArgIndex !== -1) {
  await runScenario(process.argv[scenarioArgIndex + 1] || "none");
  process.exit(0);
}

if (resolveArgIndex !== -1) {
  await resolveOnly(process.argv[resolveArgIndex + 1] || "none");
  process.exit(0);
}

assertStaticContracts();

const noneResult = runScenarioChild("none");
assert.equal(noneResult.status, "available", "none mode should make scanned files available");
assert.equal(noneResult.scanStatus, "not_required", "none mode should mark scans not required");
assert.equal(noneResult.previewState, "previewable", "none mode should still allow preview only after the worker marks the file available");
assert.equal(noneResult.unauthorizedDownloadBlocked, true, "none mode should not bypass download permissions");
assert.equal(noneResult.unauthorizedPreviewBlocked, true, "none mode should not bypass preview permissions");

const noopResult = runScenarioChild("noop");
assert.equal(noopResult.status, "available", "noop mode should make scanned files available");
assert.equal(noopResult.scanStatus, "passed", "noop mode should remain an explicit pass-through scanner");
assert.equal(noopResult.previewState, "previewable", "noop mode should still honor preview availability gates");
assert.equal(noopResult.unauthorizedDownloadBlocked, true, "noop mode should not bypass download permissions");
assert.equal(noopResult.unauthorizedPreviewBlocked, true, "noop mode should not bypass preview permissions");

assertConfigFails({ LONGTAIL_FILE_SCANNER: "mystery" }, /LONGTAIL_FILE_SCANNER must be none or noop or clamd or clamscan/);
assertResolveSucceeds("clamd");
assertResolveSucceeds("clamscan");

console.log("File scanner mode resolver regression passed.");

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const moduleDocs = readText("docs/module-development.md");
  const configSource = readText("src/config.js");
  const scannerAdapterSource = readText("src/core/files/scanner-adapter.js");
  const filesServiceSource = readText("src/services/files.service.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the scanner resolver version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the scanner resolver version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the scanner resolver version");

  assert.match(configSource, /FILE_SCANNER_MODES = new Set\(\["none", "noop", "clamd", "clamscan"\]\)/, "config should formalize scanner modes");
  assert.match(configSource, /LONGTAIL_FILE_SCANNER[\s\S]*FILE_SCANNER_MODES/, "config should validate scanner mode");
  assert.match(scannerAdapterSource, /function createNoneFileScannerAdapter/, "scanner adapters should include disabled none mode");
  assert.match(scannerAdapterSource, /scanStatus: "not_required"[\s\S]*status: "available"/, "none scanner should make scans terminal without pretending to scan");
  assert.match(scannerAdapterSource, /function createNoopFileScannerAdapter/, "noop scanner should remain explicit");
  assert.match(filesServiceSource, /const scannerAdapters = new Map\(\[[\s\S]*"clamd", createClamdFileScannerAdapter[\s\S]*"clamscan", createClamscanFileScannerAdapter[\s\S]*"noop", createNoopFileScannerAdapter\(\)/, "Files service should register clamd, clamscan, and noop explicitly");
  assert.doesNotMatch(filesServiceSource, /let scannerAdapter = createNoopFileScannerAdapter\(\)/, "Files service should not keep hidden noop as the default");
  assert.match(filesServiceSource, /function resolveConfiguredFileScannerAdapter/, "Files service should resolve scanners from config");
  assert.match(filesServiceSource, /scanner\.adapter\.scan\(createFileScanContext/, "scanFile should pass a service-owned scan context");
  assert.doesNotMatch(functionBlock(filesServiceSource, "createFileScanContext"), /storageKey:|storage_key:|storagePath|protectedPath/, "scan context should not expose storage keys or paths");

  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*`none`[\s\S]*`noop`[\s\S]*`clamd`[\s\S]*`clamscan`/, "runtime docs should formalize scanner modes");
  assert.match(moduleDocs, /As of 0\.33\.5\.22\.15[\s\S]*file\.scan[\s\S]*not_required/, "module docs should record none-mode file.scan disposition");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the scanner resolver slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-scanner-mode-resolver-regression\.mjs/, "regression suite should include scanner resolver coverage");
}

async function runScenario(mode) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `ltf-file-scanner-${mode}-`));

  process.env.LONGTAIL_DATA_DIR = tempDir;
  process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, `longtail-forge-file-scanner-${mode}.db`);
  process.env.LONGTAIL_FILE_SCANNER = mode;
  process.env.LONGTAIL_WORKER_MODE = "disabled";
  process.env.SUPER_ADMIN_PASSWORD = "File-Scanner-Mode-Test-123!";

  const { filesService } = await import("../src/services/files.service.js");
  const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
  const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

  try {
    await initializeDatabase();
    filesService.registerFileScanJobHandlers({ replace: true });

    const session = await readSeedSession(querySql);
    const taskId = await createTask(runSql, sqlText, session, `Scanner mode ${mode} task`);
    const upload = await filesService.uploadAndAttach(session, {
      contentBase64: Buffer.from(`scanner mode ${mode} body`).toString("base64"),
      moduleId: "tasks",
      originalFilename: `scanner-${mode}.txt`,
      targetId: taskId,
      targetType: "task",
    });
    const fileId = upload.file.fileId;
    const attachmentId = upload.attachment.fileAttachmentId;

    assert.equal(upload.file.status, "pending", "upload should wait for the file.scan job");
    assert.equal(upload.file.scanStatus, "pending", "upload scan status should start pending");
    await assert.rejects(
      () => filesService.downloadFile(session, fileId),
      /not available for download/i,
      "pending files should not be downloadable before file.scan runs",
    );
    const pendingPreview = (await filesService.readAttachmentPreviewDescriptor(session, attachmentId)).preview;
    assert.equal(pendingPreview.contentAvailable, false, "pending files should not expose preview content");
    assert.equal(pendingPreview.reason, "file_pending");

    const summary = await runJobWorkerOnce({
      claimLimit: 5,
      mode: "inline",
      workerId: `file-scanner-mode-${mode}`,
    });
    assert.equal(summary.completed, 1, "file.scan job should complete");

    const fileRows = await querySql(`
SELECT status, scan_status
FROM files
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);
    assert.equal(fileRows.length, 1, "uploaded file should still exist");

    const download = await filesService.downloadFile(session, fileId);
    assert.equal(await streamToText(download.stream), `scanner mode ${mode} body`);

    const preview = (await filesService.readAttachmentPreviewDescriptor(session, attachmentId)).preview;
    assert.equal(preview.state, "previewable", "available text files should be previewable for permitted users");

    const unauthorizedSession = {
      ...session,
      user_id: randomUUID(),
      username: "scanner-mode-unauthorized@example.test",
    };
    const unauthorizedDownloadBlocked = await rejectsWithPermission(() => filesService.downloadFile(unauthorizedSession, fileId));
    const unauthorizedPreviewBlocked = await rejectsWithPermission(() => filesService.readAttachmentPreviewDescriptor(unauthorizedSession, attachmentId));

    console.log(JSON.stringify({
      mode,
      previewState: preview.state,
      scanStatus: fileRows[0].scan_status,
      status: fileRows[0].status,
      unauthorizedDownloadBlocked,
      unauthorizedPreviewBlocked,
    }));
  } finally {
    await stopJobWorker().catch(() => {});
    await closeSqlite();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function resolveOnly(mode) {
  process.env.LONGTAIL_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), `ltf-file-scanner-resolve-${mode}-`));
  process.env.LONGTAIL_DATABASE_FILE = path.join(process.env.LONGTAIL_DATA_DIR, "resolve.db");
  process.env.LONGTAIL_FILE_SCANNER = mode;
  process.env.SUPER_ADMIN_PASSWORD = "File-Scanner-Resolve-Test-123!";

  const { filesService } = await import("../src/services/files.service.js");
  try {
    const resolved = filesService.resolveConfiguredFileScannerAdapter();
    console.log(JSON.stringify({ mode: resolved.scannerMode }));
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  } finally {
    await fs.rm(process.env.LONGTAIL_DATA_DIR, { recursive: true, force: true }).catch(() => {});
  }
}

function runScenarioChild(mode) {
  const child = spawnSync(process.execPath, [scriptPath, "--scenario", mode], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
}

function assertResolveSucceeds(mode) {
  const child = spawnSync(process.execPath, [scriptPath, "--resolve-only", mode], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.equal(JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1)).mode, mode, `${mode} should resolve after its adapter ships`);
}

function assertConfigFails(overrides, pattern) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", "import './src/config.js';"], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.notEqual(child.status, 0, "config import should fail");
  assert.match(child.stderr || child.stdout, pattern);
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

async function rejectsWithPermission(fn) {
  try {
    await fn();
    return false;
  } catch (error) {
    assert.equal(error.statusCode, 403, "access should be permission-gated");
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

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key.startsWith("WORKSPACE_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SUPER_ADMIN_PASSWORD"
    ) {
      delete env[key];
    }
  }

  return {
    ...env,
    ...overrides,
  };
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
