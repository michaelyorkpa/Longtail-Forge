import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/dashboard.js";
const suites = ["tests/unit/dashboard-panel-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function dashboardRecord(value) {",
    "  // @ts-expect-error deliberately added\n  function dashboardRecord(value) {"],
  ["a snapshot shape is published to the shared declaration instead",
    "   * @typedef {Record<string, unknown>} DashboardRecord",
    "   * @typedef {import(\"../../src/types/browser-contracts.js\").BrowserDashboardSnapshot} DashboardRecord"],
  ["the registry's values stop being optional, so the renderer guard can never fire",
    "  /** @type {Record<string, DashboardPanelRenderer | undefined>} */",
    "  /** @type {Record<string, DashboardPanelRenderer>} */"],
  ["the renderer guard is dropped",
    "      if (!renderer) {\n        continue;\n      }",
    "      if (false) {\n        continue;\n      }"],

  // --- the wire-record readers ----------------------------------------------------------------------
  ["a primitive is taken as a record",
    "    return typeof value === \"object\" && value !== null && !Array.isArray(value)",
    "    return value !== null && value !== undefined"],
  // **Withdrawn, and inert for a real reason.** Dropping `value !== null` cannot change what this
  // answers: `typeof null === "object"` and `Array.isArray(null)` is false, so the mutated guard
  // admits `null` and then returns it - which is the same `null` the unmutated guard refuses it
  // with. It is not a type-only guard either: removing it moved the file's diagnostics 0 -> 0,
  // because casting `null` to the record type is already permitted. The check states the intent
  // and ships unchanged.
  ["an array is taken as a record",
    "typeof value === \"object\" && value !== null && !Array.isArray(value)",
    "typeof value === \"object\" && value !== null"],
  ["a malformed list entry is dropped instead of drawn with its defaults",
    "    return entries.map((entry) => dashboardRecord(entry) || {});",
    "    return entries.map((entry) => dashboardRecord(entry)).filter(Boolean);"],
  ["a malformed list entry answers null, which the render reads through",
    "    return entries.map((entry) => dashboardRecord(entry) || {});",
    "    return entries.map((entry) => dashboardRecord(entry));"],
  ["a value that is not a list is taken as a one-entry list",
    "    const entries = Array.isArray(value) ? value : [];",
    "    const entries = Array.isArray(value) ? value : [value];"],
  ["a value that is not a list of actions is passed to the factory anyway",
    "    return Array.isArray(value) ? value : [];",
    "    return value;"],
  ["the action list is rebuilt rather than passed through",
    "    return Array.isArray(value) ? value : [];",
    "    return Array.isArray(value) ? [...value] : [];"],

  // --- the layout regions ------------------------------------------------------------------------------
  ["the regions are read off the snapshot root rather than the layout",
    "    return dashboardRecordList(dashboardRecord(dashboardData?.layout)?.regions);",
    "    return dashboardRecordList(dashboardData?.regions);"],
  ["a layout that is not a record is read through anyway",
    "    return dashboardRecordList(dashboardRecord(dashboardData?.layout)?.regions);",
    "    return dashboardRecordList(dashboardData?.layout);"],
  ["the region label stops being trimmed",
    "    return String(regions.find((region) => normalizeDashboardPlacement(region.id) === regionId)?.label || \"\").trim();",
    "    return String(regions.find((region) => normalizeDashboardPlacement(region.id) === regionId)?.label || \"\");"],
  ["the declared region id stops being normalized before the comparison",
    "regions.find((region) => normalizeDashboardPlacement(region.id) === regionId)",
    "regions.find((region) => region.id === regionId)"],
  ["the label of the wrong region is answered",
    "regions.find((region) => normalizeDashboardPlacement(region.id) === regionId)?.label",
    "regions[0]?.label"],

  // --- the placements -------------------------------------------------------------------------------------
  ["an unknown placement is kept instead of falling back to main",
    "    return KNOWN_DASHBOARD_PLACEMENTS.has(value) ? value : \"main\";",
    "    return value || \"main\";"],
  ["a known placement is replaced by main anyway",
    "    return KNOWN_DASHBOARD_PLACEMENTS.has(value) ? value : \"main\";",
    "    return \"main\";"],
  ["a placement stops being trimmed before it is recognised",
    "    const value = String(placement || \"\").trim();",
    "    const value = String(placement || \"\");"],

  // --- the rendered panels -----------------------------------------------------------------------------------
  ["a falsy render answers a one-entry list",
    "    if (!rendered) {\n      return [];\n    }",
    "    if (!rendered) {\n      return [rendered];\n    }"],
  ["a list of panels stops dropping its blanks",
    "    return Array.isArray(rendered) ? rendered.filter(Boolean) : [rendered];",
    "    return Array.isArray(rendered) ? rendered : [rendered];"],
  ["a single panel is spread rather than wrapped",
    "    return Array.isArray(rendered) ? rendered.filter(Boolean) : [rendered];",
    "    return Array.isArray(rendered) ? rendered.filter(Boolean) : [];"],
  ["a value the DOM would have rejected is appended silently",
    "    if (!(value instanceof Node)) {\n      throw new TypeError(\"A dashboard panel renderer must return nodes.\");\n    }",
    "    if (false) {\n      throw new TypeError(\"A dashboard panel renderer must return nodes.\");\n    }"],
  ["only elements are accepted, so a text node a renderer returned is refused",
    "    if (!(value instanceof Node)) {",
    "    if (!(value instanceof HTMLElement)) {"],

  // --- the renderer registry -------------------------------------------------------------------------------------
  ["an untrimmed identifier is registered",
    "    const normalizedRendererId = String(rendererId || \"\").trim();",
    "    const normalizedRendererId = String(rendererId || \"\");"],
  ["an empty identifier is registered",
    "    if (!normalizedRendererId || typeof renderer !== \"function\") {",
    "    if (typeof renderer !== \"function\") {"],
  ["a renderer that is not callable is registered",
    "    if (!normalizedRendererId || typeof renderer !== \"function\") {",
    "    if (!normalizedRendererId) {"],
  ["a late registration stops re-rendering, so its panel never appears",
    "    if (dashboardData) {\n      renderRegisteredDashboardPanels();\n    }",
    "    if (false) {\n      renderRegisteredDashboardPanels();\n    }"],
  ["an early registration re-renders before there is anything to draw",
    "    if (dashboardData) {\n      renderRegisteredDashboardPanels();\n    }",
    "    renderRegisteredDashboardPanels();"],

  // --- the contribution lookup ----------------------------------------------------------------------------------------
  ["the renderer is coerced rather than compared",
    "      panel.renderer === renderer &&",
    "      String(panel.renderer) === String(renderer) &&"],
  ["the id stops narrowing the match",
    "      (!id || panel.id === id)",
    "      (!id || true)"],
  ["an absent id is taken as a required one, so no contribution is found",
    "      (!id || panel.id === id)",
    "      (panel.id === id)"],

  // --- the contribution data ---------------------------------------------------------------------------------------------
  ["a contribution that is not a record is read through anyway",
    "    const route = String(dashboardRecord(contribution)?.dataRoute || fallbackRoute || \"\").trim();",
    "    const route = String(contribution || fallbackRoute || \"\").trim();"],
  ["the fallback route stops being used",
    "String(dashboardRecord(contribution)?.dataRoute || fallbackRoute || \"\").trim()",
    "String(dashboardRecord(contribution)?.dataRoute || \"\").trim()"],
  ["a route stops being trimmed, so the same panel is requested twice",
    "    const route = String(dashboardRecord(contribution)?.dataRoute || fallbackRoute || \"\").trim();",
    "    const route = String(dashboardRecord(contribution)?.dataRoute || fallbackRoute || \"\");"],
  ["an empty route is requested rather than answered empty",
    "    if (!route) {\n      return {};\n    }",
    "    if (false) {\n      return {};\n    }"],
  ["a route already in flight is requested again",
    "    if (!dashboardDataPromises.has(route)) {",
    "    if (true) {"],
  ["the published loader is bypassed for this page's own fetch",
    "        typeof loadRoute === \"function\"\n          ? loadRoute(route)\n          : requireApi().getJson(route, { cache: \"no-store\" }),",
    "        requireApi().getJson(route, { cache: \"no-store\" }),"],
  ["a published loader that is not callable is called anyway",
    "        typeof loadRoute === \"function\"\n          ? loadRoute(route)",
    "        loadRoute\n          ? loadRoute(route)"],
  ["the panel request stops bypassing the cache",
    "          : requireApi().getJson(route, { cache: \"no-store\" }),",
    "          : requireApi().getJson(route),"],

  // --- the status line -------------------------------------------------------------------------------------------------------
  ["an error is announced with the informational tone",
    "    dashboardStatus.dataset.viewTone = options.isError ? \"danger\" : \"info\";",
    "    dashboardStatus.dataset.viewTone = \"info\";"],
  ["an error stops being announced assertively",
    "    dashboardStatus.setAttribute(\"aria-live\", options.isError ? \"assertive\" : \"polite\");",
    "    dashboardStatus.setAttribute(\"aria-live\", \"polite\");"],
  ["an error is given the status role rather than the alert role",
    "    dashboardStatus.setAttribute(\"role\", options.isError ? \"alert\" : \"status\");",
    "    dashboardStatus.setAttribute(\"role\", \"status\");"],
  ["a cleared message leaves the status line visible",
    "    dashboardStatus.hidden = !message;",
    "    dashboardStatus.hidden = false;"],
  // **Withdrawn, and inert for a real reason.** Reading the visibility off the coerced text agrees
  // with reading it off the value for every message a caller can pass: the coercion only sees the
  // value after `|| ""`, so `0`, `""` and `undefined` all reach `""` and hide the line exactly as
  // `!message` does. The one value that separates them is an empty array - truthy, but coercing to
  // `""` - which no caller produces. The claim this checkpoint makes about `0` is asserted in the
  // suite and holds under both spellings.
  ["the missing status line stops being tolerated",
    "    if (!dashboardStatus) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],

  // --- the region empty state -------------------------------------------------------------------------------------------------------
  ["this page's copy wins over the descriptor the snapshot carried",
    "      title: emptyState?.title || fallback.title || \"Nothing to show yet\",",
    "      title: fallback.title || emptyState?.title || \"Nothing to show yet\","],
  ["the descriptor's message stops being preferred",
    "      message: emptyState?.message || fallback.message || \"More context will appear here when it is available.\",",
    "      message: fallback.message || \"More context will appear here when it is available.\","],
  ["the descriptor's actions stop reaching the factory",
    "      actions: dashboardActionInput(emptyState?.actions),",
    "      actions: [],"],
  ["the empty state stops being a subheading",
    "      headingLevel: 3,",
    "      headingLevel: 2,"],
  ["this page's class name stops reaching the empty state",
    "      className: fallback.className || \"\",",
    "      className: \"\","],
  ["an absent descriptor is read through rather than around",
    "      title: emptyState?.title || fallback.title || \"Nothing to show yet\",",
    "      title: emptyState.title || fallback.title || \"Nothing to show yet\","],

  // --- the panel ------------------------------------------------------------------------------------------------------------------------
  ["the renderer's class name stops reaching the panel",
    "      className: [\"dashboard-panel\", \"surface-main-panel\", options.className],",
    "      className: [\"dashboard-panel\", \"surface-main-panel\"],"],
  ["a contribution with no id is given an empty panel id",
    "        ...(contribution?.id ? { \"data-dashboard-panel-id\": contribution.id } : {}),",
    "        \"data-dashboard-panel-id\": contribution?.id,"],
  ["a contribution with no module id is given an empty one",
    "        ...(contribution?.moduleId ? { moduleId: contribution.moduleId } : {}),",
    "        moduleId: contribution?.moduleId,"],
  ["the placement stops being normalized onto the panel",
    "        \"data-dashboard-placement\": normalizeDashboardPlacement(contribution?.placement),",
    "        \"data-dashboard-placement\": contribution?.placement,"],
  ["a title stops being trimmed before it is compared to the region heading",
    "    const title = String(options.title || \"\").trim();",
    "    const title = String(options.title || \"\");"],
  ["a title that repeats the region heading is drawn as a heading anyway",
    "    if (title && title === dashboardRegionLabel(normalizeDashboardPlacement(contribution?.placement))) {",
    "    if (false) {"],
  ["a title that repeats the region heading loses its accessible name entirely",
    "      if (!options.ariaLabel) {\n        panel.setAttribute(\"aria-label\", title);\n      }",
    "      if (false) {\n        panel.setAttribute(\"aria-label\", title);\n      }"],
  ["the renderer's own accessible name is overwritten by the repeated title",
    "      if (!options.ariaLabel) {\n        panel.setAttribute(\"aria-label\", title);\n      }",
    "      panel.setAttribute(\"aria-label\", title);"],
  ["a blank title draws an empty heading",
    "    } else if (title) {",
    "    } else {"],
  ["a single child stops being accepted",
    "    panel.append(...(Array.isArray(options.children) ? options.children : [options.children]).filter(Boolean));",
    "    panel.append(...(Array.isArray(options.children) ? options.children : []).filter(Boolean));"],
  ["a list of children stops dropping its blanks",
    "    panel.append(...(Array.isArray(options.children) ? options.children : [options.children]).filter(Boolean));",
    "    panel.append(...(Array.isArray(options.children) ? options.children : [options.children]));"],

  // --- the snapshot the page keeps -------------------------------------------------------------------------------------------------------------
  ["the snapshot branch is read off the wrong member",
    "    dashboardPanels = dashboardRecordList(extensionPoints?.dashboardPanels);",
    "    dashboardPanels = dashboardRecordList(extensionPoints?.browserAssets);"],
  ["the contribution list stops being read as a list",
    "    dashboardPanels = dashboardRecordList(extensionPoints?.dashboardPanels);",
    "    dashboardPanels = [];"],
  ["the warnings are read off the wrong branch",
    "    const warnings = dashboardRecordList(dashboardData?.setupWarnings);",
    "    const warnings = dashboardRecordList(dashboardData?.moduleOverview);"],
  ["the pulse signals are read off the wrong branch",
    "    const signals = dashboardRecordList(pulse.signals);",
    "    const signals = dashboardRecordList(pulse.primaryAction);"],
  ["the body is rebuilt rather than kept by identity",
    "    dashboardData = dashboardRecord(data);",
    "    dashboardData = { ...dashboardRecord(data) };"],
  ["the panel is appended without a region to hold it",
    "      renderedPanels.forEach((panel) => target?.body.appendChild(requireDashboardPanelNode(panel)));",
    "      renderedPanels.forEach((panel) => target.body.appendChild(requireDashboardPanelNode(panel)));"],
  ["a panel with an unplaced contribution stops falling back to the main region",
    "      const target = dashboardRegionBodies.get(normalizeDashboardPlacement(contribution.placement)) ||\n        dashboardRegionBodies.get(\"main\");",
    "      const target = dashboardRegionBodies.get(normalizeDashboardPlacement(contribution.placement));"],
  ["the whole-dashboard empty state stops being drawn",
    "    if (visibleRegionCount === 0) {",
    "    if (false) {"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
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
