// Runtime proof for the recurrence-continuity response contracts.
//
// `0.33.33.38.4.3.1` left `BrowserTaskDetail.recurrenceContinuity` as `unknown` because the member
// was known to be present but its producer had not been traced. It has now: **one record from four
// construction sites**, and the detail contract carries it rather than a parallel one.
//
// The plural is *not* an array of that record. `bulkUpdate` pushes `{ task_id, ...continuity }`, so
// each entry names the task it belongs to - information the singular routes never need because
// their envelope already carries the task.
//
// Producer authority is read from `task-recurrence.service.js` and `tasks.service.js`; contract
// authority from the browser declaration; the runtime from the shared module. No expected answer is
// derived from the source under test.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const recurrenceSource = readText("src/modules/tasks/task-recurrence.service.js");
const taskServiceSource = readText("src/modules/tasks/tasks.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const sharedSource = readText("public/js/shared/task-records.js");
const tasksPage = readText("public/js/tasks.js");

const shared = sandbox(sharedSource,
  ["isResponseRecord", "isTaskAssignee", "isTaskRecord", "isRecurrenceNextTask",
    "isRecurrenceContinuity", "isTaskDetail", "readRecurrenceContinuity",
    "readBulkRecurrenceContinuities"],
  ["TASK_TEXT_MEMBERS", "TASK_DETAIL_MEMBERS", "TASK_DETAIL_ARRAYS", "ASSIGNEE_MEMBERS",
    "CONTINUITY_FLAGS", "CONTINUITY_STATUSES", "NEXT_TASK_TEXT"]);

describe("the continuity record", () => {
  it("is the one shape all four construction sites build", () => {
    const sites = [
      ["readCompletionContinuity", recurrenceSource],
      ["endedContinuity", recurrenceSource],
    ];
    for (const [fn, source] of sites) {
      const built = shapedMembers(source, fn, 4);
      assert.deepEqual(built.slice().sort(), declaredMembers("BrowserTaskRecurrenceContinuity").slice().sort(),
        `${fn} builds exactly the members the contract declares`);
    }
    // The other two sites spread the record and override, which is why they cannot drift from it.
    assert.match(extractFunctionBlock(recurrenceSource, "prepareCompletionContinuity"),
      /return \{\s+\.\.\.continuity,\s+checklistTemplateSeeded: seedResult\.seeded === true,\s+\};/,
      "prepareCompletionContinuity spreads and overrides one member");
    const handoff = extractFunctionBlock(taskServiceSource, "completeRecurrenceHandoff");
    assert.match(handoff, /\.\.\.continuity,\s+followUpQueued: queued,\s+status: "pending",/,
      "the handoff success path spreads and overrides two");
    // Bounded at the literal's own close, or the sibling `recurrenceJob` members join the set.
    const rebuiltStart = handoff.indexOf("recurrenceContinuity: {", handoff.indexOf("catch"));
    const rebuilt = handoff.slice(rebuiltStart, handoff.indexOf("      },", rebuiltStart));
    assert.deepEqual(
      [...new Set([...rebuilt.matchAll(/^\s{8}([a-zA-Z]\w*):/gm)].map((entry) => entry[1]))].sort(),
      declaredMembers("BrowserTaskRecurrenceContinuity").slice().sort(),
      "and its catch path rebuilds the same seven by hand");
  });

  it("checks every member the producer builds", () => {
    const checked = [...plain(shared.CONTINUITY_FLAGS), "nextScheduledDate", "nextTask", "status"];
    assert.deepEqual(checked.slice().sort(),
      declaredMembers("BrowserTaskRecurrenceContinuity").slice().sort(),
      "the runtime tables and the contract describe the same record");
  });

  it("closes the status union because every site writes a literal", () => {
    const written = new Set([
      ...[...recurrenceSource.matchAll(/status: (?:nextTask \? )?"(\w+)"(?: : "(\w+)")?/g)]
        .flatMap((entry) => [entry[1], entry[2]]).filter(Boolean),
      ...[...taskServiceSource.matchAll(/\n\s+status: "(\w+)",\n\s+\};\n\s+\},\n\s+recurrenceJob/g)]
        .map((entry) => entry[1]),
    ]);
    for (const status of plain(shared.CONTINUITY_STATUSES)) {
      assert.equal(shared.isRecurrenceContinuity({ ...continuity(), status }), true,
        `${status} is a state the producer writes`);
    }
    assert.ok(written.size >= 3, "the literals really are written in the services, not read from a column");
    assert.match(declarationSource,
      /export type BrowserTaskRecurrenceStatus = "available" \| "ended" \| "handoff_failed" \| "pending";/);
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), status: "queued" }), false,
      "a state no site writes is not a state");
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), status: null }), false);
  });

  it("rejects a continuity it cannot vouch for", () => {
    assert.equal(shared.isRecurrenceContinuity(continuity()), true);
    for (const member of plain(shared.CONTINUITY_FLAGS)) {
      assert.equal(shared.isRecurrenceContinuity({ ...continuity(), [member]: "true" }), false,
        `${member} is a boolean at every site`);
      assert.equal(shared.isRecurrenceContinuity(omit(continuity(), member)), false, `${member} is always built`);
    }
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), nextScheduledDate: null }), false,
      "an ended series has the empty string, not null");
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), nextScheduledDate: "" }), true);
    for (const malformed of [null, undefined, 4, "continuity", [continuity()]]) {
      assert.equal(shared.isRecurrenceContinuity(malformed), false);
    }
  });
});

