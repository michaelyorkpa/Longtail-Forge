const api = window.LongtailForge.api;
const view = window.LongtailForge?.view;
const state = {
  workspaceType: "business",
  clients: [],
  projects: [],
  fileRows: [],
};

let activeFilesViewDescriptor = null;
let filesBehaviorRegistered = false;
let filesEventsBound = false;
let filterForm = null;
let moduleFilter = null;
let targetTypeFilter = null;
let targetIdFilter = null;
let clientFilter = null;
let projectFilter = null;
let advancedProjectFilter = null;
let filenameFilter = null;
let statusFilter = null;
let fileStatus = null;
let fileList = null;
let fileTableMount = null;
let fileSummaryMount = null;
let fileDetailMount = null;
let selectedFileKey = "";
let activeFilesTooltip = null;
let activeFilesTooltipTarget = null;

buildFilesViewShell();
cacheFilesElements();
bindFilesEvents();

initialize();

async function initialize() {
  await window.LongtailForge.workspaceContextReady;
  applyWorkspaceContext();
  await loadFilterOptions();
  populateClientProjectFilters();
  await loadFiles();
}

function buildFilesViewShell() {
  const host = document.querySelector("[data-files-host]");
  if (!host || host.querySelector("[data-file-filters], [data-file-list]")) {
    return;
  }

  activeFilesViewDescriptor = filesViewSurfaceDescriptor();

  if (!view || typeof view.renderSurface !== "function") {
    host.replaceChildren(createFilesBrowseChrome());
    return;
  }

  registerFilesViewBehaviors();
  view.renderSurface({ ...activeFilesViewDescriptor, dataSource: null, modals: [] }, host);
}

function registerFilesViewBehaviors() {
  if (filesBehaviorRegistered || typeof view?.registerBehavior !== "function") {
    return;
  }

  filesBehaviorRegistered = true;
  view.registerBehavior("files.browse.legacy", ({ container }) => {
    container.replaceChildren(createFilesBrowseChrome());
  });
  view.registerBehavior("files.browse.filters", ({ container }) => {
    container.replaceChildren(createFilesFilterChrome());
  });
  view.registerBehavior("files.browse.results", ({ container }) => {
    container.replaceChildren(createFilesResultsChrome());
  });
}

function filesViewSurfaceDescriptor() {
  const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
  return surfaces.find((surface) => surface.id === "files.browse" && surface.moduleId === "framework")
    || fallbackFilesViewSurfaceDescriptor();
}

function fallbackFilesViewSurfaceDescriptor() {
  return {
    id: "files.browse",
    moduleId: "framework",
    viewId: "files",
    layout: "slide-out-sidebar",
    sidebarLabel: "File filters",
    pageHeader: {
      title: "Files",
      description: "Browse file attachments visible in this workspace.",
    },
    sidebarPanels: [
      {
        id: "files-browse-filters",
        type: "navigation",
        title: "Filters",
        behavior: "files.browse.filters",
        open: true,
        className: "files-filters-panel",
        ariaLabel: "Files filters",
      },
    ],
    detail: {
      regions: [
        {
          id: "files-browse-results",
          behavior: "files.browse.results",
          className: "files-browse-results-region",
          ariaLabel: "Files browse results",
        },
      ],
    },
    dataSource: {
      route: "/api/files/attachments",
      method: "GET",
      fieldBindings: {
        id: "fileAttachmentId",
        fileId: "fileId",
        title: "file.displayName",
        displayName: "file.displayName",
        filename: "file.originalFilename",
        extension: "file.extension",
        mimeType: "file.mimeTypeDetected",
        fileSizeBytes: "file.fileSizeBytes",
        moduleId: "moduleId",
        targetType: "targetType",
        targetLabel: "targetLabel",
        clientLabel: "clientLabel",
        projectLabel: "projectLabel",
        status: "file.status",
        scanStatus: "file.scanStatus",
        uploadedAt: "file.createdAt",
        uploadedByLabel: "file.uploadedByLabel",
        deletedAt: "file.deletedAt",
        attachedAt: "createdAt",
      },
    },
  };
}

