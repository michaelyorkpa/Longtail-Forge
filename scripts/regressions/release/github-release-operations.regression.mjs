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

/** @param {string} filePath */
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
  ".github/workflows/native-lifecycle-qualification.yml",
];
const REVIEWED_CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
// `0.33.33.49`: v4.38.2, the annotated tag 88585263 on signed commit 2892aa5e. `init` and `analyze` move
// together: a split pair fails analysis because each loads the other version's configuration.
const REVIEWED_CODEQL_SHA = "2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2";
const REVIEWED_CACHE_SHA = "55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const [development, promotion, nightly, mainRelease, manualImageCandidate, manualRelease, manualPreview, codeql, nativeQualification, dependabot, configScript, deployScript, hostHelper, helperEnvironment, attributes, appInfo, configSource, _packageSource] = await Promise.all([
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
const workflows = [development, promotion, nightly, mainRelease, manualImageCandidate, manualRelease, manualPreview, codeql, nativeQualification];

// The `v0.33.33` post-release patch: native lifecycle qualification is evidence beside the required gates. It runs the
// actual helpers and published or disposable images, and never receives publication, deployment,
// or repository-write authority.
for (const requirement of [
  /^permissions:\n  contents: read\n\n/m,
  /profile: \[preview, demo\]/,
  /node scripts\/release\/compose-lifecycle-qualification\.mjs --profile "\$PROFILE" --hermetic/,
  /node scripts\/release\/compose-lifecycle-qualification\.mjs --profile "\$PROFILE" \\\n\s+--candidate-metadata/,
  /CADDY_ARCHIVE_SHA512: [a-f0-9]{128}/,
  /TRIVY_ARCHIVE_SHA256: [a-f0-9]{64}/,
  /sha256sum --check --strict/,
  /npm audit --omit=dev --json/,
  /vuln\/core\/index\.json/,
  // Both jobs check out the exact proposed commit or the release tag, never a merge ref, and a
  // published release runs only helpers and Compose bytes identical to its operator assets.
  /(?:ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.candidate_tag \|\| github\.event\.pull_request\.head\.sha \}\}[\s\S]*){2}/,
  /cmp "\$RUNNER_TEMP\/candidate\/\$asset" "scripts\/release\/\$asset"/,
  /cmp "\$RUNNER_TEMP\/candidate\/compose\.yaml" compose\.yaml/,
]) assert.match(nativeQualification, requirement);
assert.doesNotMatch(nativeQualification, /packages: write|contents: write|id-token: write|secrets\.|environment:/, "native qualification must hold no publication, deployment, or secret authority");
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
  /npm run test:regressions/,
  /npm audit --audit-level=high/,
  /name: Browser gate/,
  /name: Packaging and recovery/,
  /npm run container:smoke/,
]) assert.match(promotion, requirement);
assert.doesNotMatch(promotion, /npm run test:permissions/, "promotion should execute the discovered permission harness only through the full regression registry");
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
assert.match(nightly, /npm run test:regressions/);
assert.doesNotMatch(nightly, /npm run test:permissions/, "Nightly should execute the discovered permission harness only through the full regression registry");
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
assert.match(manualPreview, /npm run test:regressions/);
assert.doesNotMatch(manualPreview, /npm run test:permissions/, "manual preview should execute the discovered permission harness only through the full regression registry");

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
assert.doesNotMatch(codeql, /github\/codeql-action\/(?:init|analyze)@5595ccaf912efad79be6eef63a5619ff05969be3/, "the retired v4.37.6 CodeQL SHA must not return");
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

