import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/file-preview.js");

/**
 * The normalizer half of the preview surface, which nothing executed.
 *
 * `file-preview-contracts.test.mjs` lifts the reader block - the descriptor and content
 * validation this page performs on its own route's answers - and the static contracts pin the
 * dialog's construction. Neither runs a normalizer. `0.33.33.39.5` annotated them, and one read
 * genuinely moved: `attachment.file` had to stay `unknown`, because the published
 * `BrowserFileActionRecord` declares that key as an unwrapping alias for the attachment itself
 * rather than as the file metadata this page reads there. `previewFileRecord` reads it instead.
 *
 * These cases hold what the normalizers answered before that, and name the one input for which
 * the answer is not identical.
 */

const LIFTED = [
  "previewFileRecord", "readableFileName", "extensionFromFilename", "previewKindForExtension",
  "previewAvailabilityForRow", "normalizeExistingPreviewRow", "normalizeFilePreviewRow",
  "previewUnavailableLabel", "previewStateMessage",
];

/** The shipped extension tables and size ceiling, not a restatement of them. */
function liftedConstants() {
  const start = source.indexOf("  const TEXT_PREVIEW_MAX_BYTES = ");
  const end = source.indexOf("\n", source.indexOf("  const TEXT_PREVIEW_EXTENSIONS = "));
  assert.ok(start !== -1 && end > start, "the preview tables must exist");
  return source.slice(start, end);
}

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function normalizers() {
  const context = vm.createContext({});
  vm.runInContext(liftedConstants(), context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
}

const FILE = {
  displayName: "Quarterly report.pdf",
  extension: "pdf",
  fileSizeBytes: 2048,
  originalFilename: "q3.pdf",
  scanStatus: "passed",
  status: "available",
};

const ATTACHMENT = { file: FILE, fileAttachmentId: "fa_9f2", fileId: "f_11" };

describe("The file record this page reads off a key the published bag spells differently", () => {
  it("answers an object by identity, so the response's own record reaches the row", () => {
    const api = normalizers();
    assert.equal(api.previewFileRecord(FILE), FILE);
    const list = [1, 2];
    assert.equal(api.previewFileRecord(list), list, "an array is an object and keeps its identity");
  });

  it("answers an empty record for anything absent or empty", () => {
    const api = normalizers();
    for (const value of [null, undefined, "", 0, false, Number.NaN]) {
      assert.deepEqual(plain(api.previewFileRecord(value)), {}, `value: ${JSON.stringify(value)}`);
    }
  });

  /**
   * **The one answer that is not identical to the read it replaced.** `attachment.file || {}`
   * carried a non-empty string through, and `normalizeFilePreviewRow` then spread it into index
   * members of the row's own `file`. No producer sends one - the Files response writes `file` as
   * a record, and every member read off it yields `undefined` for a string either way - so the
   * difference is confined to those index members. It is recorded rather than described as
   * unchanged.
   */
  it("answers an empty record for a non-empty primitive, which the read it replaced did not", () => {
    const api = normalizers();
    assert.deepEqual(plain(api.previewFileRecord("report.pdf")), {});
    assert.deepEqual(plain(api.previewFileRecord(7)), {});
    assert.deepEqual(plain(api.previewFileRecord(true)), {});
  });
});

describe("The readable file name", () => {
  it("prefers the camelCase display name, then each fallback in order", () => {
    const api = normalizers();
    assert.equal(api.readableFileName({ displayName: "A", display_name: "B", originalFilename: "C" }), "A");
    assert.equal(api.readableFileName({ display_name: "B", originalFilename: "C" }), "B");
    assert.equal(api.readableFileName({ originalFilename: "C", original_filename: "D" }), "C");
    assert.equal(api.readableFileName({ original_filename: "D" }), "D");
  });

  it("answers File for a record that names none of them, and for whitespace", () => {
    const api = normalizers();
    assert.equal(api.readableFileName({}), "File");
    assert.equal(api.readableFileName(), "File");
    assert.equal(api.readableFileName({ displayName: "   " }), "File", "a blank name is not a name");
  });
});

describe("Preview availability", () => {
  it("maps the extension tables to their kinds and everything else to unsupported", () => {
    const api = normalizers();
    for (const extension of ["gif", "jpg", "jpeg", "png", ".PNG"]) {
      assert.equal(api.previewKindForExtension(extension), "image", `extension: ${extension}`);
    }
    assert.equal(api.previewKindForExtension("md"), "markdown");
    assert.equal(api.previewKindForExtension("txt"), "text");
    for (const extension of ["pdf", "", null, undefined, 7]) {
      assert.equal(api.previewKindForExtension(extension), "unsupported", `extension: ${extension}`);
    }
  });

  it("refuses a file that is not available or not cleared, naming which", () => {
    const api = normalizers();
    assert.deepEqual(plain(api.previewAvailabilityForRow({ extension: "png", status: "quarantined", scanStatus: "passed" })),
      { kind: "image", reason: "file_quarantined", state: "unavailable" });
    assert.deepEqual(plain(api.previewAvailabilityForRow({ extension: "png", status: "available", scanStatus: "pending" })),
      { kind: "image", reason: "scan_pending", state: "unavailable" });
  });

  /** Quarantined files stay unavailable unless the row carries the review grant, in either spelling. */
  it("allows a quarantined file only with the review grant", () => {
    const api = normalizers();
    const quarantined = { extension: "png", scanStatus: "passed", status: "quarantined" };
    assert.equal(api.previewAvailabilityForRow(quarantined).state, "unavailable");
    assert.equal(api.previewAvailabilityForRow({ ...quarantined, canPreviewInReview: true }).state, "previewable");
    assert.equal(api.previewAvailabilityForRow({ ...quarantined, can_preview_in_review: true }).state, "previewable");
    assert.equal(api.previewAvailabilityForRow({ ...quarantined, canPreviewInReview: "yes" }).state, "unavailable",
      "the grant is read as exactly true, not for truthiness");
  });

  it("keeps an unsupported type download-only and a large text file too large", () => {
    const api = normalizers();
    const available = { scanStatus: "not_required", status: "available" };
    assert.deepEqual(plain(api.previewAvailabilityForRow({ ...available, extension: "pdf" })),
      { kind: "unsupported", reason: "unsupported_file_type", state: "download_only" });
    assert.deepEqual(plain(api.previewAvailabilityForRow({ ...available, extension: "txt", fileSizeBytes: 512 * 1024 + 1 })),
      { kind: "text", reason: "too_large_for_preview", state: "too_large_for_preview" });
    assert.equal(api.previewAvailabilityForRow({ ...available, extension: "txt", fileSizeBytes: 512 * 1024 }).state, "previewable");
    assert.equal(api.previewAvailabilityForRow({ ...available, extension: "png", fileSizeBytes: 50 * 1024 * 1024 }).state,
      "previewable", "the ceiling applies to text and Markdown, not to images");
  });

  it("answers an unavailable record for a row it was handed nothing for", () => {
    const api = normalizers();
    assert.doesNotThrow(() => api.previewAvailabilityForRow());
    assert.deepEqual(plain(api.previewAvailabilityForRow()), { kind: "unsupported", reason: "file_unavailable", state: "unavailable" });
  });
});

describe("The normalized preview row", () => {
  it("shapes an attachment into the members the dialog reads", () => {
    const api = normalizers();
    const row = api.normalizeFilePreviewRow(ATTACHMENT);
    assert.equal(row.attachmentId, "fa_9f2");
    assert.equal(row.fileId, "f_11");
    assert.equal(row.fileName, "Quarterly report.pdf");
    assert.equal(row.extension, "pdf");
    assert.equal(row.fileSizeBytes, 2048);
    assert.equal(row.status, "available");
    assert.equal(row.scanStatus, "passed");
    assert.equal(row.previewKind, "unsupported");
    assert.equal(row.previewState, "download_only");
    assert.equal(row.previewable, false);
    assert.equal(row.downloadable, true);
    assert.equal(row.attachment, ATTACHMENT, "the attachment itself rides through by identity");
  });

  it("reads both identifier spellings and derives the extension from the filename", () => {
    const api = normalizers();
    const row = api.normalizeFilePreviewRow({
      file: { originalFilename: "notes.MD", scanStatus: "not_required", status: "available" },
      file_attachment_id: "fa_1", file_id: "f_1",
    });
    assert.equal(row.attachmentId, "fa_1");
    assert.equal(row.fileId, "f_1");
    assert.equal(row.extension, "md", "taken from the filename, lower-cased");
    assert.equal(row.previewKind, "markdown");
    assert.equal(row.previewState, "previewable");
    assert.equal(row.previewable, true);
  });

  /** The file record keeps the members the response sent, with the two display names filled in. */
  it("carries the response's own file record, adding only the display fallbacks", () => {
    const api = normalizers();
    const row = api.normalizeFilePreviewRow({ file: { extension: "png", mimeTypeDetected: "image/png" }, fileAttachmentId: "fa_2" });
    assert.deepEqual(plain(row.file), {
      displayName: "File", extension: "png", mimeTypeDetected: "image/png", originalFilename: "File",
    });
    assert.equal(row.downloadable, false, "no file id and no clear scan status");
  });

  it("unwraps a nested attachment and takes the review grant from either side", () => {
    const api = normalizers();
    const wrapped = { attachment: { ...ATTACHMENT, file: { ...FILE, extension: "png", status: "quarantined" } } };
    assert.equal(api.normalizeFilePreviewRow(wrapped).previewState, "unavailable");
    assert.equal(api.normalizeFilePreviewRow(wrapped, { canPreviewInReview: true }).previewState, "previewable");
    const granted = { attachment: { ...wrapped.attachment, can_preview_in_review: true } };
    assert.equal(api.normalizeFilePreviewRow(granted).previewState, "previewable");
  });

  /** A row that already names a file and an attachment takes the other branch and keeps its members. */
  it("re-normalizes an existing row without rebuilding it", () => {
    const api = normalizers();
    const row = api.normalizeFilePreviewRow({
      attachment: ATTACHMENT, extension: "txt", fileName: "Existing.txt", kept: "untouched",
      previewState: "previewable", scanStatus: "passed", status: "available",
    });
    assert.equal(row.kept, "untouched", "members this page does not name ride through");
    assert.equal(row.fileName, "Existing.txt");
    assert.equal(row.previewState, "previewable");
    assert.equal(row.previewKind, "text", "derived from the extension when the row names no kind");
    assert.equal(row.previewable, true);
    assert.equal(row.downloadable, false, "an existing row's download flag is read, not recomputed");
  });

  it("answers a complete row for an input it was handed nothing for", () => {
    const api = normalizers();
    assert.doesNotThrow(() => api.normalizeFilePreviewRow());
    const row = api.normalizeFilePreviewRow();
    assert.equal(row.attachmentId, "");
    assert.equal(row.fileId, "");
    assert.equal(row.fileName, "File");
    assert.equal(row.downloadable, false);
    assert.equal(row.previewState, "unavailable");
  });
});

describe("The unavailable label and the state message", () => {
  it("names the reason the file cannot be previewed", () => {
    const api = normalizers();
    assert.equal(api.previewUnavailableLabel({ fileName: "a.pdf", previewState: "too_large_for_preview" }),
      "Preview too large; download a.pdf");
    assert.equal(api.previewUnavailableLabel({ filename: "b.pdf", previewState: "download_only" }), "Download-only b.pdf");
    assert.equal(api.previewUnavailableLabel({ file_name: "c.zip" }), "Preview unavailable for c.zip");
    assert.equal(api.previewUnavailableLabel({ file: { displayName: "d.zip" } }), "Preview unavailable for d.zip");
    assert.equal(api.previewUnavailableLabel(), "Preview unavailable for File");
  });

  it("answers one message per state, and the general one for anything else", () => {
    const api = normalizers();
    assert.match(api.previewStateMessage("download_only"), /download-only/);
    assert.match(api.previewStateMessage("too_large_for_preview"), /too large to preview/);
    assert.match(api.previewStateMessage("unauthorized"), /do not have permission/);
    for (const state of ["unavailable", "previewable", "", null, undefined, 7]) {
      assert.equal(api.previewStateMessage(state), "Preview is not available for this file.", `state: ${state}`);
    }
  });
});

describe("file-preview.js states its row shape rather than asserting it", () => {
  it("names the row locally and says what is not proved about it", () => {
    assert.match(source, /@typedef \{FilePreviewInput & FilePreviewRowMembers\} FilePreviewRow/);
    assert.match(source, /Nothing here is validated/);
    // The key the published bag type spells differently stays unknown, and is read rather than
    // declared, which is what keeps the two readings of `file` from being claimed as one.
    assert.match(source, /@property \{unknown\} \[file\]/);
    assert.match(source, /function previewFileRecord\(value\) \{\n\s*return value && typeof value === "object" \? value : \{\};/);
  });

  it("carries no suppression and no assertion of any kind", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.equal((source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || []).length, 0, "this file asserts nothing");
    assert.doesNotMatch(source, /@param \{\*\}/, "and no longer spells a parameter as the any-equivalent");
  });
});
