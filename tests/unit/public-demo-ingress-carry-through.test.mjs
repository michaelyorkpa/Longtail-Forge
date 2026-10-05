import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The public-demo files-ingress restriction, followed from the producer to the panel.
 *
 * The defect this covers was not in the producer and not in the consumer: both were correct and
 * both were tested. It was in the connection - `buildWorkspaceContext` reconstructs by name and
 * never named `publicDemo`, so the restriction the server computed was dropped between them and
 * the panel offered uploads in a demo that denies them. So these assertions run the whole chain
 * rather than either end of it, and every link is the shipped source rather than a retyping.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const appShell = read("src/services/app-shell.service.js");
const bootstrap = read("public/js/shared/app-shell-bootstrap.js");
const navigation = read("public/js/navigation.js");
const attachments = read("public/js/shared/file-attachments.js");

const STORAGE_KEY = "lf_workspace_context";

/**
 * A function region, at the indent it actually occupies.
 * @param {string} source @param {string} opener @param {string} [pad]
 */
function slice(source, opener, pad = "  ") {
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** @param {string} name */
function constantLine(name) {
  const found = navigation.match(new RegExp("^ {2}const " + name + " = .*;$", "m"));
  assert.ok(found, name + " must be a source constant");
  return found[0];
}

function workspaceTypeTable() {
  const found = navigation.match(/^ {2}const WORKSPACE_TYPES = Object\.freeze\(\[[^\]]*\]\);$/m);
  assert.ok(found, "the workspace-type table must be a source constant");
  return found[0];
}

/** The member names the server actually publishes, read out of the producing service. */
function producerMembers() {
  const at = appShell.indexOf("      publicDemo: {");
  assert.notEqual(at, -1, "the app shell service must publish a publicDemo record");
  const body = appShell.slice(at, appShell.indexOf("\n      },", at));
  return [...body.matchAll(/^ {8}([a-zA-Z]+):/gm)].map((match) => match[1]).sort();
}

/** The bootstrap adapter's own normalize, run for real. */
function normalizer() {
  return new Function([
    slice(bootstrap, "function asRecord(value) {"),
    slice(bootstrap, "function stringValue(value) {"),
    slice(bootstrap, "function stringArray(value) {"),
    slice(bootstrap, "function objectArray(value) {"),
    slice(bootstrap, "function searchTarget(value) {"),
    slice(bootstrap, "function normalize(value) {"),
    "return normalize;",
  ].join("\n"))();
}

/**
 * The navigation page's own assembly literal, evaluated rather than retyped.
 *
 * This is the object the page hands to the constructor. Lifting it means a change to which
 * members the page forwards changes what these assertions see.
 */
function assembler() {
  const at = navigation.indexOf("      const workspaceContext = {");
  assert.notEqual(at, -1, "the app-shell branch must assemble a workspace context");
  const end = navigation.indexOf("\n      };", at);
  assert.notEqual(end, -1, "that assembly must terminate");
  const literal = navigation.slice(at + "      const workspaceContext = ".length, end + 8);
  assert.match(literal, /\.\.\.\(shell\.workspaceContext \|\| \{\}\)/, "it must forward the shell's own context");
  return new Function("shell", "return " + literal.replace(/;\s*$/, "") + ";");
}

/**
 * The stored-context core over a fake store.
 * @param {string | null} [cached]
 */
