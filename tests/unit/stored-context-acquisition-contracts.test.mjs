import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The stored workspace-context consumer boundary, closed by `0.33.33.38.2.9`.
 *
 * Five consumer functions captured the published context behind `|| {}`. An empty object literal
 * has no members, so every read through it failed regardless of what `BrowserStoredWorkspaceContext`
 * declared - the nine canonical-field diagnostics were about the **stand-in**, not about whether
 * the context was available. It is gone; each site keeps its optional capture, its own operators
 * and its own final default.
 *
 * Three of the twelve reads were something else: fallback arms for `user_id`, `workspace_type` and
 * a flat `availableTools`. `buildWorkspaceContext` is the sole writer of this member and emits an
 * exact record that contains none of them - it already folds an incoming `user_id` into `userId`
 * before publishing. Those arms could never fire, and they are deleted rather than typed.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const listsSource = read("public/js/lists.js");
const notesSource = read("public/js/notes.js");
const stopWatchSource = read("public/js/stop-watch.js");
const moduleActionsSource = read("public/js/shared/module-actions.js");
const navigationSource = read("public/js/navigation.js");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * The shipped canonical constructor, with every helper it uses, and no localStorage.
 * @returns {(candidate: unknown) => Record<string, unknown>}
 */
function liftBuildWorkspaceContext() {
  const parts = [
    '  const DEFAULT_WORKSPACE_NAME = "Workspace";',
    '  const WORKSPACE_TYPES = Object.freeze(["business", "family", "personal"]);',
    "  function isContextRecord(value) {",
    "    return typeof value === \"object\" && value !== null && !Array.isArray(value);",
    "  }",
    "  function readCachedWorkspaceRecord() { return null; }",
    slice(navigationSource, "function readContextRecord(value) {"),
    slice(navigationSource, "function readContextList(...candidates) {"),
    slice(navigationSource, "function readContextBag(...candidates) {"),
    slice(navigationSource, "function readContextPublicDemo(...candidates) {"),
    slice(navigationSource, "function readContextText(...candidates) {"),
    slice(navigationSource, "function readContextWorkspaceType(...candidates) {"),
    slice(navigationSource, "function buildWorkspaceContext(candidate) {"),
    "  return buildWorkspaceContext;",
  ];
  return new Function(parts.join("\n"))();
}

/**
 * Lift one shipped consumer together with the shipped capture inside it.
 * @param {string} source @param {string} opener
 * @param {ReadonlyArray<string>} names @param {Record<string, unknown>} values
 */
