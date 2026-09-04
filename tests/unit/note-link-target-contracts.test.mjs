import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/notes.service.js");
const routes = read("src/modules/notes/notes.routes.js");
const directory = read("src/modules/notes/link-target-directory.service.js");
const frameworkShape = read("src/core/linked-context/link-target-shape.js");
const page = read("public/js/notes.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * Member names written at a given indent inside a reconstruction literal.
 * @param {string} literal @param {number} indent
 */
function literalMembers(literal, indent) {
  return [...literal.matchAll(new RegExp("^ {" + indent + "}(\\w+)[:,]", "gm"))].map((entry) => entry[1]).sort();
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

/** @param {string} name */
function declaredUnion(name) {
  const alias = contracts.slice(contracts.indexOf("export type " + name + " ="));
  assert.ok(alias.startsWith("export type "), name + " must be declared");
  return [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]).sort();
}

/** The shipped readers, instantiated from the page's own source. */
function shippedReaders() {
  const start = page.indexOf("  /** What this picker says when the directory answered something it could not read. */");
  const end = page.indexOf("  async function loadEditorLinkTargets() {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above loadEditorLinkTargets");
  return new Function(page.slice(start, end) + `
    return {
      isNoteLinkTarget,
      linkTargetLoadFailureLabel,
      readNoteLinkTargets,
      tables: { text: NOTE_LINK_TARGET_TEXT, types: NOTE_LINK_TARGET_TYPES },
      failure: LINK_TARGET_LOAD_FAILURE,
    };`)();
}

const target = (overrides = {}) => ({
  ariaLabel: "Northwind",
  clientId: "client_1",
  clientName: "Northwind",
  displayLabel: "Northwind",
  fullLabel: "Northwind",
  isAvailable: true,
  label: "Northwind",
  moduleId: "client-projects",
  projectId: "",
  projectName: "",
  secondaryLabel: "",
  sortKey: "northwind",
  sourceUrl: "clients.html?client=client_1",
  subtitle: "",
  suggestedLibraryBucket: "reference",
  targetId: "client_1",
  targetType: "client",
  title: "Northwind",
  workspaceName: "Raymond Tec",
  ...overrides,
});

const notesShaper = functionBody(service, "function shapeLinkTarget(target = {}) {", "\n  };");
const frameworkShaper = functionBody(frameworkShape, "function shapeLinkTarget(target) {", "\n  };");
const listLinkTargets = functionBody(service, "async function listLinkTargets(session, query = {}) {");

describe("the link-target route and its permission shaping", () => {
  it("answers the service under a workspace session", () => {
    const route = functionBody(routes, 'notesRoutes.get("/notes/link-targets"', "\n}));");
    assert.match(route, /const result = await notesService\.listLinkTargets\(requireWorkspaceSession\(request\.session\), request\.query\);/,
      "the route must call the traced producer with a workspace session");
    assert.match(route, /response\.status\(200\)\.json\(result\);/, "and answer its result");
  });

  it("asserts the note view right before it reads anything", () => {
    assert.match(listLinkTargets, /await permissionsService\.assertCanInAnyScope\(session, NOTE_PERMISSIONS\.VIEW\);/,
      "the directory must assert the note view right");
    const asserted = listLinkTargets.indexOf("assertCanInAnyScope");
    assert.notEqual(asserted, -1, "the directory must assert the note view right");
    assert.ok(asserted < listLinkTargets.indexOf("const targets = []"),
      "and must do so before any target is gathered");
  });

  it("gates each internal type on its own module read access", () => {
    const internal = functionBody(service, "async function listTargetsByType(session, targetType) {");
    assert.match(internal, /if \(!\(await canReadLinkTargetType\(session, targetType\)\)\) \{\n {4}return \[\];\n {2}\}/,
      "an internal type the caller may not read must answer nothing");
    assert.match(
      functionBody(service, "async function canReadLinkTargetType(session, targetType) {"),
      /return moduleId \? modulesService\.canWriteModule\(session\.workspace_id, moduleId\) : true;/,
      "and that gate must be the module check",
    );
    assert.match(internal, /await filterAccessibleNotes\(session, await notesRepository\.list\(session\.workspace_id, \{\}\)\)/,
      "note targets must be filtered to the accessible set before any label is built");
  });

  it("gates each external type on its provider's module check, then the client scope", () => {
    const list = functionBody(directory, "async function list(session, targetType, clientContext) {");
    assert.match(list, /if \(!provider \|\| !\(await canListType\(session, targetType\)\)\) return \[\];/,
      "an external type without a provider or module right must answer nothing");
    assert.match(list, /return targets\.filter\(\(target\) => targetMatchesClientContext\(target, scope\)\);/,
      "and the client scope must be applied server-side");
  });

  it("filters and sorts before it slices, so the browser receives a shaped page", () => {
    assert.match(listLinkTargets, /targets: targets\n {6}\.filter\(\(target\) => targetMatchesClientContext\(target, clientScope\)\)\n {6}\.filter\(\(target\) => targetMatchesSearch\(target, search\)\)\n {6}\.sort\(compareLinkTargets\)\n {6}\.slice\(0, limit\),/,
      "the response must be scoped, searched, sorted and bounded by the producer");
  });
});

describe("the envelope is exact; the element is not", () => {
  it("wraps the list by name with no top-level spread", () => {
    const literal = listLinkTargets.slice(listLinkTargets.indexOf("  return {"));
    assert.deepEqual(literalMembers(literal, 4), ["targets"],
      "the envelope must carry exactly its one member");
    assert.ok(!/^ {4}\.\.\./m.test(literal), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserNoteLinkTargetDirectory"), ["targets"],
      "and the declaration must mirror it");
  });

  it("promises strictly fewer element members than either producer writes", () => {
    const notesWritten = literalMembers(notesShaper.slice(notesShaper.indexOf("  return {")), 4);
    const frameworkWritten = literalMembers(frameworkShaper.slice(frameworkShaper.indexOf("  return {")), 4);
    const promised = declaredMembers("BrowserNoteLinkTarget");

    assert.deepEqual(notesWritten, frameworkWritten,
      "both shapers must write the same member names, or the minimum below is not their intersection");
    for (const member of promised) {
      assert.ok(notesWritten.includes(member), member + " must be written by the Notes shaper");
      assert.ok(frameworkWritten.includes(member), member + " must be written by the framework shaper");
    }
    assert.ok(promised.length < notesWritten.length,
      "the element contract must be a strict subset: promising every member would freeze a record this child does not own");
    assert.deepEqual(
      notesWritten.filter((member) => !promised.includes(member)),
      ["listId", "noteId", "status", "taskId", "userId", "workspaceId"],
      "and the six it leaves out must be exactly the ones no consumer reads",
    );
  });

  it("stays open above the promised members, because the directory's declaration is weaker", () => {
    assert.match(frameworkShaper, /\.\.\.\(target\.unavailable \? \{ unavailable: true \} : \{\}\),/,
      "the framework shaper adds a conditional member the Notes one never writes");
    assert.match(service, /`linkTargetDirectory\.list` returns, and that directory still \*declares\*/,
      "and the producer records why its own return is left to inference");
    const at = contracts.indexOf("export interface BrowserNoteLinkTarget {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /A deliberate structural minimum over a mixed-provider record/,
      "so the contract must say it is a minimum rather than an exact record");
    assert.match(doc, /`0\.33\.33\.36` owns strengthening that declaration; this contract does\s*not/,
      "and must name the child that owns the other half of the seam");
  });
});

describe("the target-type vocabulary", () => {
  it("closes over the producer's own set, and would notice an eighth", () => {
    const canonical = service.match(/const LINK_TARGET_TYPES = new Set\(\[([^\]]*)\]\);/);
    assert.ok(canonical, "the canonical set must exist");
    const produced = [...canonical[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(produced, ["client", "list", "note", "project", "task", "user", "workspace"],
      "the canonical set must be exactly these seven");
    assert.deepEqual(declaredUnion("BrowserNoteLinkTargetType"), produced,
      "the declared union must close over the scanned set");
    assert.deepEqual([...shippedReaders().tables.types].sort(), produced,
      "and so must the table the reader validates against");
    const expansion = listLinkTargets.match(/targetType === "all" \? \[([^\]]*)\]/);
    assert.ok(expansion, "the all-types expansion must exist");
    assert.deepEqual([...expansion[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]).sort(), produced,
      "and the expansion must offer exactly the canonical set");
  });

  it("refuses a requested type outside that set at the service boundary", () => {
    assert.match(listLinkTargets, /if \(!isLinkTargetType\(type\)\) \{\n {6}throw new AppError\("Unsupported note link target type\.", 400\);/,
      "an unsupported type must be refused by the producer");
    assert.match(service, /return typeof value === "string" && LINK_TARGET_TYPES\.has\(value\);/,
      "using the canonical set itself");
  });

  it("is not the Lists vocabulary, which is a different producer's four", () => {
    assert.deepEqual(declaredUnion("BrowserListLinkTargetType"), ["client", "note", "project", "task"],
      "Lists supports four of these words from its own producer");
    assert.doesNotMatch(declaredInterface("BrowserNoteLinkTarget"), /BrowserListLinkTarget/,
      "so this record must not reuse the Lists one");
  });
});

describe("the labels and routes this directory discloses", () => {
  it("falls back to a human-facing label rather than an identifier", () => {
    const fallback = functionBody(frameworkShape, "function safeTargetFallbackLabel(targetType) {", "\n}\n");
    assert.match(fallback, /UNAVAILABLE_LABEL_BY_TARGET_TYPE\[targetType\] \|\| "Unavailable linked context"/,
      "an unusable target must be labelled by its type, never by its id");
    const table = functionBody(frameworkShape, "const UNAVAILABLE_LABEL_BY_TARGET_TYPE = Object.freeze({", "\n});");
    assert.doesNotMatch(table, /\$\{|targetId/, "and that table must contain no identifier interpolation");
  });

  it("builds a relative page route, or nothing at all", () => {
    const body = functionBody(frameworkShape, "function targetSourceUrl(targetType, targetId) {", "\n}\n");
    for (const route of [/"dashboard\.html"/, /`clients\.html\?client=\$\{encodeURIComponent\(targetId\)\}`/, /`notes\.html\?note=\$\{encodeURIComponent\(targetId\)\}`/]) {
      assert.match(body, route, "each known type must map to an encoded relative page route");
    }
    // Anchored at the end of the sliced body: `functionBody` stops before the closing brace,
    // so a pattern that included it could never match however the source was written.
    assert.match(body, /\n {2}return "";$/, "and an unknown type must map to nothing rather than a guess");
    assert.doesNotMatch(body, /https?:|\/\//, "no absolute or protocol-relative route may be built here");
  });

  it("promises the source URL as text, because this picker never navigates it", () => {
    assert.match(declaredInterface("BrowserNoteLinkTarget"), /sourceUrl: string;/,
      "the contract must promise a string rather than a shape");
    const picker = functionBody(page, "  function pickerRecordFromTarget(target = {}) {", "\n  }\n");
    assert.match(picker, /sourceUrl: target\.sourceUrl \|\| target\.source_url \|\| "",/,
      "the picker carries it into the option record");
    const payload = functionBody(page, "  function linkPayloadFromTarget(target = {}) {", "\n  }\n");
    assert.deepEqual(literalMembers(payload.slice(payload.indexOf("return {")), 6),
      ["moduleId", "targetId", "targetType"],
      "and the editor submits only the three identity members");
    assert.ok(!payload.includes("sourceUrl"), "so the source URL is never sent back");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { isNoteLinkTarget, readNoteLinkTargets, tables } = shippedReaders();

  it("checks every promised member, and only those", () => {
    const covered = [...tables.text, "targetType", "targetId", "isAvailable"].sort();
    assert.deepEqual(covered, declaredMembers("BrowserNoteLinkTarget"),
      "the reader must check exactly what the contract promises");
  });

  it("accepts a search that matched nothing", () => {
    const result = readNoteLinkTargets({ targets: [] });
    assert.ok(result, "an empty directory is a real answer");
    assert.equal(result.length, 0, "and really is empty");
  });

  it("accepts a populated directory and answers the producer's own array", () => {
    const wire = { targets: [target(), target({ targetId: "note_1", targetType: "note" })] };
    const result = readNoteLinkTargets(wire);
    assert.ok(result, "a real directory must be accepted");
    assert.equal(result, wire.targets, "and be passed on by identity, not rebuilt");
  });

  it("accepts every target type the producer can answer", () => {
    for (const targetType of ["client", "list", "note", "project", "task", "user", "workspace"]) {
      assert.equal(isNoteLinkTarget(target({ targetType })), true, targetType + " is a real target type");
    }
  });

  it("refuses a body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, "targets", [], {}, { targets: null }, { targets: "none" }, { targets: {} }]) {
      assert.equal(readNoteLinkTargets(bad), null, "an unusable directory body must be refused");
    }
  });

  it("proves the directory is a list before iterating it", () => {
    // This guard cannot be attacked behaviourally: removing it makes `every` throw on a body
    // whose targets are a string or an object, so a break turns a clean refusal into a crash.
    // It is pinned by source instead, the way the active-timer container check was.
    const reader = functionBody(page, "  function readNoteLinkTargets(body) {", "\n  }\n");
    assert.match(reader, /if \(!Array\.isArray\(targets\)\) \{\n\s+return null;\n\s+\}/,
      "the directory must be proved a list before every() is called on it");
    const guard = reader.indexOf("Array.isArray(targets)");
    assert.notEqual(guard, -1, "the directory must be proved a list before every() is called on it");
    assert.ok(guard < reader.indexOf("targets.every("), "and that proof must come first");
  });

  it("refuses a target the picker could not offer", () => {
    for (const bad of [
      target({ targetId: "" }), target({ targetId: null }), target({ targetId: 7 }),
      target({ targetType: "invoice" }), target({ targetType: "" }), target({ targetType: null }),
      target({ isAvailable: "yes" }), target({ isAvailable: undefined }),
    ]) {
      assert.equal(isNoteLinkTarget(bad), false, "a target the picker cannot use must be refused");
    }
  });

  it("refuses a malformed promised member, and accepts an empty one", () => {
    for (const key of tables.text) {
      assert.equal(isNoteLinkTarget(target({ [key]: null })), false,
        "a malformed " + key + " must refuse the target");
      assert.equal(isNoteLinkTarget(target({ [key]: "" })), true,
        "but an empty " + key + " is what the shapers default to");
    }
  });

  it("refuses the whole directory rather than dropping one unreadable target", () => {
    assert.equal(
      readNoteLinkTargets({ targets: [target(), { targetType: "note" }] }),
      null,
      "a quietly shorter picker is indistinguishable from a search that matched fewer records",
    );
  });

  it("accepts a richer provider record and does not truncate it", () => {
    /** @type {Record<string, unknown>} */
    const rich = target({ unavailable: true, listId: "list_1", noteId: "", providerHint: { depth: 2 } });
    const wire = { targets: [rich] };
    const result = readNoteLinkTargets(wire);
    assert.ok(result, "a benign additional provider member must not refuse the target");
    assert.equal(result[0], rich, "and the runtime object must arrive whole");
    assert.equal(result[0].listId, "list_1", "including members this contract does not promise");
    assert.deepEqual(result[0].providerHint, { depth: 2 }, "and ones no producer has published yet");
  });
});

describe("the notes consumer", () => {
  const fetchTargets = functionBody(page, "  async function fetchLinkTargets({ targetType = \"all\"", "\n  }\n");
  const load = functionBody(page, "  async function loadEditorLinkTargets() {", "\n  }\n");

  it("no longer defaults an unreadable directory to no matching targets", () => {
    assert.ok(!page.includes("result.targets || []"), "the raw directory default must be gone");
  });

  it("reads the directory through the vouching reader", () => {
    assert.match(fetchTargets, /const targets = readNoteLinkTargets\(\n\s+await api\.getJson\(`\/api\/notes\/link-targets\?\$\{params\.toString\(\)\}`, \{ cache: "no-store" \}\),\n\s+\);/,
      "the directory must be read through its reader");
    assert.match(fetchTargets, /if \(!targets\) \{\n\s+throw new Error\(LINK_TARGET_LOAD_FAILURE\);\n\s+\}/,
      "and an unreadable directory must be refused");
  });

  it("says the directory failed rather than that nothing matched", () => {
    const { linkTargetLoadFailureLabel, failure } = shippedReaders();
    assert.equal(linkTargetLoadFailureLabel(new Error(failure)), failure,
      "a refusal keeps its own words");
    assert.equal(linkTargetLoadFailureLabel(new Error("Network request failed")), "No records available",
      "and every other failure still reads as it always has");
    assert.equal(linkTargetLoadFailureLabel(undefined), "No records available",
      "including one that threw no Error at all");
    assert.match(load, /replaceLinkTargetOptions\(\[\{ value: "", label: linkTargetLoadFailureLabel\(error\), disabled: true \}\]\);/,
      "and the picker must render whichever of the two applies");
  });

  it("stores nothing it has not vouched for", () => {
    const refusal = fetchTargets.indexOf("throw new Error(LINK_TARGET_LOAD_FAILURE);");
    assert.notEqual(refusal, -1, "the reader must refuse");
    assert.ok(refusal < fetchTargets.indexOf("return targets;"),
      "before the targets are returned to the caller that stores them");
    assert.match(load, /state\.linkTargets = targets;/, "the page stores the vouched list");
    assert.match(page, /@type \{BrowserNoteLinkTarget\[\]\}\n {5}\*\/\n {4}linkTargets: \[\],/,
      "in a slot typed by this response rather than by its empty initializer");
  });

  it("leaves the other Notes producers to their own children", () => {
    for (const other of ["result.revisions || []"]) {
      assert.ok(page.includes(other), other + " is another child's read and is untouched");
    }
    // `settings.openExternalLinksNewTab` was on this list until `0.33.33.38.4.5.8` adopted the
    // User Settings producer's own boolean for the external-link preference. A sibling child
    // doing its job is not this one widening, so the claim is asserted against that reader -
    // anchored on the call site, because the reader's own definition also contains its name.
    assert.match(page, /readOpenExternalLinksNewTab\(await api\.getJson\("\/api\/user\/settings"/,
      "settings.openExternalLinksNewTab is another child's read and is untouched");
    // `result.note.note_id` was on this list until `0.33.33.38.4.2.2` adopted the established
    // note boundary for the archive and restore mutations. A sibling child doing its job is not
    // this one widening, so the claim is asserted against that boundary - anchored on the call
    // site, because the reader's own definition also contains its name.
    assert.match(page, /await selectNote\(requireNoteFromEnvelope\(result\)\.note_id\);/,
      "result.note.note_id is another child's read and is untouched");
  });
});
