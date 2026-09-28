import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeNode} FakeNode */

/**
 * The Clients/Projects tag, filter and modal helpers (`0.33.33.43.54`).
 *
 * Eight helpers gained annotations from their callers and nothing else. The two options-source
 * behaviours take one local bag type whose callbacks are both optional, because the descriptor
 * renderer passes both as functions and the `{}` default passes neither; the callable check, the
 * optional call and the absent case therefore stay as they were, and a non-callable `setOptions`
 * still throws. `bindDescriptorBulkSelection` changed two reads, each narrowed where its producer
 * already decides: only the view renderer writes `data-view-surface-id`, on the `<section>` it
 * creates, and nothing dispatches a synthetic `change`, so every change reaching the surface comes
 * from a control inside it. Every helper runs beside its `1657a3aa` version; outcomes, thrown ones
 * included, are compared as data. The real-browser half of the event claim is the rendered
 * Projects bulk-toolbar case, which drives real row checkboxes through this listener.
 */

const BASE = "1657a3aa";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const ANNOTATED = [
  "hydrateTagFilterOptions", "hydrateProjectClientFilterOptions", "loadPageData", "createModalCommitGroup",
  "decorateModalFooterButtons", "appendTagChips", "createTagPickerField", "mountTagPicker",
];
const EDITS = [
  ["    if (!surface || surface.dataset[flag]) {", "    if (!(surface instanceof HTMLElement) || surface.dataset[flag]) {"],
  [
    "      if (!event.target.matches(`[data-view-row-select][data-view-row-select-type=\"${recordType}\"]`)) {",
    "      if (!(event.target instanceof Element)\n        || !event.target.matches(`[data-view-row-select][data-view-row-select-type=\"${recordType}\"]`)) {",
  ],
];
const LIFTED = [
  "hydrateTagFilterOptions", "hydrateProjectClientFilterOptions", "loadPageData", "bindDescriptorBulkSelection",
  "getActiveRealClients", "getRealClients", "isRealClient", "isWorkspaceGrouping", "isActiveStatus", "sortClientTree",
  "getClientTreeSortKey", "treeIndent", "getClientDepth", "clientsEnabledForWorkspace", "workspaceProjectsLabel",
];

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

/**
 * @typedef {object} HelperFunctions
 * @property {(context?: unknown) => Promise<unknown>} hydrateTagFilterOptions
 * @property {(context?: unknown) => Promise<unknown>} hydrateProjectClientFilterOptions
 * @property {(options?: unknown) => Promise<void>} loadPageData
 * @property {(container: unknown, recordType: string) => void} bindDescriptorBulkSelection
 */

/**
 * One version's helpers in a sandbox, with the page's collaborators stubbed identically for both.
 * @param {string} text
 * @param {{ workspaceType?: string, tagOptions?: unknown[], failLoad?: boolean }} [settings]
 */
function helpersFrom(text, settings = {}) {
  const document = new FakeDocument();
  /** @type {unknown[][]} */
  const log = [];
  const context = vm.createContext({ document, ...fakeDomConstructors(), window: { LongtailForge: {} }, log, settings });
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  vm.runInContext(`
    workspaceSettings.workspaceType = settings.workspaceType || "business";
    let tagOptions = settings.tagOptions || [];
    let clientProjectData = { capabilities: {}, clients: [
      { id: "c-b", name: "Beta", parent_client_id: "", status: "Active" },
      { id: "c-a", name: "Acme", parent_client_id: "", status: "Active" },
      { id: "c-c", name: "Child", parent_client_id: "c-a", status: "Active" },
      { id: "c-x", name: "Gone", parent_client_id: "", status: "Inactive" },
    ] };
    async function loadClientProjectDialogData() { log.push(["loadClientProjectDialogData"]); }
    function setStatus(message) { log.push(["status", message]); }
    function loadTagOptions() { log.push(["loadTagOptions"]); return Promise.resolve([{ tag_id: "t-1" }]); }
    function normalizeSettings(value) { return { ...workspaceSettings, loaded: value }; }
    function normalizeData(value) { return value; }
    function applyClientProjectQueryActions() { log.push(["applyClientProjectQueryActions"]); }
    function requireApi() {
      return { getJson: (url) => settings.failLoad ? Promise.reject(new Error("offline")) : Promise.resolve({ url, clients: [] }) };
    }
    function updateProjectTableBulkState() { log.push(["update", "project"]); }
    function updateClientTableBulkState() { log.push(["update", "client"]); }
    const console = { error: (error) => log.push(["console.error", error && error.message]) };
  `, context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(text, name), context);
  /** @type {HelperFunctions} */
  const page = vm.runInContext(`({ ${LIFTED.slice(0, 4).join(", ")} })`, context);
  return { document, log, page, globals: () => vm.runInContext("({ tagOptions, clientProjectData, workspaceSettings })", context) };
}

