import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * `LongtailForge.workspaceContext`, declared - and the machinery that declaration exposed as dead.
 *
 * Declaring the member is one line. What it cost was the reckoning: five files reached for
 * `permissionIds` and `permissions`, three read `user_id` or `workspace_type` beside the members
 * the constructor actually publishes, and one reached through a type assertion that made two
 * absent members look present. None of them could ever answer, because `buildWorkspaceContext`
 * reconstructs the stored context by name and publishes fourteen members, none of them a grant
 * list. These assertions hold that reckoning in place.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const contracts = read("src/types/browser-contracts.d.ts");
const navigation = read("public/js/navigation.js");
const actionSecurity = read("public/js/shared/view-action-security.js");
const moduleActions = read("public/js/shared/module-actions.js");
const attachments = read("public/js/shared/file-attachments.js");

const PAGES = {
  "clients-projects.js": read("public/js/clients-projects.js"),
  "files.js": read("public/js/files.js"),
  "lists.js": read("public/js/lists.js"),
  "notes.js": read("public/js/notes.js"),
  "task-dialog.js": read("public/js/task-dialog.js"),
  "tasks.js": read("public/js/tasks.js"),
};

/** @param {string} source @param {string} opener @param {string} [pad] */
function slice(source, opener, pad = "  ") {
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** Every browser source this checkpoint could have left a dead read in. */
function browserSources() {
  return { ...PAGES, "view-action-security.js": actionSecurity, "module-actions.js": moduleActions,
    "file-attachments.js": attachments, "navigation.js": navigation };
}

describe("the namespace declares the member the store publishes", () => {
  it("names the canonical stored record, not a looser one", () => {
    const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
    assert.notEqual(at, -1, "the namespace contract must exist");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    assert.match(body, /workspaceContext\?: BrowserStoredWorkspaceContext;/);
  });

  it("declares it optional, because a page can run before the shell has published", () => {
    assert.match(contracts, /workspaceContext\?: BrowserStoredWorkspaceContext;/);
    assert.ok(!/workspaceContext: BrowserStoredWorkspaceContext;/.test(contracts), "never required");
  });

  it("adds no permission collection while doing it", () => {
    const at = contracts.indexOf("export interface BrowserStoredWorkspaceContext {");
    const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
    for (const forbidden of ["permissionIds", "permissions:", "user_id", "workspace_type"]) {
      assert.ok(!body.includes(forbidden), forbidden + " is not part of this declaration");
    }
  });
});

describe("the machinery the declaration exposed as dead is gone", () => {
  it("leaves no reader of a member the constructor never publishes", () => {
    for (const [name, source] of Object.entries(browserSources())) {
      for (const dead of ["permissionIds", "permissions", "user_id", "workspace_type"]) {
        // Scoped to reads of the *namespace*. `navigation.js` legitimately reads `user_id` off
        // the candidate the server sent, which is the constructor's input, not its output.
        const pattern = new RegExp(
          "(window\\.LongtailForge|namespace)\\??\\.workspaceContext\\??\\." + dead + "\\b",
        );
        assert.ok(!pattern.test(source), name + " must not read the namespace's " + dead);
      }
    }
  });

  it("names no helper that existed only to read one", () => {
    for (const [name, source] of Object.entries(browserSources())) {
      for (const gone of [
        "workspacePermissionSet", "taskDialogWorkspacePermissionSet", "permissionAllowsTaskAction",
        "hasTaskWorkflowPermission", "hasTaskLifecyclePermission", "hasTaskCompletePermission",
        "hasTaskEditPermission",
      ]) {
        assert.ok(!source.includes(gone), name + " must not still name " + gone);
      }
    }
  });

  it("keeps the permission hint that a producer really does publish", () => {
    // `permissionHints` is a declared member with a live producer. Only the two collections that
    // have neither were removed, and no hint was invented to replace them.
    for (const source of [PAGES["files.js"], attachments]) {
      assert.match(source, /permissionHints\?\.filesManageQuarantine === true/);
    }
    assert.equal((navigation.match(/permissionHints/g) || []).length > 0, true);
  });
});

describe("the checks that always answered the same way now say so", () => {
  it("reduces the list-link check to the status rule it always was", () => {
    const body = slice(PAGES["lists.js"], "function canManageListLinks(list = state.editorList) {");
    const canManage = new Function("state", body + "\nreturn canManageListLinks;")({ editorList: null });
    assert.equal(canManage({ status: "active" }), true);
    assert.equal(canManage(null), true, "no list is not a locked list");
    for (const status of ["archived", "deleted", "finalized"]) {
      assert.equal(canManage({ status }), false, status + " still locks the links");
    }
    assert.ok(!/permission/i.test(body), "and it no longer mentions a permission it cannot read");
  });

  it("leaves the quarantine check answering from the hint, and nothing else", () => {
    for (const source of [PAGES["files.js"], attachments]) {
      const body = slice(source, "function workspaceHasPermission(permissionId) {");
      assert.match(body, /if \(permissionId === "files\.manage_quarantine"\)/);
      assert.match(body, /return false;/, "an unknown permission is still refused");
      assert.ok(!/rawPermissions|permissionSet/.test(body), "with no dead collection behind it");
    }
  });

  it("narrows the capability list before reading it as one", () => {
    const body = slice(moduleActions, "function hasRequiredWorkspaceCapabilities(requiredCapabilities = []) {");
    assert.match(moduleActions, /const availableTools = namespace\.workspaceContext\?\.workspaceCapabilities\?\.availableTools;/);
    assert.match(moduleActions, /Array\.isArray\(availableTools\) \? availableTools : \[\]/);
    assert.ok(body.length > 0);
  });
});

describe("the view-action-security hook is honest about being unconditional", () => {
  const body = () => slice(actionSecurity, "function actionPermissionsAllowed(action = {}) {");

  it("reaches for nothing through an assertion any more", () => {
    assert.ok(!/permissionIds|permissions\b/.test(body()), "no grant lookup survives");
    assert.ok(
      !/@type \{\{ permissionIds\?: unknown/.test(actionSecurity),
      "and the assertion that made two absent members look present is gone",
    );
  });

  it("answers exactly what it always answered", () => {
    const allowed = new Function(body() + "\nreturn actionPermissionsAllowed;")();
    assert.equal(allowed(), true);
    assert.equal(allowed({}), true);
    assert.equal(allowed({ requiredPermissions: [] }), true);
    assert.equal(allowed({ requiredPermissions: ["tasks.delete"] }), true, "unchanged for the case that used to reach");
  });

  it("keeps the published surface, its signatures and its other capabilities", () => {
    assert.match(actionSecurity, /namespace\.viewActionSecurity = Object\.freeze\(\{[\s\S]*assertActionPermissions,[\s\S]*interpolateRoute,/);
    // Declared *and* published: a rename would leave the export list naming something that no
    // longer exists, and a substring check would not notice either half.
    for (const kept of ["assertActionPermissions", "confirmDescriptorAction",
      "interpolateRoute", "runRouteAction"]) {
      assert.ok(actionSecurity.includes("function " + kept + "("), kept + " must still be declared");
      assert.ok(actionSecurity.includes("\n    " + kept + ",\n"), kept + " must still be published");
    }
  });

  it("records that the server is the enforcement point, and does not claim to have repaired one", () => {
    const doc = actionSecurity.slice(actionSecurity.indexOf("Whether an action's declared permissions") - 10,
      actionSecurity.indexOf("function actionPermissionsAllowed"));
    assert.match(doc, /enforcement point is the server/i);
    assert.match(doc, /never connected|has never gated/i);
    assert.ok(!/now enforces|authorization is restored/i.test(doc), "it repaired no authorization");
  });
});

describe("each page narrows the delivered surface before reading its identity", () => {
  /** @type {[keyof typeof PAGES, string, string][]} */
  const READERS = [
    ["clients-projects.js", "function clientProjectsViewSurfaceDescriptor() {", "client-projects"],
    ["files.js", "function filesViewSurfaceDescriptor() {", "framework"],
    ["notes.js", "function notesViewSurfaceDescriptor() {", "notes"],
    ["tasks.js", "function tasksViewSurfaceDescriptor() {", "tasks"],
  ];

  for (const [name, opener, moduleId] of READERS) {
    it(name + " checks the element is a record before reading id and moduleId", () => {
      const body = slice(PAGES[name], opener);
      assert.match(body, /is Record<string, unknown>/, "the callback is declared as a guard");
      // ...and actually guards. The annotation alone would let `Boolean(candidate)` through.
      assert.match(
        body,
        /isResponseRecord\(|typeof \w+ === "object" && \w+ !== null/,
        "and tests that the element is a record",
      );
      assert.match(body, new RegExp('moduleId === "' + moduleId + '"'), "and still identifies its own surface");
      assert.match(body, /\|\| null;/, "an undelivered surface is still null");
      assert.ok(!/@type \{[^}]*\} \(/.test(body), "with no cast doing the narrowing");
    });
  }

  it("ignores entries that cannot be a surface, without changing what it finds", () => {
    const body = slice(PAGES["tasks.js"], "function tasksViewSurfaceDescriptor() {");
    /** @param {unknown[]} surfaces */
    const find = (surfaces) => new Function("window", body + "\nreturn tasksViewSurfaceDescriptor;")(
      { LongtailForge: { workspaceContext: { viewSurfaces: surfaces } } },
    )();
    const wanted = { id: "tasks.workspace", moduleId: "tasks", detail: { kept: true } };
    assert.equal(find([null, 7, "tasks.workspace", [], wanted]), wanted, "and returns it by identity");
    assert.equal(find([{ id: "tasks.workspace", moduleId: "notes" }]), null);
    assert.equal(find([]), null);
    assert.equal(find([null, undefined, 0]), null);
  });
});
