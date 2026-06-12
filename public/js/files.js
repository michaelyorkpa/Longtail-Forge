const filterForm = document.querySelector("[data-file-filters]");
const moduleFilter = document.querySelector("[data-file-filter-module]");
const targetTypeFilter = document.querySelector("[data-file-filter-target-type]");
const targetIdFilter = document.querySelector("[data-file-filter-target-id]");
const clientFilter = document.querySelector("[data-file-filter-client]");
const projectFilter = document.querySelector("[data-file-filter-project]");
const filenameFilter = document.querySelector("[data-file-filter-filename]");
const statusFilter = document.querySelector("[data-file-filter-status]");
const fileStatus = document.querySelector("[data-file-status]");
const fileList = document.querySelector("[data-file-list]");
const api = window.LongtailForge.api;

filterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadFiles();
});

loadFiles();

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
    clientId: clientFilter?.value,
    projectId: projectFilter?.value,
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
  fileList.replaceChildren();

  if (attachments.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 8;
    cell.textContent = "No files match the current filters.";
    row.appendChild(cell);
    fileList.appendChild(row);
    return;
  }

  attachments.forEach((attachment) => fileList.appendChild(fileRow(attachment)));
}

function fileRow(attachment) {
  const row = document.createElement("tr");
  const file = attachment.file || {};
  const cells = [
    file.displayName || file.originalFilename || "File",
    attachment.moduleId || attachment.module_id || "",
    `${attachment.targetType || attachment.target_type || ""}: ${attachment.targetId || attachment.target_id || ""}`,
    attachment.clientId || attachment.client_id || "",
    attachment.projectId || attachment.project_id || "",
    statusLabel(file.status, file.scanStatus),
    formatDate(attachment.createdAt || attachment.created_at),
  ].map((value) => {
    const cell = document.createElement("td");

    cell.textContent = value;
    return cell;
  });
  const actions = document.createElement("td");
  const fileId = attachment.fileId || attachment.file_id;

  if (fileId && file.status === "available" && ["not_required", "passed"].includes(file.scanStatus)) {
    const download = document.createElement("a");

    download.href = `/api/files/${encodeURIComponent(fileId)}/download`;
    download.textContent = "Download";
    download.className = "button-link";
    download.setAttribute("download", "");
    actions.appendChild(download);
  }
  if (fileId && file.status !== "deleted") {
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteFile(fileId, file));
    actions.appendChild(deleteButton);
  }
  if (fileId && file.status === "deleted") {
    const restoreButton = document.createElement("button");

    restoreButton.type = "button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", () => restoreFile(fileId));
    actions.appendChild(restoreButton);
  }

  cells[5].className = "file-status-cell";
  row.append(cells[0], cells[1], cells[2], cells[3], cells[4], cells[5], cells[6], actions);
  return row;
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

function setStatus(message, isError = false) {
  fileStatus.textContent = message;
  fileStatus.classList.toggle("error-text", isError);
}
