const api = window.LongtailForge.api;
const PAGE_SIZE = 12;
const BUCKET_LABELS = {
  active_work: "Active Work",
  ongoing_area: "Ongoing Areas",
  reference: "Reference Library",
};

const statusMessage = document.querySelector("[data-notes-status]");
const librarySummary = document.querySelector("[data-notes-library-summary]");
const bucketTabs = [...document.querySelectorAll("[data-notes-bucket]")];
const filtersForm = document.querySelector("[data-notes-filters]");
const statusFilter = document.querySelector("[data-note-filter-status]");
const visibilityFilter = document.querySelector("[data-note-filter-visibility]");
const securityFilter = document.querySelector("[data-note-filter-security]");
const typeFilter = document.querySelector("[data-note-filter-type]");
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
const dialog = document.querySelector("[data-note-dialog]");
const form = document.querySelector("[data-note-form]");
const dialogTitle = document.querySelector("[data-note-dialog-title]");
const dialogCloseButton = document.querySelector("[data-note-dialog-close]");
const titleInput = document.querySelector("[data-note-title]");
const libraryInput = document.querySelector("[data-note-library]");
const typeInput = document.querySelector("[data-note-type]");
const visibilityInput = document.querySelector("[data-note-visibility]");
const securityInput = document.querySelector("[data-note-security]");
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

const editor = window.LongtailForge.notesEditor?.createPlainTextarea(bodyInput);

let state = {
  activeBucket: "all",
  availableTags: [],
  attachmentController: null,
  editingNoteId: "",
  notes: [],
  library: [],
  page: 1,
  selectedNote: null,
  tagPicker: null,
};

