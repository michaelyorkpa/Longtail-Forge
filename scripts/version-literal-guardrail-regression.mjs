/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { appVersion } from "../src/core/version.js";
import {
  loadVersionLiteralAllowlist,
  scanEntriesForCurrentVersion,
  scanWorkspaceForCurrentVersion,
} from "./test-support/version-literal-guardrail.mjs";
import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";

const root = process.cwd();
const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const allowlist = await loadVersionLiteralAllowlist(root);
const fixture = await createDisposableDatabaseFixture("version-literal-guardrail-regression");
const { createApp } = await import("../src/core/app.js");
const { closeDatabase } = await import("../src/db/provider.js");

try {
assert.equal(appVersion, packageJson.version, "the runtime helper should match package metadata");
assert.equal(packageLock.version, packageJson.version, "the lock root should match package metadata");
assert.equal(packageLock.packages[""].version, packageJson.version, "the lock package entry should match package metadata");

const violations = await scanWorkspaceForCurrentVersion(root, appVersion, allowlist);
assert.deepEqual(violations, [], formatViolations(violations));

assert.deepEqual(
  scanEntriesForCurrentVersion([
    { path: "ROADMAP.md", source: `Completed ${appVersion} planning label` },
    { path: "CHANGELOG.md", source: `## Version ${appVersion} - historical release` },
    { path: ["DECISIONS", "md"].join("."), source: `As of ${appVersion}, this decision is current.` },
    { path: "TODO.md", source: `Deferred from ${appVersion}` },
    { path: "docs/release-history.md", source: `As of ${appVersion}` },
    { path: "archive/release-history.md", source: `Archived ${appVersion}` },
  ], appVersion, allowlist),
  [],
  "governing decisions plus historical roadmap, changelog, TODO, docs, and archive labels should be ignored",
);

const syntheticViolations = scanEntriesForCurrentVersion([
  { path: "src/example.js", source: `const duplicatedVersion = "${appVersion}";` },
  { path: "scripts/example-regression.mjs", source: `assert.equal(version, "${appVersion}");` },
], appVersion, allowlist);
assert.deepEqual(
  syntheticViolations.map(({ path }) => path),
  ["src/example.js", "scripts/example-regression.mjs"],
  "runtime and regression literals outside the allowlist should fail",
);

const server = await listen(createApp());
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/app-info`);
  assert.equal(response.status, 200);
  const appInfo = await response.json();
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
