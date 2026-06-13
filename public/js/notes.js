const api = window.LongtailForge.api;
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
const LINK_TARGET_TYPE_LABELS = {
  workspace: "Workspace",
  client: "Client",
  project: "Project",
  task: "Task",
  user: "User",
};

const statusMessage = document.querySelector("[data-notes-status]");
const bucketTabs = [...document.querySelectorAll("[data-notes-bucket]")];
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
const listTitle = document.querySelector("[data-notes-list-title]");
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
const contextSelectedMessage = document.querySelector("[data-note-context-selected]");
const clientInput = document.querySelector("[data-note-client-id]");
const projectInput = document.querySelector("[data-note-project-id]");
const taskInput = document.querySelector("[data-note-task-id]");
const userInput = document.querySelector("[data-note-user-id]");
const suggestionMessage = document.querySelector("[data-note-library-suggestion]");
const tagsEditor = document.querySelector("[data-note-tags-editor]");
const bodyInput = document.querySelector("[data-note-body]");
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

let state = {
  activeBucket: "all",
  availableTags: [],
  attachmentController: null,
  collectionDialogMode: "create",
  collectionEditingId: "",
  collections: [],
  editingNoteId: "",
  editorSelectedTarget: null,
  libraryManuallyChanged: false,
  linkTargetSearchTimer: null,
  linkTargets: [],
  notes: [],
  page: 1,
  selectedNote: null,
  selectedCollectionId: new URLSearchParams(window.location.search).get("collection") || "",
  tagPicker: null,
};

createButton?.addEventListener("click", () => openEditor());
collectionCreateButton?.addEventListener("click", () => openCollectionDialog("create"));
bucketTabs.forEach((button) => button.addEventListener("click", () => selectBucket(button.dataset.notesBucket)));
collectionLibraryFilter?.addEventListener("change", () => selectBucket(collectionLibraryFilter.value === "all" ? "all" : collectionLibraryFilter.value));
collectionFilter?.addEventListener("change", () => selectCollection(collectionFilter.value));
filtersForm?.addEventListener("change", () => {
  state.page = 1;
  state.selectedCollectionId = collectionFilter?.value || "";
  updateCollectionPanelSelection();
  updateUrlCollection();
  renderNotes();
});
sortSelect?.addEventListener("change", renderNotes);
prevButton?.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  renderNotes();
});
nextButton?.addEventListener("click", () => {
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
[clientInput, projectInput, taskInput, userInput].forEach((input) => input?.addEventListener("input", updateLibrarySuggestion));
contextTargetTypeInput?.addEventListener("change", () => loadEditorLinkTargets());
contextSearchInput?.addEventListener("input", () => queueEditorLinkTargetSearch());
contextApplyButton?.addEventListener("click", () => applyEditorLinkTarget());
document.querySelector("[data-note-editor-toolbar]")?.addEventListener("click", handleEditorCommand);

initialize();

async function initialize() {
  setStatus("Loading notes...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await Promise.all([loadTags(), loadCollections(), loadNotes()]);
    renderCollections();
    populateCollectionFilter();
    renderNotes();
    openNoteFromUrl();
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
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
  updateBucketTabs();
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

function updateBucketTabs() {
  bucketTabs.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.notesBucket === state.activeBucket));
  });
}

function renderNotes() {
  const notes = sortedNotes(filteredNotes());
  const totalPages = Math.max(1, Math.ceil(notes.length / PAGE_SIZE));

  state.page = Math.min(state.page, totalPages);
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const pageNotes = notes.slice(pageStart, pageStart + PAGE_SIZE);

  listTitle.textContent = bucketTitle();
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
    collectionLibraryFilter.value = ["active_work", "ongoing_area", "reference"].includes(state.activeBucket)
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

  const actions = document.createElement("details");
  const summary = document.createElement("summary");
  const menu = document.createElement("span");
  const child = actionButton("+", () => openCollectionDialog("create", { parent: collection }));
  const edit = actionButton("Edit", () => openCollectionDialog("edit", { collection }));
  const archive = actionButton("Archive", () => archiveCollection(collection));
  const remove = actionButton("Delete Empty", () => deleteEmptyCollection(collection));

  actions.className = "notes-collection-actions";
  summary.textContent = "...";
  summary.title = "Collection actions";
  menu.className = "notes-collection-actions-menu";
  child.title = "Create child collection";
  edit.title = "Rename or move collection";
  archive.title = "Archive collection";
  remove.title = "Delete empty collection";
  menu.append(child, edit, archive, remove);
  actions.append(summary, menu);
  return actions;
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
  const sortValue = sortSelect?.value || "updated_desc";
  const sorted = [...notes];

  sorted.sort((left, right) => {
    if (sortValue === "created_desc") {
      return compareText(right.created_at, left.created_at);
    }
    if (sortValue === "title_asc") {
      return compareText(left.title, right.title);
    }
    if (sortValue === "library_asc") {
      return compareText(left.library_bucket, right.library_bucket) || compareText(left.title, right.title);
    }
    if (sortValue === "type_asc") {
      return compareText(left.note_type, right.note_type) || compareText(left.title, right.title);
    }

    return compareText(right.updated_at, left.updated_at);
  });

  return sorted;
}

