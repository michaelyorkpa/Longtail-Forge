// `0.33.33.45.3`: the four manifest defaults `createModuleEntry` supplies, and the Time Tracking
// concern composition.
//
// Defaults apply only to an absent field. Anything supplied - valid, invalid or `undefined` -
// passes through untouched so the validator judges it as before, and the module directories are
// never defaulted.

import assert from "node:assert/strict";
import { it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";
import { createModuleEntry } from "../../src/core/modules/module-entry.js";
import { validateModuleManifests } from "../../src/core/modules/manifest-contract.js";
import { listModuleEntries } from "../../src/core/modules/registry.js";

/** @typedef {import("../../src/types/framework-contracts.js").ModuleManifest} ModuleManifest */

const read = createProjectTextReader().readText;
const MODULES = ["client-projects", "developer-example", "lists", "notes", "tags", "tasks", "time-tracking", "users"];

/** @returns {ModuleManifest} */
function bareManifest() {
  return { id: "example", name: "Example", displayName: "Example", description: "An example module.", version: "1.0.0", category: "developer", enabledByDefault: false };
}

it("supplies the four defaults to a manifest that omits them, with fresh arrays for every manifest", () => {
  const first = createModuleEntry({ manifest: bareManifest() }).manifest;
  const second = createModuleEntry({ manifest: bareManifest() }).manifest;
  for (const manifest of [first, second]) {
    assert.deepEqual(manifest.publicViews, []);
    assert.deepEqual(manifest.seedHooks, []);
    assert.deepEqual(manifest.repairHooks, []);
    assert.equal(manifest.migrationsDir, null);
  }
  assert.notEqual(first.publicViews, second.publicViews, "no two manifests share a default array");
  assert.notEqual(first.seedHooks, second.seedHooks);
  assert.notEqual(first.repairHooks, second.repairHooks);
});

it("keeps every supplied value as given, including undefined and invalid ones, and leaves the directories alone", () => {
  const seedHook = { id: "seed" };
  const publicViews = [{ id: "view", moduleId: "example", path: "/example", file: "example.html" }];
  const migrationsDir = new URL("./migrations/", import.meta.url);
  /** @type {ModuleManifest} */
  const supplied = { ...bareManifest(), publicViews, seedHooks: [seedHook], repairHooks: undefined, migrationsDir };
  const manifest = createModuleEntry({ manifest: supplied }).manifest;
  assert.equal(manifest.publicViews, publicViews, "a supplied array is the same array");
  assert.equal(manifest.seedHooks?.[0], seedHook);
  assert.ok(Object.hasOwn(manifest, "repairHooks") && manifest.repairHooks === undefined, "an explicit undefined is not replaced");
  assert.equal(manifest.migrationsDir, migrationsDir);
  assert.ok(!Object.hasOwn(manifest, "browserAssetsDir"), "browserAssetsDir is never defaulted");
  assert.ok(!Object.hasOwn(manifest, "protectedViewsDir"), "protectedViewsDir is never defaulted");
  assert.ok(!Object.hasOwn(supplied, "browserAssetsDir"));
});

it("does not mutate the module's own manifest object, and freezes only the entry", () => {
  const original = bareManifest();
  const entry = createModuleEntry({ manifest: original });
  assert.ok(!Object.hasOwn(original, "publicViews"), "the caller's object is not given defaults");
  assert.notEqual(entry.manifest, original);
  assert.ok(Object.isFrozen(entry));
  assert.ok(!Object.isFrozen(entry.manifest), "the manifest stays as unfrozen as it was");
});

it("still refuses an invalid explicit value, because nothing is sanitized before the validator", () => {
  const manifests = listModuleEntries().map((entry) => entry.moduleEntry.manifest);
  assert.doesNotThrow(() => validateModuleManifests(manifests));
  for (const [field, invalid] of /** @type {const} */ ([["seedHooks", "not an array"], ["repairHooks", 7]])) {
    const tags = manifests.find((manifest) => manifest.id === "tags");
    assert.ok(tags);
    const broken = createModuleEntry({ manifest: { ...tags, [field]: invalid } }).manifest;
    assert.equal(broken[field], invalid, `${field}: the invalid value reaches the validator unchanged`);
    assert.throws(() => validateModuleManifests(manifests.map((manifest) => (manifest.id === "tags" ? broken : manifest))), new RegExp(field));
  }
});

it("lets every bundled module omit the four defaults while each keeps its own directories explicit", () => {
  for (const moduleId of MODULES) {
    const source = read(`src/modules/${moduleId}/module.js`);
    assert.doesNotMatch(source, /^ {2}(?:publicViews|seedHooks|repairHooks|migrationsDir):/m, `${moduleId} relies on the defaults`);
    assert.match(source, /^ {2}browserAssetsDir: new URL\("\.\.\/\.\.\/\.\.\/public\/js\/", import\.meta\.url\),$/m, `${moduleId} names its browser assets`);
    assert.match(source, /^ {2}protectedViewsDir: new URL\("\.\.\/\.\.\/\.\.\/views\/protected\/", import\.meta\.url\),$/m, `${moduleId} names its protected views`);
  }
  for (const entry of listModuleEntries()) {
    const manifest = entry.moduleEntry.manifest;
    assert.deepEqual(manifest.publicViews, [], manifest.id);
    assert.equal(manifest.migrationsDir, null, manifest.id);
  }
});

it("composes Time Tracking from three data-only concerns, each field assigned explicitly in place", () => {
  const moduleSource = read("src/modules/time-tracking/module.js");
  const concerns = {
    "module.permissions.js": ["timeTrackingPermissions", ["requiredPermissions", "permissions", "defaultRolePermissions", "resourceDefinitions", "auditRecordTypes"]],
    "module.events.js": ["timeTrackingEvents", ["eventTypes", "eventSummaries", "notificationEvents"]],
    "module.integrations.js": ["timeTrackingIntegrations", ["publicApiEndpoints", "taggableTypes", "attachableTypes", "searchableTypes", "apiScopes", "timerSources", "workItemSources"]],
  };
  for (const [file, [constant, fields]] of Object.entries(concerns)) {
    const concern = read(`src/modules/time-tracking/${file}`);
    assert.doesNotMatch(concern, /^import /m, `${file} imports nothing, so loading it has no side effect`);
    assert.doesNotMatch(concern, /=>|\bfunction\b/, `${file} carries declarations, not behaviour`);
    assert.match(moduleSource, new RegExp(`import \\{ ${constant} \\} from "\\./${file.replace(".", "\\.")}";`));
    for (const field of fields) {
      assert.match(moduleSource, new RegExp(`^ {2}${field}: ${constant}\\.${field},$`, "m"), `${field} is assigned explicitly`);
    }
  }
  assert.match(moduleSource, /function activateTimeTrackingAppRuntime\(\)[\s\S]*function activateTimeTrackingWorkerRuntime\(\)/, "activation stays in module.js");
  assert.match(moduleSource, /createModuleEntry\(\{\s*manifest: timeTrackingModule,\s*activateApp: activateTimeTrackingAppRuntime,\s*activateWorker: activateTimeTrackingWorkerRuntime,\s*\}\)/);
});