function cacheFilesElements() {
  filterForm = document.querySelector("[data-file-filters]");
  moduleFilter = document.querySelector("[data-file-filter-module]");
  targetTypeFilter = document.querySelector("[data-file-filter-target-type]");
  targetIdFilter = document.querySelector("[data-file-filter-target-id]");
  clientFilter = document.querySelector("[data-file-filter-client]");
  projectFilter = document.querySelector("[data-file-filter-project]");
  advancedProjectFilter = document.querySelector("[data-file-filter-project-id]");
  filenameFilter = document.querySelector("[data-file-filter-filename]");
  statusFilter = document.querySelector("[data-file-filter-status]");
  fileStatus = document.querySelector("[data-file-status]");
  fileList = document.querySelector("[data-file-list]");
  fileTableMount = document.querySelector("[data-file-table-mount]");
  fileSummaryMount = document.querySelector("[data-file-summary-mount]");
  fileDetailMount = document.querySelector("[data-file-detail-mount]");
}

function createFilesBrowseChrome() {
  const fragment = document.createDocumentFragment();

  fragment.append(createFilesFilterChrome(), createFilesResultsChrome());
  return fragment;
}

function createFilesFilterChrome() {
  const form = document.createElement("form");
  const submitButton = document.createElement("button");

  form.className = "file-filters";
  form.dataset.fileFilters = "";
  form.append(
    createFilterLabel("Filename", createInput("search", "fileFilterFilename", { autocomplete: "off" })),
    createFilterLabel("Status", createStatusSelect()),
    createBusinessFilterLabel("Client", createClientSelect()),
    createFilterLabel("Project", createProjectSelect()),
    createAdvancedTargetFilters(),
  );
  submitButton.type = "submit";
  submitButton.textContent = "Apply";
  form.appendChild(submitButton);

  return form;
}

function createFilesResultsChrome() {
  requireFilesViewHelper("createListShell");
  const summaryMount = document.createElement("div");
  const tableMount = document.createElement("div");
  const detailMount = document.createElement("div");

  summaryMount.dataset.fileSummaryMount = "";
  summaryMount.appendChild(createFilesSummaryPanel([]));
  tableMount.dataset.fileTableMount = "";
  tableMount.appendChild(createFilesTable([]));
  detailMount.dataset.fileDetailMount = "";
  detailMount.appendChild(createFilesDetailPanel(null));
  return view.createListShell({
    className: "files-browse-list-shell",
    attrs: { "data-file-list-shell": "" },
    statusAttrs: { "data-file-status": "" },
    children: [summaryMount, tableMount, detailMount],
  });
}

function createFilterLabel(labelText, control) {
  const label = document.createElement("label");

  label.append(labelText, control);
  return label;
}

function createBusinessFilterLabel(labelText, control) {
  const label = createFilterLabel(labelText, control);

  label.dataset.fileBusinessControl = "";
  return label;
}

function createInput(type, dataKey, attributes = {}) {
  const input = document.createElement("input");

  input.type = type;
  input.dataset[dataKey] = "";
  Object.entries(attributes).forEach(([name, value]) => {
    input.setAttribute(name, value);
  });
  return input;
}

function createClientSelect() {
  const select = document.createElement("select");

  select.dataset.fileFilterClient = "";
  select.appendChild(createOption("", "All clients"));
  return select;
}

function createProjectSelect() {
  const select = document.createElement("select");

  select.dataset.fileFilterProject = "";
  select.appendChild(createOption("", "All projects"));
  return select;
}

function createStatusSelect() {
  const select = document.createElement("select");

  select.dataset.fileFilterStatus = "";
  [
    ["available", "Available"],
    ["deleted", "Deleted"],
    ["pending", "Pending"],
    ["quarantined", "Quarantined"],
    ["all", "All visible"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  return select;
}

function createAdvancedTargetFilters() {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const fields = document.createElement("div");

  details.className = "files-advanced-filters";
  summary.textContent = "Advanced target filters";
  fields.className = "files-advanced-filter-fields";
  fields.append(
    createFilterLabel("Module", createInput("text", "fileFilterModule", { placeholder: "tasks" })),
    createFilterLabel("Target Type", createInput("text", "fileFilterTargetType", { placeholder: "task" })),
    createFilterLabel("Target ID", createInput("text", "fileFilterTargetId", { autocomplete: "off" })),
    createFilterLabel("Project ID", createInput("text", "fileFilterProjectId", { autocomplete: "off" })),
  );
  details.append(summary, fields);
  return details;
}

function bindFilesEvents() {
  if (filesEventsBound) {
    return;
  }

  filesEventsBound = true;
  filterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadFiles();
  });
  clientFilter?.addEventListener("change", () => {
    populateProjectFilter();
    loadFiles();
  });
  [
    moduleFilter,
    targetTypeFilter,
    targetIdFilter,
    projectFilter,
    advancedProjectFilter,
    filenameFilter,
    statusFilter,
  ].forEach((control) => {
    control?.addEventListener("change", () => {
      loadFiles();
    });
  });
}