function contextCore(cached = null) {
  /** @type {Record<string, string>} */
  const store = {};
  if (cached !== null) {
    store[STORAGE_KEY] = cached;
  }
  const win = {
    localStorage: {
      /** @param {string} key */
      getItem: (key) => (key in store ? store[key] : null),
      /** @param {string} key @param {string} value */
      setItem: (key, value) => {
        store[key] = value;
      },
    },
    /** @type {Record<string, unknown> | undefined} */
    LongtailForge: undefined,
  };
  const built = new Function("window", [
    constantLine("DEFAULT_WORKSPACE_NAME"),
    constantLine("WORKSPACE_CONTEXT_STORAGE_KEY"),
    workspaceTypeTable(),
    slice(navigation, "function isContextRecord(value) {"),
    slice(navigation, "function readContextRecord(value) {"),
    slice(navigation, "function readContextList(...candidates) {"),
    slice(navigation, "function readContextBag(...candidates) {"),
    slice(navigation, "function readContextText(...candidates) {"),
    slice(navigation, "function readContextPublicDemo(...candidates) {"),
    slice(navigation, "function readContextWorkspaceType(...candidates) {"),
    slice(navigation, "function readCachedWorkspaceRecord() {"),
    slice(navigation, "function readWorkspaceContext() {"),
    slice(navigation, "function buildWorkspaceContext(candidate) {"),
    slice(navigation, "function publishWorkspaceContext(context) {"),
    slice(navigation, "function storeWorkspaceContext(settings) {"),
    "return { buildWorkspaceContext, readWorkspaceContext, storeWorkspaceContext,"
    + " publishWorkspaceContext, readContextPublicDemo };",
  ].join("\n"))(win);
  return { ...built, win, store };
}

/** The panel's own answer, over whatever namespace it is given. */
function ingressReader() {
  return new Function("namespace", [
    slice(attachments, "function publicDemoFilesIngressAllowed() {"),
    "return publicDemoFilesIngressAllowed;",
  ].join("\n"));
}

/** A server-shaped bootstrap body. Only publicDemo varies between cases.
 * @param {unknown} publicDemo
 */
const bootstrapBody = (publicDemo) => ({
  enabledModules: ["files"],
  navigation: [{ href: "files.html" }],
  permissionHints: {},
  quickActions: [],
  searchTargets: [],
  user: { user_id: "user-1", username: "ada" },
  viewSurfaces: [],
  workspaceContext: {
    enabledModules: ["files"],
    modules: [],
    navigation: [],
    permissionHints: {},
    publicDemo,
    quickActions: [],
    searchTargets: [],
    viewSurfaces: [],
    workspaceCapabilities: {},
    workspaceId: "workspace-1",
    workspaceName: "Acme",
    workspaceType: "business",
  },
});

/**
 * Producer body through the adapter, the page's assembly, the constructor and the panel.
 * @param {unknown} publicDemo @param {string | null} [cached]
 */
function producerToPanel(publicDemo, cached = null) {
  const core = contextCore(cached);
  const shell = normalizer()(bootstrapBody(publicDemo));
  core.storeWorkspaceContext(assembler()(shell));
  const namespace = core.win.LongtailForge;
  return {
    core,
    namespace,
    uploadAllowed: ingressReader()(namespace),
  };
}

const DENIED = { enabled: true, filesIngressAllowed: false };
const PERMITTED = { enabled: true, filesIngressAllowed: true };
const NOT_A_DEMO = { enabled: false, filesIngressAllowed: false };

describe("the restriction the server computes reaches the panel", () => {
  it("takes its shape from the producing service rather than from this test", () => {
    assert.deepEqual(producerMembers(), ["enabled", "filesIngressAllowed"]);
    assert.match(appShell, /filesIngressAllowed: evaluatePublicDemoCapability\("files\.ingress"\)\.allowed/);
  });

  it("survives the adapter, the page assembly, the constructor and publication", () => {
    const { namespace, uploadAllowed } = producerToPanel(DENIED);
    assert.deepEqual(namespace.workspaceContext.publicDemo, DENIED, "the stored context carries it");
    assert.equal(uploadAllowed(), false, "and the panel refuses uploads because of it");
  });

  it("persists it, so the next cold load starts denied instead of permissive", () => {
    const { core } = producerToPanel(DENIED);
    const persisted = JSON.parse(core.store[STORAGE_KEY]);
    assert.deepEqual(persisted.publicDemo, DENIED);
    assert.equal(ingressReader()({ workspaceContext: persisted })(), false);
  });

  it("stores the two members it validated and not whatever else was sent", () => {
    const { namespace } = producerToPanel({ ...DENIED, quota: 5, filesIngressAllowed: false });
    assert.deepEqual(Object.keys(namespace.workspaceContext.publicDemo).sort(), [
      "enabled", "filesIngressAllowed",
    ]);
  });

  it("leaves a permitted demo and an ordinary workspace able to upload", () => {
    assert.equal(producerToPanel(PERMITTED).uploadAllowed(), true);
    assert.equal(producerToPanel(NOT_A_DEMO).uploadAllowed(), true);
  });

  it("answers null, not a permissive record, when no producer has said anything", () => {
    const { namespace, uploadAllowed } = producerToPanel(undefined);
    assert.equal(namespace.workspaceContext.publicDemo, null, "absence is recorded honestly");
    assert.equal(uploadAllowed(), true, "and reads as no restriction, which is what it means");
  });
});

