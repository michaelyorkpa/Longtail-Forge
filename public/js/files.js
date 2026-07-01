const api = window.LongtailForge.api;
const view = window.LongtailForge?.view;
const state = {
  workspaceType: "business",
  attachments: [],
  clients: [],
  pagination: {
    hasMore: false,
    nextCursor: "",
  },
  projects: [],
};
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
const IMAGE_PREVIEW_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png"]);
const MARKDOWN_PREVIEW_EXTENSIONS = new Set(["md"]);
const TEXT_PREVIEW_EXTENSIONS = new Set(["txt"]);
const FILE_REPORT_REASON = "security";
const FILE_QUARANTINE_REASON = "manual_quarantine";
const FILES_PAGE_SIZE = 50;

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
let filePagination = null;
let fileTableMount = null;
let loadMoreFilesButton = null;
let activeFilesTooltip = null;
let activeFilesTooltipTarget = null;
let activeFileEditorDialog = null;
let activeFilePreviewDialog = null;
let fileEditorOptionRequestId = 0;

window.LongtailForge.filesDialog = Object.freeze({
  ...(window.LongtailForge.filesDialog || {}),
  openFileEditor,
  openFilePreview,
});

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

  requireFilesViewHelper("renderSurface");

  registerFilesViewBehaviors();
  view.renderSurface({ ...activeFilesViewDescriptor, dataSource: null, modals: [] }, host);
}

function registerFilesViewBehaviors() {
  if (filesBehaviorRegistered || typeof view?.registerBehavior !== "function") {
    return;
  }

  filesBehaviorRegistered = true;
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
  filePagination = document.querySelector("[data-file-pagination]");
  fileTableMount = document.querySelector("[data-file-table-mount]");
  loadMoreFilesButton = document.querySelector("[data-file-load-more]");
}

function createFilesFilterChrome() {
  return createFilesElement("form", {
    className: "file-filters",
    dataset: { fileFilters: "" },
    children: [
      createFilterLabel("Filename", createInput("search", "fileFilterFilename", { autocomplete: "off" })),
      createFilterLabel("Status", createStatusSelect()),
      createBusinessFilterLabel("Client", createClientSelect()),
      createFilterLabel("Project", createProjectSelect()),
      createAdvancedTargetFilters(),
      createFilesElement("button", {
        attrs: { type: "submit" },
        text: "Apply",
      }),
    ],
  });
}

function createFilesResultsChrome() {
  requireFilesViewHelper("createListShell");
  const tableMount = createFilesElement("div", {
    dataset: { fileTableMount: "" },
    children: [createFilesTable([])],
  });

  return view.createListShell({
    className: "files-browse-list-shell",
    attrs: { "data-file-list-shell": "" },
    statusAttrs: { "data-file-status": "" },
    children: [
      tableMount,
      createFilesPaginationChrome(),
    ],
  });
}

function createFilesPaginationChrome() {
  return createFilesElement("div", {
    attrs: { hidden: "" },
    className: "files-pagination",
    dataset: { filePagination: "" },
    children: [
      createFilesElement("button", {
        attrs: { type: "button" },
        dataset: { fileLoadMore: "" },
        text: "Load More",
      }),
    ],
  });
}

function createFilterLabel(labelText, control) {
  return createFilesElement("label", {
    children: [labelText, control],
  });
}

function createBusinessFilterLabel(labelText, control) {
  const label = createFilterLabel(labelText, control);

  label.dataset.fileBusinessControl = "";
  return label;
}

function createInput(type, dataKey, attributes = {}) {
  return createFilesElement("input", {
    attrs: { type, ...attributes },
    dataset: { [dataKey]: "" },
  });
}

function createClientSelect() {
  return createFilesElement("select", {
    dataset: { fileFilterClient: "" },
    children: [createOption("", "All clients")],
  });
}

function createProjectSelect() {
  return createFilesElement("select", {
    dataset: { fileFilterProject: "" },
    children: [createOption("", "All projects")],
  });
}

function createStatusSelect() {
  return createFilesElement("select", {
    dataset: { fileFilterStatus: "" },
    children: [
      ["available", "Available"],
      ["deleted", "Unavailable"],
      ["pending", "Review pending"],
      ["quarantined", "In review"],
      ["all", "All visible"],
    ].map(([value, label]) => createOption(value, label)),
  });
}

function createAdvancedTargetFilters() {
  return createFilesElement("details", {
    className: "files-advanced-filters",
    children: [
      createFilesElement("summary", { text: "Advanced target filters" }),
      createFilesElement("div", {
        className: "files-advanced-filter-fields",
        children: [
          createFilterLabel("Module", createInput("text", "fileFilterModule", { placeholder: "tasks" })),
          createFilterLabel("Target Type", createInput("text", "fileFilterTargetType", { placeholder: "task" })),
          createFilterLabel("Target ID", createInput("text", "fileFilterTargetId", { autocomplete: "off" })),
          createFilterLabel("Project ID", createInput("text", "fileFilterProjectId", { autocomplete: "off" })),
        ],
      }),
    ],
  });
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
  loadMoreFilesButton?.addEventListener("click", () => {
    if (!state.pagination.nextCursor) {
      return;
    }

    loadFiles({ append: true, cursor: state.pagination.nextCursor });
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
        label: clientLabel ? `${clientLabel} / ${project.optionLabel || project.name || "Untitled Project"}` : project.optionLabel || project.name || "Untitled Project",
        projectLabel: project.optionLabel || project.name || "Untitled Project",
      });
    });
  });
  return projects;
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
    ...projects.map((project) => createOption(project.id, selectedClientId ? project.projectLabel : project.label)),
  );
  projectFilter.value = projects.some((project) => project.id === previousValue) ? previousValue : "";
}

function createOption(value, label) {
  return createFilesElement("option", {
    attrs: { value },
    text: label,
  });
}

async function loadFiles(options = {}) {
  setStatus("Loading file attachments...");
  updateFilesPagination({ loading: true });

  try {
    const params = readFilters();

    params.set("limit", String(FILES_PAGE_SIZE));
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }

    const result = await api.getJson(`/api/files/attachments?${params.toString()}`, { cache: "no-store" });
    const attachments = result.attachments || [];
    state.attachments = options.append ? [...state.attachments, ...attachments] : attachments;
    state.pagination = normalizeFilesPagination(result.pagination);

    renderFiles(state.attachments);
    updateFilesPagination();
    setStatus(visibleFileCountLabel(state.attachments.length, state.pagination));
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    state.attachments = [];
    state.pagination = { hasMore: false, nextCursor: "" };
    renderFiles([]);
    updateFilesPagination();
    setStatus(error.message || "Files could not be loaded.", true);
  }
}

