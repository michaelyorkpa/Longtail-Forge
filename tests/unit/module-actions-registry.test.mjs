import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/module-actions.js");

/**
 * The half of the registry nothing executed.
 *
 * `notes-module-action-openers.test.mjs` lifts `createHostContext`, and the text contracts pin
 * the first-party entries, but no test ever ran `register` itself. `0.33.33.39.4` annotated it,
 * and two of those annotations only compile because the registry's control flow moved: the
 * opener check became a predicate call so the spread can see the member it proved, and a dead
 * leading `actionId`/`id` pair left the normalized literal. The cases below hold what `register`
 * answered before that, so the claim that nothing moved is checkable rather than asserted.
 *
 * Deliberately not a mutation campaign: the checkpoint is annotations plus those two provably
 * inert edits, and a campaign would be attacking the untouched normalizer rather than the claim.
 */

const LIFTED = [
  "declaresDialogOpener", "register", "list", "toPublicAction",
  "isActionAvailable", "isModuleAvailable", "isWorkspaceTypeAvailable",
  "hasRequiredWorkspaceCapabilities",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {{ workspaceContext?: unknown }} [options] */
function registry(options = {}) {
  const browser = createFakeBrowserContext();
  const context = vm.createContext({
    document: browser.document,
    namespace: { workspaceContext: options.workspaceContext },
    registeredActions: new Map(),
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return vm.runInContext(`({ ${LIFTED.join(", ")}, registeredActions })`, context);
}

/** @param {string} id */
const openable = (id) => ({ id, open: () => Promise.resolve("opened") });

describe("Module action registration refuses what it always refused", () => {
  it("answers null for a descriptor with no identifier, no opener, or nothing at all", () => {
    const api = registry();
    for (const descriptor of [undefined, null, {}, { id: "" }, { id: "tasks.add" },
      { open: () => undefined }, { id: "tasks.add", open: "not a function" }]) {
      assert.equal(api.register(descriptor), null, `descriptor: ${JSON.stringify(descriptor)}`);
    }
    assert.equal(api.registeredActions.size, 0, "and stores none of them");
  });

  /** A primitive has neither member, so it reached the same `null` before the annotations. */
  it("answers null for a value that is not a descriptor at all", () => {
    const api = registry();
    for (const value of ["tasks.add", 5, true, []]) {
      assert.doesNotThrow(() => api.register(value), `value: ${JSON.stringify(value)}`);
      assert.equal(api.register(value), null);
    }
  });

  /** The opener check is read for every descriptor, including one that is about to be refused. */
  it("still asks every descriptor for its opener, even one with no identifier", () => {
    const api = registry();
    let reads = 0;
    const descriptor = { get open() { reads += 1; return () => undefined; } };
    assert.equal(api.register(descriptor), null);
    assert.equal(reads, 1, "the check moved into a predicate, not behind the identifier test");
  });
});

describe("Module action registration stores what it always stored", () => {
  it("keys the registry on actionId, preferring it over id", () => {
    const api = registry();
    api.register({ actionId: "tasks.add", id: "ignored", open: () => undefined });
    assert.deepEqual([...api.registeredActions.keys()], ["tasks.add"]);
  });

  /**
   * The pin the published contract names: both identifiers are written after the descriptor is
   * spread, so a descriptor's own `id` cannot survive alongside a different `actionId`.
   */
  it("pins both identifiers after the spread", () => {
    const api = registry();
    const stored = api.register({ actionId: "tasks.add", id: "tasks.edit", open: () => undefined });
    assert.equal(stored.actionId, "tasks.add");
    assert.equal(stored.id, "tasks.add", "the descriptor's own id does not survive");
    const fromId = api.register({ id: "notes.add", open: () => undefined });
    assert.equal(fromId.actionId, "notes.add");
    assert.equal(fromId.id, "notes.add");
  });

  /**
   * The member set, not its order. Removing the dead leading pair moved `actionId` and `id` to
   * the end of the key order of a record nothing enumerates; the members themselves are the same.
   */
  it("writes the same eleven members, plus the opener, for a minimal descriptor", () => {
    const api = registry();
    const stored = api.register(openable("tasks.add"));
    assert.deepEqual(Object.keys(stored).sort(), [
      "actionId", "id", "label", "mode", "moduleId", "open", "recordType",
      "requiredModules", "requiredPermissions", "requiredWorkspaceCapabilities",
      "title", "workspaceTypes",
    ]);
    assert.deepEqual(plain({ ...stored, open: undefined }), {
      actionId: "tasks.add", id: "tasks.add", label: "tasks.add", title: "tasks.add",
      mode: "", moduleId: "", recordType: "",
      requiredModules: [], requiredPermissions: [], requiredWorkspaceCapabilities: [],
      workspaceTypes: [],
    });
  });

  it("lets a descriptor replace every default it supplies", () => {
    const api = registry();
    const stored = api.register({
      id: "notes.view", label: "View Note", mode: "view", moduleId: "notes",
      open: () => undefined, recordType: "note", requiredModules: ["notes"],
      requiredPermissions: ["notes.view"], requiredWorkspaceCapabilities: ["notes"],
      title: "Look", workspaceTypes: ["business"],
    });
    assert.deepEqual(plain({ ...stored, open: undefined }), {
      actionId: "notes.view", id: "notes.view", label: "View Note", mode: "view",
      moduleId: "notes", recordType: "note", requiredModules: ["notes"],
      requiredPermissions: ["notes.view"], requiredWorkspaceCapabilities: ["notes"],
      title: "Look", workspaceTypes: ["business"],
    });
  });

  /** `title` falls back to the descriptor's label, and `label` to the identifier. */
  it("defaults the title from the label and the label from the identifier", () => {
    const api = registry();
    const labelled = api.register({ id: "lists.add", label: "Add List", open: () => undefined });
    assert.equal(labelled.label, "Add List");
    assert.equal(labelled.title, "Add List");
    const bare = api.register(openable("files.edit"));
    assert.equal(bare.label, "files.edit");
    assert.equal(bare.title, "files.edit");
  });

  /** A member the registry knows nothing about rides through untouched, `canOpen` included. */
  it("carries a member the registry never names", () => {
    const api = registry();
    const canOpen = () => true;
    const stored = api.register({ id: "tasks.add", open: () => undefined, canOpen, surprise: 7 });
    assert.equal(stored.canOpen, canOpen);
    assert.equal(stored.surprise, 7);
  });

  it("replaces an earlier registration of the same identifier", () => {
    const api = registry();
    api.register({ id: "tasks.add", label: "first", open: () => undefined });
    api.register({ id: "tasks.add", label: "second", open: () => undefined });
    assert.equal(api.registeredActions.size, 1);
    assert.equal(api.registeredActions.get("tasks.add").label, "second");
  });
});

describe("The published views of a registered action", () => {
  it("copies the ten summary members and no opener", () => {
    const api = registry();
    const stored = api.register({
      id: "tasks.add", label: "Add Task", mode: "add", moduleId: "tasks", open: () => undefined,
      recordType: "task", requiredModules: ["tasks"], requiredPermissions: ["tasks.create"],
      requiredWorkspaceCapabilities: ["projects"], title: "Add Task", workspaceTypes: ["business"],
    });
    assert.deepEqual(plain(api.toPublicAction(stored)), {
      actionId: "tasks.add", id: "tasks.add", label: "Add Task", mode: "add", moduleId: "tasks",
      recordType: "task", requiredModules: ["tasks"], requiredPermissions: ["tasks.create"],
      requiredWorkspaceCapabilities: ["projects"], title: "Add Task",
    });
  });

  /** The lists are copied, so a host cannot reach back through the summary into the registry. */
  it("copies the three lists rather than aliasing them", () => {
    const api = registry();
    const requiredModules = ["tasks"];
    const stored = api.register({ id: "tasks.add", open: () => undefined, requiredModules });
    const summary = api.toPublicAction(stored);
    assert.deepEqual(plain(summary.requiredModules), requiredModules);
    assert.notEqual(summary.requiredModules, requiredModules);
    summary.requiredModules.push("notes");
    assert.deepEqual(requiredModules, ["tasks"], "the registry's own list is untouched");
  });

  it("lists the available actions, and all of them on request", () => {
    const api = registry({ workspaceContext: { enabledModules: ["tasks"] } });
    api.register({ id: "tasks.add", moduleId: "tasks", open: () => undefined });
    api.register({ id: "notes.add", moduleId: "notes", open: () => undefined });
    /** @param {{ includeUnavailable?: boolean }} [options] */
    const identifiers = (options) =>
      plain(api.list(options)).map((/** @type {{ actionId: string }} */ action) => action.actionId);
    assert.deepEqual(identifiers(), ["tasks.add"]);
    assert.deepEqual(identifiers({}), ["tasks.add"]);
    assert.deepEqual(identifiers({ includeUnavailable: true }), ["tasks.add", "notes.add"]);
  });
});

describe("module-actions.js states its registry shape rather than asserting it", () => {
  it("names the descriptor locally and leaves the published one unnamed", () => {
    assert.match(source, /@typedef \{Record<string, unknown> & ModuleActionDescriptorMembers\} ModuleActionDescriptor/);
    assert.match(source, /This is not the module-contribution vocabulary/);
    // The members the registry never reads stay under the index signature, so naming the
    // descriptor here settles nothing a module may contribute.
    const members = source.slice(source.indexOf("@typedef {object} ModuleActionDescriptorMembers"),
      source.indexOf("ModuleActionDescriptor */"));
    for (const unnamed of ["canOpen", "mode", "recordType", "label", "title", "workspaceTypes"]) {
      assert.ok(!members.includes(unnamed), unnamed + " must stay unnamed");
    }
  });

  it("carries no suppression and no assertion for any of it", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.equal((source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || []).length, 1,
      "only the checked namespace read this file already had");
    assert.match(source, /return \/\*\* @type \{Record<string, unknown>\} \*\/ \(host\)\[key\];/);
  });
});
