import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.6.12e-2";
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

try {
  await assertStaticContracts();
  assertConfigContracts();
  await assertS3AdapterContracts();
  await assertServerStartupRejectsUnavailableS3Provider();

  assert.equal(config.storage.provider, "s3", "the regression should exercise the explicit S3 provider key");
  assert.deepEqual(config.storage.s3, {
    accessKeyId: "",
    bucket: "",
    endpoint: "",
    region: "",
    secretAccessKey: "",
  });

  console.log("File S3 provider startup regression passed.");
} finally {
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
    appSource,
    workerSource,
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
    readText("src/core/app.js"),
    readText("src/core/jobs/worker-cli.js"),
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
  assert.match(filesServiceSource, /async function assertConfiguredFileStorageProviderReady/, "Files service should expose startup storage provider validation");
  assert.match(appSource, /filesService\.assertConfiguredFileStorageProviderReady\(\)/, "app startup should validate the configured storage provider before listening");
  assert.match(workerSource, /filesService\.assertConfiguredFileStorageProviderReady\(\)/, "separate worker startup should validate the configured storage provider before polling jobs");
  assert.match(s3AdapterSource, /S3 file storage provider is not configured/, "S3 adapter should fail clearly when required config is missing");
  assert.match(s3AdapterSource, /S3 file storage client is not configured/, "S3 adapter should fail safely when no provider client is installed");
  assert.match(s3AdapterSource, /putObject/, "S3 adapter should expose putObject behind the client contract");
  assert.match(s3AdapterSource, /getObject/, "S3 adapter should expose getObject behind the client contract");
  assert.match(s3AdapterSource, /headObject/, "S3 adapter should expose headObject behind the client contract");
  assert.match(s3AdapterSource, /deleteObject/, "S3 adapter should expose deleteObject behind the client contract");
  assert.doesNotMatch(s3AdapterSource, /@aws-sdk|client-s3/i, "S3 adapter should not wire an object client in this slice");
  assert.match(runtimeDocs, /S3 storage is explicitly deferred scaffolding/i, "runtime docs should mark S3 as deferred scaffolding");
  assert.match(runtimeDocs, /LONGTAIL_STORAGE_PROVIDER=s3[\s\S]*fails during app and worker startup/i, "runtime docs should document S3 startup rejection");
  assert.match(sqliteDocs, /S3 remains deferred scaffolding/i, "SQLite docs should preserve local storage while describing the deferred S3 proof");
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

  await assert.rejects(
    () => filesService.assertConfiguredFileStorageProviderReady(),
    (error) => {
      assert.match(error.message, /File storage provider 's3' is not available at startup/);
      assert.match(error.message, /S3 storage is deferred/);
      assert.match(error.message, /LONGTAIL_STORAGE_PROVIDER=local/);
      assert.doesNotMatch(error.message, /File-S3-Provider-Registration-Test|private-bucket|private-secret|LONGTAIL_S3_/i);
      return true;
    },
    "configured S3 should fail startup validation before request handling",
  );

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

async function assertServerStartupRejectsUnavailableS3Provider() {
  const serverEnv = {
    ...process.env,
    LONGTAIL_DATA_DIR: tempDir,
    LONGTAIL_DATABASE_FILE: path.join(tempDir, "startup-rejects-s3.db"),
    LONGTAIL_ENV: "development",
    LONGTAIL_S3_ACCESS_KEY_ID: "",
    LONGTAIL_S3_BUCKET: "",
    LONGTAIL_S3_ENDPOINT: "",
    LONGTAIL_S3_REGION: "",
    LONGTAIL_S3_SECRET_ACCESS_KEY: "",
    LONGTAIL_STORAGE_PROVIDER: "s3",
    LONGTAIL_WORKER_MODE: "disabled",
    PORT: "65534",
    SUPER_ADMIN_PASSWORD: "File-S3-Provider-Registration-Test-123!",
  };
  const result = await runNode(["server.js"], { env: serverEnv });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.code, 1, "server startup should exit unsuccessfully when S3 is selected without a client");
  assert.match(output, /Longtail Forge could not be started/);
  assert.match(output, /File storage provider 's3' is not available at startup/);
  assert.match(output, /S3 storage is deferred until a provider-specific client is wired/);
  assert.doesNotMatch(output, /Longtail Forge running at/);
  assert.doesNotMatch(output, /File-S3-Provider-Registration-Test|private-bucket|private-secret|LONGTAIL_S3_BUCKET|LONGTAIL_S3_SECRET_ACCESS_KEY/i);
}

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr, stdout });
    });
  });
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