function normalizeFilesPagination(pagination = {}) {
  const nextCursor = String(pagination.nextCursor || pagination.next_cursor || "").trim();

  return {
    hasMore: pagination.hasMore === true && Boolean(nextCursor),
    nextCursor,
  };
}

function updateFilesPagination(options = {}) {
  if (!filePagination || !loadMoreFilesButton) {
    return;
  }

  const hasMore = state.pagination.hasMore === true && Boolean(state.pagination.nextCursor);

  filePagination.hidden = !hasMore;
  loadMoreFilesButton.disabled = options.loading === true || !hasMore;
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

  renderFilesTable(rows);
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
  const fileSizeBytes = Number(file.fileSizeBytes || file.file_size_bytes || 0);
  const canManageReview = canManageFileReview(attachment, file, fileId);
  const preview = previewAvailabilityForRow({
    canPreviewInReview: canManageReview,
    extension,
    fileSizeBytes,
    scanStatus,
    status,
  });
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
    extension,
    fileTypeLabel,
    moduleId: attachment.moduleId || attachment.module_id || "",
    moduleLabel: formatToken(attachment.moduleId || attachment.module_id || ""),
    targetId: attachment.targetId || attachment.target_id || "",
    targetType,
    targetLabel: formatTargetDisplay(targetType, targetLabel),
    clientId: attachment.clientId || attachment.client_id || "",
    clientLabel,
    projectId: attachment.projectId || attachment.project_id || "",
    projectLabel,
    scanStatus,
    status,
    statusLabel: statusLabel(status, scanStatus),
    attachedAtLabel: formatDate(attachment.createdAt || attachment.created_at),
    uploadedAtLabel: formatDate(file.createdAt || file.created_at),
    uploadedByLabel: file.uploadedByLabel || file.uploaded_by_label || "",
    fileSizeBytes,
    fileSizeLabel: formatBytes(fileSizeBytes),
    previewKind: preview.kind,
    previewReason: preview.reason,
    previewable: preview.state === "previewable",
    previewState: preview.state,
    downloadable: Boolean(fileId && status === "available" && ["not_required", "passed"].includes(scanStatus)),
    deletable: Boolean(fileId && status !== "deleted"),
    restorable: Boolean(fileId && status === "deleted"),
    reviewable: canMarkReviewedFileRow({ canManageReview, fileId, scanStatus, status }),
    reportable: canReportFileRow(attachment, file, fileId, status),
    quarantineable: canQuarantineFileRow(attachment, file, fileId, status),
  };
}

function createFilesTable(rows) {
  requireFilesViewHelper("createDataTable");
  const table = view.createDataTable({
    className: "files-table-wrap",
    tableClassName: "files-table",
    columns: filesTableColumns(),
    rows,
    emptyMessage: "No file attachments match the current filters.",
  });
  const tbody = table.querySelector("tbody");

  if (tbody) {
    tbody.dataset.fileList = "";
    wireFilesTableRows(tbody, rows);
  }
  return table;
}

function wireFilesTableRows(tbody, rows) {
  Array.from(tbody.querySelectorAll("tr")).forEach((rowElement, index) => {
    const row = rows[index];

    if (!row?.attachmentId) {
      return;
    }

    wireFileTableRow(rowElement, row);
  });
}

function wireFileTableRow(rowElement, row) {
  rowElement.tabIndex = 0;
  rowElement.dataset.fileEditorRow = "";
  rowElement.dataset.fileAttachmentId = row.attachmentId;
  rowElement.setAttribute("aria-label", `Edit File Context for ${row.fileName}`);

  rowElement.addEventListener("click", (event) => {
    if (isFileRowActionEvent(event)) {
      return;
    }

    openFileEditor(row, { trigger: rowElement });
  });

  rowElement.addEventListener("keydown", (event) => {
    if (event.target !== rowElement || event.key !== "Enter" || isFileRowActionEvent(event)) {
      return;
    }

    event.preventDefault();
    openFileEditor(row, { trigger: rowElement });
  });
}

function isFileRowActionEvent(event) {
  return Boolean(event.target?.closest?.("[data-file-action], a, button, input, select, textarea"));
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
  return createFilesElement("span", {
    className: "files-file-cell",
    children: [
      createFileTypeIcon(row),
      createTruncatedText(row.fileName, "files-file-name"),
    ],
  });
}

function createFileTypeIcon(row) {
  return createFilesElement("span", {
    className: "files-file-type-icon",
    attrs: { "aria-label": row.fileTypeLabel },
    dataset: { fileType: safeFileTypeToken(row.extension || row.fileTypeLabel) },
    children: [
      createFilesElement("span", {
        className: "files-file-type-label",
        text: fileTypeBadgeText(row.extension, row.fileTypeLabel),
      }),
    ],
  });
}

function createTruncatedText(value, className = "") {
  const text = String(value || "").trim();
  const span = createFilesElement("span", {
    className: ["files-truncate", className].filter(Boolean).join(" "),
    text,
  });

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

  activeFilesTooltip = createFilesElement("div", {
    className: "files-floating-tooltip",
    attrs: { role: "tooltip" },
    text,
  });
  activeFilesTooltip.id = `files-floating-tooltip-${Date.now()}`;
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
  const reviewLabel = reviewStateLabel(row.status, row.scanStatus);
  const chips = [
    createFileStatusChip(row.status, row.statusLabel),
    createFileScanStatusChip(row.scanStatus, reviewLabel, row.statusLabel),
  ].filter(Boolean);
  const status = createFilesElement("span", {
    className: "file-status-cell surface-chip-row",
    children: chips,
  });

  if (row.fileSizeLabel) {
    status.dataset.fileSize = row.fileSizeLabel;
  }
  return status;
}

function createFileStatusChip(status, label) {
  const chipLabel = label || statusLabel(status, "");
  return createFilesElement("span", {
    className: "surface-chip files-status-chip files-status-chip-availability",
    attrs: {
      "aria-label": `File status: ${chipLabel}`,
      title: chipLabel,
    },
    dataset: { fileStatusChip: safeFileStateToken(status || "unknown") },
    text: chipLabel,
  });
}

function createFileScanStatusChip(scanStatus, label = scanStatusLabel(scanStatus), statusLabelText = "") {
  const text = String(label || "").trim();

  if (!text || text === statusLabelText) {
    return null;
  }

  return createFilesElement("span", {
    className: "surface-chip files-status-chip files-status-chip-review",
    attrs: {
      "aria-label": `Review state: ${text}`,
      title: text,
    },
    dataset: { fileScanStatusChip: safeFileStateToken(scanStatus || "unknown") },
    text,
  });
}

