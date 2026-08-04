export const regressionMeta = Object.freeze({
  id: "release.qualified-runtime-version",
  area: "release",
  tier: "release-gate",
  tags: ["branch-identity", "release", "runtime", "version"],
  description: "Proves canonical and branch-qualified runtime identity across API, shell, diagnostics, public UI, artifacts, and deployment paths.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { appVersion, qualifyAppVersion } from "../../../src/core/version.js";
import { createConfig } from "../../../src/config.js";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [appInfo, appShell, diagnostics, splash, footer, artifactBuilder, deploy, hostHelper, nightly, main, manualPreview, manualRelease] = await Promise.all([
  read("src/routes/app-info.routes.js"),
  read("src/services/app-shell.service.js"),
  read("src/services/runtime-diagnostics.service.js"),
  read("public/js/splash.js"),
  read("public/js/footer.js"),
  read("scripts/build-runtime-artifact.mjs"),
  read("scripts/release/deploy-via-ssh.mjs"),
  read("scripts/release/longtail-forge-deploy-host.example"),
  read(".github/workflows/nightly.yml"),
  read(".github/workflows/main-release.yml"),
  read(".github/workflows/manual-preview.yml"),
  read(".github/workflows/manual-release.yml"),
]);

const local = createConfig({});
assert.equal(local.appVersion, appVersion);
assert.equal(local.appDisplayVersion, appVersion);
assert.equal(local.release.sourceBranch, null);

for (const branch of ["nightly", "main"]) {
  const configured = createConfig({ LONGTAIL_RELEASE_BRANCH: branch });
  assert.equal(configured.appVersion, appVersion);
  assert.equal(configured.appDisplayVersion, `${appVersion}-${branch}`);
  assert.equal(configured.release.sourceBranch, branch);
  assert.equal(qualifyAppVersion(appVersion, branch), `${appVersion}-${branch}`);
}
assert.throws(() => createConfig({ LONGTAIL_RELEASE_BRANCH: "Feature/bad" }), /Source branch/);
assert.throws(() => createConfig({ LONGTAIL_RELEASE_BRANCH: "-nightly" }), /Source branch/);

for (const source of [appInfo, appShell, diagnostics]) {
  assert.match(source, /displayVersion/);
  assert.match(source, /canonicalVersion/);
  assert.match(source, /sourceBranch/);
}
assert.match(splash, /appInfo\.displayVersion \|\| appInfo\.version/);
assert.match(footer, /appInfo\.displayVersion \|\| appInfo\.version/);
assert.match(artifactBuilder, /sourceBranch: normalizeReleaseBranch\(sourceBranch\) \|\| null/);
assert.match(deploy, /expected-source-branch/);
assert.match(hostHelper, /LONGTAIL_RELEASE_BRANCH/);
assert.match(nightly, /artifact:build -- --source-branch nightly/);
for (const source of [main, manualRelease]) {
  assert.match(source, /artifact:build -- --source-branch main/);
}
assert.match(manualPreview, /gh release download/);
assert.match(manualPreview, /image:publish -- verify --metadata dist\/release-metadata\.json --expected-commit "\$REVISION"/);
assert.doesNotMatch(manualPreview, /artifact:build|--source-branch nightly/);

console.log("Qualified runtime version regression passed.");
