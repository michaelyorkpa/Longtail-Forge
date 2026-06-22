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
  collectionDialogMode: "create",
  collectionEditingId: "",
  collections: [],
  editingNoteId: "",
  editorAttachmentController: null,
  editorContextSummaries: {},
  editorNote: null,
  editorSelectedTarget: null,
  editorStagedTargets: [],
  libraryManuallyChanged: false,
  linkTargetSearchTimer: null,
  linkTargets: [],
  notes: [],
  page: 1,
  primaryContextClients: [],
  primaryContextProjects: [],
  previewRequestId: 0,
  selectedNote: null,
  selectedCollectionId: new URLSearchParams(window.location.search).get("collection") || "",
  filesDialogNoteId: "",
  tagPicker: null,
  tagsDialogNoteId: "",
  workspaceType: "",
};

buildNotesViewShell();

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
const collectionCreateButton = document.querySelector("[data-note-collection-create]");
const collectionLibraryFilter = document.querySelector("[data-note-collection-library-filter]");
const collectionActionsMount = document.querySelector("[data-note-collection-actions]");
const dialog = document.querySelector("[data-note-dialog]");
const form = document.querySelector("[data-note-form]");
const dialogTitle = document.querySelector("[data-note-dialog-title]");
const dialogCloseButton = document.querySelector("[data-note-dialog-close]");
const titleInput = document.querySelector("[data-note-title]");
const libraryInput = document.querySelector("[data-note-library]");
const collectionInput = document.querySelector("[data-note-collection]");
const typeInput = document.querySelector("[data-note-type]");
const visibilityInput = document.querySelector("[data-note-visibility]");
const securityInput = document.querySelector("[data-note-security]");
const secureWarning = document.querySelector("[data-note-secure-warning]");
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
const bodyInput = document.querySelector("[data-note-body]");
const markdownEditor = document.querySelector("[data-note-markdown-editor]");
const previewToggle = document.querySelector("[data-note-preview-toggle]");
const preview = document.querySelector("[data-note-preview]");
const formStatus = document.querySelector("[data-note-form-status]");
const cancelButton = document.querySelector("[data-note-cancel]");
const saveButton = document.querySelector("[data-note-save]");
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

const editor = window.LongtailForge.notesEditor?.createPlainTextarea(bodyInput);

createButton?.addEventListener("click", () => openEditor());
collectionCreateButton?.addEventListener("click", () => openCollectionDialog("create"));
collectionLibraryFilter?.addEventListener("change", () => selectBucket(collectionLibraryFilter.value));
collectionFilter?.addEventListener("change", () => selectCollection(collectionFilter.value));
filtersForm?.addEventListener("change", () => {
  state.page = 1;
  state.selectedCollectionId = collectionFilter?.value || "";
  updateCollectionPanelSelection();
  updateUrlCollection();
  renderNotes();
});
sortSelect?.addEventListener("change", () => {
  state.page = 1;
  renderNotes();
});
prevButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  state.page = Math.max(1, state.page - 1);
  renderNotes();
});
nextButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  state.page += 1;
  renderNotes();
});
form?.addEventListener("submit", saveNote);
dialogCloseButton?.addEventListener("click", closeEditor);
cancelButton?.addEventListener("click", closeEditor);
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
contextSearchInput?.addEventListener("input", () => queueEditorLinkTargetSearch());
contextApplyButton?.addEventListener("click", () => applyEditorLinkTarget());
document.querySelector("[data-note-editor-toolbar]")?.addEventListener("click", handleEditorCommand);
tagsToggle?.addEventListener("click", openTagsDialog);
tagsDialogCloseButton?.addEventListener("click", closeTagsDialog);
tagsDialog?.addEventListener("close", handleTagsDialogClose);
filesToggle?.addEventListener("click", openFilesDialog);
filesDialogCloseButton?.addEventListener("click", closeFilesDialog);
filesDialog?.addEventListener("close", handleFilesDialogClose);

