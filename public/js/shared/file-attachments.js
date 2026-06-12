/* global CustomEvent, FileReader */

(function attachFileAttachments(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;

  function mount(container, options = {}) {
    if (!container) {
      throw new Error("Attachment container is required.");
    }

    const state = {
      attachments: [],
      error: "",
      isLoading: false,
      isUploading: false,
      options: normalizeOptions(options),
      uploadResults: [],
    };

    render(container, state);
    const controller = {
      refresh: () => refresh(container, state),
      destroy: () => container.replaceChildren(),
    };

    refresh(container, state);
    return controller;
  }

  async function refresh(container, state) {
    const { options } = state;

    if (!options.moduleId || !options.targetType || !options.targetId) {
      state.attachments = [];
      state.error = "";
      render(container, state);
      emit(container, state, "refresh", { attachments: [] });
      return;
    }

    state.isLoading = true;
    state.error = "";
    render(container, state);

    try {
      const result = await api.getJson(`/api/files/attachments?${new URLSearchParams({
        moduleId: options.moduleId,
        targetType: options.targetType,
        targetId: options.targetId,
      }).toString()}`, { cache: "no-store" });

      const previousStatuses = new Map(state.attachments.map((attachment) => [
        attachment.fileAttachmentId || attachment.file_attachment_id,
        attachment.file?.status,
      ]));
      state.attachments = result.attachments || [];
      state.attachments.forEach((attachment) => {
        const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;
        const status = attachment.file?.status || "";
        if (previousStatuses.has(attachmentId) && previousStatuses.get(attachmentId) !== status) {
          emit(container, state, "statusChanged", { attachment, status });
        }
      });
      emit(container, state, "refresh", { attachments: state.attachments });
    } catch (error) {
      state.error = error.message || "Attachments could not be loaded.";
    } finally {
      state.isLoading = false;
      render(container, state);
    }
  }

  function render(container, state) {
    const { options } = state;
    const root = document.createElement("section");
    const header = document.createElement("div");
    const title = document.createElement("h3");
    const status = document.createElement("p");
    const list = document.createElement("div");

    root.className = "file-attachments";
    root.dataset.fileAttachments = options.moduleId || "";
    header.className = "file-attachments-header";
    title.textContent = options.title || "Files";
    status.className = state.error ? "file-attachments-status is-error" : "file-attachments-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = statusMessage(state);
    list.className = "file-attachments-list";

    header.append(title, status);
    root.append(header);

    if (!options.targetId) {
      root.append(emptyState(options.saveFirstMessage || "Save before adding files."));
    } else {
      root.append(uploadControls(container, state), attachmentList(container, state, list));
    }

    container.replaceChildren(root);
  }

  function uploadControls(container, state) {
    const { options } = state;
    const form = document.createElement("form");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const button = document.createElement("button");
    const dropZone = document.createElement("div");

    form.className = "file-attachment-upload";
    form.hidden = options.canUpload === false;
    dropZone.className = "file-attachment-dropzone";
    dropZone.tabIndex = 0;
    dropZone.textContent = state.isUploading ? "Uploading files..." : "Drop files here";
    label.textContent = "Choose Files";
    input.type = "file";
    input.multiple = true;
    input.dataset.fileAttachmentInput = "true";
    input.setAttribute("data-file-attachment-input", "");
    input.accept = acceptedExtensions(options.acceptedCategories).join(",");
    button.type = "submit";
    button.textContent = state.isUploading ? "Uploading" : "Upload";
    button.disabled = state.isUploading || options.canUpload === false;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (input.files?.length) {
        await uploadFiles(container, state, [...input.files]);
        input.value = "";
      }
    });
    for (const eventName of ["dragenter", "dragover"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-drag-over");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-drag-over");
      });
    }
    dropZone.addEventListener("drop", async (event) => {
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length) {
        await uploadFiles(container, state, files);
      }
    });

    label.append(input);
    form.append(dropZone, label, button, uploadResultList(state));
    return form;
  }

  function attachmentList(container, state, list) {
    if (state.isLoading) {
      list.append(emptyState("Loading files..."));
      return list;
    }

    if (state.error) {
      list.append(emptyState(state.error, true));
      return list;
    }

    if (state.attachments.length === 0) {
      list.append(emptyState("No files attached."));
      return list;
    }

    state.attachments.forEach((attachment) => {
      list.append(attachmentItem(container, state, attachment));
    });
    return list;
  }

  function attachmentItem(container, state, attachment) {
    const { options } = state;
    const file = attachment.file || {};
    const item = document.createElement("article");
    const summary = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const download = document.createElement("a");
    const remove = document.createElement("button");
    const deleteButton = document.createElement("button");
    const restore = document.createElement("button");
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;
    const fileId = attachment.fileId || attachment.file_id;
    const isDownloadable = file.status === "available" && ["not_required", "passed"].includes(file.scanStatus);
    const isDeleted = file.status === "deleted";

    item.className = "file-attachment-item";
    item.classList.toggle("is-deleted", isDeleted);
    item.dataset.fileAttachmentId = attachmentId;
    summary.className = "file-attachment-summary";
    name.textContent = file.displayName || file.originalFilename || "File";
    meta.className = "file-attachment-meta";
    meta.textContent = [
      formatBytes(file.fileSizeBytes),
      statusLabel(file.status, file.scanStatus),
      attachment.visibility || "",
    ].filter(Boolean).join(" | ");
    actions.className = "file-attachment-actions";

    download.href = `/api/files/${encodeURIComponent(fileId)}/download`;
    download.textContent = "Download";
    download.className = "button-link";
    download.hidden = !isDownloadable;
    download.setAttribute("download", "");

    remove.type = "button";
    remove.textContent = "Remove";
    remove.hidden = options.canRemove === false || isDeleted;
    remove.addEventListener("click", () => removeAttachment(container, state, attachment));

    deleteButton.type = "button";
    deleteButton.textContent = "Delete File";
    deleteButton.hidden = options.canRemove === false || isDeleted;
    deleteButton.addEventListener("click", () => deleteFile(container, state, attachment));

    restore.type = "button";
    restore.textContent = "Restore";
    restore.hidden = options.canRemove === false || !isDeleted;
    restore.addEventListener("click", () => restoreFile(container, state, attachment));

    summary.append(name, meta);
    actions.append(download, remove, deleteButton, restore);
    item.append(summary, actions);
    return item;
  }

  function uploadResultList(state) {
    const list = document.createElement("div");

    list.className = "file-attachment-upload-results";
    state.uploadResults.forEach((result) => {
      const item = document.createElement("p");

      item.className = result.ok ? "file-attachment-upload-result" : "file-attachment-upload-result is-error";
      item.textContent = result.ok
        ? `${result.originalFilename || result.file?.originalFilename || "File"} uploaded.`
        : `${result.originalFilename || "File"}: ${result.error || "Upload failed."}`;
      list.append(item);
    });
    return list;
  }

  async function uploadFiles(container, state, files) {
    const { options } = state;

    if (!options.targetId || options.canUpload === false) {
      return;
    }

    state.isUploading = true;
    state.error = "";
    state.uploadResults = [];
    render(container, state);
    emit(container, state, "uploadStarted", { files });

    try {
      const uploadPayloads = [];
      for (const file of files) {
        uploadPayloads.push({
          contentBase64: await readFileBase64(file),
          displayName: file.name,
          originalFilename: file.name,
        });
      }
      const result = await api.postJson("/api/files/batch", {
        files: uploadPayloads,
        moduleId: options.moduleId,
        targetType: options.targetType,
        targetId: options.targetId,
        clientId: options.clientId,
        projectId: options.projectId,
        visibility: options.visibility,
      });

      state.uploadResults = result.results || [];
      if (result.failed > 0) {
        state.error = `${result.succeeded || 0} uploaded, ${result.failed} failed.`;
      }
      emit(container, state, "uploadCompleted", result);
      emit(container, state, "attachmentAdded", result);
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "Upload failed.";
      emit(container, state, "uploadFailed", { error });
    } finally {
      state.isUploading = false;
      render(container, state);
    }
  }

  async function removeAttachment(container, state, attachment) {
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;

    if (!attachmentId) {
      return;
    }

    try {
      await api.postJson(`/api/files/attachments/${encodeURIComponent(attachmentId)}/remove`, {});
      emit(container, state, "attachmentRemoved", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "Attachment was not removed.";
      render(container, state);
    }
  }

  async function deleteFile(container, state, attachment) {
    const fileId = attachment.fileId || attachment.file_id;

    if (!fileId) {
      return;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/delete`, {});
      emit(container, state, "fileDeleted", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "File was not deleted.";
      render(container, state);
    }
  }

  async function restoreFile(container, state, attachment) {
    const fileId = attachment.fileId || attachment.file_id;

    if (!fileId) {
      return;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/restore`, {});
      emit(container, state, "fileRestored", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "File was not restored.";
      render(container, state);
    }
  }

  function emit(container, state, name, detail = {}) {
    const callback = state.options[`on${name.charAt(0).toUpperCase()}${name.slice(1)}`];

    callback?.(detail);
    container.dispatchEvent(new CustomEvent(`longtailforge:file-attachments:${dashCase(name)}`, {
      bubbles: true,
      detail: {
        ...detail,
        moduleId: state.options.moduleId,
        targetId: state.options.targetId,
        targetType: state.options.targetType,
      },
    }));
  }

  function normalizeOptions(options) {
    return {
      acceptedCategories: [],
      canRemove: true,
      canUpload: true,
      clientId: "",
      moduleId: "",
      projectId: "",
      targetId: "",
      targetType: "",
      visibility: "private",
      ...options,
    };
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener("load", () => resolve(String(reader.result || "").split(",").pop() || ""));
      reader.addEventListener("error", () => reject(reader.error || new Error("File could not be read.")));
      reader.readAsDataURL(file);
    });
  }

  function acceptedExtensions(categories) {
    const categorySet = new Set(categories || []);
    const all = {
      archive: [".zip"],
      document: [".doc", ".docx"],
      image: [".gif", ".jpg", ".jpeg", ".png"],
      pdf: [".pdf"],
      presentation: [".ppt", ".pptx"],
      spreadsheet: [".csv", ".xls", ".xlsx"],
      text: [".md", ".txt"],
    };

    if (categorySet.size === 0 || categorySet.has("other")) {
      return Object.values(all).flat();
    }

    return [...categorySet].flatMap((category) => all[category] || []);
  }

  function statusMessage(state) {
    if (state.error) {
      return state.error;
    }
    if (state.isUploading) {
      return "Uploading file...";
    }
    if (state.isLoading) {
      return "Loading files...";
    }

    return `${state.attachments.length} attached`;
  }

  function emptyState(message, isError = false) {
    const element = document.createElement("p");

    element.className = isError ? "file-attachments-empty is-error" : "file-attachments-empty";
    element.textContent = message;
    return element;
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

    return status ? formatToken(status) : "";
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

  function formatToken(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function dashCase(value) {
    return String(value || "").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  namespace.fileAttachments = {
    mount,
  };
  global.LongtailForge = namespace;
}(window));
