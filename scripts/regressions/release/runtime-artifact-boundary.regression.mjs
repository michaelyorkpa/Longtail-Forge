export const regressionMeta = Object.freeze({
  id: "release.runtime-artifact-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["artifact", "packaging", "release", "runtime"],
  description: "Proves the versioned runtime artifact includes only the bootable runtime boundary and a checksum.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  EXCLUDED_CATEGORIES,
  RUNTIME_PATHS,
  buildRuntimeArtifact,
  createRuntimeLock,
  createRuntimePackage,
  createArtifactManifest,
} from "../../build-runtime-artifact.mjs";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const runtimeSmoke = await fs.readFile("scripts/runtime-artifact-smoke.mjs", "utf8");
const runtimePackage = createRuntimePackage(packageJson);
const runtimeLock = createRuntimeLock(packageLock);

assert.equal(runtimePackage.scripts.start, "node server.js");
assert.equal(runtimePackage.scripts["backup:create"], "node scripts/backup.mjs create");
assert.equal(runtimePackage.scripts["backup:restore"], "node scripts/backup.mjs restore");
assert.equal(runtimePackage.scripts["demo:data:host"], "node scripts/demo-data-host.mjs");
assert.equal(runtimePackage.scripts["demo:baseline:candidate"], "node scripts/public-demo-baseline-candidate.mjs");
assert.equal(runtimePackage.scripts["workspace-backup:inspect"], "node scripts/workspace-backup.mjs inspect");
assert.equal(runtimePackage.scripts["workspace-backup:restore"], "node scripts/workspace-backup.mjs restore");
assert.equal(runtimePackage.scripts["workspace:purge"], "node scripts/workspace-purge.mjs");
assert.equal(runtimePackage.devDependencies, undefined);
assert.deepEqual(runtimePackage.dependencies, packageJson.dependencies);
assert.equal(runtimeLock.packages[""].devDependencies, undefined);
assert.ok(Object.values(runtimeLock.packages).every((entry) => entry.dev !== true));
assert.ok(RUNTIME_PATHS.includes("src"));
assert.ok(RUNTIME_PATHS.includes("public/js"));
assert.ok(RUNTIME_PATHS.includes("views"));
assert.ok(RUNTIME_PATHS.includes("help"));
assert.ok(RUNTIME_PATHS.includes("legal"));
assert.ok(RUNTIME_PATHS.includes("THIRD_PARTY_NOTICES.md"));
assert.ok(EXCLUDED_CATEGORIES.some((entry) => entry.includes("secrets")));
assert.ok(EXCLUDED_CATEGORIES.some((entry) => entry.includes("roadmaps")));
assert.equal(createArtifactManifest(runtimePackage).sourceBranch, null);
assert.equal(createArtifactManifest(runtimePackage, "nightly").sourceBranch, "nightly");
assert.throws(() => createArtifactManifest(runtimePackage, "feature/bad"), /Source branch/);
assert.match(runtimeSmoke, /SUPER_ADMIN_PASSWORD:\s*smokeSuperAdminPassword/);
assert.match(runtimeSmoke, /const smokeSuperAdminPassword = "Runtime-Artifact-Smoke-Password-123!"/);

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-runtime-artifact-regression-"));
try {
  const result = await buildRuntimeArtifact({ outputDir, sourceBranch: "nightly" });
  assert.equal(result.manifest.sourceBranch, "nightly");
  const fileSet = new Set(result.files);
  for (const requiredPath of [
    "RUNTIME-ARTIFACT.json",
    "npm-shrinkwrap.json",
    "package.json",
    "server.js",
    "worker.js",
    "src/core/app.js",
    "src/db/schema/current.sql",
    "help/toc.md",
    "views/public/index.html",
    "public/js/navigation.js",
    "scripts/backup.mjs",
    "scripts/demo-data-host.mjs",
    "scripts/public-demo-baseline-candidate.mjs",
    "scripts/public-demo-baseline-activation.mjs",
    "scripts/development-data.mjs",
    "scripts/workspace-backup.mjs",
    "scripts/workspace-purge.mjs",
    "scripts/lib/backup-archive.mjs",
    "scripts/lib/demo-data-operation.mjs",
    "scripts/lib/public-demo-baseline-candidate.mjs",
    "scripts/lib/public-demo-baseline-activation.mjs",
    "scripts/lib/development-data-safety.mjs",
    "scripts/lib/sanitized-demo-role-fixtures.mjs",
    "docs/backup-restore.md",
    "docs/demo-data-helper.env.example",
    "docs/demo-data-operations.md",
    "docs/public-demo-compose.env.example",
    "docs/public-demo-operator-runbook.md",
    "docs/runtime-artifact.md",
    "docs/workspace-backup.md",
  ]) {
    assert.ok(fileSet.has(requiredPath), `${requiredPath} should be packaged`);
  }

  for (const forbiddenPrefix of [
    ".env",
    "AGENTS.md",
    "CHANGELOG.md",
    "DECISIONS.md",
    "ROADMAP.md",
    "ROADMAP-ARCHIVE.md",
    "TODO.md",
    "data/",
    "logs/",
    "scripts/backup-restore-drill.mjs",
    "scripts/run-regressions.mjs",
    "scripts/regressions/",
    "tests/",
    "playwright.config.js",
    "tsconfig.json",
    "vitest.config.mjs",
    "public/assets/logo-concepts.png",
    "public/assets/longtail-forge-icon.xcf",
  ]) {
    const forbiddenMatch = forbiddenPrefix.endsWith("/")
      ? (/** @type {string} */ filePath) => filePath.startsWith(forbiddenPrefix)
      : (/** @type {string} */ filePath) => filePath === forbiddenPrefix;
    assert.ok(
      !result.files.some(forbiddenMatch),
      `${forbiddenPrefix} should be excluded from the runtime artifact`,
    );
  }

    const checksumText = await fs.readFile(result.checksumPath, "utf8");
  assert.equal(checksumText, `${result.checksum}  ${path.basename(result.artifactPath)}\n`);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
} finally {
  await fs.rm(outputDir, { recursive: true, force: true });
}

console.log("Runtime artifact boundary regression passed.");