async function loadFilterOptions() {
  try {
    const clientProjects = await api.getJson("/api/client-projects", { cache: "no-store" });
    const normalizedClients = window.LongtailForge.clientProjectOptions?.normalizeClients?.(clientProjects) || [];

    state.clients = normalizedClients.filter((client) => client.id && !client.isWorkspaceScope);
    state.projects = flattenProjectOptions(normalizedClients);
  } catch {
    state.clients = [];
    state.projects = [];
  }
}

function flattenProjectOptions(clients) {
  const projects = [];

  clients.forEach((client) => {
    const clientLabel = window.LongtailForge.clientProjectOptions?.optionLabel?.(client)
      || client.displayName
      || client.name
      || "";

    (Array.isArray(client.projects) ? client.projects : []).forEach((project) => {
      if (!project?.id) {
        return;
      }

      projects.push({
        id: project.id,
        clientId: client.isWorkspaceScope ? "" : client.id,
        label: clientLabel ? `${clientLabel} / ${project.name || "Untitled Project"}` : project.name || "Untitled Project",
      });
    });
  });
  return projects.sort((left, right) => left.label.localeCompare(right.label));
}

function populateClientProjectFilters() {
  populateClientFilter();
  populateProjectFilter();
  applyWorkspaceContext();
}

function populateClientFilter() {
  if (!clientFilter) {
    return;
  }

  const previousValue = clientFilter.value;
  clientFilter.replaceChildren(
    createOption("", "All clients"),
    ...state.clients.map((client) => createOption(
      client.id,
      window.LongtailForge.clientProjectOptions?.optionLabel?.(client) || client.name || "Untitled Client",
    )),
  );
  clientFilter.value = state.clients.some((client) => client.id === previousValue) ? previousValue : "";
}

function populateProjectFilter() {
  if (!projectFilter) {
    return;
  }

  const previousValue = projectFilter.value;
  const selectedClientId = usesBusinessScope() ? clientFilter?.value || "" : "";
  const projects = selectedClientId
    ? state.projects.filter((project) => project.clientId === selectedClientId)
    : state.projects;

  projectFilter.replaceChildren(
    createOption("", "All projects"),
    ...projects.map((project) => createOption(project.id, project.label)),
  );
  projectFilter.value = projects.some((project) => project.id === previousValue) ? previousValue : "";
}

function createOption(value, label) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;
  return option;
}

async function loadFiles() {
  setStatus("Loading files...");

  try {
    const result = await api.getJson(`/api/files/attachments?${readFilters().toString()}`, { cache: "no-store" });

    renderFiles(result.attachments || []);
    setStatus("");
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    renderFiles([]);
    setStatus(error.message || "Files could not be loaded.", true);
  }
}

function readFilters() {
  const params = new URLSearchParams();
  const values = {
    moduleId: moduleFilter?.value,
    targetType: targetTypeFilter?.value,
    targetId: targetIdFilter?.value,
    clientId: usesBusinessScope() ? clientFilter?.value : "",
    projectId: projectFilter?.value || advancedProjectFilter?.value,
    filename: filenameFilter?.value,
    status: statusFilter?.value || "available",
  };

  Object.entries(values).forEach(([key, value]) => {
    const trimmed = String(value || "").trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  });
  return params;
}

function renderFiles(attachments) {
  const rows = attachments.map((attachment) => fileRow(attachment));

  state.fileRows = rows;
  reconcileSelectedFile(rows);
  renderFilesSummary(rows);
  renderFilesTable(rows);
  renderSelectedFileDetail();
}

function renderFilesSummary(rows) {
  if (fileSummaryMount) {
    fileSummaryMount.replaceChildren(createFilesSummaryPanel(rows));
  }
}

function renderFilesTable(rows) {
  if (fileTableMount) {
    fileTableMount.replaceChildren(createFilesTable(rows));
    fileList = fileTableMount.querySelector("[data-file-list]");
    return;
  }

  if (!fileList) {
    return;
  }

  const table = createFilesTable(rows);
  const nextList = table.querySelector("[data-file-list]");
  fileList.replaceChildren(...Array.from(nextList?.children || []));
}

