import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-option-list-shape-contracts.test.mjs`.** `0.33.33.43.11` is mostly annotation:
// it re-types `safeOptionList`'s output to the `unknown` its filter actually establishes, and types
// the two consumers `0.33.33.43.10` deferred. The one executable change is `fileOptionValueField`,
// which transcribes five optional reads of that value - so most of this table attacks the helper's
// three easily-lost properties (nullish absorption, no conversion, the receiver), and the rest
// attacks the declarations the checkpoint is otherwise made of.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.
//
// **Dispositioned equivalents, not listed as cases.** Two rewrites of the helper answer identically
// for every input and are therefore not mutations at all: `Object(value ?? {})` (because `Object`
// already maps both nullish values to a fresh empty object), and restoring a call site to
// `option.value?.clientId` (which is the very equivalence the helper is named for). The second is
// still not free - it reintroduces the diagnostic this checkpoint closed - but that is the
// compiler's finding to report, not this suite's, and the typecheck ledger is where it lands.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the helper's three properties -----------------------------------------------------------------
  ["the receiver is dropped, so a getter sees a box instead of the value",
    "    return Reflect.get(Object(value), key, value);",
    "    return Reflect.get(Object(value), key);"],
  ["the receiver is boxed rather than passed through",
    "    return Reflect.get(Object(value), key, value);",
    "    return Reflect.get(Object(value), key, Object(value));"],
  ["the read is converted on the way out",
    "    return Reflect.get(Object(value), key, value);",
    "    return String(Reflect.get(Object(value), key, value));"],
  ["the helper defaults a falsy member instead of reporting it",
    "    return Reflect.get(Object(value), key, value);",
    '    return Reflect.get(Object(value), key, value) || "";'],
  ["an inherited member stops being visible",
    "    return Reflect.get(Object(value), key, value);",
    "    return Object.hasOwn(Object(value), key) ? Reflect.get(Object(value), key, value) : undefined;"],

  // --- what the filter is allowed to claim -----------------------------------------------------------
  ["the filter goes back to promising one consumer's shape",
    "   *   targetType?: string, value?: unknown }} FileEditorTargetOption",
    "   *   targetType?: string, value?: { clientId?: string, projectId?: string, moduleId?: string,\n"
      + "   *   targetId?: string, targetType?: string } }} FileEditorTargetOption"],
  ["the filter admits entries it no longer establishes anything about",
    "    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];",
    "    return Array.isArray(options) ? options : [];"],
  ["the filter stops accepting the second of the two members it names",
    "    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];",
    "    return Array.isArray(options) ? options.filter((option) => option?.value) : [];"],

  // --- what the two deferred consumers claim ---------------------------------------------------------
  ["createOption narrows back to the pair the published sibling was widened away from",
    "   * @param {unknown} value @param {unknown} label",
    "   * @param {string} value @param {string} label"],
  ["the select config claims the option list it was handed unknown",
    "   * @param {{ selectedValue?: string, placeholder?: string, options?: unknown,",
    "   * @param {{ selectedValue?: string, placeholder?: string, options?: FileEditorTargetOption[],"],

  // --- the lookup the project control now shares with its siblings -----------------------------------
  ["the project control goes back to an unchecked lookup",
    '    const projectSelect = findFileContextSelect(dialog, "[data-file-context-project]");',
    '    const projectSelect = dialog.querySelector("[data-file-context-project]");'],
  ["the checked lookup stops checking",
    "    const control = dialog.querySelector(selector);\n    return control instanceof HTMLSelectElement ? control : null;",
    "    const control = dialog.querySelector(selector);\n    return control || null;"],
  ["the control this page builds is no longer the kind the lookup demands",
    '    return createFilesElement("select", {\n      attrs: { name },\n      dataset: { [datasetKey]: "" },',
    '    return createFilesElement("div", {\n      attrs: { name },\n      dataset: { [datasetKey]: "" },'],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-option-list-shape-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
