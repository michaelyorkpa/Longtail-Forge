import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-row-action-contracts.test.mjs`.** `0.33.33.43.8` closed 37 diagnostics, almost
// all annotation. The two executable changes are the click-isolation narrowing and the display
// name moving behind a member read, so those are attacked first; the rest hold the availability
// rules the annotations describe, and the deferral the checkpoint recorded rather than paid for.
//
// Anchors are kept inside the function under attack - a lesson from `0.33.33.43.7`, where a case
// that reached into its neighbour broke the moment that neighbour gained a doc comment.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the click-isolation narrowing ----------------------------------------------------------------
  ["the isolation test stops narrowing its target",
    '    return event.target instanceof Element\n      && Boolean(event.target.closest("[data-file-action], a, button, input, select, textarea"));',
    '    return Boolean(event.target?.closest?.("[data-file-action], a, button, input, select, textarea"));'],
  ["row actions stop being isolated from the row-open click",
    '    return event.target instanceof Element\n      && Boolean(event.target.closest("[data-file-action], a, button, input, select, textarea"));',
    "    return false;"],
  ["embedded controls stop being isolated",
    '"[data-file-action], a, button, input, select, textarea"',
    '"[data-file-action]"'],

  // --- the name a confirmation uses -------------------------------------------------------------------
  ["the display name loses its precedence",
    "    const named = file == null ? undefined : Reflect.get(Object(file), \"displayName\", file);\n"
      + "    const original = file == null ? undefined : Reflect.get(Object(file), \"originalFilename\", file);\n\n"
      + '    return `${named || original || "this file"}`;',
    "    const named = file == null ? undefined : Reflect.get(Object(file), \"originalFilename\", file);\n"
      + "    const original = file == null ? undefined : Reflect.get(Object(file), \"displayName\", file);\n\n"
      + '    return `${named || original || "this file"}`;'],
  ["a nameless file is called undefined rather than this file",
    '    return `${named || original || "this file"}`;',
    "    return `${named || original}`;"],
  // **Dropping the `file == null` guard is an equivalent mutation and is deliberately absent.**
  // `Object(null)` answers `{}` and `Object(undefined)` answers `{}` too, so the member read
  // already absorbs both and returns `undefined` either way. The guard states the intent; it does
  // not decide an outcome, and a case for it would have to assert an internal path.

  // --- which flag actually decides ---------------------------------------------------------------------
  ["a truthy non-boolean counts as permission",
    '    const explicit = values.find((value) => typeof value === "boolean");',
    "    const explicit = values.find((value) => value !== undefined);"],
  ["the fallback wins over an explicit flag",
    '    return typeof explicit === "boolean" ? explicit : fallback;',
    "    return fallback;"],
  ["the explicit flag wins even when there is none",
    '    return typeof explicit === "boolean" ? explicit : fallback;',
    "    return Boolean(explicit);"],
  ["the snake_case spelling stops being consulted for reporting",
    "      attachment.canReport,\n      attachment.can_report,\n      file.canReport,\n      file.can_report,",
    "      attachment.canReport,\n      file.canReport,"],
  ["reporting defaults to refused rather than allowed",
    "      file.can_report,\n    ], true);",
    "      file.can_report,\n    ], false);"],
  ["review management defaults to allowed rather than to the workspace permission",
    '    ], workspaceHasPermission("files.manage_quarantine"));',
    "    ], true);"],

  // --- the status rules ---------------------------------------------------------------------------------
  ["a deleted file can be reported",
    '    return Boolean(fileId && status !== "deleted" && status !== "quarantined" && allowed);\n  }\n\n  /** @param {FileActionPermissions} attachment @param {FileActionPermissions} file @param {unknown} fileId @param {unknown} status */\n  function canQuarantineFileRow',
    '    return Boolean(fileId && status !== "quarantined" && allowed);\n  }\n\n  /** @param {FileActionPermissions} attachment @param {FileActionPermissions} file @param {unknown} fileId @param {unknown} status */\n  function canQuarantineFileRow'],
  ["an action is offered for a row with no file id",
    "    return Boolean(\n      row.fileId &&\n      row.status === \"quarantined\" &&",
    '    return Boolean(\n      row.status === "quarantined" &&'],
  ["a file still being scanned can be marked reviewed",
    '      ["not_required", "passed"].includes(row.scanStatus || "") &&',
    "      true &&"],
  ["marking reviewed stops requiring the review permission",
    "      row.canManageReview,\n    );",
    "      true,\n    );"],
  ["marking reviewed is offered for a file that is not in review",
    '      row.status === "quarantined" &&',
    "      true &&"],

  // --- the required dialog, and the deferral that was recorded -------------------------------------------
  ["a footer action tolerates a missing dialog instead of refusing",
    "    if (!dialog) {\n      throw new TypeError(\"The File Context action requires its dialog.\");\n    }\n    return dialog;",
    "    return dialog;"],
  // Retargeted by `0.33.33.43.16`, which discharged that deferral. The suite now asserts the spent
  // reason is gone, so the mutation worth making is writing it back in.
  ["the discharged deferral is written back into the source",
    "   * The four row mutations take a **proved** `fileId`, discharged by `0.33.33.43.16`.",
    "   * **A deliberate trade, stated rather than hidden.** Typing it `unknown` makes"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-row-action-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
