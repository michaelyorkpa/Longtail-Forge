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
  ".github/workflows/manual-image-candidate.yml",
  ".github/workflows/manual-release.yml",
  ".github/workflows/manual-preview.yml",
  ".github/workflows/codeql.yml",
];
const REVIEWED_CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const REVIEWED_CODEQL_SHA = "e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81";
const REVIEWED_CACHE_SHA = "55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const [development, promotion, nightly, mainRelease, manualImageCandidate, manualRelease, manualPreview, codeql, dependabot, configScript, deployScript, hostHelper, helperEnvironment, attributes, appInfo, configSource, _packageSource] = await Promise.all([
  ...workflowPaths.map(read),
  read(".github/dependabot.yml"),
  read("scripts/release/configure-github-release-operations.mjs"),
  read("scripts/release/deploy-via-ssh.mjs"),
  read("scripts/release/longtail-forge-compose-deploy-host.example"),
  read("docs/longtail-forge-compose-deploy-helper.env.example"),
  read(".gitattributes"),
  read("src/routes/app-info.routes.js"),
  read("src/config.js"),
  read("package.json"),
]);
const workflows = [development, promotion, nightly, mainRelease, manualImageCandidate, manualRelease, manualPreview, codeql];
const { createConfig } = await import("../../../src/config.js");

for (const [index, source] of workflows.entries()) {
  const uses = [...source.matchAll(/^\s*-\s+uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0, `${workflowPaths[index]} should use at least one reviewed action`);
  assert.ok(uses.every((value) => /@[a-f0-9]{40}$/.test(value)), `${workflowPaths[index]} actions must use full immutable SHAs`);
  const checkoutUses = uses.filter((value) => value.startsWith("actions/checkout@"));
  assert.ok(checkoutUses.length > 0, `${workflowPaths[index]} should use the reviewed checkout action`);
  assert.ok(
    checkoutUses.every((value) => value === `actions/checkout@${REVIEWED_CHECKOUT_SHA}`),
    `${workflowPaths[index]} must use one reviewed actions/checkout SHA`,
  );
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
  /nightly\)[^\n]*echo "Promoting exact nightly revision/,
  /hotfix\/\*\)[^\n]*echo "Validating focused main hotfix/,
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
assert.match(
  promotion,
  /name: Container recovery proof[\s\S]*name: Install pinned Caddy container-smoke binary[\s\S]*CADDY_VERSION: 2\.11\.4[\s\S]*sha512sum --check --strict[\s\S]*npm run container:smoke/,
  "the native container promotion proof must install the reviewed Caddy binary before exercising the real proxy boundary",
);

assert.match(nightly, /push:[\s\S]*branches: \[nightly\]/);
assert.match(nightly, /schedule:[\s\S]*cron:/);
assert.match(nightly, /name: GitHub-only docs - no runtime artifact/);
assert.match(nightly, /release-metadata\.json/);
assert.match(nightly, /name: Publish exact-SHA nightly proof/);
assert.doesNotMatch(nightly, /environment: demo-development|DEPLOY_ENABLED|DEPLOY_TRANSPORT|deploy-via-ssh/);
assert.doesNotMatch(nightly, /friends-and-family-preview/);

assert.match(mainRelease, /push:[\s\S]*branches: \[main\]/);
assert.match(mainRelease, /name: Revalidate immutable main artifact/);
assert.match(mainRelease, /retention-days: 90/);
assert.doesNotMatch(mainRelease, /environment: friends-and-family-preview|deploy-via-ssh/);

for (const requirement of [
  /workflow_dispatch:/,
  /contents: read/,
  /packages: write/,
  /PUBLISH CANDIDATE \$REVISION/,
  /docker buildx create --name longtail-forge-candidate --driver docker-container --use/,
  /npm run image:publish -- publish/,
  /name: main-image-candidate-\$\{\{ inputs\.revision \}\}/,
  /retention-days: 30/,
]) assert.match(manualImageCandidate, requirement);
assert.doesNotMatch(manualImageCandidate, /contents: write|git tag|gh release create|^\s*push:/m);

for (const requirement of [
  /workflow_dispatch:/,
  /contents: write/,
  /packages: write/,
  /RELEASE \$TAG \$REVISION/,
  /git tag -a/,
  /gh release create/,
  /release-metadata\.json/,
  /platform-manifest\.json/,
  /refusing to replace immutable assets/,
]) assert.match(manualRelease, requirement);
assert.match(
  manualRelease,
  /name: Set up attestation-capable Docker Buildx builder[\s\S]*docker buildx create --name longtail-forge-release --driver docker-container --use[\s\S]*docker buildx inspect --bootstrap[\s\S]*name: Publish and verify the immutable linux\/amd64 image/,
  "the immutable image release must select an attestation-capable Buildx driver before publication",
);
assert.doesNotMatch(manualRelease, /^\s*push:/m);

