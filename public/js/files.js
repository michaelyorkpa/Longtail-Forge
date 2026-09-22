(function attachFilesPage() {
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewFactory} BrowserViewFactory */

  /**
   * The view factory this controller cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing factory still
   * fails at exactly the moment it failed before `0.33.33.38.1` declared it.
   * @returns {BrowserViewFactory}
   */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserViewDescriptorRenderers} BrowserViewDescriptorRenderers */
  
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /** @typedef {import("../../src/types/browser-contracts.js").LongtailForgeBrowserNamespace} LongtailForgeBrowserNamespace */

  /**
   * The namespace root the optional members on this page are reached through.
   *
   * **The root is checked and the member is not, because those are different facts.** Every
   * read keeps its own `?.` exactly where it stands: a missing root failed at the property
   * read before and fails here, in the same expression and the same region, while a present
   * root that publishes no such member goes on short-circuiting as it always did.
   *
   * Read per call rather than captured, so a root replaced between invocations is seen.
   * @returns {LongtailForgeBrowserNamespace}
   */
  function requireNamespace() {
    const namespace = window.LongtailForge;

    if (!namespace) {
      throw new Error("Files requires the LongtailForge namespace.");
    }

    return namespace;
  }

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("Files requires LongtailForge.errors.");
    }
    return errors;
  }

  /**
   * Whether this page received `view-renderer.js` as well as `view-builder.js`.
   *
   * Ten of the eighteen builder pages do not load the renderer, so its members are
   * genuinely partial on the shared factory type. This predicate checks the ones
   * Files uses, so the narrowing is earned rather than asserted.
   * @param {BrowserViewFactory} factory
   * @returns {factory is BrowserViewFactory & BrowserViewDescriptorRenderers}
   */
  function hasDescriptorRenderers(factory) {
    return typeof factory.registerBehavior === "function"
      && typeof factory.renderDescriptorModalForm === "function"
      && typeof factory.renderSurface === "function";
  }
  
  /** @returns {BrowserViewFactory & BrowserViewDescriptorRenderers} */
  function requireDescriptorRenderers() {
    const factory = requireView();
    if (!hasDescriptorRenderers(factory)) {
      throw new Error("Files requires the LongtailForge.view descriptor renderers.");
    }
    return factory;
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFilePreview} BrowserFilePreview */

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
    const apiClient = window.LongtailForge?.api;
    if (!apiClient) {
      throw new Error("Files requires LongtailForge.api.");
    }
    return apiClient;
  }
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

  /**
   * The alert and confirmation dialogs this file cannot ask a question without. Every page that
   * loads this script also loads `shared/modal.js`, so the checked read fails exactly where the
   * raw read failed before.
   * @returns {BrowserModalDialogs}
   */
  function requireModalDialogs() {
    const dialogs = window.LongtailForge?.modal;
    if (!dialogs) {
      throw new Error("Files requires LongtailForge.modal.");
    }
    return dialogs;
  }

  function requireView() {
    const factory = window.LongtailForge?.view;
    if (!factory) {
      throw new Error("Files requires LongtailForge.view.");
    }
    return factory;
  }
  /**
   * The shared preview helper, which `files.html` loads before this controller.
   *
   * `0.33.33.34` moved the record helpers and the action-shaped opener here and this
   * controller read that half through a cast to `BrowserFilePreviewActions`, because the
   * namespace member was undeclared. `0.33.33.38.2.3.1` declared the whole surface, so the
   * cast is gone and every one of the nine members is checked against the writer.
   *
   * Acquired per call rather than at load, which is when it was read before: an absent helper
   * still fails where it is used, not while this file is being evaluated.
   * @returns {BrowserFilePreview}
   */
  function requireFilePreview() {
    const filePreview = window.LongtailForge?.filePreview;

    if (!filePreview) {
      throw new Error("The file preview helper is required by the Files page.");
    }

    return filePreview;
  }
  const state = {
    workspaceType: "business",
    /**
     * The attachment page, accumulated across infinite-scroll loads.
     *
     * Annotated because the narrowed response is what fills it: an untyped `[]` infers a list
     * that can hold nothing, and this is the one direct handoff the truthful response type
     * requires. The rest of this page's state is untouched.
     * @type {import("../../src/types/browser-contracts.js").BrowserFileAttachment[]}
     */
    attachments: [],
    /** @type {import("../../src/types/browser-contracts.js").NormalizedClientOption[]} */
    clients: [],
    pagination: {
      hasMore: false,
      nextCursor: "",
    },
    /** @type {FileProjectOption[]} */
    projects: [],
  };
  const FILE_REPORT_REASON = "security";
  const FILE_QUARANTINE_REASON = "manual_quarantine";
  const FILES_PAGE_SIZE = 50;

  let activeFilesViewDescriptor = null;
  let filesBehaviorRegistered = false;
  let filesEventsBound = false;
  /**
   * The page's element handles, declared unset and filled by `cacheFilesElements` once the shell
   * this file builds is mounted.
   *
   * **There is no markup to trace: this page builds its own chrome.** Each handle is typed from
   * the builder above it - `createFilesFilterChrome` makes the `form`, `createInput` the text and
   * search `input`s, `createClientSelect`/`createProjectSelect`/`createStatusSelect` the three
   * `select`s, `createFilesPaginationChrome` the `div` and its `button`, `createFilesTable` the
   * `tbody`, and the framework's `createListShell` the status line.
   *
   * **Six of the seventeen are left at `Element`, because that is all this page reads them
   * through.** `addEventListener`, `replaceChildren`, `querySelector`, `textContent`, `classList`
   * and `isConnected` are every element's. Naming a subtype for them would claim more than the
   * page uses, and would refuse a builder that legitimately returned something else.
   * @type {Element | null}
   */
  let filterForm = null;
  /** @type {HTMLInputElement | null} */
  let moduleFilter = null;
  /** @type {HTMLInputElement | null} */
  let targetTypeFilter = null;
  /** @type {HTMLInputElement | null} */
  let targetIdFilter = null;
  /** @type {HTMLSelectElement | null} */
  let clientFilter = null;
  /** @type {HTMLSelectElement | null} */
  let projectFilter = null;
  /** @type {HTMLInputElement | null} */
  let advancedProjectFilter = null;
  /** @type {HTMLInputElement | null} */
  let filenameFilter = null;
  /** @type {HTMLSelectElement | null} */
  let statusFilter = null;
  /** @type {Element | null} */
  let fileStatus = null;
  /** @type {Element | null} */
  let fileList = null;
  /** The pagination shell, which this page hides and reveals. @type {HTMLElement | null} */
  let filePagination = null;
  /** @type {Element | null} */
  let fileTableMount = null;
  /** @type {HTMLButtonElement | null} */
  let loadMoreFilesButton = null;
  /** Built by `createFilesElement`, whose published return is `HTMLElement`. @type {HTMLElement | null} */
  let activeFilesTooltip = null;
  /** @type {Element | null} */
  let activeFilesTooltipTarget = null;
  /** @type {Element | null} */
  let activeFileEditorDialog = null;
  let fileEditorOptionRequestId = 0;

  // `0.33.33.38.2.4.4` removed a spread of the previous value. It was the residue of the
  // three-writer arrangement `0.33.33.33.8` recorded and `0.33.33.34` retired: the only
  // member it ever merged in was `openFilePreview` from `shared/file-preview.js`, which
  // that file no longer writes and which this object republishes itself.
  const namespace = window.LongtailForge;

  if (!namespace) {
    throw new Error("Files requires the LongtailForge namespace.");
  }

  namespace.filesDialog = Object.freeze({
    openFileEditor,
    openFileEditorAction,
    openFilePreview: (...args) => requireFilePreview().openFilePreview(...args),
    openFilePreviewAction,
  });

  namespace.moduleActions?.register?.({
    actionId: "files.edit",
    id: "files.edit",
    label: "Edit File Context",
    mode: "edit",
    moduleId: "framework",
    open: openFileEditorAction,
    recordType: "file_attachment",
    requiredPermissions: ["files.view"],
    title: "Edit File Context",
  });
  namespace.moduleActions?.register?.({
    actionId: "files.preview",
    id: "files.preview",
    label: "Preview File",
    mode: "preview",
    moduleId: "framework",
    open: openFilePreviewAction,
    recordType: "file_attachment",
    requiredPermissions: ["files.view"],
    title: "Preview File",
  });

  initialize();

  // 0.33.33.35.1.1: the browse surface is built from a server-delivered descriptor, so the
  // shell and every binding that reads the DOM it creates wait for the workspace context.
  // Before this, the shell was built synchronously against a context hydrated from
  // localStorage, which is empty on a cold load - the case the descriptor fallback covers.
  async function initialize() {
    try {
      await window.LongtailForge?.workspaceContextReady;
    } catch {
      // A rejected context must not strand the page; the descriptor fallback still renders.
    }
    buildFilesViewShell();
    cacheFilesElements();
    bindFilesEvents();
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
    if (!activeFilesViewDescriptor) {
      return;
    }

    requireFilesViewHelper("renderSurface");

    registerFilesViewBehaviors();
    requireDescriptorRenderers().renderSurface({ ...activeFilesViewDescriptor, dataSource: null, modals: [] }, host);
  }

  function registerFilesViewBehaviors() {
    const view = requireView();
    if (filesBehaviorRegistered || typeof view?.registerBehavior !== "function") {
      return;
    }

    filesBehaviorRegistered = true;
    requireDescriptorRenderers().registerBehavior("files.browse.filters", ({ container }) => {
      container.replaceChildren(createFilesFilterChrome());
    });
    requireDescriptorRenderers().registerBehavior("files.browse.results", ({ container }) => {
      container.replaceChildren(createFilesResultsChrome());
    });
  }

  // 0.33.33.35.1.2: null means the server did not deliver this surface, which is the whole
  // contract now - there is no local descriptor to fall back to. 0.33.33.35.1.1 made this
  // readable by moving the shell build behind the workspace context, so an absent surface is
  // an answer rather than a not-yet.
  function filesViewSurfaceDescriptor() {
    const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
    return surfaces.find(
      /** @returns {surface is Record<string, unknown>} */
      (surface) => typeof surface === "object" && surface !== null
        && "id" in surface && surface.id === "files.browse"
        && "moduleId" in surface && surface.moduleId === "framework",
    ) || null;
  }

  /**
   * The checked lookups the typed handles need, in the selector form this estate's other page
   * cohorts use. Each answers `null` for a control that is not the subtype its builder makes.
   *
   * **Narrowing only, with no refusal.** Every handle is already read behind a null check or an
   * optional chain, so a control of the wrong subtype takes the absent path this page has today
   * rather than throwing at the member read. The four lookups whose handles stay `Element` keep
   * `document.querySelector` directly, because they need no subtype at all.
   *
   * @param {string} selector
   * @returns {HTMLInputElement | null}
   */
  function findFilesInput(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLInputElement ? element : null;
  }

  /** @param {string} selector @returns {HTMLSelectElement | null} */
  function findFilesSelect(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLSelectElement ? element : null;
  }

  /** @param {string} selector @returns {HTMLButtonElement | null} */
  function findFilesButton(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLButtonElement ? element : null;
  }

  /** @param {string} selector @returns {HTMLElement | null} */
  function findFilesHtmlElement(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLElement ? element : null;
  }

  function cacheFilesElements() {
    filterForm = document.querySelector("[data-file-filters]");
    moduleFilter = findFilesInput("[data-file-filter-module]");
    targetTypeFilter = findFilesInput("[data-file-filter-target-type]");
    targetIdFilter = findFilesInput("[data-file-filter-target-id]");
    clientFilter = findFilesSelect("[data-file-filter-client]");
    projectFilter = findFilesSelect("[data-file-filter-project]");
    advancedProjectFilter = findFilesInput("[data-file-filter-project-id]");
    filenameFilter = findFilesInput("[data-file-filter-filename]");
    statusFilter = findFilesSelect("[data-file-filter-status]");
    fileStatus = document.querySelector("[data-file-status]");
    fileList = document.querySelector("[data-file-list]");
    filePagination = findFilesHtmlElement("[data-file-pagination]");
    fileTableMount = document.querySelector("[data-file-table-mount]");
    loadMoreFilesButton = findFilesButton("[data-file-load-more]");
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
    const view = requireView();
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
    const api = requireApi();
    try {
      const clientProjects = await api.getJson("/api/client-projects?view=options", { cache: "no-store" });
      const normalizedClients = requireNamespace().clientProjectOptions?.normalizeClients?.(clientProjects) || [];

      state.clients = normalizedClients.filter((client) => client.id && !client.isWorkspaceScope);
      state.projects = flattenProjectOptions(normalizedClients);
    } catch {
      state.clients = [];
      state.projects = [];
    }
  }

  /**
   * One project as this page flattens it for a picker.
   *
   * **Every member is proved**, because this page constructs all four: the id comes from a project
   * the normaliser already kept, and the two labels fall through to `"Untitled Project"`. That is
   * the output-normalized half of the split `BrowserClientProjectOptions` describes - its input is
   * `unknown` because it is a wire body, and its output is named strongly because the writer builds
   * every field.
   *
   * **The option records themselves are deliberately not named here.**
   * `BrowserClientProjectOptionsBody` types its collections `unknown[]` and records naming their
   * elements as the work of whoever owns that shared surface. This page reads them through
   * `normalizeClients`, whose published output is `NormalizedClientOption[]`, so it reuses that
   * rather than settling another owner's debt from the consumer that needs least of it.
   * @typedef {{ id: string, clientId: string, label: string, projectLabel: string }} FileProjectOption
   */

  /**
   * @param {import("../../src/types/browser-contracts.js").NormalizedClientOption[]} clients
   * @returns {FileProjectOption[]}
   */
  function flattenProjectOptions(clients) {
    /** @type {FileProjectOption[]} */
    const projects = [];

    clients.forEach((client) => {
      const clientLabel = requireNamespace().clientProjectOptions?.optionLabel?.(client)
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
        requireNamespace().clientProjectOptions?.optionLabel?.(client) || client.name || "Untitled Client",
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

  // Deliberately left untyped by `0.33.33.43.10`. Both this and `hydrateContextSelect` read a
  // list from `safeOptionList`, which serves **two different option shapes**: a target option,
  // whose `value` is the nested id record `fileEditorTargetOptionValue` serialises, and a project
  // option, whose `value` is a plain id string. Typing either consumer means re-typing that
  // filter to describe what it actually admits, which is its own boundary rather than a detail
  // of this one.
  function createOption(value, label) {
    return createFilesElement("option", {
      attrs: { value },
      text: label,
    });
  }

  async function loadFiles(options = {}) {
    const api = requireApi();
    setStatus("Loading file attachments...");
    updateFilesPagination({ loading: true });

    try {
      const params = readFilters();

      params.set("limit", String(FILES_PAGE_SIZE));
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }

      const page = readFileAttachmentList(
        await api.getJson(`/api/files/attachments?${params.toString()}`, { cache: "no-store" }),
      );
      if (!page) {
        throw new Error("The file attachment response could not be read.");
      }
      const attachments = page.attachments;
      state.attachments = options.append ? [...state.attachments, ...attachments] : attachments;
      state.pagination = normalizeFilesPagination(page.pagination);

      renderFiles(state.attachments);
      updateFilesPagination();
      setStatus(visibleFileCountLabel(state.attachments.length, state.pagination));
    } catch (error) {
      if (requireErrors().caughtStatus(error) === 401) {
        window.location.replace("/login.html");
        return;
      }

      state.attachments = [];
      state.pagination = { hasMore: false, nextCursor: "" };
      renderFiles([]);
      updateFilesPagination();
      setStatus(requireErrors().caughtMessage(error, "Files could not be loaded."), true);
    }
  }

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFileAttachment} BrowserFileAttachment */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFileAttachmentFile} BrowserFileAttachmentFile */
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserFileAttachmentList} BrowserFileAttachmentList */

  /** The fourteen text members `shapeAttachmentForRead` always fills on an attachment. */
  const ATTACHMENT_TEXT = Object.freeze([
    "attachmentRole",
    "caption",
    "clientId",
    "clientLabel",
    "client_label",
    "createdAt",
    "fileAttachmentId",
    "file_attachment_id",
    "fileId",
    "file_id",
    "moduleId",
    "projectId",
    "projectLabel",
    "project_label",
    "targetId",
    "targetLabel",
    "target_label",
    "targetType",
    "visibility",
  ]);

  /** The seven text members the nested file record always fills. */
  const ATTACHMENT_FILE_TEXT = Object.freeze([
    "displayName",
    "extension",
    "mimeTypeDetected",
    "originalFilename",
    "scanStatus",
    "status",
    "uploadedByLabel",
    "uploaded_by_label",
  ]);

  /** The six members the nested file record answers as text or `null`. */
  const ATTACHMENT_FILE_NULLABLE_TEXT = Object.freeze([
    "createdAt",
    "created_at",
    "deletedAt",
    "deleted_at",
    "updatedAt",
    "updated_at",
  ]);

  /**
   * The five orderings the producer's own `Set` admits, its fallback included.
   *
   * Typed to the published union so the reader can hand back one of its members rather than the
   * bare `string` an `includes` test leaves behind. The authority is still the producer: a proof
   * pins this table to `ATTACHMENT_SORT_MODES` rather than to itself.
   * @type {readonly import("../../src/types/browser-contracts.js").BrowserFileAttachmentSort[]}
   */
  const ATTACHMENT_SORTS = Object.freeze(["filename", "newest", "oldest", "size", "status"]);

  /** The four integers `boundedPaginationEnvelope` coerces itself. */
  const ATTACHMENT_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

  /**
   * A plain JSON object, which is the least a wire body can be before any member is read.
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  function isAttachmentRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * The shared bounded pagination envelope, checked member for member.
   *
   * Checked here rather than taken on trust: naming the shared contract without validating its
   * seven members would have claimed a shape this reader never verified.
   * @param {unknown} value
   * @returns {value is import("../../src/types/browser-contracts.js").BrowserBoundedPagination}
   */
  function isAttachmentPagination(value) {
    return isAttachmentRecord(value)
      && ATTACHMENT_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number"
        && Number.isFinite(value[member]))
      && typeof value.hasMore === "boolean"
      && typeof value.nextCursor === "string"
      && (value.total === null || (typeof value.total === "number" && Number.isFinite(value.total)));
  }

  /**
   * @param {unknown} value
   * @returns {value is BrowserFileAttachmentFile}
   */
  function isAttachmentFile(value) {
    return isAttachmentRecord(value)
      && ATTACHMENT_FILE_TEXT.every((member) => typeof value[member] === "string")
      && ATTACHMENT_FILE_NULLABLE_TEXT.every((member) => value[member] === null || typeof value[member] === "string")
      && typeof value.fileSizeBytes === "number"
      && Number.isFinite(value.fileSizeBytes);
  }

  /**
   * One attachment, checked against what the producer reconstructs by name.
   *
   * Both spellings of each paired member are required, because the producer writes both and a
   * consumer of this page's data is entitled to read either.
   * @param {unknown} value
   * @returns {value is BrowserFileAttachment}
   */
  function isFileAttachment(value) {
    return isAttachmentRecord(value)
      && ATTACHMENT_TEXT.every((member) => typeof value[member] === "string")
      && value.fileAttachmentId !== ""
      && (value.removedAt === null || typeof value.removedAt === "string")
      && typeof value.sortOrder === "number"
      && Number.isFinite(value.sortOrder)
      && isAttachmentFile(value.file)
      && (value.target === null || (isAttachmentRecord(value.target)
        && typeof value.target.id === "string"
        && typeof value.target.label === "string"
        && typeof value.target.type === "string"));
  }

  /**
   * The attachment page, read as a whole or not at all.
   *
   * **Refused rather than shortened.** This list drives an infinite-scroll accumulation and a
   * visible count; dropping an element would silently under-report how many attachments a
   * workspace holds, and appending a short page would corrupt the accumulated list. `null` takes
   * the load-error path the page already owned.
   * @param {unknown} body
   * @returns {BrowserFileAttachmentList | null}
   */
  function readFileAttachmentList(body) {
    if (!isAttachmentRecord(body)) {
      return null;
    }
    const { attachments, pagination, sort } = body;
    // `find` rather than `includes`: the membership test answers a boolean and leaves `sort` a
    // bare string, and this reader hands back one of the producer's own words.
    const sortMode = ATTACHMENT_SORTS.find((mode) => mode === sort);
    if (!Array.isArray(attachments) || !attachments.every(isFileAttachment)
      || !isAttachmentPagination(pagination)
      || !sortMode) {
      return null;
    }
    return { attachments, pagination, sort: sortMode };
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

  /**
   * One attachment record as `/api/files/attachments` sends it, and the file it carries.
   *
   * **Declared locally because the estate deliberately does not publish it.** Every published
   * surface that carries one - `BrowserFileAttachmentOptions` and its event listeners - types it
   * `attachment?: unknown`, which is a refusal to name the shape *for consumers*. Naming it here,
   * inside the only mapper that reads it, is the permitted route.
   *
   * **Nothing is proved.** This page reads the response through no checker, so every member is
   * optional and each is named in both spellings the producer has used. `fileRow` is what turns
   * this into something the page can rely on, and it does that by defaulting every member it
   * keeps - which is why the row below can promise strings while this cannot.
   * @typedef {{
   *   canReport?: unknown, can_report?: unknown, canQuarantine?: unknown, can_quarantine?: unknown,
   *   createdAt?: string, created_at?: string, displayName?: string, originalFilename?: string,
   *   extension?: string, fileSizeBytes?: unknown, file_size_bytes?: unknown,
   *   mimeTypeDetected?: string, mime_type_detected?: string, scanStatus?: string,
   *   scan_status?: string, status?: string, uploadedByLabel?: string, uploaded_by_label?: string
   * }} FileRecord
   */

  /**
   * @typedef {{
   *   file?: FileRecord, fileId?: string, file_id?: string,
   *   fileAttachmentId?: string, file_attachment_id?: string,
   *   moduleId?: string, module_id?: string,
   *   targetId?: string, target_id?: string, targetType?: string, target_type?: string,
   *   targetLabel?: string, target_label?: string, target?: { label?: string },
   *   clientId?: string, client_id?: string, clientLabel?: string, client_label?: string,
   *   projectId?: string, project_id?: string, projectLabel?: string, project_label?: string,
   *   createdAt?: string, created_at?: string,
   *   canReport?: unknown, can_report?: unknown, canQuarantine?: unknown, can_quarantine?: unknown
   * }} FileAttachmentRecord
   */

  /** @param {FileAttachmentRecord} attachment */
  function fileRow(attachment) {
    const file = attachment.file || {};
    const attachmentId = attachment.fileAttachmentId || attachment.file_attachment_id || "";
    // Defaulted like every sibling id above and below it - this was the one that was not, and
    // that inconsistency is why the row could not promise a string. Unreachable at the four
    // action call sites, which are all gated on a truthy `fileId` before the button exists.
    const fileId = attachment.fileId || attachment.file_id || "";
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
    const preview = requireFilePreview().previewAvailabilityForRow({
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
    const view = requireView();
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

  /** @param {Element} tbody @param {FileEditorRow[]} rows */
  function wireFilesTableRows(tbody, rows) {
    Array.from(tbody.querySelectorAll("tr")).forEach((rowElement, index) => {
      const row = rows[index];

      if (!row?.attachmentId) {
        return;
      }

      wireFileTableRow(rowElement, row);
    });
  }

  /** @param {HTMLElement} rowElement @param {FileEditorRow} row */
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

  /**
   * Whether a click landed on something that is itself an action.
   *
   * The target is narrowed rather than read through an optional chain: `closest` is an
   * `Element` member, and a target that is not an element could never have answered one. The
   * old `?.closest?.` tolerated exactly that case by answering `undefined`, which this still
   * does - it just says why.
   * @param {Event} event
   */
  function isFileRowActionEvent(event) {
    return event.target instanceof Element
      && Boolean(event.target.closest("[data-file-action], a, button, input, select, textarea"));
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

    // Built into a local first, so the element is read through a binding the compiler can see is
    // never null. The module handle is still assigned before anything observes it, and the order
    // of the writes below is unchanged.
    const tooltip = createFilesElement("div", {
      className: "files-floating-tooltip",
      attrs: { role: "tooltip" },
      text,
    });

    tooltip.id = `files-floating-tooltip-${Date.now()}`;
    activeFilesTooltip = tooltip;
    activeFilesTooltipTarget = target;
    target.setAttribute("aria-describedby", tooltip.id);
    document.body.appendChild(tooltip);
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

  /** @param {string} status @param {string} label */
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
    const view = requireView();
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
    const view = requireView();
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
        requireFilePreview().openFilePreview(row, { trigger: event.currentTarget });
      },
    });

    button.dataset.fileAction = "preview";
    return button;
  }

  function createDownloadOnlyMarker(row) {
    const label = requireFilePreview().previewUnavailableLabel(row);
    const icon = window.LongtailForge?.icons?.createIcon?.("eye", { decorative: true });
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
    const icon = window.LongtailForge?.icons?.createIcon?.("download", { decorative: true });
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
    const view = requireView();
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

  /** @param {FileEditorRow} row */
  function createQuarantineAction(row) {
    const view = requireView();
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
    const view = requireView();
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
    const view = requireView();
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

  /** @param {Event} [event] */
  function stopFileRowActionEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  }

  /**
   * How a caller asks for the editor, and where focus goes when it closes.
   *
   * `trigger` is only ever used when it can take focus - the opener tests `typeof
   * trigger.focus === "function"` before preferring it over `document.activeElement` - so it is
   * declared as what that test admits rather than as a specific element.
   * @typedef {{ trigger?: FileEditorFocusTarget, parent?: unknown,
   *   onSaved?: (detail: { attachmentId?: string, payload?: FileEditorContextPayload,
   *     fileId?: string, lifecycle?: string }) => unknown }} FileEditorDialogOptions
   */

  /**
   * The module-action host the editor reports back to, when it is opened as `files.edit`.
   *
   * Every member is optional and every call site is guarded - `refresh` by a `typeof` test, the
   * other three by `?.` - because a host may implement only the part of the protocol it needs.
   * **Not proved:** this page never validates the host it is handed; the guards are what make an
   * absent or partial host safe.
   * @typedef {{ trigger?: FileEditorFocusTarget, result?: unknown, refresh?: unknown,
   *   complete?: (summary: { actionId: string, recordId?: string, title?: string }) => unknown,
   *   cancel?: (summary: { actionId: string, recordId?: string }) => unknown }} FileEditorActionHost
   */

  /**
   * Somewhere focus can return to. The opener tests `typeof trigger.focus === "function"`
   * before preferring it over `document.activeElement`, so this names exactly what that test
   * admits rather than a specific element type.
   * @typedef {{ focus?: unknown } | null | undefined} FileEditorFocusTarget
   */

  /** @param {{ returnFocusTo?: FileEditorFocusTarget, trigger?: FileEditorFocusTarget }} [params] @param {FileEditorActionHost | null} [hostContext] */
  function openFileEditorAction(params = {}, hostContext = null) {
    const attachmentOrRow = normalizeFileActionRecord(params);
    if (!fileActionAttachmentId(attachmentOrRow)) {
      throw new Error("File Context requires an attachment record.");
    }

    let settled = false;
    const dialog = openFileEditor(attachmentOrRow, {
      trigger: params.returnFocusTo || params.trigger || hostContext?.trigger || null,
      onSaved: async (detail) => {
        settled = true;
        if (typeof hostContext?.refresh === "function") {
          await hostContext.refresh(detail);
        }
        hostContext?.complete?.({
          actionId: "files.edit",
          recordId: detail.attachmentId || fileActionAttachmentId(attachmentOrRow),
          title: attachmentOrRow.fileName || "",
        });
      },
    });

    dialog.addEventListener("close", () => {
      if (!settled) {
        hostContext?.cancel?.({
          actionId: "files.edit",
          recordId: fileActionAttachmentId(attachmentOrRow),
        });
      }
    }, { once: true });

    return hostContext?.result || dialog;
  }

  // Owned by the shared preview helper since 0.33.33.34, so a host page that cannot load
  // this controller still opens the same dialog. Files keeps publishing it because Files
  // owns the `filesDialog` namespace.
  function openFilePreviewAction(params = {}, hostContext = null) {
    return requireFilePreview().openFilePreviewAction(params, hostContext);
  }

  function normalizeFileActionRecord(params = {}) {
    return requireFilePreview().normalizeFileActionRecord(params);
  }

  function fileActionAttachmentId(attachmentOrRow = {}) {
    return requireFilePreview().fileActionAttachmentId(attachmentOrRow);
  }

  /**
   * @param {({ attachment?: unknown } & FileEditorRow)
   *   | import("../../src/types/browser-contracts.js").BrowserFileActionRecord} [attachmentOrRow]
   * the row itself, or the published carrier a module action was invoked with
   * @param {FileEditorDialogOptions} [options]
   */
  function openFileEditor(attachmentOrRow = {}, options = {}) {
    const view = requireView();
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

  /**
   * @param {({ attachment?: unknown, fileName?: unknown } & FileEditorRow)
   *   | import("../../src/types/browser-contracts.js").BrowserFileActionRecord} [attachmentOrRow]
   * @returns {FileEditorRow}
   */
  function normalizeFileEditorRow(attachmentOrRow = {}) {
    if (attachmentOrRow?.attachment && attachmentOrRow.fileName) {
      return attachmentOrRow;
    }
    return fileRow(attachmentOrRow?.attachment || attachmentOrRow || {});
  }

  /**
   * The dialog a footer action acts on, once it exists.
   *
   * These actions close over the `dialog` local before the builder assigns it, so the compiler
   * cannot see that a click can only happen afterwards. **This preserves the throw rather than
   * introducing tolerance**: reading `querySelector` off `null` already failed here, and a silent
   * skip would leave a button that does nothing. Only the message is new.
   * @param {Element | null} dialog
   * @returns {Element}
   */
  function requireFileEditorDialog(dialog) {
    if (!dialog) {
      throw new TypeError("The File Context action requires its dialog.");
    }
    return dialog;
  }

  /** @param {FileEditorRow} row @param {FileEditorDialogOptions} [options] */
  function buildFileEditorDialog(row, options = {}) {
    const view = requireView();
    /**
     * The dialog this builder returns, declared unset because its own footer actions close over
     * it before it exists.
     *
     * Typed from its producer rather than locally: it is assigned the result of
     * `renderDescriptorModalForm`, whose published return is `BrowserViewModalFormElement`.
     * @type {import("../../src/types/browser-contracts.js").BrowserViewModalFormElement | null}
     */
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
        requireFilePreview().openFilePreview(row, { trigger: event.currentTarget });
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
        markFileReviewedFromContext(requireFileEditorDialog(dialog), row, options);
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
    dialog = requireDescriptorRenderers().renderDescriptorModalForm(fileEditorModalDescriptor(), {
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
    const view = requireView();
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
    const view = requireView();
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
    const view = requireView();
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
    const view = requireView();
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
    const view = requireView();
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
    const view = requireView();
    return view.createElement("p", {
      className: "files-file-context-status",
      attrs: { "aria-live": "polite", role: "status" },
      dataset: { fileContextStatus: "" },
    });
  }

  /** @param {Element} dialog @param {FileEditorRow} row */
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

  /**
   * The editor row these readers consume, named for the members they actually read.
   *
   * **Declared locally because no browser contract publishes it**: `fileRow` builds it from an
   * attachment record, and it is this page's presentation shape rather than anything the server
   * sends. **Nothing here is proved** - `fileRow`'s own input is untyped, so these are the members
   * this page writes, carried as preconditions. Every read tolerates their absence: `attachmentId`
   * is checked before the save, the ids are only ever used as fallbacks that collapse to `""`, and
   * the labels and flags are read through `||` or a truthiness test.
   *
   * `0.33.33.43.7` grew this by the five members the dialog half reads, rather than declaring a
   * second row shape beside it: one editor, one row.
   * @typedef {{ attachmentId?: string, clientId?: string, projectId?: string, clientLabel?: string,
   *   targetLabel?: string, fileName?: string, previewable?: unknown, reviewable?: unknown,
   *   fileId?: string, status?: string, scanStatus?: string, canManageReview?: unknown,
   *   moduleId?: string, moduleLabel?: string, projectLabel?: string, targetType?: string,
   *   targetId?: string,
   *   attachment?: unknown,
   *   file?: unknown }} FileEditorRow
   */

  /**
   * The two permission flags a row action consults, in both spellings the producer may send.
   *
   * `readActionBooleanFlag` takes the first value that is actually a boolean and falls back to a
   * workspace permission otherwise, so every member here is optional **and** may legitimately be
   * absent or non-boolean. **Nothing is proved:** this page reads the attachment and file records
   * through no checker, and the server is what enforces the permission - these flags only decide
   * whether the control is offered.
   * @typedef {{ canReport?: unknown, can_report?: unknown,
   *   canQuarantine?: unknown, can_quarantine?: unknown }} FileActionPermissions
   */


  /**
   * One attachable-target choice, as `/api/files/attachable-targets` returns it.
   *
   * Every member is optional because the label builder tests each one before using it, and `value`
   * is the nested id pair the option may carry instead of flat ids. **Not validated**: this page
   * reads the response through no checker, so this names what it reads, not what it proved.
   * @typedef {{ clientId?: string, projectId?: string, clientLabel?: string, projectLabel?: string,
   *   contextLabel?: string, label?: string, moduleLabel?: string, targetTypeLabel?: string,
   *   moduleId?: string, targetId?: string,
   *   targetType?: string, value?: { clientId?: string, projectId?: string, moduleId?: string,
   *   targetId?: string, targetType?: string } }} FileEditorTargetOption
   */

  /**
   * The context payload this page sends to `PATCH /api/files/attachments/:id/context`.
   *
   * **Declared locally because no browser contract publishes it.** The route's accepted shape is
   * `UpdateFileContextSchema` in `src/core/files/files.contracts.js`, which admits a camelCase and
   * a snake_case spelling of each member and requires the module, target type and target id in one
   * of the two spellings. This page sends only the camelCase half, so this names that half.
   *
   * **Proved here:** `moduleId`, `targetType` and `targetId` are non-empty strings - the builder
   * throws before returning when any is missing. **Precondition, not proved:** the two optional
   * ids are whatever the chosen option's dataset or the dialog's own controls carried; nothing on
   * this page validates them, and the server is what refuses a bad one.
   * @typedef {{ moduleId: string, targetType: string, targetId: string, clientId?: string,
   *   projectId?: string }} FileEditorContextPayload
   */

  /** @param {Element} dialog @param {FileEditorRow} row */
  async function loadFileEditorTargetOptions(dialog, row) {
    const api = requireApi();
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
      setFileEditorStatus(dialog, requireErrors().caughtMessage(error, "Target choices could not be loaded."), true);
    }
  }

  /** @param {Element} dialog @param {FileEditorRow} row */
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

  /**
   * One of the editor's context controls, narrowed to what builds it.
   *
   * All three - target, client and project - come from `createFileContextSelect`, which makes a
   * `select`. Narrowing only: both callers already tolerate an absent control, so one of the wrong
   * subtype takes the path an absent one takes rather than throwing at the member read.
   * @param {Element} dialog
   * @param {string} selector
   * @returns {HTMLSelectElement | null}
   */
  function findFileContextSelect(dialog, selector) {
    const control = dialog.querySelector(selector);
    return control instanceof HTMLSelectElement ? control : null;
  }

  /** @param {Element} dialog @param {string} selector @param {string} [fallbackValue] */
  function fileEditorSelectedValue(dialog, selector, fallbackValue = "") {
    const control = findFileContextSelect(dialog, selector);

    if (!control || control.dataset.fileContextLoaded !== "true") {
      return fallbackValue || "";
    }
    return control.value || "";
  }

  /** @param {Element} dialog @param {FileEditorRow} row */
  function fileEditorSelectedContext(dialog, row) {
    return {
      clientId: usesBusinessScope() ? fileEditorSelectedValue(dialog, "[data-file-context-client]", row.clientId) : "",
      projectId: fileEditorSelectedValue(dialog, "[data-file-context-project]", row.projectId),
    };
  }

  /** @param {Element} dialog @param {FileEditorRow} row @param {{ workspaceType?: string, options?: FileEditorTargetOption[] }} response */
  function hydrateFileEditorOptionControls(dialog, row, response) {
    const business = (response.workspaceType || state.workspaceType) === "business";
    const targetSelect = findFileContextSelect(dialog, "[data-file-context-target]");

    hydrateFileEditorContextControls(dialog, row, business);
    if (targetSelect) {
      hydrateTargetSelect(targetSelect, row, response.options || [], fileEditorSelectedContext(dialog, row));
    }
    setFileEditorControlsDisabled(dialog, false, business);
  }

  /** @param {Element} dialog @param {FileEditorRow} row @param {boolean} [business] */
  function hydrateFileEditorContextControls(dialog, row, business = usesBusinessScope()) {
    const clientSelect = findFileContextSelect(dialog, "[data-file-context-client]");
    const clientFieldElement = dialog.querySelector("[data-file-context-business-control]");
    const clientField = clientFieldElement instanceof HTMLElement ? clientFieldElement : null;

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

  /** @param {Element} dialog @param {FileEditorRow} row */
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
      label: requireNamespace().clientProjectOptions?.optionLabel?.(client) || client.name || "Untitled Client",
      value: client.id,
    }));
  }

  /** @param {string} [clientId] @returns {{ label: string, value: string }[]} */
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

  /**
   * @param {HTMLSelectElement} select @param {FileEditorRow} row @param {unknown} options
   * @param {{ clientId?: string, projectId?: string }} [context]
   */
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

  /** @param {FileEditorTargetOption} option @param {{ clientId?: string, projectId?: string }} [context] */
  function createFileEditorTargetOption(option, context = {}) {
    const optionNode = createOption(fileEditorTargetOptionValue(option), fileEditorTargetOptionLabel(option, context));

    optionNode.dataset.moduleId = option.moduleId || option.value?.moduleId || "";
    optionNode.dataset.targetId = option.targetId || option.value?.targetId || "";
    optionNode.dataset.targetType = option.targetType || option.value?.targetType || "";
    optionNode.dataset.clientId = option.clientId || option.value?.clientId || "";
    optionNode.dataset.projectId = option.projectId || option.value?.projectId || "";
    return optionNode;
  }

  /** @param {FileEditorRow} row @returns {FileEditorTargetOption} */
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

  /** @param {FileEditorTargetOption} option */
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

  /** @param {FileEditorTargetOption} option @param {{ clientId?: string, projectId?: string }} [context] */
  function fileEditorTargetOptionLabel(option, context = {}) {
    const targetLabel = metadataText(option.label, "Untitled target");
    const typeLabel = [option.moduleLabel, option.targetTypeLabel].filter(Boolean).join(": ");
    const baseLabel = typeLabel ? `${typeLabel} - ${targetLabel}` : targetLabel;
    const contextLabel = fileEditorTargetContextLabel(option, context);

    return contextLabel ? `${baseLabel} (${contextLabel})` : baseLabel;
  }

  /** @param {FileEditorTargetOption} option @param {{ clientId?: string, projectId?: string }} [context] */
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

  /**
   * The choices worth offering, from a body this page reads through no checker.
   *
   * **Precondition, not proved:** the filter only establishes that an entry carries a `value`
   * or a `targetId`; every other member named by `FileEditorTargetOption` is what the producer
   * is expected to send, and each reader tests it before use.
   * @param {unknown} options @returns {FileEditorTargetOption[]}
   */
  function safeOptionList(options) {
    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];
  }

  /** @param {Element} dialog @param {boolean} disabled @param {boolean} [business] */
  function setFileEditorControlsDisabled(dialog, disabled, business = usesBusinessScope()) {
    // The three context controls are all `select`s from `createFileContextSelect`, so the sweeps
    // below narrow rather than assert. A control of the wrong subtype is skipped instead of
    // being disabled - the same tightening the rest of this page makes, and unreachable while
    // the builder keeps building selects.
    dialog.querySelectorAll("[data-file-context-target], [data-file-context-project]").forEach((control) => {
      if (control instanceof HTMLSelectElement) {
        control.disabled = disabled;
      }
    });
    dialog.querySelectorAll("[data-file-context-client]").forEach((control) => {
      if (control instanceof HTMLSelectElement) {
        control.disabled = disabled || !business;
      }
    });
    syncFileEditorSaveState(dialog, disabled);
  }

  /** @param {Element} dialog @param {boolean} [forceDisabled] */
  function syncFileEditorSaveState(dialog, forceDisabled = false) {
    const saveButtonElement = dialog.querySelector("[data-file-context-save]");
    const saveButton = saveButtonElement instanceof HTMLButtonElement ? saveButtonElement : null;
    const targetSelect = findFileContextSelect(dialog, "[data-file-context-target]");
    const selectedTarget = targetSelect?.selectedOptions?.[0];

    if (!saveButton) {
      return;
    }

    // `Boolean(...)` is the conversion the `disabled` setter already performs on assignment: the
    // last operand is `undefined` whenever no option is selected, and the DOM has always stored
    // that as `false`. Written out so the compiler can see it; the stored value is unchanged.
    saveButton.disabled = Boolean(forceDisabled || !targetSelect?.value || selectedTarget?.disabled);
  }

  /**
   * @param {Element} dialog @param {FileEditorRow} row
   * @param {{ onSaved?: (result: { attachmentId?: string, payload: FileEditorContextPayload }) => void }} [options]
   */
  async function saveFileEditorContext(dialog, row, options = {}) {
    const api = requireApi();
    const view = requireView();
    if (!row.attachmentId) {
      setFileEditorStatus(dialog, "Attachment context could not be saved.", true);
      return;
    }

    let payload = null;

    try {
      payload = fileEditorContextPayload(dialog);
    } catch (error) {
      setFileEditorStatus(dialog, requireErrors().caughtMessage(error, "Choose a target before saving."), true);
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
      setFileEditorStatus(dialog, requireErrors().caughtMessage(error, "File context was not saved."), true);
    }
  }

  /** @param {Element} dialog @param {FileEditorRow} row @param {FileEditorDialogOptions} [options] */
  async function markFileReviewedFromContext(dialog, row, options = {}) {
    const api = requireApi();
    const view = requireView();
    if (!row.fileId || !row.reviewable) {
      setFileEditorStatus(dialog, "This file cannot be marked reviewed from File Context.", true);
      return;
    }

    const confirmed = await requireModalDialogs().confirm({
      title: "Mark file reviewed?",
      message: `Mark "${row.fileName || "this file"}" reviewed? Downloads will be available again when the file is otherwise allowed.`,
      confirmLabel: "Mark Reviewed",
    });

    if (!confirmed) {
      return;
    }

    const markReviewedElement = dialog.querySelector("[data-file-context-mark-reviewed]");
    const markReviewedButton = markReviewedElement instanceof HTMLButtonElement ? markReviewedElement : null;

    setFileEditorStatus(dialog, "Marking file reviewed...");
    setFileEditorControlsDisabled(dialog, true);
    if (markReviewedButton) {
      markReviewedButton.disabled = true;
    }

    try {
      await api.postJson(`/api/files/${encodeURIComponent(`${row.fileId}`)}/restore`, {});
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
      setFileEditorStatus(dialog, requireErrors().caughtMessage(error, "File was not marked reviewed."), true);
    }
  }

  /** @param {Element} dialog @returns {FileEditorContextPayload} */
  function fileEditorContextPayload(dialog) {
    const targetSelect = findFileContextSelect(dialog, "[data-file-context-target]");
    const selectedTarget = targetSelect?.selectedOptions?.[0] || null;
    const targetValue = parseFileEditorTargetValue(targetSelect?.value || "");
    /** @type {FileEditorContextPayload} */
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

  /**
   * The ids an option carries, parsed back out of its serialized value.
   *
   * Answers `{}` for anything unusable - absent, unparseable, or not an object - so every
   * caller reads through `||`. **Nothing is proved**: the members are whatever the option was
   * built with, which is why the payload builder still refuses an incomplete result.
   * @param {unknown} value @returns {Partial<FileEditorContextPayload>}
   */
  function parseFileEditorTargetValue(value) {
    if (!value) {
      return {};
    }

    try {
      // `JSON.parse` converts its argument with ToString, which is what the template does -
      // and unlike `String()` it throws on a symbol exactly as the raw call did, into the
      // same `catch` that already answers `{}`.
      const parsed = JSON.parse(`${value}`);

      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** @param {string} [attachmentId] */
  function focusFileRowByAttachmentId(attachmentId) {
    // Filtered to elements that carry a dataset, which is what the marker is read through.
    // `wireFileTableRow` sets `data-file-editor-row` on an `HTMLElement`, so nothing that can
    // occur is dropped - and a row that somehow were not one simply is not found, which is the
    // path an absent row already took.
    const row = Array.from(document.querySelectorAll("[data-file-editor-row]"))
      .filter((element) => element instanceof HTMLElement)
      .find((element) => element.dataset.fileAttachmentId === attachmentId);

    row?.focus();
  }

  /** @param {Element} dialog @param {string} message @param {boolean} [isError] */
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

  /** @param {FileActionPermissions} attachment @param {FileActionPermissions} file @param {unknown} fileId @param {unknown} status */
  function canReportFileRow(attachment, file, fileId, status) {
    const allowed = readActionBooleanFlag([
      attachment.canReport,
      attachment.can_report,
      file.canReport,
      file.can_report,
    ], true);

    return Boolean(fileId && status !== "deleted" && status !== "quarantined" && allowed);
  }

  /** @param {FileActionPermissions} attachment @param {FileActionPermissions} file @param {unknown} fileId @param {unknown} status */
  function canQuarantineFileRow(attachment, file, fileId, status) {
    const allowed = canManageFileReview(attachment, file, fileId);

    return Boolean(fileId && status !== "deleted" && status !== "quarantined" && allowed);
  }

  /** @param {FileActionPermissions} attachment @param {FileActionPermissions} file @param {unknown} fileId */
  function canManageFileReview(attachment, file, fileId) {
    const allowed = readActionBooleanFlag([
      attachment.canQuarantine,
      attachment.can_quarantine,
      file.canQuarantine,
      file.can_quarantine,
    ], workspaceHasPermission("files.manage_quarantine"));

    return Boolean(fileId && allowed);
  }

  /** @param {FileEditorRow} [row] */
  function canMarkReviewedFileRow(row = {}) {
    return Boolean(
      row.fileId &&
      row.status === "quarantined" &&
      ["not_required", "passed"].includes(row.scanStatus || "") &&
      row.canManageReview,
    );
  }

  /**
   * The first value that is genuinely a boolean, or the fallback.
   *
   * The producer may send a flag under either spelling, or not at all, so the caller hands in
   * every candidate and this picks the first real boolean. A missing flag is not `false` - it
   * means "unstated", which is why the fallback is a separate argument rather than a default.
   * @param {unknown[]} values @param {boolean} fallback @returns {boolean}
   */
  function readActionBooleanFlag(values, fallback) {
    const explicit = values.find((value) => typeof value === "boolean");
    return typeof explicit === "boolean" ? explicit : fallback;
  }

  function workspaceHasPermission(permissionId) {
    if (permissionId === "files.manage_quarantine") {
      return window.LongtailForge?.workspaceContext?.permissionHints?.filesManageQuarantine === true;
    }

    return false;
  }

  /**
   * The three row mutations keep `fileId` as `unknown` and leave `encodeURIComponent(fileId)`
   * exactly as it was, which costs one diagnostic each.
   *
   * **That is a deliberate trade, not an oversight.** Writing the conversion out - as the mark-
   * reviewed path does, where it cost two pin retargets - would here mean widening **25 route
   * pins** across the Files, Notes and view-descriptor contracts to tolerate an optional template
   * wrapper. Those pins exist to catch route drift, and loosening all of them buys an inert
   * conversion: `encodeURIComponent` already converts with `ToString`. `fileRow` builds `fileId`
   * without a string fallback, so it genuinely may be `undefined` and cannot honestly be declared
   * required. The three are recorded in the checkpoint rather than paid for here.
   */

  /**
   * What a row action calls the file in its confirmation.
   *
   * The file is read through no checker - it is whatever the row carried - so the two names are
   * read as members rather than declared. The fallback and the precedence are the ones the three
   * confirmations already used.
   * @param {unknown} file
   * @returns {string}
   */
  function fileActionDisplayName(file) {
    const named = file == null ? undefined : Reflect.get(Object(file), "displayName", file);
    const original = file == null ? undefined : Reflect.get(Object(file), "originalFilename", file);

    return `${named || original || "this file"}`;
  }

  /**
   * The four row mutations leave `fileId` **unannotated**, which keeps one diagnostic each.
   *
   * **`0.33.33.43.9` tried to settle this at the producer and could not.** `fileRow` now
   * defaults `fileId` like every sibling id, so the row it builds really does carry a string -
   * but `FileEditorRow` describes rows generally, and `normalizeFileEditorRow` may hand back a
   * caller's own object without passing it through `fileRow` at all. Declaring the member
   * required makes that pass-through branch and the published carrier unassignable, which is
   * two new diagnostics in place of four. The row cannot promise what only one of its two
   * producers guarantees.
   *
   * **A deliberate trade, stated rather than hidden.** Typing it `unknown` makes
   * `encodeURIComponent(fileId)` a type error, and the two ways out are both worse. Writing the
   * conversion out - as the mark-reviewed path does, where it cost two pin retargets - would here
   * mean widening **25 route pins** across the Files, Notes and view-descriptor contracts, which
   * exist to catch route drift, to buy an inert conversion: `encodeURIComponent` already converts
   * with `ToString`. Leaving it `unknown` and not converting transfers three eliminations out of
   * `params` and into `assorted`, which is debt moved rather than removed.
   *
   * `fileRow` builds `fileId` with no string fallback, so it genuinely may be `undefined` and
   * cannot honestly be declared required. The right fix is to give the row a proved id at its
   * producer, which is `fileRow`'s own boundary and not this one.
   */

  /** @param {unknown} [file] @param {string} [attachmentId] */
  async function reportFile(fileId, file = {}, attachmentId = "") {
    const api = requireApi();
    const confirmed = await requireModalDialogs().confirm({
      title: "Report file?",
      message: `Report "${fileActionDisplayName(file)}" for review? Downloads will be paused until a workspace admin reviews it.`,
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
      setStatus(requireErrors().caughtMessage(error, "File was not reported."), true);
    }
  }

  /** @param {unknown} [file] */
  async function quarantineFile(fileId, file = {}) {
    const api = requireApi();
    const confirmed = await requireModalDialogs().confirm({
      title: "Move file to review?",
      message: `Move "${fileActionDisplayName(file)}" to review? Downloads will remain unavailable until the file is restored.`,
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
      setStatus(requireErrors().caughtMessage(error, "File was not moved to review."), true);
    }
  }

  /** @param {unknown} [file] */
  async function deleteFile(fileId, file = {}) {
    const api = requireApi();
    const confirmed = await requireModalDialogs().confirm({
      title: "Delete file?",
      message: `Delete "${fileActionDisplayName(file)}"? The file will be unavailable from attachments, but workspace admins can restore it during the retention window.`,
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
      setStatus(requireErrors().caughtMessage(error, "File was not deleted."), true);
    }
  }

  async function restoreFile(fileId) {
    const api = requireApi();
    setStatus("Restoring file...");

    try {
      await api.postJson(`/api/files/${encodeURIComponent(fileId)}/restore`, {});
      await loadFiles();
    } catch (error) {
      setStatus(requireErrors().caughtMessage(error, "File was not restored."), true);
    }
  }

  /** @param {string} status @param {string} scanStatus */
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

  /** @param {FileRecord} [file] */
  function readableFileName(file = {}) {
    return String(file.displayName || file.originalFilename || "File").trim() || "File";
  }

  /** @param {string} filename */
  function extensionFromFilename(filename) {
    const match = String(filename || "").match(/\.([A-Za-z0-9]+)$/);

    return match ? match[1].toLowerCase() : "";
  }

  /** @param {string} extension @param {string} [mimeType] */
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

  /** @param {string} targetType @param {string} targetLabel */
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

  /**
   * A timestamp as the producer sends it - an ISO string - or nothing.
   *
   * **Precondition, not proved:** nothing validates the value; the `Number.isNaN` branch below
   * is what already answered for anything unparseable, and it still does.
   * @param {string} [value]
   */
  function formatDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  /** @param {unknown} value */
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
    const view = requireView();
    requireFilesViewHelper("createElement");
    return view.createElement(tagName, options);
  }

  function requireFilesViewHelper(name) {
    const helper = requireView()[name];

    if (typeof helper !== "function") {
      throw new Error(`Files browse requires LongtailForge.view.${name}.`);
    }
    return helper;
  }
})();
