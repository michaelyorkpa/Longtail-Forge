// Time Tracking-owned Project Time & Billing Reporting adapter.
(function registerProjectTimeBillingRenderer() {
  const reporting = window.LongtailForge?.reporting;
  // As in `time-tracking-dashboard.js`: the stand-in goes, the local fallbacks stay, and each
  // use keeps its own kind of test - truthiness here, `typeof ... === "function"` there.
  const formatters = window.LongtailForge?.formatters;

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagCatalogRecord} BrowserTagCatalogRecord */

  /**
   * A record this renderer read out of a reporting response, with no member guaranteed.
   *
   * The bootstrap body and the run result are untrusted wire values - `registerRenderer` takes
   * its registration as `unknown` and the host hands a run's answer straight through - so what
   * this renderer verifies about either is that it is reading from a record. The scope, project
   * and row shapes inside them are Time Tracking's own contribution vocabulary rather than a
   * framework contract, which is why none of them is named in the shared declaration.
   * @typedef {Record<string, unknown>} ReportRecord
   */

  /**
   * What this renderer uses from the context the Reporting host builds for it.
   *
   * **`view` is stated as required, and nothing here validates it.** `createRendererContext`
   * reads it optionally from the same namespace this file reads, and every draw below has always
   * dereferenced it without a guard - so an absent factory fails at exactly the line it failed at
   * before. This names the precondition rather than pretending to check it; adding a check would
   * move where that failure surfaces, which is not this checkpoint's to change.
   * @typedef {object} ReportingRendererContext
   * @property {URLSearchParams} queryParams
   * @property {BrowserViewFactory} view
   * @property {(filterId: string) => unknown} getFilterValue
   * @property {(filterId: string, options: unknown, config?: unknown) => void} setFilterOptions
   * @property {(filterId: string, hidden: unknown) => void} setFilterHidden
   * @property {(filterId: string, disabled: unknown) => void} setFilterDisabled
   */

  /**
   * One row of the table, as **this file's own `flattenVisibleRows` produces it**.
   *
   * Named precisely rather than left open, because this renderer is the producer: every member
   * is written by that function, so the shape is a local fact rather than a claim about the
   * wire. `row` stays a record - it is the response row this display row was built from, carried
   * so the toggle can rebuild the table from the same summary.
   * @typedef {object} ReportDisplayRow
   * @property {string} amountLabel
   * @property {number} depth
   * @property {boolean} hasChildren
   * @property {boolean} isExpanded
   * @property {string} parentId
   * @property {string[]} path
   * @property {string} projectName
   * @property {string} rateLabel
   * @property {ReportRecord} row
   * @property {string} rowId
   * @property {string} timeLabel
   */

  /**
   * The record a reporting member carries, or `null`.
   *
   * Arrays are refused because every caller asks this for a member it will read *by name*, and
   * an array answers `undefined` for each of them anyway.
   * @param {unknown} value
   * @returns {ReportRecord | null}
   */
  function reportRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? /** @type {ReportRecord} */ (value)
      : null;
  }

  /**
   * A reporting list, with every entry read as a record.
   *
   * A malformed entry becomes `{}` rather than being dropped, because every consumer below reads
   * its members defensively and renders the entry with its own fallbacks - a scope with no name,
   * a project with no id. Filtering here would remove a row the report has always drawn.
   * @param {unknown} value
   * @returns {ReportRecord[]}
   */
  function reportRecordList(value) {
    /** @type {readonly unknown[]} */
    const entries = Array.isArray(value) ? value : [];
    return entries.map((entry) => reportRecord(entry) || {});
  }

  /**
   * A reporting member as text.
   *
   * `String(value || "")` rather than `String(value ?? "")`, so the falsy members the untyped
   * reads sent to their own fallbacks still reach the empty string.
   * @param {unknown} value
   * @returns {string}
   */
  function reportText(value) {
    return String(value || "");
  }

  /** @type {Set<string>} */
  const expandedProjectRows = new Set();
  /** @type {ReportRecord | null} */
  let reportBootstrap = null;

  if (!reporting?.registerRenderer) {
    return;
  }

  reporting.registerRenderer("time-project-billing-table", {
    initializeFilters,
    render: renderProjectTimeBillingResult,
    synchronizeFilters,
    validateFilters,
  });

  /** @param {ReportingRendererContext} context */
  async function initializeFilters(context) {
    const [bootstrapBody, tags] = await Promise.all([
      loadReportBootstrap(),
      loadTagOptions(),
    ]);
    const bootstrap = reportRecord(bootstrapBody) || {};
    reportBootstrap = bootstrap;

    const scopes = sortScopeTree(reportRecordList(bootstrap.scopes));
    const requestedScopeId = readRequestedScopeId(context.queryParams, scopes);
    const selectedScopeId = requestedScopeId || reportText(bootstrap.defaultScopeId);
    context.setFilterOptions("scope", scopes.map((scope) => ({
      label: scope.isWorkspaceScope
        ? workspaceProjectsLabel()
        : `${treeIndent(getScopeDepth(scope, scopes))}${reportText(scope.name)}`,
      value: reportText(scope.id),
    })), {
      placeholder: "Select a reporting scope",
      value: selectedScopeId,
    });
    context.setFilterHidden("scope", bootstrap.clientFiltersVisible === false);

    context.setFilterOptions("tags", [
      { value: noTagsFilterValue(), label: "No Tags" },
      ...tags.map((tag) => ({ value: tag.tag_id, label: tag.name })),
    ], {
      placeholder: "All tags",
      value: context.queryParams.get("tagIds") || "",
    });
    context.setFilterHidden("tags", tags.length === 0);
    synchronizeProjectOptions(context, { initial: true });
  }

  /**
   * @param {ReportingRendererContext} context
   * @param {unknown} changedFilterId the filter the host says moved, or nothing on first sync
   */
  async function synchronizeFilters(context, changedFilterId) {
    if (changedFilterId && changedFilterId !== "scope") {
      return;
    }
    synchronizeProjectOptions(context, { scopeChanged: changedFilterId === "scope" });
  }

  /**
   * @param {ReportingRendererContext} context
   * @param {{ initial?: boolean, scopeChanged?: boolean }} [options]
   */
  function synchronizeProjectOptions(context, options = {}) {
    const scopeId = String(context.getFilterValue("scope") || "");
    const scope = reportRecordList(reportBootstrap?.scopes).find((item) => item.id === scopeId);
    // Hoisted because the label below reads the scope's **unsorted** list while the rows come
    // from the sorted one, and the depth walk follows parent links rather than order. Reading it
    // once also states what the untyped code relied on without saying: the map never runs when
    // there is no scope, because `projects` is empty then.
    const scopeProjects = reportRecordList(scope?.projects);
    const projects = scope ? sortProjectTree(scopeProjects) : [];
    const requestedProjectIds = options.scopeChanged
      ? []
      : normalizeListValue(context.getFilterValue("projects")).length
        ? normalizeListValue(context.getFilterValue("projects"))
        : normalizeListValue(context.queryParams.getAll("projectIds"));

    context.setFilterOptions("projects", projects.map((project) => ({
      label: `${treeIndent(getProjectDepth(project, scopeProjects))}${reportText(project.name)}`,
      value: project.id,
    })), {
      selectedValues: requestedProjectIds,
      selectAll: requestedProjectIds.length === 0,
    });
    context.setFilterDisabled("projects", !scope);
  }

  /** @param {ReportingRendererContext} context */
  function validateFilters(context) {
    if (!context.getFilterValue("scope")) {
      return "Choose a reporting scope.";
    }
    if (normalizeListValue(context.getFilterValue("projects")).length === 0) {
      return "Select at least one project.";
    }
    return "";
  }

  /**
   * **The run's answer arrives first and the context second**, which is the order the host calls
   * this in - `renderer.render(envelope.result, createRendererContext())`.
   * @param {unknown} summaryBody
   * @param {ReportingRendererContext} context
   */
  function renderProjectTimeBillingResult(summaryBody, context) {
    const summary = reportRecord(summaryBody) || {};
    if (!Array.isArray(summary.rows) || summary.rows.length === 0) {
      return {
        state: "empty",
        title: "No report results",
        message: "No time entries match these filters.",
      };
    }

    const root = context.view.createElement("div", {
      className: "time-project-billing-results",
      dataset: { timeProjectBillingResults: "" },
    });
    renderProjectTimeBillingTable(root, summary, context);
    return { state: "ready", content: root };
  }

  /**
   * @param {HTMLElement} root
   * @param {ReportRecord} summary
   * @param {ReportingRendererContext} context
   */
  function renderProjectTimeBillingTable(root, summary, context) {
    const rows = flattenVisibleRows(reportRecordList(summary.rows));
    const tableWrap = context.view.createDataTable({
      caption: "Project Time & Billing",
      className: "time-project-billing-table-wrap",
      tableClassName: "time-project-billing-table",
      columns: [
        {
          key: "projectName",
          label: "Project",
          header: true,
          render: (/** @type {ReportDisplayRow} */ row) => createProjectCell(row, summary, root, context),
        },
        { key: "rateLabel", label: "Billing Rate", align: "right" },
        { key: "timeLabel", label: "Total Time", align: "right" },
        { key: "amountLabel", label: "Billable Amount", align: "right" },
      ],
      rows,
      hierarchy: {
        depthField: "depth",
        parentField: "parentId",
        pathField: "path",
      },
      emptyMessage: "No time entries match these filters.",
    });

    tableWrap.querySelectorAll("tbody tr").forEach((tableRow, index) => {
      // `?? 0` states what `undefined > 0` already answered: a table row with no display row
      // behind it is a parent row, which is the class it has always been given.
      tableRow.classList.add((rows[index]?.depth ?? 0) > 0 ? "report-child-row" : "report-parent-row");
    });
    appendRunnerTotals(tableWrap.querySelector("table"), summary.totals, context);
    root.replaceChildren(tableWrap);
  }

  /**
   * @param {ReportRecord[]} rows
   * @param {number} [depth]
   * @param {string} [parentId]
   * @param {string[]} [path]
   * @returns {ReportDisplayRow[]}
   */
  function flattenVisibleRows(rows, depth = 0, parentId = "", path = []) {
    /** @type {ReportDisplayRow[]} */
    const flattened = [];
    for (const row of rows) {
      const rowId = getReportRowId(row);
      const childRows = reportRecordList(row.childRows);
      const hasBillableTime = Number(row.billableSeconds) > 0;
      const nextPath = [...path, rowId];
      flattened.push({
        amountLabel: hasBillableTime ? formatCurrency(row.amount) : "",
        depth,
        hasChildren: childRows.length > 0,
        isExpanded: expandedProjectRows.has(rowId),
        parentId,
        path: nextPath,
        projectName: reportText(reportRecord(row.project)?.name) || "Project",
        rateLabel: hasBillableTime ? formatRate(row.rate) : "",
        row,
        rowId,
        timeLabel: formatHours(row.displaySeconds),
      });

      if (childRows.length > 0 && expandedProjectRows.has(rowId)) {
        flattened.push(...flattenVisibleRows(childRows, depth + 1, rowId, nextPath));
      }
    }
    return flattened;
  }

  /**
   * @param {ReportDisplayRow} displayRow
   * @param {ReportRecord} summary
   * @param {HTMLElement} root
   * @param {ReportingRendererContext} context
   */
  function createProjectCell(displayRow, summary, root, context) {
    const wrapper = context.view.createElement("span", {
      className: "report-project-cell",
    });
    wrapper.style.setProperty("--report-project-depth", String(displayRow.depth));

    if (displayRow.hasChildren) {
      const label = `${displayRow.isExpanded ? "Collapse" : "Expand"} ${displayRow.projectName}`;
      const toggle = context.view.createActionButton({
        ariaLabel: label,
        className: "report-project-toggle",
        label,
        text: displayRow.isExpanded ? "-" : "+",
        title: label,
        onClick: () => {
          if (expandedProjectRows.has(displayRow.rowId)) {
            expandedProjectRows.delete(displayRow.rowId);
          } else {
            expandedProjectRows.add(displayRow.rowId);
          }
          renderProjectTimeBillingTable(root, summary, context);
        },
      });
      toggle.setAttribute("aria-expanded", String(displayRow.isExpanded));
      wrapper.appendChild(toggle);
    } else {
      wrapper.appendChild(context.view.createElement("span", {
        className: "report-project-toggle-spacer",
        attrs: { "aria-hidden": "true" },
      }));
    }

    wrapper.appendChild(context.view.createElement("span", { text: displayRow.projectName }));
    return wrapper;
  }

  /**
   * @param {Element | null} table the table `createDataTable` built, if it built one
   * @param {unknown} totalsBody
   * @param {ReportingRendererContext} context
   */
  function appendRunnerTotals(table, totalsBody, context) {
    if (!table) {
      return;
    }
    const totals = reportRecord(totalsBody) || {};
    const totalLabel = context.view.createElement("th", {
      attrs: { scope: "row", colspan: "2" },
      text: "Totals",
    });
    const totalTime = context.view.createElement("td", {
      attrs: { "data-align": "right" },
      text: formatHours(totals.seconds || 0),
    });
    const totalAmount = context.view.createElement("td", {
      attrs: { "data-align": "right" },
      text: formatCurrency(totals.amount || 0),
    });
    const totalRow = context.view.createElement("tr", {
      children: [totalLabel, totalTime, totalAmount],
    });
    table.appendChild(context.view.createElement("tfoot", {
      children: [totalRow],
    }));
  }

  async function loadReportBootstrap() {
    const response = await fetch("/api/reporting/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load Time Tracking report filters: ${response.status}`);
    }
    return response.json();
  }

  /** @returns {Promise<BrowserTagCatalogRecord[]>} */
  async function loadTagOptions() {
    return window.LongtailForge?.tags?.loadTags
      ? window.LongtailForge.tags.loadTags({ status: "active" })
      : [];
  }

  /** @param {URLSearchParams} query @param {ReportRecord[]} scopes @returns {string} */
  function readRequestedScopeId(query, scopes) {
    const requested = query.get("scopeId") || query.get("client") || query.get("scope") || "";
    return scopes.some((scope) => scope.id === requested) ? requested : "";
  }

  function workspaceProjectsLabel() {
    return window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
  }

  function noTagsFilterValue() {
    return window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
  }

  /** @param {unknown} rate */
  function formatRate(rate) {
    return `${formatCurrency(Number(rate) || 0)}/hr`;
  }

  /** @param {unknown} seconds */
  function formatHours(seconds) {
    return formatters?.hours ? formatters.hours(seconds) : `${(Number(seconds || 0) / 3600).toFixed(2)} hrs`;
  }

  /** @param {unknown} amount */
  function formatCurrency(amount) {
    return formatters?.currency ? formatters.currency(amount) : `$${(Number(amount) || 0).toFixed(2)}`;
  }

  /** @param {ReportRecord} row @returns {string} */
  function getReportRowId(row) {
    const project = reportRecord(row.project);
    return String(project?.id || project?.name || "");
  }

  /** @param {ReportRecord[]} projects @returns {ReportRecord[]} */
  function sortProjectTree(projects) {
    /** @type {Map<unknown, ReportRecord[]>} */
    const projectsByParentId = new Map();
    /** @type {ReportRecord[]} */
    const sortedProjects = [];
    /** @type {Set<unknown>} */
    const visited = new Set();
    projects.forEach((project) => {
      const parentId = project.parentProjectId || "";
      const siblings = projectsByParentId.get(parentId) || [];
      siblings.push(project);
      projectsByParentId.set(parentId, siblings);
    });
    /** @param {unknown} parentId */
    const appendBranch = (parentId) => {
      const siblings = [...(projectsByParentId.get(parentId) || [])].sort(compareByName);
      siblings.forEach((project) => {
        if (visited.has(project.id)) {
          return;
        }
        visited.add(project.id);
        sortedProjects.push(project);
        appendBranch(project.id);
      });
    };
    appendBranch("");
    projects.forEach((project) => {
      if (!visited.has(project.id)) {
        visited.add(project.id);
        sortedProjects.push(project);
        appendBranch(project.id);
      }
    });
    return sortedProjects;
  }

  /** @param {ReportRecord[]} scopes @returns {ReportRecord[]} */
  function sortScopeTree(scopes) {
    return [...scopes].sort((left, right) =>
      getScopeTreeSortKey(left, scopes).localeCompare(getScopeTreeSortKey(right, scopes), undefined, {
        sensitivity: "base",
      }));
  }

  /** @param {ReportRecord} scope @param {ReportRecord[]} scopes @returns {string} */
  function getScopeTreeSortKey(scope, scopes) {
    if (scope.isWorkspaceScope) {
      return "";
    }
    /** @type {string[]} */
    const names = [];
    /** @type {ReportRecord | undefined} */
    let currentScope = scope;
    /** @type {Set<unknown>} */
    const visited = new Set();
    while (currentScope && !visited.has(currentScope.id)) {
      // Bound inside the loop because the lookup below reads it from a callback, where the
      // loop condition's own narrowing does not reach. It is the same value either way.
      /** @type {ReportRecord} */
      const current = currentScope;
      visited.add(current.id);
      names.unshift(reportText(current.name));
      currentScope = scopes.find((item) => item.id === current.parentScopeId);
    }
    return names.join("/");
  }

  /**
   * @param {ReportRecord | undefined} scope
   * @param {ReportRecord[]} scopes
   * @param {Set<unknown>} [visited]
   * @returns {number}
   */
  function getScopeDepth(scope, scopes, visited = new Set()) {
    if (Number.isFinite(Number(scope?.depth))) {
      // Read through the same optional chain the test used: `Number(undefined)` is `NaN`, which
      // is not finite, so this branch is only reached when the scope is there.
      return Number(scope?.depth);
    }
    if (!scope?.parentScopeId || visited.has(scope.id)) {
      return 0;
    }
    visited.add(scope.id);
    const parent = scopes.find((item) => item.id === scope.parentScopeId);
    return parent ? 1 + getScopeDepth(parent, scopes, visited) : 0;
  }

  /**
   * @param {ReportRecord | undefined} project
   * @param {ReportRecord[]} projects
   * @param {Set<unknown>} [visited]
   * @returns {number}
   */
  function getProjectDepth(project, projects, visited = new Set()) {
    if (!project?.parentProjectId || visited.has(project.id)) {
      return 0;
    }
    visited.add(project.id);
    const parent = projects.find((item) => item.id === project.parentProjectId);
    return parent ? 1 + getProjectDepth(parent, projects, visited) : 0;
  }

  /** @param {ReportRecord} left @param {ReportRecord} right */
  function compareByName(left, right) {
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
  }

  /** @param {number} depth */
  function treeIndent(depth) {
    return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
  }

  /** @param {unknown} value @returns {string[]} */
  function normalizeListValue(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return [...new Set(values.flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean))];
  }
})();
