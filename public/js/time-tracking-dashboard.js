(function () {
  const dashboard = window.LongtailForge?.dashboard;
  const formatters = window.LongtailForge?.formatters || {};
  const billingSummaryPromises = new Map();
  const DEFAULT_BILLING_SUMMARY_ROUTE = "/api/time-tracking/dashboard/billing-summary";

  if (!dashboard?.registerPanelRenderer) {
    return;
  }

  dashboard.registerPanelRenderer("time-tracking.current-month-billables", renderCurrentMonthBillablesPanel);
  dashboard.registerPanelRenderer("time-tracking.hours-billables-chart", renderHoursBillablesChartPanel);

  function renderCurrentMonthBillablesPanel(contribution, context) {
    const body = createPanelBody(context, "Loading billables...");
    const panel = context.createPanel({
      title: "Current Month Billables",
      children: [body],
    });

    hydrateCurrentMonthBillables(body, contribution, context);
    return panel;
  }

  function renderHoursBillablesChartPanel(contribution, context) {
    const body = createPanelBody(context, "Loading billables chart...");
    const panel = context.createPanel({
      title: "Hours & Billables by Month",
      children: [body],
    });

    hydrateHoursBillablesChart(body, contribution, context);
    return panel;
  }

  async function hydrateCurrentMonthBillables(body, contribution, context) {
    try {
      const data = await loadBillingSummary(contribution);
      const table = createCurrentMonthBillablesTable(data, context);
      body.replaceChildren(table);
    } catch (error) {
      renderError(body, context, "Billables could not be loaded.");
      console.error(error);
    }
  }

  async function hydrateHoursBillablesChart(body, contribution, context) {
    try {
      const data = await loadBillingSummary(contribution);
      const chart = createBillablesChart(data, context);
      body.replaceChildren(chart);
    } catch (error) {
      renderError(body, context, "Billables chart could not be loaded.");
      console.error(error);
    }
  }

  async function loadBillingSummary(contribution) {
    const route = String(contribution?.dataRoute || DEFAULT_BILLING_SUMMARY_ROUTE);

    if (!billingSummaryPromises.has(route)) {
      billingSummaryPromises.set(route, fetch(route, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Could not load Time Tracking billing summary: ${response.status}`);
          }

          return response.json();
        }));
    }

    return billingSummaryPromises.get(route);
  }

  function createCurrentMonthBillablesTable(data, context) {
    const view = context.view;
    const rows = Array.isArray(data?.currentMonthBillables) ? data.currentMonthBillables : [];
    const tableRows = rows.map((billableRow) => ({
      scope: billableRow.scope,
      hours: formatHours(billableRow.billableSeconds),
      amount: formatCurrency(billableRow.amount),
    }));
    const tableWrap = view.createDataTable({
      className: "report-table-wrap",
      tableClassName: "report-table",
      columns: [
        {
          header: true,
          label: "Client",
          render: (row) => createScopeLink(row.scope, context),
        },
        { key: "hours", label: "Hours", align: "right" },
        { key: "amount", label: "Billable Amount", align: "right" },
      ],
      rows: tableRows,
      emptyMessage: "No billables for the current month.",
    });
    const table = tableWrap.querySelector("table");
    table?.appendChild(createBillablesFooter(data, context));

    return tableWrap;
  }

  function createBillablesFooter(data, context) {
    const view = context.view;
    const totals = data?.currentMonthTotals || {};
    const footer = document.createElement("tfoot");
    const row = document.createElement("tr");
    const label = view.createElement("th", {
      attrs: { scope: "row" },
      text: "Totals",
    });

    row.append(
      label,
      view.createElement("td", {
        dataset: { currentMonthHours: "" },
        text: formatHours(totals.seconds || 0),
      }),
      view.createElement("td", {
        dataset: { currentMonthAmount: "" },
        text: formatCurrency(totals.amount || 0),
      }),
    );
    footer.appendChild(row);
    return footer;
  }

  function createBillablesChart(data, context) {
    const view = context.view;
    const points = (Array.isArray(data?.chartPoints) ? data.chartPoints : []).map((point) => ({
      label: formatMonthLabel(new Date(point.labelDate)),
      hours: Number(point.hours) || 0,
      amount: Number(point.amount) || 0,
    }));
    const chart = view.createElement("div", {
      className: "billables-chart",
      attrs: { "aria-label": "Previous 12 months and current month hours and billables" },
      dataset: { billablesChart: "" },
    });

    chart.innerHTML = createBillablesSvg(points);
    return chart;
  }

  function createBillablesSvg(points) {
    const width = 900;
    const height = 340;
    const padding = { top: 64, right: 122, bottom: 48, left: 96 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const normalizedPoints = points.length > 0 ? points : [{ label: "", hours: 0, amount: 0 }];
    const maxHours = Math.max(1, ...normalizedPoints.map((point) => point.hours));
    const maxAmount = Math.max(1, ...normalizedPoints.map((point) => point.amount));
    const groupWidth = chartWidth / normalizedPoints.length;
    const hourBarWidth = Math.min(18, groupWidth * 0.28);
    const amountBarWidth = Math.min(18, groupWidth * 0.28);
    const monthLabels = normalizedPoints.map((point, index) => {
      const x = padding.left + groupWidth * index + groupWidth / 2;
      return `<text x="${x}" y="${height - 18}" text-anchor="middle">${point.label}</text>`;
    }).join("");
    const bars = normalizedPoints.map((point, index) => {
      const centerX = padding.left + groupWidth * index + groupWidth / 2;
      const hourHeight = (point.hours / maxHours) * chartHeight;
      const amountHeight = (point.amount / maxAmount) * chartHeight;
      const hourX = centerX - hourBarWidth - 2;
      const amountX = centerX + 2;
      const hourY = padding.top + chartHeight - hourHeight;
      const amountY = padding.top + chartHeight - amountHeight;

      return `
        <rect class="chart-hours" x="${hourX}" y="${hourY}" width="${hourBarWidth}" height="${hourHeight}">
          <title>${formatChartHours(point.hours)}</title>
        </rect>
        <rect class="chart-amount" x="${amountX}" y="${amountY}" width="${amountBarWidth}" height="${amountHeight}">
          <title>${formatCurrency(point.amount)}</title>
        </rect>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Hours and billables by month">
        <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}"></line>
        <line class="chart-axis" x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>
        <line class="chart-axis" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}"></line>
        <text class="chart-axis-label" x="${padding.left - 54}" y="${padding.top + 22}">Hours</text>
        <text class="chart-axis-label" x="${width - padding.right + 54}" y="${padding.top + 22}" text-anchor="middle">Dollars</text>
        <text x="${padding.left - 8}" y="${padding.top + 4}" text-anchor="end">${maxHours.toFixed(1)}</text>
        <text x="${width - padding.right + 8}" y="${padding.top + 4}">${formatCurrency(maxAmount)}</text>
        ${bars}
        ${monthLabels}
        <g class="chart-legend">
          <rect class="chart-hours" x="${padding.left}" y="28" width="12" height="12"></rect>
          <text x="${padding.left + 18}" y="38">Hours</text>
          <rect class="chart-amount" x="${padding.left + 86}" y="28" width="12" height="12"></rect>
          <text x="${padding.left + 104}" y="38">Billable</text>
        </g>
      </svg>
    `;
  }

  function createPanelBody(context, message) {
    return context.view.createElement("div", {
      className: "dashboard-panel-body",
      attrs: { role: "status" },
      text: message,
    });
  }

  function renderError(body, context, message) {
    body.replaceChildren(context.view.createEmptyState({
      title: "Time Tracking data unavailable",
      message,
    }));
  }

  function createScopeLink(scope, context) {
    return context.view.createElement("a", {
      attrs: { href: `reporting.html?scope=${encodeURIComponent(scope?.id || "")}` },
      text: scope?.isWorkspaceScope ? workspaceProjectsLabel(context) : scope?.name || "Reporting scope",
    });
  }

  function formatHours(seconds) {
    return typeof formatters.hours === "function"
      ? formatters.hours(seconds)
      : `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;
  }

  function formatCurrency(amount) {
    return typeof formatters.currency === "function"
      ? formatters.currency(amount)
      : `$${(Number(amount) || 0).toFixed(2)}`;
  }

  function formatMonthLabel(date) {
    return typeof formatters.monthLabel === "function"
      ? formatters.monthLabel(date)
      : `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
  }

  function formatChartHours(hours) {
    const value = Number(hours) || 0;
    return `${value.toFixed(1)} hours`;
  }

  function workspaceProjectsLabel(context) {
    return context.workspaceProjectsLabel?.() || window.LongtailForge?.getWorkspaceProjectsLabel?.() || "Projects";
  }
}());