describe("a refresh that says nothing cannot lift a restriction", () => {
  it("carries a denial forward through a settings refresh that omits the member", () => {
    const { core } = producerToPanel(DENIED);
    // /api/settings and /api/session produce no publicDemo. Silence must not read as permission.
    const refreshed = core.storeWorkspaceContext({
      enabledModules: ["files"],
      workspaceId: "workspace-1",
      workspaceName: "Acme",
      workspaceType: "business",
    });
    assert.deepEqual(refreshed.publicDemo, DENIED);
    assert.equal(ingressReader()(core.win.LongtailForge)(), false);
  });

  it("still lets a producer lift its own restriction", () => {
    const { core } = producerToPanel(DENIED);
    const lifted = core.storeWorkspaceContext({ ...bootstrapBody(PERMITTED).workspaceContext });
    assert.deepEqual(lifted.publicDemo, PERMITTED);
    assert.equal(ingressReader()(core.win.LongtailForge)(), true);
  });

  it("refuses a malformed record rather than letting it overwrite a denial", () => {
    for (const malformed of [
      { enabled: true },
      { enabled: "true", filesIngressAllowed: "false" },
      { filesIngressAllowed: true },
      { enabled: true, filesIngressAllowed: null },
      "public-demo",
      [],
      7,
    ]) {
      const { core } = producerToPanel(DENIED);
      const refreshed = core.storeWorkspaceContext({ ...validSettings(), publicDemo: malformed });
      assert.deepEqual(refreshed.publicDemo, DENIED, JSON.stringify(malformed) + " is not an answer");
    }
  });

  it("hydrates an older cache that predates the member without inventing one", () => {
    const stale = JSON.stringify({
      enabledModules: ["files"], modules: [], navigation: [], permissionHints: {},
      quickActions: [], searchTargets: [], viewSurfaces: [], userId: "user-1", username: "ada",
      workspaceCapabilities: {}, workspaceId: "workspace-1", workspaceName: "Acme",
      workspaceType: "business",
    });
    const core = contextCore(stale);
    const hydrated = core.readWorkspaceContext();
    assert.equal(hydrated.publicDemo, null, "an older cache has said nothing, not 'allowed'");
    core.publishWorkspaceContext(hydrated);
    assert.equal(ingressReader()(core.win.LongtailForge)(), true);

    // ...and the shell's answer, when it arrives, is what settles it.
    core.storeWorkspaceContext(assembler()(normalizer()(bootstrapBody(DENIED))));
    assert.equal(ingressReader()(core.win.LongtailForge)(), false);
  });
});

const validSettings = () => ({
  enabledModules: ["files"],
  workspaceId: "workspace-1",
  workspaceName: "Acme",
  workspaceType: "business",
});

