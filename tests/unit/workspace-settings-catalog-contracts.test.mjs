import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Workspace Settings catalog sections, read by `0.33.33.38.4.5.9`.
 *
 * **A latent boundary, not a visible one.** The page's previous predicate established only that
 * a section was an object, then read `moduleId`, `lifecycle`, `displayName` and `name` off it -
 * and because it promised those as optional `unknown`, the compiler had nothing to say. The
 * three diagnostics this child moved are contextual parameter types; the boundary it closed
 * never appeared in the `unknown` family at all.
 *
 * **What was actually wrong** is that `settingsHost.attachmentSections` collapses any catalog it
 * cannot use to `[]`. For a picker that is right. For an administrative form it meant an
 * unreadable catalog rendered as an empty one, `setClean` then marked it loaded, and a
 * post-save refresh failure was reported as a save that had not happened - after the write had
 * already committed.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/workspace-settings.js");
const catalogService = read("src/services/settings-catalog.service.js");
const host = read("public/js/shared/settings-host.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  return new Function([
    slice("  function isCatalogRecord(value) {"),
    slice("  function isWorkspaceSettingsSection(value) {"),
    slice("  function readWorkspaceSettingsSections(catalog) {"),
    "return { readWorkspaceSettingsSections, isWorkspaceSettingsSection };",
  ].join("\n"))();
}

/**
 * The shipped grouping/sorting/render path, with its containers and the renderer injected.
 * Everything else - the reader, the comparator, the group titles - is the page's own source.
 */
function shippedRenderer({ core = "core", modules = "modules", fallback = "fallback" } = {}) {
  /** @type {RenderCall[]} */
  const calls = [];
  /**
   * @param {string} kind
   * @returns {(container: unknown, sections: Record<string, unknown>[], options: Record<string, unknown>) => void}
   */
  function record(kind) {
    return (container, sections, options) => {
      calls.push({ kind, args: [container, sections, options] });
    };
  }
  const renderer = {
    renderSections: record("sections"),
    renderGroupedSections: record("grouped"),
  };
  const built = new Function(
    "workspaceCoreSettingsContainer", "moduleSettingsContainer", "workspaceModuleSettingsContainer",
    "requireSettingsRenderer",
    [
      slice("  function isCatalogRecord(value) {"),
      slice("  function isWorkspaceSettingsSection(value) {"),
      slice("  function readWorkspaceSettingsSections(catalog) {"),
      slice("  function renderModuleSettings(catalog) {"),
      slice("  function compareOptionalModules(left, right) {"),
      "return renderModuleSettings;",
    ].join("\n"),
  )(core, fallback, modules, () => renderer);
  return { renderModuleSettings: built, calls };
}

/**
 * One call the page made into the settings renderer: the container it chose, the sections it
 * passed, and the options it passed with them.
 * @typedef {{ kind: string, args: [unknown, Record<string, unknown>[], Record<string, unknown>] }} RenderCall
 */

/**
 * One rendered group, with its presence established before any index or member is read.
 * @param {RenderCall[]} calls
 * @param {string} kind
 */
function callOf(calls, kind) {
  const call = calls.find((entry) => entry.kind === kind);
  assert.ok(call, "the " + kind + " group must be rendered before it is inspected");
  return call;
}

// --- fixtures built the way the producer builds them -----------------------------------------

/**
 * One section exactly as `findOrCreateSection` writes it: metadata spread, then three by name.
 * @param {string} moduleId
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function section(moduleId, overrides = {}) {
  return {
    moduleId,
    name: moduleId,
    displayName: moduleId,
    id: `workspace.${moduleId}`,
    placement: "workspace",
    settings: [],
    ...overrides,
  };
}

/**
 * A catalog exactly as `read` returns it: `attachmentPoints` beside the four placements.
 * @param {unknown} workspace
 * @param {Record<string, unknown>} [overrides]
 */
function catalog(workspace, overrides = {}) {
  return {
    attachmentPoints: [{ id: "workspace", label: "Workspace" }],
    attachments: { workspace, user: [], module: {}, "new-workspace": [], ...overrides },
  };
}

