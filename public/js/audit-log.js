(function attachAuditLogPage() {
  const auditFilterForm = document.querySelector("[data-audit-filters]");
  const auditViewSelect = document.querySelector("[data-audit-view-filter]");
  const dateFromInput = document.querySelector("[data-audit-date-from]");
  const dateToInput = document.querySelector("[data-audit-date-to]");
  const userFilterSelect = document.querySelector("[data-audit-user-filter]");
  const clientFilterControl = document.querySelector("[data-audit-client-filter-control]");
  const clientFilterSelect = document.querySelector("[data-audit-client-filter]");
  const projectFilterSelect = document.querySelector("[data-audit-project-filter]");
  const recordTypeFilterSelect = document.querySelector("[data-audit-record-type-filter]");
  const changeTypeFilterSelect = document.querySelector("[data-audit-change-type-filter]");
  const workspaceFilterControl = document.querySelector("[data-audit-workspace-filter-control]");
  const workspaceFilterSelect = document.querySelector("[data-audit-workspace-filter]");
  const showUtcInput = document.querySelector("[data-audit-show-utc]");
  const resetButton = document.querySelector("[data-audit-reset]");
  const exportFilteredButton = document.querySelector("[data-audit-export-filtered]");
  const exportAllButton = document.querySelector("[data-audit-export-all]");
  const pageSizeSelect = document.querySelector("[data-audit-page-size]");
  const previousPageButton = document.querySelector("[data-audit-previous-page]");
  const nextPageButton = document.querySelector("[data-audit-next-page]");
  const pageSummary = document.querySelector("[data-audit-page-summary]");
  const auditStatus = document.querySelector("[data-audit-status]");
  const auditLogBody = document.querySelector("[data-audit-log-body]");

  let auditLogs = [];
  let currentPage = 1;
  let totalAuditLogs = 0;

  initializeAuditLog();

  auditFilterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    loadAuditLogs();
  });

  resetButton.addEventListener("click", () => {
    auditFilterForm.reset();
    setDefaultWorkspaceFilter();
    currentPage = 1;
    loadAuditLogs();
  });

  exportFilteredButton.addEventListener("click", () => {
    window.location.href = `${getAuditEndpoint()}/export.csv?${buildFilterParams().toString()}`;
  });

  exportAllButton.addEventListener("click", () => {
    window.location.href = `${getAuditEndpoint()}/export.csv`;
  });

  auditViewSelect.addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  pageSizeSelect.addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  workspaceFilterSelect.addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  showUtcInput.addEventListener("change", () => {
    currentPage = 1;
    loadAuditLogs();
  });

  previousPageButton.addEventListener("click", () => {
    if (currentPage <= 1) {
      return;
    }

    currentPage -= 1;
    loadAuditLogs();
  });

  nextPageButton.addEventListener("click", () => {
    if (currentPage >= getTotalPages()) {
      return;
    }

    currentPage += 1;
    loadAuditLogs();
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
      throw new Error("Audit Log requires LongtailForge.timezones.");
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
      throw new Error("The audit log requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditLogEntry} BrowserAuditLogEntry */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditFilterOption} BrowserAuditFilterOption */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditFilterOptions} BrowserAuditFilterOptions */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserBoundedPagination} BrowserBoundedPagination */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserAuditLogEnvelope} BrowserAuditLogEnvelope */

  /** The six `NOT NULL` columns of `audit_logs`, in the order the query selects them. */
  const AUDIT_ENTRY_TEXT = Object.freeze([
    "audit_id",
    "workspace_id",
    "created_at",
    "action",
    "change_type",
    "record_type",
  ]);

  /** The nine nullable columns beside them, snapshots included. */
  const AUDIT_ENTRY_NULLABLE_TEXT = Object.freeze([
    "actor_user_id",
    "actor_user_name",
    "record_id",
    "record_label",
    "record_url",
    "ip_address",
    "previous_value_json",
    "new_value_json",
    "metadata_json",
  ]);

  /** The four catalogues whose builders write a label beside a value. */
  const AUDIT_LABELLED_FILTERS = Object.freeze(["clients", "projects", "users", "workspaces"]);

  /** The two catalogues the repository maps straight to bare strings. */
  const AUDIT_STRING_FILTERS = Object.freeze(["changeTypes", "recordTypes"]);

  /** The four integers `boundedPaginationEnvelope` coerces itself. */
  const BOUNDED_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

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
   * @returns {value is string | null}
   */
  function isNullableText(value) {
    return value === null || typeof value === "string";
  }

  /**
   * One audit entry, checked column for column against the table it is selected from.
   *
   * The three snapshot members are checked as **text or null and nothing more**: they carry
   * `JSON.stringify` output the writer produced, and this boundary does not parse them into a
   * shape, because no producer agrees on one.
   * @param {unknown} value
   * @returns {value is BrowserAuditLogEntry}
   */
  function isAuditLogEntry(value) {
    return isResponseRecord(value)
      && AUDIT_ENTRY_TEXT.every((member) => typeof value[member] === "string")
      && value.audit_id !== ""
      && AUDIT_ENTRY_NULLABLE_TEXT.every((member) => isNullableText(value[member]));
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserAuditFilterOption}
   */
  function isAuditFilterOption(value) {
    return isResponseRecord(value) && typeof value.label === "string" && typeof value.value === "string";
  }

  /**
   * The six catalogues, each element vouched for by the vocabulary its builder writes.
   * @param {unknown} value
   * @returns {value is BrowserAuditFilterOptions}
   */
  function isAuditFilterOptions(value) {
    return isResponseRecord(value)
      && AUDIT_LABELLED_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every(isAuditFilterOption);
      })
      && AUDIT_STRING_FILTERS.every((member) => {
        const options = value[member];
        return Array.isArray(options) && options.every((entry) => typeof entry === "string");
      });
  }

  /**
   * The shared bounded pagination envelope: four integers, a flag, a cursor, and a count or null.
   * @param {unknown} value
   * @returns {value is BrowserBoundedPagination}
   */
  function isBoundedPagination(value) {
    return isResponseRecord(value)
      && BOUNDED_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number" && Number.isFinite(value[member]))
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && (value.total === null || (typeof value.total === "number" && Number.isFinite(value.total)));
  }

  /**
   * The audit envelope, read as a whole or not at all.
   *
   * **An audit page must not present partial history.** The raw reads coerced every member of a
   * malformed row to the empty string, which rendered a blank line indistinguishable from a real
   * entry with nothing recorded. Refusing the response instead sends the caller down the load
   * error path it already had, so the administrator learns the history could not be read rather
   * than reading a shorter or emptier one. This is the same choice `0.33.33.38.4.8.1` made for
   * the Support View audit, and the opposite of the target picker's, where dropping an entry
   * removes a candidate rather than hiding a record.
   * @param {unknown} body
   * @returns {BrowserAuditLogEnvelope | null}
   */
  function readAuditLogEnvelope(body) {
    if (!isResponseRecord(body)) {
      return null;
    }
    const { auditLogs: entries, filterOptions, pagination, workspaceId } = body;
    if (!Array.isArray(entries) || !entries.every(isAuditLogEntry)
      || !isAuditFilterOptions(filterOptions)
      || !isBoundedPagination(pagination)
      || typeof workspaceId !== "string") {
      return null;
    }
    return { auditLogs: entries, filterOptions, pagination, workspaceId };
  }

  async function loadAuditLogs() {
    setStatus("Loading audit log...");

    try {
      const result = readAuditLogEnvelope(await requireApi().getJson(
        `${getAuditEndpoint()}?${buildPageParams().toString()}`,
        { cache: "no-store" },
      ));
      if (!result) {
        throw new Error("The audit log response could not be read.");
      }
      auditLogs = result.auditLogs.map(normalizeAuditLog);
      totalAuditLogs = result.pagination.total ?? 0;
      const normalizedPage = normalizeCurrentPage();

      if (normalizedPage !== currentPage) {
        currentPage = normalizedPage;
        await loadAuditLogs();
        return;
      }

      populateFilterOptions(result.filterOptions, result.workspaceId);
      renderAuditLogs();
    } catch (error) {
      setStatus(auditViewSelect.value === "security"
        ? "Security events are available only to workspace administrators."
        : "Audit log could not be loaded.");
      console.error(error);
    }
  }

  async function initializeAuditLog() {
    await requireTimezones().loadSessionTimezone();
    await window.LongtailForge.workspaceContextReady;
    if (new URLSearchParams(window.location.search).get("view") === "security") {
      auditViewSelect.value = "security";
    }
    await loadAuditLogs();
  }

  function getAuditEndpoint() {
    return auditViewSelect.value === "security" ? "/api/security-events" : "/api/audit-logs";
  }

  function populateFilterOptions(filterOptions = {}, selectedWorkspaceId = "") {
    replaceSelectOptions(userFilterSelect, "All users", normalizeOptions(filterOptions.users));
    replaceSelectOptions(clientFilterSelect, "All clients", normalizeOptions(filterOptions.clients));
    replaceSelectOptions(projectFilterSelect, "All projects", normalizeOptions(filterOptions.projects));
    clientFilterControl.hidden = clientFilterSelect.options.length <= 1;
    replaceSelectOptions(recordTypeFilterSelect, "All record types", normalizeEnumOptions(filterOptions.recordTypes));
    replaceSelectOptions(changeTypeFilterSelect, "All change types", normalizeEnumOptions(filterOptions.changeTypes));
    populateWorkspaceOptions(filterOptions.workspaces, selectedWorkspaceId);
  }

  function replaceSelectOptions(select, allLabel, options) {
    const selectedValue = select.value;
    select.replaceChildren(createOption("", allLabel));
    options.forEach((option) => {
      select.appendChild(createOption(option.value, option.label));
    });

    if ([...select.options].some((option) => option.value === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function renderAuditLogs() {
    auditLogBody.replaceChildren();
    updatePagination();

    if (auditLogs.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 7;
      cell.textContent = auditViewSelect.value === "security"
        ? "No security events match these filters."
        : "No audit log entries match these filters.";
      row.appendChild(cell);
      auditLogBody.appendChild(row);
      setStatus("");
      return;
    }

    auditLogs.forEach((log) => {
      auditLogBody.appendChild(createAuditRow(log));
    });

    updateStatus();
  }

  function createAuditRow(log) {
    const row = document.createElement("tr");
    const metadata = parseJson(log.metadata_json);
    const context = getAuditContext(log, metadata);
    const userCell = document.createElement("td");
    const userButton = document.createElement("button");
    const detailsButton = document.createElement("button");

    if (log.actor_user_id) {
      userButton.type = "button";
      userButton.className = "link-button";
      userButton.textContent = log.actor_user_name || log.actor_user_id;
      userButton.addEventListener("click", () => {
        userFilterSelect.value = log.actor_user_id;
        currentPage = 1;
        loadAuditLogs();
      });
      userCell.appendChild(userButton);
    } else {
      userCell.textContent = "None";
    }

    detailsButton.type = "button";
    detailsButton.textContent = "View";
    detailsButton.addEventListener("click", () => openAuditDetailDialog(log));

    row.append(
      createCell(formatDateTime(log.created_at)),
      userCell,
      createCell(createFilterButton(getClientLabel(log, context), getClientId(log, context), clientFilterSelect)),
      createCell(createFilterButton(getProjectLabel(log, context), getProjectId(log, context), projectFilterSelect)),
      createCell(createFilterButton(formatEnum(log.record_type), log.record_type, recordTypeFilterSelect)),
      createCell(formatEnum(log.change_type)),
      createCell(detailsButton),
    );

    return row;
  }

  function buildFilterParams() {
    const params = new URLSearchParams();
    const timezone = showUtcInput.checked ? "UTC" : undefined;

    if (dateFromInput.value) {
      params.set("dateFrom", requireTimezones().zonedDateTimeToUtcIso(dateFromInput.value, "00:00:00", timezone));
    }

    if (dateToInput.value) {
      params.set("dateTo", requireTimezones().zonedDateTimeToUtcIso(dateToInput.value, "23:59:59", timezone));
    }

    if (userFilterSelect.value) {
      params.set("actorUserId", userFilterSelect.value);
    }

    if (clientFilterSelect.value) {
      params.set("clientId", clientFilterSelect.value);
    }

    if (projectFilterSelect.value) {
      params.set("projectId", projectFilterSelect.value);
    }

    if (recordTypeFilterSelect.value) {
      params.set("recordType", recordTypeFilterSelect.value);
    }

    if (changeTypeFilterSelect.value) {
      params.set("changeType", changeTypeFilterSelect.value);
    }

    if (workspaceFilterSelect.value) {
      params.set("workspaceId", workspaceFilterSelect.value);
    }

    return params;
  }

  function buildPageParams() {
    const params = buildFilterParams();
    const pageSize = getPageSize();

    params.set("limit", String(pageSize));
    params.set("offset", String((currentPage - 1) * pageSize));
    return params;
  }

  function normalizeOptions(options) {
    return Array.isArray(options)
      ? options
        .filter((option) => option && option.value)
        .map((option) => ({
          label: String(option.label || option.value),
          value: String(option.value),
        }))
      : [];
  }

  function normalizeEnumOptions(values) {
    return Array.isArray(values)
      ? values
        .filter(Boolean)
        .map((value) => String(value))
        .map((value) => ({ value, label: formatEnum(value) }))
      : [];
  }

  function populateWorkspaceOptions(workspaces, selectedWorkspaceId) {
    const options = normalizeOptions(workspaces);

    workspaceFilterControl.hidden = options.length === 0;

    if (options.length === 0) {
      workspaceFilterSelect.replaceChildren(createOption("", "Current workspace"));
      return;
    }

    replaceSelectOptions(workspaceFilterSelect, "Current workspace", options);
    workspaceFilterSelect.value = options.some((option) => option.value === selectedWorkspaceId)
      ? selectedWorkspaceId
      : workspaceFilterSelect.value;
  }

  function setDefaultWorkspaceFilter() {
    const contextWorkspaceId = window.LongtailForge?.workspaceContext?.workspaceId || "";

    if (contextWorkspaceId && [...workspaceFilterSelect.options].some((option) => option.value === contextWorkspaceId)) {
      workspaceFilterSelect.value = contextWorkspaceId;
    }
  }

  function updatePagination() {
    const totalPages = getTotalPages();

    previousPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;
    pageSummary.textContent = `Page ${Math.min(currentPage, totalPages)} of ${totalPages}`;
  }

  function updateStatus() {
    if (totalAuditLogs === 0) {
      setStatus("");
      return;
    }

    const pageSize = getPageSize();
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(start + auditLogs.length - 1, totalAuditLogs);

    const entryLabel = auditViewSelect.value === "security" ? "security events" : "audit log entries";
    setStatus(`Showing ${start}-${end} of ${totalAuditLogs} ${entryLabel}.`);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(totalAuditLogs / getPageSize()));
  }

  function normalizeCurrentPage() {
    return Math.min(Math.max(1, currentPage), getTotalPages());
  }

  function getPageSize() {
    return Number.parseInt(pageSizeSelect.value, 10) || 50;
  }

  function openAuditDetailDialog(log) {
    const dialog = createDialog("Audit Details", "audit-detail-dialog");
    const content = document.createElement("div");
    const actionRow = document.createElement("div");
    const closeButton = document.createElement("button");
    const jsonButton = document.createElement("button");
    const metadata = parseJson(log.metadata_json);

    content.className = "audit-detail-grid";
    appendDetail(content, "Date", formatDateTime(log.created_at));
    appendDetail(content, "User", log.actor_user_name || "None");
    appendDetail(content, "Action", log.action);
    appendDetail(content, "Change Type", formatEnum(log.change_type));
    appendDetail(content, "Record Type", formatEnum(log.record_type));
    if (metadata?.summary) {
      appendDetail(content, "Summary", metadata.summary);
    }
    appendDetail(content, "IP Address", log.ip_address);
    appendRecordDetail(content, log);
    appendDetail(content, "Audit ID", log.audit_id);

    jsonButton.type = "button";
    jsonButton.textContent = "View JSON";
    jsonButton.addEventListener("click", () => openJsonDialog(log));

    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => dialog.close());

    actionRow.className = "form-actions";
    actionRow.append(jsonButton, closeButton);
    dialog.querySelector("form").append(content, actionRow);
    showDialog(dialog);
  }

  function appendRecordDetail(container, log) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");

    label.textContent = "Record";

    if (log.record_url) {
      const link = document.createElement("a");
      link.href = log.record_url;
      link.textContent = log.record_label || log.record_id || "Open record";
      value.appendChild(link);
    } else {
      value.textContent = log.record_label || log.record_id || "None";
    }

    wrapper.append(label, value);
    container.appendChild(wrapper);
  }

  function openJsonDialog(log) {
    const dialog = createDialog("Audit JSON", "audit-json-dialog");
    const body = document.createElement("div");
    const closeButton = document.createElement("button");
    const actionRow = document.createElement("div");

    body.className = "audit-json-body";
    body.append(
      createJsonDetails("Previous Value", log.previous_value_json),
      createJsonDetails("New Value", log.new_value_json),
      createJsonDetails("Metadata", log.metadata_json),
    );

    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => dialog.close());
    actionRow.className = "form-actions";
    actionRow.appendChild(closeButton);

    dialog.querySelector("form").append(body, actionRow);
    showDialog(dialog);
  }

  function createJsonDetails(label, jsonText) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    const parsed = parseJson(jsonText);

    details.open = jsonText && jsonText.length < 800;
    summary.textContent = label;
    pre.textContent = parsed === null ? "None" : JSON.stringify(parsed, null, 2);
    details.append(summary, pre);
    return details;
  }

  function createDialog(title, className) {
    const trigger = document.activeElement;
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const headingId = `${className}-title-${Date.now()}`;

    dialog.className = `app-dialog ${className}`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", headingId);
    form.method = "dialog";
    form.className = "app-dialog-form";
    heading.id = headingId;
    heading.textContent = title;

    form.appendChild(heading);
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();

        if (trigger && typeof trigger.focus === "function") {
          trigger.focus();
        }
      },
      { once: true },
    );
    return dialog;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    const focusTarget = dialog.querySelector("button");
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  function appendDetail(container, labelText, valueText) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");

    label.textContent = labelText;
    value.textContent = valueText || "None";
    wrapper.append(label, value);
    container.appendChild(wrapper);
  }

  function normalizeAuditLog(log) {
    return {
      action: String(log.action || ""),
      actor_user_id: String(log.actor_user_id || ""),
      actor_user_name: String(log.actor_user_name || ""),
      audit_id: String(log.audit_id || ""),
      change_type: String(log.change_type || ""),
      created_at: String(log.created_at || ""),
      metadata_json: log.metadata_json || "",
      new_value_json: log.new_value_json || "",
      previous_value_json: log.previous_value_json || "",
      record_id: String(log.record_id || ""),
      record_label: String(log.record_label || ""),
      record_type: String(log.record_type || ""),
      record_url: String(log.record_url || ""),
      ip_address: String(log.ip_address || ""),
    };
  }

  function getAuditContext(log, metadata) {
    const newValue = parseJson(log.new_value_json);
    const previousValue = parseJson(log.previous_value_json);

    return {
      client_id: metadata?.client_id || newValue?.client_id || previousValue?.client_id || "",
      client_name: metadata?.client_name || newValue?.client_name || previousValue?.client_name || "",
      project_id: metadata?.project_id || newValue?.project_id || previousValue?.project_id || "",
      project_name: metadata?.project_name || newValue?.project_name || previousValue?.project_name || "",
    };
  }

  function getClientLabel(log, context) {
    if (context?.client_name) {
      return context.client_name;
    }

    if (log.record_type === "client") {
      return log.record_label || log.record_id;
    }

    return "None";
  }

  function getClientId(log, context) {
    if (context?.client_id) {
      return String(context.client_id);
    }

    return log.record_type === "client" ? log.record_id : "";
  }

  function getProjectLabel(log, context) {
    if (context?.project_name) {
      return context.project_name;
    }

    if (log.record_type === "project") {
      return log.record_label || log.record_id;
    }

    return "None";
  }

  function getProjectId(log, context) {
    if (context?.project_id) {
      return String(context.project_id);
    }

    return log.record_type === "project" ? log.record_id : "";
  }

  function createFilterButton(label, value, select) {
    const text = label || "None";

    if (!value || text === "None" || !select || ![...select.options].some((option) => option.value === value)) {
      return document.createTextNode(text);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-button audit-truncate";
    button.textContent = text;
    button.title = text;
    button.addEventListener("click", () => {
      select.value = value;
      currentPage = 1;
      loadAuditLogs();
    });
    return button;
  }

  function parseJson(jsonText) {
    if (!jsonText) {
      return null;
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      return jsonText;
    }
  }

  function createCell(content) {
    const cell = document.createElement("td");

    if (content && typeof content === "object" && typeof content.nodeType === "number") {
      cell.appendChild(content);
    } else {
      cell.textContent = content || "None";
      cell.title = cell.textContent;
      cell.classList.add("audit-truncate");
    }

    return cell;
  }

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function formatEnum(value) {
    return String(value || "")
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") || "None";
  }

  function formatDateTime(value) {
    const timezone = showUtcInput.checked ? "UTC" : undefined;

    return requireTimezones().formatDateTime(value, timezone) || "None";
  }

  function setStatus(message) {
    auditStatus.textContent = message;
  }
})();
