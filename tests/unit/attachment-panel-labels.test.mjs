import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/file-attachments.js");

/**
 * The half of the attachment panel nothing executed.
 *
 * `attachment-panel-list-contracts` lifts the five wire readers and
 * `public-demo-ingress-carry-through` runs `uploadFiles` against stubs. Neither reaches a label,
 * an availability rule, the options normaliser or a control. `0.33.33.39.7` annotated all of
 * them, and four reads moved with the annotations: two controls are required to be the elements
 * the tag names they were built with produce, the action button's fallback coerces its text sinks
 * and registers a listener only when there is one, and the category list is read as a list.
 *
 * These cases hold what each of those answered before, and name the one answer that differs.
 */

const LIFTED = [
  "requireAttachmentInput", "requireAttachmentButton", "createAttachmentElement",
  "createAttachmentActionButton", "createUploadResultItem", "readActionBooleanFlag",
  "workspaceHasPermission", "normalizeOptions", "acceptedExtensions", "acceptedFileHint",
  "isAttachmentReportable", "isAttachmentQuarantineable", "canPreviewAttachmentInReview",
  "statusLabel", "scanStatusLabel", "reviewStateLabel", "attachmentRecoveryMessage",
  "statusMessage", "uploadStatusMessage", "formatBytes", "formatToken",
  "safeAttachmentStateToken", "dashCase",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {{ filesManageQuarantine?: boolean }} [hints] */
function panel(hints = {}) {
  const browser = createFakeBrowserContext();
  const context = vm.createContext({
    document: browser.document,
    namespace: { workspaceContext: { permissionHints: hints } },
    ...fakeDomConstructors(),
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, context), document: browser.document };
}

const FILE = { displayName: "Report.pdf", originalFilename: "report.pdf", scanStatus: "passed", status: "available" };

describe("The controls this panel builds and then configures", () => {
  it("answers the control when the tag produced the element it was asked for", () => {
    const { api, document } = panel();
    const input = document.createElement("input");
    const button = document.createElement("button");
    assert.equal(api.requireAttachmentInput(input), input);
    assert.equal(api.requireAttachmentButton(button), button);
  });

  /** The refusal throws rather than skipping, because a skipped write leaves a broken control. */
  it("refuses an element the tag did not produce, naming which control", () => {
    const { api, document } = panel();
    const span = document.createElement("span");
    assert.throws(() => api.requireAttachmentInput(span), { name: "TypeError" });
    assert.throws(() => api.requireAttachmentButton(span), { name: "TypeError" });
    assert.throws(() => api.requireAttachmentInput(document.createElement("button")), /file input/);
    assert.throws(() => api.requireAttachmentButton(document.createElement("input")), /button/);
  });
});

describe("The fallback action button, for a host with no view factory", () => {
  it("writes the action vocabulary and the label onto the control", () => {
    const { api } = panel();
    const button = api.createAttachmentActionButton(undefined, {
      action: "files.report", label: "Report Report.pdf", role: "secondary", text: "",
    });
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.type, "button");
    assert.equal(button.className, "file-attachment-action");
    assert.equal(button.textContent, "Report Report.pdf", "an empty text falls back to the label");
    assert.equal(button.title, "Report Report.pdf");
    assert.equal(button.dataset.surfaceAction, "files.report");
    assert.equal(button.dataset.surfaceActionRole, "secondary");
    assert.equal(button.hidden, false);
  });

  it("prefers an explicit text and title over the label, and hides on request", () => {
    const { api } = panel();
    const button = api.createAttachmentActionButton(undefined, {
      action: "files.delete", hidden: true, label: "Delete", text: "Remove", title: "Delete forever",
    });
    assert.equal(button.textContent, "Remove");
    assert.equal(button.title, "Delete forever");
    assert.equal(button.hidden, true);
  });

  it("calls the handler it was given, and registers nothing when it was given none", () => {
    const { api } = panel();
    /** @type {unknown[]} */
    const clicks = [];
    const withHandler = api.createAttachmentActionButton(undefined, {
      action: "files.preview", label: "Preview", onClick: (/** @type {unknown} */ event) => clicks.push(event),
    });
    withHandler.dispatchEvent({ type: "click" });
    assert.equal(clicks.length, 1);

    const withoutHandler = api.createAttachmentActionButton(undefined, { action: "files.preview", label: "Preview" });
    assert.doesNotThrow(() => withoutHandler.dispatchEvent({ type: "click" }),
      "an absent listener is one the DOM ignored rather than registered");
  });
});