function renderSelectedFileDetail() {
  if (fileDetailMount) {
    fileDetailMount.replaceChildren(createFilesDetailPanel(selectedFileRow()));
  }
}

function fileRow(attachment) {
  const file = attachment.file || {};
  const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id || "";
  const fileId = attachment.fileId || attachment.file_id;
  const targetLabel = attachment.targetLabel || attachment.target_label || attachment.target?.label || "";
  const targetType = attachment.targetType || attachment.target_type || "";
  const clientLabel = attachment.clientLabel || attachment.client_label || "";
  const projectLabel = attachment.projectLabel || attachment.project_label || "";
  const fileName = readableFileName(file);
  const status = file.status || "available";
  const scanStatus = file.scanStatus || file.scan_status || "";
  const extension = file.extension || extensionFromFilename(file.originalFilename || fileName);
  const fileTypeLabel = fileTypeDisplay(extension, file.mimeTypeDetected || file.mime_type_detected);

  return {
    attachment,
    attachmentId,
    file: {
      ...file,
      displayName: file.displayName || fileName,
      originalFilename: file.originalFilename || fileName,
    },
    fileId,
    fileName,
    selectionKey: fileSelectionKey(attachmentId, fileId, fileName),
    extension,
    fileTypeLabel,
    moduleLabel: formatToken(attachment.moduleId || attachment.module_id || ""),
    targetLabel: formatTargetDisplay(targetType, targetLabel),
    clientLabel,
    projectLabel,
    fileStatus: status,
    scanStatus,
    fileStatusLabel: formatToken(status),
    scanStatusLabel: scanStatusLabel(scanStatus),
    statusLabel: statusLabel(status, scanStatus),
    attachedAtLabel: formatDate(attachment.createdAt || attachment.created_at),
    uploadedAtLabel: formatDate(file.createdAt || file.created_at),
    deletedAtLabel: formatDate(file.deletedAt || file.deleted_at),
    uploadedByLabel: file.uploadedByLabel || file.uploaded_by_label || "",
    fileSizeLabel: formatBytes(file.fileSizeBytes || file.file_size_bytes),
    downloadable: Boolean(fileId && status === "available" && ["not_required", "passed"].includes(scanStatus)),
    deletable: Boolean(fileId && status !== "deleted"),
    restorable: Boolean(fileId && status === "deleted"),
    availabilityHint: fileAvailabilityHint(status, scanStatus),
  };
}

function createFilesTable(rows) {
  requireFilesViewHelper("createDataTable");
  const table = view.createDataTable({
    className: "files-table-wrap",
    tableClassName: "files-table",
    columns: filesTableColumns(),
    rows,
    emptyMessage: "No files match the current filters.",
  });
  const tbody = table.querySelector("tbody");

  if (tbody) {
    tbody.dataset.fileList = "";
    rows.forEach((row, rowIndex) => {
      const tableRow = tbody.children[rowIndex];

      if (tableRow) {
        wireSelectableFileRow(tableRow, row, rowIndex);
      }
    });
  }
  return table;
}

function filesTableColumns() {
  const columns = [
    { key: "fileName", label: "File", header: true, render: createFileCell },
    { key: "moduleLabel", label: "Module" },
    { key: "targetLabel", label: "Target", render: (row) => createTruncatedText(row.targetLabel, "files-target-label") },
  ];

  if (usesBusinessScope()) {
    columns.push({ key: "clientLabel", label: "Client", render: (row) => createTruncatedText(row.clientLabel, "files-client-label") });
  }

  columns.push(
    { key: "projectLabel", label: "Project", render: (row) => createTruncatedText(row.projectLabel, "files-project-label") },
    { key: "statusLabel", label: "Status", render: createFileStatusCell },
    { key: "attachedAtLabel", label: "Attached" },
    { key: "actions", label: "Actions", align: "right", render: createFileActions },
  );
  return columns;
}

function createFileCell(row) {
  const cell = document.createElement("span");

  cell.className = "files-file-cell";
  cell.append(createFileTypeIcon(row), createTruncatedText(row.fileName, "files-file-name"));
  return cell;
}

