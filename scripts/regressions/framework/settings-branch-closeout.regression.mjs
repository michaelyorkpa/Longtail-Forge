export const regressionMeta = Object.freeze({
  id: "framework.settings-branch-closeout",
  area: "framework",
  tier: "release-gate",
  tags: ["closeout", "settings", "views"],
  description: "Locks the Settings branch closeout guardrails, converted-host inventory, and documented consumer map.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const files = Object.freeze({
  settingsHost: readText("public/js/shared/settings-host.js"),
  settingsRenderer: readText("public/js/shared/settings-renderer.js"),
  settingsService: readText("src/services/settings.service.js"),
  settingsCatalog: readText("src/services/settings-catalog.service.js"),
  filesService: readText("src/services/files.service.js"),
  manifestContract: readText("src/core/modules/manifest-contract.js"),
  frameworkRegistry: readText("src/core/settings/framework-settings-registry.js"),
  moduleContractDocs: readText("docs/module-contract.md"),
  declarativeSurfacesDocs: readText("docs/declarative-view-surfaces.md"),
  settingsControlDocs: readText("docs/settings-control-matrix.md"),
  settingsOwnershipDocs: readText("docs/settings-ownership.md"),
  viewContractDocs: readText("docs/view-building-contract.md"),
  decisions: readText("DECISIONS.md"),
  changelog: readText("CHANGELOG.md"),
});

for (const [label, path] of [
  ["Workspace Settings", "views/protected/workspace-settings.html"],
  ["User Settings", "views/protected/user-settings.html"],
  ["Tasks Settings", "views/protected/tasks-settings.html"],
  ["Time Tracking Settings", "views/protected/time-tracking-settings.html"],
  ["Files Settings", "views/protected/files-settings.html"],
]) {
  const source = readText(path);
  assert.match(
    source,
    /js\/shared\/view-builder\.js[\s\S]*js\/shared\/settings-renderer\.js[\s\S]*js\/shared\/settings-host\.js/,
    `${label} should load the shared view primitive, settings renderer, and settings host in order`,
  );
  assert.match(source, /<main[^>]+data-settings-host="(?:workspace|user|module)"[^>]*><\/main>/, `${label} should be a minimal Settings host`);
  assert.doesNotMatch(source, /<(?:form|fieldset|label|input|select|button|dialog)\b/, `${label} must not hand-build Settings anatomy`);
}

assert.equal(existsSync("public/js/shared/settings-controls.js"), false, "The retired settings-controls path must not return");
assert.equal(existsSync("public/js/shared/settings-normalizers.js"), false, "The retired settings-normalizers path must not return");

assert.match(files.settingsHost, /root\.settingsHost = api/);
assert.match(files.settingsRenderer, /root\.settingsRenderer = Object\.freeze\(/);
assert.doesNotMatch(files.settingsHost, /document\.createElement\(/, "The framework Settings host should build anatomy through view primitives");
assert.match(files.settingsRenderer, /view\.createFieldGrid\(/, "The Settings renderer should use the shared field grid");
assert.match(files.settingsRenderer, /view\.createField\(/, "The Settings renderer should use the shared field factory");
assert.match(files.settingsRenderer, /view\.collectFieldValues\(grid\)/, "The Settings renderer should collect typed field values through the shared collector");
assert.doesNotMatch(files.settingsRenderer, firstPartySettingKnowledge(), "The shared Settings renderer must not special-case first-party module settings");
assert.doesNotMatch(files.settingsHost, firstPartySettingKnowledge(), "The shared Settings host must not special-case first-party module settings");

assert.doesNotMatch(files.settingsService, /from\s+["']\.\.\/modules\//, "The framework Settings service must not import feature modules");
assert.doesNotMatch(files.settingsService, firstPartySettingKnowledge(), "The framework Settings service must not name first-party module settings");
assert.match(files.settingsCatalog, /modulesService\.listSettingsContributions\(workspaceId, session\)/, "The catalog should list settings through the contribution seam");
assert.match(files.settingsCatalog, /listFrameworkSettingDefinitions\(\)/, "The catalog should include protected framework definitions through the framework registry");
assert.match(files.manifestContract, /target 'framework' is reserved for framework-registered settings/);
assert.match(files.manifestContract, /protected may only be set by a framework-registered setting/);
assert.match(files.manifestContract, /conflicts with a framework-registered setting/);
assert.match(files.frameworkRegistry, /FRAMEWORK_SETTING_NAMESPACE = "framework"/);
assert.match(files.filesService, /registerFrameworkSettingDefinition\(\{[\s\S]*moduleId: "files"[\s\S]*protected: true/);

assert.match(files.settingsOwnershipDocs, /Client\/Projects module[\s\S]*Workspace default billing rate and billing period/);
assert.match(files.settingsOwnershipDocs, /Time Tracking module[\s\S]*Fiscal-year boundary and time rounding/);
assert.match(files.settingsOwnershipDocs, /Tasks module[\s\S]*Task timers and reminder policies/);
assert.match(files.settingsOwnershipDocs, /Files framework service[\s\S]*File-type policy and storage quotas/);
assert.match(files.settingsOwnershipDocs, /Settings facilities and consumers/);
assert.match(files.settingsOwnershipDocs, /Intrinsically framework-wide exceptions/);

for (const pathLabel of [
  "Workspace Settings",
  "Files Settings",
  "Tasks Settings",
  "Time Tracking Settings",
  "User Settings",
]) {
  assert.match(files.declarativeSurfacesDocs, new RegExp(`\\| ${escapeRegExp(pathLabel)} \\|[^\\n]+\\| strict \\|`), `${pathLabel} should be documented as strict`);
}
assert.match(files.declarativeSurfacesDocs, /Settings hosts are strict/);
assert.match(files.viewContractDocs, /Admin and Settings[\s\S]*minimal `data-settings-host` pages built by `LongtailForge\.settingsHost`/);
assert.match(files.viewContractDocs, /No first-party module setting ID belongs in `settings-host\.js`, `settings-renderer\.js`, `settings\.service\.js`, or `settings-catalog\.service\.js`/);
assert.match(files.settingsControlDocs, /A new ordinary module setting requires a manifest contribution/);
assert.match(files.moduleContractDocs, /A new ordinary module setting should require only this manifest contribution/);
assert.match(files.decisions, /As of 0\.33\.15\.8/);
assert.match(files.changelog, /Version 0\.33\.15\.8/);

console.log("Settings branch closeout regression passed.");

function readText(path) {
  return readFileSync(path, "utf8");
}

function firstPartySettingKnowledge() {
  return /defaultBillingRate|billingPeriod(?:Type|StartDay)?|fiscalYear(?:StartMonth|StartDay)?|billingRounding(?:Enabled|Increment)?|taskTimersEnabled|taskReminder|fileTypePolicyMode|allowedExtensions|blockedExtensions|StorageLimitBytes|developerExampleHintsEnabled/i;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