function liftConsumer(source, opener, names, values) {
  const built = new Function("window", "namespace", ...names, [
    slice(source, opener),
    "  return " + opener.replace(/^(async )?function /, "").replace(/\(.*$/, "") + ";",
  ].join("\n"));
  return (/** @type {unknown} */ context, /** @type {unknown[]} */ ...args) => {
    const namespace = context === undefined ? {} : { workspaceContext: context };
    const consumer = built(
      { LongtailForge: context === null ? undefined : namespace },
      namespace, ...names.map((/** @type {string} */ name) => values[name]));
    return consumer(...args);
  };
}

/** A context exactly as `buildWorkspaceContext` emits it. */
function canonicalContext(overrides = {}) {
  return liftBuildWorkspaceContext()(overrides);
}

describe("the canonical publisher, and what it proves about the three deleted aliases", () => {
  const build = liftBuildWorkspaceContext();

  it("emits an exact record whose members are the declared ones", () => {
    assert.deepEqual(Object.keys(build({})).sort(), [
      "enabledModules", "modules", "navigation", "permissionHints", "publicDemo", "quickActions",
      "searchTargets", "userId", "username", "viewSurfaces", "workspaceCapabilities",
      "workspaceId", "workspaceName", "workspaceType",
    ]);
  });

  it("folds an incoming user_id into userId and never republishes the alias", () => {
    const context = build({ user_id: "user-9" });
    assert.equal(context.userId, "user-9", "the alias is an input the constructor normalizes");
    assert.equal("user_id" in context, false, "and it is not a member of what gets published");
    assert.equal(build({ userId: "canonical", user_id: "alias" }).userId, "canonical",
      "the canonical candidate still wins");
  });

  it("normalizes workspace type and never republishes workspace_type", () => {
    assert.equal(build({ workspaceType: "family" }).workspaceType, "family");
    assert.equal(build({ workspace_type: "family" }).workspaceType, "business",
      "the snake_case alias is not even an input to this member");
    assert.equal("workspace_type" in build({ workspace_type: "family" }), false);
    assert.equal(build({ workspaceType: "nonsense" }).workspaceType, "business",
      "an unknown type falls to the constructor's own default");
  });

  it("keeps availableTools nested and never lifts it to the top level", () => {
    const context = build({ workspaceCapabilities: { availableTools: ["clients_projects"] } });
    assert.deepEqual(context.workspaceCapabilities, { availableTools: ["clients_projects"] });
    assert.equal("availableTools" in context, false);
    assert.deepEqual(build({ availableTools: ["clients_projects"] }).workspaceCapabilities, {},
      "a flat candidate is not adopted into the capabilities bag");
  });

  it("is the only writer of the published member", () => {
    const assignments = navigationSource.match(/\.workspaceContext = /g) || [];
    assert.equal(assignments.length, 1, "one assignment site");
    assert.match(navigationSource, /function publishWorkspaceContext\(context\) \{/);
    assert.equal((navigationSource.match(/publishWorkspaceContext\(context\);/g) || []).length, 2,
      "both the live store and the cache hydration go through it");
  });
});

describe("Notes keeps its workspace-type and capability behaviour", () => {
  const workspaceType = liftConsumer(notesSource, "function applyWorkspaceContext() {",
    ["state", "normalizeWorkspaceType", "applyWorkspaceVisibilityControls",
      "populateWorkspaceVisibilityOptions", "populateLinkTargetTypeSelect", "contextTargetTypeInput",
      "populateLinkClientContextSelect", "updatePrimaryContextVisibility"],
    {
      applyWorkspaceVisibilityControls() {},
      contextTargetTypeInput: null,
      normalizeWorkspaceType: (/** @type {unknown} */ value) => String(value || "business"),
      populateLinkTargetTypeSelect() {},
      populateLinkClientContextSelect() {},
      populateWorkspaceVisibilityOptions() {},
      state: {},
      updatePrimaryContextVisibility() {},
    });
  const hasClientTools = liftConsumer(notesSource, "function workspaceHasClientTools() {", [], {});

  for (const type of /** @type {const} */ (["business", "family", "personal"])) {
    it(`reads the canonical ${type} workspace type`, () => {
      /** @type {Record<string, unknown>} */
      const state = {};
      const apply = liftConsumer(notesSource, "function applyWorkspaceContext() {",
        ["state", "normalizeWorkspaceType", "applyWorkspaceVisibilityControls",
          "populateWorkspaceVisibilityOptions", "populateLinkTargetTypeSelect", "contextTargetTypeInput",
          "populateLinkClientContextSelect", "updatePrimaryContextVisibility"],
        {
          applyWorkspaceVisibilityControls() {},
          contextTargetTypeInput: null,
          normalizeWorkspaceType: (/** @type {unknown} */ value) => String(value || "business"),
          populateLinkTargetTypeSelect() {},
          populateLinkClientContextSelect() {},
          populateWorkspaceVisibilityOptions() {},
          state,
          updatePrimaryContextVisibility() {},
        });
      apply(canonicalContext({ workspaceType: type }));
      assert.equal(state.workspaceType, type);
    });
  }

  it("does not throw and still normalizes when the root or the context is absent", () => {
    assert.doesNotThrow(() => workspaceType(null), "no namespace root");
    assert.doesNotThrow(() => workspaceType(undefined), "root present, no stored context");
  });

  it("finds clients_projects through the nested capability bag", () => {
    assert.equal(hasClientTools(canonicalContext({
      workspaceCapabilities: { availableTools: ["clients_projects", "reports"] },
    })), true);
  });

  it("answers false for an absent, empty or unrelated capability list", () => {
    assert.equal(hasClientTools(canonicalContext()), false, "no capabilities at all");
    assert.equal(hasClientTools(canonicalContext({ workspaceCapabilities: { availableTools: [] } })), false);
    assert.equal(hasClientTools(canonicalContext({ workspaceCapabilities: { availableTools: ["reports"] } })), false);
    assert.equal(hasClientTools(null), false, "no namespace root");
    assert.equal(hasClientTools(undefined), false, "no stored context");
  });

  it("keeps the array check, because the capability bag promises only a record", () => {
    assert.equal(hasClientTools(canonicalContext({
      workspaceCapabilities: { availableTools: "clients_projects" },
    })), false, "a string is not a tool list, even though it would pass `includes`");
  });

  it("ignores a flat availableTools, which the publisher cannot emit", () => {
    // Injected directly rather than through the constructor, because the constructor drops it.
    assert.equal(hasClientTools({ availableTools: ["clients_projects"], workspaceCapabilities: {} }), false);
  });
});

describe("Stop Watch reads the same nested capability", () => {
  const showsClientTools = liftConsumer(stopWatchSource, "function workspaceShowsClientTools() {", [], {});

  it("answers from the nested list and tolerates every absence", () => {
    assert.equal(showsClientTools(canonicalContext({
      workspaceCapabilities: { availableTools: ["clients_projects"] },
    })), true);
    assert.equal(showsClientTools(canonicalContext()), false);
    assert.equal(showsClientTools(canonicalContext({ workspaceCapabilities: { availableTools: [] } })), false);
    assert.equal(showsClientTools(null), false);
    assert.equal(showsClientTools(undefined), false);
  });
});

describe("module availability keeps its container check", () => {
  const isModuleAvailable = liftConsumer(moduleActionsSource, "function isModuleAvailable(moduleId) {", [], {});

  it("treats an empty enabled list as permissive, as before", () => {
    assert.equal(isModuleAvailable(canonicalContext(), "lists"), true);
    assert.equal(isModuleAvailable(undefined, "lists"), true, "no stored context is still permissive");
  });

  it("honours a populated enabled list", () => {
    const context = canonicalContext({ enabledModules: ["lists"] });
    assert.equal(isModuleAvailable(context, "lists"), true);
    assert.equal(isModuleAvailable(context, "notes"), false);
  });

  it("short-circuits for the framework before it reads the context at all", () => {
    assert.equal(isModuleAvailable(null, "framework"), true, "the framework never consults the context");
    assert.equal(isModuleAvailable(null, ""), true, "and neither does an empty module id");
  });
});

describe("Lists terminology, labels and identity", () => {
  /** Drive the shipped `applyWorkspaceContext` with recording chrome. */
  /** @param {unknown} context */
  function applyLists(context) {
    /** @type {Record<string, unknown>} */
    const state = {};
    const pageTitle = { textContent: "" };
    const createButton = { textContent: "" };
    const body = { dataset: /** @type {Record<string, string>} */ ({}) };
    const built = new Function("window", "state", "pageTitle", "createButton", "document",
      "setBusinessControlsVisible", "setContextControlsVisible", "usesBusinessScope",
      "isResponseRecord", [
        slice(listsSource, "function isListsModuleDefinition(value) {"),
        slice(listsSource, "function readListsLabel(value) {"),
        slice(listsSource, "function applyWorkspaceContext() {"),
        "  return applyWorkspaceContext;",
      ].join("\n"));
    built(
      { LongtailForge: context === null ? undefined : { workspaceContext: context } },
      state, pageTitle, createButton, { body },
      () => {}, () => {}, () => false,
      (/** @type {unknown} */ value) => typeof value === "object" && value !== null && !Array.isArray(value),
    )();
    return { body, createButton, pageTitle, state };
  }

  /** @param {unknown} terminology @param {Record<string, unknown>} [extra] */
  const listsModule = (terminology, extra = {}) => ({
    displayName: "Checklists",
    id: "lists",
    terminology,
    ...extra,
  });

  it("prefers the workspace-specific terminology", () => {
    const result = applyLists(canonicalContext({
      modules: [listsModule({ default: { createButton: "New", label: "Lists" }, family: { createButton: "Add chore", label: "Chores" } })],
      workspaceType: "family",
    }));
    assert.equal(result.pageTitle.textContent, "Chores");
    assert.equal(result.createButton.textContent, "Add chore");
  });

  it("falls back to the default terminology when the workspace has none", () => {
    const result = applyLists(canonicalContext({
      modules: [listsModule({ default: { createButton: "New list", label: "Collections" } })],
      workspaceType: "personal",
    }));
    assert.equal(result.pageTitle.textContent, "Collections");
    assert.equal(result.createButton.textContent, "New list");
  });

  it("falls back to displayName when terminology carries no label", () => {
    const result = applyLists(canonicalContext({ modules: [listsModule({ default: { createButton: "Go" } })] }));
    assert.equal(result.pageTitle.textContent, "Checklists");
    assert.equal(result.createButton.textContent, "Go");
  });

  it("falls back to the local defaults with no matching module or no terminology", () => {
    for (const modules of [[], [{ id: "notes", terminology: { default: { label: "Notes" } } }], [listsModule(undefined)]]) {
      const result = applyLists(canonicalContext({ modules }));
      assert.equal(result.pageTitle.textContent, modules.length && modules[0].id === "lists" ? "Checklists" : "Lists");
      assert.equal(result.createButton.textContent, "Create List");
    }
  });

  it("takes the local defaults for a malformed candidate or terminology, and that is a tightening", () => {
    // A truthy non-string label used to be written straight into `textContent`; it now falls to
    // the same local default the missing case already used. Valid contexts are unaffected.
    const numeric = applyLists(canonicalContext({ modules: [listsModule({ default: { createButton: 7, label: 42 } })] }));
    assert.equal(numeric.pageTitle.textContent, "Checklists", "a numeric label yields the displayName");
    assert.equal(numeric.createButton.textContent, "Create List");

    const notARecord = applyLists(canonicalContext({ modules: [listsModule("terminology")] }));
    assert.equal(notARecord.pageTitle.textContent, "Checklists");

    const entryNotARecord = applyLists(canonicalContext({ modules: [listsModule({ default: "Lists!" })] }));
    assert.equal(entryNotARecord.pageTitle.textContent, "Checklists",
      "a non-record entry took the displayName before and still does");

    // An array with a `label` is the case a bare `candidate || {}` would read through.
    const arrayEntry = applyLists(canonicalContext({
      modules: [listsModule({ default: Object.assign(["x"], { label: "Smuggled" }) })],
    }));
    assert.equal(arrayEntry.pageTitle.textContent, "Checklists",
      "a non-record entry took the displayName before and still does");
  });

  it("does not trust a modules element merely because the container is an array", () => {
    // An array carrying an `id` is the case a bare `module?.id` test would accept and a
    // record predicate refuses; without it this claim would pass for the wrong reason.
    for (const modules of [["lists"], [null], [["lists"]], [42],
      [Object.assign(["x"], { id: "lists", terminology: { default: { label: "Smuggled" } } })]]) {
      const result = applyLists(canonicalContext({ modules }));
      assert.equal(result.pageTitle.textContent, "Lists", `no module selected from ${JSON.stringify(modules)}`);
    }
  });

  it("leaves the module object's other fields intact", () => {
    const extras = { contributedBy: "core", icon: "list", version: 3 };
    const definition = listsModule({ default: { label: "Collections" } }, extras);
    const snapshot = JSON.parse(JSON.stringify(definition));
    applyLists(canonicalContext({ modules: [definition] }));
    assert.deepEqual(definition, snapshot, "the consumer reads the definition and never rewrites it");
  });

  it("reads the canonical identity and keeps the empty-string default", () => {
    assert.equal(applyLists(canonicalContext({ userId: "user-4" })).state.currentUserId, "user-4");
    assert.equal(applyLists(canonicalContext()).state.currentUserId, "", "an empty userId keeps the final default");
    assert.equal(applyLists(null).state.currentUserId, "", "and so does no context at all");
    assert.equal(applyLists(undefined).state.currentUserId, "", "the final empty string is the only answer");
    assert.equal(applyLists(canonicalContext({ user_id: "user-9" })).state.currentUserId, "user-9",
      "the constructor folded the alias in, so the consumer still sees the identity");
  });

  it("ignores an alias-only object the canonical writer cannot publish", () => {
    assert.equal(applyLists({ modules: [], user_id: "user-9", workspaceType: "business" }).state.currentUserId, "");
  });

  it("keeps the workspace-type default and writes it to the body dataset", () => {
    assert.equal(applyLists(canonicalContext({ workspaceType: "family" })).state.workspaceType, "family");
    assert.equal(applyLists(canonicalContext({ workspaceType: "family" })).body.dataset.listsWorkspaceType, "family");
    assert.equal(applyLists(null).state.workspaceType, "business", "no root still defaults");
    assert.equal(applyLists(undefined).state.workspaceType, "business", "no stored context still defaults");
  });

  it("never throws for an absent root or context", () => {
    assert.doesNotThrow(() => applyLists(null));
    assert.doesNotThrow(() => applyLists(undefined));
  });
});

describe("the shipped source keeps the shape this checkpoint claims", () => {
  const CONSUMERS = /** @type {const} */ ([
    ["lists.js", listsSource, "function applyWorkspaceContext() {"],
    ["notes.js applyWorkspaceContext", notesSource, "function applyWorkspaceContext() {"],
    ["notes.js workspaceHasClientTools", notesSource, "function workspaceHasClientTools() {"],
    ["stop-watch.js", stopWatchSource, "function workspaceShowsClientTools() {"],
    ["module-actions.js", moduleActionsSource, "function isModuleAvailable(moduleId) {"],
  ]);

  it("captures the context optionally, inside the function, with no stand-in", () => {
    for (const [name, source, opener] of CONSUMERS) {
      const body = slice(source, opener);
      assert.ok(!/workspaceContext \|\| \{\}/.test(body), `${name} must not restore the stand-in`);
      assert.match(body, /const context = (window\.LongtailForge\?\.|namespace\.)workspaceContext;/,
        `${name} keeps its own optional capture`);
      assert.ok(!/require\w*[Cc]ontext|throw new Error\([^)]*[Cc]ontext/.test(body),
        `${name} must not make the context required`);
    }
  });

  it("has removed every alias arm, at the call sites rather than in a comment", () => {
    for (const [name, source, opener] of CONSUMERS) {
      const body = slice(source, opener)
        .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
      for (const alias of ["context.user_id", "context?.user_id", "context.workspace_type",
        "context?.workspace_type", "context.availableTools", "context?.availableTools"]) {
        assert.ok(!body.includes(alias), `${name} must not read ${alias}`);
      }
    }
  });

  it("keeps every truthiness default rather than swapping it for nullish coalescing", () => {
    const lists = slice(listsSource, "function applyWorkspaceContext() {");
    assert.match(lists, /context\?\.workspaceType \|\| "business"/,
      "Lists must keep its truthiness workspace-type default");
    assert.match(lists, /context\?\.userId \|\| ""/,
      "Lists must keep its truthiness identity default");
    assert.match(slice(notesSource, "function applyWorkspaceContext() {"),
      /normalizeWorkspaceType\(context\?\.workspaceType \|\| ""\)/,
      "Notes must keep the final empty-string input to its normalizer");
    for (const [name, source, opener] of CONSUMERS) {
      assert.ok(!/context\?\?|\?\? ""|\?\? "business"|\?\? \[\]/.test(slice(source, opener)),
        `${name} must not swap a truthiness default for ??`);
    }
  });

  it("keeps the array checks the declaration does not make redundant", () => {
    assert.match(slice(moduleActionsSource, "function isModuleAvailable(moduleId) {"),
      /Array\.isArray\(context\?\.enabledModules\)/,
      "the enabled-module container check must survive the declaration");
    for (const [source, opener] of /** @type {const} */ ([
      [notesSource, "function workspaceHasClientTools() {"],
      [stopWatchSource, "function workspaceShowsClientTools() {"],
    ])) {
      assert.match(slice(source, opener), /Array\.isArray\(tools\) && tools\.includes\("clients_projects"\)/);
    }
  });

  it("leaves the canonical producer untouched", () => {
    assert.match(navigationSource, /userId: readContextText\(settings\.userId, settings\.user_id, previous\.userId\)/,
      "the constructor still accepts the alias as an input");
    assert.ok(!/user_id:/.test(navigationSource.slice(
      navigationSource.indexOf("function buildWorkspaceContext"),
      navigationSource.indexOf("function publishWorkspaceContext"))),
    "and still does not emit it");
  });
});