initialize();

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
  document.body.append(createNoteDialogShell(), createNoteTagsDialogShell(), createNoteFilesDialogShell(), createCollectionDialogShell());
}

function registerNotesViewBehaviors() {
  if (typeof view.registerBehavior !== "function") {
    return;
  }
  view.registerBehavior("notes.create", () => openEditor());
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

function notesViewSurfaceDescriptor() {
  const surfaces = window.LongtailForge?.workspaceContext?.viewSurfaces || [];
  return surfaces.find((surface) => surface.id === "notes.workspace" && surface.moduleId === "notes")
    || fallbackNotesViewSurfaceDescriptor();
}

function fallbackNotesViewSurfaceDescriptor() {
  return {
    id: "notes.workspace",
    moduleId: "notes",
    viewId: "notes",
    layout: "stacked",
    pageHeader: {
      title: "Notes",
      primaryAction: {
        id: "create-note",
        label: "Create Note",
        role: "primary",
        behavior: "notes.create",
      },
    },
    filters: [
      notesDescriptorSelect("status", "Status", [["active", "Active", true], ["pinned", "Pinned"], ["archived", "Archived"], ["all", "All visible"]]),
      notesDescriptorSelect("visibility", "Visibility", [["all", "All visible", true], ["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"]]),
      notesDescriptorSelect("security", "Security", [["all", "All", true], ["normal", "Normal"], ["secure", "Secure"]]),
      notesDescriptorSelect("noteType", "Note Kind", [["all", "All kinds", true], ...Object.entries(NOTE_KIND_LABELS).filter(([value]) => !LEGACY_NOTE_KINDS.has(value)).map(([value, label]) => [value, label])]),
      { id: "context-filter", field: "context", type: "search", label: "Context" },
      { id: "owner-filter", field: "owner", type: "search", label: "Owner" },
      { id: "tags-filter", field: "tags", type: "search", label: "Tags" },
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
          { id: "note-visibility", field: "visibility", type: "select", label: "Visibility", options: [["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"]] },
          { id: "note-security", field: "security", type: "select", label: "Security", options: [["normal", "Normal"], ["secure", "Secure"]] },
        ],
        footerActions: [
          { id: "cancel-note", label: "Cancel", role: "secondary", behavior: "notes.editor.cancel" },
          { id: "save-note", label: "Save Note", role: "primary", behavior: "notes.editor.save" },
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

  const indexPanel = surface.querySelector(".view-collapsible-index");
  indexPanel?.classList.add("notes-index-panel");
  const summary = indexPanel?.querySelector("summary");
  if (summary) {
    const summaryTitle = summary.querySelector(".view-collapsible-index-title") || summary;
    summaryTitle.textContent = "Notes List";
  }
  const indexBody = indexPanel?.querySelector(".view-collapsible-index-body");
  indexBody?.replaceChildren(createNotesListChrome());
  // Pagination sits in a framework footer slot at the bottom of the Notes List panel (below the
  // scrollable body), so it hides natively when the panel is collapsed.
  if (indexPanel) {
    indexPanel.appendChild(view.createElement("div", {
      className: "view-collapsible-index-footer notes-list-panel-footer",
      children: [createNotesListSortControl(), createNotesPagination()],
    }));
  }
  indexPanel?.before(createNotesLibraryPanel());

  const detail = surface.querySelector(".view-stacked-detail");
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

function createNotesLibraryPanel() {
  const panel = view.createCollapsibleIndexPanel({
    title: "Library",
    className: "notes-library-panel view-collapsible-index--unscrolled",
    children: [createNotesLibraryChrome()],
  });
  panel.open = true;
  return panel;
}

function createNotesLibraryChrome() {
  const wrap = view.createElement("div", { className: "notes-library-chrome" });

  const collections = view.createElement("section", {
    className: "notes-collections-panel",
    attrs: { "aria-label": "Notes Collections" },
  });
  collections.dataset.notesCollectionsPanel = "";

  // One tight row: Library dropdown (bucket selector, incl. Archive), Collection dropdown, the selected
  // collection's actions menu, and the New Collection icon button. The legacy bucket-tab buttons are
  // retired — the Library dropdown is the sole bucket selector.
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

  const collectionCreate = notesIconButton({
    icon: "library-add",
    label: "New collection",
    title: "New collection",
  });
  collectionCreate.dataset.noteCollectionCreate = "";

  const pickerRow = view.createElement("div", {
    className: "notes-collection-picker-row",
    children: [libraryLabel, collectionLabel, collectionActions, collectionCreate],
  });
  collections.appendChild(pickerRow);
  wrap.appendChild(collections);
  return wrap;
}

function createNotesListChrome() {
  const wrap = view.createElement("div", { className: "notes-index-chrome" });
  const list = view.createElement("div", { className: "notes-list" });
  list.dataset.notesList = "";
  wrap.appendChild(list);

  return wrap;
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
  const panel = view.createElement("details", { className: "notes-context-panel" });
  panel.appendChild(view.createElement("summary", { text: "Linked Context" }));

  const picker = view.createLinkedContextPicker({
    providers: linkTargetProviderOptions(),
    records: [],
    linkedItems: [],
    emptyMessage: notesLinkedRecordsDescriptor().emptyState?.message || "No linked context.",
    onRemove: handleEditorLinkedContextRemove,
  });
  picker.dataset.noteContextPicker = "";
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
      view.createElement("h3", { text: "Primary Context" }),
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
  const cancel = view.createActionButton({ label: "Cancel", role: "secondary" });
  cancel.dataset.noteCancel = "";
  const save = view.createActionButton({ label: modal.footerActions?.find((action) => action.id === "save-note")?.label || "Save Note", type: "submit", role: "primary" });
  save.dataset.noteSave = "";

  // Tags and Files live behind footer utility buttons (Tasks-modal pattern) and open stacked child dialogs.
  const tagsToggle = view.createActionButton({ icon: "tag", iconOnly: true, label: "Tags", title: "Tags", role: "utility" });
  tagsToggle.dataset.noteTagsToggle = "";
  tagsToggle.setAttribute("aria-expanded", "false");
  const filesToggle = view.createActionButton({ icon: "file", iconOnly: true, label: "Files", title: "Files", role: "utility" });
  filesToggle.dataset.noteFilesToggle = "";
  filesToggle.setAttribute("aria-expanded", "false");

  const dialog = view.renderDescriptorModalForm(modal, {
    title: modal.title || "Note",
    className: "notes-editor-dialog",
    formClassName: "notes-editor-form",
    size: "wide",
    fields: [],
    actions: [cancel, save],
    utilityActions: [tagsToggle, filesToggle],
  });
  dialog.dataset.noteDialog = "";
  const form = dialog.viewParts.form;
  form.dataset.noteForm = "";
  dialog.viewParts.title.dataset.noteDialogTitle = "";
  dialog.viewParts.body.remove();

  const close = view.createActionButton({ label: "Close", className: "notes-dialog-close" });
  close.dataset.noteDialogClose = "";
  const heading = view.createElement("div", { className: "notes-dialog-heading", children: [dialog.viewParts.title, close] });

  const titleField = noteFieldLabel("Title", noteInput("noteTitle", { type: "text", required: true }));
  const selectGrid = view.createElement("div", {
    className: "notes-form-grid",
    children: [
      noteFieldLabel("Library", noteSelect("noteLibrary", modalFieldOptions(modal, "library"))),
      noteFieldLabel("Collection", noteSelect("noteCollection", modalFieldOptions(modal, "collection"))),
      noteFieldLabel("Note Kind", noteSelect("noteType", modalFieldOptions(modal, "noteType"))),
      noteFieldLabel("Visibility", noteSelect("noteVisibility", modalFieldOptions(modal, "visibility").filter(([value]) => value !== "client_visible"))),
      noteFieldLabel("Security", noteSelect("noteSecurity", modalFieldOptions(modal, "security"))),
    ],
  });
  const primaryContext = createPrimaryContextSection();
  // Group the note "Details" fields into a collapsible section (openEditor opens it for Add, closes for Edit).
  const detailsGroup = view.createElement("details", {
    className: "notes-detail-group",
    children: [view.createElement("summary", { text: "Note Details" }), selectGrid, primaryContext],
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
  const heading = view.createElement("div", { className: "notes-dialog-heading", children: [dialog.viewParts.title, close] });

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

async function initialize() {
  setStatus("Loading notes...");

  try {
    await window.LongtailForge.workspaceContextReady;
    applyWorkspaceContext();
    await Promise.all([loadTags(), loadCollections(), loadNotes()]);
    renderCollections();
    populateCollectionFilter();
    renderNotes();
    await openNoteFromUrl();
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

function applyWorkspaceContext() {
  const context = window.LongtailForge?.workspaceContext || {};
  state.workspaceType = normalizeWorkspaceType(context.workspaceType || context.workspace_type || "");
  populateWorkspaceVisibilityOptions();
  populateLinkTargetTypeSelect(contextTargetTypeInput);
  updatePrimaryContextVisibility();
}

async function loadNotes() {
  const url = state.activeBucket === "archive"
    ? "/api/notes/archive"
    : state.activeBucket === "all"
      ? "/api/notes"
      : `/api/notes/library/${encodeURIComponent(state.activeBucket)}`;
  const result = await api.getJson(url, { cache: "no-store" });
  state.notes = result.notes || [];
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
  state.selectedNote = null;
  state.selectedCollectionId = "";
  setStatus("Loading notes...");

  try {
    await Promise.all([loadCollections(), loadNotes()]);
    renderCollections();
    populateCollectionFilter();
    renderNotes();
    renderDetailPrompt("Select a note.");
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

function renderNotes() {
  const notes = sortedNotes(filteredNotes());
  const totalPages = Math.max(1, Math.ceil(notes.length / PAGE_SIZE));

  state.page = Math.min(state.page, totalPages);
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageNotes = notes.slice(pageStart, pageStart + PAGE_SIZE);

  pageLabel.textContent = `Page ${state.page} of ${totalPages}`;
  prevButton.disabled = state.page <= 1;
  nextButton.disabled = state.page >= totalPages;

  if (pageNotes.length === 0) {
    renderEmptyList("No notes match the current filters.");
    return;
  }

  notesList.replaceChildren(...pageNotes.map(noteListItem));
}

function renderCollections() {
  if (!collectionPanel || !collectionFilter) {
    return;
  }

  if (state.activeBucket === "archive") {
    collectionPanel.hidden = false;
    collectionCreateButton.hidden = true;
  } else {
    collectionPanel.hidden = false;
    collectionCreateButton.hidden = false;
  }

  if (collectionLibraryFilter) {
    collectionLibraryFilter.value = ["active_work", "ongoing_area", "reference", "archive"].includes(state.activeBucket)
      ? state.activeBucket
      : "all";
  }
  populateCollectionFilter();
  updateCollectionPanelSelection();
}

function collectionActions(collection) {
  if (!collection || state.activeBucket === "archive") {
    const disabled = document.createElement("button");

    disabled.type = "button";
    disabled.className = "notes-collection-actions-disabled";
    disabled.textContent = "...";
    disabled.disabled = true;
    disabled.title = "Select a collection to manage it.";
    return disabled;
  }

  const child = actionButton("+", () => openCollectionDialog("create", { parent: collection }));
  const edit = actionButton("Edit", () => openCollectionDialog("edit", { collection }));
  const archive = actionButton("Archive", () => archiveCollection(collection));
  const remove = actionButton("Delete Empty", () => deleteEmptyCollection(collection));

  child.title = "Create child collection";
  edit.title = "Rename or move collection";
  archive.title = "Archive collection";
  remove.title = "Delete empty collection";

  const summary = view.createElement("summary", { text: "...", attrs: { title: "Collection actions" } });
  const menu = view.createElement("span", { className: "notes-collection-actions-menu", children: [child, edit, archive, remove] });
  return view.createElement("details", { className: "notes-collection-actions", children: [summary, menu] });
}

function selectCollection(collectionId) {
  state.selectedCollectionId = collectionId || "";
  state.page = 1;
  if (collectionFilter) {
    collectionFilter.value = state.selectedCollectionId;
  }
  updateCollectionPanelSelection();
  updateUrlCollection();
  renderNotes();
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

function filteredNotes() {
  const statusValue = statusFilter?.value || "active";
  const visibilityValue = visibilityFilter?.value || "all";
  const securityValue = securityFilter?.value || "all";
  const typeValue = typeFilter?.value || "all";
  const contextValue = normalizeText(contextFilter?.value).toLowerCase();
  const ownerValue = normalizeText(ownerFilter?.value).toLowerCase();
  const tagValue = normalizeText(tagFilter?.value).toLowerCase();
  const updatedValue = updatedFilter?.value || "";
  const collectionValue = state.selectedCollectionId || collectionFilter?.value || "";
  const collectionIds = collectionFilterIds(collectionValue);

  return state.notes.filter((note) => {
    const statusMatch = statusValue === "all" ||
      (statusValue === "active" ? !["archived", "deleted"].includes(note.status) : note.status === statusValue);
    const visibilityMatch = visibilityValue === "all" || note.visibility === visibilityValue;
    const securityMatch = securityValue === "all" || note.security_mode === securityValue;
    const typeMatch = typeValue === "all" || note.note_type === typeValue;
    const contextText = [note.client_id, note.project_id, note.task_id, note.ticket_id, note.linked_user_id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const contextMatch = !contextValue || contextText.includes(contextValue);
    const ownerMatch = !ownerValue || normalizeText(note.owner_user_id).toLowerCase().includes(ownerValue);
    const tagMatch = !tagValue ||
      (isNoTagsFilterValue(tagValue)
        ? (note.tags || []).length === 0
        : (note.tags || []).some((tag) => [
            tag.name,
            tag.slug,
            tag.description,
          ].filter(Boolean).join(" ").toLowerCase().includes(tagValue)));
    const updatedMatch = !updatedValue || String(note.updated_at || "").slice(0, 10) >= updatedValue;
    const collectionMatch = !collectionValue ||
      (collectionValue === "__uncategorized" ? !note.note_collection_id : collectionIds.has(note.note_collection_id));

    return statusMatch && visibilityMatch && securityMatch && typeMatch && contextMatch && ownerMatch && tagMatch && updatedMatch && collectionMatch;
  });
}

function sortedNotes(notes) {
  const sortValue = sortSelect?.value || DEFAULT_NOTE_SORT;
  const sorted = [...notes];

  sorted.sort((left, right) => {
    if (sortValue === "title_asc") {
      return compareText(left.title, right.title) || compareNoteId(left, right);
    }
    if (sortValue === "title_desc") {
      return compareText(right.title, left.title) || compareNoteId(left, right);
    }
    if (sortValue === "created_desc") {
      return compareText(right.created_at, left.created_at) || compareNoteTitleThenId(left, right);
    }
    if (sortValue === "created_asc") {
      return compareText(left.created_at, right.created_at) || compareNoteTitleThenId(left, right);
    }
    if (sortValue === "updated_asc") {
      return compareText(left.updated_at, right.updated_at) || compareNoteTitleThenId(left, right);
    }
    if (sortValue === "library_collection_updated_desc") {
      return compareNumber(bucketSortValue(left.library_bucket), bucketSortValue(right.library_bucket)) ||
        compareText(collectionLabel(left.note_collection_id), collectionLabel(right.note_collection_id)) ||
        compareNoteUpdatedDesc(left, right);
    }
    if (sortValue === "note_kind_updated_desc") {
      return compareText(noteKindLabel(left.note_type), noteKindLabel(right.note_type)) ||
        compareNoteUpdatedDesc(left, right);
    }
    if (sortValue === "primary_context_updated_desc") {
      return compareText(primaryContextSortKey(left), primaryContextSortKey(right)) ||
        compareNoteUpdatedDesc(left, right);
    }

    return compareNoteUpdatedDesc(left, right);
  });

  return sorted;
}

function noteListItem(note) {
  const button = document.createElement("button");
  const heading = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  const footer = document.createElement("span");
  const chipStrip = tagChips(note.tags || [], { limit: 2, showOverflow: true });

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
  return button;
}

async function selectNote(noteId) {
  setStatus("Loading note...");

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });
    state.selectedNote = result.note;
    renderDetail(result.note);
    renderNotes();
    collapseNotesNavigationPanels();
    updateUrl(noteId);
    setStatus("");
  } catch (error) {
    const message = safeNoteErrorMessage(error, "Note could not be loaded.");
    renderDetailPrompt(message, { locked: isSecureError(error) });
    setStatus(message, true);
  }
}

function collapseNotesNavigationPanels() {
  document.querySelector(".notes-library-panel")?.removeAttribute("open");
  document.querySelector(".notes-index-panel")?.removeAttribute("open");
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
  prompt.textContent = message;
  detailPanel.replaceChildren(prompt);
}

async function openEditor(note = null) {
  note = await hydrateEditorNote(note);
  state.editingNoteId = note?.note_id || "";
  state.editorNote = note;
  state.editorSelectedTarget = null;
  state.editorStagedTargets = [];
  state.libraryManuallyChanged = false;
  dialogTitle.textContent = note ? "Edit Note" : "Create Note";
  titleInput.value = note?.title || "";
  libraryInput.value = note?.library_bucket || state.activeBucketForCreate || defaultLibraryForCreate();
  populateNoteCollectionOptions(note?.library_bucket || libraryInput.value);
  collectionInput.value = note?.note_collection_id || "";
  if (collectionInput.value && ![...collectionInput.options].some((option) => option.value === collectionInput.value)) {
    collectionInput.value = "";
  }
  resetLegacyNoteKindOptions();
  ensureNoteKindOption(note?.note_type);
  typeInput.value = note?.note_type || "general";
  populateWorkspaceVisibilityOptions(note?.visibility || "internal");
  securityInput.value = note?.security_mode || "normal";
  securityInput.disabled = Boolean(note);
  updateSecureUiState();
  const selectedClientId = note?.client_id || "";
  const selectedProjectId = note?.project_id || "";
  clientInput.value = selectedClientId;
  projectInput.value = selectedProjectId;
  taskInput.value = note?.task_id || "";
  userInput.value = note?.linked_user_id || "";
  state.editorContextSummaries = note?.linked_context || {};
  await loadPrimaryContextOptions({
    clientId: selectedClientId,
    projectId: selectedProjectId,
  });
  editor?.setValue(note?.body_markdown || "");
  bodyInput.value = note?.body_markdown || "";
  preview.hidden = true;
  previewToggle.setAttribute("aria-pressed", "false");
  updatePreviewLayoutState(false);
  formStatus.textContent = "";
  saveButton.disabled = false;
  resetNoteEditorPanels();
  if (detailsGroup) {
    detailsGroup.open = !note;
  }
  await mountTagEditor(note);
  mountNoteEditorFiles(note);
  renderEditorContextSelection();
  await loadEditorLinkTargets();
  updateLibrarySuggestion();
  view.showModal(dialog);
  titleInput.focus();
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
  return modalFieldOptions(notesEditorModalDescriptor(), "visibility")
    .filter(([value]) => value !== "client_visible" || usesBusinessScope());
}

function closeEditor() {
  state.editorNote = null;
  state.editorSelectedTarget = null;
  state.editorStagedTargets = [];
  state.filesDialogNoteId = "";
  state.tagsDialogNoteId = "";
  view.closeModal(dialog);
}

async function saveNote(event) {
  event.preventDefault();
  saveButton.disabled = true;
  formStatus.textContent = "Saving note...";

  try {
    const payload = readEditorPayload();
    const result = state.editingNoteId
      ? await api.putJson(`/api/notes/${encodeURIComponent(state.editingNoteId)}`, payload)
      : await api.postJson("/api/notes", payload);
    await Promise.all([loadCollections(), loadNotes()]);
    closeEditor();
    await selectNote(result.note.note_id);
    formStatus.textContent = "";
  } catch (error) {
    formStatus.textContent = safeNoteErrorMessage(error, "Note could not be saved.");
    saveButton.disabled = false;
  }
}

function readEditorPayload() {
  return {
    title: titleInput.value,
    body_markdown: editor?.getValue() || bodyInput.value,
    library_bucket: libraryInput.value,
    noteCollectionId: collectionInput.value || null,
    note_type: typeInput.value,
    visibility: readEditorVisibility(),
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
  return !usesBusinessScope() && visibilityInput.value === "client_visible"
    ? "internal"
    : visibilityInput.value;
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

    const selectedProject = findPrimaryContextProject(selectedProjectId) || primaryContextSummaryForSelection("project", selectedProjectId);
    const derivedClientId = usesBusinessScope() ? selectedProject?.clientId || selectedClientId || "" : "";
    populatePrimaryClientOptions(derivedClientId);
    populatePrimaryProjectOptions(selectedProjectId);
  } catch {
    state.primaryContextClients = [];
    state.primaryContextProjects = [];
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

async function fetchLinkTargets({ targetType = "all", search = "", limit = 20 } = {}) {
  const params = new URLSearchParams({
    targetType,
    limit: String(limit),
  });

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
  view.showModal(collectionDialog);
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
    formatToken(revision.visibility),
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

function collectionFilterIds(collectionId) {
  if (!collectionId || collectionId === "__uncategorized") {
    return new Set();
  }

  const byParent = groupCollectionsByParent(collectionsForActiveBucket());
  const ids = new Set([collectionId]);
  const stack = [...(byParent.get(collectionId) || [])];

  while (stack.length > 0) {
    const collection = stack.shift();
    ids.add(collection.note_library_collection_id);
    stack.push(...(byParent.get(collection.note_library_collection_id) || []));
  }

  return ids;
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

function actionButton(label, handler) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function detailMetaItems(note = {}) {
  const items = [
    ["Library", libraryLabel(note.library_bucket)],
    ["Note Kind", noteKindLabel(note.note_type)],
    ["Status", formatToken(note.status)],
    ["Visibility", formatToken(note.visibility)],
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

function isNoTagsFilterValue(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, "_");
  return [
    window.LongtailForge?.tags?.NO_TAGS_FILTER_VALUE || "__no_tags__",
    "__no_effective_tags__",
    "no_tags",
    "none",
  ].includes(normalized);
}

function emptyPreviewNode() {
  const empty = document.createElement("p");
  empty.textContent = "No preview.";
  return empty;
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

function compareNumber(left, right) {
  return Number(left || 0) - Number(right || 0);
}

function compareNoteUpdatedDesc(left = {}, right = {}) {
  return compareText(right.updated_at, left.updated_at) || compareNoteTitleThenId(left, right);
}

function compareNoteTitleThenId(left = {}, right = {}) {
  return compareText(left.title, right.title) || compareNoteId(left, right);
}

function compareNoteId(left = {}, right = {}) {
  return compareText(left.note_id, right.note_id);
}

function primaryContextSortKey(note = {}) {
  const context = note.linked_context || {};
  const clientLabel = context.client?.label || note.client_name || note.client_id || "";
  const projectLabel = context.project?.label || note.project_name || note.project_id || "";

  return [clientLabel, projectLabel].filter(Boolean).join(" / ") || "zz";
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
