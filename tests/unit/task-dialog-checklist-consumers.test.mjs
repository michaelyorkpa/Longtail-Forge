import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { FakeDocument, createFakeIconButtonFactory } from "../../scripts/test-support/fake-dom.mjs";

const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const document = new FakeDocument();
  const fields = {
    checklistField: document.createElement("details"), checklistList: document.createElement("div"),
    checklistStatus: document.createElement("p"), checklistInput: document.createElement("input"),
    checklistAdd: document.createElement("button"),
  };
  /** @type {unknown[][]} */ const events = [];
  const sandbox = vm.createContext({
    document, fields, namespace: { icons: { createIconButton: createFakeIconButtonFactory(document) } },
    currentTaskId: "task/id", currentTask: null,
    requireApi: () => ({
      putJson: async (/** @type {unknown[]} */ ...args) => { events.push(["put", ...args]); return "saved"; },
      deleteJson: async (/** @type {unknown[]} */ ...args) => { events.push(["delete", ...args]); return "removed"; },
      postJson: async (/** @type {unknown[]} */ ...args) => { events.push(["post", ...args]); return "moved"; },
    }),
    requireModalDialogs: () => ({ confirm: async (/** @type {{message: string}} */ options) => { events.push(["confirm", options.message]); return true; } }),
    setStatus: (/** @type {unknown[]} */ ...args) => events.push(["status", ...args]),
    applyChecklistResult: (/** @type {unknown} */ value) => events.push(["apply", value]),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ _error, /** @type {string} */ fallback) => fallback }), ...extra,
  });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "writeTaskControl", "callTaskContextCollection", "taskContextOptionItems", "writeChecklistFields", "checklistItemRow", "checklistActionButton", "checklistActionIcon", "checklistProgress", "formatChecklistProgress", "saveChecklistItemLabel", "deleteChecklistItem", "moveChecklistItem"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { sandbox, fields, events, document };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task checklist opaque consumers", () => {
  it("keeps unsaved gating, replacement, progress and first/last move boundaries", () => {
    const { sandbox: s, fields } = fixture();
    s.writeChecklistFields(null);
    assert.equal(fields.checklistInput.disabled, true);
    assert.equal(fields.checklistAdd.disabled, true);
    assert.equal(fields.checklistStatus.textContent, "Save the task before adding checklist items.");
    assert.equal(fields.checklistField.open, false);
    s.writeChecklistFields({ task_id: "saved", checklistItems: [
      { task_checklist_item_id: "a", label: "first", is_checked: true },
      { task_checklist_item_id: "b", label: "second", is_checked: false },
    ] });
    assert.equal(fields.checklistInput.disabled, false);
    assert.equal(fields.checklistAdd.disabled, false);
    assert.equal(fields.checklistStatus.textContent, "1 / 2 complete. Next: second");
    assert.equal(fields.checklistField.open, true);
    assert.equal(fields.checklistList.children.length, 2);
    const [first, last] = fields.checklistList.children;
    assert.equal(first.dataset.taskChecklistItem, "a");
    assert.equal(first.children[0].checked, true);
    assert.equal(first.children[1].value, "first");
    assert.equal(first.children[3].disabled, true);
    assert.equal(first.children[4].disabled, false);
    assert.equal(last.children[3].disabled, false);
    assert.equal(last.children[4].disabled, true);
    assert.deepEqual(first.children.slice(2).map((button) => button.dataset.taskChecklistAction), ["save", "up", "down", "delete"]);
    s.writeChecklistFields({ task_id: "saved", checklistItems: [] });
    assert.equal(fields.checklistList.children.length, 0);
    assert.equal(fields.checklistField.open, false);
  });

  it("does not read the task when the optional checklist surface is absent", () => {
    const { sandbox: s } = fixture({ fields: {} });
    s.writeChecklistFields(new Proxy({}, { get() { throw new Error("unused"); } }));
  });

  it("preserves inherited/changing property reads and refuses null rows at the original required access", () => {
    const { sandbox: s, fields } = fixture();
    let reads = 0;
    const item = Object.create({ task_checklist_item_id: "inherited", is_checked: 1, get label() { return ++reads === 1 ? "accessible" : "editable"; } });
    const row = s.checklistItemRow(item, 0, 1);
    assert.equal(row.children[0].getAttribute("aria-label"), "Mark accessible complete");
    assert.equal(row.children[1].value, "editable");
    assert.equal(reads, 2);
    fields.checklistStatus.textContent = "unchanged";
    assert.throws(() => s.writeChecklistFields({ task_id: "t", checklistItems: [null] }), { name: "TypeError" });
    assert.equal(fields.checklistStatus.textContent, "unchanged");
    assert.throws(() => s.checklistItemRow(null, 0, 1), { name: "TypeError" });
  });

  it("uses the actual array progress rules, truthiness, first incomplete row and opaque labels", () => {
    const { sandbox: s } = fixture();
    const label = { toString: () => "opaque" };
    const progress = s.checklistProgress([{ is_checked: "yes" }, { is_checked: 0, label }, { label: "later" }]);
    assert.equal(progress.total_count, 3);
    assert.equal(progress.completed_count, 1);
    assert.equal(progress.next_incomplete_item_label, label);
    assert.equal(s.formatChecklistProgress(progress), "1 / 3 complete. Next: opaque");
    assert.deepEqual(plain(s.checklistProgress({ length: 5 })), { total_count: 0, completed_count: 0, next_incomplete_item_label: "" });
    assert.equal(s.formatChecklistProgress(Object.create({ total_count: "3", completed_count: "2", next_incomplete_item_label: 8 })), "2 / 3 complete. Next: 8");
    assert.equal(s.formatChecklistProgress(null), "0 / 0 complete");
  });

  it("preserves custom map receiver, getter order, returned iterable and opaque length coercion", () => {
    const { sandbox: s, fields } = fixture();
    /** @type {string[]} */ const order = [];
    const replace = fields.checklistList.replaceChildren;
    Object.defineProperty(fields.checklistList, "replaceChildren", { get() {
      order.push("replace getter");
      return /** @this {unknown} */ function (/** @type {unknown[]} */ ...rows) { assert.equal(this, fields.checklistList); order.push("replace call"); return Reflect.apply(replace, this, rows); };
    } });
    const items = {
      get length() { order.push("length"); return { [Symbol.toPrimitive](/** @type {string} */ hint) { order.push(`coerce ${hint}`); return 1; } }; },
      get map() { order.push("map getter"); return /** @this {unknown} */ function (/** @type {(item: unknown, index: string) => unknown} */ callback) {
        assert.equal(this, items); order.push("map call");
        // A host map may supply a non-number index; preserve strict equality in the row.
        const row = callback({ label: "host" }, "0");
        return { *[Symbol.iterator]() { order.push("iterate"); yield row; } };
      }; },
    };
    s.writeChecklistFields({ task_id: "t", checklistItems: items, checklistProgress: {} });
    assert.deepEqual(order, ["replace getter", "map getter", "map call", "length", "coerce number", "iterate", "replace call", "length", "coerce number"]);
    assert.equal(fields.checklistList.children[0].children[3].disabled, false);
    assert.equal(fields.checklistList.children[0].children[4].disabled, true);
    assert.equal(fields.checklistField.open, true);
  });

  it("retains map/iterator failures after gating and status, before replacement and open", () => {
    for (const items of [{ map: 7 }, { map: () => 7 }, { map: () => ({ [Symbol.iterator]: () => 7 }) }]) {
      const { sandbox: s, fields, document } = fixture();
      const old = document.createElement("span"); fields.checklistList.append(old);
      fields.checklistField.open = true;
      assert.throws(() => s.writeChecklistFields({ task_id: "t", checklistItems: items, checklistProgress: {} }), { name: "TypeError" });
      assert.equal(fields.checklistInput.disabled, false);
      assert.equal(fields.checklistStatus.textContent, "0 / 0 complete");
      assert.equal(fields.checklistList.children[0], old);
      assert.equal(fields.checklistField.open, true);
    }
  });

  it("saves trimmed text once and keeps post-write projection failure in the existing catch", async () => {
    const { sandbox: s, events } = fixture();
    await s.saveChecklistItemLabel({ querySelector: () => ({ value: "  renamed  " }) }, "item/id");
    assert.deepEqual(plain(events), [["status", "Saving checklist item..."], ["put", "/api/tasks/task%2Fid/checklist/item%2Fid", { label: "renamed" }], ["apply", "saved"], ["status", ""]]);
    events.length = 0;
    s.applyChecklistResult = () => { throw new Error("after write"); };
    await s.saveChecklistItemLabel({ querySelector: () => ({ value: "x" }) }, "i");
    assert.deepEqual(plain(events).at(-1), ["status", "Checklist item was not saved.", { isError: true }]);
    assert.equal(events.filter((event) => event[0] === "put").length, 1);
  });

  it("keeps custom trim receiver and opaque result identity without validating or coercing it", async () => {
    const { sandbox: s, events } = fixture();
    const result = { carried: true };
    const value = { trim() { assert.equal(this, value); return result; } };
    await s.saveChecklistItemLabel({ querySelector: () => ({ value }) }, "i");
    const payload = events[1][2];
    assert.ok(payload !== null && typeof payload === "object" && "label" in payload);
    assert.equal(payload.label, result);
  });

  it("keeps missing input optional, empty input focus receiver and one getter read", async () => {
    const { sandbox: s, events } = fixture();
    await s.saveChecklistItemLabel({ querySelector: () => null }, "i");
    assert.equal(events.length, 0);
    let reads = 0; let calls = 0;
    const input = { value: "   ", get focus() { reads++; return /** @this {unknown} */ function () { assert.equal(this, input); calls++; }; } };
    await s.saveChecklistItemLabel({ querySelector: () => input }, "i");
    assert.equal(reads, 1); assert.equal(calls, 1); assert.equal(events.length, 0);
  });

  it("does not turn malformed trim/focus into a save or move their failure into the status catch", async () => {
    for (const input of [{ value: null }, { value: { trim: 7 } }, { value: "", focus: 7 }]) {
      const { sandbox: s, events } = fixture();
      await assert.rejects(s.saveChecklistItemLabel({ querySelector: () => input }, "i"), { name: "TypeError" });
      assert.equal(events.length, 0);
    }
  });

  it("keeps confirmation fallback, cancellation, inherited label and delete ordering", async () => {
    const { sandbox: s, events } = fixture();
    await s.deleteChecklistItem({ querySelector: () => null }, "item/id");
    assert.deepEqual(plain(events), [["confirm", 'Remove "this checklist item" from this task?'], ["status", "Removing checklist item..."], ["delete", "/api/tasks/task%2Fid/checklist/item%2Fid"], ["apply", "removed"], ["status", ""]]);
    events.length = 0;
    s.requireModalDialogs = () => ({ confirm: async (/** @type {{message: string}} */ options) => { assert.equal(options.message, 'Remove "host" from this task?'); return false; } });
    await s.deleteChecklistItem({ querySelector: () => Object.create({ value: "host" }) }, "i");
    assert.equal(events.length, 0);
  });

  it("keeps all action labels/icons and the required icon provider failure", () => {
    const { sandbox: s } = fixture();
    for (const action of ["save", "up", "down", "delete"]) {
      const button = s.checklistActionButton(action, `Label ${action}`);
      assert.equal(button.dataset.icon, action);
      assert.equal(button.dataset.taskChecklistAction, action);
      assert.equal(button.getAttribute("aria-label"), `Label ${action}`);
      assert.equal(button.type, "button");
    }
    s.namespace.icons = undefined;
    assert.throws(() => s.checklistActionButton("save", "Save"), /require LongtailForge.icons.createIconButton/);
  });
});
