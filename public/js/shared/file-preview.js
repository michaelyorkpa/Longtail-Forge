(function attachFilePreview(global) {
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script
  // leaks into the shared type environment the way a top-level `const` leaks into the
  // shared lexical one, which is the thing `0.33.33.33` removed from this estate.
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFileActionRecord} FileActionRecord */

  /**
   * The part of a module-action host context an opener settles against.
   * @typedef {Object} FileActionHostContext
   * @property {(detail?: Record<string, unknown>) => void} [cancel]
   * @property {Promise<unknown>} [result]
   * @property {HTMLElement | null} [trigger]
   */

  const namespace = global.LongtailForge || {};
  const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
  const IMAGE_PREVIEW_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png"]);
  const MARKDOWN_PREVIEW_EXTENSIONS = new Set(["md"]);
  const TEXT_PREVIEW_EXTENSIONS = new Set(["txt"]);

  let activeFilePreviewDialog = null;

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = namespace?.errors;
    if (!errors) {
      throw new Error("File preview requires LongtailForge.errors.");
    }
    return errors;
  }

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
    const apiClient = namespace?.api;
    if (!apiClient) {
      throw new Error("File preview requires LongtailForge.api.");
    }
    return apiClient;
  }
  function openFilePreview(attachmentOrRow = {}, options = {}) {
    requireFilePreviewViewHelper("createActionButton");
    requireFilePreviewViewHelper("closeModal");
    requireFilePreviewViewHelper("createModal");
    requireFilePreviewViewHelper("showModal");

    const view = requireView();
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
    const view = requireView();
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

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreviewContent} BrowserFilePreviewContent */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreviewContentEnvelope} BrowserFilePreviewContentEnvelope */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreviewDescriptor} BrowserFilePreviewDescriptor */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreviewKind} BrowserFilePreviewKind */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreviewState} BrowserFilePreviewState */

  /** The five states the availability function and the access gate answer between them. @type {readonly BrowserFilePreviewState[]} */
  const PREVIEW_DESCRIPTOR_STATES = Object.freeze([
    "download_only", "previewable", "too_large_for_preview", "unauthorized", "unavailable",
  ]);

  /** The four kinds the extension tables map to. @type {readonly BrowserFilePreviewKind[]} */
  const PREVIEW_DESCRIPTOR_KINDS = Object.freeze(["image", "markdown", "text", "unsupported"]);

  /** The descriptor members `shapeAttachmentPreviewDescriptor` always writes as text. */
  const PREVIEW_DESCRIPTOR_TEXT_MEMBERS = Object.freeze([
    "extension", "fileAttachmentId", "file_attachment_id", "fileId", "file_id",
    "fileName", "file_name", "fileType", "file_type", "filename",
    "mimeType", "mime_type", "moduleId", "module_id", "reason",
    "scanStatus", "scan_status", "status", "targetId", "target_id",
    "targetType", "target_type",
  ]);

  /** The two it writes as a byte count. */
  const PREVIEW_DESCRIPTOR_NUMBER_MEMBERS = Object.freeze(["fileSizeBytes", "file_size_bytes"]);

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isFilePreviewRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasFilePreviewText(value, keys) {
    return keys.every((key) => typeof value[key] === "string");
  }

  /**
   * The content route this descriptor's own attachment id addresses.
   *
   * `previewContentUrlForAttachment` builds the URL the browser is asked to follow from the
   * attachment id and nothing else, so the browser can rebuild it rather than trust it. That
   * matters more than it looks: `api.getJson` and `<img src>` both accept any URL a body
   * cares to send, so a descriptor that carried an absolute one would have the page fetching
   * a third-party address and pointing an image at it. Rebuilding also settles the storage
   * question by construction - a storage key, a filesystem path or a signed object URL can
   * never equal this string.
   * @param {Record<string, unknown>} descriptor
   * @returns {string}
   */
  function filePreviewContentRoute(descriptor) {
    return `/api/files/attachments/${encodeURIComponent(String(descriptor.fileAttachmentId))}/preview/content`;
  }

  /**
   * One descriptor as `shapeAttachmentPreviewDescriptor` builds it.
   *
   * The three state spellings and the three kind spellings are checked against each other
   * rather than separately: the producer writes one `state` and one `kind` into three
   * members each, so a body whose copies disagree is not one it sent. The same goes for
   * `contentAvailable`, which it derives from the state rather than deciding independently.
   *
   * No finiteness test guards the byte counts. JSON cannot carry `NaN` or `Infinity` - both
   * serialise to `null` - so requiring a number already excludes them, and a check that can
   * never change an outcome is decoration rather than proof.
   * @param {unknown} value
   * @returns {value is BrowserFilePreviewDescriptor}
   */
  function isFilePreviewDescriptor(value) {
    if (!isFilePreviewRecord(value)
      || !hasFilePreviewText(value, PREVIEW_DESCRIPTOR_TEXT_MEMBERS)
      || !PREVIEW_DESCRIPTOR_NUMBER_MEMBERS.every((key) => typeof value[key] === "number")) {
      return false;
    }

    const state = PREVIEW_DESCRIPTOR_STATES.find((word) => word === value.state);
    const kind = PREVIEW_DESCRIPTOR_KINDS.find((word) => word === value.kind);

    if (!state || !kind
      || value.previewState !== state || value.preview_state !== state
      || value.previewKind !== kind || value.preview_kind !== kind) {
      return false;
    }

    const previewable = state === "previewable";

    if (value.contentAvailable !== previewable || value.content_available !== previewable) {
      return false;
    }

    if (!previewable) {
      return value.contentUrl === undefined && value.content_url === undefined;
    }

    const contentUrl = filePreviewContentRoute(value);

    return kind !== "unsupported" && value.contentUrl === contentUrl && value.content_url === contentUrl;
  }

  /**
   * One content record, in the JSON form the content route answers for text and Markdown.
   *
   * `image` is refused rather than accepted as a third member. The route streams image bytes
   * with their own headers and the browser reaches them through `<img src>`, so a JSON body
   * announcing an image did not come from this producer.
   * @param {unknown} value
   * @returns {value is BrowserFilePreviewContent}
   */
  function isFilePreviewContent(value) {
    if (!isFilePreviewRecord(value)) {
      return false;
    }

    if (value.kind === "text") {
      return value.encoding === "utf-8" && typeof value.text === "string";
    }

    return value.kind === "markdown"
      && value.bodyFormat === "markdown"
      && value.bodyHtmlFormat === "html"
      && typeof value.bodyHtml === "string"
      && typeof value.bodyMarkdown === "string";
  }

  /**
   * The descriptor half of the boundary.
   *
   * A body this refuses is not an unavailable preview. Defaulting the descriptor to `{}` had
   * collapsed those two into one message, so a response the page could not read looked
   * exactly like a server that had considered the file and declined it.
   * @param {unknown} body
   * @returns {BrowserFilePreviewDescriptor | null}
   */
  function readFilePreviewDescriptor(body) {
    if (!isFilePreviewRecord(body)) {
      return null;
    }

    const preview = body.preview;

    return isFilePreviewDescriptor(preview) ? preview : null;
  }

  /**
   * The content half of the boundary, with its embedded descriptor.
   *
   * Both coherences this enforces are things the producer cannot violate: it calls
   * `assertContentAvailable` before building anything, which throws for every state but
   * `previewable`, and it selects the content branch from the same availability record the
   * descriptor is shaped from, so the two kinds are one decision reported twice.
   * @param {unknown} body
   * @returns {BrowserFilePreviewContentEnvelope | null}
   */
  function readFilePreviewContent(body) {
    if (!isFilePreviewRecord(body)) {
      return null;
    }

    const preview = body.preview;

    if (!isFilePreviewDescriptor(preview) || preview.state !== "previewable") {
      return null;
    }

    const content = body.content;

    if (!isFilePreviewContent(content) || content.kind !== preview.kind) {
      return null;
    }

    return { content, preview };
  }

  async function loadFilePreview(dialog, row) {
    const api = requireApi();
    if (!row.attachmentId) {
      renderFilePreviewUnavailable(dialog, "Preview is not available for this file.");
      return;
    }

    setFilePreviewStatus(dialog, "Checking preview availability...");

    try {
      const preview = readFilePreviewDescriptor(
        await api.getJson(`/api/files/attachments/${encodeURIComponent(row.attachmentId)}/preview`, { cache: "no-store" }),
      );

      if (!dialog.isConnected) {
        return;
      }

      if (!preview) {
        throw new Error("The file preview descriptor could not be read.");
      }

      if (preview.state !== "previewable") {
        renderFilePreviewState(dialog, preview);
        return;
      }

      if (preview.kind === "image") {
        renderFilePreviewImage(dialog, preview);
        return;
      }

      setFilePreviewStatus(dialog, "Loading preview...");
      const contentBody = readFilePreviewContent(await api.getJson(preview.contentUrl, { cache: "no-store" }));

      if (!dialog.isConnected) {
        return;
      }

      if (!contentBody) {
        throw new Error("The file preview content could not be read.");
      }

      renderFilePreviewContent(dialog, preview, contentBody.content);
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        global.location.replace("/login.html");
        return;
      }

      renderFilePreviewUnavailable(dialog, requireErrors().caughtMessage(error, "Preview could not be loaded."), true);
    }
  }

  function renderFilePreviewContent(dialog, preview, content) {
    if (content.kind === "text") {
      renderFilePreviewText(dialog, content.text);
      return;
    }

    if (content.kind === "markdown") {
      renderFilePreviewMarkdown(dialog, content.bodyHtml);
      return;
    }

    renderFilePreviewState(dialog, preview);
  }

  function renderFilePreviewImage(dialog, preview) {
    const view = requireView();
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
    const view = requireView();
    const content = view.createElement("div", {
      className: "files-preview-markdown notes-preview",
      attrs: { "data-file-preview-markdown": "" },
    });

    content.innerHTML = html;
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
    return requireView().createElement("p", {
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

  /**
   * The `files.preview` module action, in the shape the registry dispatches: a params
   * bag in, a host context to settle, and the dialog returned when there is no context.
   *
   * `0.33.33.34` moved this here from `public/js/files.js`. The Files page controller
   * self-initializes with its own fetches, so a host page that only wants to preview an
   * attachment cannot load it; before this move, Workbench synthesized a thinner opener
   * of its own and merged it into the Files namespace, which is the temporary writer
   * `0.33.33.33` closed with. Files still owns the namespace and delegates here.
   * @param {FileActionRecord} [params]
   * @param {FileActionHostContext | null} [hostContext]
   * @returns {unknown}
   */
  function openFilePreviewAction(params = {}, hostContext = null) {
    const attachmentOrRow = normalizeFileActionRecord(params);
    if (!fileActionAttachmentId(attachmentOrRow)) {
      throw new Error("File Preview requires an attachment record.");
    }

    const dialog = openFilePreview(attachmentOrRow, {
      trigger: params.returnFocusTo || params.trigger || hostContext?.trigger || null,
    });

    dialog.addEventListener("close", () => {
      hostContext?.cancel?.({
        actionId: "files.preview",
        recordId: fileActionAttachmentId(attachmentOrRow),
      });
    }, { once: true });

    return hostContext?.result || dialog;
  }

  /**
   * Hosts have passed the attachment under several keys; the record itself is also
   * accepted. Preserved exactly as Files declared it so both actions unwrap alike.
   * @param {FileActionRecord} [params]
   * @returns {FileActionRecord}
   */
  function normalizeFileActionRecord(params = {}) {
    return params.row || params.attachment || params.fileAttachment || params.record || params.file || params;
  }

  /**
   * @param {FileActionRecord} [attachmentOrRow]
   * @returns {string}
   */
  function fileActionAttachmentId(attachmentOrRow = {}) {
    return attachmentOrRow.attachmentId || attachmentOrRow.file_attachment_id || attachmentOrRow.attachment?.file_attachment_id || "";
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
    const view = requireView();
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

  /**
   * The view factory the preview dialog cannot run without.
   *
   * `currentView` stays optional because `requireFilePreviewViewHelper` asks it whether a
   * helper is missing; every path that builds the dialog takes the checked one instead.
   * @returns {BrowserViewFactory}
   */
  function requireView() {
    const factory = namespace.view;
    if (!factory) {
      throw new Error("File preview requires LongtailForge.view.");
    }
    return factory;
  }

  function readableFileName(file = {}) {
    return String(file.displayName || file.display_name || file.originalFilename || file.original_filename || "File").trim() || "File";
  }

  function extensionFromFilename(filename) {
    const match = String(filename || "").match(/\.([A-Za-z0-9]+)$/);

    return match ? match[1].toLowerCase() : "";
  }

  // `filesDialog` is not written here. `0.33.33.33.8` recorded this file as the second
  // of three writers of that namespace, and `0.33.33.34` reduced it to the canonical
  // Files owner. The only member this file ever merged in was `openFilePreview`, which
  // `public/js/files.js` already republishes and which nothing in the tree read from
  // `filesDialog`. Host pages read the preview surface here.
  namespace.filePreview = Object.freeze({
    fileActionAttachmentId,
    normalizeFileActionRecord,
    normalizeFilePreviewRow,
    openFilePreview,
    openFilePreviewAction,
    previewAvailabilityForRow,
    previewKindForExtension,
    previewStateMessage,
    previewUnavailableLabel,
  });
  global.LongtailForge = namespace;
})(window);