function createFileTypeIcon(row) {
  const iconWrapper = document.createElement("span");
  const label = document.createElement("span");

  iconWrapper.className = "files-file-type-icon";
  iconWrapper.setAttribute("aria-label", row.fileTypeLabel);
  iconWrapper.dataset.fileType = safeFileTypeToken(row.extension || row.fileTypeLabel);
  label.className = "files-file-type-label";
  label.textContent = fileTypeBadgeText(row.extension, row.fileTypeLabel);
  iconWrapper.appendChild(label);
  return iconWrapper;
}

function createTruncatedText(value, className = "") {
  const text = String(value || "").trim();
  const span = document.createElement("span");

  span.className = ["files-truncate", className].filter(Boolean).join(" ");
  span.textContent = text;
  if (text) {
    span.dataset.fullText = text;
    span.tabIndex = 0;
    span.setAttribute("aria-label", text);
    span.addEventListener("pointerenter", () => showFilesTooltip(span, text));
    span.addEventListener("pointerleave", hideFilesTooltip);
    span.addEventListener("focus", () => showFilesTooltip(span, text));
    span.addEventListener("blur", hideFilesTooltip);
    span.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideFilesTooltip();
      }
    });
  }
  return span;
}

function showFilesTooltip(target, text) {
  hideFilesTooltip();

  activeFilesTooltip = document.createElement("div");
  activeFilesTooltip.id = `files-floating-tooltip-${Date.now()}`;
  activeFilesTooltip.className = "files-floating-tooltip";
  activeFilesTooltip.setAttribute("role", "tooltip");
  activeFilesTooltip.textContent = text;
  activeFilesTooltipTarget = target;
  target.setAttribute("aria-describedby", activeFilesTooltip.id);
  document.body.appendChild(activeFilesTooltip);
  positionFilesTooltip();
  window.addEventListener("scroll", positionFilesTooltip, true);
  window.addEventListener("resize", positionFilesTooltip);
}

function hideFilesTooltip() {
  if (activeFilesTooltipTarget) {
    activeFilesTooltipTarget.removeAttribute("aria-describedby");
  }
  if (activeFilesTooltip) {
    activeFilesTooltip.remove();
  }
  window.removeEventListener("scroll", positionFilesTooltip, true);
  window.removeEventListener("resize", positionFilesTooltip);
  activeFilesTooltip = null;
  activeFilesTooltipTarget = null;
}

function positionFilesTooltip() {
  if (!activeFilesTooltip || !activeFilesTooltipTarget) {
    return;
  }

  const gap = 6;
  const viewportPadding = 8;
  const targetRect = activeFilesTooltipTarget.getBoundingClientRect();
  const tooltipRect = activeFilesTooltip.getBoundingClientRect();
  const maxLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
  const left = Math.min(Math.max(targetRect.left, viewportPadding), maxLeft);
  let top = targetRect.bottom + gap;

  if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, targetRect.top - tooltipRect.height - gap);
  }

  activeFilesTooltip.style.left = `${left}px`;
  activeFilesTooltip.style.top = `${top}px`;
}

function createFileStatusCell(row) {
  const status = createTruncatedText(row.statusLabel, "file-status-cell");

  if (row.fileSizeLabel) {
    status.dataset.fileSize = row.fileSizeLabel;
  }
  return status;
}

function createFileActions(row) {
  const actions = document.createElement("div");

  actions.className = "files-row-actions surface-dense-actions";
  if (row.downloadable) {
    actions.appendChild(createDownloadAction(row));
  }
  if (row.deletable) {
    actions.appendChild(createDeleteAction(row));
  }
  if (row.restorable) {
    actions.appendChild(createRestoreAction(row));
  }
  return actions;
}

function createFilesSummaryPanel(rows) {
  requireFilesViewHelper("createInfoPanel");
  requireFilesViewHelper("createDetailBadgeRow");
  const unavailableCount = rows.filter((row) => !row.downloadable).length;
  const attentionCount = rows.filter((row) => fileNeedsAttention(row)).length;
  const panel = view.createInfoPanel({
    className: "files-summary-panel",
    title: "Browse Summary",
    message: filesSummaryMessage(rows, unavailableCount, attentionCount),
    items: [
      { label: "Results", value: resultCountLabel(rows.length) },
      { label: "Filters", value: currentFilterSummary() },
      { label: "Unavailable", value: unavailableCount ? resultCountLabel(unavailableCount, "file") : "None" },
      { label: "Scan Review", value: attentionCount ? resultCountLabel(attentionCount, "file") : "None" },
    ],
  });

  panel.appendChild(view.createDetailBadgeRow({
    className: "files-summary-badges",
    badges: [
      { label: "Visible", value: String(rows.length) },
      { label: "Unavailable", value: String(unavailableCount) },
      { label: "Review", value: String(attentionCount) },
    ],
  }));
  return panel;
}