function createFileActions(row) {
  requireFilesViewHelper("createDetailActionStrip");
  const rowActions = [];

  if (row.previewable) {
    rowActions.push(createPreviewAction(row));
  } else if (row.downloadable) {
    rowActions.push(createDownloadOnlyMarker(row));
  }
  if (row.downloadable) {
    rowActions.push(createDownloadAction(row));
  }
  if (row.reportable) {
    rowActions.push(createReportAction(row));
  }
  if (row.quarantineable) {
    rowActions.push(createQuarantineAction(row));
  }
  if (row.deletable) {
    rowActions.push(createDeleteAction(row));
  }
  if (row.restorable) {
    rowActions.push(createRestoreAction(row));
  }

  const actions = view.createDetailActionStrip({
    className: "files-row-actions",
    ariaLabel: `File actions for ${row.fileName}`,
    actions: rowActions,
  });

  actions.dataset.fileActions = "";
  return actions;
}

function createPreviewAction(row) {
  const button = view.createActionButton({
    icon: "eye",
    iconOnly: true,
    label: `Preview ${row.fileName}`,
    text: "",
    title: `Preview ${row.fileName}`,
    action: "files.preview",
    className: "files-row-action",
    onClick: (event) => {
      stopFileRowActionEvent(event);
      openFilePreview(row, { trigger: event.currentTarget });
    },
  });

  button.dataset.fileAction = "preview";
  return button;
}

function createDownloadOnlyMarker(row) {
  const label = previewUnavailableLabel(row);
  const icon = window.LongtailForge.icons?.createIcon?.("eye", { decorative: true });
  const marker = createFilesElement("span", {
    className: "action-button icon-button files-row-action files-row-preview-unavailable",
    attrs: {
      "aria-label": label,
      role: "img",
      title: label,
    },
    dataset: {
      fileAction: "preview-unavailable",
      surfaceAction: "files.previewUnavailable",
    },
  });

  if (icon) {
    marker.appendChild(icon);
  } else {
    marker.textContent = "Preview unavailable";
  }
  return marker;
}

function createDownloadAction(row) {
  const label = `Download ${row.fileName}`;
  const icon = window.LongtailForge.icons?.createIcon?.("download", { decorative: true });
  const link = createFilesElement("a", {
    className: "button-link action-button view-action-button icon-button files-row-action",
    attrs: {
      "aria-label": label,
      download: true,
      href: `/api/files/${encodeURIComponent(row.fileId)}/download`,
      title: label,
    },
    dataset: {
      fileAction: "download",
      surfaceAction: "files.download",
      surfaceActionRole: "secondary",
    },
  });

  if (icon) {
    link.appendChild(icon);
  } else {
    link.textContent = "Download";
  }
  return link;
}

function createReportAction(row) {
  const button = view.createActionButton({
    icon: "alert",
    iconOnly: true,
    label: `Report ${row.fileName}`,
    text: "",
    title: `Report ${row.fileName}`,
    role: "secondary",
    action: "files.report",
    className: "files-row-action",
    onClick: (event) => {
      stopFileRowActionEvent(event);
      reportFile(row.fileId, row.file, row.attachmentId);
    },
  });

  button.dataset.fileAction = "report";
  return button;
}

function createQuarantineAction(row) {
  const button = view.createActionButton({
    icon: "shield-alert",
    iconOnly: true,
    label: `Review ${row.fileName}`,
    text: "",
    title: `Review ${row.fileName}`,
    role: "danger",
    variant: "danger",
    action: "files.quarantine",
    className: "files-row-action",
    onClick: (event) => {
      stopFileRowActionEvent(event);
      quarantineFile(row.fileId, row.file);
    },
  });

  button.dataset.fileAction = "quarantine";
  return button;
}

function createDeleteAction(row) {
  const button = view.createActionButton({
    icon: "delete",
    iconOnly: true,
    label: `Delete ${row.fileName}`,
    text: "",
    title: `Delete ${row.fileName}`,
    variant: "danger",
    action: "files.delete",
    className: "files-row-action",
    onClick: (event) => {
      stopFileRowActionEvent(event);
      deleteFile(row.fileId, row.file);
    },
  });

  button.dataset.fileAction = "delete";
  return button;
}

function createRestoreAction(row) {
  const button = view.createActionButton({
    icon: "restore",
    iconOnly: true,
    label: `Restore ${row.fileName}`,
    text: "",
    title: `Restore ${row.fileName}`,
    action: "files.restore",
    className: "files-row-action",
    onClick: (event) => {
      stopFileRowActionEvent(event);
      restoreFile(row.fileId);
    },
  });

  button.dataset.fileAction = "restore";
  return button;
}

function stopFileRowActionEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function openFilePreview(attachmentOrRow = {}, options = {}) {
  requireFilesViewHelper("createActionButton");
  requireFilesViewHelper("closeModal");
  requireFilesViewHelper("createModal");
  requireFilesViewHelper("showModal");

  const row = normalizeFileEditorRow(attachmentOrRow);
  const trigger = options.trigger && typeof options.trigger.focus === "function"
    ? options.trigger
    : document.activeElement;

  if (activeFilePreviewDialog?.isConnected) {
    view.closeModal(activeFilePreviewDialog, "replace");
  }

  const dialog = buildFilePreviewDialog(row);

  dialog.addEventListener("close", () => {
    if (activeFilePreviewDialog === dialog) {
      activeFilePreviewDialog = null;
    }
    dialog.remove();
  }, { once: true });

  document.body.appendChild(dialog);
  activeFilePreviewDialog = dialog;
  view.showModal(dialog, { parent: options.parent || null, trigger });
  loadFilePreview(dialog, row);
  return dialog;
}

function buildFilePreviewDialog(row) {
  let dialog = null;
  const body = view.createElement("div", {
    className: "files-preview-body",
    attrs: { "aria-live": "polite" },
    dataset: { filePreviewBody: "" },
    children: [createFilePreviewStatus("Loading preview...")],
  });
  const downloadAction = createPreviewDownloadAction(row);
  const closeButton = view.createActionButton({
    action: "close-file-preview",
    className: "surface-modal-footer-action",
    icon: "close",
    iconOnly: true,
    label: "Close Preview",
    role: "secondary",
    text: "",
    title: "Close Preview",
    onClick: () => view.closeModal(dialog, "close"),
  });

  dialog = view.createModal({
    title: `Preview ${row.fileName}`,
    className: "files-preview-dialog",
    size: "wide",
    body: [body],
    actions: [downloadAction, closeButton].filter(Boolean),
  });
  dialog.dataset.filePreviewDialog = "";
  dialog.dataset.fileAttachmentId = row.attachmentId || "";
  if (dialog.viewParts?.body) {
    dialog.viewParts.body.classList.add("files-preview-modal-body");
  }
  if (dialog.viewParts?.footer) {
    dialog.viewParts.footer.classList.add("files-preview-actions");
    dialog.viewParts.footer.dataset.modalFooter = "";
  }
  return dialog;
}

