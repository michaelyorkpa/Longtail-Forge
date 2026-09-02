// Runtime proof for the single-task response records.
//
// `0.33.33.38.4.3` grouped 64 diagnostics as one Tasks family. The producer trace found **two final
// task shapes**, and the routes are not what divides them: the three task-timer routes answer
// `task: updatedTask || task` where `updatedTask` is `tasksRepository.readById` - the base record
// `taskRowToAppValue` reconstructs plus the `assignees` `attachAssignees` adds - while create, read,
// update, complete, reopen, archive, restore and skip-to-current all reach `attachTaskDetails`,
// which adds ten members built by ten other producers.
//
// Producer authority is read from `tasks.repo.js` and `tasks.service.js`; contract authority from
// the browser declaration; the runtime from the shared module. Breaking any one leaves the others
// standing, as `0.33.33.38.4.11` established.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const repositorySource = readText("src/modules/tasks/tasks.repo.js");
const serviceSource = readText("src/modules/tasks/tasks.service.js");
const timersSource = readText("src/modules/tasks/task-timers.service.js");
const staticSource = readText("src/services/static.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const sharedSource = readText("public/js/shared/task-records.js");

const shared = sandbox(sharedSource,
  ["isResponseRecord", "isTaskAssignee", "isTaskRecord", "isTaskDetail",
    "readTask", "readTaskDetail", "readSkipToCurrentTarget"],
  ["TASK_TEXT_MEMBERS", "TASK_DETAIL_MEMBERS", "TASK_DETAIL_ARRAYS", "ASSIGNEE_MEMBERS"]);

describe("the base task record", () => {
  it("describes exactly what the shaper reconstructs", () => {
    const built = shapedMembers(repositorySource, "taskRowToAppValue", 4);
    assert.equal(built.length, 33, "taskRowToAppValue reconstructs thirty-three members");
    const declared = declaredMembers("BrowserTaskRecord");
    assert.deepEqual(declared.slice().sort(), [...built, "assignees"].sort(),
      "the contract is the shaper output plus the assignees attachAssignees adds");
    const checked = [...plain(shared.TASK_TEXT_MEMBERS),
      "billable", "estimate_minutes", "reminder_override_enabled"];
    assert.deepEqual(checked.slice().sort(), built.slice().sort(),
      "the browser checks every member the shaper builds");
  });

  it("never regains the write-side input the shaper does not emit", () => {
    const block = extractFunctionBlock(repositorySource, "taskRowToAppValue");
    assert.doesNotMatch(block, /assignee_ids/,
      "assignee_ids is an input the service passes into the repository, never an output");
    for (const source of [declarationBlock("BrowserTaskRecord"), declarationBlock("BrowserTaskDetail"), sharedSource]) {
      assert.doesNotMatch(source, /assignee_ids/, "and it must never appear on the browser side");
    }
  });

  it("keeps the one union the producer closes and refuses the three it does not", () => {
    assert.match(extractFunctionBlock(repositorySource, "taskRowToAppValue"),
      /billable: row\.billable === "no" \? "no" : "yes",/,
      "the ternary is what closes this union; nothing else in the shaper closes one");
    assert.match(declarationBlock("BrowserTaskRecord"), /\n  billable: "no" \| "yes";/);
    for (const open of ["status", "priority", "source_type"]) {
      assert.match(declarationBlock("BrowserTaskRecord"), new RegExp(`\\n  ${open}: string;`),
        `${open} is a database text column with a default, and the browser validates no vocabulary for it`);
    }
    assert.equal(shared.isTaskRecord({ ...taskFixture(), billable: "maybe" }), false);
    assert.equal(shared.isTaskRecord({ ...taskFixture(), billable: true }), false);
    assert.equal(shared.isTaskRecord({ ...taskFixture(), status: "anything-at-all" }), true,
      "an unrecognised status is still text the server sent, and refusing it would invent a rule");
  });

  it("rejects the stored integer where the shaper built a boolean", () => {
    assert.match(extractFunctionBlock(repositorySource, "taskRowToAppValue"),
      /reminder_override_enabled: db\.dialect\.boolean\.read\(row\.reminder_override_enabled\) === true,/,
      "the column is an integer flag and the shaper converts it");
    assert.match(declarationBlock("BrowserTaskRecord"), /\n  reminder_override_enabled: boolean;/);
    for (const stored of [0, 1, "1", null]) {
      assert.equal(shared.isTaskRecord({ ...taskFixture(), reminder_override_enabled: stored }), false,
        "the browser must reject what the database holds, not what the shaper sends");
    }
  });

  it("treats estimate_minutes as the one nullable member", () => {
    assert.equal(shared.isTaskRecord({ ...taskFixture(), estimate_minutes: null }), true);
    assert.equal(shared.isTaskRecord({ ...taskFixture(), estimate_minutes: 45 }), true);
    assert.equal(shared.isTaskRecord({ ...taskFixture(), estimate_minutes: "45" }), false);
    assert.equal(shared.isTaskRecord(omit(taskFixture(), "estimate_minutes")), false);
    for (const member of plain(shared.TASK_TEXT_MEMBERS)) {
      assert.equal(shared.isTaskRecord({ ...taskFixture(), [member]: null }), false,
        `${member} has a total fallback and is never null`);
      assert.equal(shared.isTaskRecord(omit(taskFixture(), member)), false, `${member} is always built`);
    }
    assert.equal(shared.isTaskRecord({ ...taskFixture(), task_id: "" }), false);
  });
});

describe("the task assignee", () => {
  it("is a four-member summary and not the user record", () => {
    const built = shapedMembers(repositorySource, "assigneeRowToAppValue", 4);
    assert.deepEqual(built.slice().sort(), ["displayName", "task_assignee_id", "user_id", "username"]);
    assert.deepEqual(declaredMembers("BrowserTaskAssignee").slice().sort(), built.slice().sort());
    const userRecord = declaredMembers("BrowserUserRecord");
    assert.ok(userRecord.length > built.length,
      "the user record is much wider, which is why this is its own contract");
    for (const wider of ["themeMode", "altEmail", "timezone", "protectedUser"]) {
      assert.ok(userRecord.includes(wider), `${wider} belongs to the user record`);
      assert.doesNotMatch(declarationBlock("BrowserTaskAssignee"), new RegExp(`\\n  ${wider}\\??:`),
        `${wider} is not joined by the assignee query and must never appear here`);
    }
  });

  it("checks assignee elements rather than their container", () => {
    const good = assigneeFixture();
    assert.equal(shared.isTaskRecord({ ...taskFixture(), assignees: [good] }), true);
    assert.equal(shared.isTaskRecord({ ...taskFixture(), assignees: [] }), true, "a task may have none");
    assert.equal(shared.isTaskRecord({ ...taskFixture(), assignees: "u-1" }), false);
    for (const bad of [{ user_id: "u-1" }, null, "assignee", { ...good, task_assignee_id: "" }, { ...good, username: 4 }]) {
      assert.equal(shared.isTaskRecord({ ...taskFixture(), assignees: [good, bad] }), false,
        "an array of assignees does not make its entries assignees");
    }
  });
});

describe("the detailed task record", () => {
  it("describes exactly what attachTaskDetails adds", () => {
    const detail = extractFunctionBlock(serviceSource, "attachTaskDetails");
    const literal = detail.slice(detail.indexOf("return {"));
    // `checklistItems`, `checklistProgress` and `relationshipSummary` are shorthand properties, so
    // the pattern has to accept a trailing comma as well as a colon.
    const added = [...new Set([...literal.matchAll(/^\s{4}([a-zA-Z]\w*)[:,]/gm)].map((entry) => entry[1]))]
      .filter((member) => !declaredMembers("BrowserTaskRecord").includes(member));
    const reminder = extractFunctionBlock(serviceSource, "attachReminderDetailsToTask");
    assert.match(reminder, /reminderDetails: await taskRemindersService\.readTaskReminderDetails\(task\),/);
    const declared = declaredMembers("BrowserTaskDetail");
    assert.deepEqual(declared.slice().sort(), [...added, "reminderDetails"].sort(),
      "the detail contract is exactly the two shapers' additions over the base record");
    assert.equal(declared.length, 10, "ten added members, ten other producers");
    assert.match(declarationSource, /export interface BrowserTaskDetail extends BrowserTaskRecord \{/,
      "and it extends the base record rather than restating it");
    // The runtime tables need authority of their own, or a deleted entry would quietly delete the
    // assertion that iterates it.
    assert.deepEqual(
      [...plain(shared.TASK_DETAIL_MEMBERS), ...plain(shared.TASK_DETAIL_ARRAYS)].sort(),
      declared.slice().sort(),
      "the browser checks every member the two detail shapers add");
  });

  it("names only the shape whose producer has been traced", () => {
    const block = declarationBlock("BrowserTaskDetail");
    for (const member of plain(shared.TASK_DETAIL_MEMBERS)) {
      if (member === "recurrenceContinuity") {
        // Named by `0.33.33.38.4.3.4` once `readTaskCompletionContinuity` was traced. The other
        // eight stay unknown for exactly the reason this test was written.
        assert.match(block, /\n  recurrenceContinuity: BrowserTaskRecurrenceContinuity \| null;/,
          "the one added member whose producer this estate has named");
        continue;
      }
      assert.match(block, new RegExp(`\\n  ${member}: unknown;`),
        `${member} is built elsewhere and its shape is not this boundary's to name`);
    }
    for (const member of plain(shared.TASK_DETAIL_ARRAYS)) {
      assert.match(block, new RegExp(`\\n  ${member}: unknown\\[\\];`));
    }
  });

  it("treats every added member as present rather than optional", () => {
    assert.equal(shared.isTaskDetail(detailFixture()), true);
    assert.equal(shared.isTaskDetail({ ...detailFixture(), recurrenceRecovery: null }), true,
      "four routes call the shaper without a session, and null is a value rather than an absence");
    assert.equal(shared.isTaskDetail({ ...detailFixture(), tags: [] }), true,
      "an undecorated row still carries the member as an empty array");
    for (const member of plain(shared.TASK_DETAIL_MEMBERS)) {
      assert.equal(shared.isTaskDetail(omit(detailFixture(), member)), false, `${member} is always added`);
    }
    for (const member of plain(shared.TASK_DETAIL_ARRAYS)) {
      assert.equal(shared.isTaskDetail(omit(detailFixture(), member)), false);
      assert.equal(shared.isTaskDetail({ ...detailFixture(), [member]: {} }), false, `${member} is an array`);
    }
    assert.equal(shared.isTaskDetail(taskFixture()), false, "a base record is not a detailed one");
    assert.equal(shared.isTaskRecord(detailFixture()), true, "and a detailed one is still a base record");
  });
});

describe("the response envelopes", () => {
  it("keeps the timer routes on the base record and everything else on the detailed one", () => {
    for (const fn of ["save", "finalize", "linkManualTimer"]) {
      const block = extractFunctionBlock(timersSource, fn);
      assert.match(block, /const updatedTask = await tasksRepository\.readById\(/,
        `${fn} reads the base record`);
      assert.doesNotMatch(block, /attachTaskDetails/,
        `${fn} never reaches the detail shaper, which is why the browser must not expect its members`);
      assert.match(block, /task: updatedTask \|\| task,/,
        "the producer writes its own fallback, which is why the browser member is nullable");
    }
    assert.match(extractFunctionBlock(serviceSource, "readTaggedTaskWithDetails"),
      /return attachTaskDetails\(/, "the detail routes funnel through one helper");
    assert.match(extractFunctionBlock(serviceSource, "read"), /attachTaskDetails\(/);
  });

  it("reuses the detailed record for targetTask because the producer is the same shaper", () => {
    const block = extractFunctionBlock(serviceSource, "skipToCurrent");
    assert.match(block, /\? await readTaggedTaskWithDetails\(session, result\.targetTask\.task_id\)\n\s+: null;/,
      "skipToCurrent builds its target with the same shaper and answers null when it retained none");
    assert.match(declarationBlock("BrowserTaskSkipToCurrentResult"), /targetTask: BrowserTaskDetail \| null;/,
      "producer identity decides the reuse; the different member name does not make it a new type");
  });

  it("reads each envelope and refuses what it cannot vouch for", () => {
    assert.deepEqual(plain(shared.readTask({ task: taskFixture() })), taskFixture());
    assert.deepEqual(plain(shared.readTaskDetail({ task: detailFixture() })), detailFixture());
    assert.deepEqual(plain(shared.readSkipToCurrentTarget({ targetTask: detailFixture() })), detailFixture());
    assert.equal(shared.readTaskDetail({ task: taskFixture() }), null,
      "a base record on a detail route is not the record that route sends");
    assert.equal(shared.readTask({ targetTask: taskFixture() }), null, "the member names are not interchangeable");
    for (const empty of [null, undefined, "body", 4, [], {}, { task: null }, { task: "t-1" },
      { task: { task_id: "t-1" } }]) {
      assert.equal(shared.readTask(empty), null, "an absent or malformed task reads as none");
      assert.equal(shared.readTaskDetail(empty), null);
      assert.equal(shared.readSkipToCurrentTarget(empty), null);
    }
  });
});

/**
 * The narrowed reads this child installed, one entry per consumer.
 *
 * Absence is the wrong assertion here: all three files hold other `result.task` reads whose
 * `result` is **not** an HTTP body. Task Dialog answers its host through an `onSaved(result)`
 * callback that `tasks.js` consumes, and Workbench reads the return of its own `saveTaskTimer`
 * helper. Those were never among this family's diagnostics and are not this child's to claim, so
 * the proof names what was narrowed rather than banning a spelling.
 */
const NARROWED_READS = Object.freeze({
  "tasks.js": [
    "const timerTask = requireTaskRecords().readTask(result);",
    "const actionTask = requireTaskRecords().readTaskDetail(result);",
    "const lifecycleTask = requireTaskRecords().readTaskDetail(result);",
  ],
  "task-dialog.js": [
    "const savedTask = requireTaskRecords().readTaskDetail(result);",
    "offerTaskResumeNote(requireTaskRecords().readTask(result) || task);",
    "const skipTarget = requireTaskRecords().readSkipToCurrentTarget(result);",
  ],
  "workbench.js": [
    "consumeTaskFocusResumeNote(requireTaskRecords().readTaskDetail(result), taskId)",
    "applyActiveTaskFocusTask(requireTaskRecords().readTaskDetail(result) || {",
    "offerTaskResumeNote(requireTaskRecords().readTask(result));",
  ],
});

describe("the delivery and the transport", () => {
  it("installs the shared surface on every page beside the ones it joins", () => {
    const block = extractFunctionBlock(staticSource, "injectErrorBoundaryScripts");
    assert.match(block, /contents\.includes\('src="\/js\/shared\/task-records\.js"'\)/,
      "the guard must know about the script or it is injected twice");
    assert.match(block, /<script src="\/js\/shared\/task-records\.js"><\/script>/,
      "and the framework block must actually inject it");
    assert.match(block, /task-lifecycle-legality\.js[\s\S]*task-records\.js/,
      "it loads after the other shared task module, before any page script");
    assert.match(declarationSource, /\n  taskRecords\?: BrowserTaskRecords;/,
      "and the namespace member is declared, so no consumer reaches it through an untyped global");
  });

  it("hands each of the three consumers a narrowed record rather than the raw body", () => {
    for (const [page, narrowedReads] of Object.entries(NARROWED_READS)) {
      const source = readText(`public/js/${page}`);
      assert.match(source, /function requireTaskRecords\(\) \{/,
        `${page} must reach the shared surface through a checked accessor`);
      for (const narrowed of narrowedReads) {
        assert.ok(source.includes(narrowed), `${page} must narrow through ${narrowed}`);
      }
      assert.doesNotMatch(source, /\bresult\.targetTask\b/,
        "skip-to-current is the only producer of that member and it is narrowed");
    }
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/,
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

/** The members one shaper constructs. @param {string} source @param {string} fn @param {number} indent */
function shapedMembers(source, fn, indent) {
  const block = extractFunctionBlock(source, fn);
  const literal = block.slice(block.indexOf("return {"));
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*):`, "gm"))]
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
function assigneeFixture() {
  return { displayName: "Someone", task_assignee_id: "ta-1", user_id: "u-1", username: "someone@example.com" };
}

/** @returns {Record<string, unknown>} */
function taskFixture() {
  /** @type {Record<string, unknown>} */
  const task = {
    assignees: [assigneeFixture()],
    billable: "yes",
    estimate_minutes: null,
    reminder_override_enabled: false,
  };
  for (const member of plain(shared.TASK_TEXT_MEMBERS)) task[member] = `${member}-value`;
  return task;
}

/** @returns {Record<string, unknown>} */
function detailFixture() {
  /** @type {Record<string, unknown>} */
  const detail = { ...taskFixture(), checklistItems: [], tags: [] };
  for (const member of plain(shared.TASK_DETAIL_MEMBERS)) detail[member] = {};
  // `0.33.33.38.4.3.4` named this member, and `null` is the value most tasks carry: only a
  // completed recurrence instance gets a continuity record.
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
