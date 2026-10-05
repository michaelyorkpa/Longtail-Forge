// `0.33.33.45.2`: the shared record-indexer orchestration against the six copies it replaced.
//
// Both sides run in sandboxes against the same logging stubs: the committed baseline body of each
// module indexer, and the new wiring (the shared helper's source plus the module's new indexer and
// any local reader). The stubs record every repository call with its receiver and arguments,
// every builder start and finish, and every read of the reference, so the comparison covers what
// was read, in what order, one at a time or not, and what came back or was thrown.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import baseline from "../fixtures/record-indexer-orchestration/baseline.json" with { type: "json" };

/** @typedef {(...args: unknown[]) => unknown} LiftedFunction */
/** @typedef {{ id: string, status?: string, documentless?: boolean, failBuild?: boolean }} StubRecord */
/** @typedef {{ value: unknown } | { error: unknown }} Outcome */
/**
 * @typedef {{
 *   file: string,
 *   indexer: string,
 *   repository: string,
 *   builder: string,
 *   bulkMethod: string,
 *   bulkArgs: unknown[],
 *   localReaders: string[],
 *   skipsDeleted: boolean,
 *   omitsDocumentless: boolean,
 * }} IndexerCase
 */

const read = createProjectTextReader().readText;
/** @type {Record<string, Record<string, string>>} */
const baselineIndexers = baseline.indexers;
const helperSource = extractFunctionBlock(read("src/core/search/record-indexer.js"), "indexSearchReference");

/** @type {IndexerCase[]} */
const CASES = [
  { file: "src/modules/lists/search-indexers.js", indexer: "indexListRecord", repository: "listsRepository", builder: "listToSearchDocument", bulkMethod: "list", bulkArgs: [{ includeDeleted: false }], localReaders: ["readIndexableList"], skipsDeleted: true, omitsDocumentless: false },
  { file: "src/modules/tasks/search-indexers.js", indexer: "indexTaskRecord", repository: "tasksRepository", builder: "taskToSearchDocument", bulkMethod: "readAll", bulkArgs: [], localReaders: [], skipsDeleted: false, omitsDocumentless: false },
  { file: "src/modules/notes/search-indexers.js", indexer: "indexNoteRecord", repository: "notesRepository", builder: "noteToSearchDocument", bulkMethod: "list", bulkArgs: [{ includeDeleted: false }], localReaders: [], skipsDeleted: false, omitsDocumentless: true },
  { file: "src/modules/time-tracking/search-indexers.js", indexer: "indexTimeEntryRecord", repository: "timeEntriesRepository", builder: "timeEntryToSearchDocument", bulkMethod: "readAll", bulkArgs: [], localReaders: [], skipsDeleted: false, omitsDocumentless: false },
  { file: "src/modules/client-projects/search-indexers.js", indexer: "indexClientRecord", repository: "clientsRepository", builder: "clientToSearchDocument", bulkMethod: "readAll", bulkArgs: [], localReaders: [], skipsDeleted: false, omitsDocumentless: false },
  { file: "src/modules/client-projects/search-indexers.js", indexer: "indexProjectRecord", repository: "projectsRepository", builder: "projectToSearchDocument", bulkMethod: "readAll", bulkArgs: [], localReaders: [], skipsDeleted: false, omitsDocumentless: false },
];

/**
 * The stubs one run shares: a repository whose reads are logged with their receiver, and a
 * builder whose start and finish are logged around an awaited timer turn, so overlapping builds
 * would interleave in the log.
 * @param {IndexerCase} testCase @param {{ all: StubRecord[], one: StubRecord | null | undefined, readFailure?: Error }} data
 */
