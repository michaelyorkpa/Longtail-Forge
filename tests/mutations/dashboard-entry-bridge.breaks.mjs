import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Scoped to the two record proofs and the refusals they sit beside.** Thirteen of the fifteen
// diagnostics were parameter annotations the compiler proves, and the signatures came from the
// published contracts rather than from a choice made here. What is worth attacking is the
// narrowing this checkpoint added, and the origin and extension refusals the bridge exists to
// make - unchanged, but newly declared, and the kind of thing that must not quietly drift.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the record proof this checkpoint added ------------------------------------------------------
  ["a non-record descriptor stops answering the empty route",
    "    ? /** @type {Record<string, unknown>} */ (value)\n    : {};",
    "    ? /** @type {Record<string, unknown>} */ (value)\n    : /** @type {Record<string, unknown>} */ ({ dataRoute: \"/api/leaked\" });"],
  ["an array is read as a descriptor",
    '  return typeof value === "object" && value !== null && !Array.isArray(value)',
    '  return typeof value === "object" && value !== null',
  ],
  ["the panel descriptor stops being proved",
    "  const descriptor = dashboardRecord(panel);",
    "  const descriptor = /** @type {Record<string, unknown>} */ ({});"],
  ["the manifest's panel list stops being reached",
    "  const panels = dashboardRecord(dashboardRecord(data).extensionPoints).dashboardPanels;",
    "  const panels = dashboardRecord(data).dashboardPanels;"],
  ["the warm-up stops answering the manifest it was given",
    "  return data;\n}",
    "  return undefined;\n}"],

  // --- the asset refusals the bridge exists to make ---------------------------------------------------
  ["an off-origin asset is accepted",
    "  if (url.origin !== window.location.origin || !/^\\/(?:css|js)\\//.test(url.pathname)) {",
    "  if (!/^\\/(?:css|js)\\//.test(url.pathname)) {"],
  ["an asset outside the two directories is accepted",
    "  if (url.origin !== window.location.origin || !/^\\/(?:css|js)\\//.test(url.pathname)) {",
    "  if (url.origin !== window.location.origin) {"],
  ["every asset is refused",
    "  if (url.origin !== window.location.origin || !/^\\/(?:css|js)\\//.test(url.pathname)) {",
    "  if (true) {"],
  ["the version stamp stops being applied",
    '    url.searchParams.set("v", version);',
    "    void version;"],
  // Anchored on the `const version` opening, because `dashboardAssetVersion` reads the same
  // pair and the runner requires an anchor that appears exactly once.
  ["the namespace version stops being preferred over the meta tag",
    "  const version = String(\n    namespace.assetVersion?.value ||",
    "  const version = String(\n    undefined ||"],

  // --- the calendar range the panel route folds in -----------------------------------------------------
  ["the day view stops spanning a single date",
    "    const day = dashboardDateKey(anchor);\n    return { start: day, end: day };",
    "    const day = dashboardDateKey(anchor);\n    return { start: day, end: dashboardDateKey(dashboardAddDays(anchor, 1)) };"],
  ["the week stops being anchored to its Sunday",
    "anchor.getDate() - anchor.getDay()",
    "anchor.getDate()"],
  ["the month stops padding back to a whole week",
    "  const start = dashboardAddDays(monthStart, -monthStart.getDay());",
    "  const start = monthStart;"],
  ["the month stops padding forward to a whole week",
    "  const end = dashboardAddDays(monthEnd, 6 - monthEnd.getDay());",
    "  const end = monthEnd;"],
  ["a date key loses its zero padding",
    '  const month = String(date.getMonth() + 1).padStart(2, "0");',
    "  const month = String(date.getMonth() + 1);"],
  ["the active statuses stop being requested",
    '    statuses: "open,in_progress,blocked",',
    '    statuses: "",'],
  ["a stored calendar preference is ignored",
    '  const view = ["day", "week", "month"].includes(preferred)\n    ? preferred',
    "  const view = false\n    ? preferred"],
  ["an unsupported stored preference is trusted",
    '  const view = ["day", "week", "month"].includes(preferred)\n    ? preferred',
    "  const view = true\n    ? preferred"],

  // --- the memoized route reads -------------------------------------------------------------------------
  ["a route is requested again on every read",
    "  if (!dashboardDataPromises.has(route)) {",
    "  if (true) {"],
  ["an empty route reaches the API",
    '  if (!route) {\n    return Promise.resolve({});\n  }',
    "  if (false) {\n    return Promise.resolve({});\n  }"],

  // --- `0.33.33.38.3.8`: the asset-version member read --------------------------------------------
  //
  // The two reads are narrowed by member read rather than `instanceof`, because `versionedAssetUrl`
  // is lifted into a bare `vm` context and may name no free variable. The first case is the one
  // that matters: it proves the constraint is real rather than asserted, by making the read name a
  // DOM constructor the sandbox does not define.
  ["the lifted reader names a DOM constructor the sandbox cannot supply",
    'Reflect.get(Object(document.querySelector("meta[data-asset-version]")), "content") ||\n    "",\n  ).trim();',
    '(document.querySelector("meta[data-asset-version]") instanceof HTMLMetaElement\n'
      + '      ? document.querySelector("meta[data-asset-version]").content\n'
      + '      : "") ||\n    "",\n  ).trim();'],
  ["the absent meta element stops being absorbed",
    'Reflect.get(Object(document.querySelector("meta[data-asset-version]")), "content") ||\n    "",\n  ).trim();',
    'Reflect.get(document.querySelector("meta[data-asset-version]"), "content") ||\n    "",\n  ).trim();'],
  ["the asset version stops being read from the meta element at all",
    'Reflect.get(Object(document.querySelector("meta[data-asset-version]")), "content") ||\n    "",\n  ).trim();',
    '"",\n  ).trim();'],
];

runMutationCampaign({
  sourcePath: "public/js/dashboard.entry.js",
  suites: [
    "tests/unit/dashboard-entry-bridge.test.mjs",
    "tests/unit/remaining-page-control-narrowing.test.mjs",
  ],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