describe("One upload result", () => {
  it("names a success, a pending review and a failure differently", () => {
    const { api } = panel();
    assert.equal(api.createUploadResultItem(undefined, { ok: true, originalFilename: "a.txt" }).textContent,
      "a.txt uploaded.");
    assert.equal(api.createUploadResultItem(undefined, { ok: true, originalFilename: "a.txt", file: { status: "pending" } }).textContent,
      "a.txt uploaded; review pending.");
    assert.equal(api.createUploadResultItem(undefined, { ok: false, originalFilename: "a.txt", error: "Too large." }).textContent,
      "a.txt: Too large.");
    assert.equal(api.createUploadResultItem(undefined, { ok: false }).textContent, "File: Upload failed.");
  });

  it("marks the failure for assistive technology and for styling", () => {
    const { api } = panel();
    const failed = api.createUploadResultItem(undefined, { ok: false });
    assert.equal(failed.getAttribute("data-file-upload-result"), "error");
    assert.match(failed.className, /is-error/);
  });
});

describe("The accepted file categories", () => {
  it("maps each category to its own extensions", () => {
    const { api } = panel();
    assert.deepEqual(plain(api.acceptedExtensions(["image"])), [".gif", ".jpg", ".jpeg", ".png"]);
    assert.deepEqual(plain(api.acceptedExtensions(["pdf", "text"])), [".pdf", ".md", ".txt"]);
    assert.deepEqual(plain(api.acceptedExtensions(["unheard-of"])), [], "an unknown category offers nothing");
  });

  it("offers every extension for an empty list and for the other category", () => {
    const { api } = panel();
    const all = plain(api.acceptedExtensions([]));
    assert.ok(all.includes(".zip") && all.includes(".png") && all.includes(".xlsx"));
    assert.deepEqual(plain(api.acceptedExtensions(["image", "other"])), all, "other means all of them");
  });

  /**
   * **The one answer that differs.** `new Set(categories || [])` iterated a string per character
   * and threw for a non-iterable; the list check answers the same full set an absent list answers.
   * All three producers - `notes.js` twice and `task-dialog.js` - pass array literals.
   */
  it("reads a value that is not a list as no list at all", () => {
    const { api } = panel();
    const all = plain(api.acceptedExtensions([]));
    for (const value of [null, undefined, "image", 7, {}]) {
      assert.doesNotThrow(() => api.acceptedExtensions(value), `value: ${JSON.stringify(value)}`);
      assert.deepEqual(plain(api.acceptedExtensions(value)), all, `value: ${JSON.stringify(value)}`);
    }
  });

  it("states the hint from the same list", () => {
    const { api } = panel();
    assert.equal(api.acceptedFileHint(["pdf"]), "Accepted: .pdf");
  });
});

