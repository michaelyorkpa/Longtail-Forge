/* global CustomEvent, FileReader */

(function attachFileAttachments(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const FILE_REPORT_REASON = "security";
  const FILE_QUARANTINE_REASON = "manual_quarantine";

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

  function createAttachmentElement(view, tagName, options = {}) {
    if (view?.createElement) {
      return view.createElement(tagName, options);
    }

    const element = document.createElement(tagName);

    if (options.className) {
      String(options.className).split(/\s+/).filter(Boolean).forEach((className) => element.classList.add(className));
    }
    Object.entries(options.attrs || {}).forEach(([name, value]) => {
      if (value === false || value === null || value === undefined) {
        return;
      }
      element.setAttribute(name, value === true ? "" : String(value));
    });
    Object.entries(options.dataset || {}).forEach(([name, value]) => {
      if (value !== null && value !== undefined) {
        element.dataset[name] = String(value);
      }
    });
    if (options.text !== undefined && options.text !== null) {
      element.textContent = String(options.text);
    }
    (Array.isArray(options.children) ? options.children : [options.children])
      .filter((child) => child !== null && child !== undefined && child !== false)
      .forEach((child) => {
        if (child && typeof child.nodeType === "number") {
          element.appendChild(child);
        } else {
          element.appendChild(document.createTextNode(String(child)));
        }
      });
    return element;
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
    const view = global.LongtailForge?.view;
    const header = createAttachmentElement(view, "div", {
      className: "file-attachments-header",
      children: [
        createAttachmentElement(view, "h3", { text: options.title || "Files" }),
      ],
    });
    const children = [];

    if (!options.targetId) {
      children.push(createAttachmentEmptyState(options.saveFirstMessage || "Save before adding files.", false, view));
    } else {
      children.push(uploadControls(container, state), attachmentList(container, state, view));
    }

    container.replaceChildren(createAttachmentPanelShell(state, view, header, children));
  }

  function createAttachmentPanelShell(state, view, header, children) {
    const { options } = state;
    const attrs = {
      "data-file-attachments": options.moduleId || "",
      "data-file-attachment-panel": "",
    };
    const statusClassName = state.error ? "file-attachments-status is-error" : "file-attachments-status";

    if (view?.createListShell) {
      return view.createListShell({
        tagName: "section",
        className: "file-attachments file-attachments-panel-shell",
        attrs,
        before: header,
        statusMessage: statusMessage(state),
        statusClassName,
        statusAttrs: { "data-file-attachments-status": "" },
        children,
      });
    }

    return createAttachmentElement(view, "section", {
      className: "file-attachments file-attachments-panel-shell",
      attrs,
      children: [
        header,
        createAttachmentElement(view, "p", {
          className: statusClassName,
          attrs: {
            "aria-live": "polite",
            "data-file-attachments-status": "",
            role: "status",
          },
          text: statusMessage(state),
        }),
        ...children,
      ],
    });
  }

  function uploadControls(container, state) {
    const { options } = state;
    const view = global.LongtailForge?.view;
    const input = createAttachmentElement(view, "input", {
      attrs: {
        "data-file-attachment-input": "",
        accept: acceptedExtensions(options.acceptedCategories).join(","),
        multiple: true,
        type: "file",
      },
      dataset: { fileAttachmentInput: "true" },
    });
    const label = createAttachmentElement(view, "label", {
      children: ["Choose Files", input],
    });
    const dropZone = createAttachmentElement(view, "div", {
      className: "file-attachment-dropzone",
      text: state.isUploading ? "Uploading files..." : "Drop files here",
    });
    const hint = createAttachmentElement(view, "p", {
      className: "file-attachment-upload-hint",
      text: acceptedFileHint(options.acceptedCategories),
    });
    const uploadButton = createUploadButton(state, view);
    const controlRow = createAttachmentElement(view, "div", {
      className: "file-attachment-upload-actions",
      children: [label, uploadButton],
    });
    const form = createAttachmentElement(view, "form", {
      className: "file-attachment-upload",
      attrs: { "aria-label": "Upload files" },
    });
    const results = uploadResultList(state, view);

    form.hidden = options.canUpload === false;
    dropZone.tabIndex = 0;
    input.multiple = true;

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

    form.append(createUploadShell(state, view, [dropZone, hint, controlRow, results]));
    return form;
  }

  function createUploadShell(state, view, children) {
    if (view?.createListShell) {
      return view.createListShell({
        className: "file-attachment-upload-shell",
        attrs: { "data-file-upload-shell": "" },
        statusMessage: uploadStatusMessage(state),
        statusClassName: state.error ? "file-attachment-upload-status is-error" : "file-attachment-upload-status",
        statusAttrs: { "data-file-upload-status": "" },
        children,
      });
    }

    return createAttachmentElement(view, "div", {
      className: "file-attachment-upload-shell",
      dataset: { fileUploadShell: "" },
      children: [
        createAttachmentElement(view, "p", {
          className: state.error ? "file-attachment-upload-status is-error" : "file-attachment-upload-status",
          attrs: {
            "aria-live": "polite",
            role: "status",
          },
          dataset: { fileUploadStatus: "" },
          text: uploadStatusMessage(state),
        }),
        ...children,
      ],
    });
  }

  function createUploadButton(state, view) {
    if (view?.createActionButton) {
      return view.createActionButton({
        action: "files.upload",
        disabled: state.isUploading,
        label: state.isUploading ? "Uploading" : "Upload",
        role: "primary",
        type: "submit",
      });
    }

    const button = createAttachmentElement(view, "button", {
      attrs: { type: "submit" },
      text: state.isUploading ? "Uploading" : "Upload",
    });

    button.disabled = state.isUploading;
    return button;
  }

  function attachmentList(container, state, view) {
    const children = [];

    if (state.isLoading) {
      children.push(createAttachmentEmptyState("Loading attachments...", false, view));
      return createAttachmentListShell(view, children);
    }

    if (state.error) {
      children.push(createAttachmentEmptyState(state.error, true, view));
      return createAttachmentListShell(view, children);
    }

    if (state.attachments.length === 0) {
      children.push(createAttachmentEmptyState("No attachments yet.", false, view));
      return createAttachmentListShell(view, children);
    }

    state.attachments.forEach((attachment) => {
      children.push(attachmentItem(container, state, attachment, view));
    });
    return createAttachmentListShell(view, children);
  }

  function createAttachmentListShell(view, children) {
    if (view?.createListShell) {
      return view.createListShell({
        className: "file-attachments-list",
        attrs: { "data-file-attachments-list": "" },
        status: false,
        children,
      });
    }

    return createAttachmentElement(view, "div", {
      className: "file-attachments-list",
      attrs: { "data-file-attachments-list": "" },
      children,
    });
  }

  function attachmentItem(container, state, attachment, view) {
    const { options } = state;
    const file = attachment.file || {};
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;
    const isDownloadable = file.status === "available" && ["not_required", "passed"].includes(file.scanStatus);
    const isDeleted = file.status === "deleted";
    const recoveryMessage = attachmentRecoveryMessage(file, isDownloadable, isDeleted);
    const statusText = statusLabel(file.status, file.scanStatus);
    const reviewText = reviewStateLabel(file.status, file.scanStatus);
    const meta = createAttachmentElement(view, "div", {
      className: "file-attachment-meta surface-chip-row",
      children: [
        createAttachmentMetaChip(view, "Size", formatBytes(file.fileSizeBytes), "file-attachment-size-chip"),
        createAttachmentMetaChip(view, "Status", statusText, `file-attachment-status-chip file-attachment-status-${safeAttachmentStateToken(file.status)}`),
        reviewText === statusText ? null : createAttachmentMetaChip(view, "Review state", reviewText, `file-attachment-review-chip file-attachment-review-${safeAttachmentStateToken(file.scanStatus)}`),
        createAttachmentMetaChip(view, "Visibility", formatToken(attachment.visibility || ""), "file-attachment-visibility-chip"),
      ].filter(Boolean),
    });
    const summary = createAttachmentElement(view, "div", {
      className: "file-attachment-summary",
      children: [
        createAttachmentElement(view, "strong", { text: file.displayName || file.originalFilename || "File" }),
        meta,
        recoveryMessage ? createAttachmentRecoveryState(view, recoveryMessage) : null,
      ],
    });
    const item = createAttachmentElement(view, "article", {
      className: "file-attachment-item",
      attrs: { "data-file-attachment-item": "" },
      dataset: { fileAttachmentId: attachmentId },
      children: [
        summary,
        createAttachmentActions(container, state, attachment, view, {
          isDeleted,
          isDownloadable,
          options,
        }),
      ],
    });

    item.classList.toggle("is-deleted", isDeleted);
    item.classList.toggle("is-quarantined", file.status === "quarantined");
    item.classList.toggle("is-unavailable", !isDownloadable && !isDeleted);
    return item;
  }

  function createAttachmentMetaChip(view, label, value, className) {
    const text = String(value || "").trim();

    if (!text) {
      return null;
    }

    return createAttachmentElement(view, "span", {
      className: ["surface-chip", "file-attachment-meta-chip", className].filter(Boolean).join(" "),
      attrs: {
        "aria-label": `${label}: ${text}`,
        title: `${label}: ${text}`,
      },
      text,
    });
  }

  function createAttachmentActions(container, state, attachment, view, actionState) {
    const { isDeleted, isDownloadable, options } = actionState;
    const file = attachment.file || {};
    const fileId = attachment.fileId || attachment.file_id;
    const isReportable = isAttachmentReportable(attachment, file, fileId, isDeleted, options);
    const isQuarantineable = isAttachmentQuarantineable(attachment, file, fileId, isDeleted, options);
    const download = createAttachmentDownloadAction(view, fileId, file, isDownloadable);
    const remove = createAttachmentActionButton(view, {
      action: "files.removeAttachment",
      hidden: options.canRemove === false || isDeleted,
      label: "Remove",
      onClick: () => removeAttachment(container, state, attachment),
      role: "secondary",
    });
    const report = createAttachmentActionButton(view, {
      action: "files.report",
      hidden: !isReportable,
      label: "Report",
      onClick: () => reportFile(container, state, attachment),
      role: "secondary",
    });
    const quarantine = createAttachmentActionButton(view, {
      action: "files.quarantine",
      hidden: !isQuarantineable,
      label: "Review",
      onClick: () => quarantineFile(container, state, attachment),
      role: "danger",
      variant: "danger",
    });
    const deleteButton = createAttachmentActionButton(view, {
      action: "files.delete",
      hidden: options.canRemove === false || isDeleted,
      label: "Delete File",
      onClick: () => deleteFile(container, state, attachment),
      role: "danger",
      variant: "danger",
    });
    const restore = createAttachmentActionButton(view, {
      action: "files.restore",
      hidden: options.canRemove === false || !isDeleted,
      label: "Restore",
      onClick: () => restoreFile(container, state, attachment),
      role: "secondary",
    });

    const actionNodes = [download, remove, report, quarantine, deleteButton, restore];
    const actions = view?.createDetailActionStrip
      ? view.createDetailActionStrip({
        className: "file-attachment-actions",
        ariaLabel: `File attachment actions for ${file.displayName || file.originalFilename || "file"}`,
        actions: actionNodes,
      })
      : createAttachmentElement(view, "div", {
        className: "file-attachment-actions surface-dense-actions",
        children: actionNodes,
      });

    actions.setAttribute("data-file-attachment-actions", "");
    return actions;
  }

  function createAttachmentDownloadAction(view, fileId, file, isDownloadable) {
    const name = file.displayName || file.originalFilename || "file";
    const download = createAttachmentElement(view, "a", {
      className: "button-link action-button view-action-button file-attachment-action",
      attrs: {
        "aria-label": `Download ${name}`,
        "data-surface-action": "files.download",
        "data-surface-action-role": "secondary",
        download: true,
        href: `/api/files/${encodeURIComponent(fileId)}/download`,
        title: `Download ${name}`,
      },
      text: "Download",
    });

    download.hidden = !isDownloadable;
    return download;
  }

  function createAttachmentActionButton(view, options) {
    const button = view?.createActionButton
      ? view.createActionButton({
        action: options.action,
        className: "file-attachment-action",
        label: options.label,
        onClick: options.onClick,
        role: options.role,
        title: options.title || options.label,
        variant: options.variant,
      })
      : createAttachmentElement(view, "button");

    if (!view?.createActionButton) {
      button.type = "button";
      button.textContent = options.label;
      button.title = options.title || options.label;
      button.className = "file-attachment-action";
      button.addEventListener("click", options.onClick);
      button.dataset.surfaceAction = options.action;
      button.dataset.surfaceActionRole = options.role;
    }

    button.hidden = Boolean(options.hidden);
    return button;
  }

  function createAttachmentRecoveryState(view, message) {
    return createAttachmentElement(view, "p", {
      className: "file-attachment-recovery-state",
      text: message,
    });
  }

  function uploadResultList(state, view) {
    const items = state.uploadResults.map((result) => createUploadResultItem(view, result));

    if (view?.createListShell) {
      return view.createListShell({
        className: "file-attachment-upload-results",
        attrs: { "data-file-upload-results": "" },
        status: false,
        children: items,
      });
    }

    return createAttachmentElement(view, "div", {
      className: "file-attachment-upload-results",
      dataset: { fileUploadResults: "" },
      children: items,
    });
  }

  function createUploadResultItem(view, result) {
    const pendingReview = result.ok && (
      result.file?.status === "pending" ||
      result.file?.scanStatus === "pending" ||
      result.file?.scan_status === "pending"
    );
    const filename = result.originalFilename || result.file?.originalFilename || "File";
    let text = `${filename}: ${result.error || "Upload failed."}`;

    if (pendingReview) {
      text = `${filename} uploaded; review pending.`;
    } else if (result.ok) {
      text = `${filename} uploaded.`;
    }

    return createAttachmentElement(view, "p", {
      className: result.ok ? "file-attachment-upload-result" : "file-attachment-upload-result is-error",
      attrs: { "data-file-upload-result": result.ok ? "success" : "error" },
      text,
    });
  }

  function uploadStatusMessage(state) {
    if (state.isUploading) {
      return "Uploading files...";
    }

    if (state.error) {
      return state.error;
    }

    if (state.uploadResults.length > 0) {
      const succeeded = state.uploadResults.filter((result) => result.ok).length;
      const failed = state.uploadResults.length - succeeded;

      if (failed > 0) {
        return `${succeeded} uploaded, ${failed} failed.`;
      }

      return `${succeeded} uploaded.`;
    }

    return "Select files to upload.";
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

  function isAttachmentReportable(attachment, file, fileId, isDeleted, options) {
    const allowed = readActionBooleanFlag([
      options.canReport,
      attachment.canReport,
      attachment.can_report,
      file.canReport,
      file.can_report,
    ], true);

    return Boolean(fileId && !isDeleted && file.status !== "quarantined" && allowed);
  }

  function isAttachmentQuarantineable(attachment, file, fileId, isDeleted, options) {
    const allowed = readActionBooleanFlag([
      options.canQuarantine,
      attachment.canQuarantine,
      attachment.can_quarantine,
      file.canQuarantine,
      file.can_quarantine,
    ], false);

    return Boolean(fileId && !isDeleted && file.status !== "quarantined" && allowed);
  }

  function readActionBooleanFlag(values, fallback) {
    const explicit = values.find((value) => typeof value === "boolean");
    return typeof explicit === "boolean" ? explicit : fallback;
  }

  function workspaceHasPermission(permissionId) {
    const rawPermissions = namespace.workspaceContext?.permissionIds ||
      namespace.workspaceContext?.permissions;

    if (Array.isArray(rawPermissions)) {
      return rawPermissions.some((permission) => {
        const permissionValue = typeof permission === "string" ? permission : permission?.permissionId || permission?.permission_id || permission?.id;
        return permissionValue === permissionId;
      });
    }

    if (permissionId === "files.manage_quarantine") {
      return namespace.workspaceContext?.permissionHints?.filesManageQuarantine === true;
    }

    return false;
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

  async function reportFile(container, state, attachment) {
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;

    if (!fileId) {
      return;
    }

    const confirmed = await global.LongtailForge.modal.confirm({
      title: "Report file?",
      message: `Report "${file.displayName || file.originalFilename || "this file"}" for review? Downloads will be paused until a workspace admin reviews it.`,
      confirmLabel: "Report File",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/report`, {
        attachmentId,
        reason: FILE_REPORT_REASON,
      });
      emit(container, state, "fileReported", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "File was not reported.";
      render(container, state);
    }
  }

  async function quarantineFile(container, state, attachment) {
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};

    if (!fileId) {
      return;
    }

    const confirmed = await global.LongtailForge.modal.confirm({
      title: "Move file to review?",
      message: `Move "${file.displayName || file.originalFilename || "this file"}" to review? Downloads will remain unavailable until the file is restored.`,
      confirmLabel: "Move to Review",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/quarantine`, { reason: FILE_QUARANTINE_REASON });
      emit(container, state, "fileQuarantined", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = error.message || "File was not moved to review.";
      render(container, state);
    }
  }

  async function deleteFile(container, state, attachment) {
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};

    if (!fileId) {
      return;
    }

    const confirmed = await global.LongtailForge.modal.confirm({
      title: "Delete file?",
      message: `Delete "${file.displayName || file.originalFilename || "this file"}"? The file will be unavailable from attachments, but workspace admins can restore it during the retention window.`,
      confirmLabel: "Delete File",
      danger: true,
    });

    if (!confirmed) {
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
      canReport: true,
      canQuarantine: workspaceHasPermission("files.manage_quarantine"),
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

  function acceptedFileHint(categories) {
    return `Accepted: ${acceptedExtensions(categories).join(", ")}`;
  }

  function statusMessage(state) {
    if (state.error) {
      return state.error;
    }
    if (state.isUploading) {
      return "Uploading attachments...";
    }
    if (state.isLoading) {
      return "Loading attachments...";
    }

    return state.attachments.length === 1 ? "1 attachment" : `${state.attachments.length} attachments`;
  }

  function emptyState(message, isError = false) {
    return createAttachmentElement(global.LongtailForge?.view, "p", {
      className: isError ? "file-attachments-empty is-error" : "file-attachments-empty",
      text: message,
    });
  }

  function createAttachmentEmptyState(message, isError = false, view) {
    if (view?.createEmptyState) {
      return view.createEmptyState({
        className: isError ? "file-attachments-empty is-error" : "file-attachments-empty",
        live: isError ? "assertive" : "polite",
        message,
        role: isError ? "alert" : "status",
      });
    }

    return emptyState(message, isError);
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

    return status ? formatToken(status) : "";
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

  function attachmentRecoveryMessage(file, isDownloadable, isDeleted) {
    if (isDeleted) {
      return "This attachment is unavailable in normal work, but can be restored during the recovery window.";
    }
    if (file.status === "quarantined") {
      return "Downloads are paused while this file is in review.";
    }
    if (file.status === "pending" || file.scanStatus === "pending") {
      return "Download will be available when review completes.";
    }
    if (file.scanStatus === "error") {
      return "Download is unavailable until review is complete.";
    }
    if (!isDownloadable) {
      return "Download is unavailable for this file right now.";
    }

    return "";
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

  function safeAttachmentStateToken(value) {
    return String(value || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  function dashCase(value) {
    return String(value || "").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  namespace.fileAttachments = {
    mount,
  };
  global.LongtailForge = namespace;
}(window));