/** @typedef {ReturnType<typeof helpersFrom>} Helpers */

/** @param {Helpers["log"]} log @param {string} name */
const recorder = (log, name) => (/** @type {unknown[]} */ ...args) => { log.push([name, ...args]); };

const TAGS = [{ tag_id: "t-1", name: "Urgent", slug: "urgent", description: "", color: "red" }, { tag_id: "t-2", slug: "later" }];

/**
 * The shared fake matches single selectors only, and the listener asks a compound attribute
 * selector; this answers it as the platform does, for attribute-only compounds, on both versions.
 * @param {FakeNode} element
 */
function withCompoundMatches(element) {
  Object.defineProperty(element, "matches", {
    value: (/** @type {string} */ selector) => selector.replace(/\[[^\]]*\]/g, "") === ""
      && [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)]
        .every(([, name, value]) => (value === undefined ? element.hasAttribute(name) : element.getAttribute(name) === value)),
  });
  return element;
}

/**
 * A row checkbox, as the view renderer draws one.
 * @param {FakeDocument} document @param {string} type
 */
function rowSelect(document, type) {
  const input = document.createElement("input");
  input.setAttribute("data-view-row-select", "");
  input.setAttribute("data-view-row-select-type", type);
  return withCompoundMatches(input);
}

/** @type {Record<string, [Parameters<typeof helpersFrom>[1], (helpers: Helpers) => unknown]>} */
const SCENARIOS = {
  "tag options through mountSearchOptions": [{ tagOptions: TAGS }, async ({ log, page }) =>
    [await page.hydrateTagFilterOptions({ mountSearchOptions: recorder(log, "mount"), setOptions: recorder(log, "set") }), log]],
  "tag options through setOptions when mountSearchOptions is not callable": [{ tagOptions: TAGS }, async ({ log, page }) =>
    [await page.hydrateTagFilterOptions({ mountSearchOptions: "not callable", setOptions: recorder(log, "set") }), log]],
  "tag options with no callbacks and no bag, loading the tags first": [{}, async ({ log, page }) =>
    [await page.hydrateTagFilterOptions({}), await page.hydrateTagFilterOptions(), log]],
  "tag options with a non-callable setOptions still throw": [{ tagOptions: TAGS }, ({ page }) =>
    page.hydrateTagFilterOptions({ setOptions: 42 })],
  "client filter options in a business workspace": [{}, async ({ log, page }) =>
    [await page.hydrateProjectClientFilterOptions({ setOptions: recorder(log, "set") }), log]],
  "client filter options outside a business workspace, and with no bag": [{ workspaceType: "personal" }, async ({ log, page }) =>
    [await page.hydrateProjectClientFilterOptions({ setOptions: recorder(log, "set") }), await page.hydrateProjectClientFilterOptions(), log]],
  "client filter options with a non-callable setOptions still throw": [{}, ({ page }) =>
    page.hydrateProjectClientFilterOptions({ setOptions: "no" })],
  "page data, holding back the query actions": [{}, async ({ globals, log, page }) => {
    await page.loadPageData({ applyQueryActions: false });
    return [log, globals()];
  }],
  "page data with the default options, and when the load fails": [{}, async ({ log, page }) => {
    await page.loadPageData();
    await page.loadPageData({ applyQueryActions: true });
    return log;
  }],
  "page data when the load fails": [{ failLoad: true }, async ({ log, page }) => {
    await page.loadPageData();
    return log;
  }],
  "bulk selection counts only its own record type, once": [{}, ({ document, log, page }) => {
    const surface = document.createElement("section");
    surface.setAttribute("data-view-surface-id", "projects-surface");
    const region = document.createElement("div");
    surface.appendChild(region);
    page.bindDescriptorBulkSelection(region, "project");
    page.bindDescriptorBulkSelection(region, "project");
    page.bindDescriptorBulkSelection(region, "client");
    for (const target of [rowSelect(document, "project"), rowSelect(document, "client"), withCompoundMatches(document.createElement("select"))]) {
      surface.dispatchEvent({ type: "change", target });
    }
    return { log, dataset: { ...surface.dataset }, listeners: surface.listeners.get("change")?.length };
  }],
  "bulk selection outside any surface binds nothing": [{}, ({ document, log, page }) => {
    const region = document.createElement("div");
    page.bindDescriptorBulkSelection(region, "project");
    return { log, dataset: { ...region.dataset }, listeners: region.listeners.size };
  }],
};

