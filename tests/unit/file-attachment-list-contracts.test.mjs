// Runtime proof for the file attachment list response.
//
// One producer answers `GET /api/files/attachments` on two internal paths, and both end in the
// same three members. The element is **exact even though the shaper spreads**, because what it
// spreads is its own reconstruction: `shapeAttachment` names every member by hand from the row,
// and `shapeAttachmentForRead` spreads that and names eight more. That is the total-reconstruction
// case, not the untrusted-body case, and the distinction is asserted rather than assumed.
//
// The producer deliberately writes **paired camelCase and snake_case spellings** for seven
// values. Both are required here, because both are what it sends and a consumer may read either.
//
// `pagination` is the second reuse of `BrowserBoundedPagination`.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/files.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/files.js");
const sharedPanel = readText("public/js/shared/file-attachments.js");

const parser = sandbox(page,
  ["isAttachmentRecord", "isAttachmentPagination", "isAttachmentFile", "isFileAttachment", "readFileAttachmentList"],
  ["ATTACHMENT_TEXT", "ATTACHMENT_FILE_TEXT", "ATTACHMENT_FILE_NULLABLE_TEXT", "ATTACHMENT_SORTS",
    "ATTACHMENT_PAGINATION_NUMBERS"]);

const baseShaper = extractFunctionBlock(serviceSource, "shapeAttachment");
const readShaper = extractFunctionBlock(serviceSource, "shapeAttachmentForRead");

