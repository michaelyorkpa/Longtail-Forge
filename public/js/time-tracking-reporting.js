// Time Tracking-owned Project Time & Billing Reporting adapter.
(function registerProjectTimeBillingRenderer() {
  const reporting = window.LongtailForge?.reporting;
  const formatters = window.LongtailForge?.formatters || {};
  const expandedProjectRows = new Set();
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

  async function initializeFilters(context) {
    const [bootstrap, tags] = await Promise.all([
      loadReportBootstrap(),
      loadTagOptions(),
    ]);
    reportBootstrap = bootstrap;

    const scopes = sortScopeTree(bootstrap.scopes || []);
    const requestedScopeId = readRequestedScopeId(context.queryParams, scopes);
    const selectedScopeId = requestedScopeId || bootstrap.defaultScopeId || "";
    context.setFilterOptions("scope", scopes.map((scope) => ({
      label: scope.isWorkspaceScope
        ? workspaceProjectsLabel()
        : `${treeIndent(getScopeDepth(scope, scopes))}${scope.name}`,
      value: scope.id,
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

  async function synchronizeFilters(context, changedFilterId) {
    if (changedFilterId && changedFilterId !== "scope") {
      return;
    }
    synchronizeProjectOptions(context, { scopeChanged: changedFilterId === "scope" });
  }

  function synchronizeProjectOptions(context, options = {}) {
    const scopeId = String(context.getFilterValue("scope") || "");
    const scope = reportBootstrap?.scopes?.find((item) => item.id === scopeId);
    const projects = scope ? sortProjectTree(scope.projects || []) : [];
    const requestedProjectIds = options.scopeChanged
      ? []
      : normalizeListValue(context.getFilterValue("projects")).length
        ? normalizeListValue(context.getFilterValue("projects"))
        : normalizeListValue(context.queryParams.getAll("projectIds"));

    context.setFilterOptions("projects", projects.map((project) => ({
      label: `${treeIndent(getProjectDepth(project, scope.projects))}${project.name}`,
      value: project.id,
    })), {
      selectedValues: requestedProjectIds,
      selectAll: requestedProjectIds.length === 0,
    });
    context.setFilterDisabled("projects", !scope);
  }

  function validateFilters(context) {
    if (!context.getFilterValue("scope")) {
      return "Choose a reporting scope.";
    }
    if (normalizeListValue(context.getFilterValue("projects")).length === 0) {
      return "Select at least one project.";
    }
    return "";
  }

  function renderProjectTimeBillingResult(summary, context) {
    if (!Array.isArray(summary?.rows) || summary.rows.length === 0) {
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

  function renderProjectTimeBillingTable(root, summary, context) {
    const rows = flattenVisibleRows(summary.rows || []);
    const tableWrap = context.view.createDataTable({
      caption: "Project Time & Billing",
      className: "time-project-billing-table-wrap",
      tableClassName: "time-project-billing-table",
      columns: [
        {
          key: "projectName",
          label: "Project",
          header: true,
          render: (row) => createProjectCell(row, summary, root, context),
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
      tableRow.classList.add(rows[index]?.depth > 0 ? "report-child-row" : "report-parent-row");
    });
    appendRunnerTotals(tableWrap.querySelector("table"), summary.totals, context);
    root.replaceChildren(tableWrap);
  }

  function flattenVisibleRows(rows, depth = 0, parentId = "", path = []) {
    const flattened = [];
    for (const row of rows) {
      const rowId = getReportRowId(row);
      const childRows = Array.isArray(row.childRows) ? row.childRows : [];
      const hasBillableTime = Number(row.billableSeconds) > 0;
      const nextPath = [...path, rowId];
      flattened.push({
        amountLabel: hasBillableTime ? formatCurrency(row.amount) : "",
        depth,
        hasChildren: childRows.length > 0,
        isExpanded: expandedProjectRows.has(rowId),
        parentId,
        path: nextPath,
        projectName: row.project?.name || "Project",
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

  function appendRunnerTotals(table, totals = {}, context) {
    if (!table) {
      return;
    }
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

  async function loadTagOptions() {
    return window.LongtailForge?.tags?.loadTags
      ? window.LongtailForge.tags.loadTags({ status: "active" })
      : [];
  }

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

  function formatRate(rate) {
    return `${formatCurrency(Number(rate) || 0)}/hr`;
  }

  function formatHours(seconds) {
    return formatters.hours ? formatters.hours(seconds) : `${(Number(seconds || 0) / 3600).toFixed(2)} hrs`;
  }

  function formatCurrency(amount) {
    return formatters.currency ? formatters.currency(amount) : `$${(Number(amount) || 0).toFixed(2)}`;
  }

  function getReportRowId(row) {
    return String(row.project?.id || row.project?.name || "");
  }

  function sortProjectTree(projects) {
    const projectsByParentId = new Map();
    const sortedProjects = [];
    const visited = new Set();
    projects.forEach((project) => {
      const parentId = project.parentProjectId || "";
      const siblings = projectsByParentId.get(parentId) || [];
      siblings.push(project);
      projectsByParentId.set(parentId, siblings);
    });
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

  function sortScopeTree(scopes) {
    return [...scopes].sort((left, right) =>
      getScopeTreeSortKey(left, scopes).localeCompare(getScopeTreeSortKey(right, scopes), undefined, {
        sensitivity: "base",
      }));
  }

  function getScopeTreeSortKey(scope, scopes) {
    if (scope.isWorkspaceScope) {
      return "";
    }
    const names = [];
    let currentScope = scope;
    const visited = new Set();
    while (currentScope && !visited.has(currentScope.id)) {
      visited.add(currentScope.id);
      names.unshift(currentScope.name || "");
      currentScope = scopes.find((item) => item.id === currentScope.parentScopeId);
    }
    return names.join("/");
  }

  function getScopeDepth(scope, scopes, visited = new Set()) {
    if (Number.isFinite(Number(scope?.depth))) {
      return Number(scope.depth);
    }
    if (!scope?.parentScopeId || visited.has(scope.id)) {
      return 0;
    }
    visited.add(scope.id);
    const parent = scopes.find((item) => item.id === scope.parentScopeId);
    return parent ? 1 + getScopeDepth(parent, scopes, visited) : 0;
  }

  function getProjectDepth(project, projects, visited = new Set()) {
    if (!project?.parentProjectId || visited.has(project.id)) {
      return 0;
    }
    visited.add(project.id);
    const parent = projects.find((item) => item.id === project.parentProjectId);
    return parent ? 1 + getProjectDepth(parent, projects, visited) : 0;
  }

  function compareByName(left, right) {
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
  }

  function treeIndent(depth) {
    return depth > 0 ? `${"  ".repeat(depth)}- ` : "";
  }

  function normalizeListValue(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return [...new Set(values.flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean))];
  }
})();
