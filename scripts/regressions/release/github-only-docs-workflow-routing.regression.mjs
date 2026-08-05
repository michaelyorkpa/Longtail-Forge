export const regressionMeta = Object.freeze({
  id: "release.github-only-docs-workflow-routing",
  area: "release",
  tier: "release-gate",
  tags: ["ci", "docs", "github-actions", "routing"],
  description: "Proves GitHub-only documentation uses fail-closed PR and nightly fast paths while runtime Help retains artifact and deployment routing.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyGitHubChanges,
  collectGitHubChangeClassification,
  isGitHubOnlyDocumentationPath,
  isRuntimeArtifactPath,
  parseNameStatusDiff,
} from "../../lib/github-change-classification.mjs";
import { suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";

function classify(paths, status = "M") {
  return classifyGitHubChanges(paths.map((filePath) => ({ paths: [filePath], status })));
}

const releaseBookkeeping = ["ROADMAP.md", "ROADMAP-ARCHIVE.md", "CHANGELOG.md"];
assert.equal(classify(releaseBookkeeping).githubOnlyDocs, true);
assert.deepEqual(suggestRegressionsForPaths(releaseBookkeeping).areas, ["release"]);
assert.equal(suggestRegressionsForPaths(releaseBookkeeping).fullCheckRecommended, false);

assert.equal(classify(["docs/development/github-workflow.md", "docs/architecture.md"]).githubOnlyDocs, true);
assert.equal(classify(["AGENTS.md", "DECISIONS.md"]).githubOnlyDocs, true);
assert.equal(classify(["README.md", "LICENSE", "SECURITY.md"]).githubOnlyDocs, false);
assert.equal(classify(["docs/docs-ownership.json"]).githubOnlyDocs, false);
assert.deepEqual(suggestRegressionsForPaths(["AGENTS.md"]).areas, ["docs"]);
assert.equal(suggestRegressionsForPaths(["AGENTS.md"]).fullCheckRecommended, false);
assert.equal(classify(["docs/guide.md", "src/server.js"]).githubOnlyDocs, false);

for (const path of [
  ".github/workflows/development-pr.yml",
  "package.json",
  "package-lock.json",
  "scripts/example.mjs",
  "deploy/example.conf",
  "docs/Caddyfile.private-preview.example",
  "docs/backup-restore.md",
  "docs/compose.env.example",
  "docs/internet-deployment.md",
  "docs/nginx-wireguard.private-preview.example.conf",
  "docs/operational-security.md",
  "docs/preview-deployment.md",
  "docs/runtime-artifact.md",
  "docs/runtime-configuration.md",
  "docs/sqlite-small-office-mode.md",
  "docs/workspace-backup.md",
  "docs/runtime-config.json",
  "help/toc.md",
  "help/framework/help-center.md",
  "help/modules/tasks/resuming-task-work.md",
  "src/db/migrations/999_example.sql",
  "tests/unit/example.test.mjs",
  "public/js/example.js",
  "public/css/example.css",
  "public/icons/example.svg",
  ".env.example",
  "Dockerfile",
  "compose.yaml",
]) {
  assert.equal(isGitHubOnlyDocumentationPath(path), false, `${path} must require full validation`);
  assert.equal(classify([path]).githubOnlyDocs, false, `${path} must not use the GitHub-only docs fast path`);
}
assert.equal(isRuntimeArtifactPath("help/framework/help-center.md"), true);
assert.equal(isRuntimeArtifactPath("docs/runtime-configuration.md"), true);
assert.equal(classify(["help/framework/help-center.md"]).runtimeHelpChanged, true);
assert.equal(classify(["docs/guide.md"]).runtimeHelpChanged, false);

const addedDocs = parseNameStatusDiff("A\0docs/new-guide.md\0");
assert.equal(classifyGitHubChanges(addedDocs).githubOnlyDocs, true, "new GitHub-only documentation should use the fast path");

const renamedDocs = parseNameStatusDiff("R100\0docs/old-guide.md\0docs/new-guide.md\0");
assert.equal(classifyGitHubChanges(renamedDocs).githubOnlyDocs, true, "GitHub-only documentation renames should use the fast path");

const runtimeRenamedIntoDocs = parseNameStatusDiff("R090\0src/old-runtime.js\0docs/new-guide.md\0");
assert.equal(
  classifyGitHubChanges(runtimeRenamedIntoDocs).githubOnlyDocs,
  false,
  "rename classification must inspect both the old and new path",
);

assert.equal(classifyGitHubChanges([]).githubOnlyDocs, false, "an empty or unavailable diff must fail closed");
assert.equal(
  classifyGitHubChanges([{ paths: ["docs/guide.md"], status: "" }]).githubOnlyDocs,
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
  const docsHeadSha = runGit(["rev-parse", "HEAD"], fixtureRoot).stdout.trim();
  const docsClassification = collectGitHubChangeClassification({ baseSha, cwd: fixtureRoot });
  assert.equal(docsClassification.githubOnlyDocs, true);
  assert.deepEqual(docsClassification.entries.map(({ status }) => status[0]).sort(), ["A", "R"]);

  await mkdir(path.join(fixtureRoot, "src"));
  await writeFile(path.join(fixtureRoot, "src", "runtime.js"), "export {};\n", "utf8");
  runGit(["add", "src/runtime.js"], fixtureRoot);
  runGit(["commit", "--quiet", "-m", "Add runtime source"], fixtureRoot);
  assert.equal(
    collectGitHubChangeClassification({ baseSha, cwd: fixtureRoot }).githubOnlyDocs,
    false,
    "classification must cover the complete base-to-head diff rather than only the last commit",
  );
  assert.equal(
    collectGitHubChangeClassification({
      baseSha: docsHeadSha,
      comparison: "range",
      cwd: fixtureRoot,
    }).githubOnlyDocs,
    false,
    "nightly push classification must inspect the exact before-to-after range",
  );
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}

const workflow = readFileSync(".github/workflows/development-pr.yml", "utf8");
for (const requiredName of [
  "Development gate",
  "Browser smoke and accessibility",
  "Complete maintenance release rehearsal",
  "Dependency review",
]) {
  assert.match(workflow, new RegExp(`name: ${requiredName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}
assert.match(workflow, /LTF_REGRESSION_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(workflow, /node scripts\/classify-github-changes\.mjs --github-output/);
assert.equal((workflow.match(/if: \$\{\{ always\(\) \}\}/g) || []).length, 3, "required jobs must run even when classification fails");
assert.match(workflow, /GitHub-only documentation fast path: Playwright browser installation and smoke\/accessibility execution are not required\./);
assert.match(workflow, /GitHub-only documentation fast path: disposable Nginx\/Caddy installation and execution are not required\./);
assert.match(workflow, /Runtime Help changed - full application and browser validation remain required/);
assert.match(workflow, /npm run test:regressions:changed:ci/);
assert.match(workflow, /actions\/dependency-review-action@[a-f0-9]{40}/);
assert.doesNotMatch(workflow, /paths-ignore:/);

const nightly = readFileSync(".github/workflows/nightly.yml", "utf8");
assert.match(nightly, /name: Classify nightly changes/);
assert.match(nightly, /LTF_CHANGE_BASE_SHA: \$\{\{ github\.event\.before \}\}/);
assert.match(nightly, /LTF_CHANGE_COMPARISON: range/);
assert.match(nightly, /name: Check out the complete pushed nightly range\s+if: github\.event_name == 'push'[\s\S]*?ref: \$\{\{ github\.sha \}\}\s+fetch-depth: 0/);
assert.match(nightly, /name: Check out current nightly for scheduled or manual execution\s+if: github\.event_name != 'push'[\s\S]*?ref: nightly\s+fetch-depth: 1/);
assert.doesNotMatch(
  nightly,
  /fetch-depth: \$\{\{ github\.event_name == 'push' && 0 \|\| 1 \}\}/,
  "push classification must not rely on a falsey numeric expression for complete history",
);
assert.ok(
  (nightly.match(/ref: \$\{\{ needs\.classify_changes\.outputs\.revision \}\}/g) || []).length >= 3,
  "validation, browser, and proof jobs must reuse the exact checked-out nightly revision",
);
assert.match(nightly, /sha=\$\(git rev-parse HEAD\)/);
assert.match(nightly, /node scripts\/classify-github-changes\.mjs --github-output/);
assert.match(nightly, /name: GitHub-only docs - no runtime artifact/);
assert.match(nightly, /GitHub-only documentation is complete; no runtime artifact was created\./);
assert.match(nightly, /needs\.classify_changes\.outputs\.github_only_docs != 'true'/);
assert.match(nightly, /Runtime Help changed; full validation, artifact creation, and browser proof remain required\./);
assert.doesNotMatch(nightly, /environment: demo-development|deploy-via-ssh|DEPLOY_TRANSPORT/);
assert.doesNotMatch(nightly, /paths-ignore:/);

const codeql = readFileSync(".github/workflows/codeql.yml", "utf8");
assert.match(codeql, /name: CodeQL JavaScript analysis/);

console.log("GitHub-only documentation workflow routing passed.");

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, String(result.stderr || result.stdout));
  return result;
}
