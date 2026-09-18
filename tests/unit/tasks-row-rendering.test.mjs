import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";

const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const document = new FakeDocument();
  const s = vm.createContext({ document, URLSearchParams, ...extra });
  for (const name of ["taskRowField", "optionalTaskRowField", "mergeTasksById", "nestedTaskDisplayRows", "appendParentTaskChip", "truncateTaskName", "checklistProgressText", "blockingSummaryText", "taskActionIcon", "readAttachmentCounts", "loadAttachmentCounts", "loadNoteCounts", "appendTaskContext", "taskContextSummaryFallback", "taskContextBadge", "appendAttachmentCount", "appendNoteCount"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, document };
}

describe("Tasks row projections and ordering", () => {
  it("merges by identity with first insertion order and last value, skipping missing IDs", () => {
    const { s } = fixture();
    const a = { task_id: "a" }, b = { task_id: "b" }, replacement = { task_id: "a" }, c = { task_id: "c" };
    const result = s.mergeTasksById([a, b], [replacement, {}, c]);
    assert.equal(result.length, 3);
    assert.equal(result[0], replacement);
    assert.equal(result[1], b);
    assert.equal(result[2], c);
    assert.deepEqual(plain(s.mergeTasksById(null, undefined)), []);
  });

  it("keeps hierarchy order, legacy parents, orphans, self links and cycles without cloning rows", () => {
    const { s } = fixture();
    const tasks = [
      { task_id: "child", parent_task: { task_id: "parent" } },
      { task_id: "grandchild", parent_task_id: "child" },
      { task_id: "parent" }, { task_id: "orphan", parentTask: { task_id: "missing" } },
      { task_id: "self", parentTask: { task_id: "self" } },
      { task_id: "cycle1", parentTask: { task_id: "cycle2" } },
      { task_id: "cycle2", parentTask: { task_id: "cycle1" } },
    ];
    s.tasks = tasks;
    const rows = vm.runInContext("nestedTaskDisplayRows(tasks)", s, { timeout: 1000 });
    assert.deepEqual(plain(rows.map((/** @type {{task:{task_id:string},depth:number}} */ row) => [row.task.task_id, row.depth])), [
      ["parent", 0], ["child", 1], ["grandchild", 2], ["orphan", 0], ["self", 0], ["cycle1", 0], ["cycle2", 1],
    ]);
    for (const row of rows) assert.equal(row.task, tasks.find((task) => task.task_id === row.task.task_id));
  });

  it("preserves short-circuit parent reads, opaque ID identity and parent-chip placement", async () => {
    /** @type {unknown[][]} */ const opens = [];
    const { s, document } = fixture({ requireView: () => ({}), openTaskDialogById: (/** @type {unknown[]} */ ...args) => opens.push(args) });
    const id = { opaque: true };
    /** @type {string[]} */ const reads = [];
    const parent = { get task_id() { reads.push("id"); return id; }, get title() { reads.push("title"); return "  Parent  "; } };
    const task = { get parentTask() { reads.push("parent"); return parent; }, get parent_task() { throw new Error("short circuit lost"); }, next_action: "Next step" };
    const container = document.createElement("div");
    s.appendTaskContext(container, task);
    assert.deepEqual(reads, ["parent", "id", "title"]);
    assert.equal(container.children[0]?.textContent, "Child of: Parent");
    assert.equal(container.children[1]?.className, "task-context-summary");
    assert.equal(container.children[1]?.children[0]?.textContent, "Next: Next step");
    await container.children[0]?.click();
    assert.equal(opens[0]?.[0], id);
    assert.equal(opens[0]?.[1], container.children[0]);
    const absent = document.createElement("div");
    s.appendParentTaskChip(absent, { parentTask: 7 });
    assert.equal(absent.children.length, 0);
  });

  it("keeps inherited projection getters, primitive receivers and the two next-label reads", () => {
    const { s } = fixture();
    assert.equal(s.checklistProgressText(), "");
    assert.equal(s.checklistProgressText(7), "");
    assert.equal(s.blockingSummaryText({ incomplete_blocking_child_count: "2" }), "2 children");
    assert.equal(s.blockingSummaryText({ incomplete_blocking_child_count: 1 }), "1 child");
    /** @type {string[]} */ const order = [];
    const progress = Object.create({
      get total_count() { assert.equal(this, progress); order.push("total"); return "3"; },
      get completed_count() { order.push("completed"); return 1; },
      get next_incomplete_item_label() { order.push("next"); return order.length === 3 ? "first" : "second"; },
    });
    assert.equal(s.checklistProgressText(progress), "1/3, next: second");
    assert.deepEqual(order, ["total", "completed", "next", "next"]);
    vm.runInContext(`
      Object.defineProperty(Number.prototype, "total_count", { get() { "use strict"; globalThis.receiver = this; return 2; } });
    `, s);
    assert.equal(s.checklistProgressText(7), "0/2");
    assert.equal(s.receiver, 7);
    const failure = new Error("conversion failure");
    assert.throws(() => s.checklistProgressText({ total_count: { valueOf() { throw failure; } } }), (error) => error === failure);
    assert.throws(() => s.checklistProgressText(null), { name: "TypeError", message: "Task row fields are unavailable." });
    assert.throws(() => s.blockingSummaryText(null), { name: "TypeError", message: "Task row fields are unavailable." });
  });

  it("retains own and inherited icon lookup answers", () => {
    const { s } = fixture();
    for (const [label, icon] of [["Archive", "archive"], ["Edit", "edit"], ["Copy Link", "copy"], ["unlisted", "more"]]) assert.equal(s.taskActionIcon(label), icon);
    assert.equal(s.taskActionIcon("toString"), vm.runInContext("Object.prototype.toString", s));
    assert.equal(s.taskActionIcon("__proto__"), vm.runInContext("Object.prototype", s));
  });

  it("keeps attachment requests batched in input order and returns the reader's tally by identity", async () => {
    /** @type {unknown[][]} */ const calls = [];
    const tally = { b: 2, a: 0 };
    const api = { getJson: async (/** @type {unknown[]} */ ...args) => { calls.push(args); return { counts: tally }; } };
    const { s } = fixture({ requireApi: () => api });
    assert.equal(await s.loadAttachmentCounts([{ task_id: "b" }, {}, { task_id: "a" }, { task_id: "b" }]), tally);
    assert.equal(calls.length, 1);
    const url = new URL(String(calls[0]?.[0]), "https://example.test");
    assert.equal(url.pathname, "/api/files/attachments/counts");
    assert.deepEqual([...url.searchParams], [["moduleId", "tasks"], ["targetType", "task"], ["targetIds", "b,a,b"]]);
    assert.deepEqual(plain(calls[0]?.[1]), { cache: "no-store" });
    assert.deepEqual(plain(await s.loadAttachmentCounts([])), {});
    assert.equal(calls.length, 1);
    s.requireApi = () => ({ getJson: async () => ({ counts: { a: -1 } }) });
    assert.deepEqual(plain(await s.loadAttachmentCounts([{ task_id: "a" }])), {});
    s.requireApi = () => ({ getJson: async () => { throw new Error("offline"); } });
    assert.deepEqual(plain(await s.loadAttachmentCounts([{ task_id: "a" }])), {});
    const failure = new Error("missing API");
    s.requireApi = () => { throw failure; };
    await assert.rejects(s.loadAttachmentCounts([]), (error) => error === failure);
  });

  it("loads note counts concurrently and isolates each failed request or unreadable panel", async () => {
    /** @type {Map<string, (value: unknown) => void>} */ const pending = new Map();
    /** @type {string[]} */ const calls = [];
    const { s } = fixture({
      requireApi: () => ({ getJson: (/** @type {string} */ path, /** @type {unknown} */ options) => {
        const url = new URL(path, "https://example.test");
        assert.equal(url.pathname, "/api/notes/for-target");
        assert.equal(url.searchParams.get("moduleId"), "tasks");
        assert.equal(url.searchParams.get("targetType"), "task");
        assert.deepEqual(plain(options), { cache: "no-store" });
        const id = url.searchParams.get("targetId") || "";
        calls.push(id);
        if (id === "failed") return Promise.reject(new Error("offline"));
        return new Promise((resolve) => pending.set(id, resolve));
      } }),
      requireNotesLinkedPanel: () => ({ readForTarget: (/** @type {unknown} */ result) => result }),
    });
    const loading = s.loadNoteCounts([{}, { task_id: "a" }, { task_id: "bad" }, { task_id: "failed" }, { task_id: "b" }]);
    assert.deepEqual(calls, ["a", "bad", "failed", "b"]);
    pending.get("b")?.({ count: 2 });
    pending.get("bad")?.(null);
    pending.get("a")?.({ count: 1 });
    assert.deepEqual(plain(await loading), { failed: 0, b: 2, bad: 0, a: 1 });
  });

  it("renders file and note counts without changing the selected task identity", async () => {
    /** @type {unknown[][]} */ const opens = [];
    const { s, document } = fixture({ state: { attachmentCounts: { a: 2 }, noteCounts: { a: 1 } }, openTaskDialog: (/** @type {unknown[]} */ ...args) => opens.push(args) });
    const container = document.createElement("div"), task = { task_id: "a" };
    s.appendAttachmentCount(container, task);
    s.appendNoteCount(container, task);
    assert.equal(container.children[0]?.textContent, "2 files");
    assert.equal(container.children[1]?.textContent, "1 note");
    await container.children[1]?.click();
    assert.equal(opens[0]?.[0], task);
    assert.deepEqual(plain(opens[0]?.[1]), { focusNotes: true });
    s.appendAttachmentCount(container, { task_id: "absent" });
    s.appendNoteCount(container, { task_id: "absent" });
    assert.equal(container.children.length, 2);
  });
});
