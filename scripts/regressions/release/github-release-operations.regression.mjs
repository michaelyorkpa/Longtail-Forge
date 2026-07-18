export const regressionMeta = Object.freeze({
  id: "release.github-release-operations",
  area: "release",
  tier: "release-gate",
  tags: ["deployment", "github-actions", "release", "security"],
  description: "Proves protected nightly-to-main promotion, pinned Actions, isolated environments, immutable artifacts, and deliberate preview deployment remain enforced.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (filePath) => fs.readFile(filePath, "utf8");
const workflowPaths = [
  ".github/workflows/development-pr.yml",
  ".github/workflows/promotion.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/main-release.yml",
  ".github/workflows/manual-release.yml",
  ".github/workflows/manual-preview.yml",
  ".github/workflows/codeql.yml",
];
const [development, promotion, nightly, mainRelease, manualRelease, manualPreview, codeql, dependabot, configScript, deployScript, hostHelper, appInfo, configSource, packageSource] = await Promise.all([
  ...workflowPaths.map(read),
  read(".github/dependabot.yml"),
  read("scripts/release/configure-github-release-operations.mjs"),
  read("scripts/release/deploy-via-ssh.mjs"),
  read("scripts/release/longtail-forge-deploy-host.example"),
  read("src/routes/app-info.routes.js"),
  read("src/config.js"),
  read("package.json"),
]);
const workflows = [development, promotion, nightly, mainRelease, manualRelease, manualPreview, codeql];
const packageJson = JSON.parse(packageSource);
const { createConfig } = await import("../../../src/config.js");

for (const [index, source] of workflows.entries()) {
  const uses = [...source.matchAll(/^\s*-\s+uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0, `${workflowPaths[index]} should use at least one reviewed action`);
  assert.ok(uses.every((value) => /@[a-f0-9]{40}$/.test(value)), `${workflowPaths[index]} actions must use full immutable SHAs`);
  assert.doesNotMatch(source, /pull_request_target|permissions:\s*write-all/);
}

for (const requirement of [
  /branches: \[nightly\]/,
  /name: Development gate/,
  /name: Browser smoke and accessibility/,
  /LTF_REGRESSION_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  /npm run test:regressions:changed/,
  /name: Dependency review/,
]) assert.match(development, requirement);

for (const requirement of [
  /branches: \[main\]/,
  /nightly\) echo "Promoting exact nightly revision/,
  /hotfix\/\*\) echo "Validating focused main hotfix/,
  /name: Promotion source/,
  /name: Release gate/,
  /npm run closeout/,
  /npm run check/,
  /npm run test:permissions/,
  /npm audit --audit-level=high/,
  /name: Browser gate/,
  /name: Packaging and recovery/,
  /npm run container:smoke/,
]) assert.match(promotion, requirement);

assert.match(nightly, /push:[\s\S]*branches: \[nightly\]/);
assert.match(nightly, /schedule:[\s\S]*cron:/);
assert.match(nightly, /environment: demo-development/);
assert.match(nightly, /if: github\.event_name == 'push'/);
assert.match(nightly, /DEPLOY_ENABLED/);
assert.match(nightly, /release-metadata\.json/);
assert.match(nightly, /deploy-via-ssh/);
assert.doesNotMatch(nightly, /friends-and-family-preview/);

assert.match(mainRelease, /push:[\s\S]*branches: \[main\]/);
assert.match(mainRelease, /name: Revalidate immutable main artifact/);
assert.match(mainRelease, /retention-days: 90/);
assert.doesNotMatch(mainRelease, /environment: friends-and-family-preview|deploy-via-ssh/);

for (const requirement of [
  /workflow_dispatch:/,
  /contents: write/,
  /RELEASE \$TAG \$REVISION/,
  /git tag -a/,
  /gh release create/,
  /release-metadata\.json/,
  /refusing to replace immutable assets/,
]) assert.match(manualRelease, requirement);
assert.doesNotMatch(manualRelease, /^\s*push:/m);

for (const requirement of [
  /workflow_dispatch:/,
  /environment: friends-and-family-preview/,
  /Exact 40-character commit SHA reachable from main/,
  /DEPLOY plus the SHA, or ROLLBACK plus the SHA/,
  /validate-release-revision\.mjs/,
  /git checkout --detach "\$REVISION"/,
  /deploy-via-ssh\.mjs/,
  /--mode rollback/,
]) assert.match(manualPreview, requirement);
assert.doesNotMatch(manualPreview, /^\s*push:/m);

assert.match(codeql, /github\/codeql-action\/init@[a-f0-9]{40}/);
assert.match(codeql, /security-events: write/);
assert.match(dependabot, /package-ecosystem: npm/);
assert.match(dependabot, /package-ecosystem: github-actions/);
assert.match(dependabot, /package-ecosystem: docker/);
assert.equal((dependabot.match(/target-branch: nightly/g) || []).length, 3);

for (const requirement of [
  /GitHub-owned SHA-pinned Actions policy/,
  /sha_pinning_required: true/,
  /demo-development/,
  /friends-and-family-preview/,
  /required_approving_review_count: 0/,
  /required_conversation_resolution: true/,
  /allow_force_pushes: false/,
  /allow_deletions: false/,
  /"Development gate"/,
  /"Promotion source"/,
  /"CodeQL JavaScript analysis"/,
]) assert.match(configScript, requirement);

for (const requirement of [
  /BatchMode=yes/,
  /UserKnownHostsFile=/,
  /sudo/,
  /healthz/,
  /readyz/,
  /commitSha/,
  /artifactSha256/,
]) assert.match(deployScript, requirement);
for (const requirement of [
  /backup_current/,
  /restore_backup/,
  /chmod 0711 "\$DEPLOY_ROOT"/,
  /chmod 0700 "\$BACKUP_ROOT"/,
  /install -d -o "\$DEPLOY_ACCOUNT" -g "\$DEPLOY_ACCOUNT" -m 0700 "\$INBOX"/,
  /chmod -R a-w/,
  /LONGTAIL_RELEASE_COMMIT/,
  /LONGTAIL_RELEASE_ARTIFACT_SHA256/,
  /LONGTAIL_RELEASE_BRANCH/,
  /recorded previous known-good release/,
]) assert.match(hostHelper, requirement);
assert.doesNotMatch(hostHelper, /chmod 0700 "\$DEPLOY_ROOT"/, "the deployment account must be able to traverse the root-owned parent to its private inbox");

assert.match(configSource, /LONGTAIL_RELEASE_COMMIT/);
assert.match(configSource, /LONGTAIL_RELEASE_ARTIFACT_SHA256/);
assert.match(configSource, /LONGTAIL_RELEASE_BRANCH/);
assert.match(appInfo, /commitSha: config\.release\.commitSha \|\| null/);
assert.match(appInfo, /artifactSha256: config\.release\.artifactSha256 \|\| null/);
const configuredIdentity = createConfig({
  LONGTAIL_RELEASE_BRANCH: "nightly",
  LONGTAIL_RELEASE_COMMIT: "a".repeat(40),
  LONGTAIL_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
});
assert.deepEqual(configuredIdentity.release, {
  sourceBranch: "nightly",
  commitSha: "a".repeat(40),
  artifactSha256: "b".repeat(64),
});
assert.throws(() => createConfig({ LONGTAIL_RELEASE_COMMIT: "main" }), /40 hexadecimal characters/);
assert.throws(() => createConfig({ LONGTAIL_RELEASE_ARTIFACT_SHA256: "latest" }), /64 hexadecimal characters/);
assert.throws(() => createConfig({ LONGTAIL_RELEASE_BRANCH: "feature/bad" }), /Source branch/);
assert.equal(packageJson.scripts["release:metadata"], "node scripts/release/create-release-metadata.mjs");
assert.equal(packageJson.scripts["release:validate"], "node scripts/release/validate-release-revision.mjs");
assert.equal(packageJson.scripts["deploy:ssh"], "node scripts/release/deploy-via-ssh.mjs");
assert.equal(packageJson.scripts["github:configure"], "node scripts/release/configure-github-release-operations.mjs");

console.log("GitHub release operations regression passed.");