function createPreviewDownloadAction(row) {
  if (!row.downloadable || !row.fileId) {
    return null;
  }

  const label = `Download ${row.fileName}`;
  const icon = window.LongtailForge.icons?.createIcon?.("download", { decorative: true });
  const link = createFilesElement("a", {
    className: "action-button icon-button surface-modal-footer-action files-preview-download",
    attrs: {
      "aria-label": label,
      download: true,
      href: `/api/files/${encodeURIComponent(row.fileId)}/download`,
      title: label,
    },
    dataset: {
      fileAction: "preview-download",
      surfaceAction: "files.download",
      surfaceActionRole: "utility",
    },
  });

  if (icon) {
    link.appendChild(icon);
  } else {
    link.textContent = "Download";
  }
  return link;
}

async function loadFilePreview(dialog, row) {
  if (!row.attachmentId) {
    renderFilePreviewUnavailable(dialog, "Preview is not available for this file.");
    return;
  }

  setFilePreviewStatus(dialog, "Checking preview availability...");

  try {
    const descriptorResponse = await api.getJson(`/api/files/attachments/${encodeURIComponent(row.attachmentId)}/preview`, { cache: "no-store" });
    const preview = descriptorResponse.preview || {};

    if (!dialog.isConnected) {
      return;
    }

    if (preview.state !== "previewable" || !preview.contentUrl) {
      renderFilePreviewState(dialog, preview);
      return;
    }

    if (preview.kind === "image") {
      renderFilePreviewImage(dialog, preview);
      return;
    }

    setFilePreviewStatus(dialog, "Loading preview...");
    const contentResponse = await api.getJson(preview.contentUrl, { cache: "no-store" });

    if (!dialog.isConnected) {
      return;
    }

    renderFilePreviewContent(dialog, preview, contentResponse.content || {});
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    renderFilePreviewUnavailable(dialog, error.message || "Preview could not be loaded.", true);
  }
}

function renderFilePreviewContent(dialog, preview, content) {
  if (content.kind === "text") {
    renderFilePreviewText(dialog, content.text || "");
    return;
  }

  if (content.kind === "markdown") {
    renderFilePreviewMarkdown(dialog, content.bodyHtml || "");
    return;
  }

  renderFilePreviewState(dialog, preview);
}

function renderFilePreviewImage(dialog, preview) {
  const image = createFilesElement("img", {
    attrs: {
      alt: preview.filename ? `Preview of ${preview.filename}` : "File preview",
      src: preview.contentUrl,
    },
  });
  const wrapper = view.createElement("div", {
    className: "files-preview-image-frame",
    children: [image],
  });

  image.addEventListener("load", () => {
    setFilePreviewBody(dialog, wrapper);
  }, { once: true });
  image.addEventListener("error", () => {
    renderFilePreviewUnavailable(dialog, "Image preview could not be loaded.", true);
  }, { once: true });
  setFilePreviewStatus(dialog, "Loading image preview...");
}

function renderFilePreviewText(dialog, text) {
  setFilePreviewBody(dialog, createFilesElement("pre", {
    className: "files-preview-text",
    children: [
      createFilesElement("code", { text: text || "" }),
    ],
  }));
}

function renderFilePreviewMarkdown(dialog, html) {
  const content = view.createElement("div", {
    className: "files-preview-markdown notes-preview",
    attrs: { "data-file-preview-markdown": "" },
  });

  content.innerHTML = html || "";
  setFilePreviewBody(dialog, content);
}

function renderFilePreviewState(dialog, preview = {}) {
  const state = preview.state || "unavailable";
  const message = previewStateMessage(state);

  renderFilePreviewUnavailable(dialog, message, state === "unauthorized");
}

function renderFilePreviewUnavailable(dialog, message, isError = false) {
  setFilePreviewBody(dialog, createFilePreviewStatus(message, isError));
}

function createFilePreviewStatus(message, isError = false) {
  return view.createElement("p", {
    className: ["files-preview-status", isError ? "error-text" : ""],
    attrs: { role: "status" },
    text: message,
  });
}

function setFilePreviewStatus(dialog, message, isError = false) {
  setFilePreviewBody(dialog, createFilePreviewStatus(message, isError));
}

function setFilePreviewBody(dialog, content) {
  const body = dialog.querySelector("[data-file-preview-body]");

  body?.replaceChildren(content);
}

function openFileEditor(attachmentOrRow = {}, options = {}) {
  requireFilesViewHelper("renderDescriptorModalForm");
  requireFilesViewHelper("createActionButton");
  requireFilesViewHelper("closeModal");
  requireFilesViewHelper("showModal");

  const row = normalizeFileEditorRow(attachmentOrRow);
  const trigger = options.trigger && typeof options.trigger.focus === "function"
    ? options.trigger
    : document.activeElement;

  if (activeFileEditorDialog?.isConnected) {
    view.closeModal(activeFileEditorDialog, "replace");
  }

  const dialog = buildFileEditorDialog(row, options);

  dialog.addEventListener("close", () => {
    if (activeFileEditorDialog === dialog) {
      activeFileEditorDialog = null;
    }
    dialog.remove();
  }, { once: true });

  document.body.appendChild(dialog);
  activeFileEditorDialog = dialog;
  view.showModal(dialog, { parent: options.parent || null, trigger });
  loadFileEditorTargetOptions(dialog, row);
  return dialog;
}

function normalizeFileEditorRow(attachmentOrRow = {}) {
  if (attachmentOrRow?.attachment && attachmentOrRow.fileName) {
    return attachmentOrRow;
  }
  return fileRow(attachmentOrRow?.attachment || attachmentOrRow || {});
}

