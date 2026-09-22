import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently - and that
// means *any* access, including a `git diff`, per the lesson `0.33.33.43.12` paid for.
//
// **Aimed at `file-row-cell-contracts.test.mjs`.** `0.33.33.43.15` typed the cell and action
// builders and changed **no executable line**, so the table attacks what those builders already
// did: the structure of each cell, the two conditions that drop a chip, and the six row flags that
// decide which actions appear.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.
//
// **Dispositioned, not listed.** Re-naming `createQuarantineAction`'s parameter back to
// `FileEditorRow` is not a case: the table row is structurally assignable to that shape, so it
// answers identically and closes no diagnostic. It was corrected because the declaration named a
// shape its callers do not pass, not because anything failed - and a case here would claim a catch
// the suite cannot honestly make. The source pin covers the wording instead.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the file cell and its type icon -------------------------------------------------------------
  ["the file name stops being truncated",
    "        createFileTypeIcon(row),\n        createTruncatedText(row.fileName, \"files-file-name\"),",
    "        createFileTypeIcon(row),\n        row.fileName,"],
  ["the type icon is dropped from the cell",
    "        createFileTypeIcon(row),\n        createTruncatedText(row.fileName, \"files-file-name\"),",
    "        createTruncatedText(row.fileName, \"files-file-name\"),"],
  ["the icon's accessible label becomes the raw extension",
    '      attrs: { "aria-label": row.fileTypeLabel },',
    '      attrs: { "aria-label": row.extension },'],
  ["the type marker stops preferring the extension",
    "      dataset: { fileType: safeFileTypeToken(row.extension || row.fileTypeLabel) },",
    "      dataset: { fileType: safeFileTypeToken(row.fileTypeLabel) },"],
  ["the badge text stops falling back to the type label",
    "          text: fileTypeBadgeText(row.extension, row.fileTypeLabel),",
    "          text: fileTypeBadgeText(row.extension, \"\"),"],

  // --- the status cell ------------------------------------------------------------------------------
  ["the file size is recorded even when there is none",
    "    if (row.fileSizeLabel) {\n      status.dataset.fileSize = row.fileSizeLabel;",
    "    if (true) {\n      status.dataset.fileSize = row.fileSizeLabel;"],
  ["the review chip is built from the status instead of the scan state",
    "      createFileScanStatusChip(row.scanStatus, reviewLabel, row.statusLabel),",
    "      createFileScanStatusChip(row.status, reviewLabel, row.statusLabel),"],
  ["the review chip stops being told what the status chip already said",
    "      createFileScanStatusChip(row.scanStatus, reviewLabel, row.statusLabel),",
    "      createFileScanStatusChip(row.scanStatus, reviewLabel),"],
  ["the empty chips stop being filtered out",
    "    ].filter(Boolean);",
    "    ];"],

  // --- the review chip's two refusals ---------------------------------------------------------------
  ["a chip with no words is built anyway",
    '    if (!text || text === statusLabelText) {\n      return null;\n    }',
    '    if (text === statusLabelText) {\n      return null;\n    }'],
  ["a chip that repeats the status label is built anyway",
    '    if (!text || text === statusLabelText) {\n      return null;\n    }',
    '    if (!text) {\n      return null;\n    }'],
  ["the chip label stops being trimmed before it is judged",
    '    const text = String(label || "").trim();\n\n    if (!text || text === statusLabelText) {',
    '    const text = String(label || "");\n\n    if (!text || text === statusLabelText) {'],
  ["the review state is announced without saying what it is",
    '        "aria-label": `Review state: ${text}`,',
    '        "aria-label": text,'],

  // --- which actions a row offers -------------------------------------------------------------------
  ["a previewable row gets the unavailable marker as well",
    "    if (row.previewable) {\n      rowActions.push(createPreviewAction(row));\n    } else if (row.downloadable) {",
    "    if (row.previewable) {\n      rowActions.push(createPreviewAction(row));\n    }\n    if (row.downloadable) {"],
  ["a downloadable row loses its download action",
    "    if (row.downloadable) {\n      rowActions.push(createDownloadAction(row));\n    }",
    "    if (false) {\n      rowActions.push(createDownloadAction(row));\n    }"],
  ["reporting is offered to every row",
    "    if (row.reportable) {\n      rowActions.push(createReportAction(row));\n    }",
    "    if (true) {\n      rowActions.push(createReportAction(row));\n    }"],
  ["quarantine and delete swap their flags",
    "    if (row.quarantineable) {\n      rowActions.push(createQuarantineAction(row));\n    }\n    if (row.deletable) {\n      rowActions.push(createDeleteAction(row));\n    }",
    "    if (row.deletable) {\n      rowActions.push(createQuarantineAction(row));\n    }\n    if (row.quarantineable) {\n      rowActions.push(createDeleteAction(row));\n    }"],
  ["restoring is never offered",
    "    if (row.restorable) {\n      rowActions.push(createRestoreAction(row));\n    }",
    "    if (false) {\n      rowActions.push(createRestoreAction(row));\n    }"],
  ["the action strip stops naming its file",
    "      ariaLabel: `File actions for ${row.fileName}`,",
    '      ariaLabel: "File actions",'],

  // --- the row vocabulary this checkpoint introduced -------------------------------------------------
  ["the row alias becomes a restatement that can drift",
    "   * @typedef {ReturnType<typeof fileRow>} FileRowRecord",
    "   * @typedef {{ fileName: string, previewable: boolean }} FileRowRecord"],
  ["the corrected declaration loses the reason it went unnoticed",
    "   * table row. It compiled only because that caller was implicitly `any`; typing the caller is what",
    "   * table row. Typing the caller is what"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-row-cell-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
