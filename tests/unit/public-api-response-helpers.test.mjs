// `0.33.33.45.1`: the shared public API response helpers against every copy they replaced.
//
// The baseline bodies are a committed fixture, pinned to the base commit when history is
// available, so this suite never needs git history to run. Each baseline copy is lifted into its
// own sandbox and compared with the shared helper across the same inputs. Results cross realms,
// so they are compared by serialisation and by identity rather than by deep equality, and a
// lifted function's answer is `unknown` until a check narrows it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { pagePublicApiItems, publicApiData, publicApiList, withWorkspaceFallback } from "../../src/core/public-api-responses.js";
import baseline from "../fixtures/public-api-helpers/baseline.json" with { type: "json" };

/** @typedef {(...args: unknown[]) => unknown} LiftedFunction */
/** @typedef {{ value: unknown } | { error: unknown }} Outcome */

const read = createProjectTextReader().readText;
/** @type {Record<string, Record<string, string>>} */
const baselineHelpers = baseline.helpers;
const ROUTE_FILES = [
  "src/routes/public-api.routes.js",
  "src/modules/lists/public-api.routes.js",
  "src/modules/notes/public-api.routes.js",
  "src/modules/tasks/public-api.routes.js",
  "src/modules/time-tracking/public-api.routes.js",
];
const SERVICE_FILES = [
  "src/services/public-api.service.js",
  "src/modules/lists/public-api.service.js",
  "src/modules/notes/public-api.service.js",
  "src/modules/tasks/public-api.service.js",
  "src/modules/time-tracking/public-api.service.js",
];
const SHARED_ALIAS_FILES = [
  "src/modules/lists/public-api.service.js",
  "src/modules/notes/public-api.service.js",
  "src/modules/time-tracking/public-api.service.js",
];
const LOCAL_ALIAS_FILES = ["src/services/public-api.service.js", "src/modules/tasks/public-api.service.js"];

/**
 * Run function declarations in one fresh sandbox and hand each back as a function whose answer
 * is `unknown`, which is all a sandboxed body can promise.
 * @param {string[]} bodies @param {string} name @returns {LiftedFunction}
 */
function lift(bodies, name) {
  const scope = vm.createContext({});
  for (const body of bodies) vm.runInContext(body, scope);
  const lifted = vm.runInContext(name, scope);
  if (typeof lifted !== "function") throw new Error(`${name} did not lift to a function`);
  return (...args) => Reflect.apply(lifted, undefined, args);
}

/** @param {string} file @param {string[]} names @param {string} name */
function liftBaseline(file, names, name) {
  return lift(names.map((helper) => baselineHelpers[file][helper]), name);
}

/** @param {() => unknown} run @returns {Outcome} */
function outcome(run) {
  try {
    return { value: run() };
  } catch (error) {
    return { error };
  }
}

/** @param {unknown} value */
function serialise(value) {
  return JSON.stringify(value, (key, entry) => (typeof entry === "bigint" ? `${entry}n` : typeof entry === "symbol" ? String(entry) : entry));
}

/** @param {unknown} value @returns {unknown[]} */
function pageData(value) {
  if (!value || typeof value !== "object" || !("data" in value) || !Array.isArray(value.data)) throw new Error("not a page");
  return value.data;
}

/** @param {unknown} value @returns {unknown} */
function workspaceOf(value) {
  if (!value || typeof value !== "object" || !("workspace_id" in value)) throw new Error("no workspace_id");
  return value.workspace_id;
}

/**
 * A record whose `workspace_id` answers a new value on every read, behind a proxy that logs
 * every trap the copy triggers.
 * @param {string[]} log
 */
function changingRecord(log) {
  let reads = 0;
  /** @type {{ id: string, workspace_id?: unknown }} */
  const target = { id: "r" };
  Object.defineProperty(target, "workspace_id", { enumerable: true, get() { reads += 1; return `read-${reads}`; } });
  return new Proxy(target, {
    get(inner, key, receiver) { log.push(`get:${String(key)}`); return Reflect.get(inner, key, receiver); },
    ownKeys(inner) { log.push("ownKeys"); return Reflect.ownKeys(inner); },
    getOwnPropertyDescriptor(inner, key) { log.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(inner, key); },
  });
}

