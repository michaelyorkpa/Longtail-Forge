import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * How an attachment record becomes a row, and what the row may then promise.
 *
 * `0.33.33.43.9` typed the mapper and the small readers it feeds. **One executable line changed**:
 * `fileRow` now defaults `fileId` to `""` like every sibling id it builds. That is the line the
 * checkpoint turns on, because it was the only reason the row could not describe its own id - and
 * the cases below hold both halves of that: the default itself, and the reads that already
 * tolerated its absence so the default cannot change an answer they give.
 *
 * The readers are pure and lift cleanly; `formatTargetDisplay` needs `formatToken`, which is
 * supplied rather than stubbed away.
 */

const source = createProjectTextReader().readText("public/js/files.js");

const LIFTED = [
  "readableFileName", "extensionFromFilename", "statusLabel", "formatTargetDisplay",
  "formatDate", "formatBytes",
];

function readers() {
  const sandbox = vm.createContext({ Date, Number, String, Math, JSON });
  vm.runInContext(extractFunctionBlock(source, "formatToken"), sandbox);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")}, formatToken })`, sandbox);
}

describe("The mapper defaults every id it builds, including the one that did not", () => {
  it("defaults fileId the way its siblings are defaulted", () => {
    assert.match(
      source,
      /const fileId = attachment\.fileId \|\| attachment\.file_id \|\| "";/,
      "this was the only id built without a fallback, which is why the row could not describe it",
    );
  });

  it("keeps every sibling id defaulted too, so the row is uniformly string-valued", () => {
    const block = source.slice(source.indexOf("function fileRow(attachment)"));
    const body = block.slice(0, block.indexOf("\n  }"));

    for (const spelling of [
      'attachment.fileAttachmentId || attachment.file_attachment_id || ""',
      'attachment.moduleId || attachment.module_id || ""',
      'attachment.targetId || attachment.target_id || ""',
      'attachment.clientId || attachment.client_id || ""',
      'attachment.projectId || attachment.project_id || ""',
    ]) {
      assert.ok(body.includes(spelling), `${spelling} must stay defaulted`);
    }
  });

  /**
   * The default can only be safe because every reader of `fileId` already treated an absent id as
   * falsy. These are the four gates that make `""` and `undefined` indistinguishable downstream.
   */
  it("every gate on the id treats an empty one exactly as an absent one", () => {
    for (const gate of [
      /Boolean\(fileId && status === "available"/,
      /Boolean\(fileId && status !== "deleted"\)/,
      /Boolean\(fileId && status === "deleted"\)/,
      /if \(!row\.fileId \|\| !row\.reviewable\)/,
    ]) {
      assert.match(source, gate, "an id gate must stay falsy-tested rather than compared to undefined");
    }
  });
});

describe("The attachment record is declared locally, and says it proves nothing", () => {
  it("names both spellings the producer has used", () => {
    for (const pair of [
      ["fileId", "file_id"], ["targetId", "target_id"], ["clientId", "client_id"],
      ["projectId", "project_id"], ["moduleId", "module_id"], ["targetLabel", "target_label"],
    ]) {
      for (const member of pair) {
        assert.match(source, new RegExp(`${member}\\?:`), `${member} must be named`);
      }
    }
  });

  it("says why it is declared here rather than reused", () => {
    assert.match(
      source,
      /\*\*Declared locally because the estate deliberately does not publish it\.\*\*/,
      "the published surfaces type it `attachment?: unknown`, which is a refusal for consumers",
    );
    assert.match(source, /\*\*Nothing is proved\.\*\*/);
  });

  it("does not claim a published contract it is not", () => {
    // Asserted on the closing line: the shape spans many lines and contains braces, so a
    // `@typedef {...}` pattern cannot cross it and would pass vacuously.
    assert.doesNotMatch(
      source,
      /\}\} Browser[A-Za-z]*(AttachmentRecord|FileRecord)/,
      "a local shape must not take a Browser-prefixed name",
    );
    assert.match(source, /\}\} FileAttachmentRecord/, "and must keep the name it does have");
  });
});

