import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { renderMarkdownToHtml } from "../../src/core/markdown/markdown.service.js";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const preview = read("src/services/files-preview.service.js");
const files = read("src/services/files.service.js");
const routes = read("src/routes/files.routes.js");
const consumer = read("public/js/shared/file-preview.js");
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

/** The shipped reader block, instantiated from the module's own source. */
function shippedReaders() {
  const start = consumer.indexOf("  /** The five states the availability function");
  const end = consumer.indexOf("  async function loadFilePreview(dialog, row) {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above loadFilePreview");
  return new Function(consumer.slice(start, end) + `
    return {
      isFilePreviewContent,
      isFilePreviewDescriptor,
      readFilePreviewContent,
      readFilePreviewDescriptor,
      tables: {
        kinds: PREVIEW_DESCRIPTOR_KINDS,
        numbers: PREVIEW_DESCRIPTOR_NUMBER_MEMBERS,
        states: PREVIEW_DESCRIPTOR_STATES,
        text: PREVIEW_DESCRIPTOR_TEXT_MEMBERS,
      },
    };`)();
}

const ATTACHMENT_ID = "fa_9f2";
const CONTENT_ROUTE = `/api/files/attachments/${ATTACHMENT_ID}/preview/content`;

/**
 * A descriptor built the way the producer builds one, so a fixture cannot drift from it.
 * @param {Record<string, unknown>} [overrides]
 */
function makeDescriptor(overrides = {}) {
  const state = overrides.state ?? "previewable";
  const kind = overrides.kind ?? "markdown";
  const contentAvailable = state === "previewable";
  const url = `/api/files/attachments/${encodeURIComponent(String(overrides.fileAttachmentId ?? ATTACHMENT_ID))}/preview/content`;
  return {
    extension: "md",
    fileAttachmentId: ATTACHMENT_ID,
    file_attachment_id: ATTACHMENT_ID,
    fileId: "file_31",
    file_id: "file_31",
    fileName: "Design notes.md",
    file_name: "Design notes.md",
    filename: "Design notes.md",
    fileSizeBytes: 118,
    file_size_bytes: 118,
    fileType: "Markdown",
    file_type: "Markdown",
    mimeType: "text/markdown",
    mime_type: "text/markdown",
    moduleId: "tasks",
    module_id: "tasks",
    reason: contentAvailable ? "" : "unsupported_file_type",
    scanStatus: "passed",
    scan_status: "passed",
    status: "available",
    targetId: "task_7",
    target_id: "task_7",
    targetType: "task",
    target_type: "task",
    state,
    previewState: state,
    preview_state: state,
    kind,
    previewKind: kind,
    preview_kind: kind,
    contentAvailable,
    content_available: contentAvailable,
    ...(contentAvailable ? { contentUrl: url, content_url: url } : {}),
    ...overrides,
  };
}

const markdownContent = (overrides = {}) => ({
  bodyFormat: "markdown",
  bodyHtml: "<p>Hello</p>\n",
  bodyHtmlFormat: "html",
  bodyMarkdown: "Hello",
  kind: "markdown",
  ...overrides,
});

const textContent = (overrides = {}) => ({
  encoding: "utf-8",
  kind: "text",
  text: "plain",
  ...overrides,
});

const descriptorLiteral = functionBody(
  preview,
  "  const descriptor = {",
  "\n  };",
);

