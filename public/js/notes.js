const api = window.LongtailForge.api;
const view = window.LongtailForge.view;
const PAGE_SIZE = 12;
const BUCKET_LABELS = {
  active_work: "Active Work",
  ongoing_area: "Ongoing Areas",
  reference: "Reference Library",
};
const NOTE_KIND_LABELS = {
  general: "General",
  meeting: "Meeting",
  research: "Research",
  decision: "Decision",
  procedure: "Procedure",
  reference: "Reference",
  idea: "Idea",
  log: "Log",
  client: "Legacy client",
  project: "Legacy project",
  task: "Legacy task",
  ticket: "Legacy ticket",
  user: "Legacy user",
};
const LEGACY_NOTE_KINDS = new Set(["client", "project", "task", "ticket", "user"]);
const COLLECTION_BUCKET_ORDER = ["active_work", "ongoing_area", "reference"];
const DEFAULT_NOTE_SORT = "updated_desc";
const NOTES_LIST_SORT_OPTIONS = [
  ["title_asc", "Alphabetical (A-Z)"],
  ["title_desc", "Alphabetical (Z-A)"],
  ["created_desc", "Date Created (Newest First)"],
  ["created_asc", "Date Created (Oldest First)"],
  ["updated_desc", "Date Updated (Newest First)", true],
  ["updated_asc", "Date Updated (Oldest First)"],
  ["library_collection_updated_desc", "Library / Collection, then Date Updated"],
  ["note_kind_updated_desc", "Note Kind, then Date Updated"],
  ["primary_context_updated_desc", "Primary Context, then Date Updated"],
];
const LINK_TARGET_TYPE_LABELS = {
  workspace: "Workspace",
  client: "Client",
  list: "List",
  note: "Note",
  project: "Project",
  task: "Task",
  user: "User",
};
const DEFAULT_LINK_TARGET_TYPE = "project";
const LINK_TARGET_TYPE_ORDER = ["project", "task", "note", "list", "client", "user"];
const LINK_CLIENT_CONTEXT_ALL = "all";
const LINK_CLIENT_CONTEXT_WORKSPACE = "workspace";
const NOTE_BULK_COLLECTION_UNCATEGORIZED = "__uncategorized";
const OPEN_EXTERNAL_LINKS_STORAGE_KEY = "lf_open_external_links_new_tab";
const NOTE_WORKFLOW_HANDLERS = {
  "notes.workflow.edit": (note) => openEditor(note),
  "notes.workflow.archive": (note) => archiveNote(note),
  "notes.workflow.restore": (note) => restoreNote(note),
};
const NOTE_EDITOR_TOOLBAR_ACTIONS = Object.freeze([
  { command: "bold", text: "B", label: "Bold" },
  { command: "italic", text: "I", label: "Italic" },
  { command: "underline", text: "U", label: "Underline" },
  { command: "heading", text: "H", label: "Heading" },
  { command: "unorderedList", icon: "list", label: "Unordered list" },
  { command: "orderedList", text: "1.", label: "Ordered list" },
  { command: "checklist", icon: "list-checks", label: "Checklist" },
  { command: "link", icon: "link", label: "Link" },
  { command: "wikiLink", text: "Wiki", label: "Wiki link" },
  { preview: true, icon: "eye", label: "Preview" },
]);

let state = {
  activeBucket: "all",
  availableTags: [],
  attachmentController: null,
  bulkCollections: [],
  bulkTagPicker: null,
  collectionDialogMode: "create",
  collectionEditingId: "",
  collections: [],
  dialogDataReady: null,
  editingNoteId: "",
  editorAttachmentController: null,
  editorContextSummaries: {},
  editorHostContext: null,
  editorHostContextSettled: false,
  editorNote: null,
  editorSelectedTarget: null,
  editorStagedTargets: [],
  libraryManuallyChanged: false,
  linkTargetClientContext: LINK_CLIENT_CONTEXT_ALL,
  linkTargetSearchTimer: null,
  linkTargets: [],
  notes: [],
  notesCursorStack: [],
  notesCurrentCursor: "",
  notesNextCursor: "",
  notesPagination: null,
  page: 1,
  primaryContextClients: [],
  primaryContextProjects: [],
  previewRequestId: 0,
  settingsLoaded: false,
  selectedNote: null,
  selectedNoteIds: new Set(),
  selectedCollectionId: new URLSearchParams(window.location.search).get("collection") || "",
  filesDialogNoteId: "",
  tagPicker: null,
  tagsDialogNoteId: "",
  workspaceType: "",
  openExternalLinksNewTab: readStoredOpenExternalLinksPreference(),
};
let activeNoteViewDialog = null;

const notesWorkspaceHost = document.querySelector("[data-notes-host]");
const isNotesWorkspaceSurface = Boolean(notesWorkspaceHost);

buildNotesViewShell();
if (!isNotesWorkspaceSurface) {
  ensureNotesDialogShells();
}

const statusMessage = document.querySelector("[data-notes-status]");
const filtersForm = document.querySelector("[data-notes-filters]");
const statusFilter = document.querySelector("[data-note-filter-status]");
const visibilityFilter = document.querySelector("[data-note-filter-visibility]");
const securityFilter = document.querySelector("[data-note-filter-security]");
const typeFilter = document.querySelector("[data-note-filter-type]");
const collectionFilter = document.querySelector("[data-note-filter-collection]");
const contextFilter = document.querySelector("[data-note-filter-context]");
const ownerFilter = document.querySelector("[data-note-filter-owner]");
const tagFilter = document.querySelector("[data-note-filter-tags]");
const updatedFilter = document.querySelector("[data-note-filter-updated]");
const sortSelect = document.querySelector("[data-note-sort]");
const notesList = document.querySelector("[data-notes-list]");
const detailPanel = document.querySelector("[data-note-detail]");
const createButton = document.querySelector("[data-note-create]");
const prevButton = document.querySelector("[data-notes-prev]");
const nextButton = document.querySelector("[data-notes-next]");
const pageLabel = document.querySelector("[data-notes-page]");
const collectionPanel = document.querySelector("[data-notes-collections-panel]");
const collectionLibraryFilter = document.querySelector("[data-note-collection-library-filter]");
const collectionActionsMount = document.querySelector("[data-note-collection-actions]");
const dialog = document.querySelector("[data-note-dialog]");
const form = document.querySelector("[data-note-form]");
const dialogTitle = document.querySelector("[data-note-dialog-title]");
const notificationToggle = document.querySelector("[data-note-notification-toggle]");
const titleInput = document.querySelector("[data-note-title]");
const libraryInput = document.querySelector("[data-note-library]");
const collectionInput = document.querySelector("[data-note-collection]");
const typeInput = document.querySelector("[data-note-type]");
const visibilityInput = document.querySelector("[data-note-visibility]");
const securityInput = document.querySelector("[data-note-security]");
const secureWarning = document.querySelector("[data-note-secure-warning]");
const contextClientInput = document.querySelector("[data-note-context-client]");
const contextTargetTypeInput = document.querySelector("[data-note-context-target-type]");
const contextSearchInput = document.querySelector("[data-note-context-search]");
const contextResultsInput = document.querySelector("[data-note-context-results]");
const contextApplyButton = document.querySelector("[data-note-context-apply]");
const contextList = document.querySelector("[data-note-context-list]");
const contextSelectedMessage = document.querySelector("[data-note-context-selected]");
const clientInput = document.querySelector("[data-note-client-id]");
const projectInput = document.querySelector("[data-note-project-id]");
const primaryClientField = document.querySelector("[data-note-primary-client-field]");
const primaryProjectField = document.querySelector("[data-note-primary-project-field]");
const taskInput = document.querySelector("[data-note-task-id]");
const userInput = document.querySelector("[data-note-user-id]");
const suggestionMessage = document.querySelector("[data-note-library-suggestion]");
const detailsGroup = document.querySelector("[data-note-details-group]");
const tagsDialog = document.querySelector("[data-note-tags-dialog]");
const tagsEditor = document.querySelector("[data-note-tags-editor]");
const tagsDialogCloseButton = document.querySelector("[data-note-tags-dialog-close]");
const filesDialog = document.querySelector("[data-note-files-dialog]");
const filesEditor = document.querySelector("[data-note-files-editor]");
const filesDialogCloseButton = document.querySelector("[data-note-files-dialog-close]");
const filesSaveFirstWarning = document.querySelector("[data-note-files-save-first-warning]");
const tagsToggle = document.querySelector("[data-note-tags-toggle]");
const filesToggle = document.querySelector("[data-note-files-toggle]");
const copyLinkButton = document.querySelector("[data-copy-note-link]");
const bodyInput = document.querySelector("[data-note-body]");
const markdownEditor = document.querySelector("[data-note-markdown-editor]");
const previewToggle = document.querySelector("[data-note-preview-toggle]");
const preview = document.querySelector("[data-note-preview]");
const formStatus = document.querySelector("[data-note-form-status]");
const cancelButton = document.querySelector("[data-note-cancel]");
const saveButton = document.querySelector("[data-note-save]");
const saveCloseButton = document.querySelector("[data-note-save-close]");
const bulkToolbar = document.querySelector("[data-note-bulk-toolbar]");
const bulkEditButton = document.querySelector("[data-note-bulk-edit]");
const bulkClearButton = document.querySelector("[data-note-bulk-clear]");
const bulkDialog = document.querySelector("[data-note-bulk-dialog]");
const bulkForm = document.querySelector("[data-note-bulk-form]");
const bulkCancelButton = document.querySelector("[data-note-bulk-cancel]");
const bulkApplyButton = document.querySelector("[data-note-bulk-apply]");
const bulkLibraryInput = document.querySelector("[data-note-bulk-library]");
const bulkCollectionInput = document.querySelector("[data-note-bulk-collection]");
const bulkTypeInput = document.querySelector("[data-note-bulk-type]");
const bulkVisibilityInput = document.querySelector("[data-note-bulk-visibility]");
const bulkTagActionInput = document.querySelector("[data-note-bulk-tag-action]");
const bulkTagsEditor = document.querySelector("[data-note-bulk-tags]");
const bulkFormStatus = document.querySelector("[data-note-bulk-form-status]");
const collectionDialog = document.querySelector("[data-note-collection-dialog]");
const collectionForm = document.querySelector("[data-note-collection-form]");
const collectionDialogTitle = document.querySelector("[data-note-collection-dialog-title]");
const collectionDialogCloseButton = document.querySelector("[data-note-collection-dialog-close]");
const collectionTitleInput = document.querySelector("[data-note-collection-title]");
const collectionLibraryInput = document.querySelector("[data-note-collection-library]");
const collectionParentInput = document.querySelector("[data-note-collection-parent]");
const collectionFormStatus = document.querySelector("[data-note-collection-form-status]");
const collectionCancelButton = document.querySelector("[data-note-collection-cancel]");
const collectionSaveButton = document.querySelector("[data-note-collection-save]");
const collectionActionsDialog = document.querySelector("[data-note-collection-actions-dialog]");
const collectionActionsDialogTitle = document.querySelector("[data-note-collection-actions-dialog-title]");
const collectionActionsDialogBody = document.querySelector("[data-note-collection-actions-dialog-body]");
const collectionActionsDialogCloseButton = document.querySelector("[data-note-collection-actions-dialog-close]");

const editor = window.LongtailForge.notesEditor?.createPlainTextarea(bodyInput);

createButton?.addEventListener("click", () => openEditor());
collectionActionsDialogCloseButton?.addEventListener("click", closeCollectionActionsDialog);
collectionLibraryFilter?.addEventListener("change", () => selectBucket(collectionLibraryFilter.value));
collectionFilter?.addEventListener("change", () => selectCollection(collectionFilter.value));
filtersForm?.addEventListener("change", () => {
  state.page = 1;
  state.selectedCollectionId = collectionFilter?.value || "";
  updateCollectionPanelSelection();
  updateUrlCollection();
  void reloadNotesFromStart();
});
sortSelect?.addEventListener("change", () => {
  state.page = 1;
  void reloadNotesFromStart();
});
prevButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void loadPreviousNotesPage();
});
nextButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void loadNextNotesPage();
});
form?.addEventListener("submit", saveNote);
saveCloseButton?.addEventListener("click", saveAndCloseNote);
notificationToggle?.addEventListener("click", toggleNoteNotificationFollow);
cancelButton?.addEventListener("click", cancelEditor);
bulkEditButton?.addEventListener("click", openBulkEditor);
bulkClearButton?.addEventListener("click", clearBulkSelection);
bulkForm?.addEventListener("submit", applyBulkEdit);
bulkCancelButton?.addEventListener("click", closeBulkEditor);
bulkLibraryInput?.addEventListener("change", populateBulkCollectionOptions);
collectionForm?.addEventListener("submit", saveCollection);
collectionDialogCloseButton?.addEventListener("click", closeCollectionDialog);
collectionCancelButton?.addEventListener("click", closeCollectionDialog);
collectionLibraryInput?.addEventListener("change", () => populateCollectionParentOptions());
libraryInput?.addEventListener("change", () => {
  state.libraryManuallyChanged = true;
  populateNoteCollectionOptions();
  updateLibrarySuggestion();
});
securityInput?.addEventListener("change", updateSecureUiState);
previewToggle?.addEventListener("click", togglePreview);
bodyInput?.addEventListener("input", () => renderPreview());
clientInput?.addEventListener("change", handlePrimaryClientChange);
projectInput?.addEventListener("change", handlePrimaryProjectChange);
[taskInput, userInput].forEach((input) => input?.addEventListener("input", updateLibrarySuggestion));
contextTargetTypeInput?.addEventListener("change", () => loadEditorLinkTargets());
contextClientInput?.addEventListener("change", handleEditorLinkClientContextChange);
contextSearchInput?.addEventListener("input", () => queueEditorLinkTargetSearch());
contextApplyButton?.addEventListener("click", () => applyEditorLinkTarget());
document.querySelector("[data-note-editor-toolbar]")?.addEventListener("click", handleEditorCommand);
tagsToggle?.addEventListener("click", openTagsDialog);
tagsDialogCloseButton?.addEventListener("click", closeTagsDialog);
tagsDialog?.addEventListener("close", handleTagsDialogClose);
filesToggle?.addEventListener("click", openFilesDialog);
filesDialogCloseButton?.addEventListener("click", closeFilesDialog);
filesDialog?.addEventListener("close", handleFilesDialogClose);
copyLinkButton?.addEventListener("click", copyCurrentNoteLink);
dialog?.addEventListener("close", handleEditorDialogClose);

const notesDialogApi = Object.freeze({
  openAdd: (params = {}, hostContext = null) => openNoteEditor({ ...params, mode: "add" }, hostContext),
  openEdit: (params = {}, hostContext = null) => openNoteEditor({ ...params, mode: "edit" }, hostContext),
  openNoteEditor,
  openNoteViewer,
  openView: openNoteViewer,
});

window.LongtailForge.notesDialog = Object.freeze({
  ...(window.LongtailForge.notesDialog || {}),
  ...notesDialogApi,
});

window.LongtailForge.moduleActions?.register?.({
  actionId: "notes.add",
  id: "notes.add",
  label: "Add Note",
  mode: "add",
  moduleId: "notes",
  open: (params, hostContext) => openNoteEditor({ ...params, mode: "add" }, hostContext),
  recordType: "note",
  requiredModules: ["notes"],
  requiredPermissions: ["notes.create"],
  title: "Add Note",
});
window.LongtailForge.moduleActions?.register?.({
  actionId: "notes.edit",
  id: "notes.edit",
  label: "Edit Note",
  mode: "edit",
  moduleId: "notes",
  open: (params, hostContext) => openNoteEditor({ ...params, mode: "edit" }, hostContext),
  recordType: "note",
  requiredModules: ["notes"],
  requiredPermissions: ["notes.view"],
  title: "Edit Note",
});
window.LongtailForge.moduleActions?.register?.({
  actionId: "notes.view",
  id: "notes.view",
  label: "View Note",
  mode: "view",
  moduleId: "notes",
  open: (params, hostContext) => openNoteViewer(params, hostContext),
  recordType: "note",
  requiredModules: ["notes"],
  requiredPermissions: ["notes.view"],
  title: "View Note",
});

if (isNotesWorkspaceSurface) {
  initialize();
}

function buildNotesViewShell() {
  const host = document.querySelector("[data-notes-host]");
  if (!host || host.querySelector("[data-notes-list]")) {
    return;
  }
  if (!view) {
    throw new Error("Notes requires LongtailForge.view to build the protected workspace.");
  }
  registerNotesViewBehaviors();
  const descriptor = notesViewSurfaceDescriptor();
  // The renderer auto-renders descriptor.modals into the surface; Notes builds and owns its own
  // dialogs (createNoteDialogShell/createCollectionDialogShell), so suppress the framework duplicates.
  const surface = view.renderSurface({ ...descriptor, dataSource: null, modals: [] }, host);
  decorateNotesDeclarativeSurface(surface);
  document.body.append(
    createNoteDialogShell(),
    createNoteTagsDialogShell(),
    createNoteFilesDialogShell(),
    createNoteBulkDialogShell(),
    createCollectionDialogShell(),
    createCollectionActionsDialogShell(),
  );
}

function ensureNotesDialogShells() {
  const shells = [];
  if (!document.querySelector("[data-note-dialog]")) {
    shells.push(createNoteDialogShell());
  }
  if (!document.querySelector("[data-note-tags-dialog]")) {
    shells.push(createNoteTagsDialogShell());
  }
  if (!document.querySelector("[data-note-files-dialog]")) {
    shells.push(createNoteFilesDialogShell());
  }

  if (shells.length > 0) {
    document.body.append(...shells);
  }
}

function registerNotesViewBehaviors() {
  if (typeof view.registerBehavior !== "function") {
    return;
  }
  view.registerBehavior("notes.create", () => openEditor());
  view.registerBehavior("notes.sidebar.library", ({ container }) => {
    container.replaceChildren(createNotesLibraryChrome());
  });
  view.registerBehavior("notes.sidebar.notes-list-footer", ({ container }) => {
    container.replaceChildren(createNotesListSortControl(), createNotesPagination());
  });
  view.registerBehavior("notes.filters.tags", hydrateNoteTagFilterOptions);
  Object.keys(NOTE_WORKFLOW_HANDLERS).forEach((behaviorId) => {
    view.registerBehavior(behaviorId, ({ record }) => runNoteWorkflow(behaviorId, record || state.selectedNote));
  });
}

function runNoteWorkflow(behaviorId, note) {
  const handler = NOTE_WORKFLOW_HANDLERS[behaviorId];
  if (!handler || !note) {
    return undefined;
  }
  return handler(note);
}

function notesActionStripDescriptor() {
  return notesViewSurfaceDescriptor().detail?.actionStrip || notesWorkflowActionStripDescriptor();
}

function notesWorkflowActionStripDescriptor() {
  return {
    label: "Note actions",
    actions: [
      { id: "edit-note", label: "Edit", role: "secondary", behavior: "notes.workflow.edit" },
      { id: "archive-note", label: "Archive", role: "secondary", behavior: "notes.workflow.archive" },
      { id: "restore-note", label: "Restore", role: "secondary", behavior: "notes.workflow.restore" },
    ],
  };
}

function notesLinkedRecordsDescriptor() {
  return notesViewSurfaceDescriptor().detail?.linkedRecords || notesLinkedRecordsFallbackDescriptor();
}

function notesLinkedRecordsFallbackDescriptor() {
  return {
    title: "Linked Context",
    recordsField: "links",
    emptyState: { message: "No linked context." },
    fields: [
      { field: "target_type", type: "select", label: "Type", behavior: "notes.link.target-type" },
      { field: "target_search", type: "search", label: "Search records", placeholder: "Search records", autocomplete: "off", behavior: "notes.link.search" },
      { field: "target_results", type: "select", label: "Record", required: true, behavior: "notes.link.results" },
    ],
    actions: [
      { id: "add-link", label: "Add Link", role: "primary", behavior: "notes.link.add" },
      { id: "remove-link", label: "Remove", role: "destructive", behavior: "notes.link.remove" },
    ],
  };
}