function createFilesDetailPanel(row) {
  requireFilesViewHelper("createElement");
  requireFilesViewHelper("createInfoPanel");
  const detail = view.createElement("div", {
    className: "files-detail-grid",
    attrs: { "data-file-detail-grid": "" },
  });

  if (!row) {
    detail.appendChild(view.createInfoPanel({
      className: "files-detail-empty",
      title: "File Details",
      message: "Select a file row to review its context and availability.",
    }));
    return detail;
  }

  detail.append(
    createSelectedFileHeaderPanel(row),
    createFilesPreviewPanel(row),
    createFilesMetadataPanel(row),
  );
  return detail;
}

function createSelectedFileHeaderPanel(row) {
  requireFilesViewHelper("createDetailHeader");
  requireFilesViewHelper("createElement");
  const panel = view.createElement("section", {
    className: ["files-selected-detail", "surface-main-panel"],
    attrs: { "aria-label": "Selected file" },
  });

  panel.appendChild(view.createDetailHeader({
    title: row.fileName,
    meta: row.targetLabel || row.moduleLabel || "File",
    badges: [
      { label: "Status", value: row.fileStatusLabel },
      { label: "Scan", value: row.scanStatusLabel },
      { label: "Type", value: row.fileTypeLabel },
      row.fileSizeLabel ? { label: "Size", value: row.fileSizeLabel } : null,
    ],
  }));
  panel.appendChild(view.createElement("p", {
    className: "files-availability-hint view-info-panel-message",
    text: row.availabilityHint,
  }));
  return panel;
}

function createFilesPreviewPanel(row) {
  const actions = row.downloadable ? [createDetailDownloadAction(row)] : [];

  return view.createInfoPanel({
    className: "files-preview-panel",
    title: "Preview",
    message: previewMessage(row),
    actions,
  });
}

function createFilesMetadataPanel(row) {
  const items = [
    { label: "Status", value: row.fileStatusLabel },
    { label: "Scan", value: row.scanStatusLabel },
    { label: "Module", value: row.moduleLabel || "Workspace" },
    { label: "Target", value: row.targetLabel || "No readable target" },
    usesBusinessScope() ? { label: "Client", value: row.clientLabel || "None" } : null,
    { label: "Project", value: row.projectLabel || "None" },
    { label: "Size", value: row.fileSizeLabel || "Unknown" },
    { label: "Uploaded", value: row.uploadedAtLabel || "Unknown" },
    { label: "Attached", value: row.attachedAtLabel || "Unknown" },
    { label: "Uploader", value: row.uploadedByLabel || "Unavailable" },
    row.deletedAtLabel ? { label: "Deleted", value: row.deletedAtLabel } : null,
    { label: "Availability", value: row.availabilityHint },
  ].filter(Boolean);

  return view.createInfoPanel({
    className: "files-metadata-panel",
    title: "Metadata",
    items,
  });
}

function createDetailDownloadAction(row) {
  const action = createDownloadAction(row);

  action.classList.add("files-detail-download-action");
  return action;
}

function createDownloadAction(row) {
  const link = document.createElement("a");
  const label = `Download ${row.fileName}`;
  const icon = window.LongtailForge.icons?.createIcon?.("download", { decorative: true });

  link.href = `/api/files/${encodeURIComponent(row.fileId)}/download`;
  link.className = "action-button icon-button files-row-action";
  link.setAttribute("download", "");
  link.setAttribute("aria-label", label);
  link.title = label;
  link.dataset.fileAction = "download";
  if (icon) {
    link.appendChild(icon);
  } else {
    link.textContent = "Download";
  }
  return link;
}

function createDeleteAction(row) {
  const button = view.createActionButton({
    icon: "delete",
    iconOnly: true,
    label: `Delete ${row.fileName}`,
    text: "",
    title: `Delete ${row.fileName}`,
    variant: "danger",
    action: "delete-file",
    className: "files-row-action",
    onClick: () => deleteFile(row.fileId, row.file),
  });

  button.dataset.fileAction = "delete";
  return button;
}

