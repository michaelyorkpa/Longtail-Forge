import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { get } from "node:http";
import os from "node:os";
import path from "node:path";
import { appVersion } from "../src/core/version.js";
import { compareDottedVersions, readActiveRoadmapCursor } from "./lib/roadmap-cursor.mjs";
import {
  loadVersionLiteralAllowlist,
  readWorkspaceTextEntries,
  scanEntriesForCurrentVersion,
  scanWorkspaceForCurrentVersion,
} from "./test-support/version-literal-guardrail.mjs";
import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const changelog = await fs.readFile("CHANGELOG.md", "utf8");
const allowlist = await loadVersionLiteralAllowlist(root);
const fixture = await createDisposableDatabaseFixture("version-literal-guardrail-regression");
const { createApp } = await import("../src/core/app.js");
const { closeDatabase } = await import("../src/db/provider.js");

try {
assert.equal(appVersion, packageJson.version, "the runtime helper should match package metadata");
assert.equal(packageLock.version, packageJson.version, "the lock root should match package metadata");
assert.equal(packageLock.packages[""].version, packageJson.version, "the lock package entry should match package metadata");
assert.match(changelog, new RegExp(`^## Version ${escapeRegExp(appVersion)} - `, "m"), "CHANGELOG should carry the current version heading");
assert.ok(
  compareDottedVersions(readActiveRoadmapCursor(), appVersion) > 0,
  "ROADMAP should advance beyond the current package version before closeout",
);

const violations = await scanWorkspaceForCurrentVersion(root, appVersion, allowlist);
assert.deepEqual(violations, [], formatViolations(violations));

assert.deepEqual(
  scanEntriesForCurrentVersion([
    { path: "CHANGELOG.md", source: `## Version ${appVersion} - historical release` },
    { path: ["DECISIONS", "md"].join("."), source: `As of ${appVersion}, this decision is current.` },
    { path: "TODO.md", source: `Deferred from ${appVersion}` },
    { path: "docs/release-history.md", source: `As of ${appVersion}` },
    { path: "archive/release-history.md", source: `Archived ${appVersion}` },
  ], appVersion, allowlist),
  [],
  "governing decisions plus historical changelog, TODO, docs, and archive labels should be ignored",
);
assert.deepEqual(
  scanEntriesForCurrentVersion([
    { path: "ROADMAP.md", source: `Completed ${appVersion} planning label` },
  ], appVersion, allowlist).map(({ path }) => path),
  ["ROADMAP.md"],
  "the live roadmap should not silently treat a current-version planning label as historical",
);

const scanFixture = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-version-scan-"));
try {
  await fs.mkdir(path.join(scanFixture, "archive"), { recursive: true });
  await fs.mkdir(path.join(scanFixture, "src"), { recursive: true });
  await fs.writeFile(path.join(scanFixture, "archive", "large.md"), "x".repeat(64), "utf8");
  await fs.writeFile(path.join(scanFixture, "src", "large.js"), "x".repeat(64), "utf8");
  await assert.rejects(
    () => readWorkspaceTextEntries(scanFixture, {
      allowlist,
      candidateFiles: ["archive/large.md", "src/large.js"],
      maxTextFileBytes: 32,
    }),
    /src\/large\.js \(64 bytes\)/,
    "non-historical files at the scan ceiling should fail explicitly",
  );
  assert.deepEqual(
    await readWorkspaceTextEntries(scanFixture, {
      allowlist,
      candidateFiles: ["archive/large.md"],
      maxTextFileBytes: 32,
    }),
    [],
    "historical paths should be excluded before size checks or reads",
  );
} finally {
  await fs.rm(scanFixture, { recursive: true, force: true });
}

assert.deepEqual(
  scanEntriesForCurrentVersion([
    { path: "scripts/regression-coverage-exceptions.json", source: `    "retiredInVersion": "${appVersion}",` },
    { path: "scripts/regression-coverage-manifest.json", source: `      "retiredInVersion": "${appVersion}",` },
    { path: "scripts/regression-coverage-exceptions.json", source: `    "movedInVersion": "${appVersion}",` },
    { path: "scripts/regression-coverage-manifest.json", source: `      "movedInVersion": "${appVersion}",` },
  ], appVersion, allowlist),
  [],
  "coverage metadata should allow the current version only on exact retirement or assertion-movement version fields",
);

const syntheticViolations = scanEntriesForCurrentVersion([
  { path: "src/example.js", source: `const duplicatedVersion = "${appVersion}";` },
  { path: "scripts/example-regression.mjs", source: `assert.equal(version, "${appVersion}");` },
  { path: "scripts/regression-coverage-exceptions.json", source: `    "rationale": "retired during ${appVersion}",` },
  { path: "scripts/regression-coverage-exceptions.json", source: `    "rationale": "moved during ${appVersion}",` },
], appVersion, allowlist);
assert.deepEqual(
  syntheticViolations.map(({ path }) => path),
  [
    "src/example.js",
    "scripts/example-regression.mjs",
    "scripts/regression-coverage-exceptions.json",
    "scripts/regression-coverage-exceptions.json",
  ],
  "runtime and regression literals outside the allowlist should fail",
);

const server = await listen(createApp());
try {
  const response = await readJson(`http://127.0.0.1:${server.address().port}/api/app-info`);
  assert.equal(response.statusCode, 200);
  const appInfo = response.body;
  assert.equal(appInfo.version, packageJson.version, "/api/app-info should report package metadata");
  assert.equal(appInfo.version, appVersion, "/api/app-info should report the runtime helper value");
} finally {
  await closeServer(server);
}

console.log("Version literal guardrail regression passed.");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

function readJson(url) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve({ body: JSON.parse(body), statusCode: response.statusCode });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function formatViolations(violations) {
  if (violations.length === 0) {
    return "current-version literal guardrail should pass";
  }
  return `Unapproved current-version literals:\n${violations
    .map((violation) => `- ${violation.path}:${violation.line}:${violation.column}`)
    .join("\n")}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
