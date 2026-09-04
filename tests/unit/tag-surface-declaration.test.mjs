import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const shared = read("public/js/shared/tags.js");
const contracts = read("src/types/browser-contracts.d.ts");
const search = read("public/js/search.js");
const tasks = read("public/js/tasks.js");
const reporting = read("public/js/reporting.js");
const taskDialog = read("public/js/task-dialog.js");
const notes = read("public/js/notes.js");
const stopWatch = read("public/js/stop-watch.js");
const clientsProjects = read("public/js/clients-projects.js");
const eslintConfig = read("eslint.config.js");

/**
 * One function body sliced at the indentation it is written at, so that a name appearing at two
 * indents cannot be confused for the one wanted.
 * @param {string} source @param {string} indentedOpener @param {number} indent
 */
function readerBody(source, indentedOpener, indent) {
  const pad = " ".repeat(indent);
  const start = source.indexOf(pad + indentedOpener);
  assert.notEqual(start, -1, indentedOpener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, indentedOpener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** @param {string} name */
function interfaceBody(name) {
  const opener = "export interface " + name + " {";
  const start = contracts.indexOf(opener);
  assert.notEqual(start, -1, name + " must be declared");
  const end = contracts.indexOf("\n}\n", start);
  assert.notEqual(end, -1, name + " must terminate");
  return contracts.slice(start + opener.length, end);
}

/**
 * The member names an interface declares, read off the lines written at its own indent so that
 * parameter continuation lines and doc-comment prose cannot be mistaken for members.
 * @param {string} body
 */
function declaredMembers(body) {
  return [...body.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)[(?:]/gm)].map((match) => match[1]).sort();
}

/** The names the writer's published object literal actually contains. */
function publishedMembers() {
  const opener = "  namespace.tags = {";
  const start = shared.indexOf(opener);
  assert.notEqual(start, -1, "the tags surface must be published");
  const end = shared.indexOf("\n  };", start);
  assert.notEqual(end, -1, "the published literal must terminate");
  const literal = shared.slice(start + opener.length, end);
  assert.ok(
    !/:/.test(literal),
    "the published literal is shorthand throughout, so a renamed member cannot hide behind an alias",
  );
  return [...literal.matchAll(/^ {4}([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((match) => match[1]).sort();
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

const documentStub = () => ({
  createElement: (/** @type {string} */ tag) => ({
    tagName: String(tag).toUpperCase(),
    value: "",
    textContent: "",
    className: "",
  }),
});

describe("the shared tag surface is declared from the writer's own literal", () => {
  it("declares exactly the members the writer publishes", () => {
    assert.deepEqual(declaredMembers(interfaceBody("BrowserTags")), publishedMembers());
  });

  it("publishes eleven members, which is the corrected count", () => {
    assert.equal(publishedMembers().length, 11);
    assert.equal(declaredMembers(interfaceBody("BrowserTags")).length, 11);
  });

  it("names each of the eleven, so a silent rename cannot pass the set comparison", () => {
    assert.deepEqual(publishedMembers(), [
      "NO_TAGS_FILTER_VALUE",
      "allTagsOption",
      "createFilterOption",
      "createTag",
      "loadTags",
      "mountFilterPicker",
      "mountPicker",
      "noTagsOption",
      "readTagIds",
      "renderTagList",
      "suppressPropagatedTag",
    ]);
  });

  it("does not publish createTagChip, which is the twelfth member the preflight miscounted", () => {
    assert.ok(!publishedMembers().includes("createTagChip"));
    assert.ok(!declaredMembers(interfaceBody("BrowserTags")).includes("createTagChip"));
    assert.ok(
      /function createTagChip/.test(shared),
      "it exists in the writer - it is internal, not absent",
    );
  });

  it("records that the count was corrected rather than reconciled by publishing a twelfth", () => {
    const doc = contracts.slice(contracts.indexOf("The shared tag surface"), contracts.indexOf("export interface BrowserTags {"));
    assert.match(doc, /Eleven members/);
    assert.match(doc, /recorded twelve/);
    assert.match(doc, /not\*{0,2} published/);
  });

  it("is optional on the root, because the namespace itself can be absent", () => {
    assert.match(contracts, /^ {2}tags\?: BrowserTags;$/m);
    assert.ok(!/^ {2}tags: BrowserTags;$/m.test(contracts));
  });
});

describe("the dead Search branch is removed rather than satisfied", () => {
  it("no longer probes the surface for a member it never published", () => {
    const body = readerBody(search, "function createTagChip(tag) {", 0);
    assert.ok(!/LongtailForge/.test(body), "the chip builder must not reach for the namespace");
    assert.ok(!/\bif\b/.test(body), "the guard is gone, not merely inverted");
    const code = search.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/tags\??\.createTagChip/.test(code), "no reference reaches it through the surface");
    assert.equal(countOf(code, /function createTagChip/g), 1, "it is defined once, locally");
    assert.ok(countOf(code, /createTagChip/g) > 1, "and the page still calls it - the branch was removed, not the builder");
  });

  it("keeps its own local chip builder, which is what every result has always rendered", () => {
    const chip = new Function("document", "return " + readerBody(search, "function createTagChip(tag) {", 0))(documentStub())({
      name: "Billing",
      slug: "billing",
    });
    assert.equal(chip.className, "tag-chip");
    assert.equal(chip.textContent, "Billing");
  });

  it("falls back to the slug and then to a literal, exactly as before", () => {
    const build = new Function("document", "return " + readerBody(search, "function createTagChip(tag) {", 0))(documentStub());
    assert.equal(build({ slug: "billing" }).textContent, "billing");
    assert.equal(build({}).textContent, "Tag");
  });

  it("records why publishing the member would have been the wrong repair", () => {
    const doc = search.slice(search.indexOf("One tag chip for a search result."), search.indexOf("function createTagChip"));
    assert.match(doc, /unreachable/);
    assert.match(doc, /has always been false/);
    assert.match(doc, /runtime change/);
  });
});

describe("the two mounts still answer null, and the declaration says so", () => {
  it("mountPicker resolves null for a missing container", async () => {
    const mount = new Function("return " + readerBody(shared, "async function mountPicker(container, options = {}) {", 2))();
    assert.equal(await mount(null), null);
    assert.equal(await mount(undefined), null);
  });

  it("mountFilterPicker returns null for a missing input", () => {
    const mount = new Function("return " + readerBody(shared, "function mountFilterPicker(input, options = {}) {", 2))();
    assert.equal(mount(null), null);
    assert.equal(mount(undefined), null);
  });

  it("declares both returns as nullable rather than typing the absence away", () => {
    const body = interfaceBody("BrowserTags");
    assert.match(body, /\): BrowserTagFilterPickerController \| null;/);
    assert.match(body, /\): Promise<BrowserTagPickerController \| null>;/);
  });

  it("accepts a missing container in each mount's own signature", () => {
    const body = interfaceBody("BrowserTags");
    const picker = body.slice(body.indexOf("  mountPicker("), body.indexOf("  noTagsOption("));
    const filter = body.slice(body.indexOf("  mountFilterPicker("), body.indexOf("  mountPicker("));
    assert.match(picker, /^ {4}container: Element \| null \| undefined,$/m);
    assert.match(filter, /^ {4}input: HTMLInputElement \| null \| undefined,$/m);
  });
});

describe("the picker options stay as wide as the writer that consumes them", () => {
  it("keeps the tag inputs unknown rather than narrowing them to catalogue records", () => {
    const body = interfaceBody("BrowserTagPickerOptions");
    assert.match(body, /^ {2}tags\?: unknown\[\];$/m);
    assert.match(body, /^ {2}selectedTags\?: unknown\[\];$/m);
    assert.match(body, /^ {2}selectedTagIds\?: unknown;$/m);
    assert.ok(!/BrowserTagCatalogRecord/.test(body));
  });

  it("keeps the filter picker's two members unknown for the same reason", () => {
    const body = interfaceBody("BrowserTagFilterPickerOptions");
    assert.deepEqual(declaredMembers(body), ["tags", "value"]);
    assert.ok(!/BrowserTagCatalogRecord/.test(body));
  });

  it("is wide because normalizeTagList rebuilds whatever it is handed", () => {
    const normalize = readerBody(shared, "function normalizeTagList(tags = []) {", 2);
    assert.match(normalize, /Array\.isArray\(tags\) \? tags : \[\]/);
    assert.match(normalize, /tag\?\.tag_id/);
    assert.ok(
      /assignment_id|is_propagated|source/.test(normalize),
      "it rebuilds assignment members too, which a catalogue record does not carry",
    );
  });

  it("records that the width is deliberate", () => {
    const doc = contracts.slice(contracts.indexOf("What `mountPicker` accepts."), contracts.indexOf("export interface BrowserTagPickerOptions"));
    assert.match(doc, /on purpose/);
    assert.match(doc, /narrower than the writer/);
  });
});

describe("the network returns are the ones the wire child closed", () => {
  it("declares both catalogue calls as validated records", () => {
    const body = interfaceBody("BrowserTags");
    assert.match(body, /createTag\(payload\?: unknown\): Promise<BrowserTagCatalogRecord>;/);
    assert.match(body, /loadTags\(options\?: BrowserTagLoadOptions\): Promise<BrowserTagCatalogRecord\[\]>;/);
  });

  it("rests on validation in the writer rather than on an annotation over a raw body", () => {
    const load = readerBody(shared, "async function loadTags(options = {}) {", 2);
    assert.match(load, /readTagCatalogEntries/);
    const reader = readerBody(shared, "function readTagCatalogEntries(body) {", 2);
    assert.match(reader, /isTagCatalogRecord/);
    assert.match(reader, /Array\.isArray\(body\.tags\)/);
  });

  it("leaves the suppression body unknown, because its only caller discards it", () => {
    assert.match(interfaceBody("BrowserTags"), /suppressPropagatedTag\(assignmentId: string\): Promise<unknown>;/);
    const suppress = readerBody(shared, "async function suppressPropagatedTag(assignmentId) {", 2);
    assert.ok(!/\.json\(\)\s*;?\s*\n\s*(const|let|return [a-z])/.test(suppress.replace(/await response\.json\(\)/g, "")));
  });

  it("narrows the query by the two members the writer sends", () => {
    const body = interfaceBody("BrowserTagLoadOptions");
    assert.deepEqual(declaredMembers(body), ["search", "status"]);
    const load = readerBody(shared, "async function loadTags(options = {}) {", 2);
    assert.match(load, /status/);
    assert.match(load, /search/);
  });
});

describe("the small published helpers execute to their declared shapes", () => {
  it("builds filter options through the document, and the two named ones delegate", () => {
    const constLine = shared.match(/^ {2}const NO_TAGS_FILTER_VALUE = "[^"]*";$/m);
    assert.ok(constLine, "the sentinel must be a source constant");
    const factory = new Function("document", [
      constLine[0],
      readerBody(shared, "function allTagsOption() {", 2),
      readerBody(shared, "function noTagsOption() {", 2),
      readerBody(shared, "function createFilterOption(value, label) {", 2),
      "return { NO_TAGS_FILTER_VALUE, allTagsOption, noTagsOption, createFilterOption };",
    ].join("\n"))(documentStub());

    assert.equal(factory.allTagsOption().textContent, "All tags");
    assert.equal(factory.allTagsOption().value, "");
    assert.equal(factory.noTagsOption().textContent, "No Tags");
    assert.equal(factory.noTagsOption().value, factory.NO_TAGS_FILTER_VALUE);
    assert.equal(factory.createFilterOption("x", "Y").tagName, "OPTION");
  });

  it("reads no tag ids from a missing container rather than throwing", () => {
    const readIds = new Function("return " + readerBody(shared, "function readTagIds(container) {", 2))();
    assert.deepEqual(readIds(null), []);
    assert.deepEqual(readIds(undefined), []);
  });

  it("declares the sentinel and the two option builders as the writer defines them", () => {
    const body = interfaceBody("BrowserTags");
    assert.match(body, /NO_TAGS_FILTER_VALUE: string;/);
    assert.match(body, /allTagsOption\(\): HTMLOptionElement;/);
    assert.match(body, /createFilterOption\(value: string, label: string\): HTMLOptionElement;/);
    assert.match(body, /readTagIds\(container: Element \| null \| undefined\): string\[\];/);
  });
});

describe("the two filter-picker call sites narrow rather than cast or widen", () => {
  it("narrows on the element the writer requires", () => {
    assert.match(tasks, /tagFilter instanceof HTMLInputElement/);
    assert.match(reporting, /control instanceof HTMLInputElement/);
  });

  it("does not cast at either site", () => {
    for (const [name, source] of [["tasks", tasks], ["reporting", reporting]]) {
      const site = source.slice(source.indexOf("instanceof HTMLInputElement") - 600, source.indexOf("instanceof HTMLInputElement") + 400);
      assert.ok(!/@type \{HTMLInputElement\}/.test(site), name + " must not cast");
    }
  });

  it("picks an arm of the view field control rather than changing the alias", () => {
    const alias = contracts.match(/^export type BrowserViewFieldControl = .*$/m);
    assert.ok(alias, "the alias must exist");
    assert.equal(
      alias[0],
      "export type BrowserViewFieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;",
      "three arms, unchanged - the narrowing selects one rather than widening the union",
    );
  });

  it("sends a control that is not an input down the path a missing one already took", () => {
    const site = tasks.slice(tasks.indexOf("if (!tagFilterController) {"), tasks.indexOf("tagFilterController.setTags"));
    assert.match(site, /: null/);
    assert.match(site, /\|\| null/);
  });

  it("declares HTMLInputElement as the browser global the narrowing needs at runtime", () => {
    const globals = eslintConfig.slice(eslintConfig.indexOf("const browserGlobals = {"), eslintConfig.indexOf("const nodeGlobals"));
    assert.match(globals, /^ {2}HTMLInputElement: "readonly",$/m);
  });
});

describe("the bootstrap collision is resolved by a runtime check, not a cast", () => {
  it("reuses the predicate the dialog already had rather than writing a second one", () => {
    assert.equal(countOf(taskDialog, /function isReadableJsonObject/g), 1);
    assert.ok(!/isStandaloneBootstrapBody/.test(taskDialog), "the duplicate this checkpoint drafted is gone");
    assert.ok(!/isTaskRelationshipRecord/.test(taskDialog), "and the narrower name it replaced is gone");
    assert.ok(
      countOf(taskDialog, /isReadableJsonObject\(/g) >= 5,
      "one predicate serves the bootstrap reads and the relationship reads",
    );
  });

  it("guards the two bodies the dialog reads members off", () => {
    const guard = new Function("return " + readerBody(taskDialog, "function isReadableJsonObject(value) {", 2))();
    assert.equal(guard({ task: {} }), true);
    assert.equal(guard({}), true);
    assert.equal(guard(null), false);
    assert.equal(guard(undefined), false);
    assert.equal(guard([]), false);
    assert.equal(guard("body"), false);
    assert.equal(guard(7), false);
  });

  it("reads the members off the guarded bodies rather than the raw promise results", () => {
    const prepare = readerBody(taskDialog, "async function prepareStandaloneContext({ hostContext = null, taskId = \"\" } = {}) {", 2);
    assert.match(prepare, /const taskBody = isReadableJsonObject\(taskResult\) \? taskResult : null;/);
    assert.match(prepare, /const listBody = isReadableJsonObject\(tasksResult\) \? tasksResult : null;/);
    assert.ok(!/taskResult\?\./.test(prepare), "the raw result must no longer be read");
    assert.ok(!/tasksResult\?\./.test(prepare), "the raw result must no longer be read");
  });

  it("does not cast the widened bootstrap element anywhere in the dialog", () => {
    assert.ok(!/@type \{Record<string, unknown>\} \*\/ \(/.test(taskDialog));
  });

  it("leaves the four requests concurrent, because the collision was a typing one", () => {
    const prepare = readerBody(taskDialog, "async function prepareStandaloneContext({ hostContext = null, taskId = \"\" } = {}) {", 2);
    assert.match(prepare, /await Promise\.all\(\[/);
    assert.match(prepare, /loadTagOptions\(\),/);
  });
});

describe("the state slots take the surface's own types, and the stubs do not", () => {
  it("types the two note pickers by the controller the mount resolves to", () => {
    assert.match(notes, /BrowserTagPickerController \| null\}\s*\n\s*\*\/\s*\n\s*bulkTagPicker: null,/);
    assert.match(notes, /BrowserTagPickerController \| null\}\s*\n\s*\*\/\s*\n\s*tagPicker: null,/);
  });

  it("types the two catalogue slots by the validated record", () => {
    assert.match(notes, /BrowserTagCatalogRecord\[\]\}\s*\n\s*\*\/\s*\n\s*availableTags: \[\],/);
    assert.match(tasks, /BrowserTagCatalogRecord\[\]\}\s*\n\s*\*\/\s*\n\s*tagOptions: \[\],/);
  });

  it("types the two stubs by the methods their pages call, because a stub is not a controller", () => {
    assert.match(clientsProjects, /@type \{\{readTagIds: \(\) => string\[\]\}\}/);
    assert.match(stopWatch, /@type \{\{readTagIds: \(\) => string\[\], setSelected: \(tagIds\?: unknown\) => void\}\}/);
    for (const [name, source] of [["clients-projects", clientsProjects], ["stop-watch", stopWatch]]) {
      assert.ok(!/BrowserTagPickerController/.test(source), name + " must not claim the stub is a controller");
    }
  });

  it("records that a stub cannot satisfy the controller, which has a third member", () => {
    assert.match(interfaceBody("BrowserTagPickerController"), /refreshTags\(\): Promise<void>;/);
    assert.ok(!/refreshTags/.test(clientsProjects));
    assert.ok(!/refreshTags/.test(stopWatch));
  });

  it("lets the stopwatch clear its tags, which the untyped stub had made an arity error", () => {
    assert.equal(
      countOf(stopWatch, /this\.tagPicker\?\.setSelected\?\.\(\[\]\);/g),
      2,
      "both clear paths pass the empty selection",
    );
    assert.match(interfaceBody("BrowserTagPickerController"), /setSelected\(tagIds\?: unknown\): void;/);
  });
});