function reconcileSelectedFile(rows) {
  if (!rows.length) {
    selectedFileKey = "";
    return;
  }

  if (rows.some((row) => row.selectionKey === selectedFileKey)) {
    return;
  }

  selectedFileKey = rows[0].selectionKey;
}

function selectedFileRow() {
  return state.fileRows.find((row) => row.selectionKey === selectedFileKey) || null;
}

function selectFileRowByIndex(rowIndex) {
  const row = state.fileRows[rowIndex];

  if (!row) {
    return;
  }

  selectedFileKey = row.selectionKey;
  updateFilesTableSelection();
  renderSelectedFileDetail();
}

function updateFilesTableSelection() {
  document.querySelectorAll("[data-file-selectable-row]").forEach((row) => {
    const rowIndex = Number(row.dataset.fileRowIndex);
    const fileRowData = state.fileRows[rowIndex];
    const selected = Boolean(fileRowData && fileRowData.selectionKey === selectedFileKey);

    row.classList.toggle("is-selected", selected);
    row.toggleAttribute("data-file-selected-row", selected);
    if (selected) {
      row.setAttribute("aria-current", "true");
    } else {
      row.removeAttribute("aria-current");
    }
  });
}

function wireSelectableFileRow(tableRow, row, rowIndex) {
  tableRow.dataset.fileSelectableRow = "";
  tableRow.dataset.fileRowIndex = String(rowIndex);
  tableRow.tabIndex = 0;
  tableRow.setAttribute("aria-label", `Select ${row.fileName}`);
  if (row.selectionKey === selectedFileKey) {
    tableRow.classList.add("is-selected");
    tableRow.dataset.fileSelectedRow = "";
    tableRow.setAttribute("aria-current", "true");
  }
  tableRow.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) {
      return;
    }
    selectFileRowByIndex(rowIndex);
  });
  tableRow.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectFileRowByIndex(rowIndex);
    }
  });
}

function createRestoreAction(row) {
  const button = view.createActionButton({
    icon: "restore",
    iconOnly: true,
    label: `Restore ${row.fileName}`,
    text: "",
    title: `Restore ${row.fileName}`,
    action: "restore-file",
    className: "files-row-action",
    onClick: () => restoreFile(row.fileId),
  });

  button.dataset.fileAction = "restore";
  return button;
}

function applyWorkspaceContext() {
  const context = window.LongtailForge?.workspaceContext || {};
  state.workspaceType = context.workspaceType || "business";
  document.querySelectorAll("[data-file-business-control]").forEach((element) => {
    element.hidden = !usesBusinessScope();
  });
  if (clientFilter) {
    clientFilter.disabled = !usesBusinessScope();
    if (!usesBusinessScope()) {
      clientFilter.value = "";
    }
  }
}

function usesBusinessScope() {
  return state.workspaceType === "business";
}

async function deleteFile(fileId, file = {}) {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Delete file?",
    message: `Delete "${file.displayName || file.originalFilename || "this file"}"? The file will be unavailable from attachments, but workspace admins can restore it during the retention window.`,
    confirmLabel: "Delete File",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Deleting file...");

  try {
    await api.postJson(`/api/files/${encodeURIComponent(fileId)}/delete`, {});
    await loadFiles();
  } catch (error) {
    setStatus(error.message || "File was not deleted.", true);
  }
}

async function restoreFile(fileId) {
  setStatus("Restoring file...");

  try {
    await api.postJson(`/api/files/${encodeURIComponent(fileId)}/restore`, {});
    await loadFiles();
  } catch (error) {
    setStatus(error.message || "File was not restored.", true);
  }
}

function statusLabel(status, scanStatus) {
  if (status === "quarantined") {
    return "Quarantined";
  }
  if (status === "pending" || scanStatus === "pending") {
    return "Pending scan";
  }
  if (scanStatus === "error") {
    return "Scan error";
  }

  return formatToken(status);
}

function scanStatusLabel(scanStatus) {
  if (!scanStatus) {
    return "Not reported";
  }
  if (scanStatus === "not_required") {
    return "Not required";
  }
  return formatToken(scanStatus);
}

