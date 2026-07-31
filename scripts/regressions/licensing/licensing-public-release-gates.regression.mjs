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
import {
  escapeTable,
  generateThirdPartyNotices,
  inspectThirdPartyNotices,
} from "../../lib/third-party-notices.mjs";

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
assert.match(index, /Process Gates/);
assertLocalMarkdownLinksResolve("docs/licensing.md", hub);
assertLocalMarkdownLinksResolve("docs/licensing/README.md", index);

const live = inspectLicensingGates();
assert.equal(live.warningOnly, true);
assert.equal(live.checks.thirdPartyNoticesPresent, true);
assert.equal(live.checks.thirdPartyNoticesCurrent, true);
assert.equal(live.checks.publicLegalAboutPresent, true);
assert.equal(live.checks.publicLegalSurfacesPresent, true);
assert.deepEqual(
  live.warnings.map((warning) => warning.code),
  [
    "missing-contributing-guide",
    "missing-pull-request-template",
    "inactive-cla-process",
  ],
  "the private repository should report its future publication/contribution artifacts without treating current licensing as broken",
);

const missingNotice = inspectLicensingGates({
  pathExists: (filePath) => filePath !== LICENSING_GATE_PATHS.thirdPartyNotices,
  thirdPartyNoticeStatus: { current: false, message: "missing" },
});
assert.equal(missingNotice.warnings[0].code, "missing-third-party-notices");

const staleNotice = inspectLicensingGates({
  thirdPartyNoticeStatus: { current: false, message: "reviewed inventory drift" },
});
assert.equal(staleNotice.warnings[0].code, "stale-third-party-notices");
assert.match(staleNotice.warnings[0].message, /inventory drift/);

const missingLegalAbout = inspectLicensingGates({
  pathExists: (filePath) => filePath !== LICENSING_GATE_PATHS.publicLegalAbout[0],
});
assert.ok(missingLegalAbout.warnings.some((warning) => warning.code === "missing-public-legal-about"));

const missingLegalSurface = inspectLicensingGates({
  pathExists: (filePath) => filePath !== LICENSING_GATE_PATHS.publicLegalSurfaces[0],
});
assert.ok(missingLegalSurface.warnings.some((warning) => warning.code === "missing-public-legal-surfaces"));

const completePaths = new Set([
  ...LICENSING_GATE_PATHS.publicLegalAbout,
  ...LICENSING_GATE_PATHS.publicLegalSurfaces,
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
assert.match(command.stdout, /Third-party notices: satisfied/);
assert.match(command.stdout, /In-app legal\/about: satisfied/);
assert.match(command.stdout, /Public legal surfaces: present/);
assert.match(command.stdout, /do not fail ordinary development/);

const noticeCheck = inspectThirdPartyNotices();
assert.equal(noticeCheck.current, true, noticeCheck.message);
assert.equal(noticeCheck.componentCount, 91);
const generatedNotices = generateThirdPartyNotices();
assert.equal(
  escapeTable("one\\two|three\\\\four"),
  "one\\\\two\\|three\\\\\\\\four",
  "notice table escaping should preserve literal backslashes while escaping every pipe",
);
assert.equal(escapeTable("a||b"), "a\\|\\|b", "notice table escaping should escape repeated pipes");
assert.match(generatedNotices.content, /\| better-sqlite3 \| 13\.0\.1 \| MIT \|/);
assert.match(generatedNotices.content, /\| argparse \| 2\.0\.1 \| Python-2\.0 \|/);
assert.match(generatedNotices.content, /\| uuid \| 14\.0\.1 \| MIT \|/);
assert.match(generatedNotices.content, /Lucide Icons \(bundled inline SVG subset\)/);
assert.match(generatedNotices.content, /Bundled fonts: none/);
assert.doesNotMatch(generatedNotices.content, /\| vitest \||\| eslint \||\| playwright \|/);
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
