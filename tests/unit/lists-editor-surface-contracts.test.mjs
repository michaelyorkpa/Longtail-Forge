import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists editor surface accepts, and what it guarantees.
 *
 * `0.33.33.43.20` typed the editor's parameter readers and its linked-context identity test. The
 * module action is published as `params?: unknown`, so nothing about the bag is proved; what these
 * cases fix is the conversion each reader performs on it - which spelling wins, what an absent
 * member falls to, and where a zero or an empty string survives.
 *
 * One executable change is in scope and is proved here rather than asserted: the module lookup
 * gained an empty-string default, and `{...}[undefined]` and `{...}[""]` are both absent, so both
 * still fall through to `""`.
 *
 * The three deferrals this checkpoint recorded are pinned at the bottom. Each has a discharge
 * condition, and each case fails when that condition stops being the reason.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/** The editor readers, lifted with the one helper `listLinkPayload` reaches for. */
function readers() {
  const sandbox = vm.createContext({});
  for (const name of [
    "normalizeListEditorMode",
    "readListEditorId",
    "normalizeListEditorDefaults",
    "sameListLinkTarget",
    "moduleIdForListLinkTarget",
    "listLinkPayload",
  ]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext(`({
    normalizeListEditorMode,
    readListEditorId,
    normalizeListEditorDefaults,
    sameListLinkTarget,
    moduleIdForListLinkTarget,
    listLinkPayload,
  })`, sandbox);
}

/** @param {unknown} value */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

describe("Lists editor mode", () => {
  it("answers add for every bag that does not name edit", () => {
    const { normalizeListEditorMode } = readers();

    assert.equal(normalizeListEditorMode(), "add");
    assert.equal(normalizeListEditorMode({}), "add");
    assert.equal(normalizeListEditorMode({ mode: "create" }), "add");
    assert.equal(normalizeListEditorMode({ mode: 7 }), "add");
  });

  it("accepts either spelling and is insensitive to case", () => {
    const { normalizeListEditorMode } = readers();

    assert.equal(normalizeListEditorMode({ mode: "edit" }), "edit");
    assert.equal(normalizeListEditorMode({ actionMode: "edit" }), "edit");
    assert.equal(normalizeListEditorMode({ mode: "EDIT" }), "edit");
    assert.equal(normalizeListEditorMode({ actionMode: "Edit" }), "edit");
  });

  it("lets mode win over actionMode when both arrive", () => {
    const { normalizeListEditorMode } = readers();

    assert.equal(normalizeListEditorMode({ actionMode: "edit", mode: "add" }), "add");
    assert.equal(normalizeListEditorMode({ actionMode: "add", mode: "edit" }), "edit");
  });

  it("falls past an empty mode to the second spelling", () => {
    const { normalizeListEditorMode } = readers();

    assert.equal(normalizeListEditorMode({ actionMode: "edit", mode: "" }), "edit");
  });
});

describe("Lists editor identifier", () => {
  it("takes the four spellings in their declared order", () => {
    const { readListEditorId } = readers();

    assert.equal(readListEditorId({ id: "d", listId: "a", list_id: "b", recordId: "c" }), "a");
    assert.equal(readListEditorId({ id: "d", list_id: "b", recordId: "c" }), "b");
    assert.equal(readListEditorId({ id: "d", recordId: "c" }), "c");
    assert.equal(readListEditorId({ id: "d" }), "d");
  });

  it("answers an empty string rather than undefined for a bag with none", () => {
    const { readListEditorId } = readers();

    assert.equal(readListEditorId(), "");
    assert.equal(readListEditorId({}), "");
  });

  it("falls past an empty identifier to the next spelling", () => {
    const { readListEditorId } = readers();

    assert.equal(readListEditorId({ listId: "", list_id: "b" }), "b");
  });

  it("forwards whatever arrived rather than converting it", () => {
    const { readListEditorId } = readers();

    assert.equal(readListEditorId({ listId: 42 }), 42);
  });
});

describe("Lists editor defaults", () => {
  it("answers all five members for a bag carrying none", () => {
    const { normalizeListEditorDefaults } = readers();

    assert.deepEqual(plain(normalizeListEditorDefaults()), {
      client_id: "",
      description: "",
      list_type: "",
      project_id: "",
      title: "",
    });
  });

  it("takes either spelling, snake_case first", () => {
    const { normalizeListEditorDefaults } = readers();
    const both = normalizeListEditorDefaults({
      clientId: "camel-client",
      client_id: "snake-client",
      listType: "camel-type",
      list_type: "snake-type",
      projectId: "camel-project",
      project_id: "snake-project",
    });

    assert.equal(both.client_id, "snake-client");
    assert.equal(both.list_type, "snake-type");
    assert.equal(both.project_id, "snake-project");
  });

  it("falls past an empty snake_case member to the camelCase one", () => {
    const { normalizeListEditorDefaults } = readers();
    const defaults = normalizeListEditorDefaults({ clientId: "camel-client", client_id: "" });

    assert.equal(defaults.client_id, "camel-client");
  });

  it("reaches the context only when neither spelling carried the member", () => {
    const { normalizeListEditorDefaults } = readers();
    const context = { clientId: "context-client", projectId: "context-project" };

    assert.equal(normalizeListEditorDefaults({ context }).client_id, "context-client");
    assert.equal(normalizeListEditorDefaults({ context }).project_id, "context-project");
    assert.equal(normalizeListEditorDefaults({ client_id: "own", context }).client_id, "own");
    assert.equal(normalizeListEditorDefaults({ context, projectId: "own" }).project_id, "own");
  });

  it("survives a context that is absent rather than refusing the bag", () => {
    const { normalizeListEditorDefaults } = readers();

    assert.equal(normalizeListEditorDefaults({ context: null }).client_id, "");
    assert.equal(normalizeListEditorDefaults({ context: undefined }).project_id, "");
  });

  it("carries the two free-text members through untouched", () => {
    const { normalizeListEditorDefaults } = readers();
    const defaults = normalizeListEditorDefaults({ description: "  spaced  ", title: "A Title" });

    assert.equal(defaults.description, "  spaced  ");
    assert.equal(defaults.title, "A Title");
  });
});

describe("Lists linked-target identity", () => {
  it("matches a staged target against the saved link it became", () => {
    const { sameListLinkTarget } = readers();
    const saved = { target_id: "task-1", target_type: "task" };
    const staged = { targetId: "task-1", targetType: "task" };

    assert.equal(sameListLinkTarget(saved, staged), true);
    assert.equal(sameListLinkTarget(staged, saved), true);
  });

  it("reads the nested target bag that no List contract names", () => {
    const { sameListLinkTarget } = readers();
    const nested = { target: { target_id: "note-9", target_type: "note" } };

    assert.equal(sameListLinkTarget(nested, { targetId: "note-9", targetType: "note" }), true);
    assert.equal(sameListLinkTarget(nested, { targetId: "note-9", targetType: "task" }), false);
  });

  it("prefers the outer spellings over the nested bag", () => {
    const { sameListLinkTarget } = readers();
    const conflicting = {
      target: { target_id: "nested", target_type: "note" },
      target_id: "outer",
      target_type: "task",
    };

    assert.equal(sameListLinkTarget(conflicting, { targetId: "outer", targetType: "task" }), true);
    assert.equal(sameListLinkTarget(conflicting, { targetId: "nested", targetType: "note" }), false);
  });

  it("separates two targets that share an identifier across types", () => {
    const { sameListLinkTarget } = readers();

    assert.equal(sameListLinkTarget(
      { targetId: "shared", targetType: "task" },
      { targetId: "shared", targetType: "note" },
    ), false);
  });

  it("calls two empty bags the same, which is what the staged list relies on", () => {
    const { sameListLinkTarget } = readers();

    assert.equal(sameListLinkTarget(), true);
    assert.equal(sameListLinkTarget({}, {}), true);
  });
});

describe("Lists link module lookup", () => {
  it("names a module for each of the four target types", () => {
    const { moduleIdForListLinkTarget } = readers();

    assert.equal(moduleIdForListLinkTarget("client"), "client-projects");
    assert.equal(moduleIdForListLinkTarget("project"), "client-projects");
    assert.equal(moduleIdForListLinkTarget("note"), "notes");
    assert.equal(moduleIdForListLinkTarget("task"), "tasks");
  });

  it("answers an empty string for a type it does not know", () => {
    const { moduleIdForListLinkTarget } = readers();

    assert.equal(moduleIdForListLinkTarget("timer"), "");
    assert.equal(moduleIdForListLinkTarget(""), "");
  });

  it("answers the same empty string for an absent type as it did for undefined", () => {
    const { moduleIdForListLinkTarget } = readers();

    // The `= ""` default this checkpoint added is the equivalence: the map has no `undefined`
    // key and no `""` key, so both lookups were already absent and both already fell to `""`.
    assert.equal(moduleIdForListLinkTarget(), "");
    assert.equal(moduleIdForListLinkTarget(undefined), "");
  });

  it("answers an inherited member for a type named after one, which is recorded rather than fixed", () => {
    const { moduleIdForListLinkTarget } = readers();

    // **Pre-existing and unchanged by this checkpoint.** The lookup is a plain object literal, so
    // a target type spelled like an `Object.prototype` member finds the inherited one and the
    // `|| ""` never fires. `target_type` reaches here from the wire, so this is reachable; it is
    // pinned rather than repaired because hardening it is a behaviour change this slice does not
    // authorise. Discharged by a null-prototype map or an own-property test, decided explicitly.
    assert.equal(typeof moduleIdForListLinkTarget("toString"), "function");
    assert.equal(typeof moduleIdForListLinkTarget("constructor"), "function");
    assert.equal(moduleIdForListLinkTarget("timer"), "");
  });
});

describe("Lists link payload", () => {
  it("names the three members the create route reads", () => {
    const { listLinkPayload } = readers();

    assert.deepEqual(plain(listLinkPayload({ moduleId: "tasks", targetId: "t-1", targetType: "task" })), {
      moduleId: "tasks",
      targetId: "t-1",
      targetType: "task",
    });
  });

  it("derives the module from the target type when the target carries none", () => {
    const { listLinkPayload } = readers();

    assert.equal(listLinkPayload({ targetId: "n-1", targetType: "note" }).moduleId, "notes");
    assert.equal(listLinkPayload({ moduleId: "", targetType: "project" }).moduleId, "client-projects");
  });

  it("answers an empty module for a target carrying neither", () => {
    const { listLinkPayload } = readers();

    assert.equal(listLinkPayload({}).moduleId, "");
    assert.equal(listLinkPayload().moduleId, "");
  });

  it("forwards the identifier and type without converting them", () => {
    const { listLinkPayload } = readers();
    const payload = listLinkPayload({ targetId: "", targetType: undefined });

    assert.equal(payload.targetId, "");
    assert.equal(payload.targetType, undefined);
  });
});

describe("Deferrals this checkpoint recorded", () => {
  it("leaves the identifier reader untyped while its consumer requires text", () => {
    // The reason: typing the bag honestly makes this return `{}` rather than `any`, and the
    // identifier then cannot reach a consumer that requires text. Discharged by a reader that
    // vouches for it as text, or by the published `params` type naming it.
    const reader = extractFunctionBlock(source, "readListEditorId");
    assert.ok(!/@param \{ListEditorParamsInput\}/.test(reader),
      "readListEditorId is annotated; its deferral is discharged and this pin should go with it");
    assert.match(source, /@param \{string\} listId @param \{BrowserListSummary \| null\} \[fallback\]/,
      "loadListDetail no longer requires text; re-decide the identifier reader's deferral");
  });

  it("leaves the editor opener's bag untyped while the record it forwards is not vouched for", () => {
    // The reason: `params.list` is forwarded straight to a dialog that requires a normalized
    // record, and nothing on this path validates it. Discharged by a reader that vouches for it.
    const opener = extractFunctionBlock(source, "openListEditor");
    assert.ok(/params\.list \|\| params\.record \|\| params\.listRecord/.test(opener),
      "the three record spellings changed; re-decide this deferral rather than re-pin it");
    // Anchored inside the dialog's own block rather than on the line before its declaration:
    // `0.33.33.43.30` added an `options` parameter after this one, which broke an anchor that
    // reached through to `function openListDialog` while the claim it guards was unchanged.
    const dialogAt = source.indexOf("function openListDialog(");
    const dialogBlock = source.slice(source.lastIndexOf("/**", dialogAt), dialogAt);
    assert.match(dialogBlock, /@param \{BrowserNormalizedListRecord \| null\} \[list\]/,
      "openListDialog no longer requires a normalized record; re-decide the opener's deferral");
  });

  it("leaves the field decorator untyped while it reads dataset off a query result", () => {
    // The reason: annotating the grid puts `Element` - which has no `dataset` - into two reads,
    // trading three parameter diagnostics for two DOM ones. Discharged by a typed field accessor
    // on the shared view factory, or by a narrowing this file can prove.
    const decorator = extractFunctionBlock(source, "decorateListEditorField");
    assert.ok(/\.querySelector\(/.test(decorator) && /\.dataset\[/.test(decorator),
      "the decorator no longer reads dataset off a query result; re-decide its deferral");
    assert.ok(!/@param \{/.test(decorator),
      "the decorator is annotated; its deferral is discharged and this pin should go with it");
  });
});