it("pins the committed baseline to the named base commit when history is available", () => {
  const args = ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`];
  const shallow = execFileSync("git", [...args, "rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  if (shallow === "true") return;
  assert.equal(baseline.base, "aeeae78ca762337fdc5a732878e693e2e0e255e0");
  for (const [file, helpers] of Object.entries(baselineHelpers)) {
    /** @type {string} */
    const source = execFileSync("git", [...args, "show", `${baseline.base}:${file}`], { encoding: "utf8" });
    for (const [name, body] of Object.entries(helpers)) assert.equal(body, extractFunctionBlock(source, name), `${file} ${name}`);
  }
});

it("adopts the shared helpers everywhere they were copied, and leaves the two different aliases local and unchanged", () => {
  for (const file of ROUTE_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /function publicApi(?:Data|List)\(/, `${file} must not keep its own envelope`);
    assert.match(source, /import \{ publicApiData, publicApiList \} from "[./]+core\/public-api-responses\.js";/, file);
  }
  for (const file of SERVICE_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /function (?:paged|clampInteger)\(/, `${file} must not keep its own pager`);
    assert.match(source, /\bpagePublicApiItems\(/, file);
  }
  for (const file of SHARED_ALIAS_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /function withWorkspaceAlias\(/, file);
    assert.match(source, /\bwithWorkspaceFallback\(/, file);
  }
  for (const file of LOCAL_ALIAS_FILES) {
    assert.equal(extractFunctionBlock(read(file), "withWorkspaceAlias"), baselineHelpers[file].withWorkspaceAlias, `${file} keeps its own alias unchanged`);
  }
});

it("answers every envelope exactly as each copy did, reading the same members in the same order", () => {
  const dataValues = [{ id: "a" }, [{ id: "b" }], null, undefined, 0, "", "text", { nested: { deep: [1, 2] } }];
  for (const file of ROUTE_FILES) {
    const oldData = liftBaseline(file, ["publicApiData"], "publicApiData");
    const oldList = liftBaseline(file, ["publicApiList"], "publicApiList");
    for (const data of dataValues) {
      const context = { workspace_id: "workspace-1" };
      const before = oldData(data, context);
      const after = publicApiData(data, context);
      assert.equal(serialise(after), serialise(before), `${file} data envelope`);
      assert.ok(before && typeof before === "object" && "data" in before);
      assert.equal(after.data, before.data, `${file} passes the same data through`);
    }
    /** @param {string[]} log */
    const logged = (log) => ({
      result: new Proxy({ data: [{ id: "x" }], pagination: { limit: 1 } }, { get(target, key, receiver) { log.push(`result.${String(key)}`); return Reflect.get(target, key, receiver); } }),
      context: new Proxy({ workspace_id: "workspace-2" }, { get(target, key, receiver) { log.push(`context.${String(key)}`); return Reflect.get(target, key, receiver); } }),
    });
    /** @type {string[]} */
    const beforeLog = [];
    /** @type {string[]} */
    const afterLog = [];
    const beforeInputs = logged(beforeLog);
    const afterInputs = logged(afterLog);
    const before = oldList(beforeInputs.result, beforeInputs.context);
    const after = publicApiList(afterInputs.result, afterInputs.context);
    assert.equal(serialise(after), serialise(before), `${file} list envelope`);
    assert.deepEqual(afterLog, beforeLog, `${file} reads the same members in the same order`);
    assert.deepEqual(afterLog, ["context.workspace_id", "result.data", "result.pagination"]);
  }
});

it("pages exactly as both pager spellings did, including conversion hooks and failures", () => {
  /** @type {string[]} */
  let log = [];
  /** @param {string} label @param {string} answer */
  const hook = (label, answer) => ({ toString() { log.push(`${label}.toString`); return answer; }, valueOf() { log.push(`${label}.valueOf`); return 999; } });
  const failure = new Error("conversion sentinel");
  /** @type {unknown[]} */
  const values = [
    undefined, null, "", " ", "abc", "12abc", " 12 ", "5", "5.9", "-3", "0", "1000", 0, -1, 7, 7.9, 150, 1e21, Infinity, -Infinity, NaN,
    true, false, [3], [], {}, 5n, Symbol("limit"), "0x10", "1e3",
    () => hook("hook", "8"),
    () => ({ toString() { log.push("throw.toString"); throw failure; } }),
  ];
  /** @type {unknown[]} */
  const offsets = [undefined, "0", 10, "200", -4, () => hook("offset", "3")];
  const itemSets = [0, 1, 5, 49, 50, 51, 100, 150].map((length) => Array.from({ length }, (_, index) => ({ index })));
  for (const file of SERVICE_FILES) {
    const oldPaged = liftBaseline(file, ["clampInteger", "paged"], "paged");
    for (const items of itemSets) {
      for (const rawLimit of values) {
        for (const rawOffset of offsets) {
          const limit = typeof rawLimit === "function" ? rawLimit() : rawLimit;
          const offset = typeof rawOffset === "function" ? rawOffset() : rawOffset;
          log = [];
          const before = outcome(() => oldPaged(items, { limit, offset }));
          const beforeLog = log;
          log = [];
          const after = outcome(() => pagePublicApiItems(items, { limit, offset }));
          assert.deepEqual(log, beforeLog, `${file}: the same conversion hooks run, in order`);
          if ("error" in before) {
            assert.ok("error" in after, `${file}: a conversion failure still fails`);
            assert.equal(after.error, before.error, `${file}: the original error propagates`);
            continue;
          }
          assert.ok("value" in after);
          assert.equal(serialise(after.value), serialise(before.value), `${file}: same page for limit ${String(limit)} offset ${String(offset)}`);
          const afterItems = pageData(after.value);
          const beforeItems = pageData(before.value);
          assert.equal(afterItems.length, beforeItems.length);
          afterItems.forEach((item, index) => assert.equal(item, beforeItems[index], `${file}: the same item objects, in order`));
        }
      }
    }
  }
});

it("aliases the workspace exactly as Lists, Notes and Time Tracking did, including the read order on getter-backed records", () => {
  const context = { workspace_id: "fallback-workspace" };
  const sharedBody = extractFunctionBlock(read("src/core/public-api-responses.js"), "withWorkspaceFallback");
  const liftedShared = lift([sharedBody], "withWorkspaceFallback");
  /** @type {unknown[]} */
  const nonRecords = [null, undefined, 0, "", "text", false, 1, Symbol("s"), () => "fn"];
  const records = [{}, { workspace_id: "own" }, { workspace_id: "" }, { workspace_id: 0 }, { workspace_id: null }, { id: "r", workspace_id: "own", extra: [1] }];
  for (const file of SHARED_ALIAS_FILES) {
    const old = liftBaseline(file, ["withWorkspaceAlias"], "withWorkspaceAlias");
    // A value that is not a record is outside every copy's admitted type; the shared body is run
    // the same way the baseline is, to show its runtime guard still passes such a value through.
    for (const value of nonRecords) {
      assert.equal(old(value, context), value, `${file}: the baseline passes a non-object through`);
      assert.equal(liftedShared(value, context), value, `${file}: the shared helper passes it through too`);
    }
    for (const record of records) {
      const before = old(record, context);
      const after = withWorkspaceFallback(record, context);
      assert.equal(serialise(after), serialise(before), `${file}: same aliased record`);
      assert.notEqual(after, record, `${file}: a record is copied, not mutated`);
    }
    /** @type {string[]} */
    const beforeLog = [];
    /** @type {string[]} */
    const afterLog = [];
    const before = old(changingRecord(beforeLog), context);
    const after = withWorkspaceFallback(changingRecord(afterLog), context);
    assert.deepEqual(afterLog, beforeLog, `${file}: the same traps run in the same order`);
    assert.equal(after.workspace_id, workspaceOf(before), `${file}: the retained workspace is the same read`);
    assert.equal(after.workspace_id, "read-2", "spread first, then the explicit read wins");
  }
});

it("records why the Tasks alias stays local: a getter-backed record keeps a different workspace under its order", () => {
  const tasksAlias = liftBaseline("src/modules/tasks/public-api.service.js", ["withWorkspaceAlias"], "withWorkspaceAlias");
  assert.equal(workspaceOf(tasksAlias(changingRecord([]), { workspace_id: "w" })), "read-1");
  assert.equal(withWorkspaceFallback(changingRecord([]), { workspace_id: "w" }).workspace_id, "read-2");
});