describe("Which actions an attachment offers", () => {
  it("takes the first boolean among the candidates, and the fallback when there is none", () => {
    const { api } = panel();
    assert.equal(api.readActionBooleanFlag([undefined, false, true], true), false);
    assert.equal(api.readActionBooleanFlag([undefined, null, "yes"], true), true, "only a boolean counts");
    assert.equal(api.readActionBooleanFlag([], false), false);
  });

  /** Reporting is on by default; quarantine is off unless the workspace hint grants it. */
  it("defaults reporting on and quarantine off", () => {
    const { api } = panel();
    const attachment = { fileId: "f_1" };
    assert.equal(api.isAttachmentReportable(attachment, FILE, "f_1", false, {}), true);
    assert.equal(api.isAttachmentQuarantineable(attachment, FILE, "f_1", false, {}), false);
    assert.equal(api.isAttachmentQuarantineable(attachment, FILE, "f_1", false, { canQuarantine: true }), true);
  });

  it("refuses both for a file with no id, a deleted file and one already in review", () => {
    const { api } = panel();
    const attachment = { fileId: "f_1" };
    assert.equal(api.isAttachmentReportable(attachment, FILE, "", false, {}), false);
    assert.equal(api.isAttachmentReportable(attachment, FILE, "f_1", true, {}), false);
    assert.equal(api.isAttachmentReportable(attachment, { ...FILE, status: "quarantined" }, "f_1", false, {}), false);
    assert.equal(api.isAttachmentQuarantineable(attachment, { ...FILE, status: "quarantined" }, "f_1", false, { canQuarantine: true }), false);
  });

  /** The attachment's and the file's own flags are read, in that order, after the options. */
  it("lets the record overrule the default, and the options overrule the record", () => {
    const { api } = panel();
    const attachment = { fileId: "f_1" };
    assert.equal(api.isAttachmentReportable({ ...attachment, canReport: false }, FILE, "f_1", false, {}), false);
    assert.equal(api.isAttachmentReportable({ ...attachment, can_report: false }, FILE, "f_1", false, {}), false);
    assert.equal(api.isAttachmentReportable(attachment, { ...FILE, canReport: false }, "f_1", false, {}), false);
    assert.equal(api.isAttachmentReportable({ ...attachment, canReport: false }, FILE, "f_1", false, { canReport: true }), true);
  });

  it("reads the review-preview grant from the same five candidates", () => {
    const { api } = panel();
    assert.equal(api.canPreviewAttachmentInReview({}, FILE, {}), false);
    assert.equal(api.canPreviewAttachmentInReview({}, FILE, { canQuarantine: true }), true);
    assert.equal(api.canPreviewAttachmentInReview({ can_quarantine: true }, FILE, {}), true);
    assert.equal(api.canPreviewAttachmentInReview({}, { ...FILE, canQuarantine: true }, {}), true);
  });

  it("grants quarantine from the workspace hint when nothing else answers", () => {
    assert.equal(panel().api.workspaceHasPermission("files.manage_quarantine"), false);
    assert.equal(panel({ filesManageQuarantine: true }).api.workspaceHasPermission("files.manage_quarantine"), true);
    assert.equal(panel({ filesManageQuarantine: true }).api.workspaceHasPermission("files.upload"), false,
      "and refuses every other permission, because it can answer for only this one");
  });
});

describe("The panel's own defaults", () => {
  it("fills the eleven members the panel reads, and lets the host replace each", () => {
    const { api } = panel();
    const defaults = api.normalizeOptions({});
    assert.deepEqual(Object.keys(defaults).sort(), [
      "acceptedCategories", "canQuarantine", "canRemove", "canReport", "canUpload",
      "clientId", "moduleId", "projectId", "targetId", "targetType", "visibility",
    ]);
    assert.equal(defaults.visibility, "private");
    assert.equal(defaults.canUpload, true);
    assert.equal(api.normalizeOptions({ visibility: "workspace" }).visibility, "workspace");
    assert.equal(api.normalizeOptions({ canUpload: false }).canUpload, false);
    assert.equal(api.normalizeOptions({ title: "Files" }).title, "Files", "and carries a member it does not default");
  });

  it("takes the quarantine default from the workspace hint rather than assuming it", () => {
    assert.equal(panel().api.normalizeOptions({}).canQuarantine, false);
    assert.equal(panel({ filesManageQuarantine: true }).api.normalizeOptions({}).canQuarantine, true);
  });
});

describe("What the panel says about itself", () => {
  it("counts attachments, and reports loading, uploading and failure ahead of the count", () => {
    const { api } = panel();
    const base = { attachments: [], error: "", isLoading: false, isUploading: false };
    assert.equal(api.statusMessage({ ...base }), "0 attachments");
    assert.equal(api.statusMessage({ ...base, attachments: [{}] }), "1 attachment");
    assert.equal(api.statusMessage({ ...base, attachments: [{}, {}] }), "2 attachments");
    assert.equal(api.statusMessage({ ...base, isLoading: true }), "Loading attachments...");
    assert.equal(api.statusMessage({ ...base, isUploading: true }), "Uploading attachments...");
    assert.equal(api.statusMessage({ ...base, error: "Nope.", isLoading: true }), "Nope.", "the error wins");
  });

  it("summarises an upload run by its outcomes", () => {
    const { api } = panel();
    const base = { error: "", isUploading: false, uploadResults: [] };
    assert.equal(api.uploadStatusMessage(base), "Select files to upload.");
    assert.equal(api.uploadStatusMessage({ ...base, isUploading: true }), "Uploading files...");
    assert.equal(api.uploadStatusMessage({ ...base, uploadResults: [{ ok: true }, { ok: true }] }), "2 uploaded.");
    assert.equal(api.uploadStatusMessage({ ...base, uploadResults: [{ ok: true }, { ok: false }] }), "1 uploaded, 1 failed.");
  });
});

