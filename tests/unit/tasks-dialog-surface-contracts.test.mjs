import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * `LongtailForge.tasksDialog`, declared and adopted.
 *
 * Eight members that do not share a shape: `configure` answers the surface itself, four openers
 * resolve a close reason, one poller answers an opaque token, and two readers consume that token.
 * The chain that matters here is the same one the other dialog adapters use - dependency load,
 * published surface, dispatcher opener - plus the Tasks page's own two direct openers.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const moduleActions = read("public/js/shared/module-actions.js");
const taskDialog = read("public/js/task-dialog.js");
const tasks = read("public/js/tasks.js");
const workbench = read("public/js/workbench.js");
const calendar = read("public/js/calendar.js");
const tasksDashboard = read("public/js/tasks-dashboard.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [pad] */
function slice(source, opener, pad = "  ") {
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** @param {string} source @param {string} name @param {string} [closer] */
function constBlock(source, name, closer = "  });") {
  const start = source.indexOf("  const " + name + " = ");
  assert.notEqual(start, -1, name + " must exist");
  const end = source.indexOf("\n" + closer, start);
  assert.notEqual(end, -1, name + " must terminate");
  return source.slice(start, end + closer.length + 1);
}

/** @param {string} interfaceName */
function interfaceBody(interfaceName) {
  const at = contracts.indexOf("export interface " + interfaceName + " ");
  assert.notEqual(at, -1, interfaceName + " must exist");
  return contracts.slice(at, contracts.indexOf("\n}\n", at));
}

/** The dispatcher's loader and its Tasks accessor, over a fake document. */
function dispatcher() {
  /** @type {string[]} */
  const appended = [];
  /** @type {Record<string, () => void>} */
  const publishes = {};
  /** @type {Record<string, unknown>} */
  const namespaceValue = {};
  const fakeWindow = { LongtailForge: namespaceValue, URL };
  const fakeDocument = {
    baseURI: "https://app.example/",
    body: {
      /** @param {{ src: string, onLoad?: () => void }} script */
      appendChild(script) {
        appended.push(script.src);
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
    slice(moduleActions, "function requireTasksDialog() {"),
    "return { dependenciesFor, ensureDependencies, requireTasksDialog };",
  ].join("\n"))(fakeWindow, fakeDocument);
  return {
    ...built,
    appended,
    namespace: namespaceValue,
    /** @param {string} src @param {() => void} publish */
    onLoad(src, publish) {
      publishes[src] = publish;
    },
    /**
     * Publish whatever each of an action's dependencies names, so a test about one surface is not
     * really a test about the others in its chain.
     * @param {string} actionId
     */
    satisfyAll(actionId) {
      for (const dependency of built.dependenciesFor(actionId)) {
        /** @type {{ member?: string, src: string, surface: string }} */
        const entry = dependency;
        publishes[entry.src] = publishes[entry.src] || (() => {
          /** @type {Record<string, unknown>} */
          const surface = { ...(namespaceValue[entry.surface] || {}) };
          if (entry.member) {
            surface[entry.member] = () => "opened";
          }
          namespaceValue[entry.surface] = surface;
        });
      }
    },
  };
}

describe("the surface is declared whole, and its members keep their own shapes", () => {
  it("declares exactly the eight members the writer publishes", () => {
    const at = taskDialog.indexOf("  const taskDialogApi = {");
    assert.notEqual(at, -1, "the publication must exist");
    const body = taskDialog.slice(at, taskDialog.indexOf("\n  };", at));
    const members = [...body.matchAll(/^ {4}([a-zA-Z]+),$/gm)].map((m) => m[1]).sort();
    assert.deepEqual(members, [
      "configure", "open", "openAdd", "openEdit", "openTaskEditor",
      "pollRecurrenceContinuity", "recurrenceContinuityMessage", "renderRecurrenceContinuity",
    ]);
    const declared = interfaceBody("BrowserTasksDialog");
    for (const member of members) {
      assert.match(declared, new RegExp("\\n  " + member + "\\("), member + " must be declared");
    }
    assert.equal([...declared.matchAll(/^ {2}[a-zA-Z]+\(/gm)].length, 8, "and nothing else is");
  });

  it("says configure answers the surface itself, because it does", () => {
    assert.match(interfaceBody("BrowserTasksDialog"), /configure\(options\?: unknown\): BrowserTasksDialog;/);
    assert.match(slice(taskDialog, "function configure(options = {}) {"), /return taskDialogApi;/);
  });

  it("says the four openers resolve a close reason, because that is what they resolve", () => {
    const declared = interfaceBody("BrowserTasksDialog");
    assert.equal((declared.match(/\): Promise<string>;/g) || []).length, 4);
    assert.match(slice(taskDialog, "async function open({"), /resolve\(dialog\.returnValue \|\| "closed"\)/);
    for (const opener of ["function openAdd(params = {}, hostContext = null) {",
      "function openEdit(params = {}, hostContext = null) {"]) {
      assert.match(slice(taskDialog, opener), /return openTaskEditor\(\{ \.\.\.params, mode: "(add|edit)" \}, hostContext\);/);
    }
  });

  it("leaves the continuity token opaque, because the poller validates nothing", () => {
    assert.match(interfaceBody("BrowserTasksDialog"), /pollRecurrenceContinuity\(taskId\?: unknown, options\?: unknown\): Promise<unknown>;/);
    const body = slice(taskDialog, "async function pollRecurrenceContinuity(taskId, options = {}) {");
    assert.match(body, /continuity = result\?\.recurrenceContinuity \|\| continuity;/,
      "it keeps whatever the body carried");
    assert.ok(!/isRecord|Array\.isArray\(continuity\)|typeof continuity/.test(body),
      "and validates none of it, so unknown is what it really answers");
  });

  it("does not reopen the recurrence response domain", () => {
    const declared = interfaceBody("BrowserTasksDialog");
    assert.ok(!/BrowserTaskRecurrence/.test(declared),
      "no recurrence record is claimed by a member that validates nothing");
  });

  it("keeps the member optional on the namespace", () => {
    const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.match(body, /\n  tasksDialog\?: BrowserTasksDialog;/);
  });
});

describe("the dispatcher loads the dialog before it reaches for it", () => {
  it("refuses a cold surface rather than reading undefined off it", () => {
    assert.throws(() => dispatcher().requireTasksDialog(), /Tasks dialog is required/);
  });

  it("loads task-dialog.js and then finds the surface", async () => {
    const host = dispatcher();
    host.satisfyAll("tasks.add");
    host.onLoad("js/task-dialog.js", () => {
      host.namespace.tasksDialog = { openTaskEditor: () => "opened" };
    });
    await host.ensureDependencies("tasks.add");
    assert.ok(host.appended.includes("js/task-dialog.js"));
    assert.equal(host.requireTasksDialog().openTaskEditor(), "opened");
  });

  it("does not execute the script again for the edit action", async () => {
    const host = dispatcher();
    host.satisfyAll("tasks.add");
    host.satisfyAll("tasks.edit");
    host.onLoad("js/task-dialog.js", () => {
      host.namespace.tasksDialog = { openTaskEditor: () => "opened" };
    });
    await host.ensureDependencies("tasks.add");
    /** @param {string[]} loaded */
    const dialogLoads = (loaded) => loaded.filter((src) => src === "js/task-dialog.js").length;
    const afterFirst = dialogLoads(host.appended);
    await host.ensureDependencies("tasks.edit");
    assert.equal(dialogLoads(host.appended), afterFirst);
    assert.equal(afterFirst, 1);
  });

  it("fails loudly when the script loads without publishing the opener", async () => {
    const host = dispatcher();
    host.satisfyAll("tasks.add");
    host.onLoad("js/task-dialog.js", () => {
      host.namespace.tasksDialog = { configure: () => undefined };
    });
    await assert.rejects(host.ensureDependencies("tasks.add"), /expected helper is unavailable/);
  });
});

describe("the openers forward their mode, params and host context", () => {
  /** The registered `open` arrow for one action id, lifted from the shipped table. */
  /** @param {string} actionId */
  function opener(actionId) {
    const at = moduleActions.indexOf('      id: "' + actionId + '",');
    assert.notEqual(at, -1, actionId + " must be registered");
    const line = moduleActions.slice(moduleActions.indexOf("open: (params, hostContext) =>", at));
    const body = line.slice(0, line.indexOf("\n"));
    assert.match(body, /^open: \(params, hostContext\) => requireTasksDialog\(\)\./,
      actionId + " must acquire at invocation");
    /** @type {{ calls: unknown[][] }} */
    const surface = { calls: [] };
    const run = new Function("acquire", [
      "const requireTasksDialog = acquire;",
      "return (params, hostContext) => (" + body.replace(/^open: /, "").replace(/,$/, "") + ")(params, hostContext);",
    ].join("\n"))(() => ({
      /** @param {Record<string, unknown>} request @param {unknown} hostContext */
      openTaskEditor: (request, hostContext) => {
        surface.calls.push([request, hostContext]);
        return "opened";
      },
    }));
    return { run, surface };
  }

  for (const [actionId, mode] of [["tasks.add", "add"], ["tasks.edit", "edit"]]) {
    it(actionId + " forwards mode " + mode + " with the caller's params and host context", () => {
      const { run, surface } = opener(actionId);
      const params = { taskId: "task-1", defaults: { title: "x" } };
      const hostContext = { result: Promise.resolve("done") };
      assert.equal(run(params, hostContext), "opened");
      const [request, forwardedHost] = /** @type {[Record<string, unknown>, unknown]} */ (surface.calls[0]);
      assert.equal(request.mode, mode, "the mode the action means");
      assert.equal(request.taskId, "task-1", "and every param the caller gave");
      assert.deepEqual(request.defaults, { title: "x" });
      assert.equal(forwardedHost, hostContext, "the host context is forwarded by identity");
    });
  }

  it("acquires nothing while the action table is being built", () => {
    for (const actionId of ["tasks.add", "tasks.edit"]) {
      const at = moduleActions.indexOf('      id: "' + actionId + '",');
      const entry = moduleActions.slice(at, moduleActions.indexOf("\n    },", at));
      assert.ok(
        !/requireTasksDialog\(\)/.test(entry.replace(/open: \(params, hostContext\) =>[^\n]*/, "")),
        actionId + " must not acquire the dialog outside its open arrow",
      );
    }
  });
});

describe("the page consumers keep the rules they already had", () => {
  it("requires the dialog only where the Tasks page guarantees it", () => {
    assert.match(tasks, /function requireTasksDialog\(\)/);
    for (const opener of ["function openTaskDialog(task = null, options = {}) {",
      "function openTaskDialogById(taskId, returnFocusTo = null) {"]) {
      assert.match(slice(tasks, opener), /return requireTasksDialog\(\)\.openTaskEditor\(/);
    }
  });

  it("leaves every optional reader optional", () => {
    // These run from status areas that a host without the dialog still renders, so the surface
    // being absent must stay a no-op rather than becoming a throw.
    for (const [name, source] of [["tasks.js", tasks], ["workbench.js", workbench]]) {
      assert.match(source, /tasksDialog\?\.recurrenceContinuityMessage\?\.\(/, name);
      assert.match(source, /tasksDialog\?\.renderRecurrenceContinuity\?\.\(/, name);
      assert.match(source, /tasksDialog\?\.pollRecurrenceContinuity\?\.\(/, name);
    }
    assert.match(tasks, /requireNamespace\(\)\.tasksDialog\?\.configure\?\.\(\)/);
    for (const [name, source] of [["calendar.js", calendar], ["tasks-dashboard.js", tasksDashboard]]) {
      assert.match(source, /const opener = window\.LongtailForge\?\.tasksDialog\?\.openTaskEditor;/, name);
    }
  });

  it("keeps the recurrence polling behaviour it had", () => {
    const body = slice(taskDialog, "async function pollRecurrenceContinuity(taskId, options = {}) {");
    assert.match(body, /Math\.max\(1, Number\.parseInt\(options\.attempts, 10\) \|\| 7\)/, "seven attempts by default");
    assert.match(body, /Math\.max\(100, Number\.parseInt\(options\.delayMs, 10\) \|\| 1500\)/, "1500ms apart");
    assert.match(body, /\["available", "ended"\]\.includes\(continuity\?\.status\)/, "stopping on a settled status");
    assert.match(body, /await options\.onUpdate\(continuity, attempt\)/, "reporting each attempt");
  });

  it("keeps the editor's teardown on close", () => {
    const body = slice(taskDialog, "async function open({");
    assert.match(body, /clearTaskTimerInterval\(\)/, "the timer interval is cleared");
    assert.match(body, /fileAttachmentsController\?\.destroy\?\.\(\)/, "and the attachment controller destroyed");
    assert.match(body, /notesPanelController\?\.destroy\?\.\(\)/, "and the notes panel");
    assert.match(body, /restoreTaskEditorFocus\(returnFocusTo\)/, "and focus returns to the opener");
    assert.match(body, /\{ once: true \}/, "with the close listener registered once");
  });
});
