(function attachSupportViewAuditPage() {
  const filtersForm = document.querySelector("[data-support-view-audit-filters]");
  const fromInput = document.querySelector("[data-support-view-audit-from]");
  const toInput = document.querySelector("[data-support-view-audit-to]");
  const actorSelect = document.querySelector("[data-support-view-audit-actor]");
  const targetSelect = document.querySelector("[data-support-view-audit-target]");
  const workspaceSelect = document.querySelector("[data-support-view-audit-workspace]");
  const eventSelect = document.querySelector("[data-support-view-audit-event]");
  const outcomeSelect = document.querySelector("[data-support-view-audit-outcome]");
  const resetButton = document.querySelector("[data-support-view-audit-reset]");
  const exportButton = document.querySelector("[data-support-view-audit-export]");
  const pageSizeSelect = document.querySelector("[data-support-view-audit-page-size]");
  const previousButton = document.querySelector("[data-support-view-audit-previous]");
  const nextButton = document.querySelector("[data-support-view-audit-next]");
  const pageSummary = document.querySelector("[data-support-view-audit-page-summary]");
  const policyText = document.querySelector("[data-support-view-audit-policy]");
  const statusText = document.querySelector("[data-support-view-audit-status]");
  const tableBody = document.querySelector("[data-support-view-audit-body]");

  let currentPage = 1;
  let totalEvents = 0;
  let returnedEvents = 0;

  initialize();

  filtersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    void loadAudit();
  });
  resetButton.addEventListener("click", () => {
    filtersForm.reset();
    currentPage = 1;
    void loadAudit();
  });
  exportButton.addEventListener("click", () => {
    window.location.href = `/api/support-view/audit/export.csv?${buildFilterParams().toString()}`;
  });
  pageSizeSelect.addEventListener("change", () => {
    currentPage = 1;
    void loadAudit();
  });
  previousButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      void loadAudit();
    }
  });
  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages()) {
      currentPage += 1;
      void loadAudit();
    }
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimezones} BrowserTimezones */

  /**
   * The timezone state and formatters this page cannot render dates without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.2.6.2` made the read checked. Every page that loads this script
   * loads `shared/timezones.js` ahead of it.
   *
   * `navigation.js`, `shared/settings-host.js`, `tasks.js`, and `task-dialog.js` read the same
   * surface optionally and fall back, and they keep doing so: absence is a real state there.
   * @returns {BrowserTimezones}
   */
  function requireTimezones() {
    const timezones = window.LongtailForge?.timezones;
    if (!timezones) {
      throw new Error("Support View audit requires LongtailForge.timezones.");
    }
    return timezones;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("The support view audit requires LongtailForge.api.");
    }
    return apiClient;
  }
  async function initialize() {
    await requireTimezones().loadSessionTimezone();
    await window.LongtailForge.workspaceContextReady;
    await loadAudit();
  }

  async function loadAudit() {
    setStatus("Loading Support View audit events...");
    try {
      const result = await requireApi().getJson(
        `/api/support-view/audit?${buildPageParams().toString()}`,
        { cache: "no-store" },
      );
      const events = Array.isArray(result.events) ? result.events : [];
      totalEvents = Number.parseInt(result.pagination?.total, 10) || 0;
      returnedEvents = events.length;
      currentPage = Math.min(Math.max(1, currentPage), totalPages());
      populateFilters(result.filterOptions || {});
      policyText.textContent = `Support View audit records are retained for ${result.retentionDays || 365} days. Each CSV export is limited to ${result.exportLimit || 1000} newest matching rows.`;
      renderRows(events);
      updatePagination();
      updateStatus();
    } catch (error) {
      tableBody.replaceChildren();
      setStatus(error.message || "Support View audit events could not be loaded.", true);
    }
  }

  function buildFilterParams() {
    const params = new URLSearchParams();
    const values = {
      actorUserId: actorSelect.value,
      dateFrom: fromInput.value,
      dateTo: toInput.value,
      effectiveUserId: targetSelect.value,
      eventType: eventSelect.value,
      outcome: outcomeSelect.value,
      workspaceId: workspaceSelect.value,
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    return params;
  }

  function buildPageParams() {
    const params = buildFilterParams();
    const pageSize = Number.parseInt(pageSizeSelect.value, 10) || 50;
    params.set("limit", String(pageSize));
    params.set("offset", String((currentPage - 1) * pageSize));
    return params;
  }

  function populateFilters(options) {
    replaceOptions(actorSelect, "All administrators", options.actors);
    replaceOptions(targetSelect, "All viewed users", options.effectiveUsers);
    replaceOptions(workspaceSelect, "All workspaces", options.workspaces);
    replaceOptions(eventSelect, "All events", formatOptions(options.eventTypes));
    replaceOptions(outcomeSelect, "All outcomes", formatOptions(options.outcomes));
  }

  function replaceOptions(select, allLabel, options) {
    const selected = select.value;
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = allLabel;
    select.replaceChildren(allOption);
    (Array.isArray(options) ? options : []).forEach((item) => {
      if (!item?.value || !item?.label) {
        return;
      }
      const option = document.createElement("option");
      option.value = String(item.value);
      option.textContent = String(item.label);
      select.appendChild(option);
    });
    if ([...select.options].some((option) => option.value === selected)) {
      select.value = selected;
    }
  }

  function formatOptions(options) {
    return (Array.isArray(options) ? options : []).map((item) => ({
      label: formatEnum(item.label || item.value),
      value: item.value,
    }));
  }

  function renderRows(events) {
    tableBody.replaceChildren();
    if (events.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "No Support View events match these filters.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    events.forEach((event) => {
      const row = document.createElement("tr");
      row.append(
        cell(requireTimezones().formatDateTime(event.occurredAt) || "Unknown"),
        cell(event.actorLabel),
        cell(event.effectiveUserLabel),
        cell(event.workspaceName),
        cell(formatEvent(event)),
        cell(formatEnum(event.outcome)),
        cell(event.reasonReference),
      );
      tableBody.appendChild(row);
    });
  }

  function formatEvent(event) {
    const eventLabel = formatEnum(event.eventType);
    const action = event.actionId || event.routeId;
    return action ? `${eventLabel}: ${action}` : eventLabel;
  }

  function cell(value) {
    const element = document.createElement("td");
    element.textContent = String(value || "None");
    element.title = element.textContent;
    return element;
  }

  function formatEnum(value) {
    return String(value || "")
      .split(/[._:-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "None";
  }

  function totalPages() {
    const pageSize = Number.parseInt(pageSizeSelect.value, 10) || 50;
    return Math.max(1, Math.ceil(totalEvents / pageSize));
  }

  function updatePagination() {
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages();
    pageSummary.textContent = `Page ${currentPage} of ${totalPages()}`;
  }

  function updateStatus() {
    if (!totalEvents) {
      setStatus("");
      return;
    }
    const pageSize = Number.parseInt(pageSizeSelect.value, 10) || 50;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(start + returnedEvents - 1, totalEvents);
    setStatus(`Showing ${start}-${end} of ${totalEvents} Support View events.`);
  }

  function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.classList.toggle("error-text", isError);
  }
})();
