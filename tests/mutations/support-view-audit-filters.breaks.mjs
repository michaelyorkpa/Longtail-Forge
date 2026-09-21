import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Deliberately small, and honest about why it exists at all.** All eleven diagnostics this
// checkpoint cleared were parameter annotations, and the wire half of this page was already
// validated - so naming the readers changed nothing a mutation can attack. What did gain
// behaviour is the narrowing those annotations required: the controls are proved to be selects,
// and an absent one is refused by name. That, and the refill it guards, is the whole table.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the narrowing the annotations required ---------------------------------------------------
  ["a control that is not a select is accepted",
    "    return element instanceof HTMLSelectElement ? element : null;",
    "    return /** @type {HTMLSelectElement | null} */ (element);"],
  ["no control is ever accepted",
    "    return element instanceof HTMLSelectElement ? element : null;",
    "    return null;"],

  // --- the refusal that replaced a property read -------------------------------------------------
  ["an absent control is skipped instead of refused",
    '    if (!select) {\n      throw new TypeError("The Support View audit page requires its filter controls.");\n    }\n    return select;',
    "    return /** @type {HTMLSelectElement} */ (select);"],
  ["a present control is refused as well",
    "    if (!select) {",
    "    if (true) {"],

  // --- the refill the refusal guards --------------------------------------------------------------
  ["the all-values entry stops coming first",
    "    control.replaceChildren(allOption);",
    "    control.replaceChildren();"],
  ["the all-values entry loses its label",
    "    allOption.textContent = allLabel;",
    '    allOption.textContent = "";'],
  ["an option with no value is offered",
    "      if (!item?.value || !item?.label) {\n        return;\n      }",
    "      if (!item?.label) {\n        return;\n      }"],
  ["an option with no label is offered",
    "      if (!item?.value || !item?.label) {\n        return;\n      }",
    "      if (!item?.value) {\n        return;\n      }"],
  ["every offered option is skipped",
    "      if (!item?.value || !item?.label) {\n        return;\n      }",
    "      if (true) {\n        return;\n      }"],
  ["a non-list of options is walked anyway",
    "    (Array.isArray(options) ? options : []).forEach((item) => {",
    "    (options || []).forEach((item) => {"],
  ["the operator's selection stops being restored",
    "    if ([...control.options].some((option) => option.value === selected)) {\n      control.value = selected;",
    "    if (false) {\n      control.value = selected;"],
  ["a selection the list no longer offers is restored anyway",
    "    if ([...control.options].some((option) => option.value === selected)) {",
    "    if (true) {"],

  // --- the label the audit table renders ------------------------------------------------------------
  ["a filter value stops supplying its own label",
    "      label: formatEnum(item.label || item.value),",
    "      label: formatEnum(item.label),"],
  ["an unreadable value renders blank rather than named",
    '      .join(" ") || "None";',
    '      .join(" ");'],
  ["the audit vocabulary stops splitting on its separators",
    "      .split(/[._:-]/)",
    "      .split(/[.]/)"],

  // --- `0.33.33.38.3.5`: the rest of the page's controls --------------------------------------
  ["a control stops being narrowed to a button",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return element;"],
  ["a control stops being narrowed to an input",
    "    return element instanceof HTMLInputElement ? element : null;",
    "    return element;"],
  ["the page-size control stops being narrowed",
    'const pageSizeSelect = findAuditSelect("[data-support-view-audit-page-size]");',
    'const pageSizeSelect = document.querySelector("[data-support-view-audit-page-size]");'],
  ["an absent control is skipped instead of refused",
    "    if (!control) {\n      throw new TypeError(`The Support View audit page requires its ${name}.`);\n    }\n    return control;",
    "    return control;"],
  ["the results table is emptied through an optional chain",
    '    requireAuditControl(tableBody, "results table").replaceChildren();\n    if (events.length === 0) {',
    "    tableBody?.replaceChildren();\n    if (events.length === 0) {"],
];

runMutationCampaign({
  sourcePath: "public/js/support-view-audit.js",
  suites: ["tests/unit/support-view-audit-filters.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
