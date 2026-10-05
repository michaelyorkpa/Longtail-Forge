/* global CustomEvent, FormData, fetch */

(function attachFileAttachments(global) {
  const namespace = global.LongtailForge || {};
  const FILE_REPORT_REASON = "security";
  const FILE_QUARANTINE_REASON = "manual_quarantine";

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFilePreview} BrowserFilePreview */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewElementOptions} BrowserViewElementOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewActionButtonOptions} BrowserViewActionButtonOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFileAttachmentOptions} BrowserFileAttachmentOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserMountedPanel} BrowserMountedPanel */

  /**
   * The view factory, read lazily because host pages load it after this script.
   *
   * Every helper below takes it rather than reading it, and every one of them has a fallback for
   * its absence - which is why it is optional here rather than required through a checked read.
   * @typedef {BrowserViewFactory | undefined} PanelView
   */

  /**
   * An attachment, plus the four permission flags this panel reads that the validated record
   * does not promise.
   *
   * `isPanelAttachment` proves the members `shapeAttachment` writes; it does not forbid others,
   * and `readActionBooleanFlag` looks for a boolean among five candidate spellings before falling
   * back. Naming them `unknown` and optional says exactly that: the panel looks, and finds one or
   * does not. **This is a finding rather than a repair** - whether the producer should send them
   * is a Files decision, not a typing one.
   * @typedef {BrowserFileAttachment & {
   *   canQuarantine?: unknown, can_quarantine?: unknown, canReport?: unknown, can_report?: unknown
   * }} PanelAttachment
   */

  /** The same four flags, in the nested file record, read by the same lookup. */
  /**
   * @typedef {BrowserFileAttachmentFile & {
   *   canQuarantine?: unknown, can_quarantine?: unknown, canReport?: unknown, can_report?: unknown
   * }} PanelAttachmentFile
   */

  /** The options as the panel holds them, derived from its own normaliser rather than restated. */
  /** @typedef {ReturnType<typeof normalizeOptions>} PanelOptions */

  /**
   * One per-file outcome of the batch upload route, and the body that carries them.
   *
   * **Not validated.** `POST /api/files/upload/batch` answers 201 or 207 with a per-file result
   * list, and `parseMultipartJsonResponse` parses it without checking anything. These declare the
   * members the result list is read for; a body that breaks them reaches the same fallbacks it
   * always reached - `"Upload failed."` for a missing error, `"File"` for a missing name. Closing
   * this boundary properly belongs with the other wire boundaries, not here.
   * @typedef {object} PanelUploadResult
   * @property {unknown} [ok]
   * @property {unknown} [error]
   * @property {unknown} [originalFilename]
   * @property {{ originalFilename?: unknown, scanStatus?: unknown, scan_status?: unknown, status?: unknown }} [file]
   */

  /**
   * @typedef {object} PanelUploadResponse
   * @property {unknown} [error]
   * @property {PanelUploadResult[]} [results]
   * @property {number} [failed]
   * @property {number} [succeeded]
   */

  /**
   * The panel's own mutable state, which every renderer and every action reads.
   * @typedef {object} PanelState
   * @property {BrowserFileAttachment[]} attachments
   * @property {string} error
   * @property {boolean} filesIngressAllowed
   * @property {boolean} isLoading
   * @property {boolean} isUploading
   * @property {PanelOptions} options
   * @property {PanelUploadResult[]} uploadResults
   */

  /**
   * What one attachment's action strip was told about it, computed once by its row.
   * @typedef {object} PanelActionState
   * @property {boolean} isDeleted
   * @property {boolean} isDownloadable
   * @property {PanelOptions} options
   */

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
      throw new Error("File attachments requires LongtailForge.errors.");
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
      throw new Error("File attachments requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

  /**
   * The alert and confirmation dialogs this file cannot ask a question without. Every page that
   * loads this script also loads `shared/modal.js`, so the checked read fails exactly where the
   * raw read failed before.
   * @returns {BrowserModalDialogs}
   */
  function requireModalDialogs() {
    const dialogs = global.LongtailForge?.modal;
    if (!dialogs) {
      throw new Error("File attachments requires LongtailForge.modal.");
    }
    return dialogs;
  }

  /**
   * @param {Element | null} [container]
   * @param {BrowserFileAttachmentOptions} [options]
   * @returns {BrowserMountedPanel}
   */
  function mount(container, options = {}) {
    if (!container) {
      throw new Error("Attachment container is required.");
    }

    const state = {
      attachments: [],
      error: "",
      isLoading: false,
      isUploading: false,
      filesIngressAllowed: publicDemoFilesIngressAllowed(),
      options: normalizeOptions(options),
      uploadResults: [],
    };

    const syncFilesIngressAvailability = () => {
      state.filesIngressAllowed = publicDemoFilesIngressAllowed();
      render(container, state);
    };

    render(container, state);
    global.addEventListener?.("longtailforge:workspace-context-updated", syncFilesIngressAvailability);
    const controller = {
      refresh: () => refresh(container, state),
      destroy: () => {
        global.removeEventListener?.("longtailforge:workspace-context-updated", syncFilesIngressAvailability);
        container.replaceChildren();
      },
    };

    refresh(container, state);
    return controller;
  }

  /**
   * @param {PanelView} view
   * @param {string} tagName
   * @param {BrowserViewElementOptions} [options]
   * @returns {HTMLElement}
   */
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

  /**
   * The two native controls this panel builds and then configures.
   *
   * `createAttachmentElement` answers an `HTMLElement`, because that is what the view factory's
   * `createElement` declares for any tag name. These say which element the tag it was given
   * produces, at the one place each is configured. The refusal throws rather than skipping,
   * because a silently unconfigured control is an upload button that never disables or a file
   * input that accepts one file - both worse than a failure that names itself.
   * @param {HTMLElement} element
   * @returns {HTMLInputElement}
   */
  function requireAttachmentInput(element) {
    if (!(element instanceof HTMLInputElement)) {
      throw new TypeError("The attachment upload control must be a file input.");
    }
    return element;
  }

  /**
   * @param {HTMLElement} element
   * @returns {HTMLButtonElement}
   */
  function requireAttachmentButton(element) {
    if (!(element instanceof HTMLButtonElement)) {
      throw new TypeError("The attachment action control must be a button.");
    }
    return element;
  }

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFileAttachment} BrowserFileAttachment */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFileAttachmentFile} BrowserFileAttachmentFile */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserFileAttachmentList} BrowserFileAttachmentList */

  /**
   * A second reader for a producer `0.33.33.38.4.9.2` already typed, and deliberately so.
   *
   * `public/js/files.js` carries the first one. The two pages share no runtime helper and giving
   * them one would mean a new published surface or a new script on this panel's hosts - a
   * delivery change well outside a one-consumer adoption. **This is a bounded duplicate, not a
   * centralised parser**: both readers are pinned to the same declaration and the same producer,
   * and a proof runs the same fixtures through both, so they can only drift together.
   *
   * The nineteen text members `shapeAttachment` fills on every attachment.
   */
  const PANEL_ATTACHMENT_TEXT = Object.freeze([
    "attachmentRole", "caption", "clientId", "clientLabel", "client_label", "createdAt",
    "fileAttachmentId", "file_attachment_id", "fileId", "file_id", "moduleId", "projectId",
    "projectLabel", "project_label", "targetId", "targetLabel", "target_label", "targetType",
    "visibility",
  ]);

  /** The eight text members the nested file record always fills. */
  const PANEL_ATTACHMENT_FILE_TEXT = Object.freeze([
    "displayName", "extension", "mimeTypeDetected", "originalFilename", "scanStatus", "status",
    "uploadedByLabel", "uploaded_by_label",
  ]);

  /** The six the nested file record answers as text or `null`. */
  const PANEL_ATTACHMENT_FILE_NULLABLE_TEXT = Object.freeze([
    "createdAt", "created_at", "deletedAt", "deleted_at", "updatedAt", "updated_at",
  ]);

  /** The five orderings the producer's own `Set` admits. @type {readonly import("../../../src/types/browser-contracts.js").BrowserFileAttachmentSort[]} */
  const PANEL_ATTACHMENT_SORTS = Object.freeze(["filename", "newest", "oldest", "size", "status"]);

  /** The four integers `boundedPaginationEnvelope` coerces itself. */
  const PANEL_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isPanelRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * The shared bounded pagination envelope, checked member for member.
   *
   * Declared as a predicate rather than a boolean test: naming the shared contract on a value
   * this reader had only tested would have left `pagination` unknown at the point it is answered.
   * @param {unknown} value
   * @returns {value is import("../../../src/types/browser-contracts.js").BrowserBoundedPagination}
   */
  function isPanelPagination(value) {
    return isPanelRecord(value)
      && PANEL_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number")
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && (value.total === null || typeof value.total === "number");
  }

  /** @param {unknown} value @returns {value is BrowserFileAttachmentFile} */
  function isPanelAttachmentFile(value) {
    return isPanelRecord(value)
      && PANEL_ATTACHMENT_FILE_TEXT.every((member) => typeof value[member] === "string")
      && PANEL_ATTACHMENT_FILE_NULLABLE_TEXT.every((member) => value[member] === null || typeof value[member] === "string")
      && typeof value.fileSizeBytes === "number";
  }

  /**
   * One attachment, checked against what the producer reconstructs by name.
   *
   * Both spellings of each paired member are required, because the producer writes both and this
   * panel reads either - the status map keys on `fileAttachmentId || file_attachment_id`.
   * @param {unknown} value
   * @returns {value is BrowserFileAttachment}
   */
  function isPanelAttachment(value) {
    return isPanelRecord(value)
      && PANEL_ATTACHMENT_TEXT.every((member) => typeof value[member] === "string")
      && value.fileAttachmentId !== ""
      && (value.removedAt === null || typeof value.removedAt === "string")
      && typeof value.sortOrder === "number"
      && isPanelAttachmentFile(value.file)
      && (value.target === null || (isPanelRecord(value.target)
        && typeof value.target.id === "string"
        && typeof value.target.label === "string"
        && typeof value.target.type === "string"));
  }

  /**
   * The attachment page, read as a whole or not at all.
   *
   * **The producer's own objects are answered, not rebuilt.** This panel hands whole attachments
   * to its `statusChanged` and `refresh` listeners, so a host reading a member this contract does
   * not promise must still find it. Only the envelope wrapper is new.
   *
   * **Refused rather than shortened.** An attachment dropped here would tell a host that a file
   * it can still see is gone. The whole page is refused instead, and `null` takes the load-error
   * path this panel already owned - which matters more than usual, because the raw read used to
   * turn an unreadable body into an empty list and then emit a *successful* refresh carrying it.
   * @param {unknown} body
   * @returns {BrowserFileAttachmentList | null}
   */
  function readPanelAttachmentList(body) {
    if (!isPanelRecord(body)) {
      return null;
    }

    const { attachments, pagination, sort } = body;
    const sortMode = PANEL_ATTACHMENT_SORTS.find((mode) => mode === sort);

    if (!Array.isArray(attachments) || !attachments.every(isPanelAttachment)
      || !isPanelPagination(pagination)
      || !sortMode) {
      return null;
    }

    return { attachments, pagination, sort: sortMode };
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   */
  async function refresh(container, state) {
    const api = requireApi();
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
      const page = readPanelAttachmentList(await api.getJson(`/api/files/attachments?${new URLSearchParams({
        moduleId: String(options.moduleId),
        targetType: String(options.targetType),
        targetId: String(options.targetId),
      }).toString()}`, { cache: "no-store" }));

      if (!page) {
        throw new Error("The attachment list could not be read.");
      }

      const previousStatuses = new Map(state.attachments.map((attachment) => [
        attachment.fileAttachmentId || attachment.file_attachment_id,
        attachment.file?.status,
      ]));
      state.attachments = page.attachments;
      state.attachments.forEach((attachment) => {
        const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;
        const status = attachment.file?.status || "";
        if (previousStatuses.has(attachmentId) && previousStatuses.get(attachmentId) !== status) {
          emit(container, state, "statusChanged", { attachment, status });
        }
      });
      emit(container, state, "refresh", { attachments: state.attachments });
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "Attachments could not be loaded.");
    } finally {
      state.isLoading = false;
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   */
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
      if (state.filesIngressAllowed) {
        children.push(uploadControls(container, state));
      } else {
        children.push(createAttachmentEmptyState(
          "Uploads are unavailable in the public demo. Seeded attachments remain available to view.",
          false,
          view,
        ));
      }
      children.push(attachmentList(container, state, view));
    }

    container.replaceChildren(createAttachmentPanelShell(state, view, header, children));
  }

  /**
   * @param {PanelState} state
   * @param {PanelView} view
   * @param {HTMLElement} header
   * @param {HTMLElement[]} children
   */
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

  /**
   * @param {Element} container
   * @param {PanelState} state
   */
  function uploadControls(container, state) {
    const { options } = state;
    const view = global.LongtailForge?.view;
    const input = requireAttachmentInput(createAttachmentElement(view, "input", {
      attrs: {
        "data-file-attachment-input": "",
        accept: acceptedExtensions(options.acceptedCategories).join(","),
        multiple: true,
        type: "file",
      },
      dataset: { fileAttachmentInput: "true" },
    }));
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

  /**
   * @param {PanelState} state
   * @param {PanelView} view
   * @param {HTMLElement[]} children
   */
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

  /**
   * @param {PanelState} state
   * @param {PanelView} view
   */
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

    const button = requireAttachmentButton(createAttachmentElement(view, "button", {
      attrs: { type: "submit" },
      text: state.isUploading ? "Uploading" : "Upload",
    }));

    button.disabled = state.isUploading;
    return button;
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelView} view
   */
  function attachmentList(container, state, view) {
    /** @type {HTMLElement[]} */
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

  /**
   * @param {PanelView} view
   * @param {HTMLElement[]} children
   */
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

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   * @param {PanelView} view
   */
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

  /**
   * @param {PanelView} view
   * @param {string} label
   * @param {unknown} value
   * @param {string} className
   * @returns {HTMLElement | null}
   */
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

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   * @param {PanelView} view
   * @param {PanelActionState} actionState
   */
  function createAttachmentActions(container, state, attachment, view, actionState) {
    const { isDeleted, isDownloadable, options } = actionState;
    const file = attachment.file || {};
    const fileId = attachment.fileId || attachment.file_id;
    const isReportable = isAttachmentReportable(attachment, file, fileId, isDeleted, options);
    const isQuarantineable = isAttachmentQuarantineable(attachment, file, fileId, isDeleted, options);
    const previewRow = createAttachmentPreviewRow(attachment, file, options);
    const preview = createAttachmentPreviewAction(view, previewRow);
    const download = createAttachmentDownloadAction(view, fileId, file, isDownloadable);
    const name = file.displayName || file.originalFilename || "file";
    const remove = createAttachmentActionButton(view, {
      action: "files.removeAttachment",
      hidden: options.canRemove === false || isDeleted,
      icon: "delete",
      iconOnly: true,
      label: `Remove attachment ${name}`,
      onClick: () => removeAttachment(container, state, attachment),
      role: "secondary",
      text: "",
      title: `Remove attachment ${name}`,
    });
    const report = createAttachmentActionButton(view, {
      action: "files.report",
      hidden: !isReportable,
      icon: "alert",
      iconOnly: true,
      label: `Report ${name}`,
      onClick: () => reportFile(container, state, attachment),
      role: "secondary",
      text: "",
      title: `Report ${name}`,
    });
    const quarantine = createAttachmentActionButton(view, {
      action: "files.quarantine",
      hidden: !isQuarantineable,
      icon: "shield-alert",
      iconOnly: true,
      label: `Review ${name}`,
      onClick: () => quarantineFile(container, state, attachment),
      role: "danger",
      text: "",
      title: `Review ${name}`,
      variant: "danger",
    });
    const deleteButton = createAttachmentActionButton(view, {
      action: "files.delete",
      hidden: options.canRemove === false || isDeleted,
      icon: "delete",
      iconOnly: true,
      label: `Delete ${name}`,
      onClick: () => deleteFile(container, state, attachment),
      role: "danger",
      text: "",
      title: `Delete ${name}`,
      variant: "danger",
    });
    const restore = createAttachmentActionButton(view, {
      action: "files.restore",
      hidden: options.canRemove === false || !isDeleted,
      icon: "restore",
      iconOnly: true,
      label: `Restore ${name}`,
      onClick: () => restoreFile(container, state, attachment),
      role: "secondary",
      text: "",
      title: `Restore ${name}`,
    });

    const actionNodes = [preview, download, remove, report, quarantine, deleteButton, restore];
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

  /**
   * @param {PanelView} view
   * @param {Record<string, unknown> | null} row
   */
  function createAttachmentPreviewAction(view, row) {
    const name = row?.fileName || "file";

    return createAttachmentActionButton(view, {
      action: "files.preview",
      hidden: !row?.previewable || !namespace.filePreview?.openFilePreview,
      icon: "eye",
      iconOnly: true,
      label: `Preview ${name}`,
      onClick: (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const preview = namespace.filePreview;
        if (!preview) {
          throw new Error("The file preview helper is required to preview an attachment.");
        }
        preview.openFilePreview(row, { trigger: event?.currentTarget || null });
      },
      role: "secondary",
      text: "",
      title: `Preview ${name}`,
    });
  }

  /**
   * @param {PanelView} view
   * @param {string} fileId
   * @param {PanelAttachmentFile} file
   * @param {boolean} isDownloadable
   */
  function createAttachmentDownloadAction(view, fileId, file, isDownloadable) {
    const name = file.displayName || file.originalFilename || "file";
    const label = `Download ${name}`;
    const icon = namespace.icons?.createIcon?.("download", { decorative: true });
    const download = createAttachmentElement(view, "a", {
      className: "button-link action-button view-action-button icon-button file-attachment-action",
      attrs: {
        "aria-label": label,
        "data-surface-action": "files.download",
        "data-surface-action-role": "secondary",
        download: true,
        href: `/api/files/${encodeURIComponent(fileId)}/download`,
        title: label,
      },
    });

    if (icon) {
      download.appendChild(icon);
    } else {
      download.textContent = "Download";
    }
    download.hidden = !isDownloadable;
    return download;
  }

  /**
   * @param {PanelView} view
   * @param {BrowserViewActionButtonOptions & { hidden?: unknown }} options
   * @returns {HTMLElement}
   */
  function createAttachmentActionButton(view, options) {
    const button = view?.createActionButton
      ? view.createActionButton({
        action: options.action,
        className: "file-attachment-action",
        icon: options.icon,
        iconOnly: options.iconOnly,
        label: options.label,
        onClick: options.onClick,
        role: options.role,
        text: options.text,
        title: options.title || options.label,
        variant: options.variant,
      })
      : createAttachmentElement(view, "button");

    if (!view?.createActionButton) {
      // Every sink here coerces on assignment in a real DOM, so the text each one receives is
      // the text it received before, and a listener that is not there is one the DOM already
      // ignored rather than registered.
      const control = requireAttachmentButton(button);
      control.type = "button";
      control.textContent = String(options.text || options.label);
      control.title = String(options.title || options.label);
      control.className = "file-attachment-action";
      if (options.onClick) {
        control.addEventListener("click", options.onClick);
      }
      control.dataset.surfaceAction = String(options.action);
      control.dataset.surfaceActionRole = String(options.role);
    }

    button.hidden = Boolean(options.hidden);
    return button;
  }

  /**
   * @param {PanelAttachment} attachment
   * @param {PanelAttachmentFile} file
   * @param {PanelOptions} options
   * @returns {Record<string, unknown> | null}
   */
  function createAttachmentPreviewRow(attachment, file, options) {
    if (!namespace.filePreview?.normalizeFilePreviewRow) {
      return null;
    }

    return requireAttachmentFilePreview().normalizeFilePreviewRow(attachment, {
      canPreviewInReview: canPreviewAttachmentInReview(attachment, file, options),
    });
  }

  /**
   * @param {PanelAttachment} attachment
   * @param {PanelAttachmentFile} file
   * @param {PanelOptions} options
   * @returns {boolean}
   */
  function canPreviewAttachmentInReview(attachment, file, options) {
    return readActionBooleanFlag([
      options.canQuarantine,
      attachment.canQuarantine,
      attachment.can_quarantine,
      file.canQuarantine,
      file.can_quarantine,
    ], workspaceHasPermission("files.manage_quarantine")) === true;
  }

  /**
   * @param {PanelView} view
   * @param {string} message
   */
  function createAttachmentRecoveryState(view, message) {
    return createAttachmentElement(view, "p", {
      className: "file-attachment-recovery-state",
      text: message,
    });
  }

  /**
   * @param {PanelState} state
   * @param {PanelView} view
   */
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

  /**
   * @param {PanelView} view
   * @param {PanelUploadResult} result
   */
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

  /**
   * @param {PanelState} state
   * @returns {string}
   */
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

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {File[]} files
   */
  async function uploadFiles(container, state, files) {
    const { options } = state;

    if (!state.filesIngressAllowed || !options.targetId || options.canUpload === false) {
      return;
    }

    state.isUploading = true;
    state.error = "";
    state.uploadResults = [];
    render(container, state);
    emit(container, state, "uploadStarted", { files });

    try {
      const result = await postMultipartJson("/api/files/upload/batch", buildUploadForm(options, files));

      state.uploadResults = result.results || [];
      if ((result.failed || 0) > 0) {
        state.error = `${result.succeeded || 0} uploaded, ${result.failed} failed.`;
      }
      emit(container, state, "uploadCompleted", result);
      emit(container, state, "attachmentAdded", result);
      await refresh(container, state);
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "Upload failed.");
      emit(container, state, "uploadFailed", { error });
    } finally {
      state.isUploading = false;
      render(container, state);
    }
  }

  /**
   * @param {PanelOptions} options
   * @param {File[]} files
   * @returns {FormData}
   */
  function buildUploadForm(options, files) {
    const form = new FormData();

    appendFormField(form, "moduleId", options.moduleId);
    appendFormField(form, "targetType", options.targetType);
    appendFormField(form, "targetId", options.targetId);
    appendFormField(form, "clientId", options.clientId);
    appendFormField(form, "projectId", options.projectId);
    appendFormField(form, "visibility", options.visibility);
    if (options.attachmentMetadata) {
      appendFormField(form, "attachmentMetadata", JSON.stringify(options.attachmentMetadata));
    }

    files.forEach((file) => {
      form.append("files", file, file.name);
    });
    return form;
  }

  /**
   * @param {FormData} form
   * @param {string} name
   * @param {unknown} value
   */
  function appendFormField(form, name, value) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      form.append(name, String(value));
    }
  }

  /**
   * @param {string} url
   * @param {FormData} form
   * @returns {Promise<PanelUploadResponse>}
   */
  async function postMultipartJson(url, form) {
    const response = await fetch(url, {
      body: form,
      method: "POST",
    });
    const body = await parseMultipartJsonResponse(response);

    if (!response.ok) {
      throw namespace.errors?.createError?.(body, `Upload failed: ${response.status}`, response.status)
        || new Error(`Upload failed: ${response.status}`);
    }

    // An accepted upload always answers a body. One that did not used to reach `uploadFiles` and
    // fail there on the first member read; it now fails here, on the same path, with the message
    // this file already gives the sibling case of a body it cannot parse.
    if (!body) {
      throw new Error("Upload response could not be read.");
    }

    return body;
  }

  /**
   * @param {Response} response
   * @returns {Promise<PanelUploadResponse | null>}
   */
  async function parseMultipartJsonResponse(response) {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      if (!response.ok) {
        return { error: text || response.statusText };
      }
      throw new Error("Upload response could not be read.");
    }
  }

  /**
   * @param {PanelAttachment} attachment
   * @param {PanelAttachmentFile} file
   * @param {string} fileId
   * @param {boolean} isDeleted
   * @param {PanelOptions} options
   * @returns {boolean}
   */
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

  /**
   * @param {PanelAttachment} attachment
   * @param {PanelAttachmentFile} file
   * @param {string} fileId
   * @param {boolean} isDeleted
   * @param {PanelOptions} options
   * @returns {boolean}
   */
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

  /**
   * The shared preview helper, at the one call site that has already proved it publishes the
   * normaliser. Its guard returns before reaching here, so this never changes an outcome.
   * @returns {BrowserFilePreview}
   */
  function requireAttachmentFilePreview() {
    const preview = namespace.filePreview;

    if (!preview) {
      throw new Error("The file preview helper is required to describe an attachment.");
    }

    return preview;
  }

  /**
   * @param {readonly unknown[]} values
   * @param {boolean} fallback
   * @returns {boolean}
   */
  function readActionBooleanFlag(values, fallback) {
    const explicit = values.find((value) => typeof value === "boolean");
    return typeof explicit === "boolean" ? explicit : fallback;
  }

  /**
   * @param {string} permissionId
   * @returns {boolean}
   */
  function workspaceHasPermission(permissionId) {
    if (permissionId === "files.manage_quarantine") {
      return namespace.workspaceContext?.permissionHints?.filesManageQuarantine === true;
    }

    return false;
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   */
  async function removeAttachment(container, state, attachment) {
    const api = requireApi();
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;

    if (!attachmentId) {
      return;
    }

    try {
      await api.postJson(`/api/files/attachments/${encodeURIComponent(attachmentId)}/remove`, {});
      emit(container, state, "attachmentRemoved", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "Attachment was not removed.");
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   */
  async function reportFile(container, state, attachment) {
    const api = requireApi();
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id;

    if (!fileId) {
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
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
      state.error = requireErrors().caughtMessage(error, "File was not reported.");
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   */
  async function quarantineFile(container, state, attachment) {
    const api = requireApi();
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};

    if (!fileId) {
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
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
      state.error = requireErrors().caughtMessage(error, "File was not moved to review.");
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   */
  async function deleteFile(container, state, attachment) {
    const api = requireApi();
    const fileId = attachment.fileId || attachment.file_id;
    const file = attachment.file || {};

    if (!fileId) {
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
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
      state.error = requireErrors().caughtMessage(error, "File was not deleted.");
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {PanelAttachment} attachment
   */
  async function restoreFile(container, state, attachment) {
    const api = requireApi();
    const fileId = attachment.fileId || attachment.file_id;

    if (!fileId) {
      return;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/restore`, {});
      emit(container, state, "fileRestored", { attachment });
      await refresh(container, state);
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "File was not restored.");
      render(container, state);
    }
  }

  /**
   * @param {Element} container
   * @param {PanelState} state
   * @param {string} name
   * @param {Record<string, unknown>} [detail]
   */
  function emit(container, state, name, detail = {}) {
    // The member is named from the event, so it cannot be resolved as a declared key. `Reflect.get`
    // is the same read the bracket access performed, and it is how `public/js/task-dialog.js`
    // spells the matching write.
    const callback = Reflect.get(state.options, `on${name.charAt(0).toUpperCase()}${name.slice(1)}`);

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

  function publicDemoFilesIngressAllowed() {
    const publicDemo = namespace.workspaceContext?.publicDemo;
    if (!publicDemo || publicDemo.enabled !== true) {
      return true;
    }

    return publicDemo.filesIngressAllowed === true;
  }

  /** @param {BrowserFileAttachmentOptions} [options] */
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

  /**
   * @param {unknown} categories
   * @returns {string[]}
   */
  function acceptedExtensions(categories) {
    const categorySet = new Set(Array.isArray(categories) ? categories : []);
    /** @type {Record<string, string[]>} */
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

    return [...categorySet].flatMap((category) => all[String(category)] || []);
  }

  /**
   * @param {unknown} categories
   * @returns {string}
   */
  function acceptedFileHint(categories) {
    return `Accepted: ${acceptedExtensions(categories).join(", ")}`;
  }

  /**
   * @param {PanelState} state
   * @returns {string}
   */
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

  /**
   * @param {unknown} message
   * @param {boolean} [isError]
   */
  function emptyState(message, isError = false) {
    return createAttachmentElement(global.LongtailForge?.view, "p", {
      className: isError ? "file-attachments-empty is-error" : "file-attachments-empty",
      text: message,
    });
  }

  /**
   * @param {unknown} message
   * @param {boolean} [isError]
   * @param {PanelView} [view]
   */
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

  /**
   * @param {unknown} status
   * @param {unknown} scanStatus
   * @returns {string}
   */
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

  /**
   * @param {unknown} scanStatus
   * @returns {string}
   */
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

  /**
   * @param {unknown} status
   * @param {unknown} scanStatus
   * @returns {string}
   */
  function reviewStateLabel(status, scanStatus) {
    if (status === "quarantined") {
      return "In review";
    }

    return scanStatusLabel(scanStatus);
  }

  /**
   * @param {PanelAttachmentFile} file
   * @param {boolean} isDownloadable
   * @param {boolean} isDeleted
   * @returns {string}
   */
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

  /**
   * @param {unknown} value
   * @returns {string}
   */
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

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function formatToken(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function safeAttachmentStateToken(value) {
    return String(value || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function dashCase(value) {
    return String(value || "").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  namespace.fileAttachments = {
    mount,
  };
  global.LongtailForge = namespace;
}(window));