describe("The row's own id stays optional, and the attempt to change that is recorded", () => {
  it("keeps fileId optional on the row", () => {
    assert.match(source, /fileId\?: string, status\?: string, scanStatus\?: string/);
  });

  it("records that the producer fix was tried, and why it does not land", () => {
    assert.match(
      source,
      /\*\*`0\.33\.33\.43\.9` tried to settle this at the producer and could not\.\*\*/,
    );
    assert.match(
      source,
      /normalizeFileEditorRow` may hand back a\s*\n\s*\* caller's own object without passing it through `fileRow` at all/,
      "the reason must name the branch that cannot promise it",
    );
  });
});

describe("The row focus lookup filters to what carries a dataset", () => {
  it("filters rather than reading dataset off an Element", () => {
    assert.match(
      source,
      /\.filter\(\(element\) => element instanceof HTMLElement\)\s*\n\s*\.find\(\(element\) => element\.dataset\.fileAttachmentId === attachmentId\);/,
    );
  });

  it("still focuses what it finds, and still tolerates finding nothing", () => {
    assert.match(source, /row\?\.focus\(\);/, "an absent row must stay a no-op");
  });
});

describe("The readers the mapper feeds", () => {
  it("names a file, falling back rather than answering empty", () => {
    const { readableFileName } = readers();

    // Both members present, because either one alone answers the same under a swapped precedence.
    assert.equal(readableFileName({ displayName: "Report.pdf", originalFilename: "r.pdf" }), "Report.pdf");
    assert.equal(readableFileName({ displayName: "Report.pdf" }), "Report.pdf");
    assert.equal(readableFileName({ originalFilename: "r.pdf" }), "r.pdf");
    assert.equal(readableFileName({ displayName: "   " }), "File", "whitespace is not a name");
    assert.equal(readableFileName({}), "File");
    assert.equal(readableFileName(), "File");
  });

  it("reads an extension only from a real suffix", () => {
    const { extensionFromFilename } = readers();

    assert.equal(extensionFromFilename("Report.PDF"), "pdf");
    assert.equal(extensionFromFilename("archive.tar.gz"), "gz");
    assert.equal(extensionFromFilename("no-extension"), "");
    assert.equal(extensionFromFilename("trailing."), "");
    assert.equal(extensionFromFilename(""), "");
  });

  it("names a status, preferring the lifecycle over the scan", () => {
    const { statusLabel } = readers();

    assert.equal(statusLabel("deleted", "passed"), "Unavailable");
    assert.equal(statusLabel("quarantined", "passed"), "In review");
    assert.equal(statusLabel("pending", ""), statusLabel("available", "pending"));
  });

  it("names a target, and says nothing when it has nothing", () => {
    const { formatTargetDisplay } = readers();

    assert.equal(formatTargetDisplay("task", "Ship it"), "Task: Ship it");
    assert.equal(formatTargetDisplay("", "Ship it"), "Ship it");
    assert.equal(formatTargetDisplay("task", ""), "Task");
    assert.equal(formatTargetDisplay("", ""), "");
  });

  it("formats a timestamp, and answers empty for nothing", () => {
    const { formatDate } = readers();

    assert.equal(formatDate(""), "");
    assert.equal(formatDate(undefined), "");
    assert.equal(formatDate("not a date"), "not a date", "an unparseable value is shown, not hidden");
    assert.notEqual(formatDate("2026-09-22T10:00:00Z"), "");
  });

  it("formats a size across each magnitude", () => {
    const { formatBytes } = readers();

    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  });

  /**
   * This page's `formatBytes` answers **empty** for a zero-byte file, where the Files *settings*
   * page answers `"0 B"`. That is a real difference between two same-named helpers, and it is
   * pinned here so neither drifts into the other by assumption.
   */
  it("answers empty for no size, unlike the settings page's helper of the same name", () => {
    const { formatBytes } = readers();

    assert.equal(formatBytes(0), "");
    assert.equal(formatBytes(null), "");
    assert.equal(formatBytes("nonsense"), "");
  });
});