function buildFileEditorDialog(row, options = {}) {
  let dialog = null;
  const previewButton = view.createActionButton({
    action: "files.preview",
    className: "surface-modal-footer-action",
    icon: "eye",
    iconOnly: true,
    label: `Preview ${row.fileName}`,
    role: "secondary",
    text: "",
    title: `Preview ${row.fileName}`,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFilePreview(row, { trigger: event.currentTarget });
    },
  });
  const markReviewedButton = view.createActionButton({
    action: "files.restore",
    className: "surface-modal-footer-action",
    icon: "complete",
    iconOnly: true,
    label: `Mark ${row.fileName} reviewed`,
    role: "secondary",
    text: "",
    title: `Mark ${row.fileName} reviewed`,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      markFileReviewedFromContext(dialog, row, options);
    },
  });
  const closeButton = view.createActionButton({
    action: "close-file-context",
    className: "surface-modal-footer-action",
    icon: "close",
    iconOnly: true,
    label: "Close File Context",
    role: "secondary",
    text: "",
    title: "Close File Context",
    onClick: () => view.closeModal(dialog, "cancel"),
  });
  const saveButton = view.createActionButton({
    action: "save-file-context",
    className: "surface-modal-footer-action",
    icon: "save",
    iconOnly: true,
    label: "Save File Context",
    role: "primary",
    text: "",
    title: "Save File Context",
    type: "submit",
  });

  previewButton.dataset.fileContextPreview = "";
  previewButton.hidden = !row.previewable;
  previewButton.disabled = !row.previewable;
  markReviewedButton.dataset.fileContextMarkReviewed = "";
  markReviewedButton.hidden = !row.reviewable;
  markReviewedButton.disabled = !row.reviewable;
  closeButton.dataset.fileContextClose = "";
  saveButton.dataset.fileContextSave = "";
  dialog = view.renderDescriptorModalForm(fileEditorModalDescriptor(), {
    title: "File Context",
    className: "files-file-context-dialog",
    formClassName: "files-file-context-form",
    size: "wide",
    fields: [],
    utilityActions: [previewButton, markReviewedButton],
    actions: [closeButton, saveButton],
  });
  dialog.dataset.fileEditorDialog = "";
  dialog.viewParts.form.dataset.fileContextForm = "";
  dialog.viewParts.form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveFileEditorContext(dialog, row, options);
  });
  dialog.viewParts.body.classList.add("files-file-context-body");
  dialog.viewParts.body.replaceChildren(
    createFileEditorMetadataSection(row),
    createFileEditorControlsSection(),
    createFileEditorStatus(),
  );
  dialog.viewParts.footer.classList.add("files-file-context-actions");
  dialog.viewParts.footer.dataset.modalFooter = "";
  hydrateFileEditorContextControls(dialog, row, usesBusinessScope());
  bindFileEditorControlEvents(dialog, row);
  return dialog;
}

function fileEditorModalDescriptor() {
  return {
    id: "files.file-context",
    title: "File Context",
  };
}

function createFileEditorMetadataSection(row) {
  return view.createElement("section", {
    className: "files-file-context-metadata surface-modal-group",
    attrs: { "aria-label": "File metadata" },
    dataset: { fileContextMetadata: "" },
    children: [
      view.createElement("h3", { className: "surface-modal-section-heading", text: "File Metadata" }),
      createFileEditorMetadataList(row),
    ],
  });
}

function createFileEditorMetadataList(row) {
  const metadataRows = [
    ["File name", row.fileName, "file-name"],
    ["File type", row.fileTypeLabel, "file-type"],
    ["Size", row.fileSizeLabel, "size"],
    ["Status", row.statusLabel, "status"],
    ["Review state", reviewStateLabel(row.status, row.scanStatus || ""), "review-state"],
    ["Uploaded", row.uploadedAtLabel, "uploaded"],
    ["Attached", row.attachedAtLabel, "attached"],
  ];

  if (row.uploadedByLabel) {
    metadataRows.push(["Uploader", row.uploadedByLabel, "uploader"]);
  }

  return view.createElement("dl", {
    className: "files-file-context-metadata-list surface-modal-section-body",
    children: metadataRows.map(([label, value, key]) => createReadOnlyMetadataRow(label, value, key)),
  });
}

function createReadOnlyMetadataRow(label, value, key) {
  return view.createElement("div", {
    className: "files-file-context-metadata-row",
    dataset: { fileContextMetadataKey: key },
    children: [
      view.createElement("dt", { text: label }),
      view.createElement("dd", { text: metadataText(value) }),
    ],
  });
}

function createFileEditorControlsSection() {
  const targetSelect = createFileContextSelect("fileContextTarget", "target");
  const clientSelect = createFileContextSelect("fileContextClient", usesBusinessScope() ? "clientId" : "");
  const projectSelect = createFileContextSelect("fileContextProject", "projectId");
  const clientField = createFileContextField("Client", clientSelect);

  targetSelect.appendChild(createOption("", "Loading targets..."));
  clientSelect.appendChild(createOption("", ""));
  projectSelect.appendChild(createOption("", "Loading projects..."));
  clientField.dataset.fileContextBusinessControl = "";
  clientField.hidden = !usesBusinessScope();
  clientSelect.disabled = !usesBusinessScope();

  return view.createElement("section", {
    className: "files-file-context-controls surface-modal-group",
    attrs: { "aria-label": "File context controls" },
    dataset: { fileContextControls: "" },
    children: [
      view.createElement("h3", { className: "surface-modal-section-heading", text: "Context" }),
      view.createFieldGrid({
        className: "files-file-context-controls-grid",
        fields: [
          clientField,
          createFileContextField("Project", projectSelect),
          createFileContextField("Target", targetSelect),
        ],
      }),
    ],
  });
}

function createFileContextField(label, control) {
  return view.createElement("label", {
    attrs: { "data-view-field-width": "full" },
    children: [
      view.createElement("span", { className: "view-renderer-field-label", text: label }),
      control,
    ],
  });
}

function createFileContextSelect(datasetKey, name) {
  return createFilesElement("select", {
    attrs: { name },
    dataset: { [datasetKey]: "" },
  });
}

function createFileEditorStatus() {
  return view.createElement("p", {
    className: "files-file-context-status",
    attrs: { "aria-live": "polite", role: "status" },
    dataset: { fileContextStatus: "" },
  });
}

function bindFileEditorControlEvents(dialog, row) {
  dialog.querySelector("[data-file-context-target]")?.addEventListener("change", () => {
    syncFileEditorSaveState(dialog);
  });
  dialog.querySelector("[data-file-context-client]")?.addEventListener("change", () => {
    hydrateFileEditorProjectControl(dialog, row);
    loadFileEditorTargetOptions(dialog, row);
  });
  dialog.querySelector("[data-file-context-project]")?.addEventListener("change", () => {
    loadFileEditorTargetOptions(dialog, row);
  });
}

async function loadFileEditorTargetOptions(dialog, row) {
  const requestId = ++fileEditorOptionRequestId;
  const params = fileEditorTargetOptionQuery(dialog, row);

  setFileEditorStatus(dialog, "Loading target choices...");
  setFileEditorControlsDisabled(dialog, true);

  try {
    const response = await api.getJson(`/api/files/attachable-targets?${params.toString()}`, { cache: "no-store" });

    if (requestId !== fileEditorOptionRequestId || !dialog.isConnected) {
      return;
    }

    hydrateFileEditorOptionControls(dialog, row, response || {});
    setFileEditorStatus(dialog, "");
  } catch (error) {
    if (requestId !== fileEditorOptionRequestId || !dialog.isConnected) {
      return;
    }

    setFileEditorControlsDisabled(dialog, false);
    setFileEditorStatus(dialog, error.message || "Target choices could not be loaded.", true);
  }
}