function fileAvailabilityHint(status, scanStatus) {
  if (status === "deleted") {
    return "Deleted files stay visible for history and may be restored when allowed.";
  }
  if (status === "quarantined") {
    return "Unavailable while under review.";
  }
  if (status === "pending" || scanStatus === "pending") {
    return "Waiting for scan before download.";
  }
  if (scanStatus === "failed" || scanStatus === "error") {
    return "Unavailable until scan review is resolved.";
  }
  if (status === "available" && ["not_required", "passed"].includes(scanStatus)) {
    return "Available for download.";
  }
  return "Unavailable for download.";
}

function previewMessage(row) {
  if (row.downloadable) {
    return "Download is available for this file.";
  }
  return row.availabilityHint;
}

function fileNeedsAttention(row) {
  return row.fileStatus === "quarantined"
    || row.fileStatus === "pending"
    || ["pending", "failed", "error"].includes(row.scanStatus);
}

function filesSummaryMessage(rows, unavailableCount, attentionCount) {
  if (!rows.length) {
    return "No files match the current filters.";
  }
  if (attentionCount) {
    return `${resultCountLabel(rows.length)} visible, with ${resultCountLabel(attentionCount)} needing scan review.`;
  }
  if (unavailableCount) {
    return `${resultCountLabel(rows.length)} visible, with ${resultCountLabel(unavailableCount)} unavailable for download.`;
  }
  return `${resultCountLabel(rows.length)} visible.`;
}

function resultCountLabel(count, noun = "file") {
  const safeCount = Number(count || 0);

  return `${safeCount} ${noun}${safeCount === 1 ? "" : "s"}`;
}

function currentFilterSummary() {
  const filters = [];
  const filename = String(filenameFilter?.value || "").trim();

  if (filename) {
    filters.push(`Filename contains "${filename}"`);
  }
  if (statusFilter?.value && statusFilter.value !== "available") {
    filters.push(`Status ${selectedOptionText(statusFilter)}`);
  }
  if (usesBusinessScope() && clientFilter?.value) {
    filters.push(`Client ${selectedOptionText(clientFilter)}`);
  }
  if (projectFilter?.value) {
    filters.push(`Project ${selectedOptionText(projectFilter)}`);
  }
  if (
    moduleFilter?.value
    || targetTypeFilter?.value
    || targetIdFilter?.value
    || advancedProjectFilter?.value
  ) {
    filters.push("Advanced target filters active");
  }
  return filters.length ? filters.join("; ") : "Available files";
}

function selectedOptionText(select) {
  return select.selectedOptions?.[0]?.textContent?.trim() || select.value || "";
}

function readableFileName(file = {}) {
  return String(file.displayName || file.originalFilename || "File").trim() || "File";
}

function extensionFromFilename(filename) {
  const match = String(filename || "").match(/\.([A-Za-z0-9]+)$/);

  return match ? match[1].toLowerCase() : "";
}

function fileTypeDisplay(extension, mimeType) {
  const normalizedExtension = String(extension || "").replace(/^\./, "").toUpperCase();
  const normalizedMimeType = String(mimeType || "").trim();

  if (normalizedExtension) {
    return `${normalizedExtension} file`;
  }
  return normalizedMimeType || "File";
}

function fileTypeBadgeText(extension, fallback) {
  const normalizedExtension = String(extension || "").replace(/^\./, "").trim().toUpperCase();
  const normalizedFallback = String(fallback || "").split(/[\s/.-]+/).find(Boolean) || "File";

  return (normalizedExtension || normalizedFallback).slice(0, 4).toUpperCase();
}

function safeFileTypeToken(value) {
  return String(value || "file")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function fileSelectionKey(attachmentId, fileId, fileName) {
  return [attachmentId, fileId, fileName].filter(Boolean).join(":") || "file";
}

function formatTargetDisplay(targetType, targetLabel) {
  if (targetLabel) {
    return targetType ? `${formatToken(targetType)}: ${targetLabel}` : targetLabel;
  }

  return targetType ? formatToken(targetType) : "";
}

function formatToken(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatBytes(value) {
  const bytes = Number(value || 0);

  if (!bytes) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStatus(message, isError = false) {
  if (!fileStatus) {
    return;
  }

  fileStatus.textContent = message;
  fileStatus.classList.toggle("error-text", isError);
}

function requireFilesViewHelper(name) {
  const helper = view?.[name];

  if (typeof helper !== "function") {
    throw new Error(`Files browse requires LongtailForge.view.${name}.`);
  }
  return helper;
}