describe("the panel acts on the restriction it was given", () => {
  /** `uploadFiles` itself, over recorded stubs. */
  function uploader() {
    /** @type {{ emitted: string[], posted: number, rendered: number }} */
    const calls = { emitted: [], posted: 0, rendered: 0 };
    const upload = new Function("calls", [
      "const render = () => { calls.rendered += 1; };",
      "const emit = (container, state, name) => { calls.emitted.push(name); };",
      "const postMultipartJson = async () => { calls.posted += 1; return { results: [], failed: 0 }; };",
      "const buildUploadForm = () => ({});",
      "const refresh = async () => {};",
      "const requireErrors = () => ({ caughtMessage: (error, fallback) => fallback });",
      slice(attachments, "async function uploadFiles(container, state, files) {"),
      "return uploadFiles;",
    ].join("\n"))(calls);
    return { calls, upload };
  }

  /** @param {boolean} filesIngressAllowed */
  const uploadableState = (filesIngressAllowed) => ({
    filesIngressAllowed,
    isUploading: false,
    error: "",
    uploadResults: [],
    options: { targetId: "task-1", canUpload: true, moduleId: "tasks", targetType: "task" },
  });

  it("refuses the upload outright when ingress is denied", async () => {
    const { calls, upload } = uploader();
    const state = uploadableState(false);
    await upload({}, state, [{ name: "a.txt" }]);
    assert.equal(calls.posted, 0, "nothing is sent");
    assert.deepEqual(calls.emitted, [], "and nothing is announced as started");
    assert.equal(state.isUploading, false);
  });

  it("still uploads when ingress is allowed, so this is a restriction and not a break", async () => {
    const { calls, upload } = uploader();
    await upload({}, uploadableState(true), [{ name: "a.txt" }]);
    assert.equal(calls.posted, 1);
    assert.ok(calls.emitted.includes("uploadStarted"));
  });

  it("suppresses only the upload control, leaving seeded attachments readable", () => {
    const render = slice(attachments, "function render(container, state) {");
    const at = render.indexOf("if (state.filesIngressAllowed) {");
    assert.notEqual(at, -1, "the render must branch on the restriction");
    const branch = render.slice(at, render.indexOf("\n      }\n", at));
    assert.match(branch, /uploadControls\(container, state\)/, "the control is what is withheld");
    assert.match(branch, /Uploads are unavailable in the public demo/, "and the reason is shown");
    assert.match(branch, /Seeded attachments remain available to view/);
    assert.ok(!/attachmentList|attachmentRows/.test(branch), "the attachment list is outside the branch");
  });

  it("re-reads the restriction when the context is republished", () => {
    const mount = slice(attachments, "function mount(container, options = {}) {");
    assert.match(mount, /filesIngressAllowed: publicDemoFilesIngressAllowed\(\)/);
    assert.match(
      mount,
      /syncFilesIngressAvailability[\s\S]*?state\.filesIngressAllowed = publicDemoFilesIngressAllowed\(\);/,
    );
    assert.match(mount, /addEventListener\?\.\("longtailforge:workspace-context-updated", syncFilesIngressAvailability\)/);
  });
});

describe("this is an upload affordance, not an authorization boundary", () => {
  it("says so where the reader lives, so no later reader mistakes it for enforcement", () => {
    const reader = slice(navigation, "function readContextPublicDemo(...candidates) {");
    assert.match(navigation.slice(navigation.indexOf(reader) - 900, navigation.indexOf(reader)), /never read as permission to upload/);
  });

  it("adds no permission collection to the stored context while doing it", () => {
    const contracts = read("src/types/browser-contracts.d.ts");
    const at = contracts.indexOf("export interface BrowserStoredWorkspaceContext {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    for (const forbidden of ["permissionIds", "permissions:", "user_id", "workspace_type"]) {
      assert.ok(!body.includes(forbidden), forbidden + " is not part of this correction");
    }
    assert.match(body, /publicDemo: BrowserStoredPublicDemo \| null;/);
  });

  it("declares both members as booleans and nothing else", () => {
    const contracts = read("src/types/browser-contracts.d.ts");
    const at = contracts.indexOf("export interface BrowserStoredPublicDemo {");
    assert.notEqual(at, -1, "the contract must exist");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.match(body, /enabled: boolean;/);
    assert.match(body, /filesIngressAllowed: boolean;/);
    assert.equal([...body.matchAll(/^ {2}[a-zA-Z]+:/gm)].length, 2, "two members, no more");
  });
});
