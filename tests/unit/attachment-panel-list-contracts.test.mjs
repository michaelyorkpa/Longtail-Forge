import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/files.service.js");
const routes = read("src/routes/files.routes.js");
const panel = read("public/js/shared/file-attachments.js");
const filesPage = read("public/js/files.js");
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

/** @param {string} source @param {string} name */
function frozenTable(source, name) {
  const at = source.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  return [...source.slice(at, source.indexOf("]);", at)).matchAll(/"([a-z_A-Z]+)"/g)]
    .map((entry) => entry[1]).sort();
}

/**
 * One of the two shipped readers, instantiated from its own page's source.
 * @param {string} source
 * @param {{ tables: readonly string[], functions: readonly string[] }} names
 * @param {string} entry
 */
function shippedReader(source, names, entry) {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = source.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return source.slice(start, source.indexOf("\n  }\n", start) + 4);
  };
  const tables = names.tables.map((/** @type {string} */ name) => "const " + name + " = " + JSON.stringify(frozenTable(source, name)) + ";");
  return new Function([...tables, ...names.functions.map(slice), "return " + entry + ";"].join("\n"))();
}

const panelReader = () => shippedReader(panel, {
  tables: ["PANEL_ATTACHMENT_TEXT", "PANEL_ATTACHMENT_FILE_TEXT", "PANEL_ATTACHMENT_FILE_NULLABLE_TEXT", "PANEL_ATTACHMENT_SORTS", "PANEL_PAGINATION_NUMBERS"],
  functions: [
    "  function isPanelRecord(value) {",
    "  function isPanelPagination(value) {",
    "  function isPanelAttachmentFile(value) {",
    "  function isPanelAttachment(value) {",
    "  function readPanelAttachmentList(body) {",
  ],
}, "readPanelAttachmentList");

const filesReader = () => shippedReader(filesPage, {
  tables: ["ATTACHMENT_TEXT", "ATTACHMENT_FILE_TEXT", "ATTACHMENT_FILE_NULLABLE_TEXT", "ATTACHMENT_SORTS", "ATTACHMENT_PAGINATION_NUMBERS"],
  functions: [
    "  function isAttachmentRecord(value) {",
    "  function isAttachmentPagination(value) {",
    "  function isAttachmentFile(value) {",
    "  function isFileAttachment(value) {",
    "  function readFileAttachmentList(body) {",
  ],
}, "readFileAttachmentList");

const file = (overrides = {}) => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  deleted_at: null,
  displayName: "Brief.pdf",
  extension: "pdf",
  fileSizeBytes: 2048,
  mimeTypeDetected: "application/pdf",
  originalFilename: "Brief.pdf",
  scanStatus: "passed",
  status: "available",
  updatedAt: null,
  updated_at: null,
  uploadedByLabel: "Ada",
  uploaded_by_label: "Ada",
  ...overrides,
});

const attachment = (overrides = {}) => ({
  attachmentRole: "attachment",
  caption: "",
  clientId: "",
  clientLabel: "",
  client_label: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  file: file(),
  fileAttachmentId: "fa_1",
  file_attachment_id: "fa_1",
  fileId: "file_1",
  file_id: "file_1",
  moduleId: "tasks",
  projectId: "",
  projectLabel: "",
  project_label: "",
  removedAt: null,
  sortOrder: 0,
  target: { id: "task_1", label: "Ship it", type: "task" },
  targetId: "task_1",
  targetLabel: "Ship it",
  target_label: "Ship it",
  targetType: "task",
  visibility: "workspace",
  ...overrides,
});

const pagination = (overrides = {}) => ({
  hasMore: false,
  limit: 25,
  maxPageSize: 100,
  nextCursor: "",
  offset: 0,
  returned: 1,
  total: 1,
  ...overrides,
});

const body = (overrides = {}) => ({
  attachments: [attachment()],
  pagination: pagination(),
  sort: "newest",
  ...overrides,
});