describe("The words a file's state is given", () => {
  it("names each status and scan state the viewer can meet", () => {
    const { api } = panel();
    assert.equal(api.statusLabel("deleted", "passed"), "Unavailable");
    assert.equal(api.statusLabel("quarantined", "passed"), "In review");
    assert.equal(api.statusLabel("available", "pending"), "Review pending");
    assert.equal(api.statusLabel("available", "error"), "Review needed");
    assert.equal(api.statusLabel("available", "passed"), "Available");
    assert.equal(api.statusLabel("archived_thing", "passed"), "Archived Thing", "and any other status is titled");
    assert.equal(api.statusLabel("", ""), "");
  });

  it("names the review state separately, and repeats the status only while in review", () => {
    const { api } = panel();
    assert.equal(api.scanStatusLabel("not_required"), "No review needed");
    assert.equal(api.scanStatusLabel("passed"), "Reviewed");
    assert.equal(api.scanStatusLabel(""), "");
    assert.equal(api.reviewStateLabel("quarantined", "passed"), "In review");
    assert.equal(api.reviewStateLabel("available", "not_required"), "No review needed");
  });

  it("explains why a download is unavailable, and says nothing when it is", () => {
    const { api } = panel();
    assert.match(api.attachmentRecoveryMessage(FILE, false, true), /restored during the recovery window/);
    assert.match(api.attachmentRecoveryMessage({ ...FILE, status: "quarantined" }, false, false), /paused while this file is in review/);
    assert.match(api.attachmentRecoveryMessage({ ...FILE, scanStatus: "pending" }, false, false), /when review completes/);
    assert.match(api.attachmentRecoveryMessage({ ...FILE, scanStatus: "error" }, false, false), /until review is complete/);
    assert.match(api.attachmentRecoveryMessage(FILE, false, false), /unavailable for this file right now/);
    assert.equal(api.attachmentRecoveryMessage(FILE, true, false), "");
  });
});

describe("The small formatters", () => {
  it("scales a byte count and says nothing for none", () => {
    const { api } = panel();
    assert.equal(api.formatBytes(0), "");
    assert.equal(api.formatBytes(null), "");
    assert.equal(api.formatBytes(512), "512 B");
    assert.equal(api.formatBytes(2048), "2 KB");
    assert.equal(api.formatBytes(5 * 1024 * 1024), "5.0 MB");
  });

  it("titles a token, makes a safe class fragment of it, and dashes an event name", () => {
    const { api } = panel();
    assert.equal(api.formatToken("pending_review"), "Pending Review");
    assert.equal(api.formatToken(null), "");
    assert.equal(api.safeAttachmentStateToken("Pending Review"), "pending-review");
    assert.equal(api.safeAttachmentStateToken(null), "unknown");
    assert.equal(api.safeAttachmentStateToken("!!!"), "unknown", "and never an empty class fragment");
    assert.equal(api.dashCase("uploadCompleted"), "upload-completed");
  });
});

describe("file-attachments.js states its panel shapes rather than asserting them", () => {
  it("derives the options from its own normaliser and names the flags it only looks for", () => {
    assert.match(source, /@typedef \{ReturnType<typeof normalizeOptions>\} PanelOptions/);
    assert.match(source, /canQuarantine\?: unknown, can_quarantine\?: unknown, canReport\?: unknown, can_report\?: unknown/);
    assert.match(source, /This is a finding rather than a repair/);
  });

  it("carries no suppression and no assertion, and no new direct element construction", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.equal((source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || []).length, 0, "this file asserts nothing");
    assert.equal((source.match(/document\.createElement/g) || []).length, 1,
      "the centralized fallback stays the only direct construction");
  });
});
