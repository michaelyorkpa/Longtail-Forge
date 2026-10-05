import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/files.service.js");
const routes = read("src/routes/files.routes.js");
const page = read("public/js/tasks.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
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

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  const start = page.indexOf("  function readAttachmentCounts(body) {");
  assert.notEqual(start, -1, "the reader must exist in the page source");
  return new Function(page.slice(start, page.indexOf("\n  }\n", start) + 4) + "\nreturn readAttachmentCounts;")();
}

const producer = functionBody(service, "async function countAttachmentsForTargets(session, filters = {}) {");

describe("the attachment count producer", () => {
  it("answers a tally, and a tally plus its meta, and nothing else", () => {
    assert.match(producer, /if \(!moduleId \|\| !targetType \|\| targetIds\.length === 0\) \{\n {4}return \{ counts: \{\} \};\n {2}\}/,
      "an empty request must answer an empty tally with no meta");
    const full = producer.slice(producer.lastIndexOf("  return {"));
    const top = [...full.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(top, ["counts", "meta"], "and the full answer exactly those two members");
    assert.ok(!/^ {4}\.\.\./m.test(full), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserFileAttachmentCounts"), top,
      "so the declaration must carry both");
    assert.match(declaredInterface("BrowserFileAttachmentCounts"), /meta\?: BrowserFileAttachmentCountMeta;/,
      "with the meta optional, because one of the two returns omits it");
    assert.match(declaredInterface("BrowserFileAttachmentCounts"), /counts: Record<string, number>;/,
      "and the tally required, because both returns carry it");
  });

  it("reconstructs its meta by name", () => {
    const meta = functionBody(producer, "    meta: {", "\n    },");
    assert.deepEqual(
      [...meta.matchAll(/^ {6}(\w+)[:,]/gm)].map((entry) => entry[1]).sort(),
      ["checkedTargets", "moduleId", "readableTargets", "targetType"],
      "the meta must carry exactly its four members",
    );
    assert.deepEqual(declaredMembers("BrowserFileAttachmentCountMeta"),
      ["checkedTargets", "moduleId", "readableTargets", "targetType"],
      "and the declaration must mirror it");
    assert.match(meta, /readableTargets: accessibleTargetIds\.size,/,
      "readable targets must be a count, not the list of ids the caller may read");
  });

  it("seeds every requested target to zero before counting anything", () => {
    const seed = producer.indexOf("targetIds.forEach((targetId) => {\n    counts[targetId] = 0;\n  });");
    assert.notEqual(seed, -1, "every requested target id must be seeded to zero");
    assert.ok(seed < producer.indexOf("result.attachments.forEach("),
      "before any attachment is tallied, so a zero means the server looked and found none");
  });

  it("counts only targets the caller may actually read", () => {
    assert.match(producer, /const accessibleTargetIds = await readableAttachmentTargetIds\(session, moduleId, targetType, targetIds\);/,
      "the readable targets must be resolved for this caller");
    assert.match(producer, /if \(allowedTargetIds\.has\(targetId\) && accessibleTargetIds\.has\(targetId\)\) \{\n {6}counts\[targetId\] = \(counts\[targetId\] \|\| 0\) \+ 1;/,
      "and the tally may only increment for a requested target the caller can read");
    assert.match(producer, /status: "available",/, "removed attachments must not be counted");
  });

  it("is answered by the route unchanged", () => {
    const route = functionBody(routes, 'filesRoutes.get("/files/attachments/counts"', "\n}));");
    assert.match(route, /const result = await filesService\.countAttachmentsForTargets\(request\.session, request\.query\);/,
      "the route must call the traced producer with the session and the query");
    assert.match(route, /response\.status\(200\)\.json\(result\);/, "and answer its result");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readAttachmentCounts = shippedReader();

  it("accepts a real tally and passes it on by identity", () => {
    const wire = { counts: { task_1: 2, task_2: 0 }, meta: { checkedTargets: 2, moduleId: "tasks", readableTargets: 2, targetType: "task" } };
    const result = readAttachmentCounts(wire);
    assert.ok(result, "a real tally must be accepted");
    assert.equal(result, wire.counts, "and answered as the producer's own map");
    assert.equal(result.task_2, 0, "a seeded zero is a real count");
  });

  it("accepts the empty-request answer, which carries no meta at all", () => {
    const result = readAttachmentCounts({ counts: {} });
    assert.ok(result, "the producer's other return is still one it sends");
    assert.deepEqual(Object.keys(result), [], "and it really is an empty tally");
  });

  it("refuses a body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, "counts", [], {}, { counts: null }, { counts: [] }, { counts: "none" }]) {
      assert.equal(readAttachmentCounts(bad), null, "an unusable tally body must be refused");
    }
  });

  it("refuses a count that is not a count", () => {
    for (const bad of ["2", null, undefined, -1, 1.5, {}, true, [2]]) {
      assert.equal(readAttachmentCounts({ counts: { task_1: 1, task_2: bad } }), null,
        "a malformed count must make the tally unreadable rather than zero: " + String(bad));
    }
  });

  it("proves the tally is a record before iterating its keys", () => {
    // This guard cannot be attacked behaviourally in full: removing it makes `Object.keys`
    // throw on a null tally rather than refuse, so what a break changes is a clean refusal
    // into a crash. The array half is proved by behaviour above; the rest is pinned by source.
    const reader = functionBody(page, "  function readAttachmentCounts(body) {", "\n  }\n");
    assert.match(reader, /if \(typeof counts !== "object" \|\| counts === null \|\| Array\.isArray\(counts\)\) \{\n\s+return null;/,
      "the tally must be proved a record before its keys are read");
    const guard = reader.indexOf("Array.isArray(counts)");
    assert.notEqual(guard, -1, "the tally must be proved a record before its keys are read");
    assert.ok(guard < reader.indexOf("Object.keys(tally)"), "and that proof must come first");
  });

  it("does not read the meta it deliberately leaves alone", () => {
    for (const meta of [undefined, null, 7, "none", {}, { moduleId: 7 }]) {
      assert.ok(readAttachmentCounts({ counts: { task_1: 1 }, meta }),
        "a member nothing renders must not decide whether the tally is readable");
    }
  });
});

describe("the tasks consumer", () => {
  const load = functionBody(page, "  async function loadAttachmentCounts(tasks) {", "\n  }\n");

  it("no longer defaults an unreadable tally to no attachments anywhere", () => {
    assert.ok(!page.includes("result.counts || {}"), "the raw tally default must be gone");
  });

  it("reads the tally through the vouching reader", () => {
    assert.match(load, /const counts = readAttachmentCounts\(await api\.getJson\(`\/api\/files\/attachments\/counts\?/,
      "the tally must be read through its reader, from the counts route");
    assert.match(load, /throw new Error\("The attachment counts could not be read\./,
      "and an unreadable tally must be refused rather than returned");
  });

  it("still answers the module's existing best-effort empty on failure", () => {
    assert.ok(
      load.indexOf("could not be read.") < load.indexOf("} catch {"),
      "the refusal must land in the existing catch rather than escaping this helper",
    );
    assert.match(load, /\} catch \{\n\s+return \{\};\n\s+\}/,
      "which keeps the pre-existing best-effort answer this helper has always given");
  });

  it("still asks for nothing when there is nothing to ask about", () => {
    assert.match(load, /if \(targetIds\.length === 0\) \{\n\s+return \{\};\n\s+\}/,
      "an empty task list must not reach the route at all");
  });

  it("leaves the other Tasks producers to their own children", () => {
    assert.match(page, /const panel = requireNotesLinkedPanel\(\)\.readForTarget\(result\);/,
      "the linked note counts belong to another child and are untouched");
  });
});
