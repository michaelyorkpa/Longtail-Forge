const api = window.LongtailForge.api;
const view = window.LongtailForge?.view;
const state = {
  workspaceType: "business",
  clients: [],
  projects: [],
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
let activeFilesTooltip = null;
let activeFilesTooltipTarget = null;
let activeFileEditorDialog = null;
let fileEditorOptionRequestId = 0;

window.LongtailForge.filesDialog = Object.freeze({
  ...(window.LongtailForge.filesDialog || {}),
  openFileEditor,
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
  const tableMount = document.createElement("div");

  tableMount.dataset.fileTableMount = "";
  tableMount.appendChild(createFilesTable([]));
  return view.createListShell({
    className: "files-browse-list-shell",
    attrs: { "data-file-list-shell": "" },
    statusAttrs: { "data-file-status": "" },
    children: tableMount,
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
    const attachments = result.attachments || [];

    renderFiles(attachments);
    setStatus(visibleFileCountLabel(attachments.length));
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
    fileSizeLabel: formatBytes(file.fileSizeBytes || file.file_size_bytes),
    downloadable: Boolean(fileId && status === "available" && ["not_required", "passed"].includes(scanStatus)),
    deletable: Boolean(fileId && status !== "deleted"),
    restorable: Boolean(fileId && status === "deleted"),
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

  const dialog = buildFileEditorDialog(row);

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

function buildFileEditorDialog(row) {
  let dialog = null;
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

  closeButton.dataset.fileContextClose = "";
  dialog = view.renderDescriptorModalForm(fileEditorModalDescriptor(), {
    title: "File Context",
    className: "files-file-context-dialog",
    formClassName: "files-file-context-form",
    size: "wide",
    fields: [],
    actions: [closeButton],
  });
  dialog.dataset.fileEditorDialog = "";
  dialog.viewParts.form.dataset.fileContextForm = "";
  dialog.viewParts.form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  dialog.viewParts.body.classList.add("files-file-context-body");
  dialog.viewParts.body.replaceChildren(
    createFileEditorMetadataSection(row),
    createFileEditorControlsSection(),
    createFileEditorStatus(),
  );
  dialog.viewParts.footer.classList.add("files-file-context-actions");
  dialog.viewParts.footer.dataset.modalFooter = "";
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
    ["Scan state", formatToken(row.scanStatus || ""), "scan-state"],
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
          createFileContextField("Target", targetSelect),
          clientField,
          createFileContextField("Project", projectSelect),
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
  const select = document.createElement("select");

  select.name = name;
  select.dataset[datasetKey] = "";
  return select;
}

function createFileEditorStatus() {
  return view.createElement("p", {
    className: "files-file-context-status",
    attrs: { "aria-live": "polite", role: "status" },
    dataset: { fileContextStatus: "" },
  });
}

function bindFileEditorControlEvents(dialog, row) {
  dialog.querySelector("[data-file-context-client]")?.addEventListener("change", () => {
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
    moduleId: row.moduleId,
    projectId: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
    targetType: row.targetType,
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

function hydrateFileEditorOptionControls(dialog, row, response) {
  const business = (response.workspaceType || state.workspaceType) === "business";
  const targetSelect = dialog.querySelector("[data-file-context-target]");
  const clientSelect = dialog.querySelector("[data-file-context-client]");
  const projectSelect = dialog.querySelector("[data-file-context-project]");
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
      options: business ? response.filters?.client?.options || [] : [],
      placeholder: "All clients",
      selectedValue: business ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId) : "",
    });
  }
  if (projectSelect) {
    hydrateContextSelect(projectSelect, {
      currentLabel: row.projectLabel,
      currentValue: row.projectId,
      options: response.filters?.project?.options || [],
      placeholder: "All projects",
      selectedValue: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
    });
  }
  if (targetSelect) {
    hydrateTargetSelect(targetSelect, row, response.options || []);
  }
  setFileEditorControlsDisabled(dialog, false, business);
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

function hydrateTargetSelect(select, row, options) {
  const currentValue = fileEditorTargetOptionValue(fileEditorCurrentTargetOption(row));
  const selectedValue = select.dataset.fileContextLoaded === "true" ? select.value : currentValue;
  const optionNodes = [
    createOption("", "Choose a target"),
    ...safeOptionList(options).map((option) => createFileEditorTargetOption(option)),
  ];

  if (currentValue && !optionNodes.some((option) => option.value === currentValue) && row.targetLabel) {
    const currentOption = createFileEditorTargetOption(fileEditorCurrentTargetOption(row));
    currentOption.disabled = true;
    optionNodes.splice(1, 0, currentOption);
  }

  select.replaceChildren(...optionNodes);
  select.value = optionNodes.some((option) => option.value === selectedValue) ? selectedValue : currentValue;
  select.dataset.fileContextLoaded = "true";
}

function createFileEditorTargetOption(option) {
  const optionNode = createOption(fileEditorTargetOptionValue(option), fileEditorTargetOptionLabel(option));

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
    contextLabel: [row.clientLabel, row.projectLabel].filter(Boolean).join(" / "),
    label: row.targetLabel || "Current target",
    moduleId: row.moduleId,
    moduleLabel: row.moduleLabel,
    projectId: row.projectId,
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

function fileEditorTargetOptionLabel(option) {
  const targetLabel = metadataText(option.label, "Untitled target");
  const typeLabel = [option.moduleLabel, option.targetTypeLabel].filter(Boolean).join(": ");
  const baseLabel = typeLabel ? `${typeLabel} - ${targetLabel}` : targetLabel;

  return option.contextLabel ? `${baseLabel} (${option.contextLabel})` : baseLabel;
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

function visibleFileCountLabel(count) {
  const safeCount = Number(count || 0);

  return `${safeCount} file${safeCount === 1 ? "" : "s"} visible`;
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

function requireFilesViewHelper(name) {
  const helper = view?.[name];

  if (typeof helper !== "function") {
    throw new Error(`Files browse requires LongtailForge.view.${name}.`);
  }
  return helper;
}
