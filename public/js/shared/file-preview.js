(function attachFilePreview(global) {
  const namespace = global.LongtailForge || {};
  const api = namespace.api;
  const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
  const IMAGE_PREVIEW_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png"]);
  const MARKDOWN_PREVIEW_EXTENSIONS = new Set(["md"]);
  const TEXT_PREVIEW_EXTENSIONS = new Set(["txt"]);

  let activeFilePreviewDialog = null;

  function openFilePreview(attachmentOrRow = {}, options = {}) {
    requireFilePreviewViewHelper("createActionButton");
    requireFilePreviewViewHelper("closeModal");
    requireFilePreviewViewHelper("createModal");
    requireFilePreviewViewHelper("showModal");

    const view = currentView();
    const row = normalizeFilePreviewRow(attachmentOrRow, options);
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
    const view = currentView();
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
    const icon = namespace.icons?.createIcon?.("download", { decorative: true });
    const link = createFilePreviewElement("a", {
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
        global.location.replace("/login.html");
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
    const view = currentView();
    const image = createFilePreviewElement("img", {
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
    setFilePreviewBody(dialog, createFilePreviewElement("pre", {
      className: "files-preview-text",
      children: [
        createFilePreviewElement("code", { text: text || "" }),
      ],
    }));
  }

  function renderFilePreviewMarkdown(dialog, html) {
    const view = currentView();
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
    return currentView().createElement("p", {
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

  function normalizeFilePreviewRow(attachmentOrRow = {}, options = {}) {
    if (attachmentOrRow?.attachment && attachmentOrRow.fileName) {
      return normalizeExistingPreviewRow(attachmentOrRow);
    }

    const attachment = attachmentOrRow?.attachment || attachmentOrRow || {};
    const file = attachment.file || {};
    const fileId = attachment.fileId || attachment.file_id || "";
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id || "";
    const fileName = readableFileName(file);
    const extension = file.extension || extensionFromFilename(file.originalFilename || file.original_filename || fileName);
    const status = file.status || file.file_status || "available";
    const scanStatus = file.scanStatus || file.scan_status || "";
    const fileSizeBytes = Number(file.fileSizeBytes || file.file_size_bytes || 0);
    const preview = previewAvailabilityForRow({
      canPreviewInReview: options.canPreviewInReview === true || attachment.canPreviewInReview === true || attachment.can_preview_in_review === true,
      extension,
      fileSizeBytes,
      scanStatus,
      status,
    });

    return {
      attachment,
      attachmentId,
      file: {
        ...file,
        displayName: file.displayName || file.display_name || fileName,
        originalFilename: file.originalFilename || file.original_filename || fileName,
      },
      fileId,
      fileName,
      extension,
      fileSizeBytes,
      previewKind: preview.kind,
      previewReason: preview.reason,
      previewable: preview.state === "previewable",
      previewState: preview.state,
      downloadable: Boolean(fileId && status === "available" && ["not_required", "passed"].includes(scanStatus)),
      status,
      scanStatus,
    };
  }

  function normalizeExistingPreviewRow(row = {}) {
    const preview = row.previewState
      ? { kind: row.previewKind || previewKindForExtension(row.extension), reason: row.previewReason || "", state: row.previewState }
      : previewAvailabilityForRow(row);

    return {
      ...row,
      attachmentId: row.attachmentId || row.fileAttachmentId || row.file_attachment_id || "",
      fileId: row.fileId || row.file_id || "",
      fileName: row.fileName || row.filename || row.file_name || readableFileName(row.file || {}),
      previewKind: preview.kind,
      previewReason: preview.reason,
      previewable: preview.state === "previewable",
      previewState: preview.state,
      downloadable: Boolean(row.downloadable),
    };
  }

  function previewAvailabilityForRow(row = {}) {
    const kind = previewKindForExtension(row.extension);
    const status = String(row.status || "").trim();
    const scanStatus = String(row.scanStatus || row.scan_status || "").trim();
    const canPreviewInReview = row.canPreviewInReview === true || row.can_preview_in_review === true;
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

    if ((kind === "text" || kind === "markdown") && Number(row.fileSizeBytes || row.file_size_bytes || 0) > TEXT_PREVIEW_MAX_BYTES) {
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

  function previewUnavailableLabel(row = {}) {
    const fileName = row.fileName || row.filename || row.file_name || readableFileName(row.file || {});

    if (row.previewState === "too_large_for_preview") {
      return `Preview too large; download ${fileName}`;
    }
    if (row.previewState === "download_only") {
      return `Download-only ${fileName}`;
    }
    return `Preview unavailable for ${fileName}`;
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

  function createFilePreviewElement(tagName, options = {}) {
    const view = currentView();
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

  function requireFilePreviewViewHelper(name) {
    if (typeof currentView()?.[name] !== "function") {
      throw new Error(`LongtailForge.view.${name} is required for file preview.`);
    }
  }

  function currentView() {
    return namespace.view;
  }

  function readableFileName(file = {}) {
    return String(file.displayName || file.display_name || file.originalFilename || file.original_filename || "File").trim() || "File";
  }

  function extensionFromFilename(filename) {
    const match = String(filename || "").match(/\.([A-Za-z0-9]+)$/);

    return match ? match[1].toLowerCase() : "";
  }

  namespace.filePreview = Object.freeze({
    normalizeFilePreviewRow,
    openFilePreview,
    previewAvailabilityForRow,
    previewKindForExtension,
    previewStateMessage,
    previewUnavailableLabel,
  });
  namespace.filesDialog = Object.freeze({
    ...(namespace.filesDialog || {}),
    openFilePreview,
  });
  global.LongtailForge = namespace;
})(window);
