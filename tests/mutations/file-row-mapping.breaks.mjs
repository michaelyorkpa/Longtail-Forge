import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-row-mapping-contracts.test.mjs`.** `0.33.33.43.9` closed 17 diagnostics, almost
// all annotation. **One executable line changed** - `fileRow` now defaults `fileId` like every
// sibling id - so the first group attacks that default and the gates that make it safe, and the
// second attacks the readers the mapper feeds.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the default this checkpoint added, and the gates that make it safe ----------------------------
  ["the file id loses the default that lets the row describe it",
    '    const fileId = attachment.fileId || attachment.file_id || "";',
    "    const fileId = attachment.fileId || attachment.file_id;"],
  ["a sibling id loses its default too",
    '    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id || "";',
    "    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;"],
  ["a download gate compares the id instead of testing it",
    '      downloadable: Boolean(fileId && status === "available"',
    '      downloadable: Boolean(fileId !== undefined && status === "available"'],
  ["the delete gate stops requiring an id",
    '      deletable: Boolean(fileId && status !== "deleted"),',
    '      deletable: Boolean(status !== "deleted"),'],
  ["the restore gate stops requiring an id",
    '      restorable: Boolean(fileId && status === "deleted"),',
    '      restorable: Boolean(status === "deleted"),'],
  ["marking reviewed from the editor stops requiring an id",
    "    if (!row.fileId || !row.reviewable) {",
    "    if (!row.reviewable) {"],

  // --- the record's own declaration -------------------------------------------------------------------
  ["the record stops naming a snake_case spelling",
    "   *   file?: FileRecord, fileId?: string, file_id?: string,",
    "   *   file?: FileRecord, fileId?: string,"],
  ["the record takes a Browser-prefixed name it has not earned",
    "   * }} FileAttachmentRecord",
    "   * }} BrowserFileAttachmentRecord"],
  ["the declaration stops saying it proves nothing",
    "   * **Nothing is proved.** This page reads the response through no checker, so every member is",
    "   * This page reads the response through no checker, so every member is"],
  ["the row quietly promises an id only one producer guarantees",
    "   *   fileId?: string, status?: string, scanStatus?: string",
    "   *   fileId: string, status?: string, scanStatus?: string"],
  ["the recorded reason for the deferral disappears",
    "   * **`0.33.33.43.9` tried to settle this at the producer and could not.**",
    "   * The producer was not changed.",],

  // --- the row focus lookup -----------------------------------------------------------------------------
  ["the focus lookup stops filtering to elements that carry a dataset",
    "      .filter((element) => element instanceof HTMLElement)\n"
      + "      .find((element) => element.dataset.fileAttachmentId === attachmentId);",
    "      .find((element) => element.dataset.fileAttachmentId === attachmentId);"],
  ["the focus lookup stops focusing what it finds",
    "    row?.focus();",
    "    void row;"],

  // --- the readers the mapper feeds ----------------------------------------------------------------------
  ["a whitespace-only name is accepted",
    '    return String(file.displayName || file.originalFilename || "File").trim() || "File";',
    '    return String(file.displayName || file.originalFilename || "File");'],
  ["the display name loses its precedence over the original",
    '    return String(file.displayName || file.originalFilename || "File").trim() || "File";',
    '    return String(file.originalFilename || file.displayName || "File").trim() || "File";'],
  ["an extension is read from anywhere in the name",
    "    const match = String(filename || \"\").match(/\\.([A-Za-z0-9]+)$/);",
    "    const match = String(filename || \"\").match(/\\.([A-Za-z0-9]+)/);"],
  ["an extension keeps its original case",
    "    return match ? match[1].toLowerCase() : \"\";",
    "    return match ? match[1] : \"\";"],
  // Anchored with the branch above it, because "In review" is returned from two places in this
  // file and the bare block is not unique.
  ["review status stops outranking the scan status",
    '    if (status === "deleted") {\n      return "Unavailable";\n    }\n    if (status === "quarantined") {\n      return "In review";\n    }',
    '    if (status === "deleted") {\n      return "Unavailable";\n    }\n    if (false) {\n      return "In review";\n    }'],
  ["a target label stops being prefixed by its type",
    "      return targetType ? `${formatToken(targetType)}: ${targetLabel}` : targetLabel;",
    "      return targetLabel;"],
  ["an unparseable timestamp is hidden rather than shown",
    "    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();",
    '    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();'],
  ["a zero-byte file reports a size rather than nothing",
    '    if (!bytes) {\n      return "";\n    }',
    '    if (!bytes) {\n      return "0 B";\n    }'],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-row-mapping-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
