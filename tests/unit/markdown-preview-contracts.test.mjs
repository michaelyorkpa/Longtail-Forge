import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/notes.service.js");
const markdown = read("src/modules/notes/markdown.js");
const routes = read("src/modules/notes/notes.routes.js");
const consumer = read("public/js/notes.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = consumer.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return consumer.slice(start, consumer.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    slice("function isResponseRecord(value) {"),
    slice("function readMarkdownPreview(body) {"),
    "return readMarkdownPreview;",
  ].join("\n"))();
}

const preview = (overrides = {}) => ({
  bodyFormat: "markdown",
  bodyHtml: "<p>Hello</p>",
  bodyHtmlFormat: "html",
  bodyMarkdown: "Hello",
  ...overrides,
});

describe("the markdown preview producer", () => {
  const body = functionBody(service, "async function previewMarkdown(rawPayload, session) {");

  it("reconstructs four members and spreads nothing", () => {
    const at = body.indexOf("return {");
    const literal = body.slice(at, body.indexOf("\n  };", at));
    const members = [...literal.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      ["bodyFormat", "bodyHtml", "bodyHtmlFormat", "bodyMarkdown"],
      "the preview must carry exactly the four declared members",
    );
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
  });

  it("writes both format labels as constants rather than discovering them", () => {
    const literal = body.slice(body.indexOf("return {"));
    assert.match(literal, /bodyFormat: "markdown",/, "the markdown label must be a written constant");
    assert.match(literal, /bodyHtmlFormat: "html",/, "and so must the html label");
    const declared = declaredInterface("BrowserNoteMarkdownPreview");
    assert.match(declared, /bodyFormat: "markdown";/, "and both must be declared as the literals they are");
    assert.match(declared, /bodyHtmlFormat: "html";/, "including the html one");
  });

  it("sanitises the markup the browser will assign, before answering it", () => {
    assert.match(body, /bodyHtml: renderMarkdownToSafeHtml\(bodyMarkdown\),/,
      "the html must come from the safe renderer");
    assert.match(body, /const bodyMarkdown = assertSafeMarkdown\(/,
      "and the markdown it renders must be asserted safe first");
    assert.match(
      functionBody(markdown, "function renderMarkdownToSafeHtml(markdown = \"\") {"),
      /const safeMarkdown = assertSafeMarkdown\(markdown\);/,
      "the renderer must assert safety itself rather than trusting its caller",
    );
  });

  it("refuses a caller who may not preview", () => {
    assert.match(body, /if \(!canPreview\) \{\n {4}throw new AppError\("You do not have permission to preview note Markdown\./,
      "an unpermitted caller must be refused by throwing");
    assert.match(body, /permissionsService\.canInAnyScope\(session, NOTE_PERMISSIONS\.UPDATE\)/,
      "and the permission must be the note update right");
  });

  it("hands the result to the browser unchanged, under a workspace session", () => {
    const at = routes.indexOf('notesRoutes.post("/notes/preview"');
    assert.notEqual(at, -1, "the preview route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /notesService\.previewMarkdown\(payload, requireWorkspaceSession\(request\.session\)\)/,
      "the route must call the traced producer with a workspace session");
    assert.match(route, /response\.status\(200\)\.json\(result\)/, "and answer its result");
  });
});

describe("the declaration", () => {
  it("declares the producer's own membership, with nothing optional", () => {
    const declared = declaredInterface("BrowserNoteMarkdownPreview");
    const members = [...declared.matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
    const body = functionBody(service, "async function previewMarkdown(rawPayload, session) {");
    const at = body.indexOf("return {");
    const produced = [...body.slice(at, body.indexOf("\n  };", at)).matchAll(/^ {4}(\w+)[:,]/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(members, produced, "declared membership must equal the producer's literal");
    assert.ok(!/^ {2}\w+\?:/m.test(declared), "no member may be optional");
  });

  it("says why the rendered markup is safe to assign", () => {
    const at = contracts.indexOf("export interface BrowserNoteMarkdownPreview {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /safe to do that \*\*because `renderMarkdownToSafeHtml` produced it\*\*/,
      "the contract must name the server guarantee the browser relies on");
    assert.match(doc, /would be writing unsanitised markup into the document/,
      "and what accepting an unvouchable body would mean");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readPreview = shippedReader();

  it("accepts a real preview", () => {
    const result = readPreview(preview());
    assert.ok(result, "a valid preview must be accepted");
    assert.equal(result.bodyHtml, "<p>Hello</p>", "the rendered markup must survive");
    assert.equal(result.bodyMarkdown, "Hello", "and so must the markdown");
  });

  it("accepts an empty render the producer really sent", () => {
    const result = readPreview(preview({ bodyHtml: "", bodyMarkdown: "" }));
    assert.ok(result, "an empty markdown really does render to nothing");
    assert.equal(result.bodyHtml, "", "and must be answered as the empty render it is");
  });

  it("refuses a body that is not an object", () => {
    for (const bad of [null, undefined, 7, "<p>x</p>", [], {}]) {
      assert.equal(readPreview(bad), null, "an unusable body must be refused: " + String(bad));
    }
  });

  it("refuses a body whose format labels are not the producer's constants", () => {
    for (const bad of [
      preview({ bodyFormat: "html" }),
      preview({ bodyFormat: "" }),
      preview({ bodyFormat: undefined }),
      preview({ bodyHtmlFormat: "markdown" }),
      preview({ bodyHtmlFormat: null }),
    ]) {
      assert.equal(readPreview(bad), null, "a body contradicting a written constant must be refused");
    }
  });

  it("refuses markup or markdown that is not text", () => {
    for (const bad of [
      preview({ bodyHtml: undefined }),
      preview({ bodyHtml: null }),
      preview({ bodyHtml: 7 }),
      preview({ bodyMarkdown: undefined }),
      preview({ bodyMarkdown: {} }),
    ]) {
      assert.equal(readPreview(bad), null, "an unusable body value must be refused");
    }
  });

  it("answers its own four members rather than the wire object", () => {
    const wire = preview({ aFutureMember: 1 });
    const result = readPreview(wire);
    assert.ok(result, "an unrecognised member must not refuse the preview");
    assert.deepEqual(
      Object.keys(result).sort(),
      ["bodyFormat", "bodyHtml", "bodyHtmlFormat", "bodyMarkdown"],
      "but must not be answered, because the preview is reconstructed",
    );
  });
});

describe("the notes consumer", () => {
  it("no longer defaults an unreadable render to an empty preview", () => {
    assert.ok(!consumer.includes("result.bodyHtml || \"\""), "the raw markup default must be gone");
  });

  it("refuses rather than assigning markup it cannot vouch for", () => {
    assert.match(
      consumer,
      /throw new Error\("The Markdown preview could not be read\./,
      "an unreadable preview must take the render error path",
    );
    const render = functionBody(consumer, "  async function renderPreview() {");
    assert.ok(
      render.indexOf("could not be read.") < render.indexOf("preview.innerHTML"),
      "and must refuse before anything reaches innerHTML",
    );
    assert.match(render, /preview\.innerHTML = rendered\.bodyHtml;/,
      "what is assigned must be the vouched-for markup");
  });

  it("still answers a stale request by returning rather than rendering", () => {
    const render = functionBody(consumer, "  async function renderPreview() {");
    assert.ok(
      render.indexOf("requestId !== state.previewRequestId") < render.indexOf("could not be read."),
      "a superseded request must still return before this reader's refusal can throw into it",
    );
  });

  it("leaves the other note producers to their own children", () => {
    // `result.revisions || []` was on this list until `0.33.33.38.4.12.3` adopted the revision
    // history boundary. A sibling child doing its job is not this one widening, so the claim is
    // asserted against that reader - anchored on the call site, because the reader's own
    // definition also contains its name.
    assert.match(consumer, /readNoteRevisions\(await api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/revisions`/,
      "the revision history is another child's read and is untouched");
    // `result.note.note_id` was on this list until `0.33.33.38.4.2.2` adopted the established
    // note boundary for the archive and restore mutations. A sibling child doing its job is not
    // this one widening, so the claim is asserted against that boundary - anchored on the call
    // site, because the reader's own definition also contains its name.
    assert.match(consumer, /await selectNote\(requireNoteFromEnvelope\(result\)\.note_id\);/,
      "result.note.note_id is another child's read and is untouched");
    // `result.targets || []` was on this list until `0.33.33.38.4.12.2` claimed the link-target
    // directory. A sibling child doing its job is not this one widening, so the claim is now
    // asserted against that boundary - anchored on the call site, because the reader's own
    // definition also contains its name.
    assert.match(consumer, /const targets = readNoteLinkTargets\(/,
      "result.targets is another child's read and is untouched");
  });
});
