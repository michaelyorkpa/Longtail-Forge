export const regressionMeta = Object.freeze({
  id: "release.development-pr-docs-fast-path",
  area: "release",
  tier: "release-gate",
  tags: ["ci", "docs", "github-actions", "routing"],
  description: "Proves the protected nightly pull-request checks retain their names while rename-aware docs-only changes skip application and browser work safely.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyPullRequestChanges,
  collectPullRequestChangeClassification,
  isDocumentationOnlyPath,
  parseNameStatusDiff,
} from "../../lib/pull-request-change-classification.mjs";
import { suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";

function classify(paths, status = "M") {
  return classifyPullRequestChanges(paths.map((filePath) => ({ paths: [filePath], status })));
}

const releaseBookkeeping = ["ROADMAP.md", "ROADMAP-ARCHIVE.md", "CHANGELOG.md"];
assert.equal(classify(releaseBookkeeping).docsOnly, true);
assert.deepEqual(suggestRegressionsForPaths(releaseBookkeeping).areas, ["release"]);
assert.equal(suggestRegressionsForPaths(releaseBookkeeping).fullCheckRecommended, false);

assert.equal(classify(["docs/development/github-workflow.md", "docs/architecture.md"]).docsOnly, true);
assert.equal(classify(["README.md", "AGENTS.md", "LICENSE", "docs/docs-ownership.json"]).docsOnly, true);
assert.deepEqual(suggestRegressionsForPaths(["README.md", "LICENSE"]).areas, ["docs"]);
assert.equal(suggestRegressionsForPaths(["README.md", "LICENSE"]).fullCheckRecommended, false);
assert.equal(classify(["docs/guide.md", "src/server.js"]).docsOnly, false);

for (const path of [
  ".github/workflows/development-pr.yml",
  "package.json",
  "package-lock.json",
  "scripts/example.mjs",
  "deploy/example.conf",
  "docs/Caddyfile.private-preview.example",
  "docs/compose.env.example",
  "docs/longtail-forge.service.example",
  "docs/nginx-wireguard.private-preview.example.conf",
  "docs/runtime-config.json",
  "src/db/migrations/999_example.sql",
  "tests/unit/example.test.mjs",
  "public/js/example.js",
  "public/css/example.css",
  "public/icons/example.svg",
  ".env.example",
  "Dockerfile",
  "compose.yaml",
]) {
  assert.equal(isDocumentationOnlyPath(path), false, `${path} must require full validation`);
  assert.equal(classify([path]).docsOnly, false, `${path} must not use the docs-only fast path`);
}

const addedDocs = parseNameStatusDiff("A\0docs/new-guide.md\0");
assert.equal(classifyPullRequestChanges(addedDocs).docsOnly, true, "new documentation should use the fast path");

const renamedDocs = parseNameStatusDiff("R100\0docs/old-guide.md\0docs/new-guide.md\0");
assert.equal(classifyPullRequestChanges(renamedDocs).docsOnly, true, "documentation-only renames should use the fast path");

const runtimeRenamedIntoDocs = parseNameStatusDiff("R090\0src/old-runtime.js\0docs/new-guide.md\0");
assert.equal(
  classifyPullRequestChanges(runtimeRenamedIntoDocs).docsOnly,
  false,
  "rename classification must inspect both the old and new path",
);

assert.equal(classifyPullRequestChanges([]).docsOnly, false, "an empty or unavailable diff must fail closed");
assert.equal(
  classifyPullRequestChanges([{ paths: ["docs/guide.md"], status: "" }]).docsOnly,
  false,
  "an invalid diff entry must fail closed",
);
assert.throws(() => parseNameStatusDiff("R100\0docs/old-guide.md\0"), /Incomplete git diff entry/);

const fixtureRoot = await mkdtemp(path.join(tmpdir(), "ltf-pr-classifier-"));
try {
  runGit(["init", "--quiet"], fixtureRoot);
  runGit(["config", "user.email", "classifier@example.invalid"], fixtureRoot);
  runGit(["config", "user.name", "Classifier Regression"], fixtureRoot);
  await mkdir(path.join(fixtureRoot, "docs"));
  await writeFile(path.join(fixtureRoot, "docs", "old-guide.md"), "# Old\n", "utf8");
  runGit(["add", "docs/old-guide.md"], fixtureRoot);
  runGit(["commit", "--quiet", "-m", "Base documentation"], fixtureRoot);
  const baseSha = runGit(["rev-parse", "HEAD"], fixtureRoot).stdout.trim();

  await rename(
    path.join(fixtureRoot, "docs", "old-guide.md"),
    path.join(fixtureRoot, "docs", "renamed-guide.md"),
  );
  await writeFile(path.join(fixtureRoot, "NEW-GUIDE.md"), "# New\n", "utf8");
  runGit(["add", "--all"], fixtureRoot);
  runGit(["commit", "--quiet", "-m", "Rename and add documentation"], fixtureRoot);
  const docsClassification = collectPullRequestChangeClassification({ baseSha, cwd: fixtureRoot });
  assert.equal(docsClassification.docsOnly, true);
  assert.deepEqual(docsClassification.entries.map(({ status }) => status[0]).sort(), ["A", "R"]);

  await mkdir(path.join(fixtureRoot, "src"));
  await writeFile(path.join(fixtureRoot, "src", "runtime.js"), "export {};\n", "utf8");
  runGit(["add", "src/runtime.js"], fixtureRoot);
  runGit(["commit", "--quiet", "-m", "Add runtime source"], fixtureRoot);
  assert.equal(
    collectPullRequestChangeClassification({ baseSha, cwd: fixtureRoot }).docsOnly,
    false,
    "classification must cover the complete base-to-head diff rather than only the last commit",
  );
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}

const workflow = readFileSync(".github/workflows/development-pr.yml", "utf8");
for (const requiredName of [
  "Development gate",
  "Browser smoke and accessibility",
  "Dependency review",
]) {
  assert.match(workflow, new RegExp(`name: ${requiredName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}
assert.match(workflow, /LTF_REGRESSION_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(workflow, /node scripts\/classify-pull-request-changes\.mjs --github-output/);
assert.equal((workflow.match(/if: \$\{\{ always\(\) \}\}/g) || []).length, 2, "required jobs must run even when classification fails");
assert.match(workflow, /Docs-only fast path: Playwright browser installation and smoke\/accessibility execution are not required\./);
assert.match(workflow, /npm run test:regressions:changed:ci/);
assert.match(workflow, /actions\/dependency-review-action@[a-f0-9]{40}/);
assert.doesNotMatch(workflow, /paths-ignore:/);

const codeql = readFileSync(".github/workflows/codeql.yml", "utf8");
assert.match(codeql, /name: CodeQL JavaScript analysis/);

console.log("Development pull-request docs-only fast path passed.");

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr || result.stdout));
  return result;
}