function noteListItem(note) {
  const button = document.createElement("button");
  const heading = document.createElement("span");
  const title = document.createElement("strong");
  const badges = document.createElement("span");
  const meta = document.createElement("span");
  const excerpt = document.createElement("span");
  const footer = document.createElement("span");

  button.type = "button";
  button.className = "notes-list-item";
  if (isSecureNote(note)) {
    button.classList.add("is-secure");
  }
  button.setAttribute("aria-pressed", String(state.selectedNote?.note_id === note.note_id));
  button.addEventListener("click", () => selectNote(note.note_id));

  heading.className = "notes-list-heading";
  title.textContent = note.title || "Untitled note";
  badges.className = "notes-list-badges";
  if (isSecureNote(note)) {
    badges.append(statusBadge("Secure"));
  }
  meta.className = "notes-list-meta";
  meta.textContent = [
    libraryLabel(note.library_bucket),
    collectionLabel(note.note_collection_id),
    noteKindLabel(note.note_type),
    formatToken(note.status),
  ].filter(Boolean).join(" - ");
  heading.append(title, badges, meta);

  excerpt.className = "notes-list-excerpt";
  excerpt.textContent = isSecureNote(note) ? "Secure note body hidden from previews." : note.body_excerpt || "";
  footer.className = "notes-list-footer";
  footer.textContent = [
    formatToken(note.visibility),
    formatToken(note.security_mode),
    formatDate(note.updated_at),
  ].filter(Boolean).join(" - ");

  button.append(heading, excerpt, footer, tagChips(note.tags || []));
  return button;
}

