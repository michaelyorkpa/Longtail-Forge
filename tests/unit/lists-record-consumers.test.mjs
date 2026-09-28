import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(readFileSync("tests/fixtures/lists-record-consumers/baseline.json", "utf8"));
/** @param {boolean} before */
function fixture(before) {
  const sandbox = vm.createContext({ window: {}, URLSearchParams });
  vm.runInContext(readFileSync("public/js/shared/error-contract.js", "utf8"), sandbox);
  vm.runInContext(baseline.constants.join("\n"), sandbox);
  vm.runInContext(`
    const state = { lists: [], selectedListId: "current-selection", editingListId: "not-the-record" };
    const statuses = [], requests = [], trace = [];
    let refreshes = 0;
    const api = {
      getJson: async () => ({}),
      postJson: async (...args) => { requests.push(["POST", ...args]); return {}; },
      deleteJson: async (...args) => { requests.push(["DELETE", ...args]); return {}; },
    };
    function requireApi() { trace.push("api"); return api; }
    function setStatus(...args) { statuses.push(args); }
    async function refreshLists() { refreshes++; }
    function node(tag) { return { tag, textContent: "", setAttribute(k,v) { this[k] = v; } }; }
    const document = { createElement: node, createTextNode: text => ({ text }) };
    function requireView() { return { createElement: (tag, options) => ({ tag, dataset: {}, ...options }) }; }
    function nextNeededDate() { return ""; }
    function listContextLabel() { return "Workspace"; }
    function compactStateSummary() { return "summary"; }
    function itemSummary() { return "0/0"; }
    function listBadges() { return []; }
    function listDescriptionExcerpt() { return ""; }
    function linkedRecordSummary() { return ""; }
    function listTimelineSummary() { return ""; }
    function listCostSummary() { return ""; }
    function listsActionStripSurfaceDescriptor() { return { actions: ["duplicate-list", "edit-list", "complete-list", "finalize-list", "reopen-list", "archive-list", "restore-list", "delete-list", "mark-reusable-list"].map(id => ({ id })) }; }
    function listWorkflowActionButton(action, list, options) { return { id: action?.id, record: list, options }; }
    function duplicateActionLabel() { return "Duplicate"; }
    function selectedList() { return state.lists[0]; }
    function renderDetail() { trace.push("render"); }
    function collapseIndexAfterSelection() {}
    function updateListSelectionState() {}
    window.location = { search: "?keep=yes", pathname: "/lists.html" };
    window.history = { replaceState(...args) { trace.push(args); } };
  `, sandbox);
  for (const name of Object.keys(baseline.functions)) vm.runInContext(before ? baseline.functions[name] : extractFunctionBlock(source, name), sandbox);
  if (!before) vm.runInContext(extractFunctionBlock(source, "isFinalizableListStatus"), sandbox);
  return sandbox;
}
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Lists optional normalized records", () => {
  it("keeps the real unreadable-success normalization and retained incomplete record", async () => {
    for (const before of [true, false]) {
      const f = fixture(before);
      const pending = vm.runInContext(`(async () => {
        const record = await loadListDetail("saved", { list_id: "saved", status: "active", list_type: "checklist" });
        state.lists = [record].filter(isLoadedListRecord);
        const retained = state.lists[0] === record;
        await runAction("complete-list", record);
        return { retained, id: record.list_id, status: record.status, type: record.list_type, requests };
      })()`, f);
      await assert.doesNotReject(pending, "a present incomplete record must still reach its own action route");
      const observed = await pending;
      assert.equal(observed.retained, true);
      assert.equal(observed.id, undefined);
      assert.equal(observed.status, undefined);
      assert.equal(observed.type, undefined);
      assert.deepEqual(plain(observed.requests), [["POST", "/api/lists/undefined/complete", {}]]);
    }
  });

  it("reports the approved missing-record message through the real handler and error helper", async () => {
    for (const before of [true, false]) {
      const f = fixture(before);
      const observed = await vm.runInContext(`(async () => {
        await handleDetailClick({ target: { closest() { return { dataset: { listId: "unmatched", listAction: "complete-list" } }; } } });
        return { statuses, requests, refreshes, trace };
      })()`, f);
      assert.deepEqual(plain(observed.statuses), [["Saving..."], [before ? "Cannot read properties of undefined (reading 'list_id')" : "The list action no longer has a record to read.", true]]);
      assert.deepEqual(plain(observed.requests), []);
      assert.equal(observed.refreshes, 0);
      assert.deepEqual(plain(observed.trace), ["api"]);
    }
    const f = fixture(false);
    await assert.rejects(vm.runInContext('runAction("complete-list", undefined)', f), { name: "TypeError", message: "The list action no longer has a record to read." });
  });

  it("preserves all seven consumers for complete and incomplete records", async () => {
    for (const status of [undefined, "active", "completed", "archived", "deleted", "finalized", "unknown-status"]) {
      const observed = [];
      for (const before of [true, false]) {
        const f = fixture(before);
        f.status = status;
        observed.push(plain(await vm.runInContext(`(async () => {
          const record = normalizeListRecord({ list_id: status === undefined ? undefined : "own/id", status, list_type: status === undefined ? undefined : "checklist" });
          const index = listIndexItem(record);
          state.lists = [record]; index.onSelect();
          const actions = detailActionButtons(record, false);
          const identity = actions.every(action => action.record === record);
          const meta = detailMetaItems(record);
          const summary = listState(record), readonly = readOnlyStateMessage(record);
          await runAction("complete-list", record);
          await runAction("delete-list", record);
          return { index, actions, identity, meta, summary, readonly, requests, selected: state.selectedListId };
        })()`, f)));
      }
      assert.deepEqual(observed[1], observed[0]);
      assert.equal(observed[1].identity, true);
    }
  });

  it("keeps property getter order and receivers at the URI and label sinks", async () => {
    const observed = [];
    for (const before of [true, false]) {
      const f = fixture(before);
      observed.push(plain(await vm.runInContext(`(async () => {
        const reads = [];
        const record = normalizeListRecord();
        for (const key of ["list_id", "status", "list_type"]) Object.defineProperty(record, key, { get() { reads.push([key, this === record]); return undefined; } });
        listIndexItem(record); detailActionButtons(record, false); detailMetaItems(record); listState(record); readOnlyStateMessage(record);
        await runAction("complete-list", record);
        return { reads, requests };
      })()`, f)));
    }
    assert.deepEqual(observed[1], observed[0]);
  });

  it("keeps reorder identity, order, deleted filtering and refusal at the ends", async () => {
    const observed = [];
    for (const before of [true, false]) {
      const f = fixture(before);
      observed.push(plain(await vm.runInContext(`(async () => {
        const a = { list_item_id: "a" }, b = { list_item_id: "b" };
        const record = { list_id: "own/id", items: [a, { list_item_id: "deleted", deleted_at: "yes" }, b] };
        await moveItem(record, "a", -1); await moveItem(record, "missing", 1);
        await moveItem(record, "b", -1);
        return { requests, identity: record.items[0] === a && record.items[2] === b };
      })()`, f)));
    }
    assert.deepEqual(observed[1], observed[0]);
    assert.equal(observed[1].identity, true);
    assert.deepEqual(observed[1].requests, [["POST", "/api/lists/own%2Fid/items/reorder", { items: [{ list_item_id: "b", sort_order: 0 }, { list_item_id: "a", sort_order: 10 }] }]]);
  });
});