function fileEditorTargetOptionQuery(dialog, row) {
  const params = new URLSearchParams();
  const clientId = usesBusinessScope()
    ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId)
    : "";
  const values = {
    clientId,
    limit: "100",
    projectId: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
  };

  Object.entries(values).forEach(([key, value]) => {
    const trimmed = String(value || "").trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  });
  return params;
}

function fileEditorSelectedValue(dialog, selector, fallbackValue = "") {
  const control = dialog.querySelector(selector);

  if (!control || control.dataset.fileContextLoaded !== "true") {
    return fallbackValue || "";
  }
  return control.value || "";
}

function fileEditorSelectedContext(dialog, row) {
  return {
    clientId: usesBusinessScope() ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId) : "",
    projectId: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
  };
}

function hydrateFileEditorOptionControls(dialog, row, response) {
  const business = (response.workspaceType || state.workspaceType) === "business";
  const targetSelect = dialog.querySelector("[data-file-context-target]");

  hydrateFileEditorContextControls(dialog, row, business);
  if (targetSelect) {
    hydrateTargetSelect(targetSelect, row, response.options || [], fileEditorSelectedContext(dialog, row));
  }
  setFileEditorControlsDisabled(dialog, false, business);
}

function hydrateFileEditorContextControls(dialog, row, business = usesBusinessScope()) {
  const clientSelect = dialog.querySelector("[data-file-context-client]");
  const clientField = dialog.querySelector("[data-file-context-business-control]");

  if (clientField) {
    clientField.hidden = !business;
  }
  if (clientSelect) {
    clientSelect.name = business ? "clientId" : "";
    clientSelect.disabled = !business;
    hydrateContextSelect(clientSelect, {
      currentLabel: row.clientLabel,
      currentValue: business ? row.clientId : "",
      options: business ? fileEditorClientOptions() : [],
      placeholder: "All clients",
      selectedValue: business ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId) : "",
    });
  }
  hydrateFileEditorProjectControl(dialog, row);
}

function hydrateFileEditorProjectControl(dialog, row) {
  const projectSelect = dialog.querySelector("[data-file-context-project]");

  if (!projectSelect) {
    return;
  }

  const selectedClientId = usesBusinessScope()
    ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId)
    : "";

  hydrateContextSelect(projectSelect, {
    currentLabel: row.projectLabel,
    currentValue: row.projectId,
    options: fileEditorProjectOptions(selectedClientId),
    placeholder: "All projects",
    selectedValue: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
  });
}

function fileEditorClientOptions() {
  return state.clients.map((client) => ({
    label: window.LongtailForge.clientProjectOptions?.optionLabel?.(client) || client.name || "Untitled Client",
    value: client.id,
  }));
}

function fileEditorProjectOptions(clientId = "") {
  const projects = clientId
    ? state.projects.filter((project) => project.clientId === clientId)
    : state.projects;

  return projects.map((project) => ({
    label: clientId ? project.projectLabel : project.label,
    value: project.id,
  }));
}

function hydrateContextSelect(select, config) {
  const selectedValue = String(config.selectedValue || "").trim();
  const optionNodes = [
    createOption("", config.placeholder),
    ...safeOptionList(config.options).map((option) => createOption(option.value, option.label)),
  ];

  if (selectedValue && !optionNodes.some((option) => option.value === selectedValue) && config.currentLabel) {
    optionNodes.splice(1, 0, createOption(config.currentValue, config.currentLabel));
  }

  select.replaceChildren(...optionNodes);
  select.value = optionNodes.some((option) => option.value === selectedValue) ? selectedValue : "";
  select.dataset.fileContextLoaded = "true";
}

function hydrateTargetSelect(select, row, options, context = {}) {
  const currentValue = fileEditorTargetOptionValue(fileEditorCurrentTargetOption(row));
  const selectedValue = select.dataset.fileContextLoaded === "true" ? select.value : currentValue;
  const optionNodes = [
    createOption("", "Choose a target"),
    ...safeOptionList(options).map((option) => createFileEditorTargetOption(option, context)),
  ];

  if (currentValue && !optionNodes.some((option) => option.value === currentValue) && row.targetLabel) {
    const currentOption = createFileEditorTargetOption(fileEditorCurrentTargetOption(row), context);
    currentOption.disabled = true;
    optionNodes.splice(1, 0, currentOption);
  }

  select.replaceChildren(...optionNodes);
  select.value = optionNodes.some((option) => option.value === selectedValue) ? selectedValue : currentValue;
  select.dataset.fileContextLoaded = "true";
}

function createFileEditorTargetOption(option, context = {}) {
  const optionNode = createOption(fileEditorTargetOptionValue(option), fileEditorTargetOptionLabel(option, context));

  optionNode.dataset.moduleId = option.moduleId || option.value?.moduleId || "";
  optionNode.dataset.targetId = option.targetId || option.value?.targetId || "";
  optionNode.dataset.targetType = option.targetType || option.value?.targetType || "";
  optionNode.dataset.clientId = option.clientId || option.value?.clientId || "";
  optionNode.dataset.projectId = option.projectId || option.value?.projectId || "";
  return optionNode;
}

function fileEditorCurrentTargetOption(row) {
  return {
    clientId: row.clientId,
    clientLabel: row.clientLabel,
    contextLabel: [row.clientLabel, row.projectLabel].filter(Boolean).join(" / "),
    label: row.targetLabel || "Current target",
    moduleId: row.moduleId,
    moduleLabel: row.moduleLabel,
    projectId: row.projectId,
    projectLabel: row.projectLabel,
    targetId: row.targetId,
    targetType: row.targetType,
    targetTypeLabel: formatToken(row.targetType || ""),
    value: {
      clientId: row.clientId,
      moduleId: row.moduleId,
      projectId: row.projectId,
      targetId: row.targetId,
      targetType: row.targetType,
    },
  };
}

function fileEditorTargetOptionValue(option) {
  const value = option.value || {};

  return JSON.stringify({
    clientId: value.clientId || option.clientId || "",
    moduleId: value.moduleId || option.moduleId || "",
    projectId: value.projectId || option.projectId || "",
    targetId: value.targetId || option.targetId || "",
    targetType: value.targetType || option.targetType || "",
  });
}

function fileEditorTargetOptionLabel(option, context = {}) {
  const targetLabel = metadataText(option.label, "Untitled target");
  const typeLabel = [option.moduleLabel, option.targetTypeLabel].filter(Boolean).join(": ");
  const baseLabel = typeLabel ? `${typeLabel} - ${targetLabel}` : targetLabel;
  const contextLabel = fileEditorTargetContextLabel(option, context);

  return contextLabel ? `${baseLabel} (${contextLabel})` : baseLabel;
}

