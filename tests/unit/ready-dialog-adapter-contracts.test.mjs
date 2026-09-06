import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The three module-action dialog adapters `0.33.33.38.2.3.1` declared, exercised along the chain
 * that actually runs: dependency loading, the published surface, the dispatcher's opener, and the
 * dialog's own return and cancellation.
 *
 * The point of running the chain rather than its ends is that these surfaces are *late-bound*.
 * Every dependency entry names a member some other script publishes after the dispatcher has
 * been evaluated, so a test that hands the dispatcher a ready namespace proves nothing about the
 * case that actually breaks - the first invocation, before the script is there.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const moduleActions = read("public/js/shared/module-actions.js");
const filePreview = read("public/js/shared/file-preview.js");
const files = read("public/js/files.js");
const clientsProjects = read("public/js/clients-projects.js");
const attachments = read("public/js/shared/file-attachments.js");
const footer = read("public/js/footer.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [pad] */
function slice(source, opener, pad = "  ") {
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** A `const NAME = ...;` block that closes on its own line. */
function constBlock(/** @type {string} */ source, /** @type {string} */ name, closer = "  });") {
  const start = source.indexOf("  const " + name + " = ");
  assert.notEqual(start, -1, name + " must exist");
  const end = source.indexOf("\n" + closer, start);
  assert.notEqual(end, -1, name + " must terminate");
  return source.slice(start, end + closer.length + 1);
}

/** @param {string} source @param {string} interfaceName */
function interfaceBody(source, interfaceName) {
  const at = source.indexOf("export interface " + interfaceName + " ");
  assert.notEqual(at, -1, interfaceName + " must exist");
  return source.slice(at, source.indexOf("\n}\n", at));
}

/**
 * The dispatcher's dependency loader and its three new accessors, over a fake document whose
 * script loads publish whatever the test says the script publishes.
 */
function dispatcher() {
  /** @type {string[]} */
  const appended = [];
  /** @type {Record<string, () => void>} */
  const publishes = {};
  /** @type {Set<string>} */
  const deferred = new Set();
  /** @type {{ src: string, onLoad?: () => void }[]} */
  const pending = [];
  /** @type {Record<string, unknown>} */
  const namespaceValue = {};
  const fakeWindow = {
    LongtailForge: namespaceValue,
    URL,
  };
  const fakeDocument = {
    baseURI: "https://app.example/",
    body: {
      /** @param {{ src: string, onLoad?: () => void }} script */
      appendChild(script) {
        appended.push(script.src);
        if (deferred.has(script.src)) {
          pending.push(script);
          return;
        }
        publishes[script.src]?.();
        script.onLoad?.();
      },
    },
    createElement() {
      /** @type {{ src: string, async: boolean, onLoad?: () => void, addEventListener: (name: string, handler: () => void) => void }} */
      const script = {
        src: "",
        async: true,
        addEventListener(name, handler) {
          if (name === "load") {
            script.onLoad = handler;
          }
        },
      };
      return script;
    },
  };

  const built = new Function("window", "document", [
    "const namespace = window.LongtailForge;",
    "const dependencyScriptLoads = new Map();",
    constBlock(moduleActions, "MODULE_ACTION_DEPENDENCIES"),
    slice(moduleActions, "function publishedMember(host, key) {"),
    slice(moduleActions, "function dependencyIsSatisfied(dependency) {"),
    slice(moduleActions, "function appendClassicScript(dependency, versionedSrc) {"),
    slice(moduleActions, "function loadDependency(dependency) {"),
    slice(moduleActions, "function dependenciesFor(actionId) {"),
    slice(moduleActions, "async function ensureDependencies(actionId) {"),
    slice(moduleActions, "function requireClientProjectDialog() {"),
    slice(moduleActions, "function requireFilesDialog() {"),
    slice(moduleActions, "function requireFilePreview() {"),
    "return { dependenciesFor, ensureDependencies, requireClientProjectDialog,"
    + " requireFilesDialog, requireFilePreview };",
  ].join("\n"))(fakeWindow, fakeDocument);

  return {
    ...built,
    appended,
    namespace: namespaceValue,
    /** @param {string} src @param {() => void} publish */
    onLoad(src, publish) {
      publishes[src] = publish;
    },
    /** Hold this script's load open until `settle` is called, so two callers can overlap. */
    /** @param {string} src */
    defer(src) {
      deferred.add(src);
    },
    /** @param {string} src */
    settle(src) {
      for (const script of pending.splice(0)) {
        publishes[script.src]?.();
        script.onLoad?.();
      }
      return src;
    },
  };
}

describe("the dispatcher loads a surface before it reaches for it", () => {
  it("loads nothing for an action whose surface it does not own", () => {
    assert.deepEqual(dispatcher().dependenciesFor("notes.add").map((/** @type {{ src: string }} */ d) => d.src).includes("js/clients-projects.js"), false);
  });

  it("refuses to open a cold surface rather than reading undefined off it", () => {
    const host = dispatcher();
    assert.throws(() => host.requireClientProjectDialog(), /client and project dialog is required/);
    assert.throws(() => host.requireFilesDialog(), /Files dialog is required/);
    assert.throws(() => host.requireFilePreview(), /file preview helper is required/);
  });

  it("loads the script the action names and then finds the surface", async () => {
    const host = dispatcher();
    host.onLoad("js/clients-projects.js", () => {
      host.namespace.clientProjectDialog = { openAddClient: () => "opened" };
    });
    await host.ensureDependencies("clients.add");
    assert.deepEqual(host.appended, ["js/clients-projects.js"]);
    assert.equal(host.requireClientProjectDialog().openAddClient(), "opened");
  });

  it("does not execute the script a second time once its surface is published", async () => {
    const host = dispatcher();
    host.onLoad("js/clients-projects.js", () => {
      host.namespace.clientProjectDialog = { openEditProject: () => "opened" };
    });
    await host.ensureDependencies("projects.add");
    await host.ensureDependencies("projects.edit");
    await host.ensureDependencies("clients.edit");
    assert.equal(host.appended.length, 1, "one script load serves every action that names it");
  });

  it("shares one in-flight load between callers that overlap", async () => {
    // The satisfied-surface check cannot cover this: while the first load is still open nothing
    // is published yet, so only the in-flight map stops the second caller appending again.
    const host = dispatcher();
    host.defer("js/clients-projects.js");
    host.onLoad("js/clients-projects.js", () => {
      host.namespace.clientProjectDialog = { openAddClient: () => "opened" };
    });
    const first = host.ensureDependencies("clients.add");
    const second = host.ensureDependencies("projects.add");
    assert.equal(host.appended.length, 1, "the second caller joins the load already running");
    host.settle("js/clients-projects.js");
    await Promise.all([first, second]);
    assert.equal(host.appended.length, 1);
  });

  it("fails loudly when the script loads but publishes nothing", async () => {
    const host = dispatcher();
    host.onLoad("js/clients-projects.js", () => {});
    await assert.rejects(
      host.ensureDependencies("clients.add"),
      /Loaded js\/clients-projects\.js, but the expected helper is unavailable\./,
    );
  });

  it("checks the named member, not merely that the surface object exists", async () => {
    const host = dispatcher();
    host.onLoad("js/shared/file-preview.js", () => {
      host.namespace.filePreview = { somethingElse: () => "nope" };
    });
    await assert.rejects(host.ensureDependencies("files.preview"), /expected helper is unavailable/);
  });

  it("loads the shared preview helper for a preview, never the Files page controller", async () => {
    const host = dispatcher();
    const deps = host.dependenciesFor("files.preview");
    /** @type {{ src: string, member?: string }[]} */
    const entries = deps;
    assert.deepEqual(entries.map((d) => d.src), ["js/shared/file-preview.js"]);
    assert.deepEqual(entries.map((d) => d.member), ["openFilePreviewAction"]);
    assert.ok(!entries.some((d) => d.src === "js/files.js"), "the Files controller self-initializes and must not be pulled in");

    host.onLoad("js/shared/file-preview.js", () => {
      host.namespace.filePreview = { openFilePreviewAction: () => "previewed" };
    });
    await host.ensureDependencies("files.preview");
    assert.deepEqual(host.appended, ["js/shared/file-preview.js"]);
  });
});

describe("the dispatcher's openers forward what they were given, unchanged", () => {
  /** The registered `open` arrow for one action id, lifted from the shipped table. */
  /** @param {string} actionId */
  function opener(actionId) {
    const at = moduleActions.indexOf('      id: "' + actionId + '",');
    assert.notEqual(at, -1, actionId + " must be registered");
    const line = moduleActions.slice(moduleActions.indexOf("open: (params, hostContext) =>", at));
    const body = line.slice(0, line.indexOf("\n"));
    assert.match(body, /^open: \(params, hostContext\) => require[A-Za-z]+\(\)\./, actionId + " must acquire at invocation");
    /** @type {{ calls: unknown[][] }} */
    const surface = { calls: [] };
    const proxy = new Proxy(surface, {
      get: (target, key) => (key === "calls" ? target.calls
        : (/** @type {unknown[]} */ ...args) => { target.calls.push([String(key), ...args]); return "opened"; }),
    });
    const run = new Function("acquire", [
      "const requireClientProjectDialog = acquire;",
      "const requireFilesDialog = acquire;",
      "const requireFilePreview = acquire;",
      "return (params, hostContext) => (" + body.replace(/^open: /, "").replace(/,$/, "") + ")(params, hostContext);",
    ].join("\n"))(() => proxy);
    return { run, surface };
  }

  const ACTIONS = [
    ["clients.add", "openAddClient"], ["clients.edit", "openEditClient"],
    ["projects.add", "openAddProject"], ["projects.edit", "openEditProject"],
    ["files.edit", "openFileEditorAction"], ["files.preview", "openFilePreviewAction"],
  ];

  for (const [actionId, member] of ACTIONS) {
    it(actionId + " calls " + member + " with the same params and host context it received", () => {
      const { run, surface } = opener(actionId);
      const params = { recordId: "record-1", mode: "edit" };
      const hostContext = { result: Promise.resolve("done") };
      assert.equal(run(params, hostContext), "opened");
      assert.equal(surface.calls.length, 1);
      const [called, forwardedParams, forwardedHost] = surface.calls[0];
      assert.equal(called, member, "the opener names its own member");
      assert.equal(forwardedParams, params, "params are forwarded by identity, not rebuilt");
      assert.equal(forwardedHost, hostContext, "and so is the host context");
    });
  }

  it("acquires nothing while the action table is being built", () => {
    // Every opener is an arrow. If any of them called its accessor eagerly, building the registry
    // on a page that has not loaded the dialog script would throw at startup instead of at use.
    for (const [actionId] of ACTIONS) {
      const at = moduleActions.indexOf('      id: "' + actionId + '",');
      const entry = moduleActions.slice(at, moduleActions.indexOf("\n    },", at));
      assert.ok(
        !/require(ClientProjectDialog|FilesDialog|FilePreview)\(\)/.test(entry.replace(/open: \(params, hostContext\) =>[^\n]*/, "")),
        actionId + " must not acquire its surface outside the open arrow",
      );
    }
  });
});

describe("the preview action's own return and lifecycle", () => {
  /** `openFilePreviewAction` itself, over a recording dialog. */
  function previewAction() {
    /** @type {{ closeHandlers: (() => void)[], trigger: unknown }} */
    const dialog = { closeHandlers: [], trigger: null };
    /** @type {[unknown, { trigger?: unknown }][]} */
    const opened = [];
    const built = new Function("dialogValue", "opened", [
      "const normalizeFileActionRecord = (params = {}) => params.row || params;",
      "const fileActionAttachmentId = (record = {}) => record.attachmentId || '';",
      "const openFilePreview = (record, options) => { opened.push([record, options]);"
      + " dialogValue.addEventListener = (name, handler) => { if (name === 'close')"
      + " { dialogValue.closeHandlers.push(handler); } }; return dialogValue; };",
      slice(filePreview, "function openFilePreviewAction(params = {}, hostContext = null) {"),
      "return openFilePreviewAction;",
    ].join("\n"))(dialog, opened);
    return { run: built, dialog, opened };
  }

  it("hands back the dialog itself when there is no host context", () => {
    const { run, dialog } = previewAction();
    assert.equal(run({ attachmentId: "a1" }), dialog, "a synchronous dialog, not a promise");
  });

  it("hands back the host's own result promise when there is one", () => {
    const { run, dialog } = previewAction();
    const result = Promise.resolve("saved");
    const returned = run({ attachmentId: "a1" }, { result });
    assert.equal(returned, result, "the host's promise, by identity");
    assert.notEqual(returned, dialog);
  });

  it("cancels the host context when the dialog closes, naming the action and record", () => {
    const { run, dialog } = previewAction();
    /** @type {unknown[]} */
    const cancelled = [];
    run({ attachmentId: "a1" }, { cancel: (/** @type {unknown} */ detail) => cancelled.push(detail) });
    assert.deepEqual(cancelled, [], "nothing is settled before the dialog closes");
    dialog.closeHandlers.forEach((handler) => handler());
    assert.deepEqual(cancelled, [{ actionId: "files.preview", recordId: "a1" }]);
  });

  it("prefers the caller's return-focus target over the host's trigger", () => {
    const { run, opened } = previewAction();
    const returnFocusTo = { focus: () => {} };
    const hostTrigger = { focus: () => {} };
    run({ attachmentId: "a1", returnFocusTo }, { trigger: hostTrigger });
    assert.equal(opened[0][1].trigger, returnFocusTo);

    const second = previewAction();
    second.run({ attachmentId: "a1" }, { trigger: hostTrigger });
    assert.equal(second.opened[0][1].trigger, hostTrigger, "and falls back to the host's");
  });

  it("registers its close listener once", () => {
    const { run, dialog } = previewAction();
    run({ attachmentId: "a1" });
    assert.equal(dialog.closeHandlers.length, 1);
  });
});

describe("each surface is declared whole, and the three stay distinct", () => {
  it("covers the nine published preview members between the two interfaces", () => {
    const at = filePreview.indexOf("  namespace.filePreview = Object.freeze({");
    const body = filePreview.slice(at, filePreview.indexOf("\n  });", at));
    const members = [...body.matchAll(/^ {4}([a-zA-Z]+),$/gm)].map((m) => m[1]).sort();
    assert.equal(members.length, 9, "the publication has nine members");
    const declared = (interfaceBody(contracts, "BrowserFilePreview")
      + interfaceBody(contracts, "BrowserFilePreviewActions"));
    for (const member of members) {
      assert.match(declared, new RegExp("\\n  " + member + "\\("), member + " must be declared");
    }
    assert.match(interfaceBody(contracts, "BrowserFilePreview"), /extends BrowserFilePreviewActions/,
      "the established action-shaped contract is extended, not restated");
  });

  it("declares all four members of each dialog surface", () => {
    for (const [source, publication, name] of [
      [files, "  window.LongtailForge.filesDialog = Object.freeze({", "BrowserFilesDialog"],
      [clientsProjects, "  const clientProjectDialogApi = {", "BrowserClientProjectDialog"],
    ]) {
      const at = source.indexOf(publication);
      assert.notEqual(at, -1, name + "'s publication must exist");
      const body = source.slice(at, source.indexOf("\n  }", at));
      const members = [...body.matchAll(/^ {4}([a-zA-Z]+)[,:]/gm)].map((m) => m[1]);
      assert.equal(members.length, 4, name + " publishes four members");
      const declared = interfaceBody(contracts, name);
      for (const member of members) {
        assert.match(declared, new RegExp("\\n  " + member + "\\("), member + " must be declared on " + name);
      }
    }
  });

  it("keeps the asynchronous openers apart from the synchronous ones", () => {
    const clientProject = interfaceBody(contracts, "BrowserClientProjectDialog");
    assert.equal((clientProject.match(/Promise<string>/g) || []).length, 4,
      "every Clients/Projects opener resolves a close reason");
    const filesDialog = interfaceBody(contracts, "BrowserFilesDialog");
    assert.ok(!/Promise</.test(filesDialog), "no Files opener returns a promise");
    assert.equal((filesDialog.match(/BrowserViewModalElement/g) || []).length, 2,
      "the two dialog-returning openers say so");
    assert.equal((filesDialog.match(/\): unknown;/g) || []).length, 2,
      "and the two action-shaped ones stay open, because they answer a promise or a dialog");
  });

  it("does not erase the distinction behind one shared dialog interface", () => {
    assert.ok(!/export interface BrowserDialog\b/.test(contracts), "no generic dialog contract was invented");
    for (const name of ["BrowserFilesDialog", "BrowserClientProjectDialog", "BrowserFilePreview"]) {
      assert.match(contracts, new RegExp("export interface " + name + "\\b"));
    }
  });

  it("keeps every namespace member optional", () => {
    const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    for (const member of ["clientProjectDialog", "filePreview", "filesDialog"]) {
      assert.match(body, new RegExp("\\n  " + member + "\\?: Browser"), member + " stays optional");
    }
  });
});

describe("the consumers outside the dispatcher keep their own rules", () => {
  it("removed the Files controller's cast, because the declaration now checks the writer", () => {
    assert.ok(!/BrowserFilePreviewActions\} \*\/ \(filePreview\)/.test(files), "the cast is gone");
    assert.match(files, /function requireFilePreview\(\)/, "and an accessor took its place");
    assert.ok(!/const filePreviewActions =/.test(files), "with no cast-shaped alias left behind");
  });

  it("leaves the attachment panel's preview button optional, because its host may not load the helper", () => {
    assert.match(attachments, /hidden: !row\?\.previewable \|\| !namespace\.filePreview\?\.openFilePreview/,
      "the control is still withheld when the helper is absent");
    assert.match(attachments, /if \(!namespace\.filePreview\?\.normalizeFilePreviewRow\) \{/,
      "and the row reader still guards before it reads");
  });

  it("reads the quick-action dependency map by its own keys, not through the prototype", () => {
    const body = slice(footer, "function quickActionDependenciesFor(moduleActionId) {");
    assert.match(body, /Object\.entries\(quickActionDependencySets\)/);
    assert.ok(!/quickActionDependencySets\[/.test(body), "nothing indexes the map with a caller's string");

    const lookup = new Function("quickActionDependencySets", body + "\nreturn quickActionDependenciesFor;")(
      { "tasks.add": ["a"], "notes.add": ["b"] },
    );
    assert.deepEqual(lookup("tasks.add"), ["a"]);
    assert.deepEqual(lookup("notes.add"), ["b"]);
    for (const absent of ["toString", "constructor", "__proto__", "hasOwnProperty", "unknown.action", ""]) {
      assert.deepEqual(lookup(absent), [], absent + " is not a declared action");
    }
  });
});
