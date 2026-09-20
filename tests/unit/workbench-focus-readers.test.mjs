import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({
    state: { activeTaskFocus: null },
    document: { createElement: () => ({ dataset: {}, textContent: "", className: "" }) },
  });
  for (const name of ["looksLikeRawId", "safeCandidateText", "safeTaskFocusText", "formatToken", "formatCandidateDate", "badge", "taskFocusFromCandidate", "taskFocusBadges", "taskFocusDueText", "taskFocusContextLabel", "taskFocusTagBadges"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}

it("renders badge order and defaults from the real candidate producer and a partial task", () => {
  const f = fixture();
  f.state.activeTaskFocus = f.taskFocusFromCandidate({ title: "Work", status: "blocked", priority: "high", dueAt: "2026-09-20T13:00:00Z" }, "task");
  const badges = f.taskFocusBadges({ directTags: [{ name: "First" }, { slug: "second" }] });
  assert.deepEqual(Array.from(badges, b => [b.textContent, b.dataset.badgeType]), [["Blocked", "blocked"], ["High", "high"], ["Due 2026-09-20", "due"], ["First", "tag"], ["second", "tag"]]);
  assert.deepEqual(Array.from(f.taskFocusBadges({}, null), b => b.textContent), ["Open", "Normal"]);
  assert.deepEqual(Array.from(f.taskFocusBadges({ status: "complete", priority: "low" }), b => b.textContent).slice(0, 2), ["Complete", "Low"]);
});

it("keeps date/time precedence, candidate fallback and explicit empty text", () => {
  const f = fixture();
  assert.equal(f.taskFocusDueText({ due_date: " 2026-10-01 ", due_time: " 10:30 " }, { dueAt: "ignored" }), "2026-10-01 10:30");
  assert.equal(f.taskFocusDueText({ due_date: "2026-10-01" }), "2026-10-01");
  assert.equal(f.taskFocusDueText({ due_time: "10:30" }, { dueAt: "2026-11-02T12:00Z" }), "2026-11-02");
  assert.equal(f.taskFocusDueText(), "No due date");
  assert.equal(f.taskFocusDueText({}, null, { empty: "" }), "");
  assert.equal(f.taskFocusDueText({ due_date: { toString: () => " 2026-10-03 " }, due_time: 123 }), "2026-10-03 123");
  assert.equal(f.taskFocusDueText({ due_date: 0, due_time: false }), "No due date");
});

it("retains safe context labels and never substitutes raw ids", () => {
  const f = fixture(), id = "7e759b75-1111-4444-8888-abcde0123456";
  assert.equal(f.taskFocusContextLabel({ client_name: " Client ", project_name: " Project " }, { contextLabel: "fallback" }), "Client / Project");
  assert.equal(f.taskFocusContextLabel({ client_name: id, project_name: "Project" }), "Project");
  assert.equal(f.taskFocusContextLabel({}, { contextLabel: "Fallback" }), "Fallback");
  assert.equal(f.taskFocusContextLabel({}, { contextLabel: id }), "");
  assert.equal(f.taskFocusContextLabel(), "");
  assert.equal(f.taskFocusContextLabel({ client_name: { toString: () => "Opaque client" }, project_name: 0 }), "Opaque client");
});

it("keeps both tag vocabularies, empty-array precedence and hidden-label filtering", () => {
  const f = fixture(), labels = (/** @type {unknown} */ task) => Array.from(f.taskFocusTagBadges(task), b => b.textContent);
  assert.deepEqual(labels({ directTags: [{ name: "primary" }], direct_tags: [{ name: "legacy" }] }), ["primary"]);
  assert.deepEqual(labels({ directTags: [], direct_tags: [{ name: "legacy" }] }), ["legacy"]);
  assert.deepEqual(labels({ directTags: 4, direct_tags: [{ slug: "slug" }, { name: "7e759b75-1111-4444-8888-abcde0123456" }, {}] }), ["slug"]);
  assert.deepEqual(labels({ directTags: [{ name: "" }], direct_tags: [{ name: "not selected" }] }), []);
  assert.deepEqual(labels({ directTags: [4, false, "text"] }), []);
});

it("preserves inherited tag getters, short-circuit reads, primitive receivers and thrown values", () => {
  const f = fixture();
  /** @type {string[]} */ const reads = [];
  const tag = Object.create({ get name() { assert.equal(this, tag); reads.push("name"); return "Name"; }, get slug() { return assert.fail("unused slug"); } });
  assert.equal(f.taskFocusTagBadges({ directTags: [tag] })[0].textContent, "Name");
  assert.deepEqual(reads, ["name"]);
  vm.runInContext('Object.defineProperty(Number.prototype, "name", { configurable: true, get() { "use strict"; if (this !== 7) throw new Error("boxed receiver"); return "Seven"; } });', f);
  assert.equal(f.taskFocusTagBadges({ directTags: [7] })[0].textContent, "Seven");
  const failure = new Error("getter");
  assert.throws(() => f.taskFocusTagBadges({ directTags: [{ get name() { throw failure; } }] }), e => e === failure);
  for (const value of [null, undefined]) assert.throws(() => f.taskFocusTagBadges({ directTags: [value] }), { name: "TypeError", message: "Task Focus tag is unavailable." });
});

it("forwards opaque badge values to their own setters in order, with the original truthy guard", () => {
  const f = fixture(), raw = {};
  /** @type {unknown[]} */ const writes = [];
  const dataset = { set badgeType(/** @type {unknown} */ value) { writes.push([this === dataset, value]); } };
  const element = { className: "", dataset, set textContent(/** @type {unknown} */ value) { writes.push([this === element, value]); } };
  f.document.createElement = () => element;
  assert.equal(f.badge(raw, raw), element);
  assert.deepEqual([...writes], [[true, raw], [true, raw]]);
  writes.length = 0; f.badge(raw, false); assert.deepEqual([...writes], [[true, raw]]);
  const failure = new Error("dataset setter");
  Object.defineProperty(dataset, "badgeType", { set() { throw failure; } });
  writes.length = 0; assert.throws(() => f.badge(raw, raw), error => error === failure);
  assert.deepEqual([...writes], []);
});