function fileEditorTargetContextLabel(option, context = {}) {
  const contextParts = [];
  const optionClientId = option.clientId || option.value?.clientId || "";
  const optionProjectId = option.projectId || option.value?.projectId || "";

  if (option.clientLabel && (!context.clientId || context.clientId !== optionClientId)) {
    contextParts.push(option.clientLabel);
  }
  if (option.projectLabel && (!context.projectId || context.projectId !== optionProjectId)) {
    contextParts.push(option.projectLabel);
  }
  if (contextParts.length > 0) {
    return contextParts.join(" / ");
  }
  if (!option.clientLabel && !option.projectLabel && option.contextLabel) {
    return option.contextLabel;
  }
  return "";
}

function safeOptionList(options) {
  return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];
}

function setFileEditorControlsDisabled(dialog, disabled, business = usesBusinessScope()) {
  dialog.querySelectorAll("[data-file-context-target], [data-file-context-project]").forEach((control) => {
    control.disabled = disabled;
  });
  dialog.querySelectorAll("[data-file-context-client]").forEach((control) => {
    control.disabled = disabled || !business;
  });
  syncFileEditorSaveState(dialog, disabled);
}

function syncFileEditorSaveState(dialog, forceDisabled = false) {
  const saveButton = dialog.querySelector("[data-file-context-save]");
  const targetSelect = dialog.querySelector("[data-file-context-target]");
  const selectedTarget = targetSelect?.selectedOptions?.[0];

  if (!saveButton) {
    return;
  }

  saveButton.disabled = forceDisabled || !targetSelect?.value || selectedTarget?.disabled;
}

async function saveFileEditorContext(dialog, row, options = {}) {
  if (!row.attachmentId) {
    setFileEditorStatus(dialog, "Attachment context could not be saved.", true);
    return;
  }

  let payload = null;

  try {
    payload = fileEditorContextPayload(dialog);
  } catch (error) {
    setFileEditorStatus(dialog, error.message || "Choose a target before saving.", true);
    syncFileEditorSaveState(dialog);
    return;
  }

  setFileEditorStatus(dialog, "Saving file context...");
  setFileEditorControlsDisabled(dialog, true);

  try {
    await api.patchJson(`/api/files/attachments/${encodeURIComponent(row.attachmentId)}/context`, payload);
    setFileEditorStatus(dialog, "File context saved.");
    view.closeModal(dialog, "saved");
    await loadFiles();
    focusFileRowByAttachmentId(row.attachmentId);
    if (typeof options.onSaved === "function") {
      options.onSaved({ attachmentId: row.attachmentId, payload });
    }
  } catch (error) {
    setFileEditorControlsDisabled(dialog, false);
    setFileEditorStatus(dialog, error.message || "File context was not saved.", true);
  }
}

async function markFileReviewedFromContext(dialog, row, options = {}) {
  if (!row.fileId || !row.reviewable) {
    setFileEditorStatus(dialog, "This file cannot be marked reviewed from File Context.", true);
    return;
  }

  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Mark file reviewed?",
    message: `Mark "${row.fileName || "this file"}" reviewed? Downloads will be available again when the file is otherwise allowed.`,
    confirmLabel: "Mark Reviewed",
  });

  if (!confirmed) {
    return;
  }

  const markReviewedButton = dialog.querySelector("[data-file-context-mark-reviewed]");

  setFileEditorStatus(dialog, "Marking file reviewed...");
  setFileEditorControlsDisabled(dialog, true);
  if (markReviewedButton) {
    markReviewedButton.disabled = true;
  }

  try {
    await api.postJson(`/api/files/${encodeURIComponent(row.fileId)}/restore`, {});
    setFileEditorStatus(dialog, "File marked reviewed.");
    view.closeModal(dialog, "reviewed");
    await loadFiles();
    focusFileRowByAttachmentId(row.attachmentId);
    if (typeof options.onSaved === "function") {
      options.onSaved({ attachmentId: row.attachmentId, fileId: row.fileId, lifecycle: "reviewed" });
    }
  } catch (error) {
    setFileEditorControlsDisabled(dialog, false);
    if (markReviewedButton) {
      markReviewedButton.disabled = false;
    }
    setFileEditorStatus(dialog, error.message || "File was not marked reviewed.", true);
  }
}

function fileEditorContextPayload(dialog) {
  const targetSelect = dialog.querySelector("[data-file-context-target]");
  const selectedTarget = targetSelect?.selectedOptions?.[0] || null;
  const targetValue = parseFileEditorTargetValue(targetSelect?.value || "");
  const payload = {
    moduleId: selectedTarget?.dataset.moduleId || targetValue.moduleId || "",
    targetId: selectedTarget?.dataset.targetId || targetValue.targetId || "",
    targetType: selectedTarget?.dataset.targetType || targetValue.targetType || "",
  };
  const clientId = usesBusinessScope()
    ? selectedTarget?.dataset.clientId || targetValue.clientId || fileEditorSelectedValue(dialog, "[data-file-context-client]")
    : "";
  const projectId = selectedTarget?.dataset.projectId || targetValue.projectId || fileEditorSelectedValue(dialog, "[data-file-context-project]");

  if (!payload.moduleId || !payload.targetType || !payload.targetId || selectedTarget?.disabled) {
    throw new Error("Choose an available target before saving.");
  }
  if (clientId) {
    payload.clientId = clientId;
  }
  if (projectId) {
    payload.projectId = projectId;
  }

  return payload;
}