/** @param {string} text @param {Parameters<typeof helpersFrom>[1]} settings @param {(helpers: Helpers) => unknown} scenario */
async function run(text, settings, scenario) {
  /** @type {unknown} */
  let outcome;
  try {
    outcome = await scenario(helpersFrom(text, settings));
  } catch (error) {
    outcome = { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
  return JSON.parse(JSON.stringify({ outcome }));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("The helpers changed only their annotations, and two narrowed reads", () => {
  it(`keeps eight bodies the ${BASE} bodies once JSDoc is removed`, () => {
    for (const name of ANNOTATED) {
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(withoutJsDoc(extractFunctionBlock(baseline, name)));
    }
  });

  it("changes bindDescriptorBulkSelection by its two narrowed reads alone", () => {
    const expected = EDITS.reduce((body, [from, to]) => body.replace(from, to), withoutJsDoc(extractFunctionBlock(baseline, "bindDescriptorBulkSelection")));
    expect(withoutJsDoc(extractFunctionBlock(current, "bindDescriptorBulkSelection"))).toBe(expected);
  });

  it("declares both option callbacks optional", () => {
    for (const member of ["mountSearchOptions", "setOptions"]) {
      expect(current, member).toMatch(new RegExp(`\\* {3}${member}\\?: \\(options: unknown\\[\\], config\\?: import\\("[^"]+"\\)\\.BrowserSearchOptionsConfig\\) => void,`));
    }
  });
});

describe("Every helper answers exactly what it did", () => {
  it("matches its baseline version in every case", async () => {
    for (const [name, [settings, scenario]] of Object.entries(SCENARIOS)) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, settings, scenario)));
      expect(now, name).toEqual(before);
    }
  });

  it("keeps the callable check, the optional call, the absent case and the non-callable failure", async () => {
    const mounted = await run(current, SCENARIOS["tag options through mountSearchOptions"][0], SCENARIOS["tag options through mountSearchOptions"][1]);
    expect(mounted.outcome[1].map((/** @type {unknown[]} */ entry) => entry[0]), "a callable mountSearchOptions wins").toEqual(["mount"]);
    const fallback = await run(current, SCENARIOS["tag options through setOptions when mountSearchOptions is not callable"][0], SCENARIOS["tag options through setOptions when mountSearchOptions is not callable"][1]);
    expect(fallback.outcome[1].map((/** @type {unknown[]} */ entry) => entry[0]), "a non-callable one falls to setOptions").toEqual(["set"]);
    const absent = await run(current, SCENARIOS["tag options with no callbacks and no bag, loading the tags first"][0], SCENARIOS["tag options with no callbacks and no bag, loading the tags first"][1]);
    expect(absent.outcome, "absent callbacks are a quiet no-op").toEqual([null, null, [["loadClientProjectDialogData"], ["loadClientProjectDialogData"]]]);
    for (const name of ["tag options with a non-callable setOptions still throw", "client filter options with a non-callable setOptions still throw"]) {
      const failed = await run(current, SCENARIOS[name][0], SCENARIOS[name][1]);
      expect(failed.outcome.threw, name).toMatch(/^TypeError: setOptions is not a function/);
    }
  });

  it("anchors the bulk selection the comparison relies on", async () => {
    const [settings, scenario] = SCENARIOS["bulk selection counts only its own record type, once"];
    const { outcome } = await run(current, settings, scenario);
    expect(outcome).toEqual({
      log: [["update", "project"], ["update", "client"]],
      dataset: { viewSurfaceId: "projects-surface", clientProjectsProjectBulkSelectionBound: "true", clientProjectsClientBulkSelectionBound: "true" },
      listeners: 2,
    });
  });

  it("skips only a change target no producer dispatches: one that is not an Element", async () => {
    /** @param {Helpers} helpers */
    const scenario = ({ document, log, page }) => {
      const surface = document.createElement("section");
      surface.setAttribute("data-view-surface-id", "projects-surface");
      const region = document.createElement("div");
      surface.appendChild(region);
      page.bindDescriptorBulkSelection(region, "project");
      surface.dispatchEvent({ type: "change", target: /** @type {FakeNode} */ (/** @type {unknown} */ ({})) });
      return log;
    };
    const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, {}, scenario)));
    expect(before.outcome.threw, "the bare read threw on a synthetic non-element target").toMatch(/TypeError/);
    expect(now.outcome, "the narrowed read skips it").toEqual([]);
  });
});