for (const requirement of [
  /workflow_dispatch:/,
  /environment: friends-and-family-preview/,
  /Exact 40-character commit SHA reachable from main/,
  /DEPLOY plus the SHA, or ROLLBACK plus the SHA/,
  /validate-release-revision\.mjs/,
  /git checkout --detach "\$REVISION"/,
  /deploy-via-ssh\.mjs/,
  /--mode compose-rollback/,
]) assert.match(manualPreview, requirement);
assert.doesNotMatch(manualPreview, /^\s*push:/m);

assert.equal(
  (codeql.match(new RegExp(`github/codeql-action/init@${REVIEWED_CODEQL_SHA}`, "g")) || []).length,
  1,
  "CodeQL init must use the reviewed immutable SHA exactly once",
);
assert.equal(
  (codeql.match(new RegExp(`github/codeql-action/analyze@${REVIEWED_CODEQL_SHA}`, "g")) || []).length,
  1,
  "CodeQL analyze must use the reviewed immutable SHA exactly once",
);
assert.doesNotMatch(codeql, /github\/codeql-action\/(?:init|analyze)@99df26d4f13ea111d4ec1a7dddef6063f76b97e9/);
assert.match(codeql, /security-events: write/);
assert.doesNotMatch(codeql, /^\s*push:/m);
for (const workflow of [development, promotion, nightly]) {
  const cacheUses = [...workflow.matchAll(/actions\/cache@([a-f0-9]{40})/g)].map((match) => match[1]);
  assert.ok(cacheUses.length > 0, "reviewed CI workflows should use at least one bounded cache");
  assert.ok(cacheUses.every((sha) => sha === REVIEWED_CACHE_SHA), "cache actions must use the reviewed immutable SHA");
}
for (const source of workflows) assert.match(source, /timeout-minutes:/, "every release workflow should bound its jobs");
assert.match(dependabot, /package-ecosystem: npm/);
assert.match(dependabot, /package-ecosystem: github-actions/);
assert.match(dependabot, /package-ecosystem: docker/);
assert.equal((dependabot.match(/target-branch: nightly/g) || []).length, 3);

for (const requirement of [
  /GitHub-owned SHA-pinned Actions policy/,
  /sha_pinning_required: true/,
  /friends-and-family-preview/,
  /required_approving_review_count: 0/,
  /required_conversation_resolution: true/,
  /allow_force_pushes: false/,
  /allow_deletions: false/,
  /"Development gate"/,
  /protectBranch\(repo, "nightly", \[[\s\S]*"Complete maintenance release rehearsal"[\s\S]*\]\)\)/,
  /"Promotion source"/,
  /"CodeQL JavaScript analysis"/,
]) assert.match(configScript, requirement);

for (const requirement of [
  /BatchMode=yes/,
  /UserKnownHostsFile=/,
  /sudo/,
  /compose-deploy/,
  /compose-rollback/,
  /healthz/,
  /readyz/,
  /commitSha/,
  /artifactSha256/,
]) assert.match(deployScript, requirement);
for (const requirement of [
  /backup_with_state/,
  /restore_with_state/,
  /install -d -o root -g root -m 0711 "\$DEPLOY_ROOT"/,
  /install -d -o 10001 -g 10001 -m 0700 "\$BACKUP_ROOT"/,
  /install -d -o "\$DEPLOY_ACCOUNT" -g "\$DEPLOY_ACCOUNT" -m 0700 "\$INBOX"/,
  /resolved Compose application posture is not the reviewed non-root read-only loopback contract/,
  /automated deployment requires the recorded known-good Compose baseline/,
  /pre-rollback current release and data were restored and verified/,
  /LONGTAIL_RELEASE_COMMIT/,
  /LONGTAIL_RELEASE_ARTIFACT_SHA256/,
  /LONGTAIL_RELEASE_BRANCH/,
  /HELPER_ENV="\$\{LTF_COMPOSE_HELPER_ENV:-\/etc\/longtail-forge\/compose-deploy-helper\.env\}"/,
  /compose helper environment contains unsupported key/,
  /compose helper environment contains duplicate key/,
  /only protected main release metadata is accepted/,
  /image reference must be digest-addressed/,
]) assert.match(hostHelper, requirement);
assert.doesNotMatch(hostHelper, /chmod 0700 "\$DEPLOY_ROOT"/, "the deployment account must be able to traverse the root-owned parent to its private inbox");
assert.match(attributes, /^scripts\/release\/longtail-forge-compose-deploy-host\.example text eol=lf$/m);
assert.match(helperEnvironment, /LTF_PUBLIC_URL=https:\/\/preview\.example\.com/);
assert.match(helperEnvironment, /root:root ownership and mode 0600/);
assert.doesNotMatch(helperEnvironment, /LONGTAIL_SECURE_NOTES_MASTER_KEY|PASSWORD=|TOKEN=/);

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

console.log("GitHub release operations regression passed.");
