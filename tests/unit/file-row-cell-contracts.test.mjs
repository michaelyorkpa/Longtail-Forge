import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What a file row renders into the table, and which actions it offers.
 *
 * `0.33.33.43.15` typed the cell and action builders against `FileRowRecord` - an alias for
 * `fileRow`'s own return, so it cannot drift from the thirty-four members that builder constructs.
 * No executable line changed, so the cases below fix what these builders already did: the structure
 * of each cell, and the row flags that decide which actions appear.
 */

const source = createProjectTextReader().readText("public/js/files.js");

/** @param {unknown} value */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const ACTIONS = [
  "createPreviewAction", "createDownloadOnlyMarker", "createDownloadAction",
  "createReportAction", "createQuarantineAction", "createDeleteAction", "createRestoreAction",
];

/**
 * The cell builders over a recording view. The seven action builders are stubbed: which of them
 * runs is the behaviour under test, not what each one builds.
 */
function cells() {
  const sandbox = vm.createContext({});
  vm.runInContext(
    "globalThis.made = [];"
      + "globalThis.element = (tagName, opts) => ({ tagName, options: opts, dataset: {} });"
      + "globalThis.requireView = () => ({"
      + "  createElement: (tagName, opts) => { made.push({ tagName, options: opts }); return element(tagName, opts); },"
      + "  createDetailActionStrip: (opts) => { made.push({ tagName: '#strip', options: opts }); return element('#strip', opts); },"
      + "});"
      + "globalThis.requireFilesViewHelper = () => {};"
      + ACTIONS.map((name) => `globalThis.${name} = () => "#${name}";`).join("")
      + "globalThis.createTruncatedText = (value) => ({ truncated: value });"
      + "globalThis.createFileStatusChip = (status, label) => ({ chip: status, label });",
    sandbox,
  );
  for (const name of [
    "createFilesElement", "createFileCell", "createFileTypeIcon", "createFileStatusCell",
    "createFileActions", "createFileScanStatusChip", "scanStatusLabel", "reviewStateLabel",
    "formatToken", "safeFileTypeToken", "safeFileStateToken", "fileTypeBadgeText",
  ]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext(
    "({ createFileCell, createFileTypeIcon, createFileStatusCell, createFileActions,"
      + " createFileScanStatusChip, made })",
    sandbox,
  );
}

/** A table row with every flag off, overridden per case. */
function row(overrides = {}) {
  return {
    fileName: "Report.pdf", extension: "pdf", fileTypeLabel: "PDF", fileSizeLabel: "1.2 MB",
    status: "available", statusLabel: "Available", scanStatus: "passed",
    previewable: false, downloadable: false, reportable: false,
    quarantineable: false, deletable: false, restorable: false,
    ...overrides,
  };
}

describe("The file cell pairs a type icon with the name", () => {
  it("builds both parts, and truncates the name", () => {
    const api = cells();
    const cell = api.createFileCell(row());

    assert.equal(cell.tagName, "span");
    assert.equal(cell.options.className, "files-file-cell");
    assert.equal(cell.options.children.length, 2);
    assert.deepEqual(plain(cell.options.children[1]), { truncated: "Report.pdf" });
  });

  it("labels the icon by the file's type and tokenises it for the marker", () => {
    const api = cells();
    // The extension and the type label must slug *differently*, or preferring either answers the
    // same and the precedence goes untested - which is how a mutation of it first survived here.
    const icon = api.createFileTypeIcon(row({ extension: "docx", fileTypeLabel: "Word Document" }));

    assert.equal(icon.options.attrs["aria-label"], "Word Document");
    assert.equal(icon.options.dataset.fileType, "docx", "the extension wins, not the label");
    assert.equal(icon.options.children[0].options.text, "DOCX", "the badge text is the extension, capped");
  });

  it("falls back to the type label when there is no extension", () => {
    const api = cells();
    const icon = api.createFileTypeIcon(row({ extension: "", fileTypeLabel: "Plain Text" }));

    assert.equal(icon.options.dataset.fileType, "plain-text");
    assert.equal(icon.options.children[0].options.text, "PLAI");
  });
});

describe("The status cell carries the chips and the size", () => {
  it("records the file size as a marker on the cell", () => {
    const api = cells();

    assert.equal(api.createFileStatusCell(row()).dataset.fileSize, "1.2 MB");
    assert.equal(api.createFileStatusCell(row({ fileSizeLabel: "" })).dataset.fileSize, undefined);
  });

  /** The review chip is dropped when it would only repeat the status chip. */
  it("drops the review chip when it says nothing new", () => {
    const api = cells();
    const cell = api.createFileStatusCell(row({ status: "available", statusLabel: "Reviewed", scanStatus: "passed" }));

    assert.equal(cell.options.children.length, 1, "\"Reviewed\" twice is once");
  });

  it("keeps the review chip when it adds something", () => {
    const api = cells();
    const cell = api.createFileStatusCell(row({ statusLabel: "Available", scanStatus: "pending" }));

    assert.equal(cell.options.children.length, 2);
    // The chip's own marker is the only place its first argument shows, because the label is
    // always passed explicitly. Without this the scan state could be swapped for the status.
    assert.equal(
      cell.options.children[1].options.dataset.fileScanStatusChip,
      "pending",
      "the review chip is marked by the scan state, not the file status",
    );
  });
});

describe("The review chip answers nothing rather than an empty chip", () => {
  it("returns null for a state with no words", () => {
    const { createFileScanStatusChip } = cells();

    assert.equal(createFileScanStatusChip(""), null);
    assert.equal(createFileScanStatusChip(undefined), null);
    assert.equal(createFileScanStatusChip("passed", "   "), null);
    // Separated from the duplicate-label refusal on purpose: with the default `statusLabelText`
    // of "", both conditions agree, so an empty label must be tried against a *non-empty* one or
    // dropping the emptiness check goes unnoticed.
    assert.equal(createFileScanStatusChip("", "", "Available"), null, "empty is refused on its own terms");
    assert.equal(createFileScanStatusChip("passed", "   ", "Available"), null);
  });

  it("returns null when its label only repeats the status label", () => {
    const { createFileScanStatusChip } = cells();

    assert.equal(createFileScanStatusChip("passed", "Reviewed", "Reviewed"), null);
    assert.ok(createFileScanStatusChip("passed", "Reviewed", "Available"));
  });

  it("names the review state for a screen reader", () => {
    const { createFileScanStatusChip } = cells();
    const chip = createFileScanStatusChip("pending", undefined, "Available");

    assert.equal(chip.options.attrs["aria-label"], "Review state: Review pending");
  });
});

describe("A row offers exactly the actions its flags allow", () => {
  /** @param {Record<string, unknown>} overrides */
  function offered(overrides) {
    const api = cells();
    api.createFileActions(row(overrides));
    const strip = api.made.filter((/** @type {{tagName: string}} */ call) => call.tagName === "#strip")[0];

    return plain(strip.options.actions);
  }

  it("offers nothing at all when every flag is off", () => {
    assert.deepEqual(offered({}), []);
  });

  it("prefers a preview action, and falls back to a marker when only downloadable", () => {
    assert.deepEqual(offered({ previewable: true }), ["#createPreviewAction"]);
    assert.deepEqual(offered({ downloadable: true }), ["#createDownloadOnlyMarker", "#createDownloadAction"]);
    assert.deepEqual(
      offered({ previewable: true, downloadable: true }),
      ["#createPreviewAction", "#createDownloadAction"],
      "a previewable row gets the action, not the marker",
    );
  });

  it("adds each remaining action independently, in a fixed order", () => {
    assert.deepEqual(offered({ reportable: true }), ["#createReportAction"]);
    assert.deepEqual(offered({ quarantineable: true }), ["#createQuarantineAction"]);
    assert.deepEqual(offered({ deletable: true }), ["#createDeleteAction"]);
    assert.deepEqual(offered({ restorable: true }), ["#createRestoreAction"]);
    assert.deepEqual(
      offered({ previewable: true, downloadable: true, reportable: true, quarantineable: true, deletable: true, restorable: true }),
      ["#createPreviewAction", "#createDownloadAction", "#createReportAction",
        "#createQuarantineAction", "#createDeleteAction", "#createRestoreAction"],
    );
  });

  it("names the strip for the file it belongs to", () => {
    const api = cells();
    api.createFileActions(row({ fileName: "Budget.xlsx" }));
    const strip = api.made.filter((/** @type {{tagName: string}} */ call) => call.tagName === "#strip")[0];

    assert.equal(strip.options.ariaLabel, "File actions for Budget.xlsx");
  });
});

describe("The row vocabulary these builders share", () => {
  it("aliases the builder's own return rather than restating it", () => {
    assert.match(source, /@typedef \{ReturnType<typeof fileRow>\} FileRowRecord/);
    assert.match(source, /An \*\*alias, not a restatement\*\*/);
  });

  it("uses that one name for every cell and action builder", () => {
    const declared = source.match(/@param \{FileRowRecord\} row/g) || [];
    assert.ok(declared.length >= 10, `expected the alias on every row reader, found ${declared.length}`);
    assert.doesNotMatch(
      source,
      /@param \{FileEditorRow\} row \*\/\s*\n\s*function create(Preview|Download|Report|Quarantine|Delete|Restore)/,
      "no row action may name the editor dialog's row",
    );
  });

  it("records the corrected declaration where the next reader meets it", () => {
    assert.match(source, /\*\*Corrected by `0\.33\.33\.43\.15`\.\*\* This named `FileEditorRow`/);
    assert.match(
      source,
      /It compiled only because that caller was implicitly `any`/,
      "the reason it went unnoticed is the part worth keeping",
    );
  });
});
