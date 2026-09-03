import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const settingsService = read("src/services/settings.service.js");
const modulesService = read("src/core/modules/modules.service.js");
const manifestContract = read("src/core/modules/manifest-contract.js");
const routes = read("src/routes/settings.routes.js");
const host = read("public/js/shared/settings-host.js");
const notesSettings = read("public/js/notes-settings.js");
const workspaceSettings = read("public/js/workspace-settings.js");
const moduleSettings = read("public/js/module-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredWords(name) {
  const match = new RegExp("export type " + name + " = ([^;]+);").exec(contracts);
  assert.ok(match, name + " must be declared");
  return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
}

/**
 * The shipped shared reader, instantiated from the settings host's own source.
 *
 * Sliced rather than reimplemented, so the behavioural checks exercise the function three pages
 * actually call. It depends on nothing but the helpers taken with it.
 */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = host.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the settings host source");
    return host.slice(start, host.indexOf("\n  }\n", start) + 4);
  };
  const table = /const WORKSPACE_MODULE_STATUSES = Object\.freeze\(\[[\s\S]*?\]\);/.exec(host);
  assert.ok(table, "the status table must exist in the settings host source");
  const source = [
    table[0],
    slice("function isSettingsBodyRecord(value) {"),
    slice("function readWorkspaceSettingsModule(entry) {"),
    slice("function readWorkspaceSettings(body) {"),
    slice("function readWorkspaceSettingsSaveResult(body) {"),
    "return { readWorkspaceSettings, readWorkspaceSettingsSaveResult };",
  ].join("\n");
  return new Function(source)();
}

/** A body shaped the way the producer builds one, persisted settings and all. */
const settingsBody = (overrides = {}) => ({
  workspaceId: "ws-1",
  workspaceName: "Acme",
  workspaceType: "business",
  audit: { loggingEnabled: true, retentionDays: 90 },
  enabledModules: ["notes"],
  moduleSettings: [{ moduleId: "notes", name: "Notes" }],
  modules: [
    { id: "notes", status: "enabled", displayName: "Notes", navigation: [], settings: [] },
    { id: "tasks", status: "disabled", displayName: "Tasks", navigation: [], settings: [] },
  ],
  ...overrides,
});

