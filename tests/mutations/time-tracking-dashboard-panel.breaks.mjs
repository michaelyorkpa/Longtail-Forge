import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-tracking-dashboard.js";
const suites = ["tests/unit/time-tracking-dashboard-panel-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function timeTrackingRecord(value) {",
    "  // @ts-expect-error deliberately added\n  function timeTrackingRecord(value) {"],
  ["a document query appears in the renderer",
    "  function timeTrackingRecord(value) {",
    '  function panelNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function timeTrackingRecord(value) {'],
  ["a summary shape is published to the shared declaration instead",
    "   * @typedef {Record<string, unknown>} TimeTrackingRecord",
    '   * @typedef {import("../../src/types/browser-contracts.js").BrowserTimeTrackingEffortSummary} TimeTrackingRecord'],
  ["a currency formatter is introduced",
    "  /** @param {unknown} seconds */\n  function formatHours(seconds) {",
    "  function formatCurrency(amount) {\n    return String(amount);\n  }\n\n  /** @param {unknown} seconds */\n  function formatHours(seconds) {"],
  ["the host context is cast rather than checked",
    '    if (!context || typeof context.createPanel !== "function" || !context.view) {\n      throw new TypeError("Time Tracking dashboard panels require the host\'s view factory and panel builder.");\n    }',
    "    if (false) {\n      throw new TypeError(\"unreachable\");\n    }"],
  ["the panel builder stops being checked as callable",
    '    if (!context || typeof context.createPanel !== "function" || !context.view) {',
    "    if (!context || !context.view) {"],
  ["the view factory stops being checked",
    '    if (!context || typeof context.createPanel !== "function" || !context.view) {',
    '    if (!context || typeof context.createPanel !== "function") {'],

  // --- the wire readers ----------------------------------------------------------------------
  ["a primitive is taken as a record",
    '    return typeof value === "object" && value !== null && !Array.isArray(value)',
    "    return value !== null && value !== undefined"],
  ["an array is taken as a record",
    'typeof value === "object" && value !== null && !Array.isArray(value)',
    'typeof value === "object" && value !== null'],
  ["a malformed row is dropped instead of drawn with its fallbacks",
    "    return entries.map((entry) => timeTrackingRecord(entry) || {});",
    "    return entries.map((entry) => timeTrackingRecord(entry)).filter(Boolean);"],
  ["a value that is not a list becomes a one-entry list",
    "    const entries = Array.isArray(value) ? value : [];\n    return entries.map((entry) => timeTrackingRecord(entry) || {});",
    "    const entries = Array.isArray(value) ? value : [value];\n    return entries.map((entry) => timeTrackingRecord(entry) || {});"],

  // --- the two panels -------------------------------------------------------------------------
  ["the active timers panel loses its title fallback",
    '      title: contribution.label || "Active Timers",',
    "      title: contribution.label,"],
  ["the recent time panel loses its title fallback",
    '      title: contribution.label || "Recent Time",',
    "      title: contribution.label,"],
  ["the two panels are titled the same way",
    '      title: contribution.label || "Recent Time",',
    '      title: contribution.label || "Active Timers",'],
  ["a contribution that is not a record is read through anyway",
    "  function renderRecentTimePanel(contributionValue, contextValue) {\n    const contribution = timeTrackingRecord(contributionValue) || {};",
    "  function renderRecentTimePanel(contributionValue, contextValue) {\n    const contribution = contributionValue || {};"],
  ["the active timers panel hydrates with the recent time content",
    "    hydrateTimeTrackingPanel(body, contribution, context, createActiveTimersContent);",
    "    hydrateTimeTrackingPanel(body, contribution, context, createRecentTimeContent);"],
  ["the recent time panel hydrates with the active timers content",
    "    hydrateTimeTrackingPanel(body, contribution, context, createRecentTimeContent);",
    "    hydrateTimeTrackingPanel(body, contribution, context, createActiveTimersContent);"],
  ["the loading body stops announcing itself",
    '      attrs: { role: "status" },',
    "      attrs: {},"],
  ["the loading body loses its message",
    '  function createPanelBody(context, message) {\n    return context.view.createElement("div", {\n      className: "dashboard-panel-body",\n      attrs: { role: "status" },\n      text: message,',
    '  function createPanelBody(context, message) {\n    return context.view.createElement("div", {\n      className: "dashboard-panel-body",\n      attrs: { role: "status" },\n      text: "",'],

  // --- hydration ------------------------------------------------------------------------------
  ["a failed summary leaves the loading message in place",
    '      renderError(body, context, "Time Tracking summary could not be loaded.");',
    ""],
  ["the failure message stops naming what could not be loaded",
    '      renderError(body, context, "Time Tracking summary could not be loaded.");',
    '      renderError(body, context, "");'],
  ["the failure state loses its own title",
    '      title: "Time Tracking data unavailable",',
    '      title: "",'],
  ["a summary that is not a record is handed on raw",
    "      const data = timeTrackingRecord(await loadEffortSummary(contribution)) || {};",
    "      const data = await loadEffortSummary(contribution);"],
  ["the rendered content stops replacing the loading body",
    "      body.replaceChildren(renderContent(data, context));",
    "      renderContent(data, context);"],

  // --- effort summary loading -------------------------------------------------------------------
  ["a route already in flight is requested again",
    "    if (!effortSummaryPromises.has(route)) {",
    "    if (true) {"],
  ["the contribution's own route stops being used",
    "    const route = String(contribution?.dataRoute || DEFAULT_EFFORT_SUMMARY_ROUTE);",
    "    const route = DEFAULT_EFFORT_SUMMARY_ROUTE;"],
  ["a contribution with no route loses the module's own",
    "    const route = String(contribution?.dataRoute || DEFAULT_EFFORT_SUMMARY_ROUTE);",
    "    const route = String(contribution?.dataRoute);"],
  ["the shared promise is keyed by something other than the route",
    "      effortSummaryPromises.set(route, contextLoad(route));",
    '      effortSummaryPromises.set("effort", contextLoad(route));'],
  ["the published loader is bypassed for this page's own fetch",
    '    return typeof loadRoute === "function"\n      ? loadRoute(route)\n      : requireApi().getJson(route, { cache: "no-store" });',
    '    return requireApi().getJson(route, { cache: "no-store" });'],
  ["a published loader that is not callable is called anyway",
    '    return typeof loadRoute === "function"\n      ? loadRoute(route)',
    "    return loadRoute\n      ? loadRoute(route)"],
  ["the summary request stops bypassing the cache",
    '      : requireApi().getJson(route, { cache: "no-store" });',
    "      : requireApi().getJson(route);"],

  // --- the metric strips --------------------------------------------------------------------------
  ["an absent active-timer count stops falling back to zero",
    '          { label: "Active/paused", value: activeTimers.count || 0 },',
    '          { label: "Active/paused", value: activeTimers.count },'],
  ["the running and paused counts are swapped",
    '          { label: "Running", value: activeTimers.runningCount || 0 },\n          { label: "Paused", value: activeTimers.pausedCount || 0 },',
    '          { label: "Running", value: activeTimers.pausedCount || 0 },\n          { label: "Paused", value: activeTimers.runningCount || 0 },'],
  ["a metric loses its label fallback",
    '          context.view.createElement("span", { text: metric.label || "Metric" }),',
    '          context.view.createElement("span", { text: metric.label }),'],
  ["a metric with no value stops showing zero",
    '          context.view.createElement("strong", { text: String(metric.value ?? 0) }),',
    "          context.view.createElement(\"strong\", { text: String(metric.value) }),"],
  // WITHDRAWN: "a metric value of zero is replaced by the fallback" - `String(metric.value ?? 0)`
  // to `String(metric.value || 0)`. The two answer the same string for every metric this file
  // builds. `??` and `||` differ only for a value that is falsy but not nullish, and both content
  // builders already read each count through their own `|| 0`, so `""`, `false` and `NaN` become
  // `0` before the strip ever sees them; `0` itself takes the same fallback either way. The one
  // remaining route is a published `formatters.hours` answering `""` - and there the *unmutated*
  // spelling is the one that draws a blank, so pinning it would pin a degradation.

  ["the recent-time window loses its default",
    "    const windowDays = Number(recentTime.windowDays) || 7;",
    "    const windowDays = Number(recentTime.windowDays);"],
  ["the recent-time window stops naming its length",
    '          { label: `Last ${windowDays} days`, value: formatHours(recentTime.totalSeconds || 0) },',
    '          { label: "Recent", value: formatHours(recentTime.totalSeconds || 0) },'],
  ["the recent totals and today figures are swapped",
    '          { label: `Last ${windowDays} days`, value: formatHours(recentTime.totalSeconds || 0) },\n          { label: "Today", value: formatHours(recentTime.todaySeconds || 0) },',
    '          { label: `Last ${windowDays} days`, value: formatHours(recentTime.todaySeconds || 0) },\n          { label: "Today", value: formatHours(recentTime.totalSeconds || 0) },'],
  ["the entry count stops falling back to zero",
    '          { label: "Entries", value: recentTime.entriesCount || 0 },',
    '          { label: "Entries", value: recentTime.entriesCount },'],
  ["a summary branch that is not a record is read through anyway",
    "    const recentTime = timeTrackingRecord(data?.recentTime) || {};",
    "    const recentTime = data?.recentTime || {};"],

  // --- the row list ---------------------------------------------------------------------------------
  ["an empty list is drawn instead of saying there is nothing",
    '    if (rows.length === 0) {\n      return context.view.createElement("p", {\n        className: "dashboard-task-empty",\n        text: emptyMessage,\n      });\n    }',
    "    if (false) {\n      return context.view.createElement(\"p\", {\n        className: \"dashboard-task-empty\",\n        text: emptyMessage,\n      });\n    }"],
  ["the empty message stops being shown",
    "        className: \"dashboard-task-empty\",\n        text: emptyMessage,",
    '        className: "dashboard-task-empty",\n        text: "",'],
  ["a populated list is replaced by the empty message",
    "    if (rows.length === 0) {",
    "    if (true) {"],
  ["only the first row is drawn",
    "      children: rows.map((row) => createTimeTrackingRow(context, row)),",
    "      children: [createTimeTrackingRow(context, rows[0])],"],

  // --- the row ---------------------------------------------------------------------------------------
  ["a row loses its title fallback",
    '                  text: row.title || "Time Tracking item",',
    "                  text: row.title,"],
  ["a row with no status is badged anyway",
    '                row.status ? context.view.createElement("span", {\n                  className: "dashboard-task-row-badge",\n                  text: row.status,\n                }) : null,',
    '                context.view.createElement("span", {\n                  className: "dashboard-task-row-badge",\n                  text: row.status,\n                }),'],
  ["a row with a status loses its badge",
    "                row.status ? context.view.createElement(\"span\", {",
    "                false ? context.view.createElement(\"span\", {"],
  ["the meta line stops dropping the labels a row does not carry",
    "    ].filter(Boolean);",
    "    ];"],
  ["the elapsed label stops falling back to a duration label",
    "      row.elapsedLabel || row.durationLabel,",
    "      row.elapsedLabel,"],
  ["the meta line loses its source label",
    "      row.sourceLabel,\n      row.contextLabel,",
    "      row.contextLabel,"],
  ["the meta line loses its context label",
    "      row.sourceLabel,\n      row.contextLabel,",
    "      row.sourceLabel,"],
  ["the meta line loses its end time",
    "      row.endedAtLabel,\n    ].filter(Boolean);",
    "    ].filter(Boolean);"],
  ["a row with no destination is linked anyway",
    '        action.href ? context.view.createElement("a", {',
    '        true ? context.view.createElement("a", {'],
  ["a row with a destination loses its link",
    '        action.href ? context.view.createElement("a", {',
    '        false ? context.view.createElement("a", {'],
  ["a row link loses its label fallback",
    '          attrs: { href: action.href },\n          text: action.label || "Open",\n        }) : null,\n      ].filter(Boolean),\n    });\n  }',
    '          attrs: { href: action.href },\n          text: action.label,\n        }) : null,\n      ].filter(Boolean),\n    });\n  }'],
  ["a row action that is not a record is read through anyway",
    "    const action = timeTrackingRecord(row.action) || {};",
    "    const action = row.action || {};"],

  // --- the action row ---------------------------------------------------------------------------------
  ["an action with no destination is offered anyway",
    "    const availableActions = actions.filter((action) => action?.href);",
    "    const availableActions = actions;"],
  ["no action row is drawn even when one can be offered",
    "    if (availableActions.length === 0) {\n      return null;\n    }",
    "    return null;\n    if (availableActions.length === 0) {\n      return null;\n    }"],
  ["an empty action row is drawn",
    "    if (availableActions.length === 0) {\n      return null;\n    }",
    "    if (false) {\n      return null;\n    }"],
  ["an action loses its label fallback",
    '        attrs: { href: action.href },\n        text: action.label || "Open",\n      })),',
    '        attrs: { href: action.href },\n        text: action.label,\n      })),'],
  ["the active timers action stops being offered",
    "        createActionRow(context, timeTrackingRecordList([activeTimers.action])),",
    "        createActionRow(context, []),"],
  ["the recent time actions stop being offered",
    "        createActionRow(context, timeTrackingRecordList(recentTime.actions)),",
    "        createActionRow(context, []),"],

  // --- hours -------------------------------------------------------------------------------------------
  ["the shared formatter stops being preferred",
    '    return typeof formatters?.hours === "function"\n      ? formatters.hours(seconds)',
    "    return false\n      ? formatters.hours(seconds)"],
  ["a formatter that is not callable is called anyway",
    '    return typeof formatters?.hours === "function"',
    "    return formatters?.hours"],
  ["an unreadable duration stops falling back to zero hours",
    "      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;",
    "      : `${(Number(seconds) / 3600).toFixed(2)} hrs`;"],
  ["hours lose their two-decimal precision",
    "      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;",
    "      : `${((Number(seconds) || 0) / 3600).toFixed(0)} hrs`;"],
  ["seconds are reported as hours without conversion",
    "      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;",
    "      : `${(Number(seconds) || 0).toFixed(2)} hrs`;"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    // **Bounded, because a mutation can break a page by not terminating.** `0.33.33.44.33` lost
    // forty minutes to an unbounded run when a removed loop guard made a lifted walk loop forever.
    // A timeout is a refusal - the suite did not pass - reported as its own kind so the reader
    // knows the mutation hung rather than failed an assertion.
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true, timeout: 120000, killSignal: "SIGKILL",
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
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
