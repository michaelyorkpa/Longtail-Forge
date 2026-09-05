import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const navigation = read("public/js/navigation.js");
const contracts = read("src/types/browser-contracts.d.ts");

const STORAGE_KEY = "lf_workspace_context";

/** @param {string} source */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

/** @param {string} opener */
function slice(opener) {
  const start = navigation.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = navigation.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return navigation.slice(start, end + 4);
}

/** The workspace-type table as the writer declares it. */
function workspaceTypeTable() {
  const found = navigation.match(/^ {2}const WORKSPACE_TYPES = Object\.freeze\(\[[^\]]*\]\);$/m);
  assert.ok(found, "the workspace-type table must be a source constant");
  return found[0];
}

/** @param {string} name */
function constantLine(name) {
  const found = navigation.match(new RegExp("^ {2}const " + name + " = .*;$", "m"));
  assert.ok(found, name + " must be a source constant");
  return found[0];
}

/**
 * The stored-context core, lifted from the shipped writer and run against a fake `localStorage`.
 *
 * Nothing is retyped: each function is the file's own text, so a change to any of them changes
 * what these assertions see. The fake store makes the cache boundary executable rather than read.
 * @param {string | null} [cached] the raw string already in storage
 */
function contextCore(cached = null) {
  /** @type {Record<string, string>} */
  const store = {};
  /** @type {{key: string, value: string}[]} */
  const writes = [];
  if (cached !== null) {
    store[STORAGE_KEY] = cached;
  }
  const win = {
    localStorage: {
      /** @param {string} key */
      getItem: (key) => (key in store ? store[key] : null),
      /** @param {string} key @param {string} value */
      setItem: (key, value) => {
        // Recorded rather than only applied: a write that happens to produce the same bytes is
        // still a write, and comparing the stored string could not tell the two apart.
        writes.push({ key, value });
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
    slice("function isContextRecord(value) {"),
    slice("function readContextRecord(value) {"),
    slice("function readContextList(...candidates) {"),
    slice("function readContextBag(...candidates) {"),
    slice("function readContextText(...candidates) {"),
    slice("function readContextWorkspaceType(...candidates) {"),
    slice("function readCachedWorkspaceRecord() {"),
    slice("function readWorkspaceContext() {"),
    slice("function buildWorkspaceContext(candidate) {"),
    slice("function publishWorkspaceContext(context) {"),
    slice("function storeWorkspaceContext(settings) {"),
    "return { buildWorkspaceContext, readWorkspaceContext, storeWorkspaceContext,"
    + " publishWorkspaceContext, readCachedWorkspaceRecord };",
  ].join("\n"))(win);

  return { ...built, win, store, writes };
}

/** The thirteen names, spelled out here rather than read from the thing under test. */
const STORED_MEMBERS = [
  "enabledModules", "modules", "navigation", "permissionHints", "quickActions", "searchTargets",
  "userId", "username", "viewSurfaces", "workspaceCapabilities", "workspaceId", "workspaceName",
  "workspaceType",
];

/** One complete candidate, so each negative case differs in exactly one way. */
const validCandidate = () => ({
  enabledModules: ["tasks", "notes"],
  modules: [{ id: "tasks", status: "enabled" }],
  navigation: [{ href: "tasks.html" }],
  permissionHints: { filesManageQuarantine: true },
  quickActions: [{ id: "tasks.add" }],
  searchTargets: [{ id: "tasks" }],
  viewSurfaces: [{ id: "tasks-list" }],
  userId: "user-1",
  username: "ada",
  workspaceCapabilities: { availableTools: ["clients_projects"] },
  workspaceId: "workspace-1",
  workspaceName: "Acme",
  workspaceType: "family",
});

describe("the stored contract is exact at its top level", () => {
  it("declares exactly the thirteen members the constructor reconstructs", () => {
    const at = contracts.indexOf("export interface BrowserStoredWorkspaceContext {");
    assert.notEqual(at, -1, "the contract must exist");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    const declared = [...body.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((match) => match[1]).sort();
    assert.deepEqual(declared, [...STORED_MEMBERS].sort());
    assert.ok(!/\[key: string\]/.test(body), "nothing is spread into it, so it carries no extensions");
  });

  it("builds exactly those members at runtime, from a source the contract did not supply", () => {
    const core = contextCore();
    assert.deepEqual(Object.keys(core.buildWorkspaceContext(validCandidate())).sort(), [...STORED_MEMBERS].sort());
  });

  it("drops a candidate member the store does not own", () => {
    const core = contextCore();
    const context = core.buildWorkspaceContext({
      ...validCandidate(),
      permissionIds: ["files.manage"],
      workspaceDeletion: { purgeAfter: "2026-01-01" },
      publicDemo: { enabled: true },
    });
    for (const absent of ["permissionIds", "workspaceDeletion", "publicDemo"]) {
      assert.ok(!(absent in context), absent + " is transient, not stored");
    }
  });

  it("keeps the collections unknown-valued, because only the container is checked", () => {
    const at = contracts.indexOf("export interface BrowserStoredWorkspaceContext {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.equal(countOf(body, /: unknown\[\];/g), 6, "six collections, none claiming its elements");
    assert.equal(countOf(body, /: Record<string, unknown>;/g), 2, "two bags, neither claiming a member");
    assert.equal(countOf(body, /: string;/g), 4, "four scalars");
    assert.equal(countOf(body, /: BrowserWorkspaceType;/g), 1, "and one closed vocabulary");
    assert.match(body, /workspaceType: BrowserWorkspaceType;/);
  });
});

describe("the constructor reconstructs a canonical context from any candidate", () => {
  it("carries a complete candidate through unchanged", () => {
    const context = contextCore().buildWorkspaceContext(validCandidate());
    assert.deepEqual(context.enabledModules, ["tasks", "notes"]);
    assert.equal(context.userId, "user-1");
    assert.equal(context.username, "ada");
    assert.equal(context.workspaceId, "workspace-1");
    assert.equal(context.workspaceName, "Acme");
    assert.equal(context.workspaceType, "family");
    assert.deepEqual(context.workspaceCapabilities, { availableTools: ["clients_projects"] });
  });

  it("preserves array identity and ordering rather than rebuilding elements", () => {
    const candidate = validCandidate();
    const context = contextCore().buildWorkspaceContext(candidate);
    assert.equal(context.enabledModules, candidate.enabledModules, "the same array, not a copy");
    assert.equal(context.navigation, candidate.navigation);
    assert.equal(context.workspaceCapabilities, candidate.workspaceCapabilities);
  });

  it("refuses a malformed scalar rather than storing it as an identity or a name", () => {
    const core = contextCore();
    const context = core.buildWorkspaceContext({
      ...validCandidate(),
      userId: 7,
      username: { name: "ada" },
      workspaceId: ["workspace-1"],
      workspaceName: 42,
    });
    assert.equal(context.userId, "");
    assert.equal(context.username, "");
    assert.equal(context.workspaceId, "");
    assert.equal(context.workspaceName, "Workspace", "the default name, not the number");
  });

  it("refuses a non-array collection rather than storing it as a typed list", () => {
    const context = contextCore().buildWorkspaceContext({
      ...validCandidate(),
      enabledModules: "tasks,notes",
      navigation: { href: "tasks.html" },
      searchTargets: null,
    });
    assert.deepEqual(context.enabledModules, []);
    assert.deepEqual(context.navigation, []);
    assert.deepEqual(context.searchTargets, []);
  });

  it("refuses a non-record bag rather than publishing it as one", () => {
    const context = contextCore().buildWorkspaceContext({
      ...validCandidate(),
      permissionHints: "all",
      workspaceCapabilities: ["clients_projects"],
    });
    assert.deepEqual(context.permissionHints, {});
    assert.deepEqual(context.workspaceCapabilities, {});
  });

  it("closes the workspace type on the vocabulary rather than on truthiness", () => {
    const core = contextCore();
    const read = (/** @type {unknown} */ workspaceType, /** @type {Record<string, unknown>} */ capabilities = {}) =>
      core.buildWorkspaceContext({ ...validCandidate(), workspaceType, workspaceCapabilities: capabilities }).workspaceType;
    assert.equal(read("business"), "business");
    assert.equal(read("family"), "family");
    assert.equal(read("personal"), "personal");
    assert.equal(read("enterprise"), "business", "an unknown type is not stored as one");
    assert.equal(read(7), "business");
    assert.equal(read(undefined, { workspaceType: "personal" }), "personal", "the capability arm still applies");
    assert.equal(read(undefined, { workspaceType: "enterprise" }), "business");
    assert.equal(read(undefined), "business");
  });

  it("accepts the snake-case identity aliases the session body uses", () => {
    const core = contextCore();
    const context = core.buildWorkspaceContext({
      ...validCandidate(),
      userId: undefined,
      workspaceId: undefined,
      user_id: "user-9",
      workspace_id: "workspace-9",
    });
    assert.equal(context.userId, "user-9");
    assert.equal(context.workspaceId, "workspace-9");
  });

  it("survives a candidate that is not a record at all", () => {
    const core = contextCore();
    for (const candidate of [null, undefined, "settings", 7, []]) {
      const context = core.buildWorkspaceContext(candidate);
      assert.equal(context.workspaceName, "Workspace");
      assert.deepEqual(context.enabledModules, []);
      assert.equal(context.workspaceType, "business");
    }
  });
});

describe("the previous-context policy is preserved field by field", () => {
  const cached = () => JSON.stringify({
    enabledModules: ["cached-module"],
    modules: [{ id: "cached" }],
    navigation: [{ href: "cached.html" }],
    permissionHints: { cached: true },
    quickActions: [{ id: "cached.add" }],
    searchTargets: [{ id: "cached" }],
    viewSurfaces: [{ id: "cached" }],
    userId: "cached-user",
    username: "cached-name",
    workspaceCapabilities: { availableTools: ["cached"] },
    workspaceId: "cached-workspace",
    workspaceName: "Cached Workspace",
    workspaceType: "personal",
  });

  it("falls back to the cache for the nine members that always did", () => {
    const core = contextCore(cached());
    const context = core.buildWorkspaceContext({});
    assert.deepEqual(context.enabledModules, ["cached-module"]);
    assert.deepEqual(context.modules, [{ id: "cached" }]);
    assert.deepEqual(context.navigation, [{ href: "cached.html" }]);
    assert.deepEqual(context.permissionHints, { cached: true });
    assert.deepEqual(context.quickActions, [{ id: "cached.add" }]);
    assert.deepEqual(context.searchTargets, [{ id: "cached" }]);
    assert.deepEqual(context.viewSurfaces, [{ id: "cached" }]);
    assert.equal(context.userId, "cached-user");
    assert.equal(context.username, "cached-name");
  });

  it("does not fall back to the cache for the four members that never did", () => {
    // Every producer that reaches the constructor supplies all four, so the constructor takes its
    // fixed default rather than the previous value. That is the behaviour as written.
    const context = contextCore(cached()).buildWorkspaceContext({});
    assert.deepEqual(context.workspaceCapabilities, {}, "not the cached capabilities");
    assert.equal(context.workspaceId, "", "not the cached id");
    assert.equal(context.workspaceName, "Workspace", "not the cached name");
    assert.equal(context.workspaceType, "business", "not the cached type");
  });

  it("prefers the candidate over the cache wherever both are present", () => {
    const context = contextCore(cached()).buildWorkspaceContext(validCandidate());
    assert.deepEqual(context.enabledModules, ["tasks", "notes"]);
    assert.equal(context.userId, "user-1");
    assert.equal(context.workspaceName, "Acme");
  });

  it("does not take an unusable cached value on trust", () => {
    const core = contextCore(JSON.stringify({ enabledModules: "cached", userId: 7, permissionHints: "yes" }));
    const context = core.buildWorkspaceContext({});
    assert.deepEqual(context.enabledModules, [], "a cached non-array is not stored as a list");
    assert.equal(context.userId, "", "a cached non-string is not stored as an identity");
    assert.deepEqual(context.permissionHints, {});
  });
});

describe("localStorage is an untrusted boundary", () => {
  it("answers null for malformed JSON rather than throwing", () => {
    assert.equal(contextCore("{not json").readWorkspaceContext(), null);
    assert.equal(contextCore("null").readWorkspaceContext(), null);
    assert.equal(contextCore().readWorkspaceContext(), null, "and for no cache at all");
  });

  it("answers null for a cached value that is not a record", () => {
    for (const cached of ['"a string"', "7", "true", "[1,2]"]) {
      assert.equal(contextCore(cached).readWorkspaceContext(), null, cached + " is not a context");
    }
  });

  it("reconstructs a cached record rather than returning it", () => {
    const core = contextCore(JSON.stringify({ ...validCandidate(), rogue: "value" }));
    const context = core.readWorkspaceContext();
    assert.ok(context, "a usable cache still hydrates");
    assert.deepEqual(Object.keys(context).sort(), [...STORED_MEMBERS].sort());
    assert.ok(!("rogue" in context), "a member the store does not own does not survive the cache");
  });

  it("normalises an older cache to the defaults the store would have written", () => {
    // The compatibility policy: a cache written before a collection existed keeps working, and
    // gains that collection's default rather than becoming unusable.
    const core = contextCore(JSON.stringify({
      userId: "user-1", username: "ada", workspaceId: "workspace-1",
      workspaceName: "Acme", workspaceType: "family",
    }));
    const context = core.readWorkspaceContext();
    assert.ok(context);
    assert.deepEqual(context.viewSurfaces, []);
    assert.deepEqual(context.quickActions, []);
    assert.deepEqual(context.permissionHints, {});
    assert.equal(context.workspaceName, "Acme", "and the members it did carry survive");
  });

  it("refuses a cached member whose type would make a consumer unsafe", () => {
    const core = contextCore(JSON.stringify({ ...validCandidate(), navigation: "home", workspaceType: "root" }));
    const context = core.readWorkspaceContext();
    assert.ok(context);
    assert.deepEqual(context.navigation, []);
    assert.equal(context.workspaceType, "business");
  });

  it("does not rewrite storage while reading it", () => {
    const core = contextCore(JSON.stringify(validCandidate()));
    const before = core.store[STORAGE_KEY];
    core.readWorkspaceContext();
    assert.deepEqual(core.writes, [], "hydration reads, it does not persist");
    assert.equal(core.store[STORAGE_KEY], before);
  });

  it("still persists when a live store asks it to, so the counter is not vacuous", () => {
    const core = contextCore();
    core.storeWorkspaceContext(validCandidate());
    assert.equal(core.writes.length, 1, "one write, from the writer");
    assert.equal(core.writes[0].key, STORAGE_KEY);
  });

  it("parses through an explicit unknown rather than a cast", () => {
    const reader = slice("function readCachedWorkspaceRecord() {");
    assert.match(reader, /\/\*\* @type \{unknown\} \*\/\s*\n\s*const parsed = JSON\.parse\(/);
    assert.match(reader, /isContextRecord\(parsed\) \? parsed : null/);
    assert.ok(!/@type \{[^}]*\} \*\/ \(JSON\.parse/.test(navigation), "no cast over the parse");
  });
});

describe("both publication paths agree, and neither publishes a raw value", () => {
  it("routes every namespace assignment through one helper", () => {
    const code = codeOnly(navigation);
    assert.equal(countOf(code, /window\.LongtailForge\.workspaceContext = /g), 1, "one assignment site");
    assert.match(slice("function publishWorkspaceContext(context) {"), /window\.LongtailForge\.workspaceContext = context;/);
    assert.equal(countOf(code, /publishWorkspaceContext\(/g), 3, "the helper and its two callers");
  });

  it("checks the helper's parameter against the stored contract", () => {
    const at = navigation.indexOf("  function publishWorkspaceContext(");
    assert.match(navigation.slice(at - 460, at), /@param \{BrowserStoredWorkspaceContext\} context/);
  });

  it("publishes the object it persisted, and they are the same object", () => {
    const core = contextCore();
    const returned = core.storeWorkspaceContext(validCandidate());
    const persisted = JSON.parse(core.store[STORAGE_KEY]);
    assert.equal(core.win.LongtailForge.workspaceContext, returned, "published is the returned object");
    assert.deepEqual(persisted, JSON.parse(JSON.stringify(returned)), "persisted is that object's JSON");
  });

  it("answers the canonical context so callers need not re-read the candidate", () => {
    const core = contextCore();
    const returned = core.storeWorkspaceContext({ workspaceName: "Acme", workspaceType: "family" });
    assert.equal(returned.workspaceName, "Acme");
    assert.equal(returned.workspaceType, "family");
    assert.deepEqual(Object.keys(returned).sort(), [...STORED_MEMBERS].sort());
  });

  it("hydrates from the cache through the same helper", () => {
    const hydrate = slice("function hydrateStoredWorkspaceContext() {");
    assert.match(hydrate, /const context = readWorkspaceContext\(\);/);
    assert.match(hydrate, /publishWorkspaceContext\(context\);/);
    assert.ok(!/window\.LongtailForge\.workspaceContext = context;/.test(hydrate), "no second assignment");
  });

  it("still declares no namespace member for the surface", () => {
    const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.ok(!/^ {2}workspaceContext\?:/m.test(body), "the member belongs to 0.33.33.38.2.2.5.2");
  });
});

describe("the transient app-shell context is left alone", () => {
  it("keeps building its own richer object before storage", () => {
    const bootstrap = codeOnly(slice("async function loadAppShellBootstrap() {"));
    assert.match(bootstrap, /const workspaceContext = \{\s*\n\s*\.\.\.\(shell\.workspaceContext \|\| \{\}\),/);
    assert.match(bootstrap, /storeWorkspaceContext\(workspaceContext\);/);
  });

  it("keeps dispatching the transient object as the event detail", () => {
    const bootstrap = codeOnly(slice("async function loadAppShellBootstrap() {"));
    assert.match(bootstrap, /"longtailforge:workspace-context-updated", \{\s*\n\s*detail: workspaceContext,/);
  });

  it("keeps applying the transient object where a transient-only member is read", () => {
    const bootstrap = codeOnly(slice("async function loadAppShellBootstrap() {"));
    assert.match(bootstrap, /applyWorkspaceDeletionNotice\(workspaceContext\);/);
    assert.match(
      slice("function applyWorkspaceDeletionNotice(workspaceContext) {"),
      /workspaceContext\?\.workspaceDeletion/,
      "and that member is one the stored record does not carry",
    );
  });

  it("still returns the transient object as the refresh result", () => {
    const bootstrap = codeOnly(slice("async function loadAppShellBootstrap() {"));
    assert.match(bootstrap, /return workspaceContext;/);
    assert.match(contracts, /^export type BrowserAppShellRefreshResult = Record<string, unknown> \| null \| undefined;$/m);
  });
});

describe("the fallback responses reach the constructor rather than the appliers", () => {
  it("declares the settings body unknown and applies the reconstruction", () => {
    const body = slice("async function loadWorkspaceSettings() {");
    assert.match(body, /\/\*\* @type \{unknown\} \*\/\s*\n\s*const settings = await response\.json\(\);/);
    assert.match(body, /const context = storeWorkspaceContext\(settings\);/);
    assert.match(body, /applyWorkspaceName\(context\.workspaceName\);/);
    assert.match(body, /applyWorkspaceCapabilities\(context\);/);
    const code = codeOnly(body);
    assert.ok(!/settings\.workspaceName/.test(code), "the raw body is not read after canonicalisation");
    assert.ok(!/applyWorkspaceCapabilities\(settings\)/.test(code));
  });

  it("keeps the settings path's redirect and its default-name catch", () => {
    const body = codeOnly(slice("async function loadWorkspaceSettings() {"));
    assert.match(body, /if \(response\.status === 401\) \{[\s\S]*window\.location\.replace\("\/login\.html"\);/);
    assert.match(body, /\} catch \{\s*\n\s*applyWorkspaceName\(DEFAULT_WORKSPACE_NAME\);/);
  });

  it("applies the reconstruction on the session path too", () => {
    const body = codeOnly(slice("async function loadSessionWorkspaces() {"));
    assert.match(body, /applyWorkspaceCapabilities\(storeWorkspaceContext\(workspaceContext\)\);/);
    assert.match(body, /if \(user\.workspaceContext\) \{/, "an absent session context is still tolerated");
  });

  it("stores a settings-shaped candidate and a session-shaped one alike", () => {
    const core = contextCore();
    const fromSettings = core.storeWorkspaceContext({
      enabledModules: ["tasks"], workspaceCapabilities: { availableTools: [] },
      workspaceId: "w1", workspaceName: "Acme", workspaceType: "business",
    });
    assert.equal(fromSettings.workspaceName, "Acme");
    const fromSession = core.storeWorkspaceContext({
      permissionIds: ["files.manage"], workspaceId: "w1", workspaceName: "Acme",
      workspaceType: "business", workspaceCapabilities: {}, userId: "u1", username: "ada",
    });
    assert.equal(fromSession.userId, "u1");
    assert.ok(!("permissionIds" in fromSession), "the session's extra member is not stored");
    assert.deepEqual(Object.keys(fromSession).sort(), Object.keys(fromSettings).sort());
  });
});

describe("the storage payload stays what it was", () => {
  it("persists no permission list and no capability secret", () => {
    const core = contextCore();
    core.storeWorkspaceContext({
      ...validCandidate(),
      permissionIds: ["files.manage", "tasks.delete"],
      apiKey: "secret",
      workspaceDeletion: { purgeAfter: "2026-01-01" },
    });
    const persisted = core.store[STORAGE_KEY];
    assert.ok(!/permissionIds/.test(persisted), "permission grants stay server-owned");
    assert.ok(!/apiKey|secret/.test(persisted));
    assert.ok(!/workspaceDeletion/.test(persisted));
    assert.deepEqual(Object.keys(JSON.parse(persisted)).sort(), [...STORED_MEMBERS].sort());
  });

  it("declares its load-time constants before the hydration that reads them", () => {
    // `const` is not hoisted. The cached-context hydration runs at load, long before the readers
    // are written, so a table declared beside them sits in the temporal dead zone and navigation
    // throws on every page. The end-to-end suite caught exactly that.
    const hydrateCall = navigation.indexOf("\n  hydrateStoredWorkspaceContext();");
    assert.notEqual(hydrateCall, -1, "the load-time hydration must still run");
    for (const name of ["DEFAULT_WORKSPACE_NAME", "WORKSPACE_CONTEXT_STORAGE_KEY", "WORKSPACE_TYPES"]) {
      const declaration = navigation.indexOf("  const " + name + " =");
      assert.notEqual(declaration, -1, name + " must be declared");
      assert.ok(declaration < hydrateCall, name + " must be initialised before the hydration reads it");
    }
  });

  it("writes to the one key it always used", () => {
    assert.match(navigation, /^ {2}const WORKSPACE_CONTEXT_STORAGE_KEY = "lf_workspace_context";$/m);
    assert.equal(countOf(codeOnly(navigation), /localStorage\.setItem\(WORKSPACE_CONTEXT_STORAGE_KEY/g), 1);
  });

  it("names no explicit any in the boundary it added", () => {
    const withoutText = navigation.replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
    assert.ok(!/[:<,{|&]\s*any\b/.test(withoutText));
    assert.ok(!/\bany\s*(?:\[\]|[>,}|&])/.test(withoutText));
  });
});