function createNoteActionStrip(note) {
  const label = notesActionStripDescriptor().label || "Note actions";
  return view.renderDescriptorActionMenu(detailActionButtons(note), {
    summaryLabel: "...",
    ariaLabel: label,
    title: label,
  });
}

function detailActionButtons(note) {
  const actions = notesActionStripDescriptor().actions || [];
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const buttons = [];
  const archived = note.status === "archived";

  const editAction = actionById.get("edit-note");
  if (editAction) {
    const edit = noteWorkflowActionButton(editAction, note);
    if (archived) {
      edit.disabled = true;
      edit.title = "Restore archived notes before editing.";
    }
    buttons.push(edit);
  }
  const toggleAction = archived ? actionById.get("restore-note") : actionById.get("archive-note");
  if (toggleAction) {
    buttons.push(noteWorkflowActionButton(toggleAction, note));
  }
  return buttons;
}

function noteWorkflowActionButton(action, note) {
  const button = view.createActionButton({
    label: action.label || action.id,
    role: action.role,
    onClick: () => runNoteWorkflow(action.behavior, note),
  });
  button.dataset.noteAction = action.id;
  return button;
}

async function openNoteEditor(params = {}, hostContext = null) {
  await prepareNoteDialogData();

  const mode = normalizeNoteEditorMode(params);
  const noteId = readNoteEditorId(params);
  const note = params.note || params.record || params.noteRecord || (noteId ? { note_id: noteId } : null);

  if (mode === "edit" && !note?.note_id) {
    throw new Error("Note ID is required.");
  }

  const result = await openEditor(mode === "add" ? null : note, {
    defaults: normalizeNoteEditorDefaults(params),
    hostContext,
    trigger: params.returnFocusTo || params.trigger || hostContext?.trigger || null,
  });
  return hostContext?.result || result;
}

async function openNoteViewer(params = {}, hostContext = null) {
  const noteId = readNoteEditorId(params);

  if (!noteId) {
    throw new Error("Note ID is required.");
  }

  await window.LongtailForge.workspaceContextReady;
  await loadMarkdownRenderingPreference();

  if (activeNoteViewDialog?.isConnected) {
    view.closeModal(activeNoteViewDialog, "replace");
  }

  const trigger = params.returnFocusTo || params.trigger || hostContext?.trigger || null;
  const dialog = createNoteViewDialog(noteId);
  const closeResult = new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue || "closed"), { once: true });
  });

  dialog.addEventListener("close", () => {
    if (activeNoteViewDialog === dialog) {
      activeNoteViewDialog = null;
    }
    if (dialog.returnValue !== "edit") {
      hostContext?.cancel?.({
        actionId: "notes.view",
        recordId: noteId,
      });
    }
    dialog.remove();
  }, { once: true });

  document.body.appendChild(dialog);
  activeNoteViewDialog = dialog;
  view.showModal(dialog, { parent: params.parent || null, trigger });

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });
    renderNoteViewDialog(dialog, result.note, params, hostContext);
  } catch (error) {
    renderNoteViewError(dialog, error);
    hostContext?.setStatus?.(noteViewErrorMessage(error), { isError: true });
  }

  return hostContext?.result || closeResult;
}

function createNoteViewDialog(noteId) {
  let dialog = null;
  const body = view.createElement("div", {
    className: "notes-view-body",
    attrs: { "aria-live": "polite" },
    dataset: { noteViewBody: "" },
    children: [emptyText("Loading note...")],
  });
  const closeAction = view.createActionButton({
    action: "notes.view.close",
    className: "surface-modal-footer-action",
    label: "Close",
    role: "secondary",
    onClick: () => view.closeModal(dialog, "close"),
  });
  const editAction = view.createActionButton({
    action: "notes.view.edit",
    className: "surface-modal-footer-action",
    disabled: true,
    label: "Edit",
    role: "primary",
  });

  closeAction.dataset.noteViewAction = "close";
  editAction.dataset.noteViewAction = "edit";

  dialog = view.createModal({
    title: "View Note",
    className: "notes-view-dialog",
    size: "wide",
    body: [body],
    actions: [closeAction, editAction],
  });
  dialog.dataset.noteViewDialog = "";
  dialog.dataset.noteId = noteId;
  return dialog;
}

function renderNoteViewDialog(dialog, note = {}, params = {}, hostContext = null) {
  const noteId = note.note_id || note.id || readNoteEditorId(params);
  const title = note.title || "Untitled note";

  dialog.dataset.noteId = noteId || "";
  dialog.viewParts.title.textContent = title;

  const meta = view.createElement("p", {
    className: "notes-detail-meta notes-view-meta",
    children: detailMetaItems(note),
  });
  const tags = view.createElement("div", {
    className: "notes-detail-tags notes-view-tags",
    children: [tagChips(note.tags || [])],
  });
  const body = view.createElement("div", { className: "notes-rendered-body notes-view-rendered-body" });
  body.innerHTML = note.body_html || "";
  applyExternalMarkdownLinkPreference(body);
  if (!body.textContent.trim() && !note.body_html) {
    body.textContent = isSecureNote(note) ? "Secure note body is locked or unavailable." : "No body.";
  }

  noteViewBodyElement(dialog)?.replaceChildren(meta, tags, body);

  const editAction = noteViewEditAction(dialog);
  editAction.disabled = note.status === "archived";
  editAction.title = note.status === "archived"
    ? "Restore archived notes before editing."
    : "Edit this note";
  editAction.addEventListener("click", () => openNoteViewEditHandoff(dialog, noteId, {
    ...params,
    note,
    noteId,
  }, hostContext), { once: true });
}

function renderNoteViewError(dialog, error = {}) {
  dialog.viewParts.title.textContent = "Note unavailable";
  noteViewBodyElement(dialog)?.replaceChildren(emptyText(noteViewErrorMessage(error)));
  const editAction = noteViewEditAction(dialog);
  editAction.disabled = true;
  editAction.title = "This note cannot be edited from here.";
}

function noteViewBodyElement(dialog) {
  return dialog?.querySelector("[data-note-view-body]");
}

function noteViewEditAction(dialog) {
  return dialog?.querySelector("[data-note-view-action='edit']");
}

function openNoteViewEditHandoff(dialog, noteId, params = {}, hostContext = null) {
  if (!noteId) {
    return;
  }

  view.closeModal(dialog, "edit");
  void openNoteEditor({
    ...params,
    mode: "edit",
    noteId,
    returnFocusTo: params.returnFocusTo || hostContext?.trigger || null,
  }, hostContext).catch((error) => {
    hostContext?.setStatus?.(safeNoteErrorMessage(error, "Note could not be opened."), { isError: true });
    hostContext?.cancel?.({
      actionId: "notes.edit",
      recordId: noteId,
    });
  });
}

function noteViewErrorMessage(error = {}) {
  if (isSecureError(error)) {
    return "Secure note is locked or could not be decrypted. Check secure-note access and server key configuration.";
  }

  return "Note is unavailable or you do not have access.";
}

async function prepareNoteDialogData() {
  if (!state.dialogDataReady) {
    state.dialogDataReady = (async () => {
      await window.LongtailForge.workspaceContextReady;
      applyWorkspaceContext();
      await Promise.all([loadMarkdownRenderingPreference(), loadTags(), loadCollections()]);
    })().catch((error) => {
      state.dialogDataReady = null;
      throw error;
    });
  }

  return state.dialogDataReady;
}

function normalizeNoteEditorMode(params = {}) {
  const mode = String(params.mode || params.actionMode || "").toLowerCase();
  return mode === "edit" ? "edit" : "add";
}

function readNoteEditorId(params = {}) {
  return params.noteId || params.note_id || params.recordId || params.id || "";
}

function normalizeNoteEditorDefaults(params = {}) {
  const context = params.context || {};
  return {
    body_markdown: params.body_markdown || params.bodyMarkdown || params.body || "",
    client_id: params.client_id || params.clientId || context.clientId || "",
    library_bucket: params.library_bucket || params.libraryBucket || "",
    note_collection_id: params.note_collection_id || params.noteCollectionId || "",
    note_type: params.note_type || params.noteType || "",
    project_id: params.project_id || params.projectId || context.projectId || "",
    security_mode: params.security_mode || params.securityMode || "",
    title: params.title || "",
    visibility: params.visibility || "",
  };
}

function notesViewSurfaceDescriptor() {
  const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
  const surface = surfaces.find((candidate) => candidate.id === "notes.workspace" && candidate.moduleId === "notes")
    || fallbackNotesViewSurfaceDescriptor();
  return scopeNotesVisibilityContributions(surface);
}

function scopeNotesVisibilityContributions(surface = {}) {
  const workspaceType = normalizeWorkspaceType(
    state.workspaceType || window.LongtailForge?.workspaceContext?.workspaceType || window.LongtailForge?.workspaceContext?.workspace_type || "",
  );
  if (!workspaceType || workspaceType === "business") {
    return surface;
  }

  const scopeFields = (fields = []) => fields
    .filter((field) => workspaceType !== "personal" || field.field !== "visibility")
    .map((field) => field.field === "visibility" ? {
      ...field,
      options: (field.options || []).filter((option) => (Array.isArray(option) ? option[0] : option.value) !== "client_visible"),
    } : field);

  return {
    ...surface,
    filters: (surface.filters || [])
      .filter((filter) => workspaceType !== "personal" || filter.field !== "visibility")
      .map((filter) => filter.field === "visibility" ? {
        ...filter,
        options: (filter.options || []).filter((option) => (Array.isArray(option) ? option[0] : option.value) !== "client_visible"),
      } : filter),
    detail: workspaceType === "personal" && surface.detail ? {
      ...surface.detail,
      header: surface.detail.header ? {
        ...surface.detail.header,
        badges: (surface.detail.header.badges || []).filter((badge) => badge.field !== "visibility"),
      } : surface.detail.header,
    } : surface.detail,
    modals: (surface.modals || []).map((modal) => ["note-editor", "note-bulk-editor"].includes(modal.id) ? {
      ...modal,
      fields: scopeFields(modal.fields),
    } : modal),
  };
}