createButton?.addEventListener("click", () => openEditor());
bucketTabs.forEach((button) => button.addEventListener("click", () => selectBucket(button.dataset.notesBucket)));
filtersForm?.addEventListener("change", () => {
  state.page = 1;
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
previewToggle?.addEventListener("click", togglePreview);
[clientInput, projectInput, taskInput, userInput].forEach((input) => input?.addEventListener("input", updateLibrarySuggestion));
document.querySelector("[data-note-editor-toolbar]")?.addEventListener("click", handleEditorCommand);

initialize();

async function initialize() {
  setStatus("Loading notes...");

  try {
    await window.LongtailForge.workspaceContextReady;
    await Promise.all([loadTags(), loadLibrary(), loadNotes()]);
    renderNotes();
    openNoteFromUrl();
    setStatus("");
  } catch (error) {
    renderEmptyList(error.message || "Notes could not be loaded.");
    setStatus(error.message || "Notes could not be loaded.", true);
  }
}

async function loadLibrary() {
  const result = await api.getJson("/api/notes/library", { cache: "no-store" });
  state.library = result.buckets || [];
  renderLibrarySummary();
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

function renderLibrarySummary() {
  if (!librarySummary) {
    return;
  }

  const cards = state.library.map((bucket) => {
    const button = document.createElement("button");
    const label = document.createElement("strong");
    const count = document.createElement("span");

    button.type = "button";
    button.className = "notes-library-card";
    button.dataset.notesSummaryBucket = bucket.libraryBucket;
    button.addEventListener("click", () => selectBucket(bucket.libraryBucket));
    label.textContent = BUCKET_LABELS[bucket.libraryBucket] || formatToken(bucket.libraryBucket);
    count.textContent = `${bucket.count || 0} active / ${bucket.archivedCount || 0} archived`;
    button.append(label, count);
    return button;
  });

  librarySummary.replaceChildren(...cards);
}

async function selectBucket(bucket) {
  state.activeBucket = bucket || "all";
  state.page = 1;
  state.selectedNote = null;
  updateBucketTabs();
  setStatus("Loading notes...");

  try {
    await loadNotes();
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

function filteredNotes() {
  const statusValue = statusFilter?.value || "active";
  const visibilityValue = visibilityFilter?.value || "all";
  const securityValue = securityFilter?.value || "all";
  const typeValue = typeFilter?.value || "all";
  const contextValue = normalizeText(contextFilter?.value).toLowerCase();
  const ownerValue = normalizeText(ownerFilter?.value).toLowerCase();
  const tagValue = normalizeText(tagFilter?.value).toLowerCase();
  const updatedValue = updatedFilter?.value || "";

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
    const tagMatch = !tagValue || (note.tags || []).some((tag) => [
      tag.name,
      tag.slug,
      tag.description,
    ].filter(Boolean).join(" ").toLowerCase().includes(tagValue));
    const updatedMatch = !updatedValue || String(note.updated_at || "").slice(0, 10) >= updatedValue;

    return statusMatch && visibilityMatch && securityMatch && typeMatch && contextMatch && ownerMatch && tagMatch && updatedMatch;
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
  const meta = document.createElement("span");
  const excerpt = document.createElement("span");
  const footer = document.createElement("span");

  button.type = "button";
  button.className = "notes-list-item";
  button.setAttribute("aria-pressed", String(state.selectedNote?.note_id === note.note_id));
  button.addEventListener("click", () => selectNote(note.note_id));

  heading.className = "notes-list-heading";
  title.textContent = note.title || "Untitled note";
  meta.className = "notes-list-meta";
  meta.textContent = `${libraryLabel(note.library_bucket)} - ${formatToken(note.note_type)} - ${formatToken(note.status)}`;
  heading.append(title, meta);

  excerpt.className = "notes-list-excerpt";
  excerpt.textContent = note.body_excerpt || "";
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
    renderDetailPrompt(error.message || "Note could not be loaded.");
    setStatus(error.message || "Note could not be loaded.", true);
  }
}

function renderDetail(note) {
  const header = document.createElement("header");
  const title = document.createElement("h2");
  const meta = document.createElement("p");
  const actions = document.createElement("div");
  const edit = actionButton("Edit", () => openEditor(note));
  const archiveOrRestore = note.status === "archived"
    ? actionButton("Restore", () => restoreNote(note))
    : actionButton("Archive", () => archiveNote(note));
  const body = document.createElement("div");
  const tags = document.createElement("section");
  const context = document.createElement("dl");
  const links = renderLinksPanel(note);
  const files = renderFilesPanel();
  const revisions = renderRevisionsPanel(note);

  header.className = "notes-detail-header";
  title.textContent = note.title || "Untitled note";
  meta.textContent = [
    libraryLabel(note.library_bucket),
    formatToken(note.note_type),
    formatToken(note.status),
    formatToken(note.visibility),
    formatToken(note.security_mode),
  ].filter(Boolean).join(" - ");
  actions.className = "notes-detail-actions";
  if (note.status === "archived") {
    edit.disabled = true;
    edit.title = "Restore archived notes before editing.";
  }
  actions.append(edit, archiveOrRestore);
  header.append(title, meta, actions);

  body.className = "notes-rendered-body";
  body.innerHTML = note.body_html || "";
  if (!body.textContent.trim() && !note.body_html) {
    body.textContent = note.security_mode === "secure" ? "Secure note body is not shown here." : "No body.";
  }

  tags.className = "notes-detail-section";
  tags.append(sectionHeading("Tags"), tagChips(note.tags || []));

  context.className = "notes-context-list";
  addContext(context, "Client", note.client_id);
  addContext(context, "Project", note.project_id);
  addContext(context, "Task", note.task_id);
  addContext(context, "Ticket", note.ticket_id);
  addContext(context, "User", note.linked_user_id);
  addContext(context, "Created", formatDate(note.created_at));
  addContext(context, "Updated", formatDate(note.updated_at));
  addContext(context, "Owner", note.owner_user_id);

  detailPanel.replaceChildren(header, tags, body, context, links, files, revisions);
  mountFilesPanel(note, files.querySelector("[data-note-files-mount]"));
  loadRevisions(note, revisions.querySelector("[data-note-revisions-list]"));
}

function renderDetailPrompt(message) {
  const prompt = document.createElement("p");

  prompt.className = "notes-empty-state";
  prompt.textContent = message;
  detailPanel.replaceChildren(prompt);
}

async function openEditor(note = null) {
  state.editingNoteId = note?.note_id || "";
  dialogTitle.textContent = note ? "Edit Note" : "Create Note";
  titleInput.value = note?.title || "";
  libraryInput.value = note?.library_bucket || state.activeBucketForCreate || defaultLibraryForCreate();
  typeInput.value = note?.note_type || "general";
  visibilityInput.value = note?.visibility || "internal";
  securityInput.value = note?.security_mode || "normal";
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
  updateLibrarySuggestion();
  dialog.showModal();
  titleInput.focus();
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

    await Promise.all([loadLibrary(), loadNotes()]);
    closeEditor();
    await selectNote(result.note.note_id);
    formStatus.textContent = "";
  } catch (error) {
    formStatus.textContent = error.message || "Note could not be saved.";
    saveButton.disabled = false;
  }
}

function readEditorPayload() {
  return {
    title: titleInput.value,
    body_markdown: editor?.getValue() || bodyInput.value,
    library_bucket: libraryInput.value,
    note_type: typeInput.value,
    visibility: visibilityInput.value,
    security_mode: securityInput.value,
    tagIds: state.tagPicker?.readTagIds?.() || [],
    client_id: normalizeText(clientInput.value) || null,
    project_id: normalizeText(projectInput.value) || null,
    task_id: normalizeText(taskInput.value) || null,
    linked_user_id: normalizeText(userInput.value) || null,
  };
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

function renderLinksPanel(note) {
  const section = document.createElement("section");
  const list = document.createElement("div");
  const form = document.createElement("form");
  const targetType = document.createElement("select");
  const targetId = document.createElement("input");
  const add = document.createElement("button");

  section.className = "notes-detail-section";
  section.append(sectionHeading("Linked Records"));
  list.className = "notes-link-list";
  list.replaceChildren(...(note.links || []).map((link) => linkItem(note, link)));
  if ((note.links || []).length === 0) {
    list.append(emptyText("No linked records."));
  }

  form.className = "notes-link-form";
  form.hidden = note.status === "archived";
  ["client", "project", "task", "user"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatToken(value);
    targetType.append(option);
  });
  targetId.type = "text";
  targetId.placeholder = "Record ID";
  targetId.required = true;
  add.type = "submit";
  add.textContent = "Add Link";
  form.append(targetType, targetId, add);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addNoteLink(note, {
      targetType: targetType.value,
      targetId: targetId.value,
    });
  });

  section.append(list, form);
  return section;
}

function linkItem(note, link) {
  const item = document.createElement("div");
  const label = document.createElement("span");
  const remove = document.createElement("button");

  item.className = "notes-link-item";
  label.textContent = `${formatToken(link.target_type)}: ${link.target_id}`;
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
  await api.postJson(`/api/notes/${encodeURIComponent(note.note_id)}/links/${encodeURIComponent(link.note_link_id)}/remove`, {});
  await selectNote(note.note_id);
}

function renderFilesPanel() {
  const section = document.createElement("section");
  const mount = document.createElement("div");

  section.className = "notes-detail-section";
  mount.dataset.noteFilesMount = "";
  section.append(mount);
  return section;
}

function mountFilesPanel(note, mount) {
  if (!mount || !window.LongtailForge.fileAttachments) {
    return;
  }

  state.attachmentController?.destroy?.();
  state.attachmentController = window.LongtailForge.fileAttachments.mount(mount, {
    acceptedCategories: ["document", "image", "pdf", "spreadsheet", "presentation", "text", "other"],
    canRemove: note.status !== "archived" && note.security_mode !== "secure",
    canUpload: note.status !== "archived" && note.security_mode !== "secure",
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
  const section = document.createElement("section");
  const list = document.createElement("div");

  section.className = "notes-detail-section";
  list.dataset.noteRevisionsList = "";
  list.textContent = "Loading revisions...";
  section.append(sectionHeading("Revisions"), list);
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
    list.replaceChildren(emptyText(error.message || "Revisions could not be loaded."));
  }
}

function revisionItem(note, revision) {
  const item = document.createElement("article");
  const title = document.createElement("strong");
  const meta = document.createElement("p");
  const excerpt = document.createElement("p");
  const restore = document.createElement("button");

  item.className = "notes-revision-item";
  title.textContent = `Revision ${revision.revision_number}`;
  meta.textContent = [
    revision.change_summary,
    formatToken(revision.library_bucket),
    formatToken(revision.visibility),
    formatToken(revision.security_mode),
    formatDate(revision.created_at),
  ].filter(Boolean).join(" - ");
  excerpt.textContent = revision.body_excerpt || revision.title || "";
  restore.type = "button";
  restore.textContent = "Restore";
  restore.hidden = note.status === "archived";
  restore.addEventListener("click", async () => {
    await api.postJson(`/api/notes/${encodeURIComponent(note.note_id)}/revisions/${encodeURIComponent(revision.note_revision_id)}/restore`, {});
    await selectNote(note.note_id);
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
    await Promise.all([loadLibrary(), loadNotes()]);
    await selectNote(result.note.note_id);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Note could not be updated.", true);
  }
}

function updateLibrarySuggestion() {
  const suggestion = deriveSuggestedLibraryBucket();
  const current = libraryInput.value;

  suggestionMessage.textContent = `Suggested Library: ${libraryLabel(suggestion)}`;
  if (!state.editingNoteId && current !== suggestion && current === defaultLibraryForCreate()) {
    libraryInput.value = suggestion;
  }
}

function deriveSuggestedLibraryBucket() {
  if (projectInput.value || taskInput.value) {
    return "active_work";
  }

  if (clientInput.value) {
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

function libraryLabel(value) {
  return BUCKET_LABELS[value] || formatToken(value);
}

function actionButton(label, handler) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
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

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error-text", isError);
}
