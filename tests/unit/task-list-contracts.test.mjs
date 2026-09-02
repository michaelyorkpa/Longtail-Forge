// Runtime proof for the task collection and list envelope.
//
// The preflight for this child said the list element was `BrowserTaskDetail`. **The producer
// refutes that.** `attachTaskListProjectionDetails` adds five members where `attachTaskDetails`
// adds ten, it never loads `checklistItems`, `recurrenceContinuity`, `recurrenceDetails`,
// `recurrenceRecovery` or `reminderDetails` - that is the whole point of the list projection - and
// it carries `parentTask`, which no detail route sends. Five shared, five detail-only, five
// list-only: two records, both extending `BrowserTaskRecord`, neither extending the other.
//
// Producer authority is read from `tasks.service.js` and `tags.service.js`; contract authority from
// the browser declaration; the runtime from the shared module. Breaking any one leaves the others
// standing, and no expected answer is derived from the source under test.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/modules/tasks/tasks.service.js");
const tagsSource = readText("src/services/tags.service.js");
const usersRepoSource = readText("src/repositories/users.repo.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const sharedSource = readText("public/js/shared/task-records.js");
const tasksPage = readText("public/js/tasks.js");

const shared = sandbox(sharedSource,
  ["isResponseRecord", "isTaskAssignee", "isTaskRecord", "isTaskDetail", "isTaskListItem",
    "isTaskListPagination", "isTaskListOptions", "readTaskList", "readBulkTasks"],
  ["TASK_TEXT_MEMBERS", "TASK_DETAIL_MEMBERS", "TASK_DETAIL_ARRAYS", "ASSIGNEE_MEMBERS",
    "TASK_LIST_MEMBERS", "TASK_LIST_TAG_MEMBERS", "TASK_PAGINATION_NUMBERS",
    "TASK_OPTION_COLLECTIONS", "TASK_OPTION_TEXT_LISTS", "TASK_OPTION_FLAGS"]);

describe("the list element against the detail record", () => {
  it("describes exactly the five members the list projection adds", () => {
    const block = extractFunctionBlock(serviceSource, "attachTaskListProjectionDetails");
    const added = new Set([...block.matchAll(/^\s{6}([a-zA-Z]\w*)[:,]/gm)].map((entry) => entry[1]));
    added.delete("resumeContext");
    assert.deepEqual([...added].sort(), ["checklistProgress", "completionMetrics", "parentTask", "relationshipSummary"],
      "the projection builds four members in its first literal");
    assert.match(block, /resumeContext: taskResumeContext\(taskWithListDetails\),/,
      "and adds resumeContext over that, which makes five");
    assert.deepEqual(plain(shared.TASK_LIST_MEMBERS).slice().sort(),
      [...added, "resumeContext"].sort(),
      "the browser checks exactly those five");
  });

  it("is a different record from the detail one, in both directions", () => {
    const listOnly = declaredMembers("BrowserTaskListItem");
    const detailOnly = declaredMembers("BrowserTaskDetail");
    for (const absent of ["checklistItems", "recurrenceContinuity", "recurrenceDetails",
      "recurrenceRecovery", "reminderDetails"]) {
      assert.ok(detailOnly.includes(absent), `${absent} is part of the detail record`);
      assert.ok(!listOnly.includes(absent),
        `${absent} is exactly what the list projection avoids loading and must never be required here`);
      assert.doesNotMatch(extractFunctionBlock(serviceSource, "attachTaskListProjectionDetails"),
        new RegExp(`\\b${absent}\\b`), `the projection must not start producing ${absent}`);
    }
    assert.ok(listOnly.includes("parentTask"), "parentTask is the list-only member");
    assert.ok(!detailOnly.includes("parentTask"), "and no detail route sends it");
    assert.equal(shared.isTaskDetail(listFixture()), false, "a list item is not a detail record");
    assert.equal(shared.isTaskListItem(detailFixture()), false, "and a detail record is not a list item");
    assert.equal(shared.isTaskRecord(listFixture()), true, "both are still base records");
  });

  it("treats the tag members as optional because the decorator genuinely skips them", () => {
    const block = extractFunctionBlock(tagsSource, "decorateRecordsForTarget");
    assert.match(block, /if \([\s\S]*!\(await tagsModuleReadable\(session\)\)\) \{\n\s+return[\s\S]*records/,
      "an unreadable tags module returns the records untouched, so no tag member is added at all");
    const untagged = omitAll(listFixture(), plain(shared.TASK_LIST_TAG_MEMBERS));
    assert.equal(shared.isTaskListItem(untagged), true,
      "a workspace with tags disabled must still see its tasks");
    for (const member of plain(shared.TASK_LIST_TAG_MEMBERS)) {
      assert.match(declarationBlock("BrowserTaskListItem"), new RegExp(`\\n  ${member}\\?: unknown\\[\\];`),
        `${member} is optional, and the runtime condition is why`);
      assert.equal(shared.isTaskListItem({ ...listFixture(), [member]: "tag" }), false,
        `${member} is still checked when it is present`);
    }
  });

  it("requires the five projection members it always receives", () => {
    assert.equal(shared.isTaskListItem(listFixture()), true);
    assert.equal(shared.isTaskListItem({ ...listFixture(), parentTask: null }), true,
      "an unreadable parent is null by design, which is a value rather than an absence");
    for (const member of plain(shared.TASK_LIST_MEMBERS)) {
      assert.equal(shared.isTaskListItem(omit(listFixture(), member)), false, `${member} is always added`);
      assert.match(declarationBlock("BrowserTaskListItem"), new RegExp(`\\n  ${member}: unknown;`),
        `${member} is another producer's shape and is not named here`);
    }
    assert.equal(shared.isTaskListItem({ ...listFixture(), task_id: "" }), false,
      "the base record is checked too, and it is checked by the parser 0.33.33.38.4.3.1 landed");
  });
});

describe("the list envelope", () => {
  it("describes what the route builds, without the timers it drops", () => {
    const listBlock = extractFunctionBlock(serviceSource, "list");
    assert.match(listBlock, /return \{\n\s+tasks,\n\s+currentUserId: session\.user_id,\n\s+options,\n\s+pagination,\n\s+\};/,
      "list rebuilds a four-member envelope from what queryTasks answered");
    assert.match(extractFunctionBlock(serviceSource, "queryTasksResult"), /\n\s+timers,\n/,
      "queryTasksResult does carry timers, which is why dropping them has to be asserted");
    assert.deepEqual(declaredMembers("BrowserTaskListEnvelope").slice().sort(),
      ["currentUserId", "options", "pagination", "tasks"]);
    assert.doesNotMatch(declarationBlock("BrowserTaskListEnvelope"), /\n  timers/,
      "the task timers reach the page from their own route and are 0.33.33.38.4.3.C's");
  });

  it("reads one envelope for all three loaders, because they share one helper", () => {
    const loader = extractFunctionBlock(tasksPage, "loadCanonicalTasks");
    assert.match(loader, /api\.getJson\(query \? `\/api\/tasks\?\$\{query\}` : "\/api\/tasks"/,
      "one route, and only the query string differs between the three callers");
    const calls = [...tasksPage.matchAll(/readTaskList\(await loadCanonicalTasks\(/g)];
    assert.equal(calls.length, 3, "the first load, the refresh and the cursor page all narrow here");
  });

  it("drops a malformed task rather than emptying the list", () => {
    const good = listFixture();
    const read = plain(shared.readTaskList({
      currentUserId: "u-1",
      options: optionsFixture(),
      pagination: paginationFixture(),
      tasks: [good, { task_id: "t-2" }, null, "task", detailFixture()],
    }));
    assert.deepEqual(read.tasks, [good],
      "an array of tasks does not make its entries tasks, and a detail record is not a list item");
    assert.equal(read.currentUserId, "u-1");
    assert.deepEqual(read.options, optionsFixture());
    assert.deepEqual(read.pagination, paginationFixture());
  });

  it("answers the absences both consumers already handled", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { tasks: null }, { tasks: {} }]) {
      const read = shared.readTaskList(empty);
      assert.deepEqual(plain(read.tasks), [], "a body without tasks answers none");
      assert.equal(read.options, null, "which is the absence `list.options || state.options` reads");
      assert.equal(read.pagination, null, "and the absence the total normaliser already defaulted");
      assert.equal(read.currentUserId, "",
        "`list.currentUserId || state.currentUserId` keeps the state value on an empty string");
    }
    assert.equal(shared.readTaskList({ currentUserId: 7, tasks: [] }).currentUserId, "",
      "currentUserId is session.user_id and is always text");
    assert.match(extractFunctionBlock(serviceSource, "list"), /currentUserId: session\.user_id,/);
  });
});

describe("the paging cursor", () => {
  it("describes the four members the producer constructs", () => {
    const block = extractFunctionBlock(serviceSource, "queryTasksResult");
    const literal = block.slice(block.indexOf("pagination: pagination ?"));
    // `nextCursor` is a shorthand property, so the pattern has to accept a trailing comma too -
    // the same thing that caught `0.33.33.38.4.3.1`.
    const built = [...new Set([...literal.matchAll(/^\s{6}([a-zA-Z]\w*)[:,]/gm)].map((entry) => entry[1]))];
    assert.deepEqual(built.slice().sort(), ["hasMore", "limit", "nextCursor", "pageSize"]);
    assert.deepEqual(declaredMembers("BrowserTaskListPagination").slice().sort(), built.slice().sort());
    assert.deepEqual([...plain(shared.TASK_PAGINATION_NUMBERS), "hasMore", "nextCursor"].sort(), built.slice().sort(),
      "the browser checks every member the producer builds");
  });

  it("rejects a cursor it cannot vouch for", () => {
    assert.equal(shared.isTaskListPagination(paginationFixture()), true);
    assert.equal(shared.isTaskListPagination({ ...paginationFixture(), nextCursor: "" }), true,
      "the empty string is how the producer says there is nothing further");
    assert.equal(shared.isTaskListPagination({ ...paginationFixture(), nextCursor: null }), false);
    assert.equal(shared.isTaskListPagination({ ...paginationFixture(), hasMore: "yes" }), false);
    for (const member of plain(shared.TASK_PAGINATION_NUMBERS)) {
      assert.equal(shared.isTaskListPagination({ ...paginationFixture(), [member]: "20" }), false,
        `${member} is a number the producer computed`);
      assert.equal(shared.isTaskListPagination(omit(paginationFixture(), member)), false);
    }
  });
});

describe("the option catalog", () => {
  it("describes the nine members readOptions builds", () => {
    const built = shapedMembers(serviceSource, "readOptions", 4);
    assert.equal(built.length, 9, "readOptions builds nine members");
    assert.deepEqual(declaredMembers("BrowserTaskListOptions").slice().sort(), built.slice().sort());
    const checked = [...plain(shared.TASK_OPTION_COLLECTIONS), ...plain(shared.TASK_OPTION_TEXT_LISTS),
      ...plain(shared.TASK_OPTION_FLAGS), "workspaceType"];
    assert.deepEqual(checked.slice().sort(), built.slice().sort(),
      "and the browser checks every one of them, at the depth it can honestly claim");
  });

  it("leaves the four other producers' collections unnamed", () => {
    const block = declarationBlock("BrowserTaskListOptions");
    for (const member of plain(shared.TASK_OPTION_COLLECTIONS)) {
      assert.match(block, new RegExp(`\\n  ${member}: unknown\\[\\];`),
        `${member} is built elsewhere and its element shape is not this boundary's to name`);
    }
    for (const spreader of ["readClientOptionPayload", "readProjectOptionPayload"]) {
      assert.match(extractFunctionBlock(serviceSource, spreader), /\.\.\.(client|project),/,
        `${spreader} spreads its rows, so naming its shape would claim another module's contribution`);
    }
    assert.match(extractFunctionBlock(usersRepoSource, "readAll"), /return rows\.map\(userRowToAppValue\);/,
      "users is provably the BrowserUserRecord producer, which the contract records for a later child");
  });

  it("rejects a catalog it cannot vouch for", () => {
    assert.equal(shared.isTaskListOptions(optionsFixture()), true);
    for (const member of plain(shared.TASK_OPTION_COLLECTIONS)) {
      assert.equal(shared.isTaskListOptions({ ...optionsFixture(), [member]: {} }), false, `${member} is a list`);
      assert.equal(shared.isTaskListOptions(omit(optionsFixture(), member)), false);
    }
    for (const member of plain(shared.TASK_OPTION_TEXT_LISTS)) {
      assert.equal(shared.isTaskListOptions({ ...optionsFixture(), [member]: [1] }), false,
        `${member} is spread from server constants and holds text`);
    }
    for (const member of plain(shared.TASK_OPTION_FLAGS)) {
      assert.equal(shared.isTaskListOptions({ ...optionsFixture(), [member]: 1 }), false,
        `${member} is a boolean the service constructs`);
    }
    assert.equal(shared.isTaskListOptions({ ...optionsFixture(), workspaceType: null }), false);
  });

  it("keeps the page default agreeing with the catalog contract", () => {
    const initializer = tasksPage.slice(tasksPage.indexOf("let state = {"), tasksPage.indexOf("editingTaskId:"));
    for (const member of declaredMembers("BrowserTaskListOptions")) {
      assert.match(initializer, new RegExp(`\\n      ${member}:`),
        `the stand-in catalog must carry ${member} or it cannot hold the contract`);
    }
  });
});

describe("the bulk collection", () => {
  it("sends detail records rather than list items, because of what builds them", () => {
    const block = extractFunctionBlock(serviceSource, "bulkUpdate");
    assert.match(block, /results\.push\(await readTaggedTaskWithDetails\(session, changed\.target_id\)\);/,
      "the tag branch collects the detail shaper's output");
    assert.match(block, /appendUniqueTasks\(results,[\s\S]*?resultTasks\)/,
      "and the action branch collects each lifecycle service's own task, which is also detailed");
    assert.match(sharedSource, /return envelope && Array\.isArray\(envelope\.tasks\) \? envelope\.tasks\.filter\(isTaskDetail\) : \[\];/,
      "so the bulk reader checks the detail record, not the list item");
  });

  it("checks bulk elements rather than their container", () => {
    const good = detailFixture();
    assert.deepEqual(plain(shared.readBulkTasks({ tasks: [good, listFixture(), { task_id: "t" }, null] })), [good],
      "a list item is not a detail record and a malformed entry is dropped");
    for (const empty of [null, undefined, "body", {}, { tasks: 4 }]) {
      assert.deepEqual(plain(shared.readBulkTasks(empty)), []);
    }
  });
});

describe("the transport", () => {
  it("narrows both collections before the page reads them", () => {
    assert.match(tasksPage, /function requireTaskRecords\(\) \{/);
    assert.ok(!tasksPage.includes("result.tasks || []"),
      "neither collection is read off an unknown body any more");
    assert.match(tasksPage, /results\.push\(\.\.\.requireTaskRecords\(\)\.readBulkTasks\(result\)\);/);
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/,
      "BrowserApi keeps returning a promise of unknown; nothing here is a trusted fetch");
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/** @param {string} source @param {string} fn @param {number} indent */
function shapedMembers(source, fn, indent) {
  const block = extractFunctionBlock(source, fn);
  const literal = block.slice(block.indexOf("return {"));
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*)[:,]`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @returns {Record<string, unknown>} */
function baseFixture() {
  /** @type {Record<string, unknown>} */
  const task = {
    assignees: [{ displayName: "Someone", task_assignee_id: "ta-1", user_id: "u-1", username: "s@example.com" }],
    billable: "yes",
    estimate_minutes: null,
    reminder_override_enabled: false,
  };
  for (const member of plain(shared.TASK_TEXT_MEMBERS)) task[member] = `${member}-value`;
  return task;
}

/** @returns {Record<string, unknown>} */
function listFixture() {
  /** @type {Record<string, unknown>} */
  const item = { ...baseFixture() };
  for (const member of plain(shared.TASK_LIST_MEMBERS)) item[member] = {};
  for (const member of plain(shared.TASK_LIST_TAG_MEMBERS)) item[member] = [];
  return item;
}

/** @returns {Record<string, unknown>} */
function detailFixture() {
  /** @type {Record<string, unknown>} */
  const detail = { ...baseFixture(), checklistItems: [], tags: [] };
  for (const member of plain(shared.TASK_DETAIL_MEMBERS)) detail[member] = {};
  return detail;
}

/** @returns {Record<string, unknown>} */
function paginationFixture() {
  return { hasMore: true, limit: 25, nextCursor: "b2Zmc2V0OjI1", pageSize: 25 };
}

/** @returns {Record<string, unknown>} */
function optionsFixture() {
  /** @type {Record<string, unknown>} */
  const options = { workspaceType: "business" };
  for (const member of plain(shared.TASK_OPTION_COLLECTIONS)) options[member] = [];
  for (const member of plain(shared.TASK_OPTION_TEXT_LISTS)) options[member] = ["normal"];
  for (const member of plain(shared.TASK_OPTION_FLAGS)) options[member] = true;
  return options;
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @param {Record<string, unknown>} record @param {readonly string[]} members */
function omitAll(record, members) {
  return members.reduce((carried, member) => omit(carried, member), record);
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
