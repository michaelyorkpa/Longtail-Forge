import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * How Tasks finds the handler a descriptor's behavior names.
 *
 * Both maps are closed frozen records, and the behavior string comes from a descriptor - which a
 * module contributes. Indexing one with the other reached the prototype as well as the map's own
 * keys, and all four callers treat a truthy lookup as a handler and call it.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const tasks = read("public/js/tasks.js");

/** @param {string} opener */
function slice(opener) {
  const start = tasks.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = tasks.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return tasks.slice(start, end + 4);
}

/** @param {string} name */
function constBlock(name) {
  const start = tasks.indexOf("  const " + name + " = ");
  assert.notEqual(start, -1, name + " must exist");
  const end = tasks.indexOf("\n  });", start);
  assert.notEqual(end, -1, name + " must terminate");
  return tasks.slice(start, end + 7);
}

/**
 * Both readers over both shipped maps, with every handler replaced by a recorder so the lookup is
 * what is under test rather than the behaviors.
 */
function lookups() {
  /** @type {string[]} */
  const calls = [];
  const stubs = [
    "const postTaskAction = (...args) => { calls.push(['postTaskAction', ...args].join(':')); };",
    "const openTaskDialogForBlock = () => calls.push('openTaskDialogForBlock');",
    "const updateTaskLifecycleStatus = () => calls.push('updateTaskLifecycleStatus');",
    "const openTaskDialogForWorkflow = () => calls.push('openTaskDialogForWorkflow');",
    "const saveTaskTimerAction = () => calls.push('saveTaskTimerAction');",
  ];
  const built = new Function("calls", [
    ...stubs,
    constBlock("TASK_LIFECYCLE_BEHAVIOR_HANDLERS"),
    constBlock("TASK_WORKFLOW_BEHAVIOR_HANDLERS"),
    slice("function taskLifecycleBehaviorHandler(behavior) {"),
    slice("function taskWorkflowBehaviorHandler(behavior) {"),
    "return { taskLifecycleBehaviorHandler, taskWorkflowBehaviorHandler,"
    + " TASK_LIFECYCLE_BEHAVIOR_HANDLERS, TASK_WORKFLOW_BEHAVIOR_HANDLERS };",
  ].join("\n"))(calls);
  return { ...built, calls };
}

describe("a behavior finds only the handler its own map declares", () => {
  it("answers each declared lifecycle behavior with that map's own handler", () => {
    const host = lookups();
    const declared = Object.keys(host.TASK_LIFECYCLE_BEHAVIOR_HANDLERS);
    assert.equal(declared.length, 6, "six lifecycle behaviors");
    for (const behavior of declared) {
      assert.equal(
        host.taskLifecycleBehaviorHandler(behavior),
        host.TASK_LIFECYCLE_BEHAVIOR_HANDLERS[behavior],
        behavior + " resolves to its own handler, by identity",
      );
    }
  });

  it("answers each declared workflow behavior with that map's own handler", () => {
    const host = lookups();
    const declared = Object.keys(host.TASK_WORKFLOW_BEHAVIOR_HANDLERS);
    assert.equal(declared.length, 7, "seven workflow behaviors");
    for (const behavior of declared) {
      assert.equal(
        host.taskWorkflowBehaviorHandler(behavior),
        host.TASK_WORKFLOW_BEHAVIOR_HANDLERS[behavior],
        behavior + " resolves to its own handler, by identity",
      );
    }
  });

  it("keeps the two vocabularies apart", () => {
    const host = lookups();
    assert.equal(host.taskLifecycleBehaviorHandler("tasks.workflow.assign"), undefined);
    assert.equal(host.taskWorkflowBehaviorHandler("tasks.lifecycle.complete"), undefined);
  });

  it("answers nothing for a behavior no map declares", () => {
    const host = lookups();
    for (const absent of ["", "tasks.lifecycle", "tasks.lifecycle.completed", "unknown"]) {
      assert.equal(host.taskLifecycleBehaviorHandler(absent), undefined, JSON.stringify(absent));
      assert.equal(host.taskWorkflowBehaviorHandler(absent), undefined, JSON.stringify(absent));
    }
  });

  it("does not turn an inherited property into a callable handler", () => {
    // This is what the old lookup did: `map.toString` is a function, and every caller treats a
    // truthy lookup as a handler. A contributed descriptor naming one would have been dispatched.
    const host = lookups();
    for (const inherited of [
      "toString", "valueOf", "constructor", "hasOwnProperty", "isPrototypeOf",
      "propertyIsEnumerable", "toLocaleString", "__proto__", "__defineGetter__",
    ]) {
      assert.equal(typeof host.TASK_LIFECYCLE_BEHAVIOR_HANDLERS[inherited] === "function"
        || inherited === "__proto__", true, inherited + " really is reachable through the prototype");
      assert.equal(host.taskLifecycleBehaviorHandler(inherited), undefined, inherited + " is not a behavior");
      assert.equal(host.taskWorkflowBehaviorHandler(inherited), undefined, inherited + " is not a behavior");
    }
  });

  it("answers nothing for a behavior that is not a string at all", () => {
    const host = lookups();
    for (const value of [undefined, null, 0, 1, true, {}, [], Symbol.iterator]) {
      assert.equal(host.taskLifecycleBehaviorHandler(value), undefined, String(value));
      assert.equal(host.taskWorkflowBehaviorHandler(value), undefined, String(value));
    }
  });

  it("still runs the handler it found", async () => {
    const host = lookups();
    const handler = host.taskLifecycleBehaviorHandler("tasks.lifecycle.reopen");
    assert.equal(typeof handler, "function");
    await handler({ record: { task_id: "task-1" } });
    assert.deepEqual(host.calls, ["postTaskAction:[object Object]:reopen"]);
  });
});

