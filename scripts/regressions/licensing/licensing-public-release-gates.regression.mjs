export const regressionMeta = Object.freeze({
  id: "licensing.public-release-gates",
  area: "licensing",
  tier: "release-gate",
  tags: ["licensing", "release"],
  description: "Proves current licensing references and warning-only future publication and contribution gates remain explicit.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  LICENSING_GATE_PATHS,
  inspectLicensingGates,
} from "../../lib/licensing-gates.mjs";

const readme = readFileSync("README.md", "utf8");
const hub = readFileSync("docs/licensing.md", "utf8");
const index = readFileSync("docs/licensing/README.md", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const license = readFileSync("LICENSE", "utf8");
const legacyCleanup = readFileSync("scripts/legacy-cleanup-regression.mjs", "utf8");

assert.match(readme, /Longtail Forge Core is licensed[\s\S]*`AGPL-3\.0-only`/);
assert.equal(packageJson.license, "AGPL-3.0-only");
assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
assert.match(readme, /docs\/licensing\.md/);
assert.match(readme, /docs\/licensing\/trademark-policy\.md/);
assert.match(hub, /AGPL-3\.0-only/);
assert.match(hub, /Private repository boundary/);
assert.match(hub, /Public app legal\/about notice/);
assert.match(hub, /Do not rewrite licensing policy during unrelated feature slices/);
assert.match(index, /Future Process Gates/);
assertLocalMarkdownLinksResolve("docs/licensing.md", hub);
assertLocalMarkdownLinksResolve("docs/licensing/README.md", index);

const live = inspectLicensingGates();
assert.equal(live.warningOnly, true);
assert.deepEqual(
  live.warnings.map((warning) => warning.code),
  [
    "missing-third-party-notices",
    "missing-contributing-guide",
    "missing-pull-request-template",
    "inactive-cla-process",
  ],
  "the private repository should report its future publication/contribution artifacts without treating current licensing as broken",
);

const completePaths = new Set([
  LICENSING_GATE_PATHS.thirdPartyNotices,
  LICENSING_GATE_PATHS.contributing,
  LICENSING_GATE_PATHS.pullRequestTemplates[0],
  LICENSING_GATE_PATHS.claTerms,
  LICENSING_GATE_PATHS.contributorPolicy,
]);
assert.deepEqual(
  inspectLicensingGates({ pathExists: (filePath) => completePaths.has(filePath) }).warnings,
  [],
  "complete future-gate artifacts should clear the warning readout",
);

const command = spawnSync(process.execPath, ["scripts/check-licensing-gates.mjs"], {
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(command.status, 0, command.stderr || command.stdout);
assert.match(command.stdout, /Mode: warning-only/);
assert.match(command.stdout, /THIRD_PARTY_NOTICES\.md/);
assert.match(command.stdout, /do not fail ordinary development/);
assert.ok(
  legacyCleanup.includes("docs[\\\\/]licensing"),
  "legacy cleanup should explicitly exclude current licensing policy docs",
);

console.log("Licensing and public-release warning gates passed.");

function assertLocalMarkdownLinksResolve(sourcePath, source) {
  const links = [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/i.test(link)) {
      continue;
    }
    const target = decodeURIComponent(link.split("#", 1)[0]);
    const resolved = path.resolve(path.dirname(sourcePath), target);
    assert.equal(existsSync(resolved), true, `${sourcePath} link should resolve: ${link}`);
  }
}
