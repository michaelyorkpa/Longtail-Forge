// Runtime proof for the task-timer response contracts.
//
// **The two producers are not built the same way, and the contract has to say so.**
// `GET /api/tasks/timers` reaches `timerToTaskTimer`, an exact reconstruction of twenty-five
// members. The save and link routes reach `taskTimerFromUnified`, which **spreads** the unified
// active timer and overrides eleven - and what it spreads has already been through
// `shapeTimerPayload`, which spreads again over `activeTimerRowToAppValue`.
//
// So the browser contract is a **guaranteed minimum**: every member it names is guaranteed on both
// paths, and it deliberately says nothing about the extras the spread path carries. The proofs
// below check that distinction in both directions - a missing guarantee fails, and a benign extra
// does not.
//
// Producer authority is read from the two timer shapers and the active-timer repository; contract
// authority from the browser declaration; the runtime from the shared module.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const timerRepoSource = readText("src/modules/tasks/task-timers.repo.js");
const timerServiceSource = readText("src/modules/tasks/task-timers.service.js");
const activeRepoSource = readText("src/modules/time-tracking/active-timers.repo.js");
const activeServiceSource = readText("src/modules/time-tracking/active-timers.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const sharedSource = readText("public/js/shared/task-records.js");
const tasksPage = readText("public/js/tasks.js");
const dialogPage = readText("public/js/task-dialog.js");

const shared = sandbox(sharedSource,
  ["isResponseRecord", "isTimerResumeContext", "isTaskTimerRecord", "readTaskTimers", "readTaskTimer"],
  ["TIMER_TEXT_MEMBERS", "RESUME_CONTEXT_TEXT", "TIMER_STATUSES", "TIMER_BILLABLE"]);

describe("the two producers", () => {
  it("reconstructs the list record exactly and spreads the mutation one", () => {
    const listShaper = extractFunctionBlock(timerRepoSource, "timerToTaskTimer");
    assert.doesNotMatch(listShaper, /\.\.\.timer,/,
      "the list shaper names every member; that is what makes it exact");
    const mutationShaper = extractFunctionBlock(timerServiceSource, "taskTimerFromUnified");
    assert.match(mutationShaper, /return \{\s+\.\.\.timer,/,
      "the mutation shaper spreads, so exactness cannot be claimed for it");
    assert.match(extractFunctionBlock(activeServiceSource, "shapeTimerPayload"), /return \{\s+\.\.\.timer,/,
      "and what it spreads has already been spread once more");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual(
      [...plain(shared.TIMER_TEXT_MEMBERS), "accumulated_elapsed_seconds", "billable",
        "last_active_start_time", "resumeContext", "resume_context", "sourceMetadata",
        "timer_status"].sort(),
      declaredMembers("BrowserTaskTimerRecord").slice().sort(),
      "the browser checks every member the timer contract declares");
    assert.deepEqual(
      [...plain(shared.RESUME_CONTEXT_TEXT), "accumulatedElapsedSeconds", "lastActiveStartTime",
        "timerStatus"].sort(),
      declaredMembers("BrowserTaskTimerResumeContext").slice().sort(),
      "and every member the resume-context contract declares");
  });

  it("guarantees every contracted member on both paths", () => {
    const declared = declaredMembers("BrowserTaskTimerRecord");
    const listBuilt = shapedMembers(timerRepoSource, "timerToTaskTimer", 4);
    for (const member of declared) {
      assert.ok(listBuilt.includes(member), `${member} must be reconstructed by the list shaper`);
    }
    // The mutation path guarantees a member if any shaper in its chain names it.
    const chain = [
      shapedMembers(timerServiceSource, "taskTimerFromUnified", 4),
      shapedMembers(activeServiceSource, "shapeTimerPayload", 4),
      shapedMembers(activeRepoSource, "activeTimerRowToAppValue", 4),
    ].flat();
    for (const member of declared) {
      assert.ok(chain.includes(member),
        `${member} must be named somewhere in the mutation chain, or it is not a guarantee`);
    }
  });

  it("leaves the spread's incidental extras out of the vocabulary", () => {
    const listBuilt = shapedMembers(timerRepoSource, "timerToTaskTimer", 4);
    const rowBuilt = shapedMembers(activeRepoSource, "activeTimerRowToAppValue", 4);
    const mutationOnly = rowBuilt.filter((member) => !listBuilt.includes(member));
    assert.deepEqual(mutationOnly, ["timer_slot"],
      "the mutation path carries exactly one member the list path never sends");
    assert.doesNotMatch(declarationBlock("BrowserTaskTimerRecord"), /\n  timer_slot\??:/,
      "and naming it would freeze an incidental extra into browser vocabulary");
  });

  it("normalises the two closed vocabularies identically at both ends", () => {
    for (const [source, fn] of [[timerRepoSource, "timerToTaskTimer"], [activeRepoSource, "activeTimerRowToAppValue"]]) {
      const block = extractFunctionBlock(source, fn);
      assert.match(block, /billable: (?:timer|row)\.billable === "no" \? "no" : "yes",/,
        `${fn} closes the billable vocabulary`);
      assert.match(block, /timer_status: (?:timer|row)\.timer_status === "running" \? "running" : "paused",/,
        `${fn} closes the status vocabulary`);
    }
    assert.match(declarationSource, /export type BrowserTaskTimerStatus = "paused" \| "running";/);
    assert.match(declarationSource, /export type BrowserTaskTimerBillable = "no" \| "yes";/);
  });

  it("keeps the source label and url behind the permission filter that blanks them", () => {
    const block = extractFunctionBlock(activeServiceSource, "shapeTimerPayload");
    assert.match(block, /const sourceReadable = await canReadTimerSource\(session, timer\);/,
      "the shaper asks whether the caller may read the source");
    assert.match(block, /safeSourceLabel = sourceReadable \?/, "and blanks the label when they may not");
    assert.match(block, /safeSourceUrl = sourceReadable \?/, "and the url with it");
    assert.equal(shared.isTaskTimerRecord({ ...timer(), source_label: "", source_url: "" }), true,
      "so the browser must accept the blanked form rather than treating it as malformed");
  });
});

describe("the timer record", () => {
  it("accepts a timer either producer could send", () => {
    assert.equal(shared.isTaskTimerRecord(timer()), true);
    assert.equal(shared.isTaskTimerRecord({ ...timer(), last_active_start_time: null }), true,
      "a paused timer has no active start");
    for (const status of plain(shared.TIMER_STATUSES)) {
      assert.equal(shared.isTaskTimerRecord({ ...timer(), timer_status: status }), true);
    }
    for (const billable of plain(shared.TIMER_BILLABLE)) {
      assert.equal(shared.isTaskTimerRecord({ ...timer(), billable }), true);
    }
  });

  it("does not claim the spread path sends nothing else", () => {
    assert.equal(shared.isTaskTimerRecord({ ...timer(), timer_slot: "1" }), true,
      "the mutation payload really carries this, and a benign extra must not make a timer unreadable");
    assert.equal(shared.isTaskTimerRecord({ ...timer(), some_future_member: { nested: true } }), true,
      "a guaranteed minimum is a floor, not a fence");
  });

  it("rejects a timer it cannot vouch for", () => {
    for (const member of plain(shared.TIMER_TEXT_MEMBERS)) {
      assert.equal(shared.isTaskTimerRecord(omit(timer(), member)), false, `${member} is guaranteed`);
      assert.equal(shared.isTaskTimerRecord({ ...timer(), [member]: null }), false, `${member} is text`);
    }
    assert.equal(shared.isTaskTimerRecord({ ...timer(), timer_status: "stopped" }), false,
      "a state no shaper writes is not a state");
    assert.equal(shared.isTaskTimerRecord({ ...timer(), billable: "maybe" }), false);
    assert.equal(shared.isTaskTimerRecord({ ...timer(), accumulated_elapsed_seconds: "60" }), false,
      "the shapers convert it with Number, so text is wrong");
    assert.equal(shared.isTaskTimerRecord({ ...timer(), last_active_start_time: 0 }), false,
      "it is text or null, never a number");
    assert.equal(shared.isTaskTimerRecord(omit(timer(), "sourceMetadata")), false);
    for (const malformed of [null, undefined, 4, "timer", [timer()]]) {
      assert.equal(shared.isTaskTimerRecord(malformed), false);
    }
  });
});

describe("the resume context", () => {
  it("is one record under two names, checked as one", () => {
    const listShaper = extractFunctionBlock(timerRepoSource, "timerToTaskTimer");
    assert.match(listShaper, /resumeContext,\s+resume_context: resumeContext,/,
      "the list shaper sends the same object under both names");
    assert.match(extractFunctionBlock(timerServiceSource, "taskTimerFromUnified"),
      /resumeContext,\s+resume_context: resumeContext,/,
      "and so does the mutation shaper");
    assert.match(declarationBlock("BrowserTaskTimerRecord"),
      /\n  resumeContext: BrowserTaskTimerResumeContext;/);
    assert.match(declarationBlock("BrowserTaskTimerRecord"),
      /\n  resume_context: BrowserTaskTimerResumeContext;/);
    assert.equal(shared.isTaskTimerRecord(omit(timer(), "resume_context")), false,
      "both names are checked, because both are sent");
    assert.equal(shared.isTaskTimerRecord({ ...timer(), resumeContext: {} }), false);
  });

  it("describes the members every shaper builds", () => {
    const built = shapedMembers(timerRepoSource, "timerToTaskTimer", 4, "const resumeContext = {");
    assert.deepEqual(built.slice().sort(), declaredMembers("BrowserTaskTimerResumeContext").slice().sort(),
      "twelve members, and the contract is exactly them");
    for (const member of plain(shared.RESUME_CONTEXT_TEXT)) {
      assert.equal(shared.isTimerResumeContext({ ...resumeContext(), [member]: 4 }), false, `${member} is text`);
      assert.equal(shared.isTimerResumeContext(omit(resumeContext(), member)), false);
    }
    assert.equal(shared.isTimerResumeContext({ ...resumeContext(), lastActiveStartTime: null }), true);
    assert.equal(shared.isTimerResumeContext({ ...resumeContext(), lastActiveStartTime: 4 }), false);
    assert.equal(shared.isTimerResumeContext({ ...resumeContext(), accumulatedElapsedSeconds: "0" }), false);
    assert.equal(shared.isTimerResumeContext({ ...resumeContext(), timerStatus: "stopped" }), false);
  });
});

describe("the envelopes", () => {
  it("drops a malformed timer rather than emptying the list", () => {
    const good = timer();
    assert.deepEqual(plain(shared.readTaskTimers({ timers: [good, { active_timer_id: "t-2" }, null, "timer"] })),
      [good], "a page that cannot read one timer should still show the others");
    for (const empty of [null, undefined, "body", 4, {}, { timers: null }, { timers: {} }]) {
      assert.deepEqual(plain(shared.readTaskTimers(empty)), [],
        "both consumers already answered an absent list with none");
    }
  });

  it("answers no trusted record for a malformed singular timer", () => {
    assert.deepEqual(plain(shared.readTaskTimer({ timer: timer() })), timer());
    for (const empty of [null, undefined, "body", {}, { timer: null }, { timer: "t-1" },
      { timer: omit(timer(), "user_id") }]) {
      assert.equal(shared.readTaskTimer(empty), null,
        "the consumer already guarded with `if (result.timer)`, and that path is preserved");
    }
    assert.equal(shared.readTaskTimer({ timers: [timer()] }), null, "the member names are not interchangeable");
  });

  it("reuses the task half rather than re-parsing it", () => {
    assert.match(timerServiceSource, /task: updatedTask \|\| task,\s+timer: taskTimerFromUnified\(/,
      "the save envelope carries a task beside its timer");
    assert.match(tasksPage, /const timerTask = requireTaskRecords\(\)\.readTask\(result\);/,
      "and the page reads that half with the task reader 0.33.33.38.4.3.1 landed");
    assert.doesNotMatch(sharedSource, /TIMER_TEXT_MEMBERS[\s\S]{0,400}TASK_TEXT_MEMBERS/,
      "the timer table is not a second copy of the task table");
  });
});

describe("the transport", () => {
  it("narrows every owned read through the shared surface", () => {
    for (const [page, source] of [["tasks.js", tasksPage], ["task-dialog.js", dialogPage]]) {
      assert.match(source, /requireTaskRecords\(\)\.readTaskTimers\(/, `${page} must narrow its timer list`);
      assert.doesNotMatch(source, /\bresult\.timers\b/, `${page} must not read a raw timer list`);
      assert.doesNotMatch(source, /timersResult\.timers\b/, `${page} must not read a raw loader result`);
    }
    assert.match(tasksPage, /const savedTimer = requireTaskRecords\(\)\.readTaskTimer\(result\);/);
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/,
      "BrowserApi keeps returning a promise of unknown");
  });

  it("declares both readers on the surface that already reaches both pages", () => {
    const surface = declarationBlock("BrowserTaskRecords");
    assert.match(surface, /readTaskTimers\(body: unknown\): BrowserTaskTimerRecord\[\];/);
    assert.match(surface, /readTaskTimer\(body: unknown\): BrowserTaskTimerRecord \| null;/);
    assert.match(sharedSource, /namespace\.taskRecords = Object\.freeze\(\{[\s\S]*?readTaskTimer,[\s\S]*?\}\);/,
      "and publishes them, rather than adding a second namespace member");
    assert.doesNotMatch(sharedSource, /namespace\.taskTimers\b/);
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

/** @param {string} source @param {string} fn @param {number} indent @param {string} [from] */
function shapedMembers(source, fn, indent, from) {
  const block = extractFunctionBlock(source, fn);
  const start = from ? block.indexOf(from) : block.lastIndexOf("return {");
  assert.ok(start >= 0, `${fn} must keep building its record as an object literal`);
  const literal = block.slice(start, block.indexOf("\n  };", start));
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
function resumeContext() {
  /** @type {Record<string, unknown>} */
  const context = {
    accumulatedElapsedSeconds: 90,
    lastActiveStartTime: "2026-09-02T10:00:00.000Z",
    timerStatus: "running",
  };
  for (const member of plain(shared.RESUME_CONTEXT_TEXT)) context[member] = `${member}-value`;
  return context;
}

/** @returns {Record<string, unknown>} */
function timer() {
  /** @type {Record<string, unknown>} */
  const record = {
    accumulated_elapsed_seconds: 90,
    billable: "yes",
    last_active_start_time: "2026-09-02T10:00:00.000Z",
    resumeContext: resumeContext(),
    resume_context: resumeContext(),
    sourceMetadata: {},
    timer_status: "running",
  };
  for (const member of plain(shared.TIMER_TEXT_MEMBERS)) record[member] = `${member}-value`;
  return record;
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