function parseFileEditorTargetValue(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function focusFileRowByAttachmentId(attachmentId) {
  const row = Array.from(document.querySelectorAll("[data-file-editor-row]"))
    .find((element) => element.dataset.fileAttachmentId === attachmentId);

  row?.focus?.();
}

function setFileEditorStatus(dialog, message, isError = false) {
  const status = dialog.querySelector("[data-file-context-status]");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error-text", isError);
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

function previewAvailabilityForRow(row) {
  const kind = previewKindForExtension(row.extension);
  const status = String(row.status || "").trim();
  const scanStatus = String(row.scanStatus || "").trim();
  const canPreviewInReview = row.canPreviewInReview === true;
  const reviewPreviewAllowed = status === "quarantined" && canPreviewInReview;

  if ((status !== "available" && !reviewPreviewAllowed) || !["not_required", "passed"].includes(scanStatus)) {
    return {
      kind,
      reason: status !== "available" && !reviewPreviewAllowed
        ? `file_${status || "unavailable"}`
        : `scan_${scanStatus || "unavailable"}`,
      state: "unavailable",
    };
  }

  if (kind === "unsupported") {
    return {
      kind,
      reason: "unsupported_file_type",
      state: "download_only",
    };
  }

  if ((kind === "text" || kind === "markdown") && Number(row.fileSizeBytes || 0) > TEXT_PREVIEW_MAX_BYTES) {
    return {
      kind,
      reason: "too_large_for_preview",
      state: "too_large_for_preview",
    };
  }

  return {
    kind,
    reason: "",
    state: "previewable",
  };
}

function previewKindForExtension(extension) {
  const normalizedExtension = String(extension || "").replace(/^\./, "").toLowerCase();

  if (IMAGE_PREVIEW_EXTENSIONS.has(normalizedExtension)) {
    return "image";
  }
  if (MARKDOWN_PREVIEW_EXTENSIONS.has(normalizedExtension)) {
    return "markdown";
  }
  if (TEXT_PREVIEW_EXTENSIONS.has(normalizedExtension)) {
    return "text";
  }
  return "unsupported";
}

function previewUnavailableLabel(row) {
  if (row.previewState === "too_large_for_preview") {
    return `Preview too large; download ${row.fileName}`;
  }
  if (row.previewState === "download_only") {
    return `Download-only ${row.fileName}`;
  }
  return `Preview unavailable for ${row.fileName}`;
}

function previewStateMessage(state) {
  if (state === "download_only") {
    return "This file type is download-only.";
  }
  if (state === "too_large_for_preview") {
    return "This file is too large to preview. Use Download to open it outside Longtail Forge.";
  }
  if (state === "unauthorized") {
    return "You do not have permission to preview this file.";
  }
  return "Preview is not available for this file.";
}

function canReportFileRow(attachment, file, fileId, status) {
  const allowed = readActionBooleanFlag([
    attachment.canReport,
    attachment.can_report,
    file.canReport,
    file.can_report,
  ], true);

  return Boolean(fileId && status !== "deleted" && status !== "quarantined" && allowed);
}

function canQuarantineFileRow(attachment, file, fileId, status) {
  const allowed = canManageFileReview(attachment, file, fileId);

  return Boolean(fileId && status !== "deleted" && status !== "quarantined" && allowed);
}

function canManageFileReview(attachment, file, fileId) {
  const allowed = readActionBooleanFlag([
    attachment.canQuarantine,
    attachment.can_quarantine,
    file.canQuarantine,
    file.can_quarantine,
  ], workspaceHasPermission("files.manage_quarantine"));

  return Boolean(fileId && allowed);
}

function canMarkReviewedFileRow(row = {}) {
  return Boolean(
    row.fileId &&
    row.status === "quarantined" &&
    ["not_required", "passed"].includes(row.scanStatus || "") &&
    row.canManageReview,
  );
}

function readActionBooleanFlag(values, fallback) {
  const explicit = values.find((value) => typeof value === "boolean");
  return typeof explicit === "boolean" ? explicit : fallback;
}

function workspaceHasPermission(permissionId) {
  const permissions = workspacePermissionSet();
  if (permissions) {
    return permissions.has(permissionId);
  }

  if (permissionId === "files.manage_quarantine") {
    return window.LongtailForge?.workspaceContext?.permissionHints?.filesManageQuarantine === true;
  }

  return false;
}

function workspacePermissionSet() {
  const rawPermissions = window.LongtailForge?.workspaceContext?.permissionIds ||
    window.LongtailForge?.workspaceContext?.permissions;

  if (!Array.isArray(rawPermissions)) {
    return null;
  }

  const permissionIds = rawPermissions
    .map((permission) => typeof permission === "string" ? permission : permission?.permissionId || permission?.permission_id || permission?.id)
    .filter(Boolean);
  return new Set(permissionIds);
}

async function reportFile(fileId, file = {}, attachmentId = "") {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Report file?",
    message: `Report "${file.displayName || file.originalFilename || "this file"}" for review? Downloads will be paused until a workspace admin reviews it.`,
    confirmLabel: "Report File",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Reporting file...");

  try {
    await api.postJson(`/api/files/${encodeURIComponent(fileId)}/report`, {
      attachmentId,
      reason: FILE_REPORT_REASON,
    });
    await loadFiles();
  } catch (error) {
    setStatus(error.message || "File was not reported.", true);
  }
}

async function quarantineFile(fileId, file = {}) {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Move file to review?",
    message: `Move "${file.displayName || file.originalFilename || "this file"}" to review? Downloads will remain unavailable until the file is restored.`,
    confirmLabel: "Move to Review",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  setStatus("Moving file to review...");

  try {
    await api.postJson(`/api/files/${encodeURIComponent(fileId)}/quarantine`, { reason: FILE_QUARANTINE_REASON });
    await loadFiles();
  } catch (error) {
    setStatus(error.message || "File was not moved to review.", true);
  }
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
  if (status === "deleted") {
    return "Unavailable";
  }
  if (status === "quarantined") {
    return "In review";
  }
  if (status === "pending" || scanStatus === "pending") {
    return "Review pending";
  }
  if (scanStatus === "error") {
    return "Review needed";
  }
  if (status === "available") {
    return "Available";
  }

  return formatToken(status);
}

function scanStatusLabel(scanStatus) {
  if (scanStatus === "not_required") {
    return "No review needed";
  }
  if (scanStatus === "passed") {
    return "Reviewed";
  }
  if (scanStatus === "pending") {
    return "Review pending";
  }
  if (scanStatus === "error") {
    return "Review needed";
  }

  return scanStatus ? formatToken(scanStatus) : "";
}

function reviewStateLabel(status, scanStatus) {
  if (status === "quarantined") {
    return "In review";
  }

  return scanStatusLabel(scanStatus);
}

function visibleFileCountLabel(count, pagination = {}) {
  const safeCount = Number(count || 0);
  const label = `${safeCount} file attachment${safeCount === 1 ? "" : "s"} visible`;

  return pagination.hasMore ? `${label}. More available.` : label;
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

function safeFileStateToken(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
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

function metadataText(value, fallback = "Not recorded") {
  const text = String(value || "").trim();

  return text || fallback;
}

function setStatus(message, isError = false) {
  if (!fileStatus) {
    return;
  }

  fileStatus.textContent = message;
  fileStatus.classList.toggle("error-text", isError);
}

function createFilesElement(tagName, options = {}) {
  requireFilesViewHelper("createElement");
  return view.createElement(tagName, options);
}

function requireFilesViewHelper(name) {
  const helper = view?.[name];

  if (typeof helper !== "function") {
    throw new Error(`Files browse requires LongtailForge.view.${name}.`);
  }
  return helper;
}