describe("the descriptor producer", () => {
  it("reconstructs its membership by name and spreads nothing", () => {
    assert.ok(!descriptorLiteral.includes("..."), "a spread would make the exact membership unearned");
    const conditional = [...functionBody(preview, "function shapeAttachmentPreviewDescriptor(")
      .matchAll(/descriptor\.(\w+) =/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(conditional, ["contentUrl", "content_url"],
      "only the paired content URL may be added after the literal");
  });

  it("adds the content URL only where content is actually available", () => {
    const body = functionBody(preview, "function shapeAttachmentPreviewDescriptor(");
    assert.match(body, /const contentAvailable = state === "previewable";/,
      "content availability must be derived from the state rather than decided separately");
    assert.match(body, /if \(contentAvailable\) \{\n {4}descriptor\.contentUrl = contentUrl;\n {4}descriptor\.content_url = contentUrl;\n {2}\}/,
      "the paired URL must be written only under that flag");
  });

  it("writes each state and kind into all three of its spellings", () => {
    assert.match(descriptorLiteral, /\n {4}state,\n {4}previewState: state,\n {4}preview_state: state,/,
      "the three state spellings must all come from the one state");
    assert.match(descriptorLiteral, /\n {4}kind,\n {4}previewKind: kind,\n {4}preview_kind: kind,/,
      "and the three kind spellings from the one kind");
  });

  it("builds the content URL from the attachment id and nothing else", () => {
    const body = functionBody(preview, "function previewContentUrlForAttachment(attachment) {");
    assert.match(
      body,
      /return `\/api\/files\/attachments\/\$\{encodeURIComponent\(attachment\.file_attachment_id\)\}\/preview\/content`;/,
      "the content URL must be the attachment-scoped preview route",
    );
    assert.doesNotMatch(body, /storage_key|storage_path|signed|bucket|s3|getSignedUrl/i,
      "a preview URL must never expose storage internals");
    assert.doesNotMatch(descriptorLiteral, /storage_key|storage_path|bucket|signed/i,
      "and the descriptor must not carry them either");
  });
});

describe("the state and kind vocabularies, scanned from their producers", () => {
  const availability = functionBody(preview, "function previewAvailabilityForAttachment(attachment, options = {}) {");
  const gate = functionBody(files, "async function readAttachmentPreviewAccess(session, attachmentId) {");

  it("closes the state union over every state the two producers write", () => {
    const produced = [...new Set([
      ...[...availability.matchAll(/state: "([a-z_]+)"/g)].map((entry) => entry[1]),
      ...[...gate.matchAll(/state: "([a-z_]+)"/g)].map((entry) => entry[1]),
    ])].sort();
    assert.deepEqual(
      produced,
      ["download_only", "previewable", "too_large_for_preview", "unauthorized", "unavailable"],
      "the declared states must be exactly the ones these two producers write",
    );
    const alias = contracts.slice(contracts.indexOf("export type BrowserFilePreviewState ="));
    const declared = [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z_]+)"/g)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, produced, "the declaration must close over the scanned set");
    assert.deepEqual([...shippedReaders().tables.states].sort(), produced,
      "and so must the table the shipped reader validates against");
  });

  it("closes the kind union over every kind the kind function returns", () => {
    const produced = [...new Set([...functionBody(preview, "function previewKindForAttachment(attachment) {")
      .matchAll(/return "([a-z]+)"/g)].map((entry) => entry[1]))].sort();
    assert.deepEqual(produced, ["image", "markdown", "text", "unsupported"],
      "the declared kinds must be exactly the ones the kind function returns");
    assert.deepEqual([...shippedReaders().tables.kinds].sort(), produced,
      "and the shipped reader must validate against that same set");
  });

  it("keeps unsupported out of the previewable kinds, because the producer returns early for it", () => {
    const availabilityBody = functionBody(preview, "function previewAvailabilityForAttachment(attachment, options = {}) {");
    assert.ok(
      availabilityBody.indexOf('kind === "unsupported"') < availabilityBody.indexOf('state: "previewable"'),
      "an unsupported kind must be answered download_only before the previewable return can be reached",
    );
    const declared = contracts.slice(contracts.indexOf("export type BrowserPreviewableFileKind ="));
    assert.match(declared.slice(0, 120), /"image" \| "markdown" \| "text";/,
      "so the previewable kinds must exclude it");
  });
});

describe("the content producer", () => {
  const body = functionBody(preview, "async function readAttachmentPreviewContent(attachment, availability, stream) {");

  it("re-runs the availability assertion before building anything", () => {
    assert.ok(
      body.indexOf("assertPreviewContentAvailable(availability);") < body.indexOf("shapeAttachmentPreviewDescriptor"),
      "content availability must be asserted before a descriptor or a body is built",
    );
    assert.match(
      functionBody(preview, "function assertPreviewContentAvailable(availability) {"),
      /if \(availability\.state === "previewable"\) return;\n {2}throw new AppError\(/,
      "and that assertion must throw for every state but previewable",
    );
  });

  it("answers image content as a stream rather than as JSON", () => {
    assert.match(body, /return \{ headers: buildPreviewImageHeaders\(attachment\), kind: "image", preview, stream \};/,
      "the image branch must answer a stream and its headers");
    const route = functionBody(routes, 'filesRoutes.get("/files/attachments/:fileAttachmentId/preview/content"', "\n}));");
    assert.match(route, /if \(result\.stream\) \{[\s\S]*result\.stream\.pipe\(response\);\n {4}return;/,
      "and the route must pipe that stream instead of serialising it");
  });

  it("reconstructs exactly the two JSON content records", () => {
    const markdown = body.slice(body.indexOf("content: {"), body.indexOf("},\n      preview,"));
    assert.deepEqual(
      membersOf(markdown.slice(markdown.indexOf("{"))),
      ["bodyFormat", "bodyHtml", "bodyHtmlFormat", "bodyMarkdown", "kind"],
      "the markdown record must carry exactly its five members",
    );
    const text = body.slice(body.lastIndexOf("return { content: {"));
    assert.deepEqual(
      membersOf(text.slice(text.indexOf("{ encoding"), text.indexOf("}, preview") + 1)),
      ["encoding", "kind", "text"],
      "and the text record exactly its three",
    );
    assert.deepEqual(membersOf(text.slice(text.indexOf("return {") + 7, text.indexOf(";"))).filter(
      (member) => member === "content" || member === "preview",
    ), ["content", "preview"], "the JSON envelope must carry the content and its descriptor");
  });

  it("writes the format labels as constants rather than discovering them", () => {
    assert.match(body, /bodyFormat: "markdown",/, "the markdown label must be a written constant");
    assert.match(body, /bodyHtmlFormat: "html",/, "and so must the html label");
    assert.match(body, /encoding: "utf-8", kind: "text", text/, "and so must the text encoding");
    assert.deepEqual(declaredMembers("BrowserFilePreviewMarkdownContent"),
      ["bodyFormat", "bodyHtml", "bodyHtmlFormat", "bodyMarkdown", "kind"],
      "the declaration must mirror the markdown record");
    assert.match(declaredInterface("BrowserFilePreviewMarkdownContent"), /bodyFormat: "markdown";/,
      "and declare the labels as the literals they are");
    assert.match(declaredInterface("BrowserFilePreviewTextContent"), /encoding: "utf-8";/,
      "including the text encoding");
  });

  it("caps the text it reads rather than streaming a whole file into a string", () => {
    assert.match(
      functionBody(preview, "async function readPreviewTextContent(stream) {"),
      /if \(totalBytes > MAX_TEXT_PREVIEW_BYTES\) \{\n {6}stream\.destroy\(\);\n {6}throw new AppError\("Preview content is too large\./,
      "the text read must be bounded and destroy the stream when it is exceeded",
    );
  });
});

describe("the Markdown preview is safe to inject because of the call that made it", () => {
  it("renders through the framework renderer rather than passing file bytes through", () => {
    assert.match(
      functionBody(preview, "async function readAttachmentPreviewContent(attachment, availability, stream) {"),
      /bodyHtml: renderMarkdownToHtml\(text\),/,
      "the html must come from the framework markdown renderer",
    );
    assert.match(
      functionBody(read("src/core/markdown/markdown.service.js"), "function renderMarkdownToHtml(markdown = \"\", options = {}) {"),
      /const source = stripUnsafeMarkdownLinks\(normalizeMarkdownSource\(markdown\)\);/,
      "and that renderer must strip unsafe links before parsing",
    );
    assert.match(
      functionBody(read("src/core/markdown/markdown.service.js"), "function createParser({ softLineBreaks = false } = {}) {"),
      /MarkdownIt\("commonmark", \{\n {4}html: false,/,
      "and must parse with raw HTML disabled",
    );
  });

  it("neutralises hostile file bytes, proved by rendering them", () => {
    for (const hostile of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<svg onload=alert(1)>",
      "<iframe src=\"javascript:alert(1)\"></iframe>",
      "<a href=\"javascript:alert(1)\">x</a>",
    ]) {
      // Only surviving tags matter. Escaped text may still read like an attack - the point
      // is that `html: false` leaves it as text, where `onerror=` is six characters rather
      // than a handler - so asserting on raw substrings would pass the wrong thing.
      for (const tag of renderMarkdownToHtml(hostile).match(/<[a-z][^>]*>/gi) || []) {
        assert.doesNotMatch(tag, /^<(?:script|svg|iframe|img|object|embed|style)\b/i,
          "uploaded markup must never reach the browser as a tag: " + hostile);
        assert.doesNotMatch(tag, /\son[a-z]+\s*=/i,
          "and never as an event handler: " + hostile);
      }
    }
    for (const link of ["[x](javascript:alert(1))", "[x](vbscript:alert(1))", "[x](data:text/html,<b>)"]) {
      assert.doesNotMatch(renderMarkdownToHtml(link), /javascript:|vbscript:|data:/i,
        "an unsafe link target must not survive: " + link);
    }
  });

  it("does not turn an uploaded file into a remote image request", () => {
    assert.doesNotMatch(renderMarkdownToHtml("![alt](https://attacker.example/beacon.png)"), /<img/,
      "the Files preview passes no allowImages, so images render as text rather than as requests");
  });
});

describe("the shared access gate guards both halves", () => {
  const gate = functionBody(files, "async function readAttachmentPreviewAccess(session, attachmentId) {");

  it("refuses a missing or removed attachment before anything is shaped", () => {
    assert.match(gate, /if \(!attachment \|\| attachment\.removed_at\) \{\n {4}throw new AppError\("Attachment not found\.", 404\);/,
      "a missing or removed attachment must be refused");
  });

  it("proves the caller may read the attachable target", () => {
    assert.match(gate, /await assertCanUseAttachableTarget\(session, attachableType, "read", target\);/,
      "the caller must be able to read the target the file hangs off");
  });

  it("answers unauthorized rather than a descriptor when the download right is missing", () => {
    assert.match(gate, /permissionsService\.can\(session, "files\.download", \{[\s\S]*operation: "preview",/,
      "preview must require the files.download right");
    assert.match(gate, /if \(!canDownload\) \{[\s\S]*state: "unauthorized",/,
      "and a refused caller must get the unauthorized state");
  });

  it("passes the quarantine review right into the availability decision", () => {
    assert.match(gate, /permissionsService\.can\(session, "files\.manage_quarantine", \{[\s\S]*operation: "preview_review",/,
      "quarantine preview must require the quarantine right");
    assert.match(gate, /availabilityForAttachment\(attachment, \{ canPreviewInReview \}\)/,
      "and that right must be what allows a quarantined file to be previewed");
  });

  it("is run again by the content route, which then requires the object itself", () => {
    const content = functionBody(files, "async function readAttachmentPreviewContent(session, attachmentId) {");
    assert.match(content, /await readAttachmentPreviewAccess\(session, previewRequest\.fileAttachmentId\)/,
      "the content route must re-run the gate rather than trust the descriptor it handed out");
    assert.ok(
      content.indexOf("assertContentAvailable(availability)") < content.indexOf("readFileRow"),
      "and assert content availability before reading anything back",
    );
    assert.match(content, /if \(!file\) \{\n {4}throw new AppError\("File not found\.", 404\);/,
      "a missing backing file row must be refused");
    assert.match(content, /const storageAdapter = await assertStoredFileObjectExists\(file, "preview"\);/,
      "and the stored object must be proved to exist before it is read");
  });

  it("streams images under no-store, sandboxed, non-sniffable headers", () => {
    const headers = functionBody(preview, "function buildPreviewImageHeaders(attachment) {");
    for (const header of [
      /"Cache-Control": "no-store"/,
      /"Content-Disposition": `inline;/,
      /"Content-Security-Policy": "sandbox"/,
      /"X-Content-Type-Options": "nosniff"/,
    ]) {
      assert.match(headers, header, "the image stream must keep its security headers");
    }
  });
});

describe("the declarations", () => {
  it("declare exactly the membership the producer writes", () => {
    const produced = membersOf(descriptorLiteral.slice(descriptorLiteral.indexOf("{")));
    const declared = [...new Set([
      ...declaredMembers("BrowserFilePreviewDescriptorCommon"),
      ...declaredMembers("BrowserPreviewableFileDescriptor"),
    ])].sort();
    assert.deepEqual(declared, [...produced, "contentUrl", "content_url"].sort(),
      "the previewable descriptor must declare the literal plus the two conditional members");
    assert.deepEqual(
      [...new Set([
        ...declaredMembers("BrowserFilePreviewDescriptorCommon"),
        ...declaredMembers("BrowserUnpreviewableFileDescriptor"),
      ])].sort(),
      declared,
      "and both variants must agree on which members exist",
    );
  });

  it("state the content URL as present under previewable and absent otherwise", () => {
    assert.match(declaredInterface("BrowserPreviewableFileDescriptor"), /\n {2}contentUrl: string;/,
      "a previewable descriptor must promise the URL");
    assert.match(declaredInterface("BrowserPreviewableFileDescriptor"), /\n {2}state: "previewable";/,
      "and be discriminated by the previewable state");
    assert.match(declaredInterface("BrowserUnpreviewableFileDescriptor"), /\n {2}contentUrl\?: undefined;/,
      "the other variant must declare the URL absent rather than optional");
    assert.match(
      declaredInterface("BrowserUnpreviewableFileDescriptor"),
      /\n {2}state: Exclude<BrowserFilePreviewState, "previewable">;/,
      "and cover every state but that one",
    );
  });

  it("declare both envelopes exactly, with a previewable descriptor beside content", () => {
    assert.deepEqual(declaredMembers("BrowserFilePreviewDescriptorEnvelope"), ["preview"],
      "the descriptor envelope is one member");
    assert.deepEqual(declaredMembers("BrowserFilePreviewContentEnvelope"), ["content", "preview"],
      "the content envelope is two");
    assert.match(declaredInterface("BrowserFilePreviewContentEnvelope"), /preview: BrowserPreviewableFileDescriptor;/,
      "and the descriptor beside content can only be the previewable variant");
  });

  it("keep image content out of the JSON union", () => {
    const union = contracts.slice(contracts.indexOf("export type BrowserFilePreviewContent ="), contracts.indexOf("export type BrowserFilePreviewContent =") + 200);
    assert.doesNotMatch(union, /Image/, "the JSON content union must not admit an image member");
  });

  it("say why the rendered markup may be assigned", () => {
    const at = contracts.indexOf("export interface BrowserFilePreviewMarkdownContent {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /safe to do that \*\*because\n? ?`renderMarkdownToHtml` produced it\*\*/,
      "the contract must name the server guarantee the browser relies on");
    assert.match(doc, /attacker-controlled/,
      "and be honest that the bytes behind it are chosen by whoever uploaded the file");
  });

  it("record that the content URL is route-backed rather than a storage address", () => {
    const doc = declaredInterface("BrowserPreviewableFileDescriptor");
    assert.match(doc, /never a storage key, a filesystem path or a signed/,
      "the contract must say what the content URL is not");
  });
});

describe("the shipped readers, run against real bodies", () => {
  const { isFilePreviewContent, readFilePreviewContent, readFilePreviewDescriptor, tables } = shippedReaders();

  it("check every member the producer writes", () => {
    const covered = [...tables.text, ...tables.numbers,
      "state", "previewState", "preview_state", "kind", "previewKind", "preview_kind",
      "contentAvailable", "content_available", "contentUrl", "content_url"].sort();
    const produced = [...membersOf(descriptorLiteral.slice(descriptorLiteral.indexOf("{"))), "contentUrl", "content_url"].sort();
    assert.deepEqual(covered, produced, "the reader must validate every member the producer sends");
  });

  it("accepts a previewable descriptor", () => {
    const result = readFilePreviewDescriptor({ preview: makeDescriptor() });
    assert.ok(result, "a real previewable descriptor must be accepted");
    assert.equal(result.contentUrl, CONTENT_ROUTE, "and keep the route it was given");
  });

  it("accepts each non-previewable state the producer can answer", () => {
    for (const [state, kind] of [
      ["unavailable", "text"],
      ["download_only", "unsupported"],
      ["too_large_for_preview", "markdown"],
      ["unauthorized", "image"],
    ]) {
      const result = readFilePreviewDescriptor({ preview: makeDescriptor({ state, kind }) });
      assert.ok(result, "a real " + state + " descriptor must be accepted");
      assert.equal(result.contentUrl, undefined, "and must carry no content URL");
    }
  });

  it("refuses a body that is not a descriptor envelope", () => {
    for (const bad of [null, undefined, 7, "preview", [], {}, { preview: null }, { preview: [] }, { preview: "previewable" }]) {
      assert.equal(readFilePreviewDescriptor(bad), null, "an unusable descriptor body must be refused");
    }
  });

  it("refuses a descriptor whose state or kind is not one the producer answers", () => {
    for (const bad of [
      makeDescriptor({ state: "pending" }),
      makeDescriptor({ state: "" }),
      makeDescriptor({ state: undefined }),
      makeDescriptor({ kind: "pdf" }),
      makeDescriptor({ kind: null }),
    ]) {
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "a state or kind outside the producer's vocabulary must be refused");
    }
  });

  it("refuses a descriptor whose repeated spellings disagree", () => {
    for (const bad of [
      makeDescriptor({ previewState: "unavailable" }),
      makeDescriptor({ preview_state: "download_only" }),
      makeDescriptor({ previewKind: "text" }),
      makeDescriptor({ preview_kind: "image" }),
    ]) {
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "one fact written three times cannot disagree with itself");
    }
  });

  it("refuses a descriptor whose content availability contradicts its state", () => {
    for (const bad of [
      makeDescriptor({ contentAvailable: false }),
      makeDescriptor({ content_available: false }),
      makeDescriptor({ state: "unavailable", contentAvailable: true }),
      makeDescriptor({ state: "unavailable", content_available: true }),
    ]) {
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "content availability is derived from the state and cannot disagree with it");
    }
  });

  it("refuses a previewable descriptor that carries no usable content URL", () => {
    for (const bad of [
      makeDescriptor({ contentUrl: undefined }),
      makeDescriptor({ content_url: undefined }),
      makeDescriptor({ contentUrl: "" }),
      makeDescriptor({ content_url: CONTENT_ROUTE + "?x=1" }),
    ]) {
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "a previewable descriptor must carry the content route it claims");
    }
  });

  it("refuses a content URL that is not this attachment's preview route", () => {
    for (const url of [
      "https://attacker.example/steal",
      "//attacker.example/steal",
      "/api/files/attachments/other/preview/content",
      "s3://bucket/objects/abc123",
      "workspaces/w1/files/abc123.md",
      "/api/files/file_31/download",
    ]) {
      assert.equal(
        readFilePreviewDescriptor({ preview: makeDescriptor({ contentUrl: url, content_url: url }) }),
        null,
        "the browser must not follow a URL the descriptor could not have built: " + url,
      );
    }
  });

  it("refuses a non-previewable descriptor that smuggles a content URL", () => {
    for (const state of ["unavailable", "download_only", "too_large_for_preview", "unauthorized"]) {
      const bad = { ...makeDescriptor({ state, kind: "text" }), contentUrl: CONTENT_ROUTE, content_url: CONTENT_ROUTE };
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "a descriptor that is not previewable must not carry a content URL");
    }
  });

  it("refuses a previewable descriptor claiming an unsupported kind", () => {
    assert.equal(readFilePreviewDescriptor({ preview: makeDescriptor({ kind: "unsupported" }) }), null,
      "the producer answers download_only for an unsupported kind, so this pairing is not one it sends");
  });

  it("refuses a descriptor whose members are the wrong sort of value", () => {
    for (const bad of [
      makeDescriptor({ filename: null }),
      makeDescriptor({ extension: 7 }),
      makeDescriptor({ reason: undefined }),
      makeDescriptor({ fileSizeBytes: "118" }),
      makeDescriptor({ file_size_bytes: null }),
      makeDescriptor({ scanStatus: {} }),
    ]) {
      assert.equal(readFilePreviewDescriptor({ preview: bad }), null,
        "a malformed descriptor member must refuse the whole descriptor");
    }
  });

  it("accepts real text and Markdown content beside their descriptor", () => {
    const text = readFilePreviewContent({ content: textContent(), preview: makeDescriptor({ kind: "text" }) });
    assert.ok(text, "a real text content body must be accepted");
    assert.equal(text.content.text, "plain", "and keep its text");
    const markdown = readFilePreviewContent({ content: markdownContent(), preview: makeDescriptor() });
    assert.ok(markdown, "a real markdown content body must be accepted");
    assert.equal(markdown.content.bodyHtml, "<p>Hello</p>\n", "and keep the rendered markup");
  });

  it("accepts an empty file and an empty render, which are both real answers", () => {
    const empty = readFilePreviewContent({
      content: textContent({ text: "" }),
      preview: makeDescriptor({ kind: "text" }),
    });
    assert.ok(empty, "an empty text file really does preview as nothing");
    assert.equal(empty.content.text, "", "and must be answered as the empty file it is");
    const blank = readFilePreviewContent({
      content: markdownContent({ bodyHtml: "", bodyMarkdown: "" }),
      preview: makeDescriptor(),
    });
    assert.ok(blank, "markdown that renders to nothing is still a real render");
    assert.equal(blank.content.bodyHtml, "", "and must be answered as the empty render it is");
  });

  it("refuses a content body that is not the producer's envelope", () => {
    for (const bad of [
      null, 7, [], {},
      { content: textContent() },
      { preview: makeDescriptor({ kind: "text" }) },
      { content: null, preview: makeDescriptor({ kind: "text" }) },
      { content: "plain", preview: makeDescriptor({ kind: "text" }) },
    ]) {
      assert.equal(readFilePreviewContent(bad), null, "an unusable content body must be refused");
    }
  });

  it("refuses content whose written constants are not the producer's", () => {
    for (const bad of [
      markdownContent({ bodyFormat: "html" }),
      markdownContent({ bodyHtmlFormat: "markdown" }),
      markdownContent({ bodyFormat: undefined }),
      textContent({ encoding: "utf-16" }),
      textContent({ encoding: undefined }),
    ]) {
      assert.equal(readFilePreviewContent({ content: bad, preview: makeDescriptor({ kind: bad.kind }) }), null,
        "a body contradicting a written constant must be refused");
    }
  });

  it("refuses content whose bodies are not text", () => {
    for (const bad of [
      markdownContent({ bodyHtml: null }),
      markdownContent({ bodyHtml: 7 }),
      markdownContent({ bodyMarkdown: undefined }),
      textContent({ text: null }),
      textContent({ text: ["plain"] }),
    ]) {
      assert.equal(readFilePreviewContent({ content: bad, preview: makeDescriptor({ kind: bad.kind }) }), null,
        "an unusable content value must be refused");
    }
  });

  it("refuses content whose kind disagrees with its descriptor", () => {
    assert.equal(
      readFilePreviewContent({ content: markdownContent(), preview: makeDescriptor({ kind: "text" }) }),
      null,
      "markdown content beside a text descriptor is not something this producer sends",
    );
    assert.equal(
      readFilePreviewContent({ content: textContent(), preview: makeDescriptor({ kind: "markdown" }) }),
      null,
      "and neither is the reverse",
    );
  });

  it("refuses content whose descriptor is not previewable", () => {
    for (const state of ["unavailable", "download_only", "too_large_for_preview", "unauthorized"]) {
      assert.equal(
        readFilePreviewContent({ content: textContent(), preview: makeDescriptor({ state, kind: "text" }) }),
        null,
        "content cannot arrive beside a descriptor the content route would have refused: " + state,
      );
    }
  });

  it("refuses image content offered as JSON", () => {
    assert.equal(isFilePreviewContent({ kind: "image" }), false, "an image is not a JSON content record");
    assert.equal(
      readFilePreviewContent({
        content: { kind: "image", encoding: "utf-8", text: "" },
        preview: makeDescriptor({ kind: "image" }),
      }),
      null,
      "the image branch streams bytes, so a JSON image body did not come from this producer",
    );
  });

  it("answers the producer's own descriptor rather than a rebuilt one", () => {
    const wire = makeDescriptor({ aFutureMember: 1 });
    const result = readFilePreviewDescriptor({ preview: wire });
    assert.equal(result, wire, "a vouched descriptor is passed on by identity, not copied");
  });
});

describe("the file preview consumer", () => {
  const load = functionBody(consumer, "  async function loadFilePreview(dialog, row) {", "\n  }\n");

  it("no longer defaults an unreadable response to a usable-looking one", () => {
    assert.ok(!consumer.includes("descriptorResponse.preview || {}"), "the raw descriptor default must be gone");
    assert.ok(!consumer.includes("contentResponse.content || {}"), "the raw content default must be gone");
  });

  it("reads both responses through the vouching readers", () => {
    assert.match(load, /const preview = readFilePreviewDescriptor\(\n\s+await api\.getJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview`/,
      "the descriptor must be read through its reader");
    assert.match(load, /const contentBody = readFilePreviewContent\(await api\.getJson\(preview\.contentUrl, \{ cache: "no-store" \}\)\);/,
      "and the content through its own, from the descriptor's route");
  });

  it("refuses an unreadable response instead of showing it as an unavailable file", () => {
    assert.match(load, /throw new Error\("The file preview descriptor could not be read\./,
      "an unreadable descriptor must take the preview failure path");
    assert.match(load, /throw new Error\("The file preview content could not be read\./,
      "and so must unreadable content");
    assert.ok(
      load.indexOf("could not be read.") < load.indexOf("renderFilePreviewState(dialog, preview)"),
      "refusal must come before a state message can be rendered from it",
    );
  });

  it("still leaves a dismissed dialog alone before it can throw into it", () => {
    const first = load.indexOf("!dialog.isConnected");
    assert.ok(first !== -1 && first < load.indexOf("if (!preview)"),
      "a closed dialog must still return before the descriptor refusal");
    assert.ok(
      load.indexOf("!dialog.isConnected", first + 1) < load.indexOf("if (!contentBody)"),
      "and before the content refusal",
    );
  });

  it("branches on the state alone, because the URL now travels with it", () => {
    assert.match(load, /if \(preview\.state !== "previewable"\) \{\n\s+renderFilePreviewState\(dialog, preview\);/,
      "a non-previewable descriptor must render its state");
    assert.ok(!load.includes("!preview.contentUrl"),
      "the separate URL test is gone: the previewable descriptor is the one that carries it");
    assert.match(load, /if \(preview\.kind === "image"\) \{\n\s+renderFilePreviewImage\(dialog, preview\);/,
      "an image must be rendered from the content URL rather than fetched as JSON");
  });

  it("assigns only markup the reader vouched for, and keeps text as text", () => {
    const markdown = functionBody(consumer, "  function renderFilePreviewMarkdown(dialog, html) {", "\n  }\n");
    assert.match(markdown, /content\.innerHTML = html;/, "the sink must assign the vouched-for markup");
    assert.ok(!markdown.includes('html || ""'), "and must not default markup it could not read");
    assert.match(
      functionBody(consumer, "  function renderFilePreviewText(dialog, text) {", "\n  }\n"),
      /createFilePreviewElement\("code", \{ text: text \|\| "" \}\)/,
      "text preview must stay textContent rather than becoming markup",
    );
    assert.doesNotMatch(consumer, /markdown-?it|marked|showdown/i,
      "the browser must not add a markdown parser of its own");
  });

  it("keeps the readers private rather than publishing a new parsing surface", () => {
    const published = functionBody(consumer, "  namespace.filePreview = Object.freeze({", "\n  });");
    for (const reader of ["readFilePreviewDescriptor", "readFilePreviewContent", "isFilePreviewDescriptor"]) {
      assert.ok(!published.includes(reader), reader + " is an internal wire reader and must not be published");
    }
    assert.deepEqual(
      [...declaredInterface("BrowserFilePreviewActions").matchAll(/^ {2}(\w+)\(/gm)].map((entry) => entry[1]).sort(),
      ["fileActionAttachmentId", "normalizeFileActionRecord", "openFilePreviewAction"],
      "the public action surface must be unchanged by this child",
    );
  });
});
