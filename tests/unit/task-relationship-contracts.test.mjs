import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/tasks/tasks.service.js");
const repo = read("src/modules/tasks/task-relationships.repo.js");
const routes = read("src/modules/tasks/tasks.routes.js");
const consumer = read("public/js/task-dialog.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** Member names of an object literal, shorthand properties included. @param {string} literal */
function membersOf(literal) {
  return [...literal.matchAll(/(?:^|[{,])\s*([A-Za-z_]\w*)\s*(?=[:,}])/g)].map((entry) => entry[1]).sort();
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.search(new RegExp("export interface " + name + "(?: extends \\w+)? \\{"));
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredMembers(name) {
  return [...declaredInterface(name).matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shipped reader block, instantiated from the page's own source. */
function shippedReader() {
  const start = consumer.indexOf("  /** The two directions the producer writes from one comparison.");
  const end = consumer.indexOf("  async function readCurrentParentTaskId(taskId) {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above readCurrentParentTaskId");
  return new Function(consumer.slice(start, end) + `
    return {
      isTaskRelationship,
      readTaskRelationships,
      directions: TASK_RELATIONSHIP_DIRECTIONS,
      relationshipText: TASK_RELATIONSHIP_TEXT_MEMBERS,
      relatedText: RELATED_TASK_TEXT_MEMBERS,
    };`)();
}

const summary = (overrides = {}) => ({
  client_id: "client_1",
  client_name: "Northwind",
  estimate_minutes: 45,
  project_id: "project_2",
  project_name: "Migration",
  status: "in_progress",
  task_id: "task_parent",
  title: "Parent task",
  url: "tasks.html?task=task_parent",
  ...overrides,
});

/**
 * A relationship built the way the producer builds one.
 * @param {Record<string, unknown>} [overrides]
 */
function makeRelationship(overrides = {}) {
  const readable = overrides.related_task_readable ?? true;
  return {
    child_task_id: "task_child",
    created_at: "2026-01-04T10:00:00.000Z",
    direction: "parent",
    is_blocking: true,
    parent_task_id: "task_parent",
    related_task_id: "task_parent",
    task_relationship_id: "rel_1",
    updated_at: "2026-01-05T10:00:00.000Z",
    related_task_readable: readable,
    related_task: readable ? summary() : null,
    ...overrides,
  };
}

const elementLiteral = functionBody(service, "    readable.push({", "\n    });");
const summaryLiteral = functionBody(service, "function taskRelationshipTaskSummary(task) {", "\n  };");

describe("the relationship producer", () => {
  const list = functionBody(service, "async function listRelationships(taskId, session) {");

  it("proves the caller may read the task before answering anything", () => {
    const asserted = list.indexOf("await assertCanReadTask(session, task);");
    assert.notEqual(asserted, -1, "the read permission must be asserted before the list is built");
    assert.ok(asserted < list.indexOf("return {"),
      "the read permission must be asserted before the list is built");
    assert.match(
      functionBody(service, "async function canReadTask(session, task) {"),
      /permissionsService\.can\(session, "tasks\.view", taskResource\(task\)\)/,
      "and readability must be the tasks.view right on the task's own resource",
    );
  });

  it("answers exactly two members and spreads nothing", () => {
    const literal = list.slice(list.indexOf("return {"));
    assert.deepEqual(membersOf(literal), ["relationshipSummary", "relationships"],
      "the envelope must carry exactly its two members");
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserTaskRelationshipListResponse"),
      ["relationshipSummary", "relationships"], "and the declaration must mirror it");
  });

  it("is the same producer the write routes answer with", () => {
    for (const writer of [
      "async function addChildTask(parentTaskId, rawPayload, session) {",
      "async function updateChildTaskRelationship(parentTaskId, childTaskId, rawPayload, session) {",
    ]) {
      assert.match(functionBody(service, writer), /return listRelationships\(parentTask\.task_id, session\);/,
        "a write route must answer by calling the read producer, not by shaping its own body");
    }
    const route = functionBody(routes, 'tasksRoutes.get("/tasks/:taskId/relationships"', "\n}));");
    assert.match(route, /tasksService\.listRelationships\(request\.params\.taskId, readTaskSession\(request\)\)/,
      "the read route must call the traced producer");
  });

  it("reconstructs ten element members by name and spreads nothing", () => {
    assert.deepEqual(
      membersOf(elementLiteral),
      [
        "child_task_id", "created_at", "direction", "is_blocking", "parent_task_id",
        "related_task", "related_task_id", "related_task_readable", "task_relationship_id",
        "updated_at",
      ],
      "the element must carry exactly its ten members",
    );
    assert.ok(!elementLiteral.includes("..."), "a spread would make the exact membership unearned");
  });

  it("writes the direction from one comparison, in two words", () => {
    assert.match(elementLiteral, /direction: isParentSide \? "child" : "parent",/,
      "the direction must be the one side comparison, written as its two words");
    const alias = contracts.slice(contracts.indexOf("export type BrowserTaskRelationshipDirection ="));
    assert.deepEqual(
      [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]).sort(),
      ["child", "parent"],
      "and the declared union must be exactly those two",
    );
  });

  it("withholds the related task's summary from a caller who may not read it", () => {
    const body = functionBody(service, "async function readableRelationshipsForTask(session, taskId) {");
    assert.match(body, /const canReadRelated = relatedTask \? await canReadTask\(session, relatedTask\) : false;/,
      "readability must be a permission check, and false when the related task is gone");
    assert.match(elementLiteral, /related_task_readable: canReadRelated,/,
      "the flag must be that same check");
    assert.match(elementLiteral, /related_task: canReadRelated && relatedTask\n\s*\? taskRelationshipTaskSummary\(relatedTask\)\n\s*: null,/,
      "and the summary must be written only when that check passed and the task exists");
  });

  it("summarises nine members of the related task and no more", () => {
    assert.deepEqual(
      membersOf(summaryLiteral),
      [
        "client_id", "client_name", "estimate_minutes", "project_id", "project_name",
        "status", "task_id", "title", "url",
      ],
      "the related-task summary must carry exactly its nine members",
    );
    assert.ok(!summaryLiteral.includes("..."), "a spread would make the exact membership unearned");
    assert.doesNotMatch(summaryLiteral, /description|assignee|due_date|body|notes|tags/,
      "a related task the caller can see is still summarised, not handed over whole");
  });

  it("builds the related task's url as a task page link rather than an API route", () => {
    assert.match(functionBody(service, "function taskUrl(task) {"),
      /return `tasks\.html\?task=\$\{encodeURIComponent\(task\.task_id \|\| ""\)\}`;/,
      "the summary url must be an encoded task page link");
  });

  it("normalises the blocking flag to a real boolean before it leaves the repository", () => {
    assert.match(
      functionBody(repo, "function relationshipRowToAppValue(row) {", "\n}\n"),
      /is_blocking: db\.dialect\.boolean\.read\(row\.is_blocking\) === true,/,
      "the blocking flag must be dialect-read into a boolean, not passed through as a column value",
    );
  });

  it("leaves the summary sibling to the producer that owns it", () => {
    assert.match(
      functionBody(service, "async function listRelationships(taskId, session) {"),
      /relationshipSummary: await taskRelationshipsRepository\.relationshipSummary\(/,
      "the summary must come from the relationships repository, not from this shaper",
    );
    assert.match(declaredInterface("BrowserTaskRelationshipListResponse"), /relationshipSummary: unknown;/,
      "so this contract must leave it unnamed");
    assert.equal(
      (contracts.match(/^ {2}relationshipSummary: unknown;$/gm) || []).length,
      3,
      "and it must stay unnamed on the two task-detail contracts that already carry it too",
    );
  });
});

describe("the declarations", () => {
  it("declare the element membership the producer writes", () => {
    const declared = [...new Set([
      ...declaredMembers("BrowserTaskRelationshipCommon"),
      ...declaredMembers("BrowserReadableTaskRelationship"),
    ])].sort();
    assert.deepEqual(declared, membersOf(elementLiteral),
      "the readable variant must declare exactly the producer's ten members");
    assert.deepEqual(
      [...new Set([
        ...declaredMembers("BrowserTaskRelationshipCommon"),
        ...declaredMembers("BrowserWithheldTaskRelationship"),
      ])].sort(),
      declared,
      "and both variants must agree on which members exist",
    );
    assert.deepEqual(declaredMembers("BrowserTaskRelationshipTaskSummary"), membersOf(summaryLiteral),
      "and the summary must declare exactly the producer's nine");
  });

  it("tie the summary's presence to the readability flag", () => {
    assert.match(declaredInterface("BrowserReadableTaskRelationship"),
      /related_task: BrowserTaskRelationshipTaskSummary;\n {2}related_task_readable: true;/,
      "a readable relationship must promise the summary under a true flag");
    assert.match(declaredInterface("BrowserWithheldTaskRelationship"),
      /related_task: null;\n {2}related_task_readable: false;/,
      "and a withheld one must declare it null under a false flag");
  });

  it("say what the withheld variant protects", () => {
    const at = contracts.indexOf("export interface BrowserWithheldTaskRelationship");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /title, status, client and project of a task\s*outside the caller's reach never cross this boundary/,
      "the contract must name what the null summary withholds");
  });

  it("keep estimate_minutes the one nullable summary member", () => {
    const declared = declaredInterface("BrowserTaskRelationshipTaskSummary");
    assert.match(declared, /estimate_minutes: number \| null;/, "the estimate must be the nullable one");
    assert.equal((declared.match(/\| null;/g) || []).length, 1, "and the only nullable one");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { isTaskRelationship, readTaskRelationships, directions, relationshipText, relatedText } = shippedReader();

  it("checks every member the producer writes", () => {
    const covered = [...relationshipText, "direction", "is_blocking", "related_task", "related_task_readable"].sort();
    assert.deepEqual(covered, membersOf(elementLiteral), "the reader must check every element member");
    assert.deepEqual([...relatedText, "estimate_minutes"].sort(), membersOf(summaryLiteral),
      "and every summary member");
    assert.deepEqual([...directions].sort(), ["child", "parent"],
      "against the producer's own two directions");
  });

  it("accepts a readable relationship and a withheld one", () => {
    const readable = readTaskRelationships({ relationships: [makeRelationship()], relationshipSummary: {} });
    assert.ok(readable, "a real readable relationship must be accepted");
    assert.equal(readable[0].related_task.title, "Parent task", "and keep its summary");
    const withheld = readTaskRelationships({
      relationships: [makeRelationship({ related_task_readable: false })],
      relationshipSummary: {},
    });
    assert.ok(withheld, "a real withheld relationship must be accepted");
    assert.equal(withheld[0].related_task, null, "and keep its withheld summary as null");
  });

  it("accepts an empty list, which is a real answer", () => {
    const result = readTaskRelationships({ relationships: [], relationshipSummary: {} });
    assert.ok(result, "a task with no relationships really has none");
    assert.equal(result.length, 0, "and must be answered as the empty list it is");
  });

  it("refuses a body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, "relationships", [], {}, { relationships: null }, { relationships: {} }]) {
      assert.equal(readTaskRelationships(bad), null, "an unusable relationship body must be refused");
    }
  });

  it("does not read the summary it deliberately left unnamed", () => {
    for (const value of [undefined, null, 7, "five", { child_count: "many" }]) {
      assert.ok(
        readTaskRelationships({ relationships: [makeRelationship()], relationshipSummary: value }),
        "a member this contract does not name must not decide whether the list is readable",
      );
    }
  });

  it("refuses a direction outside the producer's two words", () => {
    for (const bad of ["sibling", "", undefined, null, "Parent"]) {
      assert.equal(isTaskRelationship(makeRelationship({ direction: bad })), false,
        "a direction this producer does not write must be refused: " + String(bad));
    }
  });

  it("refuses a blocking flag that is not a boolean", () => {
    for (const bad of [1, 0, "true", null, undefined]) {
      assert.equal(isTaskRelationship(makeRelationship({ is_blocking: bad })), false,
        "the repository normalises this to a boolean, so anything else is not its answer");
    }
  });

  it("refuses a relationship whose text members are not text", () => {
    for (const key of ["child_task_id", "created_at", "parent_task_id", "related_task_id", "task_relationship_id", "updated_at"]) {
      assert.equal(isTaskRelationship(makeRelationship({ [key]: null })), false,
        "a malformed " + key + " must refuse the relationship");
    }
  });

  it("refuses a withheld relationship that carries the summary anyway", () => {
    const leaked = makeRelationship({ related_task_readable: false, related_task: summary() });
    assert.equal(isTaskRelationship(leaked), false,
      "a related task the caller may not read must not arrive with its details");
    assert.equal(
      readTaskRelationships({ relationships: [leaked], relationshipSummary: {} }),
      null,
      "and the whole list must be refused rather than the row quietly dropped",
    );
  });

  it("refuses a readable relationship with no summary to show", () => {
    for (const bad of [null, undefined, {}, "Parent task", 7]) {
      assert.equal(isTaskRelationship(makeRelationship({ related_task_readable: true, related_task: bad })), false,
        "a readable relationship must carry the summary the producer writes for it");
    }
  });

  it("refuses a readability flag that is not one of the producer's two", () => {
    for (const bad of ["true", 1, null, undefined]) {
      assert.equal(isTaskRelationship(makeRelationship({ related_task_readable: bad })), false,
        "the flag is a boolean from one permission check, not a truthy value");
    }
  });

  it("refuses a summary whose members are malformed", () => {
    for (const key of ["client_id", "client_name", "project_id", "project_name", "status", "task_id", "title", "url"]) {
      assert.equal(
        isTaskRelationship(makeRelationship({ related_task: summary({ [key]: null }) })),
        false,
        "a malformed " + key + " must refuse the relationship",
      );
    }
  });

  it("accepts a related task with no estimate, and refuses one that is not a number", () => {
    assert.equal(isTaskRelationship(makeRelationship({ related_task: summary({ estimate_minutes: null }) })), true,
      "an unestimated task really does have a null estimate");
    for (const bad of ["45", undefined, {}]) {
      assert.equal(isTaskRelationship(makeRelationship({ related_task: summary({ estimate_minutes: bad }) })), false,
        "but anything other than a number or null is not what this producer sends");
    }
  });

  it("refuses the whole list rather than silently dropping a malformed relationship", () => {
    const result = readTaskRelationships({
      relationships: [makeRelationship(), { direction: "parent" }],
      relationshipSummary: {},
    });
    assert.equal(result, null, "one unreadable relationship must not become a shorter list");
  });

  it("answers the producer's own rows rather than rebuilt ones", () => {
    const wire = makeRelationship({ aFutureMember: 1 });
    const result = readTaskRelationships({ relationships: [wire], relationshipSummary: {} });
    assert.ok(result, "an unrecognised member must not refuse the relationship");
    assert.equal(result[0], wire, "and a vouched row is passed on by identity, not copied");
  });
});

describe("the task dialog consumer", () => {
  const parentRead = functionBody(consumer, "  async function readCurrentParentTaskId(taskId) {", "\n  }\n");

  it("no longer defaults an unreadable list to no relationships", () => {
    assert.ok(!consumer.includes("result.relationships || []"), "the raw list default must be gone");
  });

  it("reads the list through the vouching reader", () => {
    assert.match(parentRead, /const relationships = readTaskRelationships\(\n\s+await api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/relationships`/,
      "the list must be read through its reader, from the task-scoped route");
    assert.match(parentRead, /throw new Error\("The task relationship list could not be read\./,
      "and an unreadable list must be refused rather than searched");
  });

  it("still answers the module's existing best-effort empty on failure", () => {
    assert.ok(
      parentRead.indexOf("could not be read.") < parentRead.indexOf("} catch {"),
      "the refusal must land in the existing catch rather than escaping this helper",
    );
    assert.match(parentRead, /\} catch \{\n\s+return "";\n\s+\}/,
      "which keeps the pre-existing best-effort answer this helper has always given");
  });

  it("cannot detach a parent it failed to read, because the save compares before deleting", () => {
    const save = functionBody(consumer, "  async function syncParentTaskRelationship(taskId) {", "\n  }\n");
    const guard = save.indexOf("if (nextParentTaskId === currentParentTaskId) {\n      return;\n    }");
    assert.notEqual(guard, -1, "an unchanged parent selection must return before any relationship write");
    assert.ok(guard < save.indexOf("deleteJson"),
      "so an empty current parent from a failed read cannot reach the detach call");
  });

  it("prefers the relationship's own parent id over the summary that may be withheld", () => {
    assert.match(parentRead, /return parent\?\.parent_task_id \|\| parent\?\.related_task\?\.task_id \|\| "";/,
      "the parent id must come from the relationship first, since its summary can be null");
  });
});
