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

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Support View audit requires LongtailForge.errors.");
    }
    return errors;
  }

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
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewAuditEnvelope} BrowserSupportViewAuditEnvelope */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewAuditEvent} BrowserSupportViewAuditEvent */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewAuditFilterOptions} BrowserSupportViewAuditFilterOptions */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewAuditFilterOption} BrowserSupportViewAuditFilterOption */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserSupportViewAuditFilterValue} BrowserSupportViewAuditFilterValue */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserBoundedPagination} BrowserBoundedPagination */

  /** The event kinds the column `CHECK`, the server union and every writer agree on. */
  const SUPPORT_VIEW_EVENT_TYPES = Object.freeze(["action_attempt", "entered", "exited", "expired", "terminated"]);

  /** The event outcomes closed the same three ways. */
  const SUPPORT_VIEW_EVENT_OUTCOMES = Object.freeze(["allowed", "denied", "disabled", "expired", "revoked", "success"]);

  /** The support-session states `support_sessions.outcome` may hold. */
  const SUPPORT_VIEW_SESSION_OUTCOMES = Object.freeze(["active", "disabled", "exited", "expired", "revoked"]);

  /** The eight text members `toAuditEvent` always fills beside its three closed words. */
  const AUDIT_EVENT_TEXT = Object.freeze([
    "actionId",
    "actorLabel",
    "effectiveUserLabel",
    "occurredAt",
    "reasonClass",
    "reasonReference",
    "routeId",
    "workspaceName",
  ]);

  /** The four integers `boundedPaginationEnvelope` coerces itself. */
  const BOUNDED_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

  /** The three filter catalogues whose queries select a label beside the value. */
  const AUDIT_LABELLED_FILTERS = Object.freeze(["actors", "effectiveUsers", "workspaces"]);

  /** The two filter catalogues whose queries select a distinct value and nothing else. */
  const AUDIT_VALUE_FILTERS = Object.freeze(["eventTypes", "outcomes"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isResponseRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * @param {unknown} value
   * @returns {value is number}
   */
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /**
   * One audit event as the operator may see it: eleven members, three of them closed words.
   * @param {unknown} value
   * @returns {value is BrowserSupportViewAuditEvent}
   */
  function isAuditEvent(value) {
    return isResponseRecord(value)
      && AUDIT_EVENT_TEXT.every((member) => typeof value[member] === "string")
      && typeof value.eventType === "string"
      && SUPPORT_VIEW_EVENT_TYPES.includes(value.eventType)
      && typeof value.outcome === "string"
      && SUPPORT_VIEW_EVENT_OUTCOMES.includes(value.outcome)
      && typeof value.sessionOutcome === "string"
      && SUPPORT_VIEW_SESSION_OUTCOMES.includes(value.sessionOutcome);
  }

  /**
   * The bounded pagination envelope: four integers, a flag, a cursor, and a count or `null`.
   * @param {unknown} value
   * @returns {value is BrowserBoundedPagination}
   */
  function isBoundedPagination(value) {
    return isResponseRecord(value)
      && BOUNDED_PAGINATION_NUMBERS.every((member) => isFiniteNumber(value[member]))
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && (value.total === null || isFiniteNumber(value.total));
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserSupportViewAuditFilterOption}
   */
  function isFilterOption(value) {
    return isResponseRecord(value) && typeof value.value === "string" && typeof value.label === "string";
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserSupportViewAuditFilterValue}
   */
  function isFilterValue(value) {
    return isResponseRecord(value) && typeof value.value === "string";
  }

  /**
   * The five filter catalogues, each element vouched for by the vocabulary its query builds.
   * @param {unknown} value
   * @returns {value is BrowserSupportViewAuditFilterOptions}
   */
  function isAuditFilterOptions(value) {
    return isResponseRecord(value)
      && AUDIT_LABELLED_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every(isFilterOption);
      })
      && AUDIT_VALUE_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every(isFilterValue);
      });
  }

  /**
   * The audit envelope, read as a whole or not at all.
   *
   * **This is an audit surface, so an element the browser cannot vouch for does not make a
   * shorter list - it makes an unreadable response.** Dropping one event would silently hide an
   * audit record from the operator, which is the one thing this page must never do; the caller
   * takes its ordinary load-error path instead, and the operator sees that something is wrong.
   * @param {unknown} body
   * @returns {BrowserSupportViewAuditEnvelope | null}
   */
  function readSupportViewAudit(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { events, exportLimit, filterOptions, pagination, retentionDays } = body;
    if (!Array.isArray(events) || !events.every(isAuditEvent)
      || !isFiniteNumber(exportLimit)
      || !isAuditFilterOptions(filterOptions)
      || !isBoundedPagination(pagination)
      || !isFiniteNumber(retentionDays)) {
      return null;
    }
    return { events, exportLimit, filterOptions, pagination, retentionDays };
  }

  async function initialize() {
    await requireTimezones().loadSessionTimezone();
    await window.LongtailForge.workspaceContextReady;
    await loadAudit();
  }

  async function loadAudit() {
    setStatus("Loading Support View audit events...");
    try {
      const audit = readSupportViewAudit(await requireApi().getJson(
        `/api/support-view/audit?${buildPageParams().toString()}`,
        { cache: "no-store" },
      ));
      if (!audit) {
        throw new Error("The Support View audit response could not be read.");
      }
      const events = audit.events;
      totalEvents = audit.pagination.total ?? 0;
      returnedEvents = events.length;
      currentPage = Math.min(Math.max(1, currentPage), totalPages());
      populateFilters(audit.filterOptions);
      policyText.textContent = `Support View audit records are retained for ${audit.retentionDays} days. Each CSV export is limited to ${audit.exportLimit} newest matching rows.`;
      renderRows(events);
      updatePagination();
      updateStatus();
    } catch (error) {
      tableBody.replaceChildren();
      setStatus(requireErrors().caughtMessage(error, "Support View audit events could not be loaded."), true);
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
