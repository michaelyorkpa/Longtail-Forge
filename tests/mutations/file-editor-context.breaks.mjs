import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Honest about what this checkpoint actually changed.** `0.33.33.43.6` closed 24 diagnostics and
// all but one line of that is annotation the compiler proves. The executable change is the context
// controls now being found through an `instanceof` check, so the first group attacks that filter
// and the label behaviour the annotations describe. The last group attacks the typedef's honesty:
// the payload declares three members as proved, and the builder is what has to prove them.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the checked lookup this checkpoint introduced ------------------------------------------------
  ["the context lookup asserts the subtype instead of checking it",
    "    return control instanceof HTMLSelectElement ? control : null;",
    "    return /** @type {HTMLSelectElement | null} */ (control);"],
  ["the context lookup demands an input, which this editor never builds",
    "    return control instanceof HTMLSelectElement ? control : null;",
    "    return control instanceof HTMLInputElement ? control : null;"],
  ["no context control is ever accepted",
    "    return control instanceof HTMLSelectElement ? control : null;",
    "    return null;"],
  ["the context controls stop being built as selects",
    '  function createFileContextSelect(datasetKey, name) {\n    return createFilesElement("select", {',
    '  function createFileContextSelect(datasetKey, name) {\n    return createFilesElement("input", {'],
  ["the target select stops going through the checked lookup",
    'const targetSelect = findFileContextSelect(dialog, "[data-file-context-target]");',
    'const targetSelect = dialog.querySelector("[data-file-context-target]");'],

  // --- the loaded-control gate and its fallback -----------------------------------------------------
  ["a control is read before it reports itself loaded",
    '    if (!control || control.dataset.fileContextLoaded !== "true") {',
    "    if (!control) {"],
  ["every control reads as unloaded",
    '    if (!control || control.dataset.fileContextLoaded !== "true") {',
    "    if (true) {"],
  // **Two attacks on this function's `|| ""` are equivalent mutations and are deliberately absent.**
  // `fallbackValue` is declared `string` with a `""` default, so `undefined` never reaches the
  // expression and every value it can hold is already a string. `control.value` is likewise always
  // a string - and it is **the narrowing above that guarantees it**, because only a real `select`
  // now reaches that line. Both fallbacks restate the intent; neither decides an outcome. A case
  // for either would have to pass a value the declared types forbid.

  // --- the label that distinguishes one target from another -----------------------------------------
  ["the client label is shown even when the context already matches",
    "    if (option.clientLabel && (!context.clientId || context.clientId !== optionClientId)) {",
    "    if (option.clientLabel) {"],
  ["the project label is never shown",
    "    if (option.projectLabel && (!context.projectId || context.projectId !== optionProjectId)) {",
    "    if (false) {"],
  ["nested option ids stop being read",
    "    const optionClientId = option.clientId || option.value?.clientId || \"\";",
    '    const optionClientId = option.clientId || "";'],
  ["the parts stop being joined with a separator",
    '      return contextParts.join(" / ");',
    "      return contextParts.join(\"\");"],
  ["the context label is used even when a real label exists",
    "    if (!option.clientLabel && !option.projectLabel && option.contextLabel) {",
    "    if (option.contextLabel) {"],
  ["an option with nothing to say returns undefined rather than empty",
    '    return "";\n  }\n\n  function safeOptionList(options) {',
    "    return undefined;\n  }\n\n  function safeOptionList(options) {"],

  // --- the three members the payload typedef calls proved -------------------------------------------
  ["an incomplete payload is sent rather than refused",
    '    if (!payload.moduleId || !payload.targetType || !payload.targetId || selectedTarget?.disabled) {',
    "    if (false) {"],
  ["a disabled target stops being refused",
    "|| selectedTarget?.disabled) {",
    ") {"],
  ["the optional ids are sent even when empty",
    "    if (clientId) {\n      payload.clientId = clientId;\n    }",
    "    payload.clientId = clientId;"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-editor-context-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
