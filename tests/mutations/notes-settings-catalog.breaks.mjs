import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/notes-settings.js";
const suites = ["tests/unit/notes-settings-catalog-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function catalogSelectionControl(catalog) {",
    "  // @ts-expect-error deliberately added\n  function catalogSelectionControl(catalog) {"],
  ["the published catalog row is restated locally",
    '  /** @typedef {import("../../src/types/browser-contracts.js").BrowserNoteCatalogSettingsRow} BrowserNoteCatalogSettingsRow */',
    "  /** @typedef {{ catalogId: string, title: string, status: string }} BrowserNoteCatalogSettingsRow */"],
  ["a master key name is introduced in an annotation",
    "   * @typedef {\"enable\" | \"remove\" | \"retry\"} CatalogSecurityRequest",
    "   * @typedef {\"enable\" | \"remove\" | \"retry\"} CatalogSecurityRequest - see SECURE_NOTES_MASTER_KEY"],
  ["the missing settings host stops being named",
    '    if (!notesSettingsHost) {\n      throw new Error("Notes settings requires its settings host.");\n    }\n    return notesSettingsHost;',
    "    return /** @type {Element} */ (notesSettingsHost);"],

  // --- the response readers ----------------------------------------------------------------------
  // Both record predicates in this file share a body, so these anchors name the one they mean.
  ["a primitive is taken as a response record",
    "  function isResponseRecord(value) {\n    return typeof value === \"object\" && value !== null && !Array.isArray(value);",
    "  function isResponseRecord(value) {\n    return value !== null && value !== undefined;"],
  ["an array is taken as a response record",
    "  function isResponseRecord(value) {\n    return typeof value === \"object\" && value !== null && !Array.isArray(value);",
    "  function isResponseRecord(value) {\n    return typeof value === \"object\" && value !== null;"],
  ["a bulk count that is not a number is reported anyway",
    '    return typeof count === "number" && Number.isFinite(count) ? count : 0;',
    "    return Number(count) || 0;"],
  ["an infinite bulk count is reported",
    '    return typeof count === "number" && Number.isFinite(count) ? count : 0;',
    '    return typeof count === "number" ? count : 0;'],
  // **Withdrawn, and inert for a real reason.** Reading the body raw instead of through the
  // record guard answers the same count for every value: `null` and `undefined` short-circuit the
  // ternary below, and a string, a number or an array carries no `affectedCount` - so the finite
  // check refuses them either way. The guard states what is being read and ships unchanged.

  // --- the selection control -------------------------------------------------------------------------
  ["a selected catalog's control is left unchecked",
    "    control.checked = state.selectedCatalogIds.has(catalog.catalogId);",
    "    control.checked = false;"],
  ["every control is checked regardless of the selection",
    "    control.checked = state.selectedCatalogIds.has(catalog.catalogId);",
    "    control.checked = true;"],
  ["the selection control loses its accessible name fallbacks",
    '    control.setAttribute("aria-label", `Select ${catalog.path || catalog.title || "catalog"}`);',
    '    control.setAttribute("aria-label", `Select ${catalog.path}`);'],
  ["the selection control names the title before the path",
    '    control.setAttribute("aria-label", `Select ${catalog.path || catalog.title || "catalog"}`);',
    '    control.setAttribute("aria-label", `Select ${catalog.title || catalog.path || "catalog"}`);'],
  ["deselecting a catalog leaves it selected",
    "      if (control.checked) {\n        state.selectedCatalogIds.add(catalog.catalogId);\n      } else {\n        state.selectedCatalogIds.delete(catalog.catalogId);\n      }",
    "      state.selectedCatalogIds.add(catalog.catalogId);"],
  ["changing the selection stops redrawing the manager",
    "      renderCatalogManager();\n    });\n    return control;",
    "    });\n    return control;"],

  // --- the row actions -------------------------------------------------------------------------------------
  ["an archived catalog can still be edited",
    '      disabled: catalog.status !== "active" || catalog.securityTransitionState !== "stable",',
    '      disabled: catalog.securityTransitionState !== "stable",'],
  ["a catalog mid-transition can still be edited",
    '      disabled: catalog.status !== "active" || catalog.securityTransitionState !== "stable",',
    '      disabled: catalog.status !== "active",'],
  ["an active stable catalog cannot be edited",
    '      disabled: catalog.status !== "active" || catalog.securityTransitionState !== "stable",',
    "      disabled: true,"],
  ["the security actions stop being grouped separately",
    "    const securityAction = catalogSecurityAction(catalog);\n    if (!securityAction) {\n      return ordinaryActions;\n    }",
    "    const securityAction = catalogSecurityAction(catalog);\n    if (true) {\n      return ordinaryActions;\n    }"],
  ["a row with no security action is given an empty security group",
    "    const securityAction = catalogSecurityAction(catalog);\n    if (!securityAction) {\n      return ordinaryActions;\n    }",
    "    const securityAction = catalogSecurityAction(catalog);\n    if (false) {\n      return ordinaryActions;\n    }"],

  // --- the security action -------------------------------------------------------------------------------------
  ["the manage-security capability stops gating the control",
    '    if (!state.canManageSecurity || catalog.status !== "active" || catalog.securityTransitionState === "securing") {',
    '    if (catalog.status !== "active" || catalog.securityTransitionState === "securing") {'],
  ["an archived catalog is offered a security control",
    '    if (!state.canManageSecurity || catalog.status !== "active" || catalog.securityTransitionState === "securing") {',
    '    if (!state.canManageSecurity || catalog.securityTransitionState === "securing") {'],
  ["a catalog mid-transition is offered a security control",
    '    if (!state.canManageSecurity || catalog.status !== "active" || catalog.securityTransitionState === "securing") {',
    '    if (!state.canManageSecurity || catalog.status !== "active") {'],
  ["a failed transition stops offering a retry",
    '    if (catalog.securityTransitionState === "failed") {\n      label = "Retry Security";\n      action = "retry";\n      role = "primary";\n    } else if',
    '    if (false) {\n      label = "Retry Security";\n      action = "retry";\n      role = "primary";\n    } else if'],
  ["a retry is offered as a secondary rather than a primary action",
    '      label = "Retry Security";\n      action = "retry";\n      role = "primary";',
    '      label = "Retry Security";\n      action = "retry";\n      role = "secondary";'],
  ["a retry asks the server to enable rather than repeat",
    '      label = "Retry Security";\n      action = "retry";',
    '      label = "Retry Security";\n      action = "enable";'],
  ["removing security stops being marked destructive",
    '      label = "Remove Security";\n      action = "remove";\n      role = "destructive";',
    '      label = "Remove Security";\n      action = "remove";\n      role = "secondary";'],
  ["a secured catalog is offered Enable rather than Remove",
    '    } else if (catalog.securityPolicy === "secure") {\n      label = "Remove Security";',
    '    } else if (false) {\n      label = "Remove Security";'],
  ["a catalog protected by an ancestor is offered a control anyway",
    '    } else if (catalog.securityInherited || catalog.effectiveSecurityMode === "secure") {\n      return null;\n    }',
    "    } else if (false) {\n      return null;\n    }"],
  ["inherited protection stops being recognised",
    '    } else if (catalog.securityInherited || catalog.effectiveSecurityMode === "secure") {',
    '    } else if (catalog.effectiveSecurityMode === "secure") {'],
  ["an effectively secure catalog stops being recognised",
    '    } else if (catalog.securityInherited || catalog.effectiveSecurityMode === "secure") {',
    "    } else if (catalog.securityInherited) {"],
  ["the security control asks for the wrong action",
    "    button.addEventListener(\"click\", () => openCatalogSecurityDialog(catalog, action));",
    '    button.addEventListener("click", () => openCatalogSecurityDialog(catalog, "enable"));'],

  // --- the security status chip -------------------------------------------------------------------------------------
  ["explicit security outranks inherited security on the chip",
    '    if (catalog.securityInherited) {\n      labels.push("Secure (inherited)");\n    } else if (catalog.securityPolicy === "secure") {',
    '    if (catalog.securityPolicy === "secure") {\n      labels.push("Secure (inherited)");\n    } else if (catalog.securityInherited) {'],
  ["an inherited catalog is reported as normal",
    '    if (catalog.securityInherited) {\n      labels.push("Secure (inherited)");',
    '    if (false) {\n      labels.push("Secure (inherited)");'],
  ["an explicitly secured catalog is reported as normal",
    '    } else if (catalog.securityPolicy === "secure") {\n      labels.push("Secure (explicit)");',
    "    } else if (false) {\n      labels.push(\"Secure (explicit)\");"],
  ["removing security is reported as securing",
    '      labels.push(catalog.securityTransitionAction === "remove" ? "removing security" : "securing");',
    '      labels.push("securing");'],
  ["a transition in progress stops being reported",
    '    if (catalog.securityTransitionState === "securing") {\n      labels.push(catalog.securityTransitionAction === "remove" ? "removing security" : "securing");',
    '    if (false) {\n      labels.push(catalog.securityTransitionAction === "remove" ? "removing security" : "securing");'],
  ["a failed transition stops asking for recovery",
    '    } else if (catalog.securityTransitionState === "failed") {\n      labels.push(`recovery needed',
    "    } else if (false) {\n      labels.push(`recovery needed"],
  ["a reported failure code stops being named",
    "      labels.push(`recovery needed${catalog.securityTransitionErrorCode ? `: ${safeFailureLabel(catalog.securityTransitionErrorCode)}` : \"\"}`);",
    "      labels.push(`recovery needed`);"],
  ["the inherited-security explanation is dropped",
    '    if (catalog.securityInherited) {\n      element.title = "A secure ancestor protects this catalog. Child catalogs cannot weaken inherited security.";\n    }',
    '    if (false) {\n      element.title = "A secure ancestor protects this catalog. Child catalogs cannot weaken inherited security.";\n    }'],
  ["the inherited-security explanation is shown on every catalog",
    "    if (catalog.securityInherited) {\n      element.title =",
    "    if (true) {\n      element.title ="],
  ["a failure code keeps its escaping",
    '    return String(value || "catalog security transition failed").replaceAll("_", " ").slice(0, 120);',
    '    return String(value || "catalog security transition failed").slice(0, 120);'],
  ["a failure label stops being bounded",
    '.replaceAll("_", " ").slice(0, 120);',
    '.replaceAll("_", " ");'],
  ["an absent failure code loses its label",
    '    return String(value || "catalog security transition failed")',
    "    return String(value)"],

  // --- the hierarchy -------------------------------------------------------------------------------------
  ["a descendant walk stops descending past the first level",
    "          descendants.add(catalog.catalogId);\n          queue.push(catalog.catalogId);",
    "          descendants.add(catalog.catalogId);"],
  ["a descendant walk never terminates on a cycle",
    "        if (!descendants.has(catalog.catalogId)) {\n          descendants.add(catalog.catalogId);\n          queue.push(catalog.catalogId);\n        }",
    "        descendants.add(catalog.catalogId);\n        queue.push(catalog.catalogId);"],
  ["a descendant walk collects the wrong children",
    "      state.catalogs.filter((catalog) => catalog.parentCatalogId === parentId)",
    "      state.catalogs.filter((catalog) => catalog.catalogId === parentId)"],

  // --- the chrome -------------------------------------------------------------------------------------
  ["the archive action stops being marked destructive",
    '    const button = view.createActionButton({ label, role: action === "archive" ? "destructive" : "primary", type: "button", disabled });',
    '    const button = view.createActionButton({ label, role: "primary", type: "button", disabled });'],
  ["every bulk action is marked destructive",
    '    const button = view.createActionButton({ label, role: action === "archive" ? "destructive" : "primary", type: "button", disabled });',
    '    const button = view.createActionButton({ label, role: "destructive", type: "button", disabled });'],
  ["a bulk control stops carrying its disabled state",
    'type: "button", disabled });\n    button.addEventListener("click", () => runBulkCatalogAction(action));',
    'type: "button" });\n    button.addEventListener("click", () => runBulkCatalogAction(action));'],
  ["a bulk control runs the wrong action",
    '    button.addEventListener("click", () => runBulkCatalogAction(action));',
    '    button.addEventListener("click", () => runBulkCatalogAction("archive"));'],
  ["an archived catalog is chipped as active",
    '    return view.createElement("span", { className: "surface-chip", text: status === "archived" ? "Archived" : "Active" });',
    '    return view.createElement("span", { className: "surface-chip", text: "Active" });'],
  ["every catalog is chipped as archived",
    'text: status === "archived" ? "Archived" : "Active" });',
    'text: "Archived" });'],
  ["a library bucket loses its label",
    '    return labels.get(value) || "Reference Library";',
    "    return labels.get(value);"],
  ["a known library bucket is labelled as reference",
    '    return labels.get(value) || "Reference Library";',
    '    return "Reference Library";'],
  ["a library option loses one of its three buckets",
    '      { value: "ongoing_area", label: "Ongoing Areas" },',
    ""],
  ["an option carries its label as its value",
    "    option.value = value;\n    option.textContent = label;",
    "    option.value = label;\n    option.textContent = label;"],
  ["an epoch timestamp is coerced to text before it is read as a date",
    '    const parsed = typeof value === "number" ? new Date(value) : new Date(String(value));',
    "    const parsed = new Date(String(value));"],
  ["an unreadable timestamp is rendered rather than dashed",
    '    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();',
    "    return parsed.toLocaleString();"],
  ["an absent timestamp is parsed rather than dashed",
    '    if (!value) {\n      return "-";\n    }',
    '    if (false) {\n      return "-";\n    }'],
  ["a dialog stops being closed through its own method",
    '    if (typeof dialog.close === "function") {\n      dialog.close();\n    } else {\n      dialog.removeAttribute("open");\n    }',
    '    dialog.removeAttribute("open");'],
  ["a dialog without a close method is left open",
    '    } else {\n      dialog.removeAttribute("open");\n    }',
    "    }"],
  ["a closed dialog is left in the document",
    '      dialog.removeAttribute("open");\n    }\n    dialog.remove();',
    '      dialog.removeAttribute("open");\n    }'],
  ["a catalog error is reported with the ordinary tone",
    "    requireStatusMessage().set(element, message, options.isError ? { type: \"error\" } : options);",
    "    requireStatusMessage().set(element, message, options);"],
  ["every catalog status is reported as an error",
    "    requireStatusMessage().set(element, message, options.isError ? { type: \"error\" } : options);",
    '    requireStatusMessage().set(element, message, { type: "error" });'],
  ["a page error is reported with the ordinary tone",
    "    requireStatusMessage().set(notesSettingsStatus, message, options.isError ? { type: \"error\" } : options);",
    "    requireStatusMessage().set(notesSettingsStatus, message, options);"],
  ["the catalog status is written to the page status line",
    '    const element = asStatusElement(notesSettingsAuxiliary?.querySelector("[data-notes-catalog-status]") || null);',
    "    const element = notesSettingsStatus;"],

  // --- the editor's parent options -------------------------------------------------------------------------------------
  ["a catalog can be reparented under its own descendant",
    "      const excludedIds = catalog ? catalogDescendantIds(catalog.catalogId) : new Set();",
    "      const excludedIds = new Set();"],
  ["a catalog can be reparented under itself",
    "      excludedIds.add(catalog?.catalogId);",
    ""],
  ["an excluded catalog is offered as a parent anyway",
    "!excludedIds.has(candidate.catalogId)",
    "true"],
  ["an archived catalog is offered as a parent",
    '        .filter((candidate) => candidate.status === "active" && candidate.libraryBucket === libraryControl.value && !excludedIds.has(candidate.catalogId))',
    "        .filter((candidate) => candidate.libraryBucket === libraryControl.value && !excludedIds.has(candidate.catalogId))"],
  ["a catalog from another library is offered as a parent",
    '        .filter((candidate) => candidate.status === "active" && candidate.libraryBucket === libraryControl.value && !excludedIds.has(candidate.catalogId))',
    '        .filter((candidate) => candidate.status === "active" && !excludedIds.has(candidate.catalogId))'],
  ["the root option is dropped from the parent list",
    '      const parentOptions = [viewOption("", "Root catalog")];',
    "      const parentOptions = [];"],
  ["the parent selection is read twice rather than once",
    '      const parentCatalogId = catalog?.parentCatalogId || "";\n      parentControl.value = parentOptions.some((option) => option.value === parentCatalogId) ? parentCatalogId : "";',
    '      parentControl.value = "";'],
  ["a parent that is no longer offered is selected anyway",
    '      parentControl.value = parentOptions.some((option) => option.value === parentCatalogId) ? parentCatalogId : "";',
    "      parentControl.value = parentCatalogId;"],

  // --- the transition poll -------------------------------------------------------------------------------------
  ["the transition poll stops being bounded to the securing state",
    '    if (state.catalogs.some((catalog) => catalog.securityTransitionState === "securing")) {',
    "    if (true) {"],
  ["a securing transition stops being polled",
    '    if (state.catalogs.some((catalog) => catalog.securityTransitionState === "securing")) {',
    "    if (false) {"],
  ["the poll interval is removed",
    "      state.refreshTimer = window.setTimeout(() => loadCatalogs().catch(() => {}), 3000);",
    "      state.refreshTimer = window.setTimeout(() => loadCatalogs().catch(() => {}), 0);"],
  ["a pending poll is not cleared before the next one",
    "    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);",
    ""],

  // --- the security dialog -------------------------------------------------------------------------------------
  ["a retry asks for the requested action rather than the failed one",
    '    const transitionAction = requestedAction === "retry" ? catalog.securityTransitionAction : requestedAction;',
    "    const transitionAction = requestedAction;"],
  ["every action is resolved as the failed transition's",
    '    const transitionAction = requestedAction === "retry" ? catalog.securityTransitionAction : requestedAction;',
    "    const transitionAction = catalog.securityTransitionAction;"],
  ["an unreadable preflight is confirmed anyway",
    '      if (!preflight) {\n        throw new Error("Catalog security preview could not be read.");\n      }',
    "      if (false) {\n        throw new Error(\"Catalog security preview could not be read.\");\n      }"],
  ["the confirmation is offered before the preview is read",
    "      showCatalogSecurityConfirmation(catalog, requestedAction, preflight);",
    "      showCatalogSecurityConfirmation(catalog, requestedAction, preflight || {});"],
  ["a refused preflight still enables the submit control",
    "      disabled: preflight.canProceed !== true,",
    "      disabled: false,"],
  ["the preflight identifier stops being encoded into the request",
    "`/api/notes/collections/${encodeURIComponent(catalog.catalogId)}/security/preflight?action=${encodeURIComponent(transitionAction)}`",
    "`/api/notes/collections/${catalog.catalogId}/security/preflight?action=${transitionAction}`"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    // **Bounded, because a mutation can break the page by not terminating.** Removing the cycle
    // guard from `catalogDescendantIds` makes its walk loop forever on the cyclic fixture, so an
    // unbounded run wedges the whole campaign instead of reporting the case. A timeout is a
    // refusal - the suite did not pass - but it is reported as its own kind so the reader knows
    // the mutation hung rather than failed an assertion.
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true, timeout: 120000, killSignal: "SIGKILL",
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    // `code` is Node's own addition to the error it reports for a timeout, not a member of
    // `Error` - so it is read through `in`, which is the rule this estate settled for values
    // whose shape the declaration does not carry.
    const timedOut = suite.signal === "SIGKILL"
      || (suite.error instanceof Error && "code" in suite.error && suite.error.code === "ETIMEDOUT");
    const refused = syntaxValid && (timedOut || suite.status !== 0);
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (${timedOut ? "syntax valid, suite did not terminate" : "syntax valid, assertion failed"}): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
