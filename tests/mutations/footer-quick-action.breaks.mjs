import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Scoped to the decisions, not to the diagnostics.** This checkpoint cleared twenty-seven, and
// nineteen were parameter annotations the compiler proves and a mutation cannot usefully attack.
// What is worth attacking is the four contract decisions - the completed fallback rect, the
// narrowed outside-click target, the extracted script-tag promise and the two `{}`-inferring
// defaults - and the coercions that now stand between a stored quick action and the surfaces
// that render it. The table says so here rather than leaving the absence to be noticed.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- decision one: the completed fallback rect --------------------------------------------------
  ["the fallback rect stops standing at the viewport edge",
    ": { bottom: viewportHeight, top: viewportHeight };",
    ": { bottom: viewportHeight, top: 0 };"],
  ["the fallback rect loses the member the reader asks for",
    ": { bottom: viewportHeight, top: viewportHeight };",
    ": { top: viewportHeight };"],
  ["the visible offset stops being clamped at zero",
    "    const visibleFooterOffset = Math.max(\n      0,",
    "    const visibleFooterOffset = Math.max(\n      -10000,"],

  // --- decision two: the narrowed outside-click target --------------------------------------------
  ["the outside-click target stops being narrowed",
    "      const clickedNode = event.target instanceof Node ? event.target : null;",
    "      const clickedNode = event.target;"],
  ["a click anywhere is treated as a click inside the drawer",
    "root.contains(clickedNode)",
    "clickedNode !== null"],

  // --- decision three: the extracted script-tag promise -------------------------------------------
  ["the script tag is built for the module branch as well",
    "      ? import(key)\n      : appendQuickActionScriptTag(dependency, versionedSrc);",
    "      ? appendQuickActionScriptTag(dependency, versionedSrc)\n      : import(key);"],
  ["the script stops loading in a deterministic order",
    "      script.async = false;",
    "      script.async = true;"],
  ["the load resolution starts carrying the element",
    '      script.addEventListener("load", () => resolve());',
    '      script.addEventListener("load", () => resolve(script));'],
  ["a failed script resolves rather than rejecting",
    '      script.addEventListener("error", () => reject(new Error(`Could not load ${dependency.src}.`)));',
    '      script.addEventListener("error", () => resolve());'],
  ["the script never reaches the document",
    "      document.body.appendChild(script);",
    "      void script;"],

  // --- decision four: the two `{}`-inferring defaults ----------------------------------------------
  ["focus returns to the toggle even when the caller declines it",
    "options.returnFocus !== false",
    "true"],
  ["focus stops returning to the toggle at all",
    "options.returnFocus !== false",
    "options.returnFocus === false"],
  ["the host status channel drops the error flag it was handed",
    "setStatus: (message, options = {}) => setQuickActionStatus(shell.status, message, options.isError),",
    "setStatus: (message, options = {}) => setQuickActionStatus(shell.status, message),"],
  ["the host refresh channel stops carrying the dialog's detail",
    "refresh: (detail) => notifyQuickActionHostRefresh(action, detail),",
    "refresh: (detail) => notifyQuickActionHostRefresh(action),"],

  // --- the coercions that replaced an untyped read -------------------------------------------------
  ["an absent id stops reaching the dataset as the DOM wrote it",
    "    button.dataset.quickActionId = String(action.id);",
    "    button.dataset.quickActionId = action.id;"],
  ["an absent label starts rendering as the word",
    "    label.textContent = footerText(action.label);",
    "    label.textContent = String(action.label);"],
  ["the textContent conversion stops answering null for an absent value",
    '    return value === null || value === undefined ? null : String(value);',
    "    return String(value);"],
  ["the textContent conversion answers nothing for every value",
    '    return value === null || value === undefined ? null : String(value);',
    "    return null;"],
  ["the icon stops falling back when the action names none",
    '      icon: String(action.icon || "add"),',
    "      icon: String(action.icon),"],
  ["an absent label is handed to the icon writer as the word",
    "      label: footerText(action.label) ?? undefined,",
    "      label: String(action.label),"],
  ["a fallback link navigates to the wrong member",
    "      window.location.href = String(action.href);",
    "      window.location.href = String(action.actionType);"],

  // --- the record boundary this file now proves ----------------------------------------------------
  ["a malformed quick action is dropped rather than kept",
    "    return Array.isArray(actions) ? actions.map((entry) => footerRecord(entry) || {}) : [];",
    "    return Array.isArray(actions) ? actions.map((entry) => footerRecord(entry)).filter(Boolean) : [];"],
  ["a malformed quick action reaches the renderer as nothing",
    "actions.map((entry) => footerRecord(entry) || {})",
    "actions.map((entry) => footerRecord(entry))"],
  ["an array is read as a record",
    '    return typeof value === "object" && value !== null && !Array.isArray(value)',
    '    return typeof value === "object" && value !== null'],
  ["the record check stops refusing a primitive",
    '    return typeof value === "object" && value !== null && !Array.isArray(value)',
    "    return value !== null && !Array.isArray(value)"],

  // --- the refresh announcement --------------------------------------------------------------------
  ["a string detail scatters its character indices again",
    "        ...(typeof detail === \"object\" && detail !== null ? detail : {}),",
    "        ...(detail !== null && detail !== undefined ? detail : {}),"],
  ["the dialog's detail stops reaching the announcement",
    "        ...(typeof detail === \"object\" && detail !== null ? detail : {}),",
    "        ...{},"],
  ["the announcement stops preferring the module action id",
    "        actionId: action.moduleActionId || action.id,",
    "        actionId: action.id,"],
  ["the announcement stops naming the registered record type",
    '        recordType: registeredAction?.recordType || "",',
    '        recordType: "",'],

  // --- the activation guards ------------------------------------------------------------------------
  ["a non-string action id is handed to the registry again",
    '    if (action.actionType !== "module-action" || typeof action.moduleActionId !== "string" || !action.moduleActionId) {',
    '    if (action.actionType !== "module-action" || !action.moduleActionId) {'],
  ["an empty action id reaches the registry",
    '    if (action.actionType !== "module-action" || typeof action.moduleActionId !== "string" || !action.moduleActionId) {',
    '    if (action.actionType !== "module-action" || typeof action.moduleActionId !== "string") {'],
  ["the button stays disabled after a failed open",
    "      button.disabled = false;",
    "      void button;"],
  ["the status is not cleared once the dialog settles",
    '      setQuickActionStatus(shell.status, "");',
    "      void shell;"],
];

runMutationCampaign({
  sourcePath: "public/js/footer.js",
  suites: ["tests/unit/footer-quick-action-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
