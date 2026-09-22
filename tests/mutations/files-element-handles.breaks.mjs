import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `files-element-handle-contracts.test.mjs`.** The narrowings are runtime-inert while
// this file's own builders make what they make, so the cases attack the three things that can
// actually go wrong: a lookup that stops checking, a handle pointed at a subtype its builder never
// produces, and the builder and the declaration drifting apart - which is the failure mode that
// cost `0.33.33.38.3.4` a working page. The last group holds the tooltip's write order.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- a lookup that stops checking, or checks the wrong thing -------------------------------------
  ["the input lookup asserts instead of checking",
    "    return element instanceof HTMLInputElement ? element : null;",
    "    return /** @type {HTMLInputElement | null} */ (element);"],
  ["the input lookup demands a textarea, which this page never builds",
    "    return element instanceof HTMLInputElement ? element : null;",
    "    return element instanceof HTMLTextAreaElement ? element : null;"],
  ["the select lookup stops checking",
    "    return element instanceof HTMLSelectElement ? element : null;",
    "    return element;"],
  ["the button lookup demands an anchor",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return element instanceof HTMLAnchorElement ? element : null;"],
  ["no control is ever accepted",
    "    return element instanceof HTMLSelectElement ? element : null;",
    "    return null;"],

  // --- a handle filled by the wrong lookup ----------------------------------------------------------
  ["the client filter is filled as an input rather than a select",
    'clientFilter = findFilesSelect("[data-file-filter-client]");',
    'clientFilter = findFilesInput("[data-file-filter-client]");'],
  ["the filename filter stops being narrowed at all",
    'filenameFilter = findFilesInput("[data-file-filter-filename]");',
    'filenameFilter = document.querySelector("[data-file-filter-filename]");'],
  ["a handle that needs no subtype is narrowed anyway",
    'fileTableMount = document.querySelector("[data-file-table-mount]");',
    'fileTableMount = findFilesHtmlElement("[data-file-table-mount]");'],

  // --- the builder and the declaration drifting apart -----------------------------------------------
  ["the client filter is built as an input while its handle expects a select",
    '  function createClientSelect() {\n    return createFilesElement("select", {',
    '  function createClientSelect() {\n    return createFilesElement("input", {'],
  ["the load-more control stops being a button",
    '        createFilesElement("button", {\n          attrs: { type: "button" },\n          dataset: { fileLoadMore: "" },',
    '        createFilesElement("a", {\n          attrs: { type: "button" },\n          dataset: { fileLoadMore: "" },'],
  ["the advanced target filters stop being text inputs",
    'createInput("text", "fileFilterTargetId"',
    'createInput("number", "fileFilterTargetId"'],
  ["the filter shell stops being a form",
    '    return createFilesElement("form", {\n      className: "file-filters",',
    '    return createFilesElement("div", {\n      className: "file-filters",'],

  // --- a handle added without a case ------------------------------------------------------------------
  ["a handle is cached without being declared or checked",
    '    loadMoreFilesButton = findFilesButton("[data-file-load-more]");',
    '    loadMoreFilesButton = findFilesButton("[data-file-load-more]");\n'
      + '    fileStatus = document.querySelector("[data-file-status-extra]");'],

  // --- the tooltip's write order --------------------------------------------------------------------
  ["the tooltip is published before it is identified",
    "    tooltip.id = `files-floating-tooltip-${Date.now()}`;\n    activeFilesTooltip = tooltip;",
    "    activeFilesTooltip = tooltip;\n    tooltip.id = `files-floating-tooltip-${Date.now()}`;"],
  ["the tooltip stops being described to its target",
    '    target.setAttribute("aria-describedby", tooltip.id);',
    "    void tooltip.id;"],
  ["the tooltip is never mounted",
    "    document.body.appendChild(tooltip);",
    "    void tooltip;"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/files-element-handle-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
