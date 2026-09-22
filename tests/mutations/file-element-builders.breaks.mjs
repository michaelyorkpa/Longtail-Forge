import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-element-builder-contracts.test.mjs`.** `0.33.33.43.12` typed seven small element
// builders and changed **no executable line**, so the table attacks the thing an annotation can
// quietly get wrong: it adds a conversion that was not there. Each builder is mutated to convert
// what it currently passes through, and the suite's identity assertions must refuse it.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.
//
// **Dispositioned, not listed.** Typing `dataKey` or `datasetKey` as `unknown` is not a test case:
// a computed key in a `Record<string, unknown>` fails to compile, so the compiler owns that one and
// the ledger is where it would show up. Listing it here would credit the suite for a catch the
// compiler made.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- a conversion introduced where there was none -----------------------------------------------
  ["the filter label converts its text on the way past",
    "      children: [labelText, control],",
    "      children: [String(labelText), control],"],
  ["the filter label rebuilds its control",
    "      children: [labelText, control],",
    "      children: [labelText, { ...control }],"],
  ["the input converts its attribute value",
    "      attrs: { type, ...attributes },",
    "      attrs: { type: String(type), ...attributes },"],
  ["the input stops letting later attributes win",
    "      attrs: { type, ...attributes },",
    "      attrs: { ...attributes, type },"],
  ["the context picker converts its name",
    '  function createFileContextSelect(datasetKey, name) {\n    return createFilesElement("select", {\n      attrs: { name },',
    '  function createFileContextSelect(datasetKey, name) {\n    return createFilesElement("select", {\n      attrs: { name: String(name) },'],
  ["the context field converts its label",
    '        view.createElement("span", { className: "view-renderer-field-label", text: label }),',
    '        view.createElement("span", { className: "view-renderer-field-label", text: String(label) }),'],
  ["the metadata row converts its key",
    "      dataset: { fileContextMetadataKey: key },",
    "      dataset: { fileContextMetadataKey: String(key) },"],
  ["the metadata row stops normalising a missing value",
    '        view.createElement("dd", { text: metadataText(value) }),',
    '        view.createElement("dd", { text: value }),'],

  // --- the one conversion that was already there --------------------------------------------------
  // Both anchors carry the following line as well. `metadataText` opens with a byte-identical
  // `const text = String(value || "").trim();`, so the bare line is ambiguous and halts the run.
  ["the truncated text converts through a template instead of String",
    '    const text = String(value || "").trim();\n    const span = createFilesElement("span", {',
    "    const text = `${value || \"\"}`.trim();\n    const span = createFilesElement(\"span\", {"],
  ["the truncated text stops treating every falsy value as empty",
    '    const text = String(value || "").trim();\n    const span = createFilesElement("span", {',
    '    const text = String(value ?? "").trim();\n    const span = createFilesElement("span", {'],
  ["the truncated text marks empty content as having a full form",
    "    if (text) {\n      span.dataset.fullText = text;",
    "    if (true) {\n      span.dataset.fullText = text;"],
  ["the class name stops filtering falsy parts",
    '      className: ["files-truncate", className].filter(Boolean).join(" "),',
    '      className: ["files-truncate", className].join(" "),'],

  // --- the marker and the shared funnel -----------------------------------------------------------
  ["the business label stops marking itself",
    '    label.dataset.fileBusinessControl = "";',
    "    label.dataset.fileBusinessControlMissing = \"\";"],
  ["the shared factory stops being required by name",
    '    const view = requireView();\n    requireFilesViewHelper("createElement");\n    return view.createElement(tagName, options);',
    "    const view = requireView();\n    return view.createElement(tagName, options);"],

  // --- the published vocabulary this checkpoint reuses --------------------------------------------
  ["the attrs bag is redeclared locally instead of imported",
    '   * @param {import("../../src/types/browser-contracts.js").BrowserViewAttributeBag} [attributes]',
    "   * @param {Record<string, string>} [attributes]"],
  ["the reason the two dataset keys are strings disappears",
    "   * **`dataKey` is the one parameter here that is genuinely a string**, and not by preference: it",
    "   * The dataKey is a string, it"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-element-builder-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
