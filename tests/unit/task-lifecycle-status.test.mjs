import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import * as engine from "../../src/modules/tasks/task-block-recovery-engine.js";
import baseline from "../fixtures/task-lifecycle-status/baseline.json" with { type: "json" };

const read = createProjectTextReader().readText;
const service = read("src/modules/tasks/tasks.service.js");
const engineSource = read("src/modules/tasks/task-block-recovery-engine.js");
const statuses = ["open", "in_progress", "blocked", "complete", "archived"];

it("pins the committed pre-change fixture to the named baseline when history is available", () => {
  const args = ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`];
  const shallow = execFileSync("git", [...args, "rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  if (shallow === "true") return;
  const oldEngine = execFileSync("git", [...args, "show", `${baseline.base}:src/modules/tasks/task-block-recovery-engine.js`], { encoding: "utf8" });
  const oldService = execFileSync("git", [...args, "show", `${baseline.base}:src/modules/tasks/tasks.service.js`], { encoding: "utf8" });
  assert.equal(baseline.base, "9e7924c2107cee5d1fa410364e23c23b4911bf2e");
  assert.equal(baseline.engine, oldEngine);
  for (const [name, body] of Object.entries(baseline.service)) assert.equal(body, extractFunctionBlock(oldService, name));
});

it("keeps every recovery engine and service orchestration body identical", () => {
  for (const match of baseline.engine.matchAll(/(?:export )?function (\w+)\(/g)) {
    assert.equal(extractFunctionBlock(engineSource, match[1]), extractFunctionBlock(baseline.engine, match[1]), match[1]);
  }
  for (const [name, body] of Object.entries(baseline.service)) {
    if (name !== "normalizeStatus") assert.equal(extractFunctionBlock(service, name), body, name);
  }
});

/** @param {boolean} previous */
function normalization(previous) {
  const scope = vm.createContext({});
  const declaration = service.match(/const STATUSES = new Set\([^;]+;/)?.[0];
  assert.ok(declaration);
  vm.runInContext(declaration, scope);
  if (!previous) vm.runInContext(extractFunctionBlock(service, "isTaskLifecycleStatus"), scope);
  vm.runInContext(previous ? baseline.service.normalizeStatus : extractFunctionBlock(service, "normalizeStatus"), scope);
  return scope;
}

it("recognizes exactly the existing five values after unchanged conversion and trim", () => {
  const old = normalization(true), current = normalization(false);
  for (const value of [...statuses, "legacy", " complete ", "COMPLETE", "", null, undefined, 0, false, 7, Symbol("status")]) {
    assert.equal(current.normalizeStatus(value), old.normalizeStatus(value));
  }
  for (const value of statuses) assert.equal(current.isTaskLifecycleStatus(value), true);
  for (const value of ["legacy", " complete ", "COMPLETE", ""]) assert.equal(current.isTaskLifecycleStatus(value), false);
  assert.equal(current.normalizeStatus(" complete "), "complete");
  assert.equal(current.normalizeStatus("legacy"), "open");
});

it("preserves conversion count, receiver and original thrown value at the write boundary", () => {
  for (const previous of [true, false]) {
    const scope = normalization(previous);
    /** @type {unknown[]} */ const calls = [];
    const input = { toString() { calls.push(this); return " blocked "; } };
    assert.equal(scope.normalizeStatus(input), "blocked");
    assert.deepEqual(calls, [input]);
    const failure = new Error("conversion sentinel");
    assert.throws(() => scope.normalizeStatus({ toString() { throw failure; } }), error => error === failure);
  }
});

it("keeps unvalidated persisted statuses distinct without defaulting or trimming them", () => {
  const old = vm.createContext({});
  vm.runInContext(baseline.engine.replaceAll("export ", ""), old);
  const values = [...statuses, "legacy-a", "legacy-b", " complete ", "", null, undefined];
  for (const previous of values) for (const next of values) {
    assert.equal(engine.childStatusRollupEffect(previous, next), old.childStatusRollupEffect(previous, next));
  }
  assert.equal(engine.childStatusRollupEffect("legacy-a", "legacy-b"), "block_parents");
  assert.equal(engine.isTaskTerminalStatus(" complete "), false);
  assert.equal(engine.isIncompleteTask({ status: "legacy-a" }), true);
});

/** @param {boolean} previous @param {string[]} children */
function orchestration(previous, children) {
  /** @type {unknown[][]} */ const log = [];
  const scope = vm.createContext({ ...engine,
    tasksRepository: { async update(/** @type {unknown} */ workspace, /** @type {unknown} */ record) { log.push(["persist", workspace, record]); return record; } },
    taskTimersService: { async pauseRunningForBlockedTask(/** @type {unknown} */ record, /** @type {unknown} */ session) { log.push(["pause", record, session]); } },
    taskRelationshipsRepository: { async readBlockingChildren(/** @type {unknown} */ workspace, /** @type {unknown} */ task) { log.push(["children", workspace, task]); return children.map(child_status => ({ child_status })); } },
    async readTaggedTaskWithDetails(/** @type {unknown} */ session, /** @type {unknown} */ task) { log.push(["read", session, task]); return { hydrated: true }; },
    /** @param {unknown[]} args */
    async emitTaskEvent(...args) { log.push(["event", ...args]); },
    /** @param {unknown[]} args */
    async syncTaskSearchIndex(...args) { log.push(["search", ...args]); },
  });
  vm.runInContext('Date = class extends Date { constructor() { super("2026-09-30T00:00:00.000Z"); } };', scope);
  if (previous) vm.runInContext(baseline.engine.replaceAll("export ", ""), scope);
  for (const [name, body] of Object.entries(baseline.service).filter(([name]) => ["blockParentForChild", "pauseRunningTimersForBlockedTask", "recoverParentIfNoBlockingChildren"].includes(name))) {
    vm.runInContext(previous ? body : extractFunctionBlock(service, name), scope);
  }
  return { scope, log };
}

it("preserves persistence, timer pause, event identities and search order through real orchestration", async () => {
  const session = { workspace_id: "workspace", user_id: "user" };
  for (const status of [...statuses, "legacy-a", " complete "]) {
    for (const reason of ["", "Manual decision", `${engine.AUTO_BLOCKED_REASON_PREFIX}: Child`]) {
      for (const children of [[], ["complete"], ["legacy-b"]]) {
        const parent = { status, blocked_reason: reason, task_id: "parent", assignee_ids: ["assignee"] };
        const child = { status: "legacy-b", task_id: "child", title: "Child" };
        for (const action of ["blockParentForChild", "recoverParentIfNoBlockingChildren"]) {
          const old = orchestration(true, children), current = orchestration(false, children);
          await old.scope[action](session, parent, child);
          await current.scope[action](session, parent, child);
          assert.equal(JSON.stringify(current.log), JSON.stringify(old.log));
          const event = current.log.find(entry => entry[0] === "event");
          if (event) {
            const payload = event[2];
            assert.ok(payload && typeof payload === "object" && "previousValue" in payload && "session" in payload);
            assert.equal(payload.previousValue, parent);
            assert.equal(payload.session, session);
          }
          if (action === "blockParentForChild" && status === "legacy-a") {
            assert.deepEqual(current.log.map(entry => entry[0]), ["persist", "pause", "read", "event", "search"]);
          }
        }
      }
    }
  }
});