function fallbackNotesViewSurfaceDescriptor() {
  return {
    id: "notes.workspace",
    moduleId: "notes",
    viewId: "notes",
    layout: "slide-out-sidebar",
    sidebarLabel: "Notes navigation",
    pageHeader: {
      title: "Notes",
      primaryAction: {
        id: "create-note",
        label: "Create Note",
        role: "primary",
        behavior: "notes.create",
      },
    },
    sidebarPanels: [
      {
        id: "notes-filters",
        type: "filters",
        title: "Filters",
          open: false,
        className: "notes-filters-panel",
      },
      {
        id: "notes-library",
        type: "navigation",
        title: "Library",
        behavior: "notes.sidebar.library",
        open: true,
        className: "notes-library-panel view-collapsible-index--unscrolled",
        ariaLabel: "Notes Library",
      },
      {
        id: "notes-list",
        type: "index",
        title: "Notes List",
        open: true,
        className: "notes-index-panel",
        footer: {
          id: "notes-list-footer",
          behavior: "notes.sidebar.notes-list-footer",
        },
      },
    ],
    filters: [
      notesDescriptorSelect("status", "Status", [["active", "Active", true], ["pinned", "Pinned"], ["archived", "Archived"], ["all", "All visible"]]),
      notesDescriptorSelect("visibility", "Visibility", [["all", "All visible", true], ["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]]),
      notesDescriptorSelect("security", "Security", [["all", "All", true], ["normal", "Normal"], ["secure", "Secure"]]),
      notesDescriptorSelect("noteType", "Note Kind", [["all", "All kinds", true], ...Object.entries(NOTE_KIND_LABELS).filter(([value]) => !LEGACY_NOTE_KINDS.has(value)).map(([value, label]) => [value, label])]),
      { id: "context-filter", field: "context", type: "search", label: "Context" },
      { id: "owner-filter", field: "owner", type: "search", label: "Owner" },
      { id: "tags-filter", field: "tags", type: "search", label: "Tags", optionsSource: "notes.filters.tags" },
      { id: "updated-filter", field: "updatedSince", type: "date", label: "Updated Since" },
    ],
    indexPanel: {
      title: "Notes",
      emptyState: { message: "No notes match the current filters." },
    },
    detail: {
      header: { titleField: "title", metaField: "library" },
      actionStrip: notesWorkflowActionStripDescriptor(),
      linkedRecords: notesLinkedRecordsFallbackDescriptor(),
      emptyState: { message: "Select a note to read its details." },
    },
    modals: [
      {
        id: "note-editor",
        title: "Note",
        fields: [
          { id: "note-title", field: "title", type: "text", label: "Title", required: true },
          { id: "note-library", field: "library", type: "select", label: "Library", options: [["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
          { id: "note-collection", field: "collection", type: "select", label: "Collection", options: [["", "Uncategorized"]] },
          { id: "note-kind", field: "noteType", type: "select", label: "Note Kind", options: [["general", "General"], ["meeting", "Meeting"], ["research", "Research"], ["decision", "Decision"], ["procedure", "Procedure"], ["reference", "Reference"], ["idea", "Idea"], ["log", "Log"]] },
          { id: "note-visibility", field: "visibility", type: "select", label: "Visibility", options: [["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]] },
          { id: "note-security", field: "security", type: "select", label: "Security", options: [["normal", "Normal"], ["secure", "Secure"]] },
        ],
        footerActions: [
          { id: "cancel-note", label: "Cancel", role: "secondary", behavior: "notes.editor.cancel" },
          { id: "save-close-note", label: "Save & Close", role: "secondary", behavior: "notes.editor.save-close" },
          { id: "save-note", label: "Save Note", role: "primary", behavior: "notes.editor.save" },
        ],
      },
      {
        id: "note-bulk-editor",
        title: "Bulk Edit Notes",
        fields: [
          { id: "note-bulk-library", field: "library", type: "select", label: "Library", options: [["", "No change"], ["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
          { id: "note-bulk-collection", field: "collection", type: "select", label: "Collection", options: [["", "No change"], ["__uncategorized", "Uncategorized"]] },
          { id: "note-bulk-kind", field: "noteType", type: "select", label: "Note Kind", options: [["", "No change"], ["general", "General"], ["meeting", "Meeting"], ["research", "Research"], ["decision", "Decision"], ["procedure", "Procedure"], ["reference", "Reference"], ["idea", "Idea"], ["log", "Log"]] },
          { id: "note-bulk-visibility", field: "visibility", type: "select", label: "Visibility", options: [["", "No change"], ["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]] },
          { id: "note-bulk-tag-action", field: "tagAction", type: "select", label: "Tag Action", options: [["", "No change"], ["add", "Add tags"], ["remove", "Remove tags"], ["replace", "Replace direct tags"]] },
        ],
        footerActions: [
          { id: "cancel-note-bulk", label: "Cancel", role: "secondary", behavior: "notes.bulk.cancel" },
          { id: "apply-note-bulk", label: "Apply Changes", role: "primary", behavior: "notes.bulk.apply" },
        ],
      },
      {
        id: "note-collection",
        title: "Collection",
        fields: [
          { id: "collection-name", field: "title", type: "text", label: "Name", required: true },
          { id: "collection-library", field: "library", type: "select", label: "Library", options: [["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
          { id: "collection-parent", field: "parent", type: "select", label: "Parent", options: [["", "Root collection"]] },
        ],
        footerActions: [
          { id: "cancel-collection", label: "Cancel", role: "secondary", behavior: "notes.collection.cancel" },
          { id: "save-collection", label: "Save Collection", role: "primary", behavior: "notes.collection.save" },
        ],
      },
    ],
    dataSource: {
      route: "/api/notes",
      method: "GET",
      fieldBindings: { id: "note_id", title: "title" },
    },
  };
}

function notesDescriptorSelect(field, label, options) {
  return { id: `${field}-filter`, field, type: "select", label, options };
}

function decorateNotesDeclarativeSurface(surface) {
  const createAction = surface.querySelector('[data-surface-action="notes.create"], [data-surface-action="create-note"]');
  if (createAction) {
    createAction.dataset.noteCreate = "";
  }

  const header = surface.querySelector(".view-page-header");
  const status = view.createStatusMessage({ className: "notes-status-message" });
  status.dataset.notesStatus = "";
  header?.after(status);

  const filterForm = surface.querySelector("[data-view-filter-form]");
  if (filterForm) {
    filterForm.classList.add("notes-filters");
    filterForm.dataset.notesFilters = "";
  }
  decorateNotesFilter(surface, "status", "noteFilterStatus");
  decorateNotesFilter(surface, "visibility", "noteFilterVisibility");
  decorateNotesFilter(surface, "security", "noteFilterSecurity");
  decorateNotesFilter(surface, "noteType", "noteFilterType");
  decorateNotesFilter(surface, "context", "noteFilterContext");
  decorateNotesFilter(surface, "owner", "noteFilterOwner");
  decorateNotesFilter(surface, "tags", "noteFilterTags");
  decorateNotesFilter(surface, "updatedSince", "noteFilterUpdated");

  const indexPanel = surface.querySelector('[data-view-sidebar-panel="notes-list"]')
    || surface.querySelector(".view-collapsible-index");
  indexPanel?.classList.add("notes-index-panel");
  const summary = indexPanel?.querySelector("summary");
  if (summary) {
    const summaryTitle = summary.querySelector(".view-collapsible-index-title") || summary;
    summaryTitle.textContent = "Notes List";
  }
  const indexBody = indexPanel?.querySelector(".view-collapsible-index-body");
  indexBody?.replaceChildren(createNotesListChrome());
  const indexFooter = indexPanel?.querySelector(".view-collapsible-index-footer");
  if (indexFooter) {
    indexFooter.classList.add("notes-list-panel-footer");
  }

  const detail = surface.querySelector(".view-slideout-sidebar-main")
    || surface.querySelector(".view-sidebar-detail-primary")
    || surface.querySelector(".view-stacked-detail");
  if (detail) {
    detail.classList.add("notes-detail-panel");
    detail.dataset.noteDetail = "";
    detail.replaceChildren();
  }
}

function decorateNotesFilter(surface, fieldName, datasetName) {
  const wrapper = surface.querySelector(`[data-view-field="${fieldName}"]`);
  const control = wrapper?.querySelector(`[data-view-input="${fieldName}"]`);
  if (control) {
    control.dataset[datasetName] = "";
  }
}

async function hydrateNoteTagFilterOptions({ mountSearchOptions, setOptions } = {}) {
  if (!state.availableTags.length) {
    await loadTags();
  }

  const noTagsValue = window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__";
  const options = [
    { value: noTagsValue, label: "No tags", keywords: ["none", "untagged"] },
    ...state.availableTags.map((tag) => ({
      value: tag.name || tag.slug || tag.tag_id || "",
      label: tag.name || tag.slug || "Tag",
      keywords: [tag.slug, tag.description].filter(Boolean),
      color: tag.color,
    })),
  ];

  if (typeof mountSearchOptions === "function") {
    mountSearchOptions(options, {
      submitMode: "option-or-input",
      minChars: 1,
      maxResults: 10,
      emptyMessage: "No matching tags.",
    });
    return undefined;
  }

  setOptions?.(options, {
    submitMode: "option-or-input",
    minChars: 1,
    maxResults: 10,
    emptyMessage: "No matching tags.",
  });
  return undefined;
}

function createNotesLibraryChrome() {
  const wrap = view.createElement("div", { className: "notes-library-chrome" });

  const collections = view.createElement("section", {
    className: "notes-collections-panel",
    attrs: { "aria-label": "Notes Collections" },
  });
  collections.dataset.notesCollectionsPanel = "";

  // Library remains the bucket selector. Collection actions sit beside the Collection dropdown and
  // open a modal so the drawer does not grow a dropdown menu inside its scroll region.
  const libraryLabel = view.createElement("label", { text: "Library" });
  const librarySelect = view.createElement("select");
  librarySelect.dataset.noteCollectionLibraryFilter = "";
  [["all", "All Libraries"], ["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"], ["archive", "Archive"]].forEach(([value, label]) => {
    librarySelect.appendChild(notesOptionElement(value, label));
  });
  libraryLabel.appendChild(librarySelect);

  const collectionLabel = view.createElement("label", { text: "Collection" });
  const collectionSelect = view.createElement("select");
  collectionSelect.dataset.noteFilterCollection = "";
  collectionSelect.appendChild(notesOptionElement("", "All collections"));
  collectionLabel.appendChild(collectionSelect);

  const collectionActions = view.createElement("span");
  collectionActions.dataset.noteCollectionActions = "";

  const collectionControlRow = view.createElement("div", {
    className: "notes-collection-control-row",
    children: [collectionLabel, collectionActions],
  });

  const pickerRow = view.createElement("div", {
    className: "notes-collection-picker-row",
    children: [libraryLabel, collectionControlRow],
  });
  collections.appendChild(pickerRow);
  wrap.appendChild(collections);
  return wrap;
}

function createNotesListChrome() {
  const wrap = view.createElement("div", { className: "notes-index-chrome" });
  const list = view.createElement("div", { className: "notes-list" });
  list.dataset.notesList = "";
  wrap.append(createNotesBulkToolbar(), list);

  return wrap;
}

function createNotesBulkToolbar() {
  if (typeof view?.createBulkActionToolbar !== "function") {
    throw new Error("Notes bulk editing requires LongtailForge.view.createBulkActionToolbar.");
  }

  const edit = view.createActionButton({
    label: "Edit selected notes",
    role: "primary",
  });
  edit.dataset.noteBulkEdit = "";
  edit.disabled = true;
  const clear = view.createActionButton({
    label: "Clear selection",
    role: "secondary",
  });
  clear.dataset.noteBulkClear = "";
  clear.disabled = true;

  return view.createBulkActionToolbar({
    label: "Bulk Edit",
    selectedCount: state.selectedNoteIds.size,
    className: "notes-bulk-toolbar",
    bodyClassName: "notes-bulk-toolbar-actions",
    attrs: { "data-note-bulk-toolbar": "" },
    body: [edit, clear],
  });
}

function createNotesListSortControl() {
  const label = view.createElement("label", { className: "notes-list-sort", text: "Sort" });
  const select = view.createElement("select");

  select.dataset.noteSort = "";
  NOTES_LIST_SORT_OPTIONS.forEach(([value, optionLabel, selected]) => {
    const option = notesOptionElement(value, optionLabel);
    option.selected = Boolean(selected);
    select.appendChild(option);
  });
  select.value = DEFAULT_NOTE_SORT;
  label.appendChild(select);

  return label;
}

function createNotesPagination() {
  const pagination = view.createElement("div", { className: "notes-pagination" });
  const prev = notesIconButton({
    icon: "previous",
    label: "Previous page",
    title: "Previous page",
  });
  prev.disabled = true;
  prev.dataset.notesPrev = "";
  const pageEl = view.createElement("span", { text: "Page 1" });
  pageEl.dataset.notesPage = "";
  const next = notesIconButton({
    icon: "next",
    label: "Next page",
    title: "Next page",
  });
  next.disabled = true;
  next.dataset.notesNext = "";
  pagination.append(prev, pageEl, next);
  return pagination;
}

function notesIconButton(options) {
  if (window.LongtailForge.icons?.createIconButton) {
    return window.LongtailForge.icons.createIconButton({
      ...options,
      text: "",
      iconOnly: true,
    });
  }
  const button = view.createElement("button", {
    text: options.label || options.title || "",
    attrs: {
      type: "button",
      "aria-label": options.label || options.title || "",
      title: options.title || options.label || "",
    },
  });
  button.classList.add("icon-button");
  return button;
}

function notesOptionElement(value, label) {
  return view.createElement("option", { text: label, attrs: { value } });
}

function notesEditorModalDescriptor() {
  return notesViewSurfaceDescriptor().modals?.find((modal) => modal.id === "note-editor") || {};
}

function notesBulkEditorModalDescriptor() {
  return notesViewSurfaceDescriptor().modals?.find((modal) => modal.id === "note-bulk-editor") || {};
}

function notesCollectionModalDescriptor() {
  return notesViewSurfaceDescriptor().modals?.find((modal) => modal.id === "note-collection") || {};
}

function modalFieldOptions(modal, fieldName) {
  const field = (modal.fields || []).find((entry) => entry.field === fieldName);
  return (field?.options || []).map((entry) => (Array.isArray(entry) ? entry : [entry.value ?? "", entry.label ?? entry.value ?? ""]));
}

function noteFieldLabel(labelText, control) {
  return view.createElement("label", { children: [labelText, control] });
}

function noteInput(dataName, attrs = {}) {
  const input = view.createElement("input", { attrs: { type: attrs.type || "text", required: Boolean(attrs.required) } });
  input.dataset[dataName] = "";
  return input;
}

function noteTextarea(dataName, attrs = {}) {
  const textarea = view.createElement("textarea", { attrs: { rows: attrs.rows || 10 } });
  textarea.dataset[dataName] = "";
  return textarea;
}

function noteSelect(dataName, options) {
  const select = view.createElement("select");
  select.dataset[dataName] = "";
  options.forEach(([value, label]) => select.appendChild(notesOptionElement(value, label)));
  return select;
}

function createNoteContextPanel() {
  const panel = view.createElement("details", { className: "notes-context-panel surface-modal-group" });
  panel.appendChild(view.createElement("summary", { className: "surface-modal-section-heading", text: "Linked Context" }));

  const picker = view.createLinkedContextPicker({
    clientContexts: [],
    clientContextLabel: "Client",
    providers: linkTargetProviderOptions(),
    records: [],
    linkedItems: [],
    emptyMessage: notesLinkedRecordsDescriptor().emptyState?.message || "No linked context.",
    onClientContextChange: handleEditorLinkClientContextChange,
    onRemove: handleEditorLinkedContextRemove,
    showClientContext: true,
  });
  picker.dataset.noteContextPicker = "";
  picker.viewParts.clientContextSelect.dataset.noteContextClient = "";
  picker.viewParts.rows.dataset.noteContextList = "";
  picker.viewParts.targetSelect.dataset.noteContextTargetType = "";
  picker.viewParts.searchInput.dataset.noteContextSearch = "";
  picker.viewParts.recordSelect.dataset.noteContextResults = "";
  picker.viewParts.useTargetButton.dataset.noteContextApply = "";
  panel.appendChild(picker);

  ["noteTaskId", "noteUserId"].forEach((name) => {
    const hidden = view.createElement("input", { attrs: { type: "hidden" } });
    hidden.dataset[name] = "";
    panel.appendChild(hidden);
  });
  const suggestion = view.createElement("p");
  suggestion.dataset.noteLibrarySuggestion = "";
  panel.appendChild(suggestion);
  return panel;
}

function createPrimaryContextSection() {
  const clientSelect = noteSelect("noteClientId", []);
  const projectSelect = noteSelect("noteProjectId", []);
  const clientField = noteFieldLabel("Client", clientSelect);
  const projectField = noteFieldLabel("Project", projectSelect);
  const section = view.createElement("section", {
    className: "notes-primary-context",
    children: [
      view.createElement("h3", { className: "surface-modal-section-heading", text: "Primary Context" }),
      view.createElement("div", {
        className: "notes-form-grid",
        children: [clientField, projectField],
      }),
    ],
  });

  clientField.dataset.notePrimaryClientField = "";
  projectField.dataset.notePrimaryProjectField = "";
  clientField.hidden = true;
  return section;
}

function createNoteEditorToolbar() {
  const toolbar = view.createElement("div", { className: "notes-editor-toolbar" });
  toolbar.dataset.noteEditorToolbar = "";
  NOTE_EDITOR_TOOLBAR_ACTIONS.forEach((action) => {
    toolbar.appendChild(createNoteEditorToolbarButton(action));
  });
  return toolbar;
}

function createNoteEditorToolbarButton(action) {
  const button = view.createActionButton({
    ariaLabel: action.label,
    className: "notes-editor-toolbar-button",
    icon: action.icon,
    iconOnly: Boolean(action.icon && !action.text),
    label: action.label,
    text: action.text || "",
    title: action.label,
  });

  if (action.command) {
    button.dataset.noteCommand = action.command;
  }
  if (action.preview) {
    button.dataset.notePreviewToggle = "";
    button.setAttribute("aria-pressed", "false");
  }

  return button;
}

function createNoteMarkdownEditorSection(toolbar, bodyField, preview) {
  const body = view.createElement("div", {
    className: "notes-markdown-editor-body",
    children: [bodyField, preview],
  });
  body.dataset.noteMarkdownEditorBody = "";

  const section = view.createElement("div", {
    className: "notes-markdown-editor",
    children: [toolbar, body],
  });
  section.dataset.noteMarkdownEditor = "";
  return section;
}

function createNoteDialogShell() {
  const modal = notesEditorModalDescriptor();
  const cancel = view.createActionButton({
    action: "cancel-note",
    className: "surface-modal-footer-action",
    icon: "close",
    iconOnly: true,
    label: "Cancel",
    role: "secondary",
    title: "Cancel",
  });
  cancel.dataset.noteCancel = "";
  const save = view.createActionButton({
    action: "save-note",
    className: "surface-modal-footer-action",
    icon: "save",
    iconOnly: true,
    label: modal.footerActions?.find((action) => action.id === "save-note")?.label || "Save Note",
    role: "primary",
    title: modal.footerActions?.find((action) => action.id === "save-note")?.label || "Save Note",
    type: "submit",
  });
  save.dataset.noteSave = "";
  const saveClose = view.createActionButton({
    action: "save-close-note",
    className: "surface-modal-footer-action",
    icon: "save",
    iconOnly: false,
    label: modal.footerActions?.find((action) => action.id === "save-close-note")?.label || "Save & Close",
    role: "secondary",
    text: "Save & Close",
    title: "Save and close note",
    type: "button",
  });
  saveClose.dataset.noteSaveClose = "";

  // Tags and Files live behind footer utility buttons (Tasks-modal pattern) and open stacked child dialogs.
  const tagsToggle = view.createActionButton({
    action: "note-tags",
    className: "surface-modal-footer-action",
    icon: "tag",
    iconOnly: false,
    label: "Tags",
    role: "utility",
    text: "Tags",
    title: "Tags",
  });
  tagsToggle.dataset.noteTagsToggle = "";
  tagsToggle.setAttribute("aria-expanded", "false");
  const filesToggle = view.createActionButton({
    action: "note-files",
    className: "surface-modal-footer-action",
    icon: "file",
    iconOnly: false,
    label: "Files",
    role: "utility",
    text: "Files",
    title: "Files",
  });
  filesToggle.dataset.noteFilesToggle = "";
  filesToggle.setAttribute("aria-expanded", "false");
  const copyLink = view.createActionButton({
    action: "copy-note-link",
    className: "surface-modal-footer-action",
    icon: "copy",
    iconOnly: false,
    label: "Copy note link",
    role: "utility",
    text: "Copy Link",
    title: "Copy note link",
  });
  copyLink.dataset.copyNoteLink = "";
  copyLink.hidden = true;

  const dialog = view.renderDescriptorModalForm(modal, {
    title: modal.title || "Note",
    className: "notes-editor-dialog",
    formClassName: "notes-editor-form",
    size: "wide",
    fields: [],
    actions: [cancel, saveClose, save],
    utilityActions: [tagsToggle, filesToggle, copyLink],
  });
  dialog.dataset.noteDialog = "";
  const form = dialog.viewParts.form;
  form.dataset.noteForm = "";
  dialog.viewParts.title.dataset.noteDialogTitle = "";
  dialog.viewParts.body.remove();

  const notificationToggle = view.createActionButton({
    action: "follow-note-notifications",
    className: "notes-notification-toggle",
    icon: "bell",
    iconOnly: true,
    label: "Follow note notifications",
    role: "utility",
    text: "",
    title: "Follow note notifications",
  });
  notificationToggle.dataset.noteNotificationToggle = "";
  notificationToggle.hidden = true;
  const heading = view.createElement("div", { className: "surface-modal-heading", children: [dialog.viewParts.title, notificationToggle] });
  heading.dataset.noteDialogHeading = "";

  const titleField = noteFieldLabel("Title", noteInput("noteTitle", { type: "text", required: true }));
  const visibilityOptions = modalFieldOptions(modal, "visibility");
  const selectGrid = view.createElement("div", {
    className: "notes-form-grid",
    children: [
      noteFieldLabel("Library", noteSelect("noteLibrary", modalFieldOptions(modal, "library"))),
      noteFieldLabel("Collection", noteSelect("noteCollection", modalFieldOptions(modal, "collection"))),
      noteFieldLabel("Note Kind", noteSelect("noteType", modalFieldOptions(modal, "noteType"))),
      visibilityOptions.length > 0
        ? noteFieldLabel("Visibility", noteSelect("noteVisibility", visibilityOptions))
        : null,
      noteFieldLabel("Security", noteSelect("noteSecurity", modalFieldOptions(modal, "security"))),
    ].filter(Boolean),
  });
  const primaryContext = createPrimaryContextSection();
  // Group the note "Details" fields into a collapsible section (openEditor opens it for Add, closes for Edit).
  const detailsGroup = view.createElement("details", {
    className: "notes-detail-group surface-modal-group",
    children: [view.createElement("summary", { className: "surface-modal-section-heading", text: "Note Details" }), selectGrid, primaryContext],
  });
  detailsGroup.dataset.noteDetailsGroup = "";
  const secureWarning = view.createElement("p", {
    className: "notes-secure-warning",
    text: "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.",
    attrs: { hidden: true },
  });
  secureWarning.dataset.noteSecureWarning = "";
  const contextPanel = createNoteContextPanel();
  const toolbar = createNoteEditorToolbar();
  const bodyField = noteFieldLabel("Body", noteTextarea("noteBody", { rows: 14 }));
  const preview = view.createElement("div", { className: "notes-preview", attrs: { hidden: true } });
  preview.dataset.notePreview = "";
  const markdownEditor = createNoteMarkdownEditorSection(toolbar, bodyField, preview);

  const formStatus = view.createElement("p", { attrs: { role: "status", "aria-live": "polite" } });
  formStatus.dataset.noteFormStatus = "";

  const footer = dialog.viewParts.footer;
  [heading, titleField, detailsGroup, secureWarning, contextPanel, markdownEditor, formStatus].forEach((node) => {
    form.insertBefore(node, footer);
  });
  return dialog;
}

function createNoteBulkDialogShell() {
  const modal = notesBulkEditorModalDescriptor();
  const cancel = view.createActionButton({
    action: "cancel-note-bulk",
    className: "surface-modal-footer-action",
    icon: "close",
    iconOnly: true,
    label: "Cancel",
    role: "secondary",
    title: "Cancel",
  });
  cancel.dataset.noteBulkCancel = "";
  const apply = view.createActionButton({
    action: "apply-note-bulk",
    className: "surface-modal-footer-action",
    label: "Apply Changes",
    role: "primary",
    text: "Apply Changes",
    title: "Apply changes to selected notes",
    type: "submit",
  });
  apply.dataset.noteBulkApply = "";

  const dialog = view.renderDescriptorModalForm(modal, {
    title: modal.title || "Bulk Edit Notes",
    className: "notes-bulk-dialog",
    formClassName: "notes-bulk-form",
    size: "medium",
    actions: [cancel, apply],
  });
  dialog.dataset.noteBulkDialog = "";
  dialog.viewParts.form.dataset.noteBulkForm = "";
  dialog.viewParts.body.classList.add("notes-form-grid", "notes-bulk-grid");
  dialog.viewParts.form.querySelector('[data-view-input="library"]').dataset.noteBulkLibrary = "";
  dialog.viewParts.form.querySelector('[data-view-input="collection"]').dataset.noteBulkCollection = "";
  dialog.viewParts.form.querySelector('[data-view-input="noteType"]').dataset.noteBulkType = "";
  const bulkVisibility = dialog.viewParts.form.querySelector('[data-view-input="visibility"]');
  if (bulkVisibility) {
    bulkVisibility.dataset.noteBulkVisibility = "";
  }
  dialog.viewParts.form.querySelector('[data-view-input="tagAction"]').dataset.noteBulkTagAction = "";
  const tagsMount = view.createElement("div", { className: "notes-bulk-tags-field" });
  tagsMount.dataset.noteBulkTags = "";
  dialog.viewParts.body.appendChild(tagsMount);
  const status = view.createStatusMessage({ attrs: { "aria-live": "polite" } });
  status.dataset.noteBulkFormStatus = "";
  const footer = dialog.viewParts.footer;
  dialog.viewParts.form.insertBefore(status, footer);
  return dialog;
}

function createNoteTagsDialogShell() {
  const tagsMount = view.createElement("div");
  tagsMount.dataset.noteTagsEditor = "";
  const close = view.createActionButton({ label: "Done", role: "primary" });
  close.dataset.noteTagsDialogClose = "";
  const dialog = view.createModal({
    title: "Tags",
    className: "notes-tags-dialog",
    body: [tagsMount],
    actions: [close],
  });
  dialog.dataset.noteTagsDialog = "";
  return dialog;
}

function createNoteFilesDialogShell() {
  const saveFirstWarning = view.createElement("p", {
    className: "notes-files-save-first-warning",
    text: "Save the note before adding files.",
    attrs: { hidden: true, role: "alert", tabindex: "-1" },
  });
  saveFirstWarning.dataset.noteFilesSaveFirstWarning = "";
  const filesMount = view.createElement("div");
  filesMount.dataset.noteFilesEditor = "";
  const close = view.createActionButton({ label: "Done", role: "primary" });
  close.dataset.noteFilesDialogClose = "";
  const dialog = view.createModal({
    title: "Files",
    className: "notes-files-dialog",
    body: [saveFirstWarning, filesMount],
    actions: [close],
  });
  dialog.dataset.noteFilesDialog = "";
  return dialog;
}

function createCollectionDialogShell() {
  const modal = notesCollectionModalDescriptor();
  const cancel = view.createActionButton({ label: "Cancel", role: "secondary" });
  cancel.dataset.noteCollectionCancel = "";
  const save = view.createActionButton({ label: modal.footerActions?.find((action) => action.id === "save-collection")?.label || "Save Collection", type: "submit", role: "primary" });
  save.dataset.noteCollectionSave = "";

  const dialog = view.renderDescriptorModalForm(modal, {
    title: modal.title || "Collection",
    className: "notes-collection-dialog",
    formClassName: "notes-collection-form",
    fields: [],
    actions: [cancel, save],
  });
  dialog.dataset.noteCollectionDialog = "";
  const form = dialog.viewParts.form;
  form.dataset.noteCollectionForm = "";
  dialog.viewParts.title.dataset.noteCollectionDialogTitle = "";
  dialog.viewParts.body.remove();

  const close = view.createActionButton({ label: "Close", className: "notes-dialog-close" });
  close.dataset.noteCollectionDialogClose = "";
  const heading = view.createElement("div", { className: "surface-modal-heading", children: [dialog.viewParts.title, close] });
  heading.dataset.noteCollectionDialogHeading = "";

  const nameField = noteFieldLabel("Name", noteInput("noteCollectionTitle", { type: "text", required: true }));
  const grid = view.createElement("div", {
    className: "notes-form-grid",
    children: [
      noteFieldLabel("Library", noteSelect("noteCollectionLibrary", modalFieldOptions(modal, "library"))),
      noteFieldLabel("Parent", noteSelect("noteCollectionParent", modalFieldOptions(modal, "parent"))),
    ],
  });
  const formStatus = view.createElement("p", { attrs: { role: "status", "aria-live": "polite" } });
  formStatus.dataset.noteCollectionFormStatus = "";

  const footer = dialog.viewParts.footer;
  [heading, nameField, grid, formStatus].forEach((node) => form.insertBefore(node, footer));
  return dialog;
}

function createCollectionActionsDialogShell() {
  const body = view.createElement("div", { className: "notes-collection-actions-modal-body" });
  body.dataset.noteCollectionActionsDialogBody = "";
  const close = view.createActionButton({ label: "Close", role: "secondary" });
  close.dataset.noteCollectionActionsDialogClose = "";
  const dialog = view.createModal({
    title: "Collection actions",
    className: "notes-collection-actions-dialog",
    body: [body],
    actions: [close],
  });
  dialog.dataset.noteCollectionActionsDialog = "";
  dialog.viewParts.title.dataset.noteCollectionActionsDialogTitle = "";
  return dialog;
}

async function initialize() {
  setStatus("Loading notes...");

  try {
    await window.LongtailForge.workspaceContextReady;
    applyWorkspaceContext();
    await Promise.all([loadMarkdownRenderingPreference(), loadTags(), loadCollections(), loadNotes()]);
    renderCollections();
    populateCollectionFilter();
    renderNotes();
    await openNoteFromUrl();
    if (!state.selectedNote && !new URLSearchParams(window.location.search).get("note")) {
      renderBlankDetailPrompt();
    }
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

function applyWorkspaceContext() {
  const context = window.LongtailForge?.workspaceContext || {};
  state.workspaceType = normalizeWorkspaceType(context.workspaceType || context.workspace_type || "");
  applyWorkspaceVisibilityControls();
  populateWorkspaceVisibilityOptions();
  populateLinkTargetTypeSelect(contextTargetTypeInput);
  populateLinkClientContextSelect();
  updatePrimaryContextVisibility();
}

function applyWorkspaceVisibilityControls() {
  const personalWorkspace = normalizeWorkspaceType(state.workspaceType) === "personal";
  for (const control of [visibilityFilter, visibilityInput, bulkVisibilityInput]) {
    const field = control?.closest("label, [data-view-field]");
    if (field) {
      field.hidden = personalWorkspace;
      field.style.display = personalWorkspace ? "none" : "";
    }
  }

  if (visibilityFilter && !personalWorkspace) {
    const selectedValue = visibilityFilter.value || "all";
    const options = notesViewSurfaceDescriptor().filters
      ?.find((filter) => filter.field === "visibility")?.options || [];
    visibilityFilter.replaceChildren(...options.map((option) => {
      const [value, label] = Array.isArray(option) ? option : [option.value, option.label];
      return notesOptionElement(value, label);
    }));
    visibilityFilter.value = options.some((option) => (Array.isArray(option) ? option[0] : option.value) === selectedValue)
      ? selectedValue
      : "all";
  }
}

async function loadNotes(cursor = state.notesCurrentCursor || "") {
  const query = buildNotesListQuery(cursor);
  const result = await api.getJson(`/api/notes?${query.toString()}`, { cache: "no-store" });
  state.notes = result.notes || [];
  state.notesPagination = result.pagination || null;
  state.notesCurrentCursor = cursor || "";
  state.notesNextCursor = result.pagination?.nextCursor || "";
  syncNoteSelectionToVisibleNotes();
}

async function reloadNotesFromStart() {
  state.page = 1;
  state.notesCursorStack = [];
  state.notesCurrentCursor = "";
  state.notesNextCursor = "";
  setStatus("Loading notes...");

  try {
    await loadNotes("");
    renderNotes();
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

async function loadNextNotesPage() {
  if (!state.notesNextCursor) {
    return;
  }

  const nextCursor = state.notesNextCursor;
  state.notesCursorStack.push(state.notesCurrentCursor || "");
  state.page += 1;
  setStatus("Loading notes...");

  try {
    await loadNotes(nextCursor);
    renderNotes();
    setStatus("");
  } catch (error) {
    state.page = Math.max(1, state.page - 1);
    state.notesCursorStack.pop();
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

async function loadPreviousNotesPage() {
  if (state.notesCursorStack.length === 0) {
    return;
  }

  const previousCursor = state.notesCursorStack.pop() || "";
  state.page = Math.max(1, state.page - 1);
  setStatus("Loading notes...");

  try {
    await loadNotes(previousCursor);
    renderNotes();
    setStatus("");
  } catch (error) {
    state.page += 1;
    state.notesCursorStack.push(previousCursor);
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

function buildNotesListQuery(cursor = "") {
  const params = new URLSearchParams();

  params.set("limit", String(PAGE_SIZE));
  params.set("sort", sortSelect?.value || DEFAULT_NOTE_SORT);
  if (cursor) {
    params.set("cursor", cursor);
  }
  appendNotesQueryParam(params, "libraryBucket", activeLibraryBucketFilter());
  appendNotesQueryParam(params, "status", activeStatusFilter());
  if (normalizeWorkspaceType(state.workspaceType) !== "personal") {
    appendNotesQueryParam(params, "visibility", visibilityFilter?.value, "all");
  }
  appendNotesQueryParam(params, "security", securityFilter?.value, "all");
  appendNotesQueryParam(params, "noteType", typeFilter?.value, "all");
  appendNotesQueryParam(params, "context", normalizeText(contextFilter?.value));
  appendNotesQueryParam(params, "owner", normalizeText(ownerFilter?.value));
  appendNotesQueryParam(params, "tags", normalizeText(tagFilter?.value));
  appendNotesQueryParam(params, "updatedSince", updatedFilter?.value || "");
  appendNotesQueryParam(params, "collection", state.selectedCollectionId || collectionFilter?.value || "");

  return params;
}

function appendNotesQueryParam(params, key, value, ignoredValue = "") {
  const text = normalizeText(value);

  if (!text || text === ignoredValue) {
    return;
  }

  params.set(key, text);
}

function activeLibraryBucketFilter() {
  return ["active_work", "ongoing_area", "reference"].includes(state.activeBucket)
    ? state.activeBucket
    : "";
}

function activeStatusFilter() {
  if (state.activeBucket === "archive") {
    return "archived";
  }

  return statusFilter?.value || "active";
}

async function loadCollections() {
  const params = new URLSearchParams();

  if (state.activeBucket === "archive") {
    params.set("includeArchived", "true");
  }
  if (["active_work", "ongoing_area", "reference"].includes(state.activeBucket)) {
    params.set("libraryBucket", state.activeBucket);
  }

  const query = params.toString();
  const result = await api.getJson(`/api/notes/collections${query ? `?${query}` : ""}`, { cache: "no-store" });
  state.collections = normalizeCollections(result.collections || []);
}

async function loadTags() {
  if (!window.LongtailForge.tags) {
    state.availableTags = [];
    return;
  }

  try {
    state.availableTags = await window.LongtailForge.tags.loadTags({ status: "active" });
  } catch {
    state.availableTags = [];
  }
}

async function selectBucket(bucket) {
  state.activeBucket = bucket || "all";
  state.page = 1;
  state.notesCursorStack = [];
  state.notesCurrentCursor = "";
  state.notesNextCursor = "";
  state.selectedNote = null;
  state.selectedNoteIds.clear();
  state.selectedCollectionId = "";
  setStatus("Loading notes...");

  try {
    await Promise.all([loadCollections(), loadNotes()]);
    renderCollections();
    populateCollectionFilter();
    renderNotes();
    renderBlankDetailPrompt();
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

function renderNotes() {
  const pageNotes = state.notes || [];

  pageLabel.textContent = `Page ${state.page}`;
  prevButton.disabled = state.notesCursorStack.length === 0;
  nextButton.disabled = !state.notesNextCursor;

  if (pageNotes.length === 0) {
    renderEmptyList("No notes match the current filters.");
    return;
  }

  notesList.replaceChildren(...pageNotes.map(noteListItem));
  syncNotesBulkToolbar();
}

function renderCollections() {
  if (!collectionPanel || !collectionFilter) {
    return;
  }

  collectionPanel.hidden = false;

  if (collectionLibraryFilter) {
    collectionLibraryFilter.value = ["active_work", "ongoing_area", "reference", "archive"].includes(state.activeBucket)
      ? state.activeBucket
      : "all";
  }
  populateCollectionFilter();
  updateCollectionPanelSelection();
}

function collectionActions(collection) {
  const trigger = notesIconButton({
    icon: "more",
    label: "Collection actions",
    title: "Collection actions",
  });
  trigger.classList.add("notes-collection-actions-trigger");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.addEventListener("click", () => openCollectionActionsDialog(collection || null, trigger));
  return view.createElement("span", { className: "notes-collection-actions", children: [trigger] });
}

function openCollectionActionsDialog(collection = null, trigger = null) {
  if (!collectionActionsDialog || !collectionActionsDialogBody) {
    return;
  }

  const canManageCollection = Boolean(collection?.note_library_collection_id) && state.activeBucket !== "archive";
  const parentOptions = canManageCollection ? { parent: collection } : {};
  const disabledTitle = collection?.note_library_collection_id
    ? "Archived collections cannot be changed here."
    : "Select a collection to use this action.";

  if (collectionActionsDialogTitle) {
    collectionActionsDialogTitle.textContent = collection?.title
      ? `Collection actions: ${collection.title}`
      : "Collection actions";
  }

  const create = collectionDialogAction("New collection", () => {
    afterCollectionActionsDialogClosed(() => openCollectionDialog("create", parentOptions));
  }, { role: "primary" });
  const edit = collectionDialogAction("Edit", () => {
    afterCollectionActionsDialogClosed(() => openCollectionDialog("edit", { collection }));
  }, { disabled: !canManageCollection, title: canManageCollection ? "Rename or move collection" : disabledTitle });
  const archive = collectionDialogAction("Archive", () => {
    afterCollectionActionsDialogClosed(() => archiveCollection(collection));
  }, { disabled: !canManageCollection, title: canManageCollection ? "Archive collection" : disabledTitle });
  const remove = collectionDialogAction("Delete Empty", () => {
    afterCollectionActionsDialogClosed(() => deleteEmptyCollection(collection));
  }, { disabled: !canManageCollection, role: "destructive", title: canManageCollection ? "Delete empty collection" : disabledTitle });

  collectionActionsDialogBody.replaceChildren(create, edit, archive, remove);
  view.showModal(collectionActionsDialog, { trigger });
  create.focus();
}

function closeCollectionActionsDialog() {
  view.closeModal(collectionActionsDialog);
}

function afterCollectionActionsDialogClosed(callback) {
  if (typeof callback !== "function") {
    return;
  }
  if (!collectionActionsDialog?.open) {
    callback();
    return;
  }

  collectionActionsDialog.addEventListener("close", () => callback(), { once: true });
  closeCollectionActionsDialog();
}

function collectionDialogAction(label, onClick, options = {}) {
  return view.createActionButton({
    label,
    role: options.role || "secondary",
    disabled: options.disabled,
    title: options.title || label,
    onClick,
  });
}

function selectCollection(collectionId) {
  state.selectedCollectionId = collectionId || "";
  state.page = 1;
  if (collectionFilter) {
    collectionFilter.value = state.selectedCollectionId;
  }
  updateCollectionPanelSelection();
  updateUrlCollection();
  void reloadNotesFromStart();
}

function updateCollectionPanelSelection() {
  if (collectionFilter && collectionFilter.value !== state.selectedCollectionId) {
    collectionFilter.value = state.selectedCollectionId;
  }
  collectionActionsMount?.replaceChildren(collectionActions(selectedCollection()));
}

function populateCollectionFilter() {
  if (!collectionFilter) {
    return;
  }

  const options = collectionFilterOptions();
  collectionFilter.replaceChildren(...options);
  collectionFilter.value = collectionFilterHasValue(collectionFilter, state.selectedCollectionId)
    ? state.selectedCollectionId
    : "";
  state.selectedCollectionId = collectionFilter.value;
  updateCollectionPanelSelection();
}

function noteListItem(note) {
  const row = document.createElement("div");
  const selection = document.createElement("input");
  const button = document.createElement("button");
  const heading = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  const footer = document.createElement("span");
  const chipStrip = tagChips(note.tags || [], { limit: 1, showOverflow: true });

  row.className = "notes-list-row";
  selection.type = "checkbox";
  selection.className = "notes-list-select";
  selection.checked = state.selectedNoteIds.has(note.note_id);
  selection.disabled = note.status === "archived";
  selection.setAttribute("aria-label", `Select ${note.title || "Untitled note"} for bulk editing`);
  selection.title = selection.disabled ? "Restore archived notes before editing." : "Select note for bulk editing";
  selection.addEventListener("change", () => toggleBulkNoteSelection(note.note_id, selection.checked));

  button.type = "button";
  button.className = "notes-list-item";
  if (isSecureNote(note)) {
    button.classList.add("is-secure");
  }
  button.setAttribute("aria-pressed", String(state.selectedNote?.note_id === note.note_id));
  button.addEventListener("click", () => selectNote(note.note_id));

  heading.className = "notes-list-heading";
  title.textContent = note.title || "Untitled note";
  chipStrip.classList.add("notes-list-chip-strip");
  if (isSecureNote(note)) {
    chipStrip.prepend(statusBadge("Secure"));
  }
  meta.className = "notes-list-meta";
  meta.textContent = [
    libraryLabel(note.library_bucket),
    collectionLabel(note.note_collection_id),
    noteKindLabel(note.note_type),
    formatToken(note.status),
  ].filter(Boolean).join(" - ");
  heading.append(title, meta);

  footer.className = "notes-list-footer";
  footer.textContent = [
    formatToken(note.visibility),
    formatToken(note.security_mode),
    formatDate(note.updated_at),
  ].filter(Boolean).join(" - ");

  button.append(heading, chipStrip, footer);
  row.append(selection, button);
  return row;
}

function toggleBulkNoteSelection(noteId, selected) {
  if (selected) {
    state.selectedNoteIds.add(noteId);
  } else {
    state.selectedNoteIds.delete(noteId);
  }
  syncNotesBulkToolbar();
}

function syncNoteSelectionToVisibleNotes() {
  const visibleEditableIds = new Set((state.notes || [])
    .filter((note) => note.status !== "archived")
    .map((note) => note.note_id));
  state.selectedNoteIds = new Set([...state.selectedNoteIds].filter((noteId) => visibleEditableIds.has(noteId)));
}

function clearBulkSelection() {
  state.selectedNoteIds.clear();
  notesList?.querySelectorAll(".notes-list-select").forEach((input) => {
    input.checked = false;
  });
  syncNotesBulkToolbar();
}

function syncNotesBulkToolbar() {
  const selectedCount = state.selectedNoteIds.size;
  if (bulkToolbar && selectedCount > 0) {
    bulkToolbar.open = true;
  }
  const count = bulkToolbar?.viewParts?.count || bulkToolbar?.querySelector("[data-view-bulk-selection-count]");
  if (count) {
    count.textContent = `${selectedCount} selected`;
    count.hidden = selectedCount === 0;
  }
  if (bulkEditButton) {
    bulkEditButton.disabled = selectedCount === 0;
  }
  if (bulkClearButton) {
    bulkClearButton.disabled = selectedCount === 0;
  }
}

async function openBulkEditor() {
  if (!bulkDialog || state.selectedNoteIds.size === 0) {
    return;
  }

  setStatus("Loading bulk editor...");
  try {
    const result = await api.getJson("/api/notes/collections", { cache: "no-store" });
    state.bulkCollections = normalizeCollections(result.collections || []);
    bulkLibraryInput.value = "";
    bulkTypeInput.value = "";
    bulkTagActionInput.value = "";
    populateBulkVisibilityOptions();
    populateBulkCollectionOptions();
    await mountBulkTagPicker();
    setBulkFormStatus(`${state.selectedNoteIds.size} notes selected.`);
    bulkApplyButton.disabled = false;
    view.showModal(bulkDialog, { trigger: bulkEditButton });
    bulkLibraryInput.focus();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Notes bulk editor could not be opened.", true);
  }
}

function closeBulkEditor() {
  view.closeModal(bulkDialog);
}

function populateBulkCollectionOptions() {
  if (!bulkCollectionInput) {
    return;
  }

  const selectedLibrary = bulkLibraryInput?.value || "";
  const previousValue = bulkCollectionInput.value || "";
  const collections = state.bulkCollections
    .filter((collection) => !selectedLibrary || collection.library_bucket === selectedLibrary)
    .map((collection) => [
      collection.note_library_collection_id,
      selectedLibrary
        ? collection.path_cache || collection.title || "Collection"
        : `${libraryLabel(collection.library_bucket)}: ${collection.path_cache || collection.title || "Collection"}`,
    ]);
  const options = [
    ["", "No change"],
    [NOTE_BULK_COLLECTION_UNCATEGORIZED, "Uncategorized"],
    ...collections,
  ];
  bulkCollectionInput.replaceChildren(...options.map(([value, label]) => notesOptionElement(value, label)));
  bulkCollectionInput.value = options.some(([value]) => value === previousValue) ? previousValue : "";
}

function populateBulkVisibilityOptions() {
  if (!bulkVisibilityInput) {
    return;
  }
  bulkVisibilityInput.replaceChildren(
    notesOptionElement("", "No change"),
    ...workspaceVisibilityOptions().map(([value, label]) => notesOptionElement(value, label)),
  );
  bulkVisibilityInput.value = "";
}

async function mountBulkTagPicker() {
  if (!bulkTagsEditor || !window.LongtailForge.tags?.mountPicker) {
    state.bulkTagPicker = null;
    return;
  }

  state.bulkTagPicker = await window.LongtailForge.tags.mountPicker(bulkTagsEditor, {
    allowCreate: false,
    label: "Tags",
    placeholder: "Type to search tags",
    tags: state.availableTags,
  });
}

async function applyBulkEdit(event) {
  event.preventDefault();
  if (state.selectedNoteIds.size === 0) {
    setBulkFormStatus("Select at least one note to update.", true);
    return;
  }

  const targetIds = [...state.selectedNoteIds];
  const changes = readBulkNoteChanges();
  const tagAction = bulkTagActionInput?.value || "";
  const tagIds = state.bulkTagPicker?.readTagIds?.() || [];
  if (tagAction && tagIds.length === 0) {
    setBulkFormStatus("Choose at least one tag for the selected tag action.", true);
    return;
  }
  if (!tagAction && tagIds.length > 0) {
    setBulkFormStatus("Choose a tag action for the selected tags.", true);
    return;
  }
  if (Object.keys(changes).length === 0 && !tagAction) {
    setBulkFormStatus("Choose at least one field to update.", true);
    return;
  }

  bulkApplyButton.disabled = true;
  setBulkFormStatus("Updating notes...");
  try {
    const results = [];
    if (Object.keys(changes).length > 0) {
      results.push(await api.postJson("/api/notes/bulk", {
        noteIds: targetIds,
        changes,
      }));
    }
    if (tagAction) {
      results.push(await api.postJson("/api/tags/bulk-assignments", {
        action: tagAction,
        tagIds,
        targetIds,
        targetType: "note",
      }));
    }

    const updatedNoteIds = new Set(results.flatMap((result) => [
      ...(result.notes || []).map((note) => note.note_id),
      ...(result.changed || []).map((entry) => entry.target_id),
    ]).filter(Boolean));
    const failedNoteIds = new Set(results.flatMap((result) => (result.errors || [])
      .map((error) => error.note_id || error.target_id)
      .filter(Boolean)));
    state.selectedNoteIds = failedNoteIds;
    if (isNotesWorkspaceSurface) {
      await Promise.all([loadCollections(), loadNotes()]);
      renderCollections();
      renderNotes();
      await refreshSelectedNoteAfterBulk(updatedNoteIds);
    }

    const fullyUpdatedCount = targetIds.filter((noteId) => !failedNoteIds.has(noteId)).length;
    if (fullyUpdatedCount > 0) {
      closeBulkEditor();
      setStatus(failedNoteIds.size > 0
        ? `Updated ${fullyUpdatedCount} notes; ${failedNoteIds.size} could not be fully updated.`
        : `Updated ${fullyUpdatedCount} notes.`);
      return;
    }

    const firstError = results.flatMap((result) => result.errors || [])[0];
    setBulkFormStatus(firstError?.message || "Selected notes could not be updated.", true);
    bulkApplyButton.disabled = false;
  } catch (error) {
    setBulkFormStatus(error.message || "Selected notes could not be updated.", true);
    bulkApplyButton.disabled = false;
  }
}

function readBulkNoteChanges() {
  const changes = {};
  if (bulkLibraryInput?.value) {
    changes.libraryBucket = bulkLibraryInput.value;
  }
  if (bulkCollectionInput?.value === NOTE_BULK_COLLECTION_UNCATEGORIZED) {
    changes.noteCollectionId = null;
  } else if (bulkCollectionInput?.value) {
    changes.noteCollectionId = bulkCollectionInput.value;
  }
  if (bulkTypeInput?.value) {
    changes.noteType = bulkTypeInput.value;
  }
  if (bulkVisibilityInput?.value) {
    changes.visibility = bulkVisibilityInput.value;
  }
  return changes;
}

async function refreshSelectedNoteAfterBulk(updatedNoteIds = []) {
  const selectedId = state.selectedNote?.note_id || "";
  const updatedIds = updatedNoteIds instanceof Set
    ? updatedNoteIds
    : new Set((updatedNoteIds || []).map((note) => typeof note === "string" ? note : note?.note_id || note?.target_id).filter(Boolean));
  if (!selectedId || !updatedIds.has(selectedId)) {
    return;
  }
  const result = await api.getJson(`/api/notes/${encodeURIComponent(selectedId)}`, { cache: "no-store" });
  state.selectedNote = result.note;
  renderDetail(result.note);
}

function setBulkFormStatus(message, isError = false) {
  if (!bulkFormStatus) {
    return;
  }
  bulkFormStatus.textContent = message;
  bulkFormStatus.classList.toggle("error-text", isError);
}

async function selectNote(noteId) {
  setStatus("Loading note...");

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });
    state.selectedNote = result.note;
    renderDetail(result.note);
    renderNotes();
    closeNotesSlideOutDrawer();
    updateUrl(noteId);
    setStatus("");
  } catch (error) {
    const message = safeNoteErrorMessage(error, "Note could not be loaded.");
    renderDetailPrompt(message, { locked: isSecureError(error) });
    setStatus(message, true);
  }
}

function closeNotesSlideOutDrawer() {
  const trigger = document.querySelector("[data-view-slideout-sidebar-trigger]");
  if (trigger?.getAttribute("aria-expanded") === "true") {
    trigger.click();
  }
}

function renderDetail(note) {
  const title = view.createElement("h2", { text: note.title || "Untitled note" });
  const titleRow = view.createElement("div", { className: "notes-detail-title-row", children: [title, createNoteActionStrip(note)] });
  const titleRule = view.createElement("hr", { className: "notes-detail-rule" });
  const meta = view.createElement("p", { className: "notes-detail-meta", children: detailMetaItems(note) });
  const header = view.createElement("header", { className: "notes-detail-header", children: [titleRow, titleRule, meta] });
  const tagsRule = view.createElement("hr", { className: "notes-detail-rule" });
  const collectionBreadcrumb = view.createElement("p", {
    className: "notes-collection-breadcrumb",
    text: `Collection: ${collectionLabel(note.note_collection_id) || "Uncategorized"}`,
  });
  const links = renderLinksPanel(note);
  const files = renderFilesPanel(note);
  const revisions = renderRevisionsPanel(note);

  if (isSecureNote(note)) {
    header.append(view.createElement("p", {
      className: "notes-secure-warning",
      text: note.secure_title_warning || "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.",
    }));
  }

  const body = view.createElement("div", { className: "notes-rendered-body" });
  body.innerHTML = note.body_html || "";
  applyExternalMarkdownLinkPreference(body);
  if (!body.textContent.trim() && !note.body_html) {
    body.textContent = isSecureNote(note) ? "Secure note body is locked or unavailable." : "No body.";
  }

  const tags = view.createElement("div", { className: "notes-detail-tags", children: [tagChips(note.tags || [])] });

  // Client/Project/Task/User context lives in the Linked Context panel; the metadata row carries all
  // note-level metadata (incl. Created/Updated/Owner) so it is not duplicated here.
  detailPanel.replaceChildren(header, collectionBreadcrumb, tags, tagsRule, body, links, files, revisions);
  mountFilesPanel(note, files.querySelector("[data-note-files-mount]"));
  loadRevisions(note, revisions.querySelector("[data-note-revisions-list]"));
}

function renderDetailPrompt(message, options = {}) {
  const prompt = document.createElement("p");

  prompt.className = options.locked ? "notes-empty-state notes-locked-state" : "notes-empty-state";
  if (options.sidebarHint) {
    prompt.classList.add("notes-empty-state--sidebar-hint");
    prompt.append("Open the ", inlineFilterIcon(), " sidebar and select a note to view here.");
  } else {
    prompt.textContent = message;
  }
  detailPanel.replaceChildren(prompt);
}

function renderBlankDetailPrompt() {
  renderDetailPrompt("", { sidebarHint: true });
}

function inlineFilterIcon() {
  const icon = document.createElement("span");
  icon.className = "notes-empty-state-icon";
  icon.setAttribute("aria-hidden", "true");

  try {
    icon.appendChild(window.LongtailForge?.icons?.createIcon("filter", { size: 16 }) || document.createTextNode(""));
  } catch {
    icon.textContent = "";
  }

  return icon;
}

async function openEditor(note = null, options = {}) {
  note = await hydrateEditorNote(note);
  const defaults = options.defaults || {};
  state.editingNoteId = note?.note_id || "";
  state.editorHostContext = options.hostContext || null;
  state.editorHostContextSettled = false;
  state.editorNote = note;
  state.editorSelectedTarget = null;
  state.editorStagedTargets = [];
  state.libraryManuallyChanged = false;
  dialogTitle.textContent = note ? "Edit Note" : "Create Note";
  titleInput.value = note?.title || defaults.title || "";
  libraryInput.value = note?.library_bucket || defaults.library_bucket || state.activeBucketForCreate || defaultLibraryForCreate();
  populateNoteCollectionOptions(note?.library_bucket || libraryInput.value);
  collectionInput.value = note?.note_collection_id || defaults.note_collection_id || "";
  if (collectionInput.value && ![...collectionInput.options].some((option) => option.value === collectionInput.value)) {
    collectionInput.value = "";
  }
  resetLegacyNoteKindOptions();
  ensureNoteKindOption(note?.note_type);
  typeInput.value = note?.note_type || defaults.note_type || "general";
  populateWorkspaceVisibilityOptions(note?.visibility || defaults.visibility || "internal");
  securityInput.value = note?.security_mode || defaults.security_mode || "normal";
  securityInput.disabled = Boolean(note);
  updateSecureUiState();
  const selectedClientId = note?.client_id || defaults.client_id || "";
  const selectedProjectId = note?.project_id || defaults.project_id || "";
  clientInput.value = selectedClientId;
  projectInput.value = selectedProjectId;
  taskInput.value = note?.task_id || "";
  userInput.value = note?.linked_user_id || "";
  state.editorContextSummaries = note?.linked_context || {};
  await loadPrimaryContextOptions({
    clientId: selectedClientId,
    projectId: selectedProjectId,
  });
  editor?.setValue(note?.body_markdown || defaults.body_markdown || "");
  bodyInput.value = note?.body_markdown || defaults.body_markdown || "";
  preview.hidden = true;
  previewToggle.setAttribute("aria-pressed", "false");
  updatePreviewLayoutState(false);
  formStatus.textContent = "";
  saveButton.disabled = false;
  saveCloseButton.disabled = false;
  if (copyLinkButton) {
    copyLinkButton.hidden = !note?.note_id;
    copyLinkButton.disabled = !note?.note_id;
  }
  await writeNoteNotificationFollowFields(note);
  resetNoteEditorPanels();
  if (detailsGroup) {
    detailsGroup.open = !note;
  }
  await mountTagEditor(note);
  mountNoteEditorFiles(note);
  renderEditorContextSelection();
  await loadEditorLinkTargets();
  updateLibrarySuggestion();
  const closeResult = new Promise((resolve) => {
    dialog?.addEventListener("close", () => resolve(dialog.returnValue || "closed"), { once: true });
  });
  view.showModal(dialog, { trigger: options.trigger || options.hostContext?.trigger || null });
  titleInput.focus();
  return closeResult;
}

async function hydrateEditorNote(note = null) {
  const noteId = note?.note_id || "";
  if (!noteId) {
    return note;
  }

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });
    if (state.selectedNote?.note_id === noteId) {
      state.selectedNote = result.note;
      renderDetail(result.note);
    }
    return result.note;
  } catch {
    return note;
  }
}

function updateSecureWarning() {
  if (!secureWarning) {
    return;
  }

  secureWarning.hidden = !isSecureEditorMode();
}

function updateSecureUiState() {
  const secureMode = isSecureEditorMode();

  updateSecureWarning();
  updateSecureVisibilityOptions(secureMode);
  updateFilesUtilityState();
}

function updateSecureVisibilityOptions(secureMode = false) {
  if (!visibilityInput) {
    return;
  }

  const clientVisibleOption = [...visibilityInput.options].find((option) => option.value === "client_visible");
  if (!clientVisibleOption) {
    if (visibilityInput.value === "client_visible") {
      visibilityInput.value = "internal";
    }
    return;
  }

  clientVisibleOption.disabled = secureMode;
  clientVisibleOption.hidden = secureMode;
  if (secureMode && visibilityInput.value === "client_visible") {
    visibilityInput.value = "internal";
  }
}

function populateWorkspaceVisibilityOptions(selectedValue = visibilityInput?.value || "internal") {
  if (!visibilityInput) {
    return;
  }

  const options = workspaceVisibilityOptions();
  visibilityInput.replaceChildren(...options.map(([value, label]) => notesOptionElement(value, label)));
  visibilityInput.value = options.some(([value]) => value === selectedValue) ? selectedValue : "internal";
  updateSecureVisibilityOptions(isSecureEditorMode());
}

function workspaceVisibilityOptions() {
  if (normalizeWorkspaceType(state.workspaceType) === "personal") {
    return [];
  }
  return modalFieldOptions(notesEditorModalDescriptor(), "visibility")
    .filter(([value]) => value !== "client_visible" || usesBusinessScope());
}

function closeEditor(options = {}) {
  if (options.cancelHost) {
    cancelNoteEditorHostContext({
      actionId: state.editingNoteId ? "notes.edit" : "notes.add",
      recordId: state.editingNoteId || "",
    });
  }
  state.editorNote = null;
  state.editorSelectedTarget = null;
  state.editorStagedTargets = [];
  state.filesDialogNoteId = "";
  state.tagsDialogNoteId = "";
  if (copyLinkButton) {
    copyLinkButton.hidden = true;
    copyLinkButton.disabled = true;
  }
  resetNoteNotificationFollowFields();
  view.closeModal(dialog, options.returnValue || "");
}

function cancelEditor() {
  closeEditor({ cancelHost: true, returnValue: "cancel" });
}

function handleEditorDialogClose() {
  cancelNoteEditorHostContext({
    actionId: state.editingNoteId ? "notes.edit" : "notes.add",
    recordId: state.editingNoteId || "",
  });
}

function completeNoteEditorHostContext(detail = {}) {
  if (!state.editorHostContext || state.editorHostContextSettled) {
    return;
  }

  state.editorHostContextSettled = true;
  state.editorHostContext.complete?.(detail);
  state.editorHostContext = null;
}

function cancelNoteEditorHostContext(detail = {}) {
  if (!state.editorHostContext || state.editorHostContextSettled) {
    return;
  }

  state.editorHostContextSettled = true;
  state.editorHostContext.cancel?.(detail);
  state.editorHostContext = null;
}

async function copyCurrentNoteLink() {
  const noteId = state.editingNoteId || state.editorNote?.note_id || "";
  if (!noteId) {
    setEditorFormStatus("Save the note before copying a link.", true);
    return;
  }

  const url = new window.URL("notes.html", window.location.href);
  url.searchParams.set("note", noteId);

  try {
    await navigator.clipboard.writeText(url.toString());
    setEditorFormStatus("Note link copied.");
  } catch {
    setEditorFormStatus(url.toString());
  }
}

async function writeNoteNotificationFollowFields(note) {
  if (!notificationToggle) {
    return;
  }

  const noteId = note?.note_id || "";
  const canEmitNotifications = note?.security_mode !== "secure";
  const subscriptions = window.LongtailForge?.notificationSubscriptions;
  const canToggleNotifications = Boolean(noteId && canEmitNotifications && subscriptions?.noteTarget);
  writeNoteNotificationFollowState(false);
  notificationToggle.hidden = !canToggleNotifications;
  notificationToggle.disabled = !canToggleNotifications;

  if (!canToggleNotifications) {
    notificationToggle.title = noteId ? "Note notifications unavailable" : "Save the note before following notifications";
    notificationToggle.setAttribute("aria-label", notificationToggle.title);
    return;
  }

  notificationToggle.disabled = true;
  notificationToggle.title = "Checking notification follow state";
  notificationToggle.setAttribute("aria-label", "Checking notification follow state");

  try {
    const result = await subscriptions.readStatus(subscriptions.noteTarget(noteId));
    writeNoteNotificationFollowState(result.isFollowing === true);
  } catch {
    notificationToggle.disabled = true;
    notificationToggle.title = "Notification follow state unavailable";
    notificationToggle.setAttribute("aria-label", "Notification follow state unavailable");
  }
}

async function toggleNoteNotificationFollow() {
  const noteId = state.editingNoteId || state.editorNote?.note_id || "";
  const subscriptions = window.LongtailForge?.notificationSubscriptions;
  if (!noteId || !subscriptions?.noteTarget || !notificationToggle) {
    return;
  }

  const isFollowing = notificationToggle.dataset.isFollowing === "true";
  notificationToggle.disabled = true;
  notificationToggle.title = isFollowing ? "Unfollowing note notifications" : "Following note notifications";
  notificationToggle.setAttribute("aria-label", isFollowing ? "Unfollowing note notifications" : "Following note notifications");
  setEditorFormStatus(isFollowing ? "Unfollowing note notifications..." : "Following note notifications...");

  try {
    const target = subscriptions.noteTarget(noteId);
    const result = isFollowing
      ? await subscriptions.unfollow(target)
      : await subscriptions.follow(target);

    writeNoteNotificationFollowState(result.isFollowing === true);
    setEditorFormStatus(result.isFollowing ? "Note notifications followed." : "Note notifications unfollowed.");
  } catch (error) {
    writeNoteNotificationFollowState(isFollowing);
    setEditorFormStatus(error.message || "Notification follow change failed.", true);
  }
}

function writeNoteNotificationFollowState(isFollowing) {
  if (!notificationToggle) {
    return;
  }

  const label = isFollowing ? "Unfollow note notifications" : "Follow note notifications";
  notificationToggle.dataset.isFollowing = String(isFollowing);
  notificationToggle.classList.toggle("is-following", isFollowing);
  notificationToggle.disabled = false;
  notificationToggle.title = label;
  notificationToggle.setAttribute("aria-label", label);
  notificationToggle.setAttribute("aria-pressed", String(isFollowing));
}

function resetNoteNotificationFollowFields() {
  if (!notificationToggle) {
    return;
  }

  writeNoteNotificationFollowState(false);
  notificationToggle.hidden = true;
  notificationToggle.disabled = true;
}

function setEditorFormStatus(message, isError = false) {
  if (!formStatus) {
    setStatus(message, isError);
    return;
  }

  formStatus.textContent = message;
  formStatus.classList.toggle("error-text", isError);
}

async function saveNote(event) {
  event.preventDefault();
  const wasCreating = !state.editingNoteId;
  try {
    await saveNoteForm({ closeOnSuccess: !wasCreating });
  } catch {
    // saveNoteForm reports validation and route errors through the modal status.
  }
}

async function saveAndCloseNote(event) {
  event?.preventDefault();
  try {
    await saveNoteForm({ closeOnSuccess: true });
  } catch {
    // saveNoteForm reports validation and route errors through the modal status.
  }
}

async function saveNoteForm({ closeOnSuccess = true } = {}) {
  saveButton.disabled = true;
  saveCloseButton.disabled = true;
  setEditorFormStatus("Saving note...");
  const wasEditing = Boolean(state.editingNoteId);

  try {
    const payload = readEditorPayload();
    const result = state.editingNoteId
      ? await api.putJson(`/api/notes/${encodeURIComponent(state.editingNoteId)}`, payload)
      : await api.postJson("/api/notes", payload);
    if (isNotesWorkspaceSurface) {
      await Promise.all([loadCollections(), loadNotes()]);
    } else {
      await loadCollections();
    }
    if (typeof state.editorHostContext?.refresh === "function") {
      await state.editorHostContext.refresh(result);
    }
    if (!wasEditing) {
      await transitionCreatedNoteToEdit(result.note);
    }
    if (isNotesWorkspaceSurface) {
      state.selectedNote = result.note;
      renderNotes();
      renderDetail(result.note);
      updateUrl(result.note.note_id);
    }
    if (closeOnSuccess) {
      completeNoteEditorHostContext({
        actionId: wasEditing ? "notes.edit" : "notes.add",
        recordId: result.note?.note_id || "",
        title: result.note?.title || payload.title || "",
      });
      closeEditor({ returnValue: "complete" });
      if (isNotesWorkspaceSurface) {
        await selectNote(result.note.note_id);
      }
      setEditorFormStatus("");
      return result;
    }
    if (!wasEditing) {
      setEditorFormStatus("Note saved. Continue editing or choose Save & Close.");
    } else {
      setEditorFormStatus("Note saved.");
    }
    saveButton.disabled = false;
    saveCloseButton.disabled = false;
    return result;
  } catch (error) {
    setEditorFormStatus(safeNoteErrorMessage(error, "Note could not be saved."), true);
    saveButton.disabled = false;
    saveCloseButton.disabled = false;
    throw error;
  }
}

async function transitionCreatedNoteToEdit(note) {
  if (!note?.note_id) {
    return;
  }

  state.editingNoteId = note.note_id;
  state.editorNote = note;
  state.editorContextSummaries = note.linked_context || state.editorContextSummaries;
  state.editorStagedTargets = [];
  dialogTitle.textContent = "Edit Note";
  securityInput.disabled = true;
  if (copyLinkButton) {
    copyLinkButton.hidden = false;
    copyLinkButton.disabled = false;
  }
  await writeNoteNotificationFollowFields(note);
  await mountTagEditor(note);
  mountNoteEditorFiles(note);
  renderEditorContextSelection();
}

function readEditorPayload() {
  return {
    title: titleInput.value,
    body_markdown: editor?.getValue() || bodyInput.value,
    library_bucket: libraryInput.value,
    noteCollectionId: collectionInput.value || null,
    note_type: typeInput.value,
    ...(normalizeWorkspaceType(state.workspaceType) === "personal" ? {} : { visibility: readEditorVisibility() }),
    security_mode: securityInput.value,
    tagIds: state.tagPicker?.readTagIds?.() || [],
    client_id: usesBusinessScope() ? normalizeText(clientInput.value) || null : null,
    project_id: normalizeText(projectInput.value) || null,
    task_id: null,
    linked_user_id: normalizeText(userInput.value) || null,
    links: !state.editingNoteId ? stagedLinkPayloads() : [],
  };
}

function readEditorVisibility() {
  return !usesBusinessScope() && visibilityInput?.value === "client_visible"
    ? "internal"
    : visibilityInput?.value || "internal";
}

async function loadPrimaryContextOptions(selected = {}) {
  updatePrimaryContextVisibility();
  const selectedProjectId = selected.projectId || projectInput?.value || "";
  const selectedClientId = selected.clientId || clientInput?.value || "";

  if (clientInput) {
    clientInput.disabled = true;
  }
  if (projectInput) {
    projectInput.disabled = true;
  }

  try {
    const [clients, projects] = await Promise.all([
      usesBusinessScope() ? fetchLinkTargets({ targetType: "client", limit: 50 }) : Promise.resolve([]),
      fetchLinkTargets({ targetType: "project", limit: 50 }),
    ]);
    state.primaryContextClients = clients.filter(isActivePrimaryClientTarget);
    state.primaryContextProjects = projects;
    populateLinkClientContextSelect();

    const selectedProject = findPrimaryContextProject(selectedProjectId) || primaryContextSummaryForSelection("project", selectedProjectId);
    const derivedClientId = usesBusinessScope() ? selectedProject?.clientId || selectedClientId || "" : "";
    populatePrimaryClientOptions(derivedClientId);
    populatePrimaryProjectOptions(selectedProjectId);
  } catch {
    state.primaryContextClients = [];
    state.primaryContextProjects = [];
    populateLinkClientContextSelect();
    populatePrimaryClientOptions("");
    populatePrimaryProjectOptions("");
  } finally {
    if (clientInput) {
      clientInput.disabled = !usesBusinessScope();
    }
    if (projectInput) {
      projectInput.disabled = false;
    }
  }
}

function updatePrimaryContextVisibility() {
  const clientAvailable = usesBusinessScope();
  if (primaryClientField) {
    primaryClientField.hidden = !clientAvailable;
    primaryClientField.style.display = clientAvailable ? "" : "none";
  }
  if (primaryProjectField) {
    primaryProjectField.hidden = false;
  }
  if (clientInput) {
    clientInput.disabled = !clientAvailable;
  }
  if (!clientAvailable && clientInput) {
    clientInput.value = "";
  }
}

function populatePrimaryClientOptions(selectedClientId = clientInput?.value || "") {
  if (!clientInput) {
    return;
  }

  const options = [new window.Option("No client", "")];
  state.primaryContextClients.forEach((client) => {
    options.push(new window.Option(primaryClientOptionLabel(client), client.clientId || client.targetId || ""));
  });
  if (usesBusinessScope() && selectedClientId && !optionListHasValue(options, selectedClientId)) {
    options.push(primaryClientFallbackOption(selectedClientId));
  }
  clientInput.replaceChildren(...options);
  clientInput.value = usesBusinessScope() && options.some((option) => option.value === selectedClientId) ? selectedClientId : "";
}

function populatePrimaryProjectOptions(selectedProjectId = projectInput?.value || "") {
  if (!projectInput) {
    return;
  }

  const selectedClientId = usesBusinessScope() ? clientInput?.value || "" : "";
  const projects = state.primaryContextProjects
    .filter((project) => !selectedClientId || project.clientId === selectedClientId);
  const options = [
    new window.Option("No project", ""),
    ...projects.map((project) => new window.Option(primaryProjectOptionLabel(project), project.projectId || project.targetId || "")),
  ];
  if (selectedProjectId && !optionListHasValue(options, selectedProjectId)) {
    options.push(primaryProjectFallbackOption(selectedProjectId));
  }

  projectInput.replaceChildren(...options);
  projectInput.value = options.some((option) => option.value === selectedProjectId) ? selectedProjectId : "";
}

function optionListHasValue(options = [], value = "") {
  return options.some((option) => option.value === value);
}

function primaryClientFallbackOption(selectedClientId = "") {
  const summary = primaryContextSummaryForSelection("client", selectedClientId);
  const option = new window.Option(summary.label ? primaryClientOptionLabel(summary) : unavailableTargetLabel("client"), selectedClientId);
  const status = normalizeText(summary.status).toLowerCase();

  option.dataset.primaryContextFallback = "";
  option.disabled = Boolean(status && status !== "active");
  return option;
}

function primaryProjectFallbackOption(selectedProjectId = "") {
  const summary = primaryContextSummaryForSelection("project", selectedProjectId);
  const option = new window.Option(summary.label
    ? primaryProjectOptionLabel({ ...summary, projectId: selectedProjectId, targetId: selectedProjectId })
    : unavailableTargetLabel("project"), selectedProjectId);

  option.dataset.primaryContextFallback = "";
  return option;
}

function primaryContextSummaryForSelection(targetType, selectedId = "") {
  const summary = state.editorContextSummaries?.[targetType] || {};

  if (!summary || typeof summary !== "object") {
    return {};
  }

  const summaryIds = [
    summary.targetId,
    summary.target_id,
    targetType === "client" ? summary.clientId : summary.projectId,
    targetType === "client" ? summary.client_id : summary.project_id,
  ].filter(Boolean);

  return !selectedId || summaryIds.length === 0 || summaryIds.includes(selectedId) ? summary : {};
}

function handlePrimaryClientChange() {
  if (!usesBusinessScope() && clientInput) {
    clientInput.value = "";
  }
  if (projectInput) {
    projectInput.value = "";
  }
  populatePrimaryProjectOptions("");
  renderEditorContextPanel();
  updateLibrarySuggestion();
}

function handlePrimaryProjectChange() {
  const project = findPrimaryContextProject(projectInput?.value || "");

  if (usesBusinessScope() && clientInput) {
    clientInput.value = project?.clientId || "";
    populatePrimaryProjectOptions(projectInput?.value || "");
  }
  renderEditorContextPanel();
  updateLibrarySuggestion();
}

function findPrimaryContextProject(projectId) {
  return state.primaryContextProjects.find((project) => (project.projectId || project.targetId || "") === projectId) || null;
}

function primaryClientOptionLabel(client = {}) {
  return providerDisplayLabel(client.displayLabel, client.display_label) ||
    normalizeText(client.label) ||
    unavailableTargetLabel("client");
}

function isActivePrimaryClientTarget(client = {}) {
  return normalizeText(client.status).toLowerCase() === "active";
}

function primaryProjectOptionLabel(project = {}) {
  const providerLabel = providerDisplayLabel(project.displayLabel, project.display_label);
  if (providerLabel) {
    return providerLabel;
  }

  const projectName = project.label || unavailableTargetLabel("project");
  if (!usesBusinessScope()) {
    return projectName;
  }
  const contextName = project.clientName || project.client_name || project.workspaceName || project.workspace_name || window.LongtailForge?.workspaceContext?.workspaceName || "Workspace";
  return `${projectName} - ${contextName}`;
}

function queueEditorLinkTargetSearch() {
  window.clearTimeout(state.linkTargetSearchTimer);
  state.linkTargetSearchTimer = window.setTimeout(() => loadEditorLinkTargets(), 180);
}

async function loadEditorLinkTargets() {
  if (!contextResultsInput) {
    return;
  }

  contextResultsInput.disabled = true;
  replaceLinkTargetOptions([{ value: "", label: "Loading records...", disabled: true }]);

  try {
    const targets = await fetchLinkTargets({
      ...readLinkTargetClientContext(),
      targetType: contextTargetTypeInput?.value || defaultLinkTargetType(),
      search: contextSearchInput?.value || "",
      limit: 40,
    });
    state.linkTargets = targets;
    populateLinkTargetSelect(contextResultsInput, targets);
  } catch {
    state.linkTargets = [];
    replaceLinkTargetOptions([{ value: "", label: "No records available", disabled: true }]);
  } finally {
    contextResultsInput.disabled = false;
  }
}

async function fetchLinkTargets({ targetType = "all", search = "", limit = 20, clientScope = LINK_CLIENT_CONTEXT_ALL, clientId = "" } = {}) {
  const params = new URLSearchParams({
    targetType,
    limit: String(limit),
  });

  if (usesBusinessScope()) {
    if (clientScope === LINK_CLIENT_CONTEXT_WORKSPACE) {
      params.set("clientScope", LINK_CLIENT_CONTEXT_WORKSPACE);
    } else if (clientScope === "client" && clientId) {
      params.set("clientScope", "client");
      params.set("clientId", clientId);
    }
  }

  if (search.trim()) {
    params.set("q", search.trim());
  }

  const result = await api.getJson(`/api/notes/link-targets?${params.toString()}`, { cache: "no-store" });
  return result.targets || [];
}

function populateLinkTargetSelect(select, targets = []) {
  const records = targets.map((target) => ({
    ...pickerRecordFromTarget(target),
    selected: false,
  }));
  replaceLinkTargetOptions(records, select);

  [...(select?.options || [])].forEach((option, index) => {
    const target = targets[index];
    if (!target) {
      return;
    }
    option.dataset.target = JSON.stringify(target);
  });
}

function populateLinkTargetTypeSelect(select) {
  if (!select) {
    return;
  }

  const selectedValue = availableLinkTargetTypes().includes(select.value) ? select.value : defaultLinkTargetType();
  const options = availableLinkTargetTypes().map((targetType) => {
    const option = document.createElement("option");
    option.value = targetType;
    option.textContent = LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType);
    return option;
  });
  select.replaceChildren(...options);
  select.value = selectedValue;
}

function handleEditorLinkClientContextChange() {
  state.linkTargetClientContext = normalizeText(contextClientInput?.value) || LINK_CLIENT_CONTEXT_ALL;
  void loadEditorLinkTargets();
}

function populateLinkClientContextSelect(selectedValue = state.linkTargetClientContext || LINK_CLIENT_CONTEXT_ALL) {
  const parts = editorContextPickerParts();
  const select = contextClientInput || parts.clientContextSelect;
  const setClientContexts = typeof parts.setClientContexts === "function"
    ? parts.setClientContexts
    : null;

  if (!select && !setClientContexts) {
    return;
  }

  if (!usesBusinessScope()) {
    state.linkTargetClientContext = LINK_CLIENT_CONTEXT_ALL;
    if (setClientContexts) {
      setClientContexts([]);
    } else if (select) {
      select.replaceChildren();
      select.disabled = true;
    }
    return;
  }

  const options = linkTargetClientContextOptions();
  const normalizedSelectedValue = normalizeText(selectedValue) || LINK_CLIENT_CONTEXT_ALL;
  const nextValue = options.some((option) => option.value === normalizedSelectedValue)
    ? normalizedSelectedValue
    : LINK_CLIENT_CONTEXT_ALL;
  const selectableOptions = options.map((option) => ({
    ...option,
    selected: option.value === nextValue,
  }));

  state.linkTargetClientContext = nextValue;
  if (setClientContexts) {
    setClientContexts(selectableOptions);
  } else if (select) {
    select.replaceChildren(...selectableOptions.map((option) => new window.Option(option.label, option.value, false, option.selected)));
  }
  if (select) {
    select.value = nextValue;
    select.disabled = false;
  }
}

function linkTargetClientContextOptions() {
  if (!usesBusinessScope()) {
    return [];
  }

  return [
    { value: LINK_CLIENT_CONTEXT_ALL, label: "All Clients" },
    { value: LINK_CLIENT_CONTEXT_WORKSPACE, label: linkTargetWorkspaceClientLabel() },
    ...state.primaryContextClients.map((client) => ({
      value: client.clientId || client.targetId || "",
      label: primaryClientOptionLabel(client),
    })).filter((option) => option.value),
  ];
}

function linkTargetWorkspaceClientLabel() {
  return normalizeText(window.LongtailForge?.workspaceContext?.workspaceName) || "Workspace";
}

function readLinkTargetClientContext() {
  const value = normalizeText(contextClientInput?.value || state.linkTargetClientContext || LINK_CLIENT_CONTEXT_ALL);

  if (!usesBusinessScope()) {
    return { clientScope: LINK_CLIENT_CONTEXT_ALL, clientId: "" };
  }
  if (value === LINK_CLIENT_CONTEXT_WORKSPACE) {
    return { clientScope: LINK_CLIENT_CONTEXT_WORKSPACE, clientId: "" };
  }
  if (value && value !== LINK_CLIENT_CONTEXT_ALL) {
    return { clientScope: "client", clientId: value };
  }
  return { clientScope: LINK_CLIENT_CONTEXT_ALL, clientId: "" };
}

function availableLinkTargetTypes() {
  return LINK_TARGET_TYPE_ORDER.filter((targetType) => targetType !== "client" || usesBusinessScope());
}

function defaultLinkTargetType() {
  const available = availableLinkTargetTypes();
  return available.includes(DEFAULT_LINK_TARGET_TYPE)
    ? DEFAULT_LINK_TARGET_TYPE
    : available[0] || "project";
}

function linkTargetProviderOptions() {
  return availableLinkTargetTypes().map((targetType) => ({
    moduleId: {
      client: "client-projects",
      list: "lists",
      note: "notes",
      project: "client-projects",
      task: "tasks",
      user: "users",
    }[targetType] || "",
    targetType,
    label: LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType),
  }));
}

function replaceLinkTargetOptions(records = [], select = contextResultsInput) {
  const parts = select === contextResultsInput ? editorContextPickerParts() : {};
  if (select === contextResultsInput && typeof parts.setRecords === "function") {
    parts.setRecords(records);
    return;
  }
  const options = records.map((record) => {
    const option = new window.Option(record.displayLabel || record.label || "No records found", record.targetId || record.value || "");
    option.disabled = Boolean(record.disabled);
    const title = record.ariaLabel || record.title || record.fullLabel || record.displayLabel || record.label || "";
    if (title) {
      option.title = title;
      option.setAttribute("aria-label", title);
    }
    return option;
  });
  select?.replaceChildren(...options);
}

function pickerRecordFromTarget(target = {}) {
  return {
    moduleId: target.moduleId || target.module_id || "",
    targetType: target.targetType || target.target_type || "",
    targetId: target.targetId || target.target_id || "",
    displayLabel: targetPickerDisplayLabel(target),
    secondaryLabel: targetPickerSecondaryLabel(target),
    sortKey: target.sortKey || target.sort_key || "",
    sourceUrl: target.sourceUrl || target.source_url || "",
    title: target.title || "",
    fullLabel: target.fullLabel || target.full_label || "",
    ariaLabel: target.ariaLabel || target.aria_label || target.title || target.fullLabel || target.full_label || "",
    isAvailable: target.isAvailable !== false && target.is_available !== false,
  };
}

function targetPickerDisplayLabel(target = {}) {
  const targetType = target.targetType || target.target_type || "";
  const providerLabel = providerDisplayLabel(target.displayLabel, target.display_label);
  if (providerLabel) {
    return providerLabel;
  }

  const label = target.label || unavailableTargetLabel(targetType);
  if (targetType === "project") {
    return primaryProjectOptionLabel({ ...target, label });
  }

  return label;
}

function targetPickerSecondaryLabel(target = {}) {
  if (Object.hasOwn(target, "secondaryLabel") || Object.hasOwn(target, "secondary_label")) {
    return target.secondaryLabel ?? target.secondary_label ?? "";
  }

  if (!usesBusinessScope()) {
    return "";
  }

  const targetType = target.targetType || target.target_type || "";
  if (targetType === "project") {
    return "";
  }

  if (targetType === "task") {
    return target.clientName || target.client_name || target.projectName || target.project_name || target.workspaceName || target.workspace_name || "";
  }

  return "";
}

function readSelectedLinkTarget(select) {
  const option = select?.selectedOptions?.[0];

  if (!option?.dataset?.target) {
    return null;
  }

  try {
    return JSON.parse(option.dataset.target);
  } catch {
    return null;
  }
}

async function applyEditorLinkTarget() {
  const target = readSelectedLinkTarget(contextResultsInput);

  if (!target?.targetType || !target.targetId) {
    state.editorSelectedTarget = null;
    renderEditorContextSelection();
    return;
  }

  if (state.editingNoteId) {
    await addEditorNoteLink(target);
    return;
  }

  stageEditorLinkTarget(target);
  renderEditorContextSelection(target);
  updateLibrarySuggestion({ preferredSuggestion: target.suggestedLibraryBucket });
}

function linkPayloadFromTarget(target = {}) {
  return {
    moduleId: target.moduleId,
    targetType: target.targetType,
    targetId: target.targetId,
  };
}

function stagedLinkPayloads() {
  const seen = new Set();
  const links = [];

  for (const target of state.editorStagedTargets || []) {
    const targetKey = editorLinkTargetKey(target);
    if (!targetKey || seen.has(targetKey)) {
      continue;
    }
    seen.add(targetKey);
    links.push(linkPayloadFromTarget(target));
  }

  return links;
}

function noteHasLink(note = {}, target = {}) {
  return (note.links || []).some((link) => editorLinkTargetMatches(link, target));
}

function editorLinkTargetKey(target = {}) {
  const targetType = target.targetType || target.target_type || "";
  const targetId = target.targetId || target.target_id || "";

  if (!targetType || !targetId) {
    return "";
  }

  return `${target.moduleId || target.module_id || ""}:${targetType}:${targetId}`;
}

function editorLinkTargetMatches(link = {}, target = {}) {
  const linkModuleId = link.moduleId || link.module_id || "";
  const targetModuleId = target.moduleId || target.module_id || "";
  const linkTargetType = link.targetType || link.target_type || "";
  const targetType = target.targetType || target.target_type || "";
  const linkTargetId = link.targetId || link.target_id || "";
  const targetId = target.targetId || target.target_id || "";

  return linkTargetType === targetType &&
    linkTargetId === targetId &&
    (!linkModuleId || !targetModuleId || linkModuleId === targetModuleId);
}

function stagedTargetExists(target = {}) {
  return (state.editorStagedTargets || []).some((stagedTarget) => editorLinkTargetMatches(stagedTarget, target));
}

function stageEditorLinkTarget(target = {}) {
  if (!target.targetType || !target.targetId) {
    return;
  }
  if (stagedTargetExists(target)) {
    state.editorSelectedTarget = target;
    renderEditorContextSelection(target);
    formStatus.textContent = "Linked context is already staged.";
    return;
  }

  state.editorStagedTargets = [...(state.editorStagedTargets || []), target];
  state.editorSelectedTarget = target;
  formStatus.textContent = "";
  renderEditorContextSelection(target);
}

function removeEditorStagedTarget(target = {}) {
  state.editorStagedTargets = (state.editorStagedTargets || [])
    .filter((stagedTarget) => !editorLinkTargetMatches(stagedTarget, target));
  if (editorLinkTargetMatches(state.editorSelectedTarget || {}, target)) {
    state.editorSelectedTarget = null;
  }
  renderEditorContextSelection();
  updateLibrarySuggestion();
}

function renderEditorContextSelection(target = null) {
  renderEditorContextPanel();
  if (!contextSelectedMessage) {
    return;
  }

  const linked = [];
  if (target?.targetType === "workspace") {
    linked.push(`Workspace: ${target.label || "Workspace"}`);
  } else if (target?.targetType) {
    linked.push(`${contextTypeLabel(target.targetType)}: ${target.label || unavailableTargetLabel(target.targetType)}`);
  } else {
    if (userInput.value) {
      linked.push(`User: ${contextSummaryLabel("user")}`);
    }
  }

  contextSelectedMessage.textContent = linked.length > 0
    ? `Linked context: ${linked.join(" / ")}`
    : "No linked context selected.";
}

function contextSummaryLabel(targetType) {
  return state.editorContextSummaries?.[targetType]?.label || unavailableTargetLabel(targetType);
}

function renderEditorContextPanel() {
  if (!contextList) {
    return;
  }

  const items = [
    editorPrimaryContextItem(),
    ...editorLinkedContextRows(),
  ];
  const parts = editorContextPickerParts();

  if (typeof parts.setLinkedItems === "function") {
    parts.setLinkedItems(items);
    return;
  }

  contextList.replaceChildren(...items.map((item) => view.createElement("div", {
    className: ["notes-link-item", item.className],
    text: [item.displayLabel, item.secondaryLabel, item.hintLabel].filter(Boolean).join(" - "),
  })));
}

function editorContextPickerParts() {
  return contextList?.closest("[data-note-context-picker]")?.viewParts || {};
}

function editorPrimaryContextItem() {
  return {
    className: "notes-primary-context-row",
    displayLabel: "Primary Context",
    hintLabel: "Edit in Note Details",
    removable: false,
    secondaryLabel: editorPrimaryContextSummary(),
    targetId: "",
    targetType: "primary-context",
  };
}

function editorPrimaryContextSummary() {
  const parts = [];

  if (usesBusinessScope() && clientInput?.value) {
    parts.push(`Client: ${selectedOptionText(clientInput, unavailableTargetLabel("client"))}`);
  }
  if (projectInput?.value) {
    parts.push(`Project: ${selectedOptionText(projectInput, unavailableTargetLabel("project"))}`);
  }

  return parts.length > 0
    ? parts.join(" / ")
    : "No primary context selected.";
}

function editorLinkedContextRows() {
  const note = state.editorNote || {};
  const rows = (note.links || []).map((link) => editorLinkedContextItem(note, link));

  for (const target of state.editorStagedTargets || []) {
    if (!noteHasLink(note, target)) {
      rows.push(editorStagedTargetItem(target));
    }
  }

  return rows;
}

function editorLinkedContextItem(note, link) {
  const targetType = link.targetType || link.target_type || "";

  return {
    displayLabel: targetPickerDisplayLabel({
      ...link,
      targetType,
    }),
    link,
    moduleId: link.moduleId || link.module_id || "",
    removable: note.status !== "archived",
    secondaryLabel: targetPickerSecondaryLabel({
      ...link,
      targetType,
    }),
    sourceUrl: link.sourceUrl || link.source_url || "",
    targetId: link.targetId || link.target_id || "",
    targetType,
  };
}

function editorStagedTargetItem(target = {}) {
  return {
    ...pickerRecordFromTarget(target),
    target,
  };
}

function handleEditorLinkedContextRemove(item = {}) {
  if (item.link) {
    removeEditorNoteLink(state.editorNote || {}, item.link);
  } else if (item.target) {
    removeEditorStagedTarget(item.target);
  }
}

function selectedOptionText(select, fallback) {
  const selected = [...(select?.options || [])].find((option) => option.value === select.value);
  return normalizeText(selected?.textContent) || fallback;
}

async function removeEditorNoteLink(note, link) {
  const noteId = note?.note_id || state.editingNoteId;
  const noteLinkId = link.noteLinkId || link.note_link_id;

  if (!noteId || !noteLinkId) {
    return;
  }

  formStatus.textContent = "Removing linked context...";
  try {
    await api.postJson(`/api/notes/${encodeURIComponent(noteId)}/links/${encodeURIComponent(noteLinkId)}/remove`, {});
    await refreshEditorNote(noteId);
    formStatus.textContent = "";
  } catch (error) {
    formStatus.textContent = safeNoteErrorMessage(error, "Linked context could not be removed.");
  }
}

async function addEditorNoteLink(target = {}) {
  const noteId = state.editingNoteId;

  if (!noteId || !target.targetType || !target.targetId) {
    return;
  }
  if (noteHasLink(state.editorNote || {}, target)) {
    state.editorSelectedTarget = null;
    renderEditorContextSelection();
    formStatus.textContent = "Linked context is already added.";
    return;
  }

  formStatus.textContent = "Adding linked context...";
  if (contextApplyButton) {
    contextApplyButton.disabled = true;
  }

  try {
    await api.postJson(`/api/notes/${encodeURIComponent(noteId)}/links`, linkPayloadFromTarget(target));
    state.editorSelectedTarget = null;
    await refreshEditorNote(noteId);
    formStatus.textContent = "";
  } catch (error) {
    formStatus.textContent = safeNoteErrorMessage(error, "Linked context could not be added.");
  } finally {
    if (contextApplyButton) {
      contextApplyButton.disabled = false;
    }
  }
}

async function refreshEditorNote(noteId) {
  const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });

  state.editorNote = result.note;
  if (state.selectedNote?.note_id === noteId) {
    state.selectedNote = result.note;
    renderDetail(result.note);
  }
  await loadNotes();
  renderNotes();
  renderEditorContextSelection();
  return result.note;
}

function contextTypeLabel(targetType) {
  return LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType || "context");
}

function unavailableTargetLabel(targetType = "") {
  return {
    client: "Unavailable client",
    project: "Unavailable project",
    task: "Unavailable task",
    note: "Unavailable note",
    list: "Unavailable list",
  }[targetType] || "Unavailable linked context";
}

function handleEditorCommand(event) {
  const command = event.target?.dataset?.noteCommand;

  if (!command) {
    return;
  }

  editor?.applyCommand(command);
  void renderPreview();
}

function togglePreview() {
  const pressed = previewToggle.getAttribute("aria-pressed") === "true";
  const visible = !pressed;
  previewToggle.setAttribute("aria-pressed", String(visible));
  preview.hidden = !visible;
  updatePreviewLayoutState(visible);
  if (visible) {
    void renderPreview();
  }
}

function updatePreviewLayoutState(visible) {
  markdownEditor?.classList.toggle("is-preview-visible", visible);
}

async function renderPreview() {
  if (preview.hidden) {
    return;
  }

  const markdown = editor?.getValue() || bodyInput.value;
  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  preview.textContent = "Loading preview...";

  try {
    const result = await api.postJson("/api/notes/preview", { body_markdown: markdown });
    if (requestId !== state.previewRequestId) {
      return;
    }
    preview.innerHTML = result.bodyHtml || "";
    applyExternalMarkdownLinkPreference(preview);
    if (!preview.textContent.trim()) {
      preview.replaceChildren(emptyPreviewNode());
    }
  } catch (error) {
    if (requestId !== state.previewRequestId) {
      return;
    }
    preview.textContent = safeNoteErrorMessage(error, "Preview could not be rendered.");
  }
}

async function archiveNote(note) {
  await mutateNote(`/api/notes/${encodeURIComponent(note.note_id)}/archive`);
}

async function restoreNote(note) {
  await mutateNote(`/api/notes/${encodeURIComponent(note.note_id)}/restore`);
}

function openCollectionDialog(mode, options = {}) {
  const collection = options.collection || null;
  const parent = options.parent || null;
  const libraryBucket = collection?.library_bucket || parent?.library_bucket || defaultLibraryForCreate();

  state.collectionDialogMode = mode || "create";
  state.collectionEditingId = collection?.note_library_collection_id || "";
  collectionDialogTitle.textContent = collection ? "Edit Collection" : "Create Collection";
  collectionTitleInput.value = collection?.title || "";
  collectionLibraryInput.value = libraryBucket;
  collectionLibraryInput.disabled = Boolean(collection);
  populateCollectionParentOptions(collection, parent);
  collectionFormStatus.textContent = "";
  collectionSaveButton.disabled = false;
  view.showModal(collectionDialog, { parent: null });
  collectionTitleInput.focus();
}

function closeCollectionDialog() {
  view.closeModal(collectionDialog);
  if (collectionLibraryInput) {
    collectionLibraryInput.disabled = false;
  }
}

async function saveCollection(event) {
  event.preventDefault();
  collectionSaveButton.disabled = true;
  collectionFormStatus.textContent = "Saving collection...";

  const payload = {
    title: collectionTitleInput.value,
    libraryBucket: collectionLibraryInput.value,
    parentCollectionId: collectionParentInput.value || null,
  };

  try {
    if (state.collectionDialogMode === "edit" && state.collectionEditingId) {
      await api.putJson(`/api/notes/collections/${encodeURIComponent(state.collectionEditingId)}`, payload);
    } else {
      await api.postJson("/api/notes/collections", payload);
    }
    await refreshCollectionUi();
    closeCollectionDialog();
    setStatus("");
  } catch (error) {
    collectionFormStatus.textContent = error.message || "Collection could not be saved.";
    collectionSaveButton.disabled = false;
  }
}

async function archiveCollection(collection) {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Archive collection",
    message: `Archive "${collection.title}"? Notes stay in the collection and are not archived.`,
    confirmLabel: "Archive",
  });

  if (!confirmed) {
    return;
  }

  await mutateCollection(`/api/notes/collections/${encodeURIComponent(collection.note_library_collection_id)}/archive`);
}

async function deleteEmptyCollection(collection) {
  const confirmed = await window.LongtailForge.modal.confirm({
    title: "Delete empty collection",
    message: `Delete "${collection.title}" if it has no notes and no active child collections?`,
    confirmLabel: "Delete Empty",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  await mutateCollection(`/api/notes/collections/${encodeURIComponent(collection.note_library_collection_id)}/delete-empty`);
}

async function mutateCollection(url) {
  setStatus("Saving collection...");

  try {
    await api.postJson(url, {});
    await refreshCollectionUi();
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Collection could not be updated.", true);
  }
}

async function refreshCollectionUi() {
  await Promise.all([loadCollections(), loadNotes()]);
  renderCollections();
  populateCollectionFilter();
  populateNoteCollectionOptions();
  renderNotes();
  if (state.selectedNote?.note_id) {
    await selectNote(state.selectedNote.note_id);
  }
}

function renderLinksPanel(note) {
  const descriptor = notesLinkedRecordsDescriptor();
  const locked = note.status === "archived";
  const typeField = noteFieldLabel("Type", noteSelect("noteLinkTargetType", []));
  const searchField = noteFieldLabel("Search records", noteInput("noteLinkSearch", { type: "search" }));
  const resultsField = noteFieldLabel("Record", noteSelect("noteLinkResults", []));
  const targetType = typeField.querySelector("select");
  const targetSearch = searchField.querySelector("input");
  const targetResults = resultsField.querySelector("select");
  let searchTimer = null;

  populateLinkTargetTypeSelect(targetType);
  targetSearch.placeholder = linkedRecordsField(descriptor, "target_search").placeholder || "Search records";
  targetResults.required = true;

  const addAction = descriptor.actions?.find((action) => action.id === "add-link") || {};
  const add = view.createActionButton({
    icon: "add",
    iconOnly: true,
    label: addAction.label || "Add Link",
    title: addAction.label || "Add Link",
    type: "submit",
    role: addAction.role || "primary",
    action: addAction.behavior || addAction.id,
  });
  add.dataset.noteLinkAdd = "";

  const section = view.renderDescriptorLinkedRecordsPanel(descriptor, {
    className: "notes-links-panel",
    collapsible: true,
    open: false,
    recordsClassName: "notes-link-list",
    formClassName: "notes-link-form view-field-grid surface-modal-section-body",
    formDataset: { noteLinkForm: "", noteId: note.note_id },
    formFields: [typeField, searchField, resultsField],
    formActions: [add],
    locked,
    emptyClassName: "notes-empty-state",
  });
  section.dataset.noteLinksPanel = "";
  section.querySelector(".notes-link-list")?.replaceChildren(...linkRecordNodes(note));

  const form = section.querySelector("[data-note-link-form]");
  const loadTargets = async () => {
    targetResults.disabled = true;
    targetResults.replaceChildren(new window.Option("Loading records...", ""));
    try {
      populateLinkTargetSelect(targetResults, await fetchLinkTargets({
        targetType: targetType.value,
        search: targetSearch.value,
        limit: 40,
      }));
    } catch {
      targetResults.replaceChildren(new window.Option("No records available", ""));
    } finally {
      targetResults.disabled = false;
    }
  };
  targetType.addEventListener("change", loadTargets);
  targetSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadTargets, 180);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = readSelectedLinkTarget(targetResults);
    if (!target) {
      return;
    }
    await addNoteLink(note, {
      targetType: target.targetType,
      targetId: target.targetId,
      moduleId: target.moduleId,
    });
  });
  loadTargets();

  return section;
}

function linkedRecordsField(descriptor, fieldName) {
  return descriptor.fields?.find((field) => field.field === fieldName) || {};
}

function linkRecordNodes(note) {
  const primaryContext = notePrimaryContextItem(note);
  const links = note.links || [];
  const items = [
    primaryContext,
    ...links.map((link) => linkItem(note, link)),
  ].filter(Boolean);

  if (items.length === 0) {
    return [view.createElement("p", {
      className: "notes-empty-state",
      text: notesLinkedRecordsDescriptor().emptyState?.message || "No linked context.",
    })];
  }
  return items;
}

function notePrimaryContextItem(note = {}) {
  const summary = notePrimaryContextSummary(note);

  if (!summary) {
    return null;
  }

  const title = view.createElement("strong", { text: "Primary Context" });
  const subtitle = view.createElement("small", { text: summary });
  const label = view.createElement("span", { className: "notes-link-item-label", children: [title, subtitle] });

  return view.createElement("div", {
    className: "notes-link-item notes-primary-context-row",
    children: [label],
  });
}

function notePrimaryContextSummary(note = {}) {
  const context = note.linked_context || {};
  const parts = [];

  if (usesBusinessScope() && (note.client_id || context.client)) {
    parts.push(`Client: ${context.client?.label || unavailableTargetLabel("client")}`);
  }
  if (note.project_id || context.project) {
    parts.push(`Project: ${context.project?.label || unavailableTargetLabel("project")}`);
  }

  return parts.join(" / ");
}

function linkItem(note, link) {
  const sourceUrl = link.sourceUrl || link.source_url || "";
  const targetType = link.targetType || link.target_type || "";
  const title = view.createElement(sourceUrl ? "a" : "strong", {
    text: link.label || "Unavailable linked context",
    attrs: sourceUrl ? { href: sourceUrl } : {},
  });
  const subtitle = view.createElement("small", {
    text: link.subtitle || (LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType)),
  });
  const label = view.createElement("span", { className: "notes-link-item-label", children: [title, subtitle] });
  const remove = view.createActionButton({ icon: "delete", iconOnly: true, label: "Remove", title: "Remove", role: "secondary", onClick: () => removeNoteLink(note, link) });
  remove.dataset.noteLinkRemove = "";
  remove.hidden = note.status === "archived";
  return view.createElement("div", { className: "notes-link-item", children: [label, remove] });
}

async function addNoteLink(note, payload) {
  await api.postJson(`/api/notes/${encodeURIComponent(note.note_id)}/links`, payload);
  await selectNote(note.note_id);
}

async function removeNoteLink(note, link) {
  const noteLinkId = link.noteLinkId || link.note_link_id;
  await api.postJson(`/api/notes/${encodeURIComponent(note.note_id)}/links/${encodeURIComponent(noteLinkId)}/remove`, {});
  await selectNote(note.note_id);
}

function renderFilesPanel(note = {}) {
  // Collapsible (collapsed by default), boxed to match the Linked Context and Revisions sections
  // (`notes-detail-section`). The embedded file-attachments component drops its own surface chrome and
  // redundant heading inside this panel (see `.notes-files-panel` CSS) so there is a single outer box.
  const summary = view.createElement("summary", { text: "Files" });
  if (isSecureNote(note)) {
    return view.createElement("details", {
      className: "notes-detail-section notes-files-panel",
      children: [summary, lockedNotice("Secure notes do not allow framework file attachments yet.")],
    });
  }
  const mount = view.createElement("div");
  mount.dataset.noteFilesMount = "";
  return view.createElement("details", { className: "notes-detail-section notes-files-panel", children: [summary, mount] });
}

function mountFilesPanel(note, mount) {
  if (!mount || isSecureNote(note) || !window.LongtailForge.fileAttachments) {
    return;
  }

  state.attachmentController?.destroy?.();
  state.attachmentController = window.LongtailForge.fileAttachments.mount(mount, {
    acceptedCategories: ["document", "image", "pdf", "spreadsheet", "presentation", "text", "other"],
    canRemove: note.status !== "archived",
    canUpload: note.status !== "archived",
    clientId: note.client_id || "",
    moduleId: "notes",
    projectId: note.project_id || "",
    saveFirstMessage: "Save the note before adding files.",
    targetId: note.note_id,
    targetType: "note",
    title: "Files",
    visibility: fileVisibilityForNote(note),
  });
}

function fileVisibilityForNote(note) {
  if (note.visibility === "client_visible") {
    return "client";
  }
  if (note.visibility === "private") {
    return "private";
  }
  return "workspace";
}

function renderRevisionsPanel(note) {
  const summary = view.createElement("summary", { text: "Revisions" });
  const list = view.createElement("div", { text: "Loading revisions..." });

  list.dataset.noteRevisionsList = "";
  if (note.status === "archived") {
    list.dataset.archived = "true";
  }
  return view.createElement("details", {
    className: "notes-detail-section notes-revisions-panel",
    children: [summary, list],
  });
}

async function loadRevisions(note, list) {
  if (!list) {
    return;
  }

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(note.note_id)}/revisions`, { cache: "no-store" });
    const revisions = result.revisions || [];
    list.replaceChildren(...(revisions.length ? revisions.map((revision) => revisionItem(note, revision)) : [emptyText("No revisions.")]));
  } catch (error) {
    list.replaceChildren(emptyText(safeNoteErrorMessage(error, "Revisions could not be loaded.")));
  }
}

function revisionItem(note, revision) {
  const item = document.createElement("article");
  const title = document.createElement("strong");
  const meta = document.createElement("p");
  const excerpt = document.createElement("p");
  const restore = document.createElement("button");

  item.className = "notes-revision-item";
  title.textContent = Number(revision.revision_number) === 1 ? "Original" : `Revision ${revision.revision_number}`;
  meta.textContent = [
    revision.change_summary,
    formatToken(revision.library_bucket),
    normalizeWorkspaceType(state.workspaceType) === "personal" ? "" : formatToken(revision.visibility),
    formatToken(revision.security_mode),
    formatDate(revision.created_at),
  ].filter(Boolean).join(" - ");
  excerpt.textContent = isSecureNote(revision) ? "Secure revision body hidden from history." : revision.body_excerpt || revision.title || "";
  restore.type = "button";
  restore.textContent = "Restore";
  restore.hidden = note.status === "archived";
  if (isSecureNote(note)) {
    restore.title = "Secure revision restore re-encrypts the restored body.";
  }
  restore.addEventListener("click", async () => {
    try {
      await api.postJson(`/api/notes/${encodeURIComponent(note.note_id)}/revisions/${encodeURIComponent(revision.note_revision_id)}/restore`, {});
      await selectNote(note.note_id);
    } catch (error) {
      setStatus(safeNoteErrorMessage(error, "Revision could not be restored."), true);
    }
  });
  item.append(title, meta, excerpt, restore);
  return item;
}

async function mountTagEditor(note) {
  if (!tagsEditor || !window.LongtailForge.tags) {
    tagsToggle && (tagsToggle.hidden = !window.LongtailForge.tags);
    return;
  }

  tagsToggle.hidden = false;
  state.tagsDialogNoteId = note?.note_id || "";
  state.tagPicker = await window.LongtailForge.tags.mountPicker(tagsEditor, {
    allowCreate: true,
    label: "Tags",
    selectedTags: note?.tags || [],
    tags: state.availableTags,
  });
}

function mountNoteEditorFiles(note) {
  const filesAvailable = Boolean(filesEditor) && Boolean(window.LongtailForge.fileAttachments);
  const secure = isSecureNote(note) || (!note?.note_id && isSecureEditorMode());

  updateFilesUtilityState(note);

  state.editorAttachmentController?.destroy?.();
  state.editorAttachmentController = null;
  state.filesDialogNoteId = note?.note_id || "";
  if (filesSaveFirstWarning) {
    filesSaveFirstWarning.hidden = Boolean(note?.note_id);
  }
  if (!filesAvailable || secure || !note?.note_id) {
    filesEditor?.replaceChildren?.();
    return;
  }

  state.editorAttachmentController = window.LongtailForge.fileAttachments.mount(filesEditor, {
    acceptedCategories: ["document", "image", "pdf", "spreadsheet", "presentation", "text", "other"],
    canRemove: Boolean(note?.note_id) && note?.status !== "archived",
    canUpload: Boolean(note?.note_id) && note?.status !== "archived",
    clientId: note?.client_id || "",
    moduleId: "notes",
    projectId: note?.project_id || "",
    saveFirstMessage: "Save the note before adding files.",
    targetId: note?.note_id || "",
    targetType: "note",
    title: "Files",
    visibility: fileVisibilityForNote(note || {}),
  });
}

function updateFilesUtilityState(note = state.editorNote) {
  if (!filesToggle) {
    return;
  }

  const filesAvailable = Boolean(filesDialog) && Boolean(filesEditor) && Boolean(window.LongtailForge.fileAttachments);
  const secure = isSecureNote(note) || (!note?.note_id && isSecureEditorMode());
  filesToggle.hidden = secure || !filesAvailable;
  if (filesToggle.hidden) {
    filesToggle.setAttribute("aria-expanded", "false");
    closeFilesDialog();
  }
}

function resetNoteEditorPanels() {
  tagsToggle?.setAttribute("aria-expanded", "false");
  filesToggle?.setAttribute("aria-expanded", "false");
  closeTagsDialog();
  closeFilesDialog();
}

function openTagsDialog() {
  if (!tagsDialog) {
    return;
  }

  closeFilesDialog();
  tagsToggle?.setAttribute("aria-expanded", "true");
  view.showModal(tagsDialog, { parent: dialog, trigger: tagsToggle });
  tagsDialog.querySelector("[data-tag-picker-input]")?.focus();
}

function closeTagsDialog() {
  if (!tagsDialog) {
    return;
  }

  view.closeModal(tagsDialog);
}

function handleTagsDialogClose() {
  tagsToggle?.setAttribute("aria-expanded", "false");
}

function openFilesDialog() {
  if (!filesDialog || filesToggle?.hidden) {
    return;
  }

  closeTagsDialog();
  filesToggle?.setAttribute("aria-expanded", "true");
  view.showModal(filesDialog, { parent: dialog, trigger: filesToggle });
  const focusTarget = state.filesDialogNoteId
    ? filesDialog.querySelector("[data-file-attachment-input]")
    : filesDialog.querySelector("[data-note-files-save-first-warning]");
  focusTarget?.focus();
}

function closeFilesDialog() {
  if (!filesDialog) {
    return;
  }

  view.closeModal(filesDialog);
}

function handleFilesDialogClose() {
  filesToggle?.setAttribute("aria-expanded", "false");
}

async function mutateNote(url) {
  setStatus("Saving note...");

  try {
    const result = await api.postJson(url, {});
    await Promise.all([loadCollections(), loadNotes()]);
    await selectNote(result.note.note_id);
    setStatus("");
  } catch (error) {
    setStatus(safeNoteErrorMessage(error, "Note could not be updated."), true);
  }
}

function updateLibrarySuggestion(options = {}) {
  const suggestion = options.preferredSuggestion || deriveSuggestedLibraryBucket();
  const current = libraryInput.value;

  suggestionMessage.textContent = `Suggested Library: ${libraryLabel(suggestion)}`;
  if (!state.libraryManuallyChanged && !state.editingNoteId && current !== suggestion && current === defaultLibraryForCreate()) {
    libraryInput.value = suggestion;
    populateNoteCollectionOptions(suggestion);
  }
}

function deriveSuggestedLibraryBucket() {
  if (taskInput.value) {
    return "active_work";
  }

  if (clientInput.value || projectInput.value || userInput.value) {
    return "ongoing_area";
  }

  return "reference";
}

function defaultLibraryForCreate() {
  return ["active_work", "ongoing_area", "reference"].includes(state.activeBucket)
    ? state.activeBucket
    : "reference";
}

function renderEmptyList(message) {
  const empty = document.createElement("p");

  empty.className = "notes-empty-state";
  empty.textContent = message;
  notesList.replaceChildren(empty);
  syncNotesBulkToolbar();
}

async function openNoteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const noteId = params.get("note");
  if (noteId) {
    await selectNote(noteId);
    return;
  }

  const targetType = params.get("targetType") || params.get("target_type");
  const targetId = params.get("targetId") || params.get("target_id");
  if (targetType && targetId) {
    await openEditorForLinkedTarget({
      clientId: params.get("clientId") || params.get("client_id") || "",
      libraryBucket: params.get("libraryBucket") || params.get("library_bucket") || "",
      moduleId: params.get("moduleId") || params.get("module_id") || "",
      noteKind: params.get("noteKind") || params.get("note_kind") || "",
      projectId: params.get("projectId") || params.get("project_id") || "",
      targetId,
      targetType,
    });
  }
}

async function openEditorForLinkedTarget(target) {
  if (contextTargetTypeInput) {
    contextTargetTypeInput.value = target.targetType;
  }
  if (contextSearchInput) {
    contextSearchInput.value = target.targetId;
  }
  await openEditor();
  const matchedTarget = state.linkTargets.find((item) => item.targetType === target.targetType && item.targetId === target.targetId) || {
    clientId: target.clientId,
    moduleId: target.moduleId,
    projectId: target.projectId,
    targetId: target.targetId,
    targetType: target.targetType,
  };
  await applyTaskCreatedPrimaryContext(target, matchedTarget);
  stageEditorLinkTarget(matchedTarget);
  if (target.noteKind && typeInput) {
    ensureNoteKindOption(target.noteKind);
    typeInput.value = target.noteKind;
  } else if (target.targetType === "task" && typeInput) {
    typeInput.value = "log";
  }
  if (target.libraryBucket && libraryInput) {
    libraryInput.value = target.libraryBucket;
    populateNoteCollectionOptions(target.libraryBucket);
  } else if (target.targetType === "task" && libraryInput) {
    libraryInput.value = "active_work";
    populateNoteCollectionOptions("active_work");
  }
  renderEditorContextSelection(matchedTarget);
  updateLibrarySuggestion({ preferredSuggestion: matchedTarget.suggestedLibraryBucket });
}

async function applyTaskCreatedPrimaryContext(target = {}, matchedTarget = {}) {
  const targetType = target.targetType || target.target_type || "";

  if (targetType !== "task") {
    return;
  }

  const clientId = normalizeText(target.clientId || target.client_id || matchedTarget.clientId || matchedTarget.client_id);
  const projectId = normalizeText(target.projectId || target.project_id || matchedTarget.projectId || matchedTarget.project_id);

  if (!clientId && !projectId) {
    return;
  }

  setTaskCreatedPrimaryContextSummaries({ ...matchedTarget, ...target, clientId, projectId });
  await loadPrimaryContextOptions({ clientId, projectId });
  if (usesBusinessScope() && clientInput) {
    clientInput.value = clientId;
  }
  if (projectInput) {
    projectInput.value = projectId;
  }
  renderEditorContextPanel();
}

function setTaskCreatedPrimaryContextSummaries(target = {}) {
  const clientId = normalizeText(target.clientId || target.client_id);
  const projectId = normalizeText(target.projectId || target.project_id);
  const clientName = normalizeText(target.clientName || target.client_name);
  const projectName = normalizeText(target.projectName || target.project_name);
  const workspaceName = normalizeText(target.workspaceName || target.workspace_name || window.LongtailForge?.workspaceContext?.workspaceName);

  state.editorContextSummaries = {
    ...(state.editorContextSummaries || {}),
    ...(clientId ? {
      client: {
        clientId,
        label: clientName || unavailableTargetLabel("client"),
        status: target.clientStatus || target.client_status || "",
        targetId: clientId,
        targetType: "client",
      },
    } : {}),
    ...(projectId ? {
      project: {
        clientId,
        clientName,
        label: projectName || unavailableTargetLabel("project"),
        projectId,
        targetId: projectId,
        targetType: "project",
        workspaceName,
      },
    } : {}),
  };
}

function updateUrl(noteId) {
  const url = new window.URL(window.location.href);
  url.searchParams.set("note", noteId);
  if (state.selectedCollectionId) {
    url.searchParams.set("collection", state.selectedCollectionId);
  } else {
    url.searchParams.delete("collection");
  }
  window.history.replaceState({}, "", url);
}

function updateUrlCollection() {
  const url = new window.URL(window.location.href);

  if (state.selectedCollectionId) {
    url.searchParams.set("collection", state.selectedCollectionId);
  } else {
    url.searchParams.delete("collection");
  }

  window.history.replaceState({}, "", url);
}

function noteKindLabel(value) {
  return NOTE_KIND_LABELS[value] || formatToken(value);
}

function ensureNoteKindOption(value) {
  const noteKind = normalizeText(value);

  if (!typeInput || !noteKind || !LEGACY_NOTE_KINDS.has(noteKind)) {
    return;
  }
  if ([...typeInput.options].some((option) => option.value === noteKind)) {
    return;
  }

  const option = createOption(noteKind, noteKindLabel(noteKind));

  option.dataset.legacyNoteKind = "true";
  typeInput.append(option);
}

function resetLegacyNoteKindOptions() {
  typeInput?.querySelectorAll("[data-legacy-note-kind='true']").forEach((option) => option.remove());
}

function libraryLabel(value) {
  return BUCKET_LABELS[value] || formatToken(value);
}

function normalizeCollections(collections) {
  return (Array.isArray(collections) ? collections : [])
    .map((collection) => ({
      ...collection,
      note_library_collection_id: collection.note_library_collection_id || collection.id || "",
      parent_collection_id: collection.parent_collection_id || "",
      library_bucket: collection.library_bucket || "reference",
      title: collection.title || collection.name || "Collection",
      depth: Number(collection.depth || 0),
      accessibleNoteCount: Number(collection.accessibleNoteCount || collection.accessible_note_count || 0),
      directAccessibleNoteCount: Number(collection.directAccessibleNoteCount || collection.direct_accessible_note_count || 0),
    }))
    .filter((collection) => collection.note_library_collection_id)
    .sort((left, right) => (
      compareText(left.library_bucket, right.library_bucket) ||
      compareText(left.path_cache, right.path_cache) ||
      compareText(left.title, right.title)
    ));
}

function collectionsForActiveBucket() {
  if (["active_work", "ongoing_area", "reference"].includes(state.activeBucket)) {
    return state.collections.filter((collection) => collection.library_bucket === state.activeBucket);
  }

  return state.collections.filter((collection) => collection.status !== "deleted");
}

function groupCollectionsByBucket(collections) {
  const groups = new Map();

  for (const collection of collections) {
    const bucket = collection.library_bucket || "reference";
    groups.set(bucket, [...(groups.get(bucket) || []), collection]);
  }

  return [...groups.entries()].sort((left, right) => bucketSortValue(left[0]) - bucketSortValue(right[0]));
}

function groupCollectionsByParent(collections) {
  const groups = new Map();

  for (const collection of collections) {
    const parentId = collection.parent_collection_id || "";
    groups.set(parentId, [...(groups.get(parentId) || []), collection]);
  }

  for (const [parentId, children] of groups.entries()) {
    groups.set(parentId, children.sort((left, right) => compareText(left.title, right.title)));
  }

  return groups;
}

function selectedCollection() {
  if (!state.selectedCollectionId || state.selectedCollectionId === "__uncategorized") {
    return null;
  }

  return state.collections.find((collection) => collection.note_library_collection_id === state.selectedCollectionId) || null;
}

function collectionFilterOptions() {
  const controls = [
    createOption("", "All collections"),
    createOption("__uncategorized", "Uncategorized"),
  ];
  const visibleCollections = collectionsForActiveBucket().filter((collection) => collection.status !== "deleted");
  const groupedCollections = groupCollectionsByBucket(visibleCollections);

  for (const [bucket, collections] of groupedCollections) {
    const bucketOptions = hierarchicalCollectionOptions(collections);

    if (bucketOptions.length === 0) {
      continue;
    }

    if (state.activeBucket === "all" || state.activeBucket === "archive") {
      const group = document.createElement("optgroup");
      group.label = libraryLabel(bucket);
      group.append(...bucketOptions);
      controls.push(group);
    } else {
      controls.push(...bucketOptions);
    }
  }

  return controls;
}

function hierarchicalCollectionOptions(collections = []) {
  const byParent = groupCollectionsByParent(collections);

  function optionsForCollection(collection, depth = 0) {
    const option = createOption(
      collection.note_library_collection_id,
      collectionSelectLabel(collection, depth),
    );
    const children = (byParent.get(collection.note_library_collection_id) || [])
      .flatMap((child) => optionsForCollection(child, depth + 1));

    return [option, ...children];
  }

  return (byParent.get("") || []).flatMap((collection) => optionsForCollection(collection, 0));
}

function collectionSelectLabel(collection, depth = 0) {
  return `${depth > 0 ? `${"  ".repeat(depth)}- ` : ""}${collection.title || "Collection"}`;
}

function collectionFilterHasValue(select, value) {
  return [...(select?.querySelectorAll("option") || [])].some((option) => option.value === value);
}

function bucketSortValue(bucket) {
  const index = COLLECTION_BUCKET_ORDER.indexOf(bucket);
  return index === -1 ? COLLECTION_BUCKET_ORDER.length : index;
}

function collectionLabel(collectionId) {
  if (!collectionId) {
    return "";
  }

  const collection = state.collections.find((item) => item.note_library_collection_id === collectionId);
  return collection?.path_cache || collection?.title || "Archived or unavailable collection";
}

function collectionOptionLabel(collection) {
  const depth = Math.max(0, Number(collection.depth || 0));
  const prefix = depth > 0 ? `${"  ".repeat(depth)}- ` : "";
  return `${prefix}${collection.path_cache || collection.title || "Collection"}`;
}

function populateNoteCollectionOptions(libraryBucket = libraryInput?.value || defaultLibraryForCreate()) {
  if (!collectionInput) {
    return;
  }

  const previousValue = collectionInput.value;
  const options = [
    createOption("", "Uncategorized"),
    ...state.collections
      .filter((collection) => collection.library_bucket === libraryBucket && collection.status !== "archived")
      .map((collection) => createOption(collection.note_library_collection_id, collectionOptionLabel(collection))),
  ];

  collectionInput.replaceChildren(...options);
  collectionInput.value = options.some((option) => option.value === previousValue) ? previousValue : "";
}

function populateCollectionParentOptions(currentCollection = null, preferredParent = null) {
  if (!collectionParentInput) {
    return;
  }

  const libraryBucket = collectionLibraryInput?.value || currentCollection?.library_bucket || defaultLibraryForCreate();
  const excludedIds = new Set([currentCollection?.note_library_collection_id, ...collectionDescendantIds(currentCollection)]);
  const options = [
    createOption("", "Root collection"),
    ...state.collections
      .filter((collection) => (
        collection.library_bucket === libraryBucket &&
        collection.status !== "archived" &&
        !excludedIds.has(collection.note_library_collection_id)
      ))
      .map((collection) => createOption(collection.note_library_collection_id, collectionOptionLabel(collection))),
  ];

  collectionParentInput.replaceChildren(...options);
  collectionParentInput.value = preferredParent?.note_library_collection_id ||
    currentCollection?.parent_collection_id ||
    "";
  if (![...collectionParentInput.options].some((option) => option.value === collectionParentInput.value)) {
    collectionParentInput.value = "";
  }
}

function collectionDescendantIds(collection) {
  if (!collection) {
    return [];
  }

  const descendants = [];
  const byParent = groupCollectionsByParent(state.collections);
  const stack = [...(byParent.get(collection.note_library_collection_id) || [])];

  while (stack.length > 0) {
    const next = stack.shift();
    descendants.push(next.note_library_collection_id);
    stack.push(...(byParent.get(next.note_library_collection_id) || []));
  }

  return descendants;
}

function detailMetaItems(note = {}) {
  const items = [
    ["Library", libraryLabel(note.library_bucket)],
    ["Note Kind", noteKindLabel(note.note_type)],
    ["Status", formatToken(note.status)],
    ["Visibility", normalizeWorkspaceType(state.workspaceType) === "personal" ? "" : formatToken(note.visibility)],
    ["Security", formatToken(note.security_mode)],
    ["Ticket", note.ticket_id],
    ["Created", formatDate(note.created_at)],
    ["Updated", formatDate(note.updated_at)],
    ["Owner", note.owner_display_name || "Unavailable owner"],
  ].filter(([, value]) => value);

  return items.flatMap(([label, value], index) => {
    const item = document.createElement("span");
    const nodes = [];

    item.textContent = value;
    item.title = `${label}: ${value}`;
    item.setAttribute("aria-label", `${label}: ${value}`);
    nodes.push(item);
    if (index < items.length - 1) {
      nodes.push(document.createTextNode(" - "));
    }
    return nodes;
  });
}

function usesBusinessScope() {
  return normalizeWorkspaceType(state.workspaceType) === "business" && workspaceHasClientTools();
}

function normalizeWorkspaceType(value = "") {
  const normalized = normalizeText(value).toLowerCase();
  return ["business", "family", "personal"].includes(normalized) ? normalized : "";
}

function workspaceHasClientTools() {
  const context = window.LongtailForge?.workspaceContext || {};
  const tools = context.workspaceCapabilities?.availableTools || context.availableTools || [];
  return Array.isArray(tools) && tools.includes("clients_projects");
}

function emptyText(message) {
  const empty = document.createElement("p");

  empty.className = "notes-empty-state";
  empty.textContent = message;
  return empty;
}

function lockedNotice(message) {
  const notice = document.createElement("p");

  notice.className = "notes-locked-state";
  notice.textContent = message;
  return notice;
}

function statusBadge(label) {
  const badge = document.createElement("span");

  badge.className = "notes-status-badge";
  badge.textContent = label;
  return badge;
}

function tagChips(tags = [], options = {}) {
  const wrapper = document.createElement("span");
  const normalizedTags = Array.isArray(tags) ? tags : [];
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : normalizedTags.length;
  const visibleTags = normalizedTags.slice(0, limit);
  const hiddenCount = Math.max(0, normalizedTags.length - visibleTags.length);

  wrapper.className = "notes-tag-list";
  if (normalizedTags.length === 0) {
    wrapper.textContent = "No tags";
    return wrapper;
  }

  visibleTags.forEach((tag) => {
    const chip = document.createElement("span");
    const swatch = document.createElement("span");
    const label = document.createElement("span");

    chip.className = "tag-chip";
    swatch.className = "tag-chip-swatch";
    swatch.style.backgroundColor = tag.color || "#64748b";
    swatch.setAttribute("aria-hidden", "true");
    label.textContent = tag.name || tag.slug || "Tag";
    chip.append(swatch, label);
    wrapper.append(chip);
  });

  if (options.showOverflow && hiddenCount > 0) {
    const overflow = document.createElement("span");

    overflow.className = "tag-chip notes-tag-overflow";
    overflow.textContent = "...";
    overflow.title = `${hiddenCount} more ${hiddenCount === 1 ? "tag" : "tags"}`;
    wrapper.append(overflow);
  }

  return wrapper;
}

function emptyPreviewNode() {
  const empty = document.createElement("p");
  empty.textContent = "No preview.";
  return empty;
}

async function loadMarkdownRenderingPreference() {
  try {
    const settings = await api.getJson("/api/user/settings", { cache: "no-store" });
    state.openExternalLinksNewTab = settings.openExternalLinksNewTab === true;
    state.settingsLoaded = true;
    storeOpenExternalLinksPreference(state.openExternalLinksNewTab);
  } catch {
    state.settingsLoaded = false;
  }
}

function applyExternalMarkdownLinkPreference(container) {
  if (!container) {
    return;
  }

  container.querySelectorAll("a[href]").forEach((anchor) => {
    if (!isAbsoluteHttpUrl(anchor.getAttribute("href"))) {
      return;
    }

    if (state.openExternalLinksNewTab) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
    }
  });
}

function isAbsoluteHttpUrl(value = "") {
  try {
    const parsed = new window.URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readStoredOpenExternalLinksPreference() {
  return window.localStorage.getItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY) === "true";
}

function storeOpenExternalLinksPreference(value) {
  window.localStorage.setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY, value ? "true" : "false");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatToken(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value) {
  return String(value || "").trim();
}

function providerDisplayLabel(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const label = String(value);
    if (label.trim()) {
      return label;
    }
  }

  return "";
}

function isSecureNote(note) {
  return note?.security_mode === "secure";
}

function isSecureEditorMode() {
  return securityInput?.value === "secure";
}

function isSecureError(error = {}) {
  return /secure|decrypt|encrypt|cipher|crypto|key|nonce|auth|authenticate|unsupported state|payload/i.test(String(error?.message || error || ""));
}

function safeNoteErrorMessage(error = {}, fallback = "Note action failed.") {
  if (isSecureError(error)) {
    return "Secure note is locked or could not be decrypted. Check secure-note access and server key configuration.";
  }

  return error?.message || fallback;
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function createOption(value, label) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;
  return option;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error-text", isError);
}
