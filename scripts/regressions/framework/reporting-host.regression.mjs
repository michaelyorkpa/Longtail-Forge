export const regressionMeta = Object.freeze({
  id: "framework.reporting-host",
  area: "framework",
  tier: "focused",
  tags: ["browser", "catalog", "reporting", "views"],
  description: "Proves the minimal catalog-driven Reporting host, metadata filters, allowed renderer loading, and Time Tracking-owned hierarchical result renderer.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const readText = (path) => readFileSync(new URL(path, new URL("../../../", import.meta.url)), "utf8");
const reportingHtml = readText("views/protected/reporting.html");
const reportingHost = readText("public/js/reporting.js");
const timeTrackingRenderer = readText("public/js/time-tracking-reporting.js");
const css = readText("public/css/longtail-forge.css");

assert.ok(root, "repository root must resolve");
assert.match(reportingHtml, /<main class="wide-page" data-reporting-host><\/main>/);
assert.match(reportingHtml, /js\/shared\/tags\.js[\s\S]*js\/reporting\.js/, "Reporting should load the shared tag-picker helper before the framework host");
assert.match(reportingHtml, /js\/shared\/view-builder\.js[\s\S]*js\/reporting\.js/);
assert.doesNotMatch(
  reportingHtml,
  /data-report-(?:period|client|projects|tag|table)|<h1>|<table|time-tracking-reporting/,
  "Reporting HTML must remain a minimal framework host without report-specific anatomy or assets",
);

for (const primitive of [
  "createPageHeader",
  "createInfoPanel",
  "createField",
  "createFieldGrid",
  "createFilterPanel",
  "createStatusMessage",
  "createListShell",
  "createEmptyState",
]) {
  assert.match(reportingHost, new RegExp(`reportingView\\.${primitive}\\(`), `Reporting host must use ${primitive}`);
}

assert.match(reportingHost, /fetch\("\/api\/reporting\/catalog"/);
assert.match(reportingHost, /reports\.find\(\(report\) => report\.reportKey === requestedReportKey\)[\s\S]*reports\[0\]/);
assert.match(reportingHost, /loadRendererAssets\(report\.rendererAssets \|\| \[\]\)/);
assert.match(reportingHost, /reportRenderers\.get\(report\.renderer\)/);
assert.match(reportingHost, /registerRenderer[\s\S]*reportRenderers\.set/);
assert.match(reportingHost, /filter\.type === "custom-date-range"[\s\S]*createCustomDateRangeField/);
assert.match(reportingHost, /filter\.type === "project-multi-select"[\s\S]*\? "multi-select"/);
assert.match(reportingHost, /filter\.type === "tag"[\s\S]*\? "text"/, "tag metadata should render a typable input rather than a select");
assert.match(reportingHost, /tags\?\.mountFilterPicker\?\.\(control,[\s\S]*tagFilterController/, "Reporting tag filters should mount the shared searchable picker");
assert.match(reportingHost, /tagFilterController\?\.readValue[\s\S]*value !== "all"/, "Reporting should submit the picker's canonical selected tag value while omitting All tags");
assert.match(reportingHost, /field\.tagFilterController\.setTags\(tags\)[\s\S]*field\.tagFilterController\.setValue\(requestedValue\)/, "renderer-supplied tag options should hydrate the shared picker without losing the requested selection");
assert.match(reportingHost, /createDateField[\s\S]*reportingView\.createField\(\{/);
assert.match(reportingHost, /function updateConditionalFilterVisibility\(\)/);
assert.match(reportingHost, /field\.filter\.visibleWhen/);
assert.match(reportingHost, /handleReportFilterChange[\s\S]*executeSelectedReport/);
assert.match(reportingHost, /encodeURIComponent\(report\.reportKey\)[\s\S]*\/run/);
assert.match(reportingHost, /query\.set\("report", report\.reportKey\)/);
assert.match(reportingHost, /title: "No reports available"/);
assert.match(reportingHost, /title: "Report view unavailable"/);
assert.match(reportingHost, /payload\.reportKey !== report\.reportKey \|\| payload\.renderer !== report\.renderer/);
assert.doesNotMatch(
  reportingHost,
  /time-tracking|project-time-billing|time-project-billing|\/api\/reporting\/bootstrap|\/api\/reporting\/project-summary|Billing Rate|Billable Amount|childRows|expandedProjectRows/,
  "Framework Reporting host must not name or shape the Time Tracking report",
);

assert.match(timeTrackingRenderer, /registerRenderer\("time-project-billing-table"/);
assert.match(timeTrackingRenderer, /fetch\("\/api\/reporting\/bootstrap"/);
assert.match(timeTrackingRenderer, /setFilterOptions\("scope"[\s\S]*setFilterOptions\("tags"[\s\S]*setFilterOptions\("projects"/);
assert.match(timeTrackingRenderer, /setFilterHidden\("scope", bootstrap\.clientFiltersVisible === false\)/);
assert.match(timeTrackingRenderer, /context\.view\.createDataTable\(/);
assert.match(timeTrackingRenderer, /expandedProjectRows[\s\S]*flattenVisibleRows[\s\S]*childRows/);
assert.match(timeTrackingRenderer, /appendRunnerTotals\([\s\S]*summary\.totals/);
assert.match(timeTrackingRenderer, /totals\.seconds[\s\S]*totals\.amount/);
assert.match(timeTrackingRenderer, /state: "empty"[\s\S]*No time entries match these filters/);
assert.doesNotMatch(
  timeTrackingRenderer,
  /fetch\(`?"?\/api\/reporting\/project-summary/,
  "The converted renderer must execute through the framework route rather than the compatibility summary route",
);

assert.match(css, /\.view-filter-panel select\[multiple\][\s\S]*min-height/);
assert.match(css, /\.view-data-table tfoot th,[\s\S]*font-weight: 700/);

console.log("Framework Reporting host regression passed.");