function createStubs(testCase, data) {
  /** @type {string[]} */
  const log = [];
  /** @type {Map<StubRecord, object>} */
  const documents = new Map();
  /** @type {Record<string, unknown>} */
  const repository = {};
  /** @param {string} method */
  const reader = (method) => {
    /** @this {unknown} @param {unknown[]} args */
    return async function readStub(...args) {
      log.push(`${method}(${JSON.stringify(args)})${this === repository ? "" : " on another receiver"}`);
      if (data.readFailure) throw data.readFailure;
      return method === "readById" ? data.one : data.all;
    };
  };
  repository[testCase.bulkMethod] = reader(testCase.bulkMethod);
  repository.readById = reader("readById");
  /** @param {StubRecord} record */
  const builder = async (record) => {
    log.push(`build:start:${record.id}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (record.failBuild) {
      log.push(`build:fail:${record.id}`);
      throw buildFailure;
    }
    log.push(`build:end:${record.id}`);
    if (record.documentless) return null;
    const document = { documentFor: record.id };
    documents.set(record, document);
    return document;
  };
  return { log, documents, globals: { [testCase.repository]: repository, [testCase.builder]: builder } };
}

const buildFailure = new Error("builder failure sentinel");

/** @param {string[]} bodies @param {string} name @param {Record<string, unknown>} globals @returns {LiftedFunction} */
function lift(bodies, name, globals) {
  const scope = vm.createContext({ ...globals, setTimeout });
  for (const body of bodies) vm.runInContext(body, scope);
  const lifted = vm.runInContext(name, scope);
  if (typeof lifted !== "function") throw new Error(`${name} did not lift to a function`);
  return (...args) => Reflect.apply(lifted, undefined, args);
}

/** @param {IndexerCase} testCase @param {Record<string, unknown>} globals */
function liftBaseline(testCase, globals) {
  return lift([baselineIndexers[testCase.file][testCase.indexer]], testCase.indexer, globals);
}

/** @param {IndexerCase} testCase @param {Record<string, unknown>} globals */
function liftCurrent(testCase, globals) {
  const source = read(testCase.file);
  const bodies = [helperSource, extractFunctionBlock(source, testCase.indexer), ...testCase.localReaders.map((name) => extractFunctionBlock(source, name))];
  return lift(bodies, testCase.indexer, globals);
}

/** @param {() => unknown} run @returns {Promise<Outcome>} */
async function settle(run) {
  try {
    return { value: await run() };
  } catch (error) {
    return { error };
  }
}

/**
 * A reference whose reads are logged, so both sides can be shown to read the same members.
 * @param {string[]} log @param {string | undefined} recordId
 */
function loggedReference(log, recordId) {
  return new Proxy({ workspaceId: "workspace-1", recordId, extra: "unread" }, {
    get(target, key, receiver) { log.push(`reference.${String(key)}`); return Reflect.get(target, key, receiver); },
  });
}

/**
 * Run one scenario on both sides and compare everything observable.
 * @param {IndexerCase} testCase @param {string} label @param {string | undefined} recordId
 * @param {{ all: StubRecord[], one: StubRecord | null | undefined, readFailure?: Error }} data
 */
async function compare(testCase, label, recordId, data) {
  const before = createStubs(testCase, data);
  const after = createStubs(testCase, data);
  const beforeOutcome = await settle(() => liftBaseline(testCase, before.globals)(loggedReference(before.log, recordId)));
  const afterOutcome = await settle(() => liftCurrent(testCase, after.globals)(loggedReference(after.log, recordId)));
  const where = `${testCase.indexer} ${label}`;
  assert.deepEqual(after.log, before.log, `${where}: the same reads, builds and order`);
  if ("error" in beforeOutcome) {
    assert.ok("error" in afterOutcome, `${where}: still fails`);
    assert.equal(afterOutcome.error, beforeOutcome.error, `${where}: the original error propagates`);
    return { before, after, beforeOutcome, afterOutcome };
  }
  assert.ok("value" in afterOutcome, `${where}: still succeeds`);
  assert.equal(JSON.stringify(afterOutcome.value), JSON.stringify(beforeOutcome.value), `${where}: the same answer`);
  return { before, after, beforeOutcome, afterOutcome };
}

/** @param {unknown} value @returns {unknown[]} */
function documentsOf(value) {
  if (!value || typeof value !== "object" || !("documents" in value) || !Array.isArray(value.documents)) throw new Error("not a bulk answer");
  return value.documents;
}

it("pins the committed baseline to the named base commit when history is available", () => {
  const args = ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`];
  const shallow = execFileSync("git", [...args, "rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  if (shallow === "true") return;
  assert.equal(baseline.base, "422ba20251644dc997ea6624411f7058711139d8");
  for (const [file, indexers] of Object.entries(baselineIndexers)) {
    /** @type {string} */
    const source = execFileSync("git", [...args, "show", `${baseline.base}:${file}`], { encoding: "utf8" });
    for (const [name, body] of Object.entries(indexers)) assert.equal(body, extractFunctionBlock(source, name), `${file} ${name}`);
  }
});

it("wires every module indexer through the shared orchestration, and the helper imports no module", () => {
  const helperFile = read("src/core/search/record-indexer.js");
  assert.doesNotMatch(helperFile, /^import /m, "the orchestration imports nothing, so no module policy can reach it");
  assert.doesNotMatch(helperFile, /Promise\.(?:all|allSettled|race|any)\b|catch\s*\(/, "nothing runs in parallel and nothing is caught");
  for (const testCase of CASES) {
    const source = read(testCase.file);
    assert.match(source, /import \{ indexSearchReference \} from "\.\.\/\.\.\/core\/search\/record-indexer\.js";/, testCase.file);
    const indexer = extractFunctionBlock(source, testCase.indexer);
    assert.match(indexer, /return indexSearchReference\(reference, \{/, `${testCase.indexer} delegates to the shared orchestration`);
    assert.match(indexer, new RegExp(`toDocument: ${testCase.builder},`), `${testCase.indexer} keeps its own builder`);
  }
});

it("records why omitting a documentless record changes nothing outside Notes: every other builder always answers a document", () => {
  for (const testCase of CASES.filter((entry) => !entry.omitsDocumentless)) {
    const builder = extractFunctionBlock(read(testCase.file), testCase.builder);
    const returns = builder.match(/\breturn\b/g) || [];
    assert.equal(returns.length, 1, `${testCase.builder} has one return`);
    assert.match(builder, /\breturn \{/, `${testCase.builder} returns an object literal`);
  }
});

it("answers the bulk path exactly as each copy did, building one record at a time in order", async () => {
  for (const testCase of CASES) {
    for (const recordId of [undefined, ""]) {
      const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
      const { after, afterOutcome } = await compare(testCase, `bulk (recordId ${JSON.stringify(recordId)})`, recordId, { all: records, one: null });
      assert.deepEqual(
        after.log.filter((entry) => entry.startsWith("build:")),
        ["build:start:a", "build:end:a", "build:start:b", "build:end:b", "build:start:c", "build:end:c"],
        `${testCase.indexer}: sequential builds`,
      );
      assert.ok("value" in afterOutcome);
      const documents = documentsOf(afterOutcome.value);
      records.forEach((record, index) => assert.equal(documents[index], after.documents.get(record), `${testCase.indexer}: the builder's own document objects, in order`));
      assert.deepEqual(after.log.filter((entry) => entry.startsWith("reference.")), ["reference.workspaceId", "reference.recordId"], `${testCase.indexer}: the reference is read once per member, in order`);
      assert.equal(after.log.find((entry) => !entry.startsWith("reference.")), `${testCase.bulkMethod}(${JSON.stringify(["workspace-1", ...testCase.bulkArgs])})`, `${testCase.indexer}: the same bulk read`);
      assert.ok(!after.log.some((entry) => entry.includes("another receiver")), `${testCase.indexer}: repository methods keep their receiver`);
    }
    await compare(testCase, "bulk with no records", undefined, { all: [], one: null });
  }
});

it("answers the single-record path exactly as each copy did, including missing and ineligible records", async () => {
  for (const testCase of CASES) {
    const found = await compare(testCase, "single found", "r1", { all: [], one: { id: "r1" } });
    assert.ok("value" in found.afterOutcome);
    assert.ok("value" in found.beforeOutcome);
    assert.deepEqual(
      found.after.log.filter((entry) => !entry.startsWith("reference.")),
      [`readById(${JSON.stringify(["workspace-1", "r1"])})`, "build:start:r1", "build:end:r1"],
      `${testCase.indexer}: one read by id, then one build`,
    );
    for (const missing of [null, undefined]) {
      const absent = await compare(testCase, `single ${String(missing)}`, "r1", { all: [], one: missing });
      assert.ok("value" in absent.afterOutcome && absent.afterOutcome.value === null, `${testCase.indexer}: a missing record answers null`);
      assert.ok(!absent.after.log.some((entry) => entry.startsWith("build:")), `${testCase.indexer}: nothing is built for a missing record`);
    }
    const deleted = await compare(testCase, "single deleted", "r1", { all: [], one: { id: "r1", status: "deleted" } });
    assert.ok("value" in deleted.afterOutcome);
    if (testCase.skipsDeleted) {
      assert.equal(deleted.afterOutcome.value, null, "Lists answers null for a deleted list");
      assert.ok(!deleted.after.log.some((entry) => entry.startsWith("build:")), "Lists builds nothing for a deleted list");
    } else {
      assert.notEqual(deleted.afterOutcome.value, null, `${testCase.indexer} leaves a deleted status to its builder, as before`);
    }
  }
});

it("omits Notes' documentless records from a rebuild and answers null for one, exactly as Notes did", async () => {
  const notes = CASES.filter((entry) => entry.omitsDocumentless);
  assert.equal(notes.length, 1);
  for (const testCase of notes) {
    const bulk = await compare(testCase, "bulk with a documentless note", undefined, { all: [{ id: "a" }, { id: "hidden", documentless: true }, { id: "c" }], one: null });
    assert.ok("value" in bulk.afterOutcome);
    assert.equal(documentsOf(bulk.afterOutcome.value).length, 2, "the documentless note is left out");
    const single = await compare(testCase, "single documentless note", "hidden", { all: [], one: { id: "hidden", documentless: true } });
    assert.ok("value" in single.afterOutcome && single.afterOutcome.value === null);
  }
});

it("propagates a builder or reader failure unchanged, and stops at the failure", async () => {
  for (const testCase of CASES) {
    const bulk = await compare(testCase, "bulk builder failure", undefined, { all: [{ id: "a" }, { id: "b", failBuild: true }, { id: "c" }], one: null });
    assert.ok("error" in bulk.afterOutcome && bulk.afterOutcome.error === buildFailure);
    assert.ok(!bulk.after.log.includes("build:start:c"), `${testCase.indexer}: nothing after the failure is built`);
    const single = await compare(testCase, "single builder failure", "b", { all: [], one: { id: "b", failBuild: true } });
    assert.ok("error" in single.afterOutcome && single.afterOutcome.error === buildFailure);
    const readFailure = new Error("reader failure sentinel");
    for (const recordId of [undefined, "r1"]) {
      const failed = await compare(testCase, `reader failure (${String(recordId)})`, recordId, { all: [], one: null, readFailure });
      assert.ok("error" in failed.afterOutcome && failed.afterOutcome.error === readFailure);
    }
  }
});
