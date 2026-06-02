const auditFilterForm = document.querySelector("[data-audit-filters]");
const dateFromInput = document.querySelector("[data-audit-date-from]");
const dateToInput = document.querySelector("[data-audit-date-to]");
const userFilterSelect = document.querySelector("[data-audit-user-filter]");
const recordTypeFilterSelect = document.querySelector("[data-audit-record-type-filter]");
const changeTypeFilterSelect = document.querySelector("[data-audit-change-type-filter]");
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
  currentPage = 1;
  loadAuditLogs();
});

exportFilteredButton.addEventListener("click", () => {
  window.location.href = `/api/audit-logs/export.csv?${buildFilterParams().toString()}`;
});

exportAllButton.addEventListener("click", () => {
  window.location.href = "/api/audit-logs/export.csv";
});

pageSizeSelect.addEventListener("change", () => {
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

async function loadAuditLogs() {
  setStatus("Loading audit log...");

  try {
    const result = await window.LongtailForge.api.getJson(`/api/audit-logs?${buildPageParams().toString()}`, {
      cache: "no-store",
    });
    auditLogs = Array.isArray(result.auditLogs) ? result.auditLogs.map(normalizeAuditLog) : [];
    totalAuditLogs = Number.parseInt(result.pagination?.total, 10) || 0;
    const normalizedPage = normalizeCurrentPage();

    if (normalizedPage !== currentPage) {
      currentPage = normalizedPage;
      await loadAuditLogs();
      return;
    }

    populateFilterOptions(result.filterOptions);
    renderAuditLogs();
  } catch (error) {
    setStatus("Audit log could not be loaded.");
    console.error(error);
  }
}

async function initializeAuditLog() {
  await window.LongtailForge.timezones.loadSessionTimezone();
  await loadAuditLogs();
}

function populateFilterOptions(filterOptions = {}) {
  replaceSelectOptions(userFilterSelect, "All users", normalizeOptions(filterOptions.users));
  replaceSelectOptions(recordTypeFilterSelect, "All record types", normalizeEnumOptions(filterOptions.recordTypes));
  replaceSelectOptions(changeTypeFilterSelect, "All change types", normalizeEnumOptions(filterOptions.changeTypes));
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
    cell.textContent = "No audit log entries match these filters.";
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
    createCell(getClientLabel(log, metadata)),
    createCell(getProjectLabel(log, metadata)),
    createCell(formatEnum(log.record_type)),
    createCell(formatEnum(log.change_type)),
    createCell(detailsButton),
  );

  return row;
}

function buildFilterParams() {
  const params = new URLSearchParams();

  if (dateFromInput.value) {
    params.set("dateFrom", window.LongtailForge.timezones.zonedDateTimeToUtcIso(dateFromInput.value, "00:00:00"));
  }

  if (dateToInput.value) {
    params.set("dateTo", window.LongtailForge.timezones.zonedDateTimeToUtcIso(dateToInput.value, "23:59:59"));
  }

  if (userFilterSelect.value) {
    params.set("actorUserId", userFilterSelect.value);
  }

  if (recordTypeFilterSelect.value) {
    params.set("recordType", recordTypeFilterSelect.value);
  }

  if (changeTypeFilterSelect.value) {
    params.set("changeType", changeTypeFilterSelect.value);
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

  setStatus(`Showing ${start}-${end} of ${totalAuditLogs} audit log entries.`);
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

  content.className = "audit-detail-grid";
  appendDetail(content, "Date", formatDateTime(log.created_at));
  appendDetail(content, "User", log.actor_user_name || "None");
  appendDetail(content, "Action", log.action);
  appendDetail(content, "Change Type", formatEnum(log.change_type));
  appendDetail(content, "Record Type", formatEnum(log.record_type));
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
  };
}

function getClientLabel(log, metadata) {
  if (metadata?.client_name) {
    return metadata.client_name;
  }

  if (log.record_type === "client") {
    return log.record_label || log.record_id;
  }

  return "None";
}

function getProjectLabel(log, metadata) {
  if (metadata?.project_name) {
    return metadata.project_name;
  }

  if (log.record_type === "project") {
    return log.record_label || log.record_id;
  }

  return "None";
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
  return window.LongtailForge.timezones.formatDateTime(value) || "None";
}

function setStatus(message) {
  auditStatus.textContent = message;
}