describe("the shared settings producer", () => {
  it("answers the read directly", () => {
    assert.match(
      functionBody(settingsService, "async function read(session) {"),
      /return readInternal\(session\);/,
      "the read route must answer readInternal itself",
    );
  });

  it("makes the save answer that same read, wrapped in one member", () => {
    const body = functionBody(settingsService, "async function save(rawPayload, session) {");
    assert.match(
      body,
      /return \{\n {4}data: await readInternal\(session\),\n {2}\};/,
      "the save must end by returning readInternal as data, which is what makes one body contract cover both routes",
    );
  });

  it("hands both bodies to the browser unchanged, under a workspace session", () => {
    for (const [opener, call] of [
      ["settingsRoutes.get(\"/settings\"", "settingsService.read(request.session)"],
      ["settingsRoutes.put(\"/settings\"", "settingsService.save(payload, request.session)"],
    ]) {
      const at = routes.indexOf(opener);
      assert.notEqual(at, -1, opener + " must exist");
      const route = routes.slice(at, routes.indexOf("}));", at));
      assert.ok(route.includes(call), opener + " must call its traced producer");
      assert.match(route, /response\.status\(200\)\.json\(result\)/, opener + " must answer the producer's result");
    }
    assert.match(
      routes,
      /workspaceAsyncRoute as asyncRoute/,
      "both settings routes must run through the workspace-scoped route wrapper",
    );
  });

  it("keeps the save behind the workspace settings permission", () => {
    assert.match(
      functionBody(settingsService, "async function save(rawPayload, session) {"),
      /permissionsService\.assertCan\(session, "workspace_settings\.manage"/,
      "the save must assert the workspace settings permission",
    );
  });

  it("spreads the persisted settings, which is why the body is a structural minimum", () => {
    const body = functionBody(modulesService, "async function decorateWorkspaceSettings(settings, workspaceId) {");
    assert.match(body, /return \{\n {4}\.\.\.settings,/, "the decorator must spread the persisted settings");
    assert.match(body, /modules: moduleContext\.modules,/, "modules must be named after that spread");
  });
});

describe("the module status vocabulary, read from the producer", () => {
  /**
   * Every word the status can become, collected from *both* places that decide it: the map that
   * coerces stored rows and the resolver that reads that map. Collected by scanning for quoted
   * words rather than by searching for the two this test expects, so a third one is visible.
   */
  const producedWords = () => {
    const resolver = functionBody(modulesService, "function workspaceModuleStatus(moduleDefinition, statusById, hasModuleRows) {");
    const coercion = /statusMap\[row\.module_id\] = [^;]+;/.exec(modulesService);
    assert.ok(coercion, "the status map must coerce each stored row");
    const words = new Set();
    for (const source of [resolver, coercion[0]]) {
      for (const match of source.matchAll(/"(\w+)"/g)) {
        words.add(match[1]);
      }
    }
    return [...words].sort();
  };

  it("can answer only two words, from either deciding site", () => {
    assert.deepEqual(
      producedWords(),
      ["disabled", "enabled"],
      "the status resolver and its status map together must produce exactly two words",
    );
  });

  it("closes the declared union over exactly those words", () => {
    assert.deepEqual(
      declaredWords("BrowserWorkspaceModuleStatus"),
      producedWords(),
      "the declared status union must be the producer's own vocabulary",
    );
  });

  it("keeps the Workbench union consistent with it rather than merging the records", () => {
    assert.deepEqual(
      declaredWords("BrowserWorkbenchModuleStatus"),
      producedWords(),
      "the Workbench status union builds from this same module context and must carry the same words",
    );
    assert.ok(
      !declaredInterface("BrowserWorkspaceSettingsModule").includes("BrowserWorkbenchModuleState"),
      "a different projection of the same context must not reuse the Workbench record wholesale",
    );
    assert.match(
      modulesService,
      /buildModuleStateMap\(moduleContext\.modules\)|moduleContext\.modules/,
      "the shared module context must be what both projections start from",
    );
  });

  it("takes the non-empty id from the manifest contract, not from convenience", () => {
    assert.match(
      manifestContract,
      /requireString\(manifest, "id", errors, \{ pattern: MODULE_ID_PATTERN \}\)/,
      "the manifest contract must require the module id as a pattern-checked string",
    );
    assert.match(declaredInterface("BrowserWorkspaceSettingsModule"), /id: string;/, "the id must be declared as text");
  });
});

describe("the declarations", () => {
  it("promises only the stable framework-owned pair for a module", () => {
    const declared = declaredInterface("BrowserWorkspaceSettingsModule");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["id", "status"], "the module record must promise exactly identity and state");
    assert.ok(!/^  \w+\?:/m.test(declared), "neither promised member may be optional");
  });

  it("records that the narrowness is deliberate, not incomplete reverse engineering", () => {
    const at = contracts.indexOf("export interface BrowserWorkspaceSettingsModule {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at);
    assert.match(doc, /deliberate stable minimum over a much richer producer record/,
      "the contract must say the producer is richer than this record");
    assert.match(doc, /extensibility carrier/, "the contract must say why the rest is allowed to grow");
    assert.ok(
      !/only has `id` and `status`/.test(doc),
      "the contract must not claim the producer itself is this narrow",
    );
  });

  it("promises nothing else on the settings body", () => {
    const declared = declaredInterface("BrowserWorkspaceSettings");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["modules"], "the settings body must promise only what this boundary reads");
    assert.ok(
      !declared.includes("moduleSettings") && !declared.includes("enabledModules"),
      "registry-owned and normaliser-checked members must stay with their own boundaries",
    );
  });

  it("wraps that same body as the save envelope's one member", () => {
    const declared = declaredInterface("BrowserWorkspaceSettingsSaveResult");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["data"], "the save envelope must carry exactly one member");
    assert.match(declared, /data: BrowserWorkspaceSettings;/, "and that member must be the shared settings body");
  });

  it("puts the reader on the already-declared settings host", () => {
    const declared = declaredInterface("BrowserSettingsHost");
    assert.match(declared, /readWorkspaceSettings\(body: unknown\): BrowserWorkspaceSettings \| null;/,
      "the host must declare the shared reader");
    assert.match(declared, /readWorkspaceSettingsSaveResult\(body: unknown\): BrowserWorkspaceSettingsSaveResult \| null;/,
      "the host must declare the save reader");
    assert.match(host, /const api = Object\.freeze\(\{\n {4}attachmentSections,\n {4}mount,\n {4}readWorkspaceSettings,\n {4}readWorkspaceSettingsSaveResult,\n {2}\}\);/,
      "the runtime host must publish exactly those readers beside what it already had");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { readWorkspaceSettings, readWorkspaceSettingsSaveResult } = shippedReader();

  it("accepts a real body and answers its modules", () => {
    const result = readWorkspaceSettings(settingsBody());
    assert.ok(result, "a valid body must be accepted");
    assert.deepEqual(
      result.modules,
      [{ id: "notes", status: "enabled" }, { id: "tasks", status: "disabled" }],
      "each module must be reduced to the promised pair",
    );
  });

  it("carries the persisted settings through untouched, because it promises none of them", () => {
    const body = settingsBody({ someFutureWorkspaceSetting: { nested: true } });
    const result = readWorkspaceSettings(body);
    assert.ok(result, "an unrecognised persisted setting must not refuse the body");
    assert.deepEqual(result.workspaceName, "Acme", "an existing persisted setting must survive the read");
    assert.deepEqual(
      result.someFutureWorkspaceSetting,
      { nested: true },
      "so must one this contract has never heard of",
    );
    assert.deepEqual(result.audit, body.audit, "the pages' own normalisers must still find what they read");
  });

  it("accepts a module carrying contribution members this contract never promised", () => {
    const result = readWorkspaceSettings(settingsBody({
      modules: [{
        id: "notes",
        status: "enabled",
        navigation: [{ label: "Notes" }, { label: "Catalogs" }],
        viewSurfaces: [{ id: "notes.board" }],
        aBrandNewRegistryContribution: { kind: "whatever" },
      }],
    }));
    assert.ok(result, "registry expansion must not break this boundary");
    assert.deepEqual(result.modules, [{ id: "notes", status: "enabled" }], "only the promised pair is answered");
  });

  it("refuses a module whose status is not one the producer can answer", () => {
    for (const status of ["ENABLED", "on", "", null, undefined, true, 1]) {
      assert.equal(
        readWorkspaceSettings(settingsBody({ modules: [{ id: "notes", status }] })),
        null,
        "an unproducible status must refuse the body: " + String(status),
      );
    }
  });

  it("refuses a module without a usable identity", () => {
    for (const id of ["", null, undefined, 7, {}]) {
      assert.equal(
        readWorkspaceSettings(settingsBody({ modules: [{ id, status: "enabled" }] })),
        null,
        "an unusable module id must refuse the body: " + String(id),
      );
    }
  });

  it("refuses the whole body when one module among many is unreadable", () => {
    const result = readWorkspaceSettings(settingsBody({
      modules: [
        { id: "notes", status: "enabled" },
        { id: "tasks", status: "mystery" },
        { id: "lists", status: "enabled" },
      ],
    }));
    assert.equal(result, null, "a module the browser cannot vouch for must not be quietly dropped");
  });

  it("refuses a body with no modules collection, rather than reading it as none", () => {
    assert.equal(readWorkspaceSettings(settingsBody({ modules: undefined })), null, "an absent collection is not an empty one");
    assert.equal(readWorkspaceSettings(settingsBody({ modules: {} })), null, "a non-array collection must be refused");
    assert.equal(readWorkspaceSettings(settingsBody({ modules: null })), null, "a null collection must be refused");
  });

  it("accepts a workspace that genuinely has no modules", () => {
    const result = readWorkspaceSettings(settingsBody({ modules: [] }));
    assert.ok(result, "an empty collection the server really sent must be accepted");
    assert.deepEqual(result.modules, [], "and answered as the empty collection it is");
  });

  it("refuses a body that is not an object at all", () => {
    for (const bad of [null, undefined, 7, "settings", [], true]) {
      assert.equal(readWorkspaceSettings(bad), null, "a primitive body must be refused: " + String(bad));
    }
  });

  it("reads the save envelope through the same body reader", () => {
    const result = readWorkspaceSettingsSaveResult({ data: settingsBody() });
    assert.ok(result, "a valid save envelope must be accepted");
    assert.deepEqual(result.data.modules[0], { id: "notes", status: "enabled" }, "its body is the shared body");
    assert.equal(readWorkspaceSettingsSaveResult(settingsBody()), null, "an unwrapped body is not a save envelope");
    assert.equal(readWorkspaceSettingsSaveResult({ data: { modules: [{ id: "x", status: "nope" }] } }), null,
      "a save envelope with an unreadable body must be refused");
    assert.equal(readWorkspaceSettingsSaveResult({}), null, "an envelope with no data must be refused");
  });
});

describe("the three consumers", () => {
  it("no longer trust the raw bodies", () => {
    assert.ok(!notesSettings.includes("(settings.modules || [])"), "the raw modules default must be gone");
    assert.ok(!workspaceSettings.includes("normalizeSettings(result.data)"), "the raw workspace data read must be gone");
    assert.ok(!moduleSettings.includes("normalizeSettings(result.data || result)"), "the raw module data read must be gone");
  });

  it("share one reader rather than each parsing the producer", () => {
    for (const [name, source] of [
      ["notes-settings", notesSettings],
      ["workspace-settings", workspaceSettings],
      ["module-settings", moduleSettings],
    ]) {
      assert.match(source, /requireSettingsHost\(\)\.readWorkspaceSettings/, name + " must use the shared reader");
      assert.ok(
        !source.includes("function readWorkspaceSettings"),
        name + " must not carry its own copy of the shared parser",
      );
    }
  });

  it("refuses an unreadable settings load rather than showing a disabled module", () => {
    assert.match(
      notesSettings,
      /throw new Error\("Workspace settings could not be read\./,
      "an unreadable settings body must take the page's error path",
    );
    const at = notesSettings.indexOf("readWorkspaceSettings(settingsBody)");
    assert.ok(
      at < notesSettings.indexOf('moduleDefinition.id === "notes"'),
      "the body must be vouched for before any module is looked up in it",
    );
  });

  it("never reports a completed save as failed just because the response was unreadable", () => {
    assert.match(
      workspaceSettings,
      /"Workspace settings saved, but the refreshed settings could not be read\./,
      "Workspace Settings must separate write truth from response truth",
    );
    assert.match(
      moduleSettings,
      /"Settings saved, but the refreshed settings could not be read\."/,
      "Module Settings must separate write truth from response truth",
    );
    // Anchored on each page's own status text, because "could not be read." is also the
    // workspace-deletion boundary's phrase and appears earlier in one of these files.
    for (const [name, source, phrase] of [
      ["workspace-settings", workspaceSettings, "Workspace settings saved, but the refreshed settings"],
      ["module-settings", moduleSettings, "Settings saved, but the refreshed settings"],
    ]) {
      const at = source.indexOf(phrase);
      assert.notEqual(at, -1, name + " must carry its own saved-but-unreadable status");
      assert.match(source.slice(at, at + 220), /return true;/,
        name + " must still report a save the server completed");
    }
  });
});