describe("the next-occurrence descriptor", () => {
  it("is the four members safeNextTask builds, and is not a task record", () => {
    const built = shapedMembers(recurrenceSource, "safeNextTask", 4);
    assert.deepEqual(built.slice().sort(), plain(shared.NEXT_TASK_TEXT).slice().sort());
    assert.deepEqual(declaredMembers("BrowserTaskRecurrenceNextTask").slice().sort(), built.slice().sort(),
      "the descriptor is those four members and no others");
    assert.match(extractFunctionBlock(recurrenceSource, "safeNextTask"),
      /if \(!task\?\.task_id\) \{\s+return null;/,
      "a descriptor without an identifier is null rather than partial");
  });

  it("never widens into a task record", () => {
    const block = declarationBlock("BrowserTaskRecurrenceNextTask");
    for (const taskOnly of ["status", "priority", "assignees", "workspace_id", "billable"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${taskOnly}\\??:`),
        `${taskOnly} belongs to a task record; this is a link and a label`);
    }
  });

  it("accepts an absent next task and rejects a partial one", () => {
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), nextTask: null }), true,
      "a pending series has no next task yet, which is a value rather than a fault");
    assert.equal(shared.isRecurrenceContinuity({ ...continuity(), nextTask: {} }), false);
    for (const member of plain(shared.NEXT_TASK_TEXT)) {
      assert.equal(shared.isRecurrenceNextTask(omit(nextTask(), member)), false, `${member} is always built`);
      assert.equal(shared.isRecurrenceNextTask({ ...nextTask(), [member]: 4 }), false, `${member} is text`);
    }
    assert.equal(shared.isRecurrenceNextTask({ ...nextTask(), task_id: "" }), false);
  });
});

describe("the singular read", () => {
  it("treats a task with no series and a malformed record the same way", () => {
    assert.deepEqual(plain(shared.readRecurrenceContinuity({ recurrenceContinuity: continuity() })), continuity());
    for (const absent of [
      { recurrenceContinuity: null },
      { recurrenceContinuity: undefined },
      {},
      null,
      "body",
      4,
      { recurrenceContinuity: { isRecurring: true } },
      { recurrenceContinuity: "pending" },
    ]) {
      assert.equal(shared.readRecurrenceContinuity(absent), null,
        "every consumer already guarded with `if (continuity)`, so both take the path the absence took");
    }
  });

  it("reads the member the producers actually send", () => {
    assert.match(extractFunctionBlock(taskServiceSource, "readTaskCompletionContinuity"),
      /return null;/, "a task that is not a completed recurrence instance gets null");
    assert.match(extractFunctionBlock(taskServiceSource, "completeRecurrenceHandoff"),
      /recurrenceContinuity: null,/, "and so does a task with no template");
    assert.match(declarationBlock("BrowserTaskRecords"),
      /readRecurrenceContinuity\(body: unknown\): BrowserTaskRecurrenceContinuity \| null;/,
      "so the reader answers a record or null, never an absence");
  });
});

describe("the bulk collection", () => {
  it("carries the task identifier the singular routes never need", () => {
    assert.match(extractFunctionBlock(taskServiceSource, "bulkUpdate"),
      /recurrenceContinuities\.push\(\{\s+task_id:[\s\S]*?\.\.\.result\.recurrenceContinuity,\s+\}\);/,
      "the bulk entry is a continuity with the task it belongs to");
    assert.match(declarationSource,
      /export interface BrowserTaskBulkRecurrenceContinuity extends BrowserTaskRecurrenceContinuity \{\s+task_id: string;\s+\}/,
      "which is one member more than the singular record, not a different family");
    assert.equal(shared.isRecurrenceContinuity(bulkContinuity()), true,
      "a bulk entry is still a continuity");
  });

  it("checks elements rather than the container", () => {
    const good = bulkContinuity();
    assert.deepEqual(plain(shared.readBulkRecurrenceContinuities({
      recurrenceContinuities: [good, continuity(), { task_id: "t-2" }, null, "entry"],
    })), [good], "a continuity without its task identifier is not a bulk entry");
    for (const empty of [null, undefined, "body", {}, { recurrenceContinuities: 4 }]) {
      assert.deepEqual(plain(shared.readBulkRecurrenceContinuities(empty)), []);
    }
    assert.deepEqual(plain(shared.readBulkRecurrenceContinuities({
      recurrenceContinuities: [{ ...bulkContinuity(), task_id: "" }],
    })), [], "an empty identifier names no task");
  });
});

describe("the task detail record", () => {
  it("stops declaring the member opaque now that its producer is named", () => {
    assert.match(extractFunctionBlock(taskServiceSource, "attachTaskDetails"),
      /recurrenceContinuity: await readTaskCompletionContinuity\(taskWithReminders\),/,
      "the detail shaper fills it from the same producer the lifecycle routes use");
    assert.match(declarationBlock("BrowserTaskDetail"),
      /\n  recurrenceContinuity: BrowserTaskRecurrenceContinuity \| null;/,
      "so the detail contract carries that record rather than unknown");
    assert.doesNotMatch(declarationBlock("BrowserTaskDetail"), /\n  recurrenceContinuity: unknown;/);
  });

  it("leaves the neighbouring recurrence members alone", () => {
    const block = declarationBlock("BrowserTaskDetail");
    for (const member of ["recurrenceDetails", "recurrenceRecovery"]) {
      assert.match(block, new RegExp(`\\n  ${member}: unknown;`),
        `${member} is a different producer and a similar name is not a shared contract`);
    }
    assert.match(extractFunctionBlock(taskServiceSource, "attachTaskDetails"),
      /recurrenceDetails: await taskRecurrenceService\.readTaskRecurrenceDetails\(taskWithReminders\),/,
      "which the shaper itself shows by calling something else for it");
  });

  it("checks the member it now names", () => {
    assert.equal(shared.isTaskDetail(detailFixture()), true);
    assert.equal(shared.isTaskDetail({ ...detailFixture(), recurrenceContinuity: null }), true,
      "most tasks are not completed recurrence instances");
    assert.equal(shared.isTaskDetail({ ...detailFixture(), recurrenceContinuity: continuity() }), true);
    assert.equal(shared.isTaskDetail({ ...detailFixture(), recurrenceContinuity: { isRecurring: true } }), false,
      "a partial continuity is not one, even inside a task that is otherwise well formed");
  });
});

describe("the transport", () => {
  it("narrows all three reads through the shared surface", () => {
    for (const narrowed of [
      "const actionContinuity = requireTaskRecords().readRecurrenceContinuity(result);",
      "const lifecycleContinuity = requireTaskRecords().readRecurrenceContinuity(result);",
      "recurrenceContinuities.push(...requireTaskRecords().readBulkRecurrenceContinuities(result));",
    ]) {
      assert.ok(tasksPage.includes(narrowed), `tasks.js must narrow through ${narrowed}`);
    }
    // `if (result.recurrenceContinuity) {` is deliberately absent from this list: the dialog's own
    // `onSaved(result)` callback spells it identically, and that read is a page handoff rather than
    // a wire body. The narrowed forms above are what prove the owned reads moved.
    for (const owned of [
      'if (action === "complete" && result.recurrenceContinuity)',
      "result.recurrenceContinuities || []",
    ]) {
      assert.ok(!tasksPage.includes(owned), `tasks.js must no longer read ${owned} off an unknown body`);
    }
    assert.ok(tasksPage.includes("onSaved: async (result) => {"),
      "the remaining recurrence read takes the dialog's own callback, not a wire body, and is not this child's");
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
  const literal = block.slice(block.lastIndexOf("return {"));
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
function nextTask() {
  /** @type {Record<string, unknown>} */
  const task = {};
  for (const member of plain(shared.NEXT_TASK_TEXT)) task[member] = `${member}-value`;
  return task;
}

/** @returns {Record<string, unknown>} */
function continuity() {
  /** @type {Record<string, unknown>} */
  const record = { nextScheduledDate: "2026-09-30", nextTask: nextTask(), status: "available" };
  for (const member of plain(shared.CONTINUITY_FLAGS)) record[member] = false;
  return record;
}

/** @returns {Record<string, unknown>} */
function bulkContinuity() {
  return { ...continuity(), task_id: "t-1" };
}

/** @returns {Record<string, unknown>} */
function detailFixture() {
  /** @type {Record<string, unknown>} */
  const detail = {
    assignees: [{ displayName: "Someone", task_assignee_id: "ta-1", user_id: "u-1", username: "s@example.com" }],
    billable: "yes",
    checklistItems: [],
    estimate_minutes: null,
    reminder_override_enabled: false,
    tags: [],
  };
  for (const member of plain(shared.TASK_TEXT_MEMBERS)) detail[member] = `${member}-value`;
  for (const member of plain(shared.TASK_DETAIL_MEMBERS)) detail[member] = {};
  detail.recurrenceContinuity = null;
  return detail;
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
