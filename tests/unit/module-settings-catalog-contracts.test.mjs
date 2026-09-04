import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const catalogService = read("src/services/settings-catalog.service.js");
const modulesService = read("src/core/modules/modules.service.js");
const manifest = read("src/core/modules/manifest-contract.js");
const host = read("public/js/shared/settings-host.js");
const page = read("public/js/module-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.search(new RegExp("export interface " + name + "(?: extends \\w+)? \\{"));
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredMembers(name) {
  return [...declaredInterface(name).matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = page.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return page.slice(start, page.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    slice("  function isCatalogRecord(value) {"),
    slice("  function isModuleSettingsSetting(value) {"),
    slice("  function isModuleSettingsSection(value, moduleId) {"),
    slice("  function readModuleSettingsSections(catalog, moduleId) {"),
    "return { readModuleSettingsSections, isModuleSettingsSection, isModuleSettingsSetting };",
  ].join("\n"))();
}

const setting = (overrides = {}) => ({
  id: "retentionDays",
  label: "Retention",
  moduleId: "notes",
  placement: "module",
  target: "module",
  type: "number",
  readOnly: false,
  readOnlyReason: "",
  value: 30,
  ...overrides,
});

const section = (overrides = {}) => ({
  displayName: "Notes",
  id: "module.notes",
  moduleId: "notes",
  name: "Notes",
  placement: "module",
  settings: [setting()],
  ...overrides,
});

const catalog = (overrides = {}) => ({
  attachmentPoints: [{ id: "module", label: "Module" }],
  attachments: { workspace: [], user: [], module: { notes: [section()] }, "new-workspace": [] },
  ...overrides,
});

const readCatalog = functionBody(catalogService, "async function read(session) {");

describe("the catalog producer", () => {
  it("answers an exact envelope over four fixed placements", () => {
    const literal = readCatalog.slice(readCatalog.indexOf("  return {"));
    // `[:,]` rather than `:` alone: `attachments` is a shorthand property, and a scan that
    // demanded a colon would have reported this envelope as carrying one member.
    assert.deepEqual([...literal.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort(),
      ["attachmentPoints", "attachments"], "the catalog must carry exactly its two members");
    assert.ok(!/^ {4}\.\.\./m.test(literal), "a spread would make the exact membership unearned");
    const placements = functionBody(catalogService, "function createEmptyAttachments() {", "\n}\n");
    assert.match(placements, /return \{\n {4}workspace: \[\],\n {4}user: \[\],\n {4}module: \{\},\n {4}"new-workspace": \[\],\n {2}\};/,
      "and exactly four placement containers, the module one keyed by module");
  });

  it("keys the module bucket on the same module it hands the section builder", () => {
    const add = functionBody(catalogService, "function addSettingToAttachment(attachments, placement, setting, moduleMetadata) {", "\n}\n");
    assert.match(add, /const target = placement === "module"\n\s+\? attachments\.module\[setting\.moduleId\] \|\|= \[\]\n/,
      "the module bucket must be keyed on the setting's module");
    assert.match(add, /findOrCreateSection\(target, setting\.moduleId, placement, moduleMetadata\)/,
      "and the section built for that same module and placement");
    const find = functionBody(catalogService, "function findOrCreateSection(sections, moduleId, placement, moduleMetadata) {", "\n}\n");
    assert.match(find, /id: `\$\{placement\}\.\$\{moduleId\}`,\n\s+placement,\n\s+settings: \[\],/,
      "so id, placement and settings are written by name after the metadata spread");
    assert.match(functionBody(catalogService, "function buildModuleMetadata(moduleSettings = []) {", "\n}\n"),
      /moduleId: moduleDefinition\.moduleId,\n\s+name: moduleDefinition\.name \|\| moduleDefinition\.moduleId,\n\s+displayName: moduleDefinition\.displayName \|\| moduleDefinition\.name \|\| moduleDefinition\.moduleId,/,
      "and the metadata always supplies the other three");
  });

  it("builds settings by spreading an extensible contribution", () => {
    assert.match(functionBody(catalogService, "function hydrateContribution(contribution, decorated) {", "\n}\n"),
      /return \{\n {4}\.\.\.contribution,\n {4}readOnly:[\s\S]*readOnlyReason:[\s\S]*value:/,
      "a module setting is its own contribution plus three written members");
    assert.match(catalogService, /const setting = \{\n\s+\.\.\.definition,\n\s+moduleId,\n\s+target: "framework",/,
      "and a framework setting is its definition plus a written target");
    assert.match(declaredInterface("BrowserModuleSettingsSetting"), /^ {2}id: string;\n {2}target: string;$/m,
      "so the contract promises only the two members the collector trusts");
    assert.deepEqual(declaredMembers("BrowserModuleSettingsSetting"), ["id", "target"],
      "and nothing else");
  });

  it("writes a target on every setting that reaches this response", () => {
    assert.match(modulesService, /\.\.\.setting,\n\s+target: setting\.target \|\| "module",/,
      "a module contribution's target defaults rather than being omitted");
    assert.match(catalogService, /target: "framework",/, "and the framework path writes its own");
  });
});

describe("the guarantees this child relies on rather than re-derives", () => {
  it("takes its identifier requirement from the manifest contract", () => {
    const validator = functionBody(manifest, "function validateSettingsContributions(settings, errors) {", "\n}\n");
    assert.match(validator, /requireString\(item, "id", errors, \{ prefix, pattern: IDENTIFIER_PATTERN \}\);/,
      "a contributed setting id must match the identifier pattern, so it cannot be empty");
  });

  it("proves a module contribution cannot claim the framework target", () => {
    const validator = functionBody(manifest, "function validateSettingsContributions(settings, errors) {", "\n}\n");
    assert.match(validator, /if \(typeof item\.target === "string" && !SETTING_TARGETS\.has\(item\.target\)\) \{/,
      "a declared target must be one the framework knows");
    assert.match(validator, /if \(item\.target === "framework"\) \{\n\s+errors\.push\(`\$\{prefix\}\.target 'framework' is reserved for framework-registered settings\.`\);/,
      "and 'framework' is reserved, which is what makes the collector's test safe");
    assert.match(manifest, /const SETTING_TARGETS = new Set\(\["module", "framework"\]\);/,
      "over the set the framework itself defines");
  });

  it("leaves module status, capability and permission filtering to the server", () => {
    assert.match(readCatalog, /if \(!isSettingsPlacement\(placement\) \|\| !Object\.hasOwn\(attachments, placement\) \|\| contribution\.moduleStatus === true\) \{\n\s+continue;/,
      "a contribution for an unknown placement or a disabled module is skipped");
    assert.match(readCatalog, /if \(\["workspace", "module"\]\.includes\(placement\) && !canManageWorkspaceSettings\) \{\n\s+continue;/,
      "and the module placement requires workspace settings management");
    assert.match(readCatalog, /permissionsService\.canInAnyScope\(session, "workspace_settings\.manage", \{/,
      "which is resolved server-side");
    assert.match(functionBody(catalogService, "async function addFrameworkSettingSections(attachments, session, settings, moduleMetadata) {"),
      /if \(!\(await frameworkDefinitionEligible\(definition, session, enabledModules, availableTools\)\)\) \{\n\s+continue;/,
      "and a framework definition must be eligible for this workspace's modules and capabilities");
    assert.ok(!page.includes("workspace_settings.manage"),
      "the browser must not re-derive any of that");
  });

  it("declares only the section minimum, not a settings domain model", () => {
    assert.deepEqual(declaredMembers("BrowserModuleSettingsSection"),
      ["displayName", "id", "moduleId", "name", "placement", "settings"],
      "the section promises six members");
    assert.match(declaredInterface("BrowserModuleSettingsSection"), /placement: "module";/,
      "with the placement fixed to the bucket this contract describes");
    assert.doesNotMatch(contracts, /BrowserSettingDefinition|BrowserSettingsCatalog\b|BrowserSettingsAttachmentPoint/,
      "and this child publishes no wider catalog model");
    for (const rendererOwned of ["label", "type", "options", "visibility"]) {
      assert.ok(!declaredMembers("BrowserModuleSettingsSetting").includes(rendererOwned),
        rendererOwned + " belongs to the settings renderer, not to this collector");
    }
  });
});

describe("the shipped reader, run against real catalogs", () => {
  const { readModuleSettingsSections, isModuleSettingsSection } = shippedReader();

  it("accepts a real catalog and answers the producer's own sections", () => {
    const wire = catalog();
    const original = wire.attachments.module.notes;
    const originalSection = original[0];
    const originalSetting = original[0].settings[0];
    const result = readModuleSettingsSections(wire, "notes");
    assert.ok(result, "a real catalog must be accepted");
    assert.equal(result, original, "and answer the producer's own section list");
    assert.equal(result[0], originalSection, "its own section");
    assert.equal(result[0].settings[0], originalSetting, "and its own settings");
    assert.equal(result[0].settings[0].label, "Retention", "so the renderer still sees the label");
    assert.equal(result[0].settings[0].value, 30, "and the value");
  });

  it("answers an empty list for a module that contributes nothing", () => {
    assert.deepEqual(readModuleSettingsSections(catalog(), "tasks"), [],
      "a module with no entry contributes no sections");
    assert.deepEqual(
      readModuleSettingsSections(catalog({
        attachments: { workspace: [], user: [], module: { notes: [] }, "new-workspace": [] },
      }), "notes"),
      [],
      "and a module whose entry is empty is the same real answer",
    );
  });

  it("refuses a catalog this page cannot vouch for", () => {
    for (const bad of [
      null, undefined, 7, "catalog", [],
      {},
      catalog({ attachments: undefined }),
      catalog({ attachments: "none" }),
      catalog({ attachments: { workspace: [], user: [], module: "none", "new-workspace": [] } }),
      catalog({ attachments: { workspace: [], user: [], module: null, "new-workspace": [] } }),
    ]) {
      assert.equal(readModuleSettingsSections(bad, "notes"), null, "an unusable catalog must be refused");
    }
  });

  it("proves each container before it reads through it", () => {
    // These two guards cannot be attacked behaviourally in full: removing either makes the
    // reader dereference or iterate a value it has not proved, so a break turns a clean
    // refusal into a crash. They are pinned by source, the way earlier container checks were.
    const reader = functionBody(page, "  function readModuleSettingsSections(catalog, moduleId) {", "\n  }\n");
    assert.match(reader, /if \(!isCatalogRecord\(catalog\) \|\| !isCatalogRecord\(catalog\.attachments\)\) \{/,
      "the attachments container must be proved a record before it is read through");
    assert.match(reader, /if \(!Array\.isArray\(sections\) \|\| !sections\.every\(/,
      "and the module entry must be proved a list before it is iterated");
    const attachmentsGuard = reader.indexOf("isCatalogRecord(catalog.attachments)");
    const moduleRead = reader.indexOf("catalog.attachments.module");
    assert.notEqual(attachmentsGuard, -1, "the attachments container must be proved a record before it is read through");
    assert.notEqual(moduleRead, -1, "the module bucket must be read");
    assert.ok(attachmentsGuard < moduleRead, "and that proof must come first");
  });

  it("refuses a module entry that is present but not a section list", () => {
    for (const bad of ["none", 7, {}, null]) {
      assert.equal(
        readModuleSettingsSections(catalog({
          attachments: { workspace: [], user: [], module: { notes: bad }, "new-workspace": [] },
        }), "notes"),
        null,
        "a present entry must be a list of sections",
      );
    }
  });

  it("refuses a section that disagrees with the bucket it was read from", () => {
    for (const bad of [
      section({ placement: "workspace" }),
      section({ placement: undefined }),
      section({ moduleId: "tasks" }),
      section({ id: "" }),
      section({ name: 7 }),
      section({ displayName: null }),
      section({ settings: undefined }),
      section({ settings: "none" }),
    ]) {
      assert.equal(isModuleSettingsSection(bad, "notes"), false, "a section this producer did not build must be refused");
    }
  });

  it("refuses a setting the collector could not key on", () => {
    for (const bad of [
      setting({ id: "" }), setting({ id: null }), setting({ id: 7 }),
      setting({ target: "" }), setting({ target: undefined }), setting({ target: 7 }),
      null, "retentionDays", 7,
    ]) {
      assert.equal(isModuleSettingsSection(section({ settings: [bad] }), "notes"), false,
        "a setting the collector cannot key on must refuse its section");
    }
  });

  it("refuses the whole selection rather than dropping one bad section or setting", () => {
    assert.equal(
      readModuleSettingsSections(catalog({
        attachments: { workspace: [], user: [], module: { notes: [section(), { moduleId: "notes" }] }, "new-workspace": [] },
      }), "notes"),
      null,
      "one unreadable section must not become a shorter settings page",
    );
    assert.equal(
      readModuleSettingsSections(catalog({
        attachments: { workspace: [], user: [], module: { notes: [section({ settings: [setting(), { id: "" }] })] }, "new-workspace": [] },
      }), "notes"),
      null,
      "and neither must one unreadable setting",
    );
  });

  it("accepts everything a contribution may add, at every level", () => {
    const wire = catalog({
      catalogVersion: 3,
      attachments: {
        workspace: [], user: [], "new-workspace": [],
        module: { notes: [section({ icon: "note", settings: [setting({ options: ["a"], min: 1, futureMember: true })] })] },
      },
    });
    const result = readModuleSettingsSections(wire, "notes");
    assert.ok(result, "an unpromised member must not refuse the catalog at any level");
    assert.equal(result[0].icon, "note", "a section member this contract does not promise survives");
    assert.deepEqual(result[0].settings[0].options, ["a"], "and so do a setting's renderer members");
    assert.equal(result[0].settings[0].futureMember, true, "including ones no module has contributed yet");
  });

  it("accepts a framework setting beside a module one", () => {
    const result = readModuleSettingsSections(catalog({
      attachments: {
        workspace: [], user: [], "new-workspace": [],
        module: { notes: [section({ settings: [setting(), setting({ id: "supportView", target: "framework" })] })] },
      },
    }), "notes");
    assert.ok(result, "both targets are real answers");
    assert.deepEqual(result[0].settings.map((/** @type {{ target: string }} */ entry) => entry.target), ["module", "framework"],
      "and the collector must be able to tell them apart");
  });
});

describe("the module settings consumer", () => {
  const load = functionBody(page, "  async function loadSettings() {", "\n  }\n");
  const save = functionBody(page, "  async function saveSettings() {", "\n  }\n");
  const collect = functionBody(page, "  function collectContributedSettingsPayload() {", "\n  }\n");

  it("no longer trusts the raw section read", () => {
    assert.ok(!page.includes("section.settings || []"), "the raw settings default must be gone");
    assert.ok(!collect.includes("attachmentSections"),
      "the collector must not take the host's lossy fallback");
  });

  it("inspects the raw catalog before any fallback", () => {
    assert.match(functionBody(host, "  function attachmentSections(catalog, placement, moduleId = \"\") {", "\n  }\n"),
      /return Array\.isArray\(attachments\.module\?\.\[moduleId\]\) \? attachments\.module\[moduleId\] : \[\];/,
      "the shared host answers [] for a catalog it cannot use");
    assert.match(load, /if \(!readModuleSettingsSections\(catalog, currentModuleSettingsId\(\)\)\) \{\n\s+throw new Error\("The settings catalog could not be read\./,
      "so the page must read the raw catalog itself before storing it");
    const check = load.indexOf("readModuleSettingsSections(catalog");
    const store = load.indexOf("settingsCatalog = catalog;");
    assert.notEqual(check, -1, "the load must check the catalog");
    assert.notEqual(store, -1, "the load must store the catalog");
    assert.ok(check < store, "and must not store one it could not read");
  });

  it("routes a malformed catalog into the page's existing load-error path", () => {
    assert.ok(
      load.indexOf("could not be read.") < load.indexOf("} catch (error) {"),
      "the refusal must land in the existing catch",
    );
    assert.match(load, /setStatus\(requireErrors\(\)\.caughtMessage\(error, "Settings could not be loaded\."\), \{ isError: true \}\);/,
      "which says the settings could not be loaded");
    assert.match(page, /emptyText: "No configurable module settings are available\."/,
      "and the genuinely empty page keeps its own sentence");
  });

  it("does not say a saved change was not saved", () => {
    assert.match(save, /if \(!readModuleSettingsSections\(refreshedCatalog, currentModuleSettingsId\(\)\)\) \{\n\s+setStatus\("Settings saved, but the refreshed settings catalog could not be read\."\);\n\s+return true;/,
      "a write that happened must be reported as one");
    const refuse = save.indexOf("refreshed settings catalog could not be read");
    const install = save.indexOf("settingsCatalog = refreshedCatalog;");
    assert.notEqual(refuse, -1, "the save must handle an unreadable refresh");
    assert.notEqual(install, -1, "the save must install a readable refresh");
    assert.ok(refuse < install, "and must not install one it could not read");
    assert.ok(!save.includes('setStatus("Settings were not saved.")'),
      "the not-saved sentence stays on the failure path it belongs to");
  });

  it("reads the module id once, where it now needs it four times", () => {
    assert.equal((page.match(/moduleSettingsForm\?\.dataset\.moduleSettingsForm/g) || []).length, 1,
      "the form's module id must be read in exactly one place");
    // Lookbehind excludes the helper's own declaration, which a bare count would have
    // included and so reported five uses of a helper used four times.
    assert.equal((page.match(/(?<!function )currentModuleSettingsId\(\)/g) || []).length, 4,
      "and used at the load, the refresh, the render and the collector");
  });

  it("leaves the settings renderer and the shared host alone", () => {
    assert.match(page, /window\.LongtailForge\.settingsRenderer\.renderSections\(/,
      "the renderer still renders the sections");
    assert.match(page, /requireSettingsHost\(\)\.attachmentSections\(settingsCatalog, "module", moduleId\)/,
      "and the render path still uses the shared host, which this child does not redesign");
  });
});