describe("the callers keep the behavior they had for an unknown handler", () => {
  it("skips registration rather than registering nothing", () => {
    for (const opener of ["function registerTaskLifecycleBehaviors() {",
      "function registerTaskWorkflowBehaviors() {"]) {
      const body = slice(opener);
      assert.match(body, /if \(handler\) \{\s*\n\s*requireDescriptorRenderers\(\)\.registerBehavior\(action\.behavior, handler\)/,
        opener + " registers only what it found");
    }
  });

  it("reports the missing behavior and returns, in both dispatchers", () => {
    for (const [opener, label] of [
      ["async function runTaskLifecycleAction(action, task, trigger = null) {", "lifecycle"],
      ["async function runTaskWorkflowAction(action, task, trigger = null) {", "workflow"],
    ]) {
      const body = slice(opener);
      assert.match(body, new RegExp("if \\(!handler\\) \\{[\\s\\S]*?Missing task " + label
        + " behavior: \\$\\{action\\.behavior\\}[\\s\\S]*?return;"), label + " keeps its missing-behavior status");
    }
  });

  it("hands every handler the same six-member context, by name", () => {
    for (const opener of ["async function runTaskLifecycleAction(action, task, trigger = null) {",
      "async function runTaskWorkflowAction(action, task, trigger = null) {"]) {
      const body = slice(opener);
      assert.match(body, /const context = \{[\s\S]*?action,[\s\S]*?api,[\s\S]*?record: task,[\s\S]*?refresh: reloadTaskList,[\s\S]*?trigger,[\s\S]*?workspaceContext:[\s\S]*?\};/);
      assert.match(body, /await handler\(context\);/, "and passes it unchanged");
    }
  });
});

describe("the maps themselves are unchanged", () => {
  it("keeps both vocabularies closed and frozen", () => {
    for (const name of ["TASK_LIFECYCLE_BEHAVIOR_HANDLERS", "TASK_WORKFLOW_BEHAVIOR_HANDLERS"]) {
      const block = constBlock(name);
      assert.match(block, new RegExp("const " + name + " = Object\\.freeze\\(\\{"));
      assert.ok(!/\[key: string\]|\[behavior\]/.test(block), name + " declares its keys and nothing else");
    }
  });

  it("keeps every behavior string the descriptors dispatch on", () => {
    const host = lookups();
    assert.deepEqual(Object.keys(host.TASK_LIFECYCLE_BEHAVIOR_HANDLERS).sort(), [
      "tasks.lifecycle.archive", "tasks.lifecycle.block", "tasks.lifecycle.complete",
      "tasks.lifecycle.reopen", "tasks.lifecycle.restore", "tasks.lifecycle.resume",
    ]);
    assert.deepEqual(Object.keys(host.TASK_WORKFLOW_BEHAVIOR_HANDLERS).sort(), [
      "tasks.workflow.assign", "tasks.workflow.due-date", "tasks.workflow.due-time",
      "tasks.workflow.recurrence", "tasks.workflow.timer.pause", "tasks.workflow.timer.resume",
      "tasks.workflow.timer.start",
    ]);
  });

  it("reads each map where its own type is known, with no cast and no dictionary", () => {
    for (const [opener, map] of [
      ["function taskLifecycleBehaviorHandler(behavior) {", "TASK_LIFECYCLE_BEHAVIOR_HANDLERS"],
      ["function taskWorkflowBehaviorHandler(behavior) {", "TASK_WORKFLOW_BEHAVIOR_HANDLERS"],
    ]) {
      const body = slice(opener);
      assert.match(body, new RegExp("Object\\.entries\\(" + map + "\\)"), "walks its own entries");
      assert.ok(!/@type \{[^}]*\} \(/.test(body), "with no cast");
      assert.ok(!/keyof/.test(body), "and no key assertion");
      assert.ok(!new RegExp(map + "\\[").test(body), "and no indexing");
    }
    assert.ok(!/Record<string, TaskBehaviorHandler>/.test(tasks),
      "no arbitrary-string dictionary replaced the closed vocabulary");
  });
});