describe("the producer this child adopts", () => {
  it("is the one 0.33.33.38.4.9.2 already typed", () => {
    const route = functionBody(routes, 'filesRoutes.get("/files/attachments"', "\n}));");
    assert.match(route, /await filesService\.listAttachments\(request\.session, request\.query\)/,
      "the list route must call the traced producer");
    assert.match(panel, /await api\.getJson\(`\/api\/files\/attachments\?\$\{new URLSearchParams\(\{/,
      "and the panel must read that same route");
    assert.deepEqual(declaredMembers("BrowserFileAttachmentList"), ["attachments", "pagination", "sort"],
      "over the envelope that child published");
  });

  it("spreads only its own reconstruction, which is why the element stays exact", () => {
    const shaper = functionBody(service, "async function shapeAttachmentForRead(session, attachment) {", "\n}\n");
    assert.match(shaper, /const shaped = shapeAttachment\(attachment\);/,
      "the read shaper must start from this service's own reconstruction");
    assert.match(shaper, /return \{\n {4}\.\.\.shaped,/,
      "and spread that rather than an untrusted body");
    assert.match(shaper, /target: target\n\s+\? \{\n\s+id: shaped\.targetId,\n\s+label: target\.label,\n\s+type: shaped\.targetType,\n\s+\}\n\s+: null,/,
      "the nested target is reconstructed by name, or null");
  });

  it("keeps the panel out of every neighbouring Files producer", () => {
    for (const other of ["/api/files/attachments/counts", "/preview", "/api/files/settings", "/api/files/storage/accounting"]) {
      assert.ok(!panel.includes(other), other + " belongs to another child and must not appear here");
    }
  });
});

describe("both readers answer to the same declaration", () => {
  it("check exactly the members the contract declares, from the declaration rather than each other", () => {
    const declaredAttachment = declaredMembers("BrowserFileAttachment");
    const declaredFile = declaredMembers("BrowserFileAttachmentFile");

    const panelAttachment = [...frozenTable(panel, "PANEL_ATTACHMENT_TEXT"),
      "file", "removedAt", "sortOrder", "target"].sort();
    const filesAttachment = [...frozenTable(filesPage, "ATTACHMENT_TEXT"),
      "file", "removedAt", "sortOrder", "target"].sort();
    assert.deepEqual(panelAttachment, declaredAttachment,
      "the panel reader must cover exactly the declared attachment membership");
    assert.deepEqual(filesAttachment, declaredAttachment,
      "and so must the Files page reader");

    const panelFile = [...frozenTable(panel, "PANEL_ATTACHMENT_FILE_TEXT"),
      ...frozenTable(panel, "PANEL_ATTACHMENT_FILE_NULLABLE_TEXT"), "fileSizeBytes"].sort();
    const filesFile = [...frozenTable(filesPage, "ATTACHMENT_FILE_TEXT"),
      ...frozenTable(filesPage, "ATTACHMENT_FILE_NULLABLE_TEXT"), "fileSizeBytes"].sort();
    assert.deepEqual(panelFile, declaredFile, "the panel reader must cover the declared file membership");
    assert.deepEqual(filesFile, declaredFile, "and so must the Files page reader");
  });

  it("close the sort vocabulary at the producer's own set", () => {
    const producerSorts = [...functionBody(service, "const ATTACHMENT_SORT_MODES = new Set([", "]);")
      .matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(producerSorts, ["filename", "newest", "oldest", "size", "status"],
      "the producer must admit exactly these five orderings");
    assert.deepEqual(frozenTable(panel, "PANEL_ATTACHMENT_SORTS"), producerSorts,
      "the panel table must close over the scanned set");
    assert.deepEqual(frozenTable(filesPage, "ATTACHMENT_SORTS"), producerSorts,
      "and so must the Files page table");
    const alias = contracts.slice(contracts.indexOf("export type BrowserFileAttachmentSort ="));
    assert.deepEqual(
      [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]).sort(),
      producerSorts,
      "and the declared union",
    );
  });

  it("agree on every fixture, which is what a bounded duplicate has to prove", () => {
    const readPanel = panelReader();
    const readFiles = filesReader();
    /** @type {Array<[string, unknown, boolean]>} */
    const fixtures = [
      ["a real page", body(), true],
      ["an empty page", body({ attachments: [], pagination: pagination({ returned: 0, total: 0 }) }), true],
      ["a removed attachment", body({ attachments: [attachment({ removedAt: "2026-02-01T00:00:00.000Z" })] }), true],
      ["an unresolved target", body({ attachments: [attachment({ target: null })] }), true],
      ["a page with no total", body({ pagination: pagination({ total: null }) }), true],
      ["a primitive body", 7, false],
      ["a missing attachments member", { pagination: pagination(), sort: "newest" }, false],
      ["a non-array attachments member", body({ attachments: {} }), false],
      ["a malformed attachment", body({ attachments: [attachment({ moduleId: null })] }), false],
      ["an empty attachment identifier", body({ attachments: [attachment({ fileAttachmentId: "" })] }), false],
      ["a malformed nested file", body({ attachments: [attachment({ file: file({ status: 7 }) })] }), false],
      ["a missing nested file", body({ attachments: [attachment({ file: undefined })] }), false],
      ["a malformed target", body({ attachments: [attachment({ target: { id: "task_1", label: 7, type: "task" } })] }), false],
      ["a malformed sortOrder", body({ attachments: [attachment({ sortOrder: "0" })] }), false],
      ["a missing pagination member", body({ pagination: { hasMore: false } }), false],
      ["a malformed pagination number", body({ pagination: pagination({ limit: "25" }) }), false],
      ["a malformed pagination cursor", body({ pagination: pagination({ nextCursor: null }) }), false],
      ["an unsupported sort", body({ sort: "relevance" }), false],
      ["a missing sort", body({ sort: undefined }), false],
    ];

    for (const [label, fixture, accepted] of fixtures) {
      assert.equal(Boolean(readPanel(fixture)), accepted,
        "the panel reader must " + (accepted ? "accept" : "refuse") + " " + label);
      assert.equal(Boolean(readFiles(fixture)), accepted,
        "the Files page reader must " + (accepted ? "accept" : "refuse") + " " + label);
    }
  });

  it("both answer the producer's own objects rather than rebuilt ones", () => {
    for (const [name, reader] of [["panel", panelReader()], ["Files page", filesReader()]]) {
      const wire = body({ attachments: [attachment({ aFutureMember: { depth: 2 } })] });
      // Captured before the call: comparing against `wire.attachments[0]` afterwards reads
      // through the same array, so a reader that replaced each element in place would have
      // compared equal to its own replacement and passed.
      const originalArray = wire.attachments;
      const originalAttachment = wire.attachments[0];
      const originalFile = wire.attachments[0].file;
      const result = reader(wire);
      assert.ok(result, "a benign additional member must not refuse the page");
      assert.equal(result.attachments, originalArray, name + " must answer the producer's own array");
      assert.equal(result.attachments[0], originalAttachment, name + " must answer the producer's own attachment");
      assert.equal(result.attachments[0].file, originalFile, name + " must keep the nested file by identity");
      assert.deepEqual(/** @type {Record<string, unknown>} */ (result.attachments[0]).aFutureMember, { depth: 2 },
        name + " must carry a member this contract does not promise");
    }
  });
});

describe("the panel reader is a bounded duplicate, and says so", () => {
  it("adds no shared script, no namespace surface and no second contract", () => {
    assert.doesNotMatch(contracts, /BrowserPanelAttachment|BrowserMountedAttachment|BrowserAttachmentPanelList/,
      "this child must not declare a second attachment model");
    const published = functionBody(panel, "  namespace.fileAttachments = {", "\n  };");
    assert.deepEqual([...published.matchAll(/^ {4}(\w+),/gm)].map((entry) => entry[1]), ["mount"],
      "the published surface must still be the single mount");
    assert.ok(!panel.includes("readFileAttachmentList"),
      "the panel must not reach for the Files page's reader");
    assert.ok(!filesPage.includes("readPanelAttachmentList"),
      "and the Files page must not reach for the panel's");
  });

  it("records why the duplicate exists rather than claiming a centralised parser", () => {
    const at = panel.indexOf("  const PANEL_ATTACHMENT_TEXT = Object.freeze([");
    const doc = panel.slice(panel.lastIndexOf("/**", at), at).replace(/\n {3}\* ?/g, " ");
    assert.match(doc, /\*\*This is a bounded duplicate, not a centralised parser\*\*/,
      "the reader must say what it is");
    assert.match(doc, /both readers are pinned to the same declaration and the same producer/,
      "and what keeps the duplicate honest");
    assert.match(doc, /a delivery change well outside a one-consumer adoption/,
      "and why the alternative was refused");
  });
});

describe("the panel consumer", () => {
  const refresh = functionBody(panel, "  async function refresh(container, state) {", "\n  }\n");

  it("no longer defaults an unreadable page to an empty attachment list", () => {
    assert.ok(!panel.includes("result.attachments || []"), "the raw list default must be gone");
  });

  it("reads the page through the vouching reader", () => {
    assert.match(refresh, /const page = readPanelAttachmentList\(await api\.getJson\(`\/api\/files\/attachments\?/,
      "the page must be read through its reader");
    assert.match(refresh, /throw new Error\("The attachment list could not be read\./,
      "and an unreadable page must be refused");
  });

  it("refuses before the status map, the assignment and either emit", () => {
    const refusal = refresh.indexOf("could not be read.");
    assert.notEqual(refusal, -1, "the page must be refused");
    for (const later of [
      "const previousStatuses = new Map(",
      "state.attachments = page.attachments;",
      'emit(container, state, "statusChanged"',
      'emit(container, state, "refresh", { attachments: state.attachments })',
    ]) {
      const at = refresh.indexOf(later);
      assert.notEqual(at, -1, later + " must exist in the refresh path");
      assert.ok(refusal < at, "the refusal must come before " + later);
    }
  });

  it("routes the refusal into the panel's existing load-error path", () => {
    assert.match(refresh, /\} catch \(error\) \{\n\s+state\.error = requireErrors\(\)\.caughtMessage\(error, "Attachments could not be loaded\."\);/,
      "the refusal must land in the existing catch");
    assert.doesNotMatch(refresh, /alert\(|showModal/, "and add no new failure surface");
  });

  it("still emits a successful empty refresh when there is genuinely nothing to show", () => {
    assert.match(refresh, /state\.attachments = \[\];\n\s+state\.error = "";\n\s+render\(container, state\);\n\s+emit\(container, state, "refresh", \{ attachments: \[\] \}\);/,
      "an unconfigured target must still emit its empty refresh unchanged");
  });

  it("keeps the status-change model exactly as it was", () => {
    assert.match(refresh, /attachment\.fileAttachmentId \|\| attachment\.file_attachment_id,\n\s+attachment\.file\?\.status,/,
      "the previous status map must key on either identifier spelling");
    assert.match(refresh, /if \(previousStatuses\.has\(attachmentId\) && previousStatuses\.get\(attachmentId\) !== status\) \{\n\s+emit\(container, state, "statusChanged", \{ attachment, status \}\);/,
      "and only a known attachment whose status changed may raise the event");
  });
});
