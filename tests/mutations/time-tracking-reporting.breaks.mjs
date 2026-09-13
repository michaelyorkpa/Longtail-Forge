import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-tracking-reporting.js";
const suites = ["tests/unit/time-tracking-reporting-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function reportRecord(value) {",
    "  // @ts-expect-error deliberately added\n  function reportRecord(value) {"],
  ["a document query appears in the renderer",
    "  function reportRecord(value) {",
    '  function reportNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function reportRecord(value) {'],
  ["the view factory is reached through a guard this checkpoint did not add",
    "    const tableWrap = context.view.createDataTable({",
    "    const requireReportView = (host) => host.view;\n    const tableWrap = requireReportView(context).createDataTable({"],
  ["the published tag record is restated instead of imported",
    '  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagCatalogRecord} BrowserTagCatalogRecord */',
    "  /** @typedef {{ tag_id: string, name: string }} BrowserTagCatalogRecord */"],

  // --- the wire readers ----------------------------------------------------------------------
  ["a primitive is taken as a record",
    '    return typeof value === "object" && value !== null && !Array.isArray(value)',
    "    return value !== null && value !== undefined"],
  ["an array is taken as a record",
    'typeof value === "object" && value !== null && !Array.isArray(value)',
    'typeof value === "object" && value !== null'],
  ["a malformed list entry is dropped instead of drawn with its fallbacks",
    "    return entries.map((entry) => reportRecord(entry) || {});",
    "    return entries.map((entry) => reportRecord(entry)).filter(Boolean);"],
  ["a value that is not a list becomes a one-entry list",
    "    const entries = Array.isArray(value) ? value : [];\n    return entries.map((entry) => reportRecord(entry) || {});",
    "    const entries = Array.isArray(value) ? value : [value];\n    return entries.map((entry) => reportRecord(entry) || {});"],
  ["a falsy member reaches its own spelling rather than the empty string",
    '    return String(value || "");',
    '    return String(value ?? "");'],

  // --- the scope filter ------------------------------------------------------------------------------
  ["the workspace scope loses its published label",
    "      label: scope.isWorkspaceScope\n        ? workspaceProjectsLabel()",
    "      label: false\n        ? workspaceProjectsLabel()"],
  ["every scope is labelled as the workspace",
    "      label: scope.isWorkspaceScope\n        ? workspaceProjectsLabel()",
    "      label: true\n        ? workspaceProjectsLabel()"],
  ["a nested scope stops being indented",
    "        : `${treeIndent(getScopeDepth(scope, scopes))}${reportText(scope.name)}`,",
    "        : `${reportText(scope.name)}`,"],
  ["the scope option carries the wrong member as its value",
    "      value: reportText(scope.id),",
    "      value: reportText(scope.name),"],
  ["the requested scope stops being honoured",
    "    const requestedScopeId = readRequestedScopeId(context.queryParams, scopes);",
    '    const requestedScopeId = "";'],
  ["the default scope stops being selected",
    "    const selectedScopeId = requestedScopeId || reportText(bootstrap.defaultScopeId);",
    "    const selectedScopeId = requestedScopeId;"],
  ["the default scope wins over the requested one",
    "    const selectedScopeId = requestedScopeId || reportText(bootstrap.defaultScopeId);",
    "    const selectedScopeId = reportText(bootstrap.defaultScopeId) || requestedScopeId;"],
  ["a scope the bootstrap does not hold is honoured anyway",
    "    return scopes.some((scope) => scope.id === requested) ? requested : \"\";",
    "    return requested;"],
  ["only one of the three scope query names is read",
    '    const requested = query.get("scopeId") || query.get("client") || query.get("scope") || "";',
    '    const requested = query.get("scopeId") || "";'],
  ["the scope filter is hidden whenever the workspace says anything",
    '    context.setFilterHidden("scope", bootstrap.clientFiltersVisible === false);',
    '    context.setFilterHidden("scope", !bootstrap.clientFiltersVisible);'],
  ["the scope filter is never hidden",
    '    context.setFilterHidden("scope", bootstrap.clientFiltersVisible === false);',
    '    context.setFilterHidden("scope", false);'],

  // --- the tag filter -------------------------------------------------------------------------------------
  ["the shared No Tags option is dropped",
    '      { value: noTagsFilterValue(), label: "No Tags" },',
    ""],
  ["No Tags is offered after the workspace's tags",
    '      { value: noTagsFilterValue(), label: "No Tags" },\n      ...tags.map((tag) => ({ value: tag.tag_id, label: tag.name })),',
    '      ...tags.map((tag) => ({ value: tag.tag_id, label: tag.name })),\n      { value: noTagsFilterValue(), label: "No Tags" },'],
  ["the No Tags value loses its shared fallback",
    '    return window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";',
    "    return window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE;"],
  ["the workspace projects label loses its fallback",
    '    return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";',
    "    return window.LongtailForge?.getWorkspaceProjectsLabel?.();"],
  ["the tag option carries the wrong members",
    "      ...tags.map((tag) => ({ value: tag.tag_id, label: tag.name })),",
    "      ...tags.map((tag) => ({ value: tag.name, label: tag.tag_id })),"],
  ["the tag filter is shown even with no tags to pick",
    '    context.setFilterHidden("tags", tags.length === 0);',
    '    context.setFilterHidden("tags", false);'],
  ["the requested tag selection is dropped",
    '      value: context.queryParams.get("tagIds") || "",',
    '      value: "",'],

  // --- the project filter ----------------------------------------------------------------------------------------
  ["projects stop being ordered parent-before-child",
    "    const projects = scope ? sortProjectTree(scopeProjects) : [];",
    "    const projects = scope ? scopeProjects : [];"],
  ["a nested project stops being indented",
    "      label: `${treeIndent(getProjectDepth(project, scopeProjects))}${reportText(project.name)}`,",
    "      label: `${reportText(project.name)}`,"],
  // **Withdrawn, and inert for a real reason.** Measuring depth against the sorted list instead of
  // the scope's own changes no label: both hold the same projects, and the walk follows
  // `parentProjectId` by lookup rather than by position. The scope's list is kept because it is
  // the one the untyped code read, not because the answer depends on it.
  ["the project option carries the wrong member as its value",
    "      value: project.id,",
    "      value: project.name,"],
  ["a scope change keeps the previous scope's project selection",
    "    const requestedProjectIds = options.scopeChanged\n      ? []",
    "    const requestedProjectIds = false\n      ? []"],
  ["every sync is treated as a scope change, so a selection never survives",
    "    const requestedProjectIds = options.scopeChanged\n      ? []",
    "    const requestedProjectIds = true\n      ? []"],
  ["the live project selection stops being preferred over the url",
    "      : normalizeListValue(context.getFilterValue(\"projects\")).length\n        ? normalizeListValue(context.getFilterValue(\"projects\"))\n        : normalizeListValue(context.queryParams.getAll(\"projectIds\"));",
    '      : normalizeListValue(context.queryParams.getAll("projectIds"));'],
  ["the url project selection stops being read",
    '        : normalizeListValue(context.queryParams.getAll("projectIds"));',
    "        : [];"],
  ["nothing is selected when the url requests nothing",
    "      selectAll: requestedProjectIds.length === 0,",
    "      selectAll: false,"],
  ["everything is selected even when the url requested some",
    "      selectAll: requestedProjectIds.length === 0,",
    "      selectAll: true,"],
  ["the project filter stays enabled with no scope",
    '    context.setFilterDisabled("projects", !scope);',
    '    context.setFilterDisabled("projects", false);'],
  ["a filter other than scope resynchronizes the projects",
    '    if (changedFilterId && changedFilterId !== "scope") {\n      return;\n    }',
    "    if (false) {\n      return;\n    }"],
  ["a scope change stops resynchronizing the projects",
    '    if (changedFilterId && changedFilterId !== "scope") {\n      return;\n    }',
    "    if (changedFilterId) {\n      return;\n    }"],
  ["a scope change is not reported as one",
    '    synchronizeProjectOptions(context, { scopeChanged: changedFilterId === "scope" });',
    "    synchronizeProjectOptions(context, { scopeChanged: false });"],

  // --- validation -------------------------------------------------------------------------------------------------------
  ["a report runs with no scope chosen",
    '    if (!context.getFilterValue("scope")) {\n      return "Choose a reporting scope.";\n    }',
    "    if (false) {\n      return \"Choose a reporting scope.\";\n    }"],
  ["a report runs with no project chosen",
    '    if (normalizeListValue(context.getFilterValue("projects")).length === 0) {\n      return "Select at least one project.";\n    }',
    "    if (false) {\n      return \"Select at least one project.\";\n    }"],
  ["the project message is given for a missing scope",
    '    if (!context.getFilterValue("scope")) {\n      return "Choose a reporting scope.";',
    '    if (!context.getFilterValue("scope")) {\n      return "Select at least one project.";'],

  // --- the result -------------------------------------------------------------------------------------------------------
  ["a run with no rows renders a table instead of the empty state",
    "    if (!Array.isArray(summary.rows) || summary.rows.length === 0) {",
    "    if (false) {"],
  ["a run whose rows are not a list renders a table",
    "    if (!Array.isArray(summary.rows) || summary.rows.length === 0) {",
    "    if (summary.rows.length === 0) {"],
  ["the empty state loses the message that names the filters",
    '        message: "No time entries match these filters.",\n      };',
    '        message: "",\n      };'],
  ["the empty state is reported as ready",
    '        state: "empty",',
    '        state: "ready",'],
  ["a ready result loses its own results element",
    '      dataset: { timeProjectBillingResults: "" },',
    "      dataset: {},"],
  ["the report drops one of its four columns",
    '        { key: "rateLabel", label: "Billing Rate", align: "right" },',
    ""],
  ["the table loses the hierarchy that draws its nesting",
    "      hierarchy: {\n        depthField: \"depth\",\n        parentField: \"parentId\",\n        pathField: \"path\",\n      },",
    "      hierarchy: {},"],
  ["the runner totals stop being appended",
    '    appendRunnerTotals(tableWrap.querySelector("table"), summary.totals, context);',
    ""],
  ["the totals are read off the run body rather than its totals",
    '    appendRunnerTotals(tableWrap.querySelector("table"), summary.totals, context);',
    '    appendRunnerTotals(tableWrap.querySelector("table"), summary, context);'],
  ["the total time is read as the total amount",
    "      text: formatHours(totals.seconds || 0),",
    "      text: formatHours(totals.amount || 0),"],
  ["the total amount is read as the total time",
    "      text: formatCurrency(totals.amount || 0),",
    "      text: formatCurrency(totals.seconds || 0),"],
  // **Withdrawn, and inert for a real reason.** The `|| 0` here is already applied inside the
  // formatter: `formatHours` reads `Number(seconds || 0)` and `formatCurrency` reads
  // `Number(amount) || 0`, so an absent total reaches zero with or without it. It states the
  // intent at the call site and ships unchanged.
  ["the totals row is appended without a table to hold it",
    "    if (!table) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],

  // --- row expansion -------------------------------------------------------------------------------------------------------
  ["child rows are drawn whether or not the parent is open",
    "      if (childRows.length > 0 && expandedProjectRows.has(rowId)) {",
    "      if (childRows.length > 0) {"],
  ["child rows are never drawn",
    "      if (childRows.length > 0 && expandedProjectRows.has(rowId)) {",
    "      if (false) {"],
  ["a child row is drawn at its parent's depth",
    "        flattened.push(...flattenVisibleRows(childRows, depth + 1, rowId, nextPath));",
    "        flattened.push(...flattenVisibleRows(childRows, depth, rowId, nextPath));"],
  ["a child row loses its parent link",
    "        flattened.push(...flattenVisibleRows(childRows, depth + 1, rowId, nextPath));",
    "        flattened.push(...flattenVisibleRows(childRows, depth + 1, parentId, nextPath));"],
  ["a child row's path stops carrying its ancestry",
    "      const nextPath = [...path, rowId];",
    "      const nextPath = [rowId];"],
  ["a row with children is not marked as having them",
    "        hasChildren: childRows.length > 0,",
    "        hasChildren: false,"],
  ["a row reports itself open when it is not",
    "        isExpanded: expandedProjectRows.has(rowId),",
    "        isExpanded: true,"],
  ["a row with no billable time shows a rate and an amount anyway",
    "      const hasBillableTime = Number(row.billableSeconds) > 0;",
    "      const hasBillableTime = true;"],
  ["a row with billable time shows neither",
    "      const hasBillableTime = Number(row.billableSeconds) > 0;",
    "      const hasBillableTime = false;"],
  ["the row's total time is read from the billable seconds",
    "        timeLabel: formatHours(row.displaySeconds),",
    "        timeLabel: formatHours(row.billableSeconds),"],
  ["a row loses its project name fallback",
    '        projectName: reportText(reportRecord(row.project)?.name) || "Project",',
    "        projectName: reportText(reportRecord(row.project)?.name),"],
  ["a row is identified by its name before its id",
    '    return String(project?.id || project?.name || "");',
    '    return String(project?.name || project?.id || "");'],
  // **Withdrawn, and inert for a real reason.** Reading the project raw instead of through
  // `reportRecord` answers the same identity for every value a JSON body can carry: a string, a
  // number and an array all report `undefined` for both `id` and `name`, so the row is unidentified
  // either way. The one value that separates them is a function, whose `name` is its own - and a
  // response cannot contain one. The guard states what is being read and ships unchanged.

  // --- the toggle -------------------------------------------------------------------------------------------------------
  ["the toggle stops naming the action it performs",
    '      const label = `${displayRow.isExpanded ? "Collapse" : "Expand"} ${displayRow.projectName}`;',
    "      const label = displayRow.projectName;"],
  ["the toggle names the wrong action",
    '      const label = `${displayRow.isExpanded ? "Collapse" : "Expand"} ${displayRow.projectName}`;',
    '      const label = `${displayRow.isExpanded ? "Expand" : "Collapse"} ${displayRow.projectName}`;'],
  ["the toggle glyph stops flipping",
    '        text: displayRow.isExpanded ? "-" : "+",',
    '        text: "+",'],
  ["activating the toggle only ever expands",
    "          if (expandedProjectRows.has(displayRow.rowId)) {\n            expandedProjectRows.delete(displayRow.rowId);\n          } else {\n            expandedProjectRows.add(displayRow.rowId);\n          }",
    "          expandedProjectRows.add(displayRow.rowId);"],
  ["activating the toggle stops redrawing the table",
    "          renderProjectTimeBillingTable(root, summary, context);\n        },",
    "        },"],
  ["a row with no children is given a toggle",
    "    if (displayRow.hasChildren) {",
    "    if (true) {"],
  ["a row with no children loses its alignment spacer",
    '      wrapper.appendChild(context.view.createElement("span", {\n        className: "report-project-toggle-spacer",',
    '      wrapper.appendChild(context.view.createElement("span", {\n        className: "",'],
  ["a drawn row stops being marked as a child row",
    '      tableRow.classList.add((rows[index]?.depth ?? 0) > 0 ? "report-child-row" : "report-parent-row");',
    '      tableRow.classList.add("report-parent-row");'],

  // --- tree ordering -------------------------------------------------------------------------------------------------------
  ["siblings stop being ordered by name",
    "      const siblings = [...(projectsByParentId.get(parentId) || [])].sort(compareByName);",
    "      const siblings = [...(projectsByParentId.get(parentId) || [])];"],
  ["a project is emitted more than once",
    "        if (visited.has(project.id)) {\n          return;\n        }",
    "        if (false) {\n          return;\n        }"],
  ["an orphaned project is lost",
    "    projects.forEach((project) => {\n      if (!visited.has(project.id)) {\n        visited.add(project.id);\n        sortedProjects.push(project);\n        appendBranch(project.id);\n      }\n    });",
    ""],
  ["a child stops following its parent",
    "        visited.add(project.id);\n        sortedProjects.push(project);\n        appendBranch(project.id);\n      });",
    "        visited.add(project.id);\n        sortedProjects.push(project);\n      });"],
  ["scopes stop being ordered by their ancestry",
    "  function sortScopeTree(scopes) {\n    return [...scopes].sort((left, right) =>",
    "  function sortScopeTree(scopes) {\n    return [...scopes].sort((right, left) =>"],
  ["the workspace scope loses its place at the front",
    '    if (scope.isWorkspaceScope) {\n      return "";\n    }',
    '    if (false) {\n      return "";\n    }'],
  ["a scope sort key stops carrying its ancestry",
    "      names.unshift(reportText(current.name));",
    "      names.length = 0;\n      names.unshift(reportText(current.name));"],
  ["a scope sort key walk never stops at a cycle",
    "    while (currentScope && !visited.has(currentScope.id)) {",
    "    while (currentScope && names.length < 3) {"],
  ["the scope name comparison becomes case-sensitive",
    "      getScopeTreeSortKey(left, scopes).localeCompare(getScopeTreeSortKey(right, scopes), undefined, {\n        sensitivity: \"base\",\n      }));",
    "      getScopeTreeSortKey(left, scopes).localeCompare(getScopeTreeSortKey(right, scopes)));"],
  ["the declared scope depth is ignored in favour of the walk",
    "    if (Number.isFinite(Number(scope?.depth))) {",
    "    if (false) {"],
  ["a scope depth walk never stops at a cycle",
    "    if (!scope?.parentScopeId || visited.has(scope.id)) {\n      return 0;\n    }",
    "    if (!scope?.parentScopeId) {\n      return 0;\n    }"],
  ["a project depth walk never stops at a cycle",
    "    if (!project?.parentProjectId || visited.has(project.id)) {\n      return 0;\n    }",
    "    if (!project?.parentProjectId) {\n      return 0;\n    }"],
  ["a nested scope reports no depth",
    "    return parent ? 1 + getScopeDepth(parent, scopes, visited) : 0;",
    "    return 0;"],
  ["a nested project reports no depth",
    "    return parent ? 1 + getProjectDepth(parent, projects, visited) : 0;",
    "    return 0;"],
  ["the name comparison becomes case-sensitive",
    '    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });',
    '    return String(left.name || "").localeCompare(String(right.name || ""));'],
  ["the root is indented like a child",
    '    return depth > 0 ? `${"  ".repeat(depth)}- ` : "";',
    '    return `${"  ".repeat(depth)}- `;'],
  ["indentation stops growing with depth",
    '    return depth > 0 ? `${"  ".repeat(depth)}- ` : "";',
    '    return depth > 0 ? "  - " : "";'],

  // --- value normalization -------------------------------------------------------------------------------------------------------
  ["a comma-joined filter value stops being split",
    '    return [...new Set(values.flatMap((item) => String(item || "").split(","))',
    "    return [...new Set(values.flatMap((item) => [String(item || \"\")])"],
  ["a repeated selection is carried twice",
    "    return [...new Set(values.flatMap",
    "    return [...Array.from(values.flatMap"],
  ["a filter value stops being trimmed",
    "      .map((item) => item.trim())\n      .filter(Boolean))];",
    "      .filter(Boolean))];"],
  ["a blank filter value is carried as a selection",
    "      .map((item) => item.trim())\n      .filter(Boolean))];",
    "      .map((item) => item.trim()))];"],
  ["a single filter value stops being wrapped",
    "    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];",
    "    const values = Array.isArray(value) ? value : [];"],
  ["the shared formatters stop being preferred",
    "    return formatters?.hours ? formatters.hours(seconds) : `${(Number(seconds || 0) / 3600).toFixed(2)} hrs`;",
    "    return `${(Number(seconds || 0) / 3600).toFixed(2)} hrs`;"],
  ["the currency formatter stops being preferred",
    "    return formatters?.currency ? formatters.currency(amount) : `$${(Number(amount) || 0).toFixed(2)}`;",
    "    return `$${(Number(amount) || 0).toFixed(2)}`;"],
  ["the rate loses its per-hour suffix",
    "    return `${formatCurrency(Number(rate) || 0)}/hr`;",
    "    return `${formatCurrency(Number(rate) || 0)}`;"],
  // **Withdrawn, and inert for the same reason as the totals fallback.** `formatCurrency` already
  // reads `Number(amount) || 0`, so a rate that is not a number reaches zero with or without the
  // `|| 0` here. It states the intent at the call site and ships unchanged.
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