async function selectNote(noteId) {
  setStatus("Loading note...");

  try {
    const result = await api.getJson(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" });
    state.selectedNote = result.note;
    renderDetail(result.note);
    renderNotes();
    updateUrl(noteId);
    setStatus("");
  } catch (error) {
    const message = safeNoteErrorMessage(error, "Note could not be loaded.");
    renderDetailPrompt(message, { locked: isSecureError(error) });
    setStatus(message, true);
  }
}

function renderDetail(note) {
  const header = document.createElement("header");
  const titleRow = document.createElement("div");
  const title = document.createElement("h2");
  const titleRule = document.createElement("hr");
  const meta = document.createElement("p");
  const edit = actionButton("Edit", () => openEditor(note));
  const archiveOrRestore = note.status === "archived"
    ? actionButton("Restore", () => restoreNote(note))
    : actionButton("Archive", () => archiveNote(note));
  const body = document.createElement("div");
  const tags = document.createElement("div");
  const tagsRule = document.createElement("hr");
  const collectionBreadcrumb = document.createElement("p");
  const context = document.createElement("dl");
  const links = renderLinksPanel(note);
  const files = renderFilesPanel(note);
  const revisions = renderRevisionsPanel(note);

  header.className = "notes-detail-header";
  titleRow.className = "notes-detail-title-row";
  title.textContent = note.title || "Untitled note";
  titleRule.className = "notes-detail-rule";
  meta.className = "notes-detail-meta";
  meta.append(...detailMetaItems(note));
  if (note.status === "archived") {
    edit.disabled = true;
    edit.title = "Restore archived notes before editing.";
  }
  titleRow.append(title, detailActionsMenu([edit, archiveOrRestore]));
  header.append(titleRow, titleRule, meta);
  if (isSecureNote(note)) {
    const warning = document.createElement("p");
    warning.className = "notes-secure-warning";
    warning.textContent = note.secure_title_warning || "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.";
    header.append(warning);
  }
  collectionBreadcrumb.className = "notes-collection-breadcrumb";
  collectionBreadcrumb.textContent = `Collection: ${collectionLabel(note.note_collection_id) || "Uncategorized"}`;

  body.className = "notes-rendered-body";
  body.innerHTML = note.body_html || "";
  if (!body.textContent.trim() && !note.body_html) {
    body.textContent = isSecureNote(note) ? "Secure note body is locked or unavailable." : "No body.";
  }

  tags.className = "notes-detail-tags";
  tags.append(tagChips(note.tags || []));
  tagsRule.className = "notes-detail-rule";

  context.className = "notes-context-list";
  addLinkedContext(context, "Client", note.linked_context?.client, note.client_id);
  addLinkedContext(context, "Project", note.linked_context?.project, note.project_id);
  addLinkedContext(context, "Task", note.linked_context?.task, note.task_id);
  addContext(context, "Ticket", note.ticket_id);
  addLinkedContext(context, "User", note.linked_context?.user, note.linked_user_id);
  addContext(context, "Created", formatDate(note.created_at));
  addContext(context, "Updated", formatDate(note.updated_at));
  addContext(context, "Owner", note.owner_user_id);

  detailPanel.replaceChildren(header, collectionBreadcrumb, tags, tagsRule, body, context, links, files, revisions);
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
  state.editingNoteId = note?.note_id || "";
  state.editorSelectedTarget = null;
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
  visibilityInput.value = note?.visibility || "internal";
  securityInput.value = note?.security_mode || "normal";
  securityInput.disabled = Boolean(note);
  updateSecureUiState();
  clientInput.value = note?.client_id || "";
  projectInput.value = note?.project_id || "";
  taskInput.value = note?.task_id || "";
  userInput.value = note?.linked_user_id || "";
  editor?.setValue(note?.body_markdown || "");
  bodyInput.value = note?.body_markdown || "";
  preview.hidden = true;
  previewToggle.setAttribute("aria-pressed", "false");
  formStatus.textContent = "";
  saveButton.disabled = false;
  await mountTagEditor(note);
  renderEditorContextSelection();
  await loadEditorLinkTargets();
  updateLibrarySuggestion();
  dialog.showModal();
  titleInput.focus();
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
}

function updateSecureVisibilityOptions(secureMode = false) {
  if (!visibilityInput) {
    return;
  }

  const clientVisibleOption = [...visibilityInput.options].find((option) => option.value === "client_visible");
  if (!clientVisibleOption) {
    return;
  }

  clientVisibleOption.disabled = secureMode;
  clientVisibleOption.hidden = secureMode;
  if (secureMode && visibilityInput.value === "client_visible") {
    visibilityInput.value = "internal";
  }
}

function closeEditor() {
  dialog.close();
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
    if (state.editingNoteId && state.editorSelectedTarget && !noteHasLink(result.note, state.editorSelectedTarget)) {
      await api.postJson(`/api/notes/${encodeURIComponent(result.note.note_id)}/links`, linkPayloadFromTarget(state.editorSelectedTarget));
    }

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
    visibility: visibilityInput.value,
    security_mode: securityInput.value,
    tagIds: state.tagPicker?.readTagIds?.() || [],
    client_id: normalizeText(clientInput.value) || null,
    project_id: normalizeText(projectInput.value) || null,
    task_id: normalizeText(taskInput.value) || null,
    linked_user_id: normalizeText(userInput.value) || null,
    links: !state.editingNoteId && state.editorSelectedTarget ? [linkPayloadFromTarget(state.editorSelectedTarget)] : [],
  };
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
  contextResultsInput.replaceChildren(new window.Option("Loading records...", ""));

  try {
    const targets = await fetchLinkTargets({
      targetType: contextTargetTypeInput?.value || "workspace",
      search: contextSearchInput?.value || "",
      limit: 40,
    });
    state.linkTargets = targets;
    populateLinkTargetSelect(contextResultsInput, targets);
  } catch {
    state.linkTargets = [];
    contextResultsInput.replaceChildren(new window.Option("No records available", ""));
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
  const options = targets.map((target) => {
    const option = new window.Option(linkTargetOptionLabel(target), target.targetId || "");
    option.dataset.target = JSON.stringify(target);
    return option;
  });

  select.replaceChildren(...(options.length > 0 ? options : [new window.Option("No records found", "")]));
}

function linkTargetOptionLabel(target = {}) {
  const typeLabel = LINK_TARGET_TYPE_LABELS[target.targetType] || formatToken(target.targetType || "record");
  const parts = [target.label || target.targetId || "Untitled", target.subtitle].filter(Boolean);
  return `${typeLabel}: ${parts.join(" - ")}`;
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

function applyEditorLinkTarget() {
  const target = readSelectedLinkTarget(contextResultsInput);

  if (!target?.targetType || !target.targetId) {
    state.editorSelectedTarget = null;
    renderEditorContextSelection();
    return;
  }

  state.editorSelectedTarget = target;
  applyContextTarget(target);
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

function noteHasLink(note = {}, target = {}) {
  return (note.links || []).some((link) => {
    const targetType = link.targetType || link.target_type;
    const targetId = link.targetId || link.target_id;
    return targetType === target.targetType && targetId === target.targetId;
  });
}

function applyContextTarget(target = {}) {
  if (target.targetType === "client") {
    clientInput.value = target.clientId || target.targetId || "";
    projectInput.value = "";
    taskInput.value = "";
    userInput.value = "";
  } else if (target.targetType === "project") {
    clientInput.value = target.clientId || clientInput.value || "";
    projectInput.value = target.projectId || target.targetId || "";
    taskInput.value = "";
    userInput.value = "";
  } else if (target.targetType === "task") {
    clientInput.value = target.clientId || clientInput.value || "";
    projectInput.value = target.projectId || projectInput.value || "";
    taskInput.value = target.taskId || target.targetId || "";
    userInput.value = "";
  } else if (target.targetType === "user") {
    clientInput.value = "";
    projectInput.value = "";
    taskInput.value = "";
    userInput.value = target.userId || target.targetId || "";
  } else if (target.targetType === "workspace") {
    clientInput.value = "";
    projectInput.value = "";
    taskInput.value = "";
    userInput.value = "";
  }
}

function renderEditorContextSelection(target = null) {
  if (!contextSelectedMessage) {
    return;
  }

  const linked = [];
  if (target?.targetType === "workspace") {
    linked.push(`Workspace: ${target.label || "Workspace"}`);
  }
  if (clientInput.value) {
    linked.push(`Client: ${clientInput.value}`);
  }
  if (projectInput.value) {
    linked.push(`Project: ${projectInput.value}`);
  }
  if (taskInput.value) {
    linked.push(`Task: ${taskInput.value}`);
  }
  if (userInput.value) {
    linked.push(`User: ${userInput.value}`);
  }

  contextSelectedMessage.textContent = linked.length > 0
    ? `Linked context: ${linked.join(" / ")}`
    : "No linked context selected.";
}

function handleEditorCommand(event) {
  const command = event.target?.dataset?.noteCommand;

  if (!command) {
    return;
  }

  editor?.applyCommand(command);
  renderPreview();
}

function togglePreview() {
  const pressed = previewToggle.getAttribute("aria-pressed") === "true";
  previewToggle.setAttribute("aria-pressed", String(!pressed));
  preview.hidden = pressed;
  if (!pressed) {
    renderPreview();
  }
}

function renderPreview() {
  if (preview.hidden) {
    return;
  }

  preview.replaceChildren(...markdownPreviewNodes(editor?.getValue() || bodyInput.value));
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
  collectionDialog.showModal();
  collectionTitleInput.focus();
}

function closeCollectionDialog() {
  collectionDialog?.close();
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
  const section = document.createElement("section");
  const list = document.createElement("div");
  const form = document.createElement("form");
  const targetType = document.createElement("select");
  const targetSearch = document.createElement("input");
  const targetResults = document.createElement("select");
  const add = document.createElement("button");
  let searchTimer = null;

  section.className = "notes-detail-section";
  section.append(sectionHeading("Linked Records"));
  list.className = "notes-link-list";
  list.replaceChildren(...(note.links || []).map((link) => linkItem(note, link)));
  if ((note.links || []).length === 0) {
    list.append(emptyText("No linked records."));
  }

  form.className = "notes-link-form";
  form.hidden = note.status === "archived";
  ["workspace", "client", "project", "task", "user"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = LINK_TARGET_TYPE_LABELS[value] || formatToken(value);
    targetType.append(option);
  });
  targetSearch.type = "search";
  targetSearch.placeholder = "Search records";
  targetResults.required = true;
  add.type = "submit";
  add.textContent = "Add Link";
  form.append(targetType, targetSearch, targetResults, add);
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
  form.addEventListener("submit", async (event) => {
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

  section.append(list, form);
  return section;
}

function linkItem(note, link) {
  const item = document.createElement("div");
  const label = document.createElement("span");
  const sourceUrl = link.sourceUrl || link.source_url || "";
  const targetType = link.targetType || link.target_type || "";
  const targetId = link.targetId || link.target_id || "";
  const title = sourceUrl ? document.createElement("a") : document.createElement("strong");
  const subtitle = document.createElement("small");
  const remove = document.createElement("button");

  item.className = "notes-link-item";
  label.className = "notes-link-item-label";
  title.textContent = link.label || targetId || "Linked record";
  if (sourceUrl) {
    title.href = sourceUrl;
  }
  subtitle.textContent = link.subtitle || (LINK_TARGET_TYPE_LABELS[targetType] || formatToken(targetType));
  label.append(title, subtitle);
  remove.type = "button";
  remove.textContent = "Remove";
  remove.hidden = note.status === "archived";
  remove.addEventListener("click", () => removeNoteLink(note, link));
  item.append(label, remove);
  return item;
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
  const section = document.createElement("section");
  const mount = document.createElement("div");

  section.className = "notes-detail-section";
  mount.dataset.noteFilesMount = "";
  if (isSecureNote(note)) {
    section.append(sectionHeading("Files"), lockedNotice("Secure notes do not allow framework file attachments yet."));
    return section;
  }
  section.append(mount);
  return section;
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
  const section = document.createElement("details");
  const summary = document.createElement("summary");
  const list = document.createElement("div");

  section.className = "notes-detail-section notes-revisions-panel";
  summary.textContent = "Revisions";
  list.dataset.noteRevisionsList = "";
  list.textContent = "Loading revisions...";
  section.append(summary, list);
  if (note.status === "archived") {
    list.dataset.archived = "true";
  }
  return section;
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
    return;
  }

  state.tagPicker = await window.LongtailForge.tags.mountPicker(tagsEditor, {
    allowCreate: true,
    label: "Tags",
    selectedTags: note?.tags || [],
    tags: state.availableTags,
  });
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

function openNoteFromUrl() {
  const noteId = new URLSearchParams(window.location.search).get("note");
  if (noteId) {
    selectNote(noteId);
  }
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

function bucketTitle() {
  return {
    all: "All Notes",
    active_work: "Active Work",
    ongoing_area: "Ongoing Areas",
    reference: "Reference Library",
    archive: "Archive",
  }[state.activeBucket] || "Notes";
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

function detailActionsMenu(buttons = []) {
  const actions = document.createElement("details");
  const summary = document.createElement("summary");
  const menu = document.createElement("span");

  actions.className = "notes-detail-actions";
  summary.textContent = "...";
  summary.title = "Note actions";
  menu.className = "notes-detail-actions-menu";
  menu.append(...buttons);
  actions.append(summary, menu);
  return actions;
}

function detailMetaItems(note = {}) {
  const items = [
    ["Library", libraryLabel(note.library_bucket)],
    ["Note Kind", noteKindLabel(note.note_type)],
    ["Status", formatToken(note.status)],
    ["Visibility", formatToken(note.visibility)],
    ["Security", formatToken(note.security_mode)],
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

function addContext(list, label, value) {
  if (!value) {
    return;
  }

  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

function addLinkedContext(list, label, target, fallbackValue) {
  if (!target && !fallbackValue) {
    return;
  }

  const term = document.createElement("dt");
  const description = document.createElement("dd");
  const value = target?.label || fallbackValue;

  term.textContent = label;
  if (target?.sourceUrl && !target.unavailable) {
    const link = document.createElement("a");
    link.href = target.sourceUrl;
    link.textContent = value;
    description.append(link);
  } else {
    description.textContent = target?.unavailable ? "Unavailable linked record" : value;
  }
  list.append(term, description);
}

function sectionHeading(label) {
  const heading = document.createElement("h3");

  heading.textContent = label;
  return heading;
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

function tagChips(tags = []) {
  const wrapper = document.createElement("span");
  const normalizedTags = Array.isArray(tags) ? tags : [];

  wrapper.className = "notes-tag-list";
  if (normalizedTags.length === 0) {
    wrapper.textContent = "No tags";
    return wrapper;
  }

  normalizedTags.forEach((tag) => {
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

function markdownPreviewNodes(markdown) {
  const text = String(markdown || "").trim();
  if (!text) {
    const empty = document.createElement("p");
    empty.textContent = "No preview.";
    return [empty];
  }

  return text.split(/\n{2,}/).map((paragraph) => {
    const element = document.createElement(paragraph.startsWith("# ") ? "h3" : "p");
    element.textContent = paragraph.replace(/^#+\s*/, "");
    return element;
  });
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

function isSecureNote(note = {}) {
  return note.security_mode === "secure";
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