describe("the contract is derived from the producer, not from the predicate", () => {
  it("requires exactly the members the producer's own typedef declares", () => {
    // Read off `SettingSection` in the service source, so this list cannot drift toward whatever
    // the page happens to check.
    const typedef = catalogService.match(/@typedef \{\{ (id: string.*?lifecycle\?: boolean) \}\} SettingSection/);
    assert.ok(typedef, "the producer must declare its section shape");
    const producerMembers = [...typedef[1].matchAll(/(\w+)\??:/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(producerMembers,
      ["displayName", "id", "lifecycle", "moduleId", "name", "placement", "settings"]);

    const at = contracts.indexOf("export interface BrowserWorkspaceSettingsSection {");
    assert.notEqual(at, -1, "the browser contract must be declared");
    const declared = [...contracts.slice(at, contracts.indexOf("\n}", at)).matchAll(/^ {2}(\w+)\??:/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, producerMembers,
      "the browser contract names the producer's members and invents none");
  });

  it("marks optional exactly what the producer marks optional", () => {
    const at = contracts.indexOf("export interface BrowserWorkspaceSettingsSection {");
    const body = contracts.slice(at, contracts.indexOf("\n}", at));
    assert.match(body, /lifecycle\?: boolean;/, "lifecycle is optional, as the producer declares");
    for (const required of ["displayName", "id", "moduleId", "name", "settings"]) {
      assert.ok(body.includes(`  ${required}: `), required + " is required");
    }
    assert.match(body, /placement: "workspace";/, "and the placement is closed to this one bucket");
  });

  it("refuses a section missing any member the producer always writes", () => {
    const { isWorkspaceSettingsSection } = shippedReader();
    assert.equal(isWorkspaceSettingsSection(section("notes")), true, "the whole section is accepted");
    for (const member of ["displayName", "id", "moduleId", "name", "placement", "settings"]) {
      const incomplete = section("notes");
      delete incomplete[member];
      assert.equal(isWorkspaceSettingsSection(incomplete), false,
        "a section without " + member + " is not one this producer built");
    }
  });

  it("does not reuse the module placement's contract, whose guarantees differ", () => {
    const at = contracts.indexOf("export interface BrowserModuleSettingsSection {");
    const sibling = contracts.slice(at, contracts.indexOf("\n}", at));
    assert.match(sibling, /placement: "module";/, "the sibling is fixed to a different placement");
    assert.ok(!sibling.includes("lifecycle"), "and has no lifecycle marker to describe");
    assert.match(sibling, /settings: BrowserModuleSettingsSetting\[\];/,
      "and names its setting elements, which this page has not earned");
    assert.ok(!page.includes("BrowserModuleSettingsSection"),
      "so this page does not borrow it");
  });

  it("keeps the settings elements unknown, because the renderer owns that model", () => {
    const at = contracts.indexOf("export interface BrowserWorkspaceSettingsSection {");
    assert.match(contracts.slice(at, contracts.indexOf("\n}", at)), /settings: unknown\[\];/);
    const reader = slice("  function readWorkspaceSettingsSections(catalog) {");
    const predicate = slice("  function isWorkspaceSettingsSection(value) {");
    assert.match(predicate, /Array\.isArray\(value\.settings\)/,
      "the container is checked");
    assert.ok(!/settings\.every/.test(predicate + reader),
      "and its elements are not, because this page never reads inside one");
  });
});

describe("the reader distinguishes empty from unreadable", () => {
  it("answers a real empty workspace placement as empty", () => {
    const { readWorkspaceSettingsSections } = shippedReader();
    assert.deepEqual(readWorkspaceSettingsSections(catalog([])), [],
      "a workspace that contributes nothing is a real answer, not a failure");
  });

  it("accepts sections from every path the producer builds them by", () => {
    const { readWorkspaceSettingsSections } = shippedReader();
    const sections = [
      // A contributed section: `addSettingToAttachment` -> `findOrCreateSection`, metadata found.
      section("notes", { name: "Notes", displayName: "Notes", settings: [{ id: "a", label: "A" }] }),
      // A lifecycle section: `addModuleLifecycleSections` sets the marker after creating it.
      section("time-tracking", { displayName: "Time Tracking", lifecycle: true }),
      // A framework section: same builder, reached from `addFrameworkSettingSections`.
      section("framework", { displayName: "Framework", settings: [{ id: "b", label: "B" }] }),
      // A module with no metadata entry: the builder falls back to the id for both names.
      section("unregistered-module"),
    ];
    assert.deepEqual(readWorkspaceSettingsSections(catalog(sections)), sections);
  });

  it("refuses a catalog, a container or a section it cannot vouch for", () => {
    const { readWorkspaceSettingsSections } = shippedReader();
    for (const unreadable of [null, undefined, "catalog", 7, [], [section("notes")]]) {
      assert.equal(readWorkspaceSettingsSections(unreadable), null, "not a catalog record");
    }
    assert.equal(readWorkspaceSettingsSections({ attachmentPoints: [] }), null, "no attachments");
    assert.equal(readWorkspaceSettingsSections({ attachments: [] }), null, "attachments is not a record");
    assert.equal(readWorkspaceSettingsSections(catalog(undefined)), null, "no workspace container");
    assert.equal(readWorkspaceSettingsSections(catalog({})), null, "workspace is not an array");
    assert.equal(readWorkspaceSettingsSections(catalog("")), null, "workspace is text");
  });

  it("refuses the collection whole rather than dropping the module it cannot read", () => {
    const { readWorkspaceSettingsSections } = shippedReader();
    const good = section("notes");
    assert.equal(readWorkspaceSettingsSections(catalog([good, section("x", { moduleId: "" })])), null,
      "one unreadable section refuses the collection");
    assert.equal(readWorkspaceSettingsSections(catalog([good, null])), null);
    assert.equal(readWorkspaceSettingsSections(catalog([good, section("y", { placement: "module" })])), null,
      "a section that disagrees with the bucket it came from is not this producer's");
    assert.equal(readWorkspaceSettingsSections(catalog([good, section("z", { settings: {} })])), null);
    assert.equal(readWorkspaceSettingsSections(catalog([good, section("w", { lifecycle: "yes" })])), null,
      "a lifecycle marker outside the producer's declared type refuses it");
    assert.equal(readWorkspaceSettingsSections(catalog([good, section("v", { id: "" })])), null);
  });

  it("treats an absent lifecycle marker as an ordinary section", () => {
    const { isWorkspaceSettingsSection } = shippedReader();
    const ordinary = section("notes");
    assert.ok(!Object.hasOwn(ordinary, "lifecycle"), "the producer writes nothing for these");
    assert.equal(isWorkspaceSettingsSection(ordinary), true);
    assert.equal(isWorkspaceSettingsSection(section("a", { lifecycle: true })), true);
    assert.equal(isWorkspaceSettingsSection(section("b", { lifecycle: false })), true,
      "the producer's typedef says boolean, so false is admitted even though it writes only true");
    assert.equal(isWorkspaceSettingsSection(section("c", { lifecycle: undefined })), true,
      "an explicit undefined is the same absence");
  });

  it("judges only the workspace placement", () => {
    // The other three belong to other pages with their own policies; requiring them to be deeply
    // valid here would let an unrelated placement refuse this form.
    const { readWorkspaceSettingsSections } = shippedReader();
    const sections = [section("notes")];
    const hostile = catalog(sections, { user: "broken", module: 7, "new-workspace": null });
    assert.deepEqual(readWorkspaceSettingsSections(hostile), sections);
  });

  it("preserves extra contribution fields by identity", () => {
    const { readWorkspaceSettingsSections } = shippedReader();
    const setting = { id: "a", label: "A", options: [1, 2], readOnly: true, futureField: "kept" };
    const settings = [setting];
    const rich = section("notes", { settings, description: "extra", icon: "gear" });
    const answered = readWorkspaceSettingsSections(catalog([rich]));
    assert.equal(answered.length, 1, "the section is answered before it is compared");
    assert.equal(answered[0], rich, "the producer's own object is answered, not a copy");
    assert.equal(answered[0].settings, settings, "and its settings array by identity");
    assert.equal(answered[0].description, "extra", "an unnamed contribution member survives");
    assert.equal(settings[0], setting, "down to the setting object the renderer will read");
  });

  it("inspects the raw catalog rather than the helper that collapses it", () => {
    const helper = host.slice(host.indexOf("  function attachmentSections("));
    assert.match(helper.slice(0, helper.indexOf("\n  }")), /: \[\];/,
      "the shared helper still answers [] for a body it cannot use");
    const reader = slice("  function readWorkspaceSettingsSections(catalog) {");
    assert.ok(!/attachmentSections/.test(reader), "which is why the reader does not go through it");
    assert.match(reader, /catalog\.attachments\.workspace/, "it reads the selected container itself");
    assert.ok(!/attachmentSections\(/.test(slice("  function renderModuleSettings(catalog) {")),
      "and the render path no longer does either");
  });
});

describe("grouping, ordering and handoff are unchanged", () => {
  const notes = section("notes", { displayName: "Notes", settings: [{ id: "n" }] });
  const clientProjects = section("client-projects", { displayName: "Clients and Projects" });
  const timeTracking = section("time-tracking", { displayName: "Time Tracking", lifecycle: true });
  const developerExample = section("developer-example", { displayName: "AAA Developer Example", lifecycle: true });
  const billing = section("billing", { displayName: "Billing", lifecycle: true });

  /** @param {unknown[]} sections @param {Record<string, unknown>} [containers] */
  const render = (sections, containers = {}) => {
    const { renderModuleSettings, calls } = shippedRenderer(containers);
    renderModuleSettings(catalog(sections));
    return calls;
  };

  it("keeps Clients/Projects first in the core group, ahead of other workspace sections", () => {
    const calls = render([notes, clientProjects]);
    const core = callOf(calls, "sections");
    assert.ok(core, "the core group is rendered");
    assert.deepEqual(core.args[1], [clientProjects, notes],
      "Clients/Projects leads, then the non-lifecycle workspace sections");
  });

  it("puts lifecycle sections in the Modules group and nowhere else", () => {
    const calls = render([notes, clientProjects, timeTracking]);
    const core = callOf(calls, "sections");
    const grouped = callOf(calls, "grouped");
    assert.ok(!core.args[1].includes(timeTracking), "a lifecycle section is not in the core group");
    assert.deepEqual(grouped.args[1], [timeTracking]);
    assert.equal(grouped.args[2].groupTitle, "Modules");
  });

  it("sorts Developer Example last among optional modules regardless of its name", () => {
    // Its display name sorts first alphabetically, so this proves the rule and not the ordering.
    const grouped = callOf(render([developerExample, billing, timeTracking]), "grouped");
    const order = grouped.args[1].map((entry) => entry.moduleId);
    assert.ok(order.indexOf("developer-example") !== -1, "it is present before its index is compared");
    assert.equal(order[order.length - 1], "developer-example");
    assert.deepEqual(order, ["billing", "time-tracking", "developer-example"]);
  });

  it("orders the rest by displayName, then name, then moduleId", () => {
    const groupedCalls = render([
      section("z-module", { displayName: "Alpha", lifecycle: true }),
      section("a-module", { displayName: "Beta", lifecycle: true }),
      section("m-module", { displayName: "", name: "", lifecycle: true }),
    ]);
    const grouped = callOf(groupedCalls, "grouped");
    assert.deepEqual(grouped.args[1].map((entry) => entry.moduleId),
      ["z-module", "a-module", "m-module"],
      "an empty displayName falls through to name and then the id, as it did before");
  });

  it("keeps hideEmpty on both groups", () => {
    const calls = render([notes, timeTracking]);
    for (const call of calls) {
      assert.equal(call.args[2].hideEmpty, true);
    }
  });

  it("keeps the container fallback for both groups", () => {
    const withContainers = render([notes, timeTracking], { core: "core", modules: "modules" });
    assert.equal(callOf(withContainers, "sections").args[0], "core");
    assert.equal(callOf(withContainers, "grouped").args[0], "modules");

    const withoutContainers = render([notes, timeTracking],
      { core: null, modules: null, fallback: "fallback" });
    assert.equal(callOf(withoutContainers, "sections").args[0], "fallback",
      "the shared container still stands in when the dedicated one is absent");
    assert.equal(callOf(withoutContainers, "grouped").args[0], "fallback");
  });

  it("hands the producer's own section and settings objects to the renderer", () => {
    const calls = render([notes, timeTracking]);
    const core = callOf(calls, "sections");
    assert.equal(core.args[1][0], notes, "the section reaches the renderer by identity");
    assert.equal(core.args[1][0].settings, notes.settings, "and so does its settings array");
  });

  it("does not sort or mutate the catalog it was given", () => {
    const sections = [billing, developerExample, timeTracking];
    const before = [...sections];
    render(sections);
    assert.deepEqual(sections, before, "the producer's array order is untouched");
    const reader = slice("  function readWorkspaceSettingsSections(catalog) {");
    assert.ok(!/\.sort\(|\.reverse\(|\.splice\(|\.push\(/.test(reader),
      "the reader introduces no ordering or mutation of its own");
  });
});

describe("an unreadable catalog is not a successfully loaded empty form", () => {
  const load = page.slice(page.indexOf("  async function loadSettingsForm() {"),
    page.indexOf("  async function loadRuntimeDiagnostics() {"));

  it("validates before installing the catalog", () => {
    const check = load.indexOf("if (!readWorkspaceSettingsSections(catalog)) {");
    const install = load.indexOf("settingsCatalog = catalog;");
    assert.notEqual(check, -1, "the candidate catalog is validated");
    assert.notEqual(install, -1, "and the page installs one");
    assert.ok(check < install, "in that order, so trusted state is replaced only by a read catalog");
    assert.match(load, /throw new Error\("The settings catalog could not be read\."\);/);
  });

  it("never reaches setClean on a refused catalog", () => {
    const refusal = load.indexOf("The settings catalog could not be read.");
    const clean = load.indexOf("settingsPageController.setClean();");
    assert.notEqual(clean, -1, "the successful path still marks the form clean");
    assert.ok(refusal < clean, "and the refusal throws before it");
    assert.ok(refusal < load.indexOf("} catch (error) {"), "into the page's existing catch");
  });

  it("reports it through the existing load-error path and adds no new failure surface", () => {
    assert.match(load, /handleApiError\(error, "Workspace settings could not be loaded\."\);/);
    assert.doesNotMatch(load, /alert\(|showModal|toast/i);
  });
});

describe("a committed write is not reported as a failed save", () => {
  const save = page.slice(page.indexOf("  async function saveSettings() {"),
    page.indexOf("  function normalizeSettings(settings) {"));

  it("stages the refreshed catalog locally before replacing trusted state", () => {
    assert.match(save, /let refreshedCatalog = null;/);
    const stage = save.indexOf("refreshedCatalog = await requireApi().getJson(\"/api/settings/catalog\"");
    const validate = save.indexOf("const refreshedSections = readWorkspaceSettingsSections(refreshedCatalog);");
    const install = save.indexOf("settingsCatalog = refreshedCatalog;");
    assert.ok(stage !== -1 && validate !== -1 && install !== -1, "all three steps are present");
    assert.ok(stage < validate && validate < install,
      "staged, then validated, then installed - never installed unread");
    assert.match(save, /if \(refreshedSections\) \{\s*\n\s*settingsCatalog = refreshedCatalog;/,
      "the install is guarded by the validation");
  });

  it("survives a refresh that rejects, instead of falling into the not-saved path", () => {
    assert.match(save, /\} catch \(refreshError\) \{/, "the refresh has its own boundary");
    assert.ok(save.indexOf("} catch (refreshError) {") < save.indexOf("} catch (error) {"),
      "which sits inside the save's own catch rather than replacing it");
    assert.match(save, /if \(requireErrors\(\)\.caughtStatus\(refreshError\) === 401\) \{\s*\n\s*throw refreshError;/,
      "a lost session is still rethrown, so the page's 401 handling is not swallowed");
  });

  it("says the settings were saved, and does not issue a second write", () => {
    assert.match(save, /setWorkspaceSettingsStatus\("Workspace settings saved, but the refreshed settings catalog could not be read\. Reload to see the current state\."\);/);
    const branch = save.slice(save.indexOf("if (!refreshedSections) {"));
    assert.ok(!/putJson/.test(branch), "the refresh-failure branch does not retry the write");
    assert.equal((save.match(/putJson/g) || []).length, 1, "there is exactly one write in the whole path");
    assert.match(save, /return true;/, "and the save still reports success");
  });

  it("keeps every successful-save side effect that does not depend on the catalog", () => {
    // The early return sits after these deliberately: the write committed, so the name, the
    // audit controls, the application name and the app shell all still apply.
    const branch = save.indexOf("if (!refreshedSections) {");
    for (const sideEffect of [
      "workspaceNameInput.value = savedSettings.workspaceName;",
      "setWorkspaceTypeValue(savedSettings.workspaceType);",
      "auditLoggingEnabledInput.checked = savedSettings.audit.loggingEnabled;",
      "auditRetentionDaysSelect.value = String(savedSettings.audit.retentionDays);",
      "applyWorkspaceName(savedSettings.workspaceName);",
      "await requireNamespace().refreshAppShell?.();",
    ]) {
      const at = save.indexOf(sideEffect);
      assert.notEqual(at, -1, sideEffect + " must still run");
      assert.ok(at < branch, sideEffect + " must not be skipped by the refresh-failure return");
    }
  });

  it("holds back only the render, and only flashes a clean state on a full success", () => {
    const branch = save.indexOf("if (!refreshedSections) {");
    const render = save.indexOf("renderModuleSettings(settingsCatalog);");
    const flash = save.indexOf("flashSavedState();");
    assert.ok(render !== -1 && render < branch,
      "the render is inside the validated arm, above the refusal return");
    assert.ok(flash > branch,
      "and the clean saved state is below it, so it cannot overwrite the refusal message");
  });

  it("leaves the save payload and its collection untouched", () => {
    assert.match(page, /function readModuleSettingsPayload\(\) \{\s*\n\s*return requireSettingsRenderer\(\)\.collectPayload\(requireWorkspaceSettingsForm\(\)\);/,
      "the payload still comes from the form, not from the catalog");
    assert.ok(!/settingsCatalog/.test(page.slice(page.indexOf("function readModuleSettingsPayload"),
      page.indexOf("function readModuleSettingsPayload") + 200)));
  });
});

describe("what this child did not reach for", () => {
  it("changed no server response and no shared host behaviour", () => {
    assert.match(catalogService, /return \{\s*\n\s*attachmentPoints: SETTINGS_ATTACHMENT_POINTS\.map\(\(point\) => \(\{ \.\.\.point \}\)\),\s*\n\s*attachments,/,
      "the catalog response shape is unchanged");
    assert.match(host, /function attachmentSections\(catalog, placement, moduleId = ""\) \{/,
      "the shared helper is untouched, so other consumers keep their policies");
  });

  it("kept every server-side filter, rather than reconstructing withheld settings", () => {
    assert.match(catalogService, /"workspace_settings\.manage"/, "the manage permission still filters");
    assert.match(catalogService, /if \(\["workspace", "module"\]\.includes\(placement\) && !canManageWorkspaceSettings\) \{/);
    assert.match(catalogService, /if \(canManageWorkspaceSettings\) \{\s*\n\s*addModuleLifecycleSections\(/,
      "and lifecycle sections are still gated on it");
    assert.ok(!/canManageWorkspaceSettings|workspace_settings\.manage/.test(page),
      "the browser validates what arrived; it does not decide what should have");
  });

  it("published no catalog envelope and no second resolved-setting model", () => {
    assert.ok(!/BrowserSettingsCatalog/.test(contracts + page), "no whole-catalog contract");
    assert.equal((contracts.match(/export interface BrowserWorkspaceSettingsSection/g) || []).length, 1);
    assert.ok(!/BrowserModuleSettingsSetting/.test(page),
      "and no setting model was copied from the sibling page");
  });

  it("used no cast, suppression or assertion to obtain the section type", () => {
    const reader = slice("  function readWorkspaceSettingsSections(catalog) {");
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(reader));
    assert.ok(!/\/\*\* @type \{/.test(reader), "the narrowing is the predicate, not an assertion");
    assert.ok(!/\bas\s+\w/.test(reader));
  });
});