// `0.33.33.48.3`: exactly two test-running checkouts read full history, because unit tests load
// committed baselines through `git show <sha>:<path>`. Both stay at their exact SHA, and every
// other checkout keeps its depth, so the repair can neither widen nor regress unnoticed.
const nightlyRevision = "${{ needs.classify_changes.outputs.revision }}";
const promotionHead = "${{ github.event.pull_request.head.sha }}";
assert.deepEqual(checkoutInventory(nightly), {
  classify_changes: [{ ref: "${{ github.sha }}", depth: "0" }, { ref: "nightly", depth: "1" }],
  "integration-gate": [{ ref: nightlyRevision, depth: "0" }],
  "browser-gate": [{ ref: nightlyRevision, depth: "1" }],
  "publish-proof": [{ ref: nightlyRevision, depth: "1" }],
}, "only the nightly full gate reads full history, at the exact classify-selected revision");
assert.deepEqual(checkoutInventory(promotion), {
  "promotion-source": [{ ref: promotionHead, depth: "1" }],
  "release-gate": [{ ref: promotionHead, depth: "0" }],
  "browser-gate": [{ ref: promotionHead, depth: "1" }],
  "artifact-source": [{ ref: promotionHead, depth: "1" }],
  "artifact-smoke": [{ ref: promotionHead, depth: "1" }],
  "backup-recovery": [{ ref: promotionHead, depth: "1" }],
  "container-recovery": [{ ref: promotionHead, depth: "1" }],
  "dependency-review": [{ ref: null, depth: "1" }],
}, "only the promotion fallback release gate reads full history, at the exact pull-request head SHA");
for (const [source, job] of /** @type {const} */ ([[nightly, "integration-gate"], [promotion, "release-gate"]])) {
  assert.match(
    jobSource(source, job),
    /# Full history: unit tests read committed baselines through `git show <sha>:<path>`\.\n\s+# The checkout is still the exact [^\n]+\n\s+fetch-depth: 0\n/,
    `${job} must say why it reads full history`,
  );
}
// The reader itself must see each way the repair could drift: a moving branch in place of the
// exact SHA, a second checkout widened to full history, and the repaired depth reverted.
for (const [label, drifted] of [
  ["a moving branch ref", nightly.replace(`ref: ${nightlyRevision}\n          # Full history`, "ref: nightly\n          # Full history")],
  ["a widened checkout", promotion.replace(/(browser-gate:[\s\S]*?fetch-depth: )1/, "$10")],
  ["a reverted depth", nightly.replace(/(# The checkout is still the exact classify-selected revision\.\n\s+fetch-depth: )0/, "$11")],
]) {
  assert.notEqual(drifted, label === "a widened checkout" ? promotion : nightly, `the ${label} probe must change the workflow text`);
  assert.notDeepEqual(
    checkoutInventory(drifted),
    checkoutInventory(label === "a widened checkout" ? promotion : nightly),
    `the checkout inventory must see ${label}`,
  );
}

console.log("GitHub release operations regression passed.");

/**
 * The source of one job: from its `  <id>:` line under `jobs:` up to the next job.
 * @param {string} source
 * @param {string} jobId
 * @returns {string}
 */
function jobSource(source, jobId) {
  const start = source.indexOf(`\n  ${jobId}:\n`);
  assert.notEqual(start, -1, `workflow must declare job ${jobId}`);
  const next = source.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:\n/);
  return next === -1 ? source.slice(start + 1) : source.slice(start + 1, start + 1 + next + 1);
}

/**
 * Every `actions/checkout` step's `ref` and `fetch-depth`, grouped by job id in workflow order.
 * A step ends at the next step or job, and comment lines inside `with:` are skipped.
 * @param {string} source
 * @returns {Record<string, { ref: string | null, depth: string | null }[]>}
 */
function checkoutInventory(source) {
  const jobsAt = source.indexOf("\njobs:\n");
  assert.notEqual(jobsAt, -1, "workflow must declare jobs");
  /** @type {Record<string, { ref: string | null, depth: string | null }[]>} */
  const inventory = {};
  /** @type {string | null} */
  let job = null;
  const lines = source.slice(jobsAt + "\njobs:\n".length).split("\n");
  for (const [index, line] of lines.entries()) {
    const jobMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch) {
      job = jobMatch[1];
      continue;
    }
    if (job === null || !/^\s+(?:-\s+)?uses: actions\/checkout@/.test(line)) continue;
    /** @type {{ ref: string | null, depth: string | null }} */
    const entry = { ref: null, depth: null };
    for (const following of lines.slice(index + 1)) {
      if (/^\s+-\s/.test(following) || /^ {2}[A-Za-z0-9_-]+:\s*$/.test(following)) break;
      const ref = following.match(/^\s+ref: (.+)$/);
      if (ref) entry.ref = ref[1].trim();
      const depth = following.match(/^\s+fetch-depth: (.+)$/);
      if (depth) entry.depth = depth[1].trim();
    }
    (inventory[job] ??= []).push(entry);
  }
  return inventory;
}
