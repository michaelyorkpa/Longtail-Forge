export const regressionMeta = Object.freeze({
  id: "framework.production-configuration-hardening",
  area: "framework",
  tier: "integration",
  tags: ["configuration", "files", "production", "security", "startup"],
  description: "Proves production startup rejects unsafe credential, transport, scanner, data-path, logging, and diagnostic combinations unless a narrow override is explicit.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const databaseFixture = await createDisposableDatabaseFixture("production-configuration-hardening");
const { createConfig } = await import("../../../src/config.js");
const { assertRuntimeDataPathsReady } = await import("../../../src/core/runtime-readiness.js");
const {
  PUBLIC_DEMO_DATA_MARKER_CONTRACT,
  PUBLIC_DEMO_DATA_MARKER_FILE,
  PUBLIC_DEMO_TARGET,
  assertPublicDemoRuntimeReady,
  isPublicDemoVisitorIdentity,
} = await import("../../../src/core/public-demo-runtime.js");
const { createErrorHandler } = await import("../../../src/middleware/error-handler.js");
const secretMarker = "do-not-disclose-production-secret";
const appSource = await fs.readFile(path.resolve("src/core/app.js"), "utf8");
const workerSource = await fs.readFile(path.resolve("src/core/jobs/worker-cli.js"), "utf8");
const filesRoutesSource = await fs.readFile(path.resolve("src/routes/files.routes.js"), "utf8");
const filesServiceSource = await fs.readFile(path.resolve("src/services/files.service.js"), "utf8");
const csrfSource = await fs.readFile(path.resolve("src/core/csrf-protection.js"), "utf8");

assert.match(appSource, /await assertPublicDemoRuntimeReady\(\)[\s\S]*await assertRuntimeDataPathsReady\(\)[\s\S]*await filesService\.assertConfiguredFileStorageProviderReady\(\)[\s\S]*await filesService\.assertConfiguredFileScannerReady\(\)/, "app startup should prove demo identity, data, storage, and scanner readiness before listening");
assert.match(workerSource, /await assertPublicDemoRuntimeReady\(\)[\s\S]*await assertRuntimeDataPathsReady\(\)[\s\S]*await filesService\.assertConfiguredFileStorageProviderReady\(\)[\s\S]*await filesService\.assertConfiguredFileScannerReady\(\)/, "separate worker startup should prove the same demo identity and readiness before polling");
assert.match(filesRoutesSource, /MAX_FILE_JSON_BODY_BYTES = 8 \* 1024 \* 1024/, "Files JSON compatibility uploads should remain bounded");
assert.match(filesRoutesSource, /MAX_MULTIPART_BATCH_FILES = 50/, "multipart upload batches should remain bounded");
assert.match(filesRoutesSource, /MAX_MULTIPART_FIELDS = 20/, "multipart metadata fields should remain bounded");
assert.match(filesServiceSource, /DEFAULT_MAX_FILE_SIZE_BYTES = 5 \* 1024 \* 1024/, "Files should keep a bounded default per-file limit");
assert.match(csrfSource, /allowedOrigins\.has\(origin\.value\)/, "browser writes should retain exact same-origin enforcement without permissive CORS");
const secureProduction = {
  LONGTAIL_ENV: "production",
  LONGTAIL_FILE_SCANNER: "clamscan",
  LONGTAIL_LOG_LEVEL: "info",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: `${secretMarker}-secure-notes-key-material`,
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  SUPER_ADMIN_PASSWORD: `${secretMarker}-bootstrap-password`,
  TRUST_PROXY: "127.0.0.1/32",
};

const production = createConfig(secureProduction);
assert.equal(production.environment, "production");
assert.equal(production.cookies.secure, true);
assert.equal(production.secureNotes.masterKeyConfigured, true);
assert.equal(production.scanner.mode, "clamscan");
assert.deepEqual(production.runtimeWarnings, []);

const publicDemo = createConfig({
  ...secureProduction,
  DEMO_MODE: "true",
  LONGTAIL_DEPLOYMENT_MODE: "compose",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
  LONGTAIL_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
  LONGTAIL_RELEASE_BRANCH: "main",
  LONGTAIL_RELEASE_COMMIT: "a".repeat(40),
});
assert.deepEqual(publicDemo.demo, { enabled: true, profile: "public_demo" });
assert.equal(publicDemo.deployment.mode, "compose");

const development = createConfig({
  LONGTAIL_AUTH_THROTTLE_ENABLED: "false",
  LONGTAIL_FILE_SCANNER: "none",
  LONGTAIL_LOG_LEVEL: "debug",
  LONGTAIL_PUBLIC_URL: "http://localhost:8001",
  LONGTAIL_SESSION_COOKIE_SECURE: "false",
});
assert.equal(development.environment, "development");
assert.equal(development.security.authenticationThrottle.enabled, false);
assert.equal(development.logLevel, "debug");
assert.deepEqual(development.runtimeWarnings, []);

assertProductionFails("LONGTAIL_PUBLIC_URL", undefined, /LONGTAIL_PUBLIC_URL is required/);
assertProductionFails("SUPER_ADMIN_PASSWORD", undefined, /SUPER_ADMIN_PASSWORD is required/);
assertProductionFails("SUPER_ADMIN_PASSWORD", "changeme", /non-default secret of at least 16 characters/);
assertProductionFails("LONGTAIL_SECURE_NOTES_MASTER_KEY", undefined, /LONGTAIL_SECURE_NOTES_MASTER_KEY is required/);
assertProductionFails("LONGTAIL_SECURE_NOTES_MASTER_KEY", "too-short", /non-default secret of at least 32 characters/);
assertProductionFails("TRUST_PROXY", undefined, /TRUST_PROXY must list the TLS reverse proxy/);
assertProductionFails("LONGTAIL_SESSION_COOKIE_SECURE", "false", /must be true for a production HTTPS deployment/);
assertProductionFails("LONGTAIL_FILE_SCANNER", "none", /must be clamd or clamscan in production/);
assertProductionFails("LONGTAIL_AUTH_THROTTLE_ENABLED", "false", /LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE=true/);
assertProductionFails("LONGTAIL_HSTS_MAX_AGE_SECONDS", "0", /LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK=true/);
assertProductionFails("LONGTAIL_LOG_LEVEL", "debug", /LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING=true/);
assertProductionFails("LONGTAIL_PUBLIC_URL", "http://forge.example.test", /must use https in production/);
assert.throws(
  () => createConfig({ LONGTAIL_DATA_DIR: "./public/private-data" }),
  /LONGTAIL_DATA_DIR must not resolve inside the public static directory/,
);
assert.throws(
  () => createConfig({ LONGTAIL_DATABASE_FILE: "./public/database.sqlite" }),
  /LONGTAIL_DATABASE_FILE must not resolve inside the public static directory/,
);
assert.throws(
  () => createConfig({ LONGTAIL_LOCAL_STORAGE_ROOT: "./public/uploads" }),
  /LONGTAIL_LOCAL_STORAGE_ROOT must not resolve inside the public static directory/,
);

const httpOverride = createConfig({
  ...secureProduction,
  LONGTAIL_PUBLIC_URL: "http://forge.example.test",
  LONGTAIL_SESSION_COOKIE_SECURE: "false",
  LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL: "true",
});
assert.match(httpOverride.runtimeWarnings.join("\n"), /UNSAFE OVERRIDE ACTIVE.*HTTP/);

const scannerOverride = createConfig({
  ...secureProduction,
  LONGTAIL_FILE_SCANNER: "none",
  LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS: "true",
});
assert.match(scannerOverride.runtimeWarnings.join("\n"), /UNSAFE OVERRIDE ACTIVE.*not malware-scanned/);

const throttleOverride = createConfig({
  ...secureProduction,
  LONGTAIL_AUTH_THROTTLE_ENABLED: "false",
  LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE: "true",
});
assert.match(throttleOverride.runtimeWarnings.join("\n"), /UNSAFE OVERRIDE ACTIVE.*throttling is disabled/);

const hstsOverride = createConfig({
  ...secureProduction,
  LONGTAIL_HSTS_MAX_AGE_SECONDS: "0",
  LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK: "true",
});
assert.match(hstsOverride.runtimeWarnings.join("\n"), /UNSAFE OVERRIDE ACTIVE.*HSTS rollback/);

const debugOverride = createConfig({
  ...secureProduction,
  LONGTAIL_LOG_LEVEL: "debug",
  LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING: "true",
});
assert.match(debugOverride.runtimeWarnings.join("\n"), /UNSAFE OVERRIDE ACTIVE.*debug/);

for (const diagnostics of [
  JSON.stringify(production.runtimeWarnings),
  JSON.stringify(httpOverride.runtimeWarnings),
  JSON.stringify(scannerOverride.runtimeWarnings),
  JSON.stringify(throttleOverride.runtimeWarnings),
  JSON.stringify(hstsOverride.runtimeWarnings),
  JSON.stringify(debugOverride.runtimeWarnings),
]) {
  assert.doesNotMatch(diagnostics, new RegExp(secretMarker), "configuration diagnostics must redact deployment secrets");
}

const responseState = { body: null, status: null };
const response = {
  headersSent: false,
  json(body) {
    responseState.body = body;
    return this;
  },
  status(status) {
    responseState.status = status;
    return this;
  },
};
const diagnosticRecords = [];
const errorHandler = createErrorHandler({
  logger: {
    error(event, fields) {
      diagnosticRecords.push({ event, fields });
    },
  },
});
errorHandler(
  new Error(`${secretMarker}\nstack detail`),
  { method: "GET", path: "/api/private", requestContext: { requestId: "safe-request-id" } },
  response,
  () => {},
);
assert.equal(responseState.status, 500);
assert.deepEqual(responseState.body, {
  error: {
    code: "internal_server_error",
    message: "Internal server error.",
    requestId: "safe-request-id",
  },
});
assert.doesNotMatch(JSON.stringify(responseState.body), new RegExp(secretMarker));
assert.doesNotMatch(JSON.stringify(responseState.body), /stack detail/);
assert.equal(diagnosticRecords.length, 1);
assert.doesNotMatch(JSON.stringify(diagnosticRecords), new RegExp(secretMarker));
assert.doesNotMatch(JSON.stringify(diagnosticRecords), /stack detail/);

try {
  const { filesService } = await import("../../../src/services/files.service.js");
  filesService.registerFileScannerAdapter("clamscan", {
    id: "clamscan",
    async health() {
      return { available: true, status: "ok" };
    },
    async scan() {
      return { scanStatus: "passed", status: "available" };
    },
  });
  assert.deepEqual(
    await filesService.assertConfiguredFileScannerReady({ required: true, scannerMode: "clamscan" }),
    { scannerMode: "clamscan", status: "ok" },
  );
  filesService.registerFileScannerAdapter("clamd", {
    id: "clamd",
    async health() {
      return { available: false, status: "unavailable", host: secretMarker };
    },
    async scan() {
      return { scanStatus: "error", status: "quarantined" };
    },
  });
  await assert.rejects(
    () => filesService.assertConfiguredFileScannerReady({ required: true, scannerMode: "clamd" }),
    (error) => {
      assert.match(error.message, /File scanner 'clamd' is not available at startup/);
      assert.doesNotMatch(error.message, new RegExp(secretMarker));
      return true;
    },
  );
} finally {
  const { closeDatabase } = await import("../../../src/db/provider.js");
  await closeDatabase();
  await databaseFixture.cleanup();
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-production-readiness-"));
try {
  const dataDir = path.join(tempRoot, "data");
  const filesDir = path.join(dataDir, "files");
  assert.deepEqual(
    await assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: false } }),
    { enabled: false, marker: "not_required" },
  );
  await assert.rejects(
    () => assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: true } }),
    /DEMO_MODE data ownership marker is missing, unreadable, or invalid/,
  );
  await assertRuntimeDataPathsReady({
    environment: "production",
    paths: [
      { key: "LONGTAIL_DATA_DIR", value: dataDir },
      { key: "LONGTAIL_LOCAL_STORAGE_ROOT", value: filesDir },
    ],
  });
  const stats = await fs.stat(dataDir);
  assert.equal(stats.isDirectory(), true);
  if (process.platform !== "win32") {
    assert.equal(stats.mode & 0o077, 0, "new production data directories should be owner-only");
  }

  const markerPath = path.join(dataDir, PUBLIC_DEMO_DATA_MARKER_FILE);
  const publicVisitorUserIds = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  await fs.writeFile(markerPath, "{}\n", { mode: 0o600 });
  await assert.rejects(
    () => assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: true } }),
    (error) => {
      assert.match(error.message, /DEMO_MODE data ownership marker is missing, unreadable, or invalid/);
      assert.doesNotMatch(error.message, new RegExp(escapeRegExp(tempRoot)));
      return true;
    },
  );
  await fs.writeFile(markerPath, `${JSON.stringify({
    contract: PUBLIC_DEMO_DATA_MARKER_CONTRACT,
    publicVisitorUserIds,
    target: PUBLIC_DEMO_TARGET,
  })}\n`, { mode: 0o600 });
  if (process.platform !== "win32") {
    await fs.chmod(markerPath, 0o622);
    await assert.rejects(
      () => assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: true } }),
      /DEMO_MODE data ownership marker is missing, unreadable, or invalid/,
    );
    await fs.chmod(markerPath, 0o600);
  }
  assert.deepEqual(
    await assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: true } }),
    { enabled: true, marker: "verified" },
  );
  assert.equal(isPublicDemoVisitorIdentity(publicVisitorUserIds[0]), true);
  assert.equal(isPublicDemoVisitorIdentity("00000000-0000-4000-8000-999999999999"), false);
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log("Production configuration hardening regression passed.");

function assertProductionFails(key, value, pattern) {
  const env = { ...secureProduction };
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }

  assert.throws(() => createConfig(env), pattern);
}