describe("the envelope against its producer", () => {
  it("is the same three members on both of the producer's paths", () => {
    const returns = [...serviceSource.replaceAll("\r\n", "\n")
      .matchAll(/return \{\n\s+attachments:[\s\S]*?\n\s+sort: listOptions\.sort,\n\s+\}/g)];
    assert.equal(returns.length, 2, "the paginated and read-everything branches both answer here");
    for (const [index, match] of returns.entries()) {
      assert.match(match[0], /pagination: boundedPaginationEnvelope\(\{/, `branch ${index} uses the shared helper`);
    }
    assert.deepEqual(declaredMembers("BrowserFileAttachmentList").sort(), ["attachments", "pagination", "sort"],
      "so there is one contract rather than one per branch");
  });

  it("reuses the bounded pagination contract a second time", () => {
    assert.match(declarationBlock("BrowserFileAttachmentList"), /\n  pagination: BrowserBoundedPagination;/,
      "the envelope names the shared contract");
    assert.match(declarationSource, /export interface BrowserBoundedPagination \{/, "which still exists");
    assert.doesNotMatch(declarationSource, /BrowserFileAttachmentPagination/, "and no file-specific one was added");
    assert.match(page, /state\.pagination = normalizeFilesPagination\(page\.pagination\);/,
      "the page still reduces it through its own total normaliser");
    assert.match(extractFunctionBlock(page, "normalizeFilesPagination"), /pagination\.nextCursor \|\| pagination\.next_cursor/,
      "which is unchanged, dual spellings included");
  });

  it("checks the shared pagination rather than taking its shape on trust", () => {
    // Naming the contract without validating it claimed a shape the reader never verified, and
    // the compiler said so; this guard is what makes the claim true.
    assert.equal(parser.isAttachmentPagination(pagination()), true);
    for (const member of plain(parser.ATTACHMENT_PAGINATION_NUMBERS)) {
      assert.equal(parser.isAttachmentPagination({ ...pagination(), [member]: "1" }), false,
        `${member} is a number`);
      assert.equal(parser.isAttachmentPagination(omit(pagination(), member)), false,
        `${member} is always written`);
    }
    assert.equal(parser.isAttachmentPagination({ ...pagination(), total: null }), true,
      "a null total is a value the helper writes");
    assert.equal(parser.isAttachmentPagination({ ...pagination(), hasMore: "yes" }), false);
    assert.equal(parser.isAttachmentPagination({ ...pagination(), nextCursor: null }), false);
    assert.equal(parser.readFileAttachmentList({ ...attachmentList(), pagination: { total: 1 } }), null,
      "and a page whose pagination cannot be vouched for is not read");
    assert.deepEqual([...plain(parser.ATTACHMENT_PAGINATION_NUMBERS), "hasMore", "nextCursor", "total"].sort(),
      declaredMembers("BrowserBoundedPagination").sort(),
      "the browser checks every member the shared contract declares");
  });

  it("closes the sort vocabulary because the producer's own Set does", () => {
    assert.match(serviceSource, /const ATTACHMENT_SORT_MODES = new Set\(\["newest", "oldest", "filename", "size", "status"\]\);/,
      "the producer tests against a fixed set");
    assert.match(serviceSource, /sort: ATTACHMENT_SORT_MODES\.has\(sort\) \? sort : "newest",/,
      "and falls back to a member of it");
    assert.deepEqual(unionLiterals("BrowserFileAttachmentSort"), ["filename", "newest", "oldest", "size", "status"]);
    assert.deepEqual(plain(parser.ATTACHMENT_SORTS).slice().sort(), producerSortModes(),
      "and the runtime table is pinned to the producer's set rather than to itself");
    assert.equal(parser.readFileAttachmentList({ ...attachmentList(), sort: "relevance" }), null,
      "an ordering the producer never answers is refused");
  });
});

describe("the element", () => {
  it("is exact because the spread is of the producer's own reconstruction", () => {
    assert.match(readShaper, /const shaped = shapeAttachment\(attachment\);/, "the read shaper starts from a reconstruction");
    assert.match(readShaper, /return \{\s+\.\.\.shaped,/, "which it then spreads");
    assert.doesNotMatch(baseShaper, /\.\.\./, "and that reconstruction spreads nothing itself");
    assert.match(declarationDoc("BrowserFileAttachment"), /total reconstruction"\s+\* case rather than the "spread of an untrusted body/,
      "so the contract records why it may be exact");
    const built = [...literalMembers(baseShaper.slice(baseShaper.indexOf("return {")), 4),
      ...literalMembers(readShaper.slice(readShaper.indexOf("return {")), 4)];
    assert.deepEqual(declaredMembers("BrowserFileAttachment").slice().sort(),
      [...new Set(built)].sort(), "and the contract is exactly what the two literals name between them");
  });

  it("keeps both spellings of every paired member, because the producer writes both", () => {
    for (const [camel, snake] of [["fileAttachmentId", "file_attachment_id"], ["fileId", "file_id"],
      ["targetLabel", "target_label"], ["clientLabel", "client_label"], ["projectLabel", "project_label"]]) {
      for (const member of [camel, snake]) {
        assert.ok(declaredMembers("BrowserFileAttachment").includes(member), `${member} is declared`);
        assert.ok(plain(parser.ATTACHMENT_TEXT).includes(member), `and ${member} is checked`);
      }
      assert.equal(parser.isFileAttachment(omit(attachment(), snake)), false,
        `${snake} is written by the producer, so dropping it would break a reader entitled to it`);
    }
    assert.match(sharedPanel, /attachment\.fileAttachmentId \|\| attachment\.file_attachment_id/,
      "which is exactly how the other consumer of this producer reads it");
  });

  it("rejects what the shaper could not send", () => {
    assert.equal(parser.isFileAttachment(attachment()), true);
    for (const member of plain(parser.ATTACHMENT_TEXT)) {
      assert.equal(parser.isFileAttachment({ ...attachment(), [member]: null }), false, `${member} is text`);
    }
    assert.equal(parser.isFileAttachment({ ...attachment(), fileAttachmentId: "" }), false,
      "an attachment with no identity is not one");
    assert.equal(parser.isFileAttachment({ ...attachment(), removedAt: null }), true, "a live attachment has no removal");
    assert.equal(parser.isFileAttachment({ ...attachment(), removedAt: 0 }), false,
      "though it is still checked as text when it is present");
    assert.equal(parser.isFileAttachment({ ...attachment(), sortOrder: "2" }), false,
      "the order is coerced with Number, so text is not what arrives");
    assert.equal(parser.isFileAttachment({ ...attachment(), file: {} }), false, "a partial file record is not one");
  });

  it("treats the target as resolvable or absent, never partial", () => {
    assert.match(readShaper, /target: target\s+\? \{/, "the shaper builds it or answers null");
    assert.match(declarationBlock("BrowserFileAttachment"), /\n  target: BrowserFileAttachmentTarget \| null;/);
    assert.equal(parser.isFileAttachment({ ...attachment(), target: null }), true, "an unreadable target is null");
    assert.equal(parser.isFileAttachment({ ...attachment(), target: { label: "x" } }), false, "not a partial record");
    assert.deepEqual(declaredMembers("BrowserFileAttachmentTarget").sort(), ["id", "label", "type"]);
  });
});

describe("the nested file record", () => {
  it("is the fifteen members the two shapers build between them", () => {
    const base = literalMembers(baseShaper.slice(baseShaper.indexOf("file: {")), 6);
    assert.ok(base.includes("displayName") && base.includes("scanStatus"), "the base names the stored columns");
    assert.match(readShaper, /file: \{\s+\.\.\.shaped\.file,\s+uploadedByLabel,\s+uploaded_by_label: uploadedByLabel,/,
      "and the read shaper adds the label under both spellings");
    assert.deepEqual(declaredMembers("BrowserFileAttachmentFile").sort(),
      [...new Set([...base, "uploadedByLabel", "uploaded_by_label"])].sort(),
      "so the contract is exactly those");
    assert.deepEqual([...plain(parser.ATTACHMENT_FILE_TEXT), ...plain(parser.ATTACHMENT_FILE_NULLABLE_TEXT),
      "fileSizeBytes"].sort(), declaredMembers("BrowserFileAttachmentFile").sort(),
      "and the browser checks every one of them");
  });

  it("follows the shaper's own nullability", () => {
    for (const member of plain(parser.ATTACHMENT_FILE_NULLABLE_TEXT)) {
      assert.match(baseShaper, new RegExp(`${member}: attachment\\.file_\\w+ \\|\\| null,`),
        `${member} is nulled by the shaper`);
      assert.equal(parser.isAttachmentFile({ ...attachmentFile(), [member]: null }), true, `${member} may be null`);
      assert.equal(parser.isAttachmentFile({ ...attachmentFile(), [member]: 0 }), false, `${member} is text or null`);
    }
    for (const member of plain(parser.ATTACHMENT_FILE_TEXT)) {
      assert.equal(parser.isAttachmentFile({ ...attachmentFile(), [member]: null }), false, `${member} is never null`);
    }
    assert.match(baseShaper, /fileSizeBytes: Number\(attachment\.file_size_bytes \|\| 0\),/, "the size is coerced");
    assert.equal(parser.isAttachmentFile({ ...attachmentFile(), fileSizeBytes: "12" }), false, "so text is not a size");
  });
});

describe("the reader", () => {
  it("accepts the producer's page whole", () => {
    assert.deepEqual(plain(parser.readFileAttachmentList(attachmentList())), attachmentList());
    assert.deepEqual(plain(parser.readFileAttachmentList({ ...attachmentList(), attachments: [] })),
      { ...attachmentList(), attachments: [] }, "an empty page is a real answer");
  });

  it("refuses a page rather than shortening one it accumulates", () => {
    assert.equal(parser.readFileAttachmentList({ ...attachmentList(), attachments: [attachment(), { fileId: "f-2" }] }), null,
      "a short page would under-report the count and corrupt the accumulated list");
    assert.equal(parser.readFileAttachmentList({ ...attachmentList(), attachments: [{}] }), null,
      "an array container alone confers no trust");
    assert.match(page, /if \(!page\) \{\s+throw new Error\("The file attachment response could not be read\."\);/,
      "so it takes the load-error path the page already owned");
  });

  it("does not trust a primitive or partial body", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { attachments: [] }]) {
      assert.equal(parser.readFileAttachmentList(empty), null);
    }
    for (const member of ["attachments", "pagination", "sort"]) {
      assert.equal(parser.readFileAttachmentList(omit(attachmentList(), member)), null, `${member} is always sent`);
    }
  });
});

describe("the consumers", () => {
  it("narrows this page's read through the reader", () => {
    const consumers = ["isAttachmentFile", "isFileAttachment", "readFileAttachmentList"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["result.attachments", "result.pagination"]) {
      assert.ok(!consumers.includes(raw), `files.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const page = readFileAttachmentList\(/);
    assert.match(page, /state\.attachments = options\.append \? \[\.\.\.state\.attachments, \.\.\.attachments\] : attachments;/,
      "the accumulation behaviour is unchanged");
    assert.match(page, /@type \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserFileAttachment\[\]\}/,
      "and the one direct handoff is annotated");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
  });

  it("leaves the shared attachments panel to its own owner, and says why", () => {
    assert.match(sharedPanel, /result\.attachments \|\| \[\]/,
      "the shared panel still reads the same producer raw");
    assert.doesNotMatch(sharedPanel, /readFileAttachmentList/,
      "because narrowing it would need either duplicated guards or a new published surface");
    assert.doesNotMatch(sharedPanel, /LongtailForge\.fileAttachmentRecords/,
      "and this child creates no such surface");
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/** The words the producer's own Set admits, read from the service rather than from any table. */
function producerSortModes() {
  const match = serviceSource.match(/const ATTACHMENT_SORT_MODES = new Set\(\[([^\]]+)\]\);/);
  assert.ok(match, "the producer must gate on a literal set");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/**
 * The members an object literal names at one indent, written `name: value` or as shorthand.
 * @param {string} literal @param {number} indent @returns {string[]}
 */
function literalMembers(literal, indent) {
  return [...new Set([...literal.replaceAll("\r\n", "\n").matchAll(new RegExp(`^ {${indent}}([a-zA-Z_]\\w*)(?::|,$)`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationDoc(name) {
  const index = declarationSource.indexOf(`export interface ${name} {`);
  assert.ok(index > 0, `${name} must be declared`);
  const opened = declarationSource.lastIndexOf("/**", index);
  assert.ok(opened > 0, `${name} must be documented`);
  return declarationSource.slice(opened, index);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @param {string} name @returns {string[]} */
function unionLiterals(name) {
  const match = declarationSource.match(new RegExp(`export type ${name} =([^;]+);`));
  assert.ok(match, `${name} must be declared`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/** @returns {Record<string, unknown>} */
function attachmentFile() {
  return {
    createdAt: "2026-09-02T12:00:00.000Z",
    created_at: "2026-09-02T12:00:00.000Z",
    deletedAt: null,
    deleted_at: null,
    displayName: "Report.pdf",
    extension: "pdf",
    fileSizeBytes: 2048,
    mimeTypeDetected: "application/pdf",
    originalFilename: "Report.pdf",
    scanStatus: "clean",
    status: "ready",
    updatedAt: null,
    updated_at: null,
    uploadedByLabel: "Current Administrator",
    uploaded_by_label: "Current Administrator",
  };
}

/** @returns {Record<string, unknown>} */
function attachment() {
  /** @type {Record<string, unknown>} */
  const record = {
    file: attachmentFile(),
    removedAt: null,
    sortOrder: 0,
    target: { id: "t-1", label: "Task", type: "task" },
  };
  for (const member of plain(parser.ATTACHMENT_TEXT)) record[member] = `${member}-value`;
  return record;
}

/** @returns {Record<string, unknown>} */
function pagination() {
  return { hasMore: false, limit: 25, maxPageSize: 100, nextCursor: "", offset: 0, returned: 1, total: 1 };
}

/** @returns {Record<string, unknown>} */
function attachmentList() {
  return { attachments: [attachment()], pagination: pagination(), sort: "newest" };
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
