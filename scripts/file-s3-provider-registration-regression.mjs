import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.23.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-s3-provider-registration-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-s3-provider-registration.db");
process.env.LONGTAIL_STORAGE_PROVIDER = "s3";
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-S3-Provider-Registration-Test-123!";
delete process.env.LONGTAIL_S3_BUCKET;
delete process.env.LONGTAIL_S3_REGION;
delete process.env.LONGTAIL_S3_ENDPOINT;
delete process.env.LONGTAIL_S3_ACCESS_KEY_ID;
delete process.env.LONGTAIL_S3_SECRET_ACCESS_KEY;

const { config, createConfig } = await import("../src/config.js");
const { createS3FileStorageAdapter } = await import("../src/core/files/s3-storage-adapter.js");
const { filesService } = await import("../src/services/files.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await assertStaticContracts();
  assertConfigContracts();
  await assertS3AdapterContracts();

  await initializeDatabase();
  const session = await readSeedSession();
  const taskId = await createTask(session, "S3 provider registration task");

  assert.equal(config.storage.provider, "s3", "the regression should exercise the explicit S3 provider key");
  assert.deepEqual(config.storage.s3, {
    accessKeyId: "",
    bucket: "",
    endpoint: "",
    region: "",
    secretAccessKey: "",
  });

  await assert.rejects(
    () => filesService.uploadAndAttach(session, uploadPayload(taskId)),
    (error) => {
      assert.equal(error.statusCode, 500, "missing S3 settings should be reported as configuration errors");
      assert.match(error.message, /S3 file storage provider is not configured\./);
      assert.match(error.message, /LONGTAIL_S3_BUCKET/);
      assert.match(error.message, /LONGTAIL_S3_REGION/);
      assert.match(error.message, /LONGTAIL_S3_ACCESS_KEY_ID/);
      assert.match(error.message, /LONGTAIL_S3_SECRET_ACCESS_KEY/);
      assert.doesNotMatch(error.message, /File-S3-Provider-Registration-Test|private-bucket|private-secret/i);
      return true;
    },
    "missing S3 provider config should fail before any file row is created",
  );

  const leakedRows = await querySql(`
SELECT file_id
FROM files
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND original_filename = 'missing-s3-config.txt';
`);
  assert.equal(leakedRows.length, 0, "missing S3 config should not leave active file records behind");

  console.log("File S3 provider registration regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticContracts() {
  const [
    packageJson,
    packageLock,
    roadmap,
    changelog,
    envExample,
    runtimeDocs,
    sqliteDocs,
    configSource,
    filesServiceSource,
    s3AdapterSource,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("ROADMAP.md"),
    readText("CHANGELOG.md"),
    readText(".env.example"),
    readText("docs/runtime-configuration.md"),
    readText("docs/sqlite-small-office-mode.md"),
    readText("src/config.js"),
    readText("src/services/files.service.js"),
    readText("src/core/files/s3-storage-adapter.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the S3 provider registration version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the S3 provider registration version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the S3 provider registration version");
  assert.equal(Object.keys(packageJson.dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "this slice should not add an S3 SDK dependency");

  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the S3 provider registration slice");
  assert.match(regressionSuite, /scripts\/file-s3-provider-registration-regression\.mjs/, "regression suite should include S3 provider registration coverage");

  for (const key of [
    "LONGTAIL_S3_BUCKET",
    "LONGTAIL_S3_REGION",
    "LONGTAIL_S3_ENDPOINT",
    "LONGTAIL_S3_ACCESS_KEY_ID",
    "LONGTAIL_S3_SECRET_ACCESS_KEY",
  ]) {
    assert.match(configSource, new RegExp(escapeRegExp(key)), `config should read ${key}`);
    assert.match(envExample, new RegExp(`# ${escapeRegExp(key)}=`), `.env.example should document ${key} without a committed value`);
    assert.match(runtimeDocs, new RegExp(escapeRegExp(key)), `runtime docs should document ${key}`);
  }

  assert.match(configSource, /readRuntimeSecret\("LONGTAIL_S3_ACCESS_KEY_ID", env\)/, "S3 access key should be read as a server-side runtime secret");
  assert.match(configSource, /readRuntimeSecret\("LONGTAIL_S3_SECRET_ACCESS_KEY", env\)/, "S3 secret key should be read as a server-side runtime secret");
  assert.match(filesServiceSource, /createS3FileStorageAdapter/, "Files service should import the S3 storage adapter");
  assert.match(filesServiceSource, /\["s3", createS3FileStorageAdapter\(config\.storage\?\.s3\)\]/, "Files service should register the S3 provider under the explicit s3 key");
  assert.match(s3AdapterSource, /S3 file storage provider is not configured/, "S3 adapter should fail clearly when required config is missing");
  assert.match(s3AdapterSource, /S3 file storage client is not configured/, "S3 adapter should fail safely when no provider client is installed");
  assert.match(s3AdapterSource, /putObject/, "S3 adapter should expose putObject behind the client contract");
  assert.match(s3AdapterSource, /getObject/, "S3 adapter should expose getObject behind the client contract");
  assert.match(s3AdapterSource, /headObject/, "S3 adapter should expose headObject behind the client contract");
  assert.match(s3AdapterSource, /deleteObject/, "S3 adapter should expose deleteObject behind the client contract");
  assert.doesNotMatch(s3AdapterSource, /@aws-sdk|client-s3/i, "S3 adapter should not wire an object client in this slice");
  assert.match(runtimeDocs, /S3 object operations are contract-tested through a mocked client path/, "runtime docs should describe the S3 object-operation proof");
  assert.match(sqliteDocs, /mocked S3 client proof/, "SQLite docs should preserve local storage while describing the S3 proof");
  assert.doesNotMatch(runtimeDocs + envExample + sqliteDocs, /AKIA|private-secret|private-bucket|example-secret/i, "docs and examples should not contain fake S3 credentials that look reusable");
}

function assertConfigContracts() {
  const localConfig = createConfig({
    LONGTAIL_DATA_DIR: tempDir,
    LONGTAIL_DATABASE_FILE: path.join(tempDir, "local-default.db"),
  });
  assert.equal(localConfig.storage.provider, "local", "local storage should remain the default when S3 is absent");

  const s3Config = createConfig({
    LONGTAIL_DATA_DIR: tempDir,
    LONGTAIL_DATABASE_FILE: path.join(tempDir, "s3-configured.db"),
    LONGTAIL_STORAGE_PROVIDER: "s3",
    LONGTAIL_S3_ACCESS_KEY_ID: "private-access-key",
    LONGTAIL_S3_BUCKET: "private-bucket",
    LONGTAIL_S3_ENDPOINT: "https://objects.invalid",
    LONGTAIL_S3_REGION: "us-east-1",
    LONGTAIL_S3_SECRET_ACCESS_KEY: "private-secret",
  });
  assert.equal(s3Config.storage.provider, "s3", "S3 should only be selected through the explicit provider key");
  assert.equal(s3Config.storage.s3.bucket, "private-bucket", "server-side config should read the S3 bucket");
  assert.equal(s3Config.storage.s3.region, "us-east-1", "server-side config should read the S3 region");
  assert.equal(s3Config.storage.s3.endpoint, "https://objects.invalid", "server-side config should read the S3 endpoint");
  assert.equal(s3Config.storage.s3.accessKeyId, "private-access-key", "server-side config should read the access key");
  assert.equal(s3Config.storage.s3.secretAccessKey, "private-secret", "server-side config should read the secret key");
}

async function assertS3AdapterContracts() {
  const missingAdapter = filesService.getFileStorageAdapter("s3");
  const missingHealth = await missingAdapter.health();
  assert.deepEqual(missingHealth, {
    ok: false,
    provider: "s3",
    status: "not_configured",
  }, "registered S3 provider should expose safe unavailable health when config is missing");

  const configuredAdapter = createS3FileStorageAdapter({
    accessKeyId: "private-access-key",
    bucket: "private-bucket",
    endpoint: "https://objects.invalid",
    region: "us-east-1",
    secretAccessKey: "private-secret",
  });
  const configuredHealth = await configuredAdapter.health();
  assert.deepEqual(configuredHealth, {
    ok: false,
    provider: "s3",
    status: "client_unavailable",
  }, "configured S3 provider should remain unavailable until a provider client is installed");
  assertSafeS3Payload(configuredHealth, "configured S3 health");

  await assert.rejects(
    () => configuredAdapter.save(Buffer.from("body")),
    (error) => {
      assert.equal(error.statusCode, 500, "configured S3 object operations should fail safely without a provider client");
      assert.match(error.message, /S3 file storage client is not configured/);
      assertSafeS3Payload(error.message, "configured S3 operation error");
      return true;
    },
    "configured S3 operations should fail safely before a provider client is installed",
  );
}

function assertSafeS3Payload(payload, label) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private-bucket|objects\.invalid|private-access-key|private-secret/i, `${label} should not expose S3 config values`);
  assert.doesNotMatch(serialized, /storageKey|signedUrl|protectedPath/i, `${label} should not expose storage internals`);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function readSeedSession() {
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

async function createTask(session, title) {
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
) VALUES (
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

function uploadPayload(taskId) {
  const text = "missing S3 config body";

  return {
    contentBase64: Buffer.from(text).toString("base64"),
    mimeType: "text/plain",
    moduleId: "tasks",
    originalFilename: "missing-s3-config.txt",
    sizeBytes: Buffer.byteLength(text),
    targetId: taskId,
    targetType: "task",
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
