import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What a file row can do, who may do it, and what it calls the file.
 *
 * `0.33.33.43.8` typed the fourteen readers behind the row's actions. Most is annotation, but two
 * things are not: the click-isolation test now narrows its target with `instanceof` instead of an
 * optional chain, and the confirmation's file name is read through members rather than a declared
 * shape. The availability predicates are pure once their permission lookup is supplied, so they
 * are run rather than only read.
 */

const source = createProjectTextReader().readText("public/js/files.js");

const LIFTED = [
  "readActionBooleanFlag", "canManageFileReview", "canReportFileRow", "canQuarantineFileRow",
  "canMarkReviewedFileRow", "fileActionDisplayName",
];

/** @param {boolean} [mayManage] whether the workspace grants files.manage_quarantine */
function actions(mayManage = false) {
  const sandbox = vm.createContext({ Reflect });
  vm.runInContext(`function workspaceHasPermission() { return ${Boolean(mayManage)}; }`, sandbox);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

describe("A flag is read from whichever spelling actually carries a boolean", () => {
  it("takes the first real boolean, in the order the caller listed", () => {
    const { readActionBooleanFlag } = actions();

    assert.equal(readActionBooleanFlag([undefined, false, true], true), false);
    assert.equal(readActionBooleanFlag([undefined, undefined, true], false), true);
  });

  it("falls back only when no candidate is a boolean at all", () => {
    const { readActionBooleanFlag } = actions();

    assert.equal(readActionBooleanFlag([], true), true);
    assert.equal(readActionBooleanFlag([undefined, null, "yes", 1], false), false);
    assert.equal(readActionBooleanFlag([undefined, null, "yes", 1], true), true);
  });

  /** A missing flag means "unstated", which is why the fallback is an argument and not `false`. */
  it("does not treat a truthy non-boolean as permission", () => {
    const { readActionBooleanFlag } = actions();

    assert.equal(readActionBooleanFlag(["true"], false), false);
    assert.equal(readActionBooleanFlag([1], false), false);
    // A non-boolean standing *before* a real boolean must be skipped, not taken. The cases above
    // cannot tell "skip it" from "take it and reject it later", because both answer the fallback.
    assert.equal(readActionBooleanFlag(["yes", true], false), true);
    assert.equal(readActionBooleanFlag([null, "x", false], true), false);
  });
});

describe("Reporting is offered unless the record says otherwise", () => {
  it("defaults to allowed, and needs a file id and a live status", () => {
    const { canReportFileRow } = actions();

    assert.equal(canReportFileRow({}, {}, "f1", "available"), true);
    assert.equal(canReportFileRow({}, {}, "", "available"), false);
    assert.equal(canReportFileRow({}, {}, "f1", "deleted"), false);
    assert.equal(canReportFileRow({}, {}, "f1", "quarantined"), false);
  });

  it("is refused when either spelling of the flag says so", () => {
    const { canReportFileRow } = actions();

    assert.equal(canReportFileRow({ canReport: false }, {}, "f1", "available"), false);
    assert.equal(canReportFileRow({}, { can_report: false }, "f1", "available"), false);
  });
});

describe("Review actions follow the workspace permission unless the record overrides it", () => {
  it("is refused without the permission and allowed with it", () => {
    assert.equal(actions(false).canManageFileReview({}, {}, "f1"), false);
    assert.equal(actions(true).canManageFileReview({}, {}, "f1"), true);
  });

  it("lets an explicit record flag override the workspace permission either way", () => {
    assert.equal(actions(false).canManageFileReview({ canQuarantine: true }, {}, "f1"), true);
    assert.equal(actions(true).canManageFileReview({ can_quarantine: false }, {}, "f1"), false);
  });

  it("quarantining additionally needs a live status", () => {
    const { canQuarantineFileRow } = actions(true);

    assert.equal(canQuarantineFileRow({}, {}, "f1", "available"), true);
    assert.equal(canQuarantineFileRow({}, {}, "f1", "quarantined"), false);
    assert.equal(canQuarantineFileRow({}, {}, "", "available"), false);
  });

  it("marking reviewed is offered only for a scanned file already in review", () => {
    const { canMarkReviewedFileRow } = actions();
    const base = { fileId: "f1", status: "quarantined", scanStatus: "passed", canManageReview: true };

    assert.equal(canMarkReviewedFileRow(base), true);
    assert.equal(canMarkReviewedFileRow({ ...base, scanStatus: "not_required" }), true);
    assert.equal(canMarkReviewedFileRow({ ...base, scanStatus: "failed" }), false);
    assert.equal(canMarkReviewedFileRow({ ...base, status: "available" }), false);
    assert.equal(canMarkReviewedFileRow({ ...base, canManageReview: false }), false);
    assert.equal(canMarkReviewedFileRow({ ...base, fileId: "" }), false);
    assert.equal(canMarkReviewedFileRow(), false);
  });
});

describe("A confirmation names the file without claiming a shape for it", () => {
  it("prefers the display name, falls back to the original, then to a generic", () => {
    const { fileActionDisplayName } = actions();

    assert.equal(fileActionDisplayName({ displayName: "Report.pdf", originalFilename: "r.pdf" }), "Report.pdf");
    assert.equal(fileActionDisplayName({ originalFilename: "r.pdf" }), "r.pdf");
    assert.equal(fileActionDisplayName({}), "this file");
  });

  it("names a file it was given nothing usable for, rather than saying undefined", () => {
    const { fileActionDisplayName } = actions();

    for (const value of [null, undefined, 0, "", { displayName: "" }]) {
      assert.equal(fileActionDisplayName(value), "this file");
    }
  });
});

describe("The click-isolation test narrows its target", () => {
  it("checks the target is an element rather than optional-chaining closest", () => {
    assert.match(
      source,
      /return event\.target instanceof Element\s*\n\s*&& Boolean\(event\.target\.closest\("\[data-file-action\], a, button, input, select, textarea"\)\);/,
      "a target that is not an element could never have answered closest",
    );
    assert.doesNotMatch(source, /event\.target\?\.closest\?\./);
  });

  it("keeps every control the isolation list covers", () => {
    for (const control of ["\\[data-file-action\\]", "a", "button", "input", "select", "textarea"]) {
      assert.match(source, new RegExp(`${control}(,|")`), `${control} must stay in the isolation list`);
    }
  });
});

describe("The dialog a footer action acts on is required, not tolerated", () => {
  /**
   * The action closes over the `dialog` local before the builder assigns it. Reading `querySelector`
   * off `null` already threw, so the guard **preserves** that rather than introducing a silent skip
   * that would leave a visible button doing nothing.
   */
  it("throws by name where the null read already threw", () => {
    assert.match(
      source,
      /function requireFileEditorDialog\(dialog\) \{\s*\n\s*if \(!dialog\) \{\s*\n\s*throw new TypeError\("The File Context action requires its dialog\."\);/,
    );
    assert.match(source, /markFileReviewedFromContext\(requireFileEditorDialog\(dialog\), row, options\)/);
  });
});

describe("The shapes this checkpoint declared, and the one it declined to", () => {
  it("names the permission flags in both spellings, all optional and unproved", () => {
    assert.match(
      source,
      /@typedef \{\{ canReport\?: unknown, can_report\?: unknown,\s*\n\s*\*\s*canQuarantine\?: unknown, can_quarantine\?: unknown \}\} FileActionPermissions/,
    );
  });

  it("does not declare a shape whose name collides with the published carrier", () => {
    assert.doesNotMatch(
      source,
      /\}\} FileActionRecord\b/,
      "BrowserFileActionRecord is published and means the carrier, not the file",
    );
    assert.doesNotMatch(source, /\}\} FileActionSubject\b/, "that near-collision was withdrawn rather than renamed around");
  });

  it("records why three row mutations keep an untyped file id", () => {
    assert.match(
      source,
      /\*\*A deliberate trade, stated rather than hidden\.\*\*/,
      "the deferral must carry its reason where the next reader meets it",
    );
    assert.match(source, /widening \*\*25 route pins\*\*/, "and the measured cost that justifies it");
    for (const route of ["report", "quarantine", "delete"]) {
      assert.match(
        source,
        new RegExp(`encodeURIComponent\\(fileId\\)\\}/${route}`),
        `the ${route} route must stay exactly as its pins assert it`,
      );
    }
  });
});
