(function initializeSearchPage() {
const searchForm = document.querySelector("[data-search-form]");
const textInput = document.querySelector("[data-search-text]");
const moduleSelect = document.querySelector("[data-search-module]");
const recordTypeSelect = document.querySelector("[data-search-record-type]");
const clientSelect = document.querySelector("[data-search-client]");
const projectSelect = document.querySelector("[data-search-project]");
const tagSelect = document.querySelector("[data-search-tag]");
const noteCollectionInput = document.querySelector("[data-search-note-collection]");
const statusSelect = document.querySelector("[data-search-status-filter]");
const clientControl = document.querySelector("[data-search-client-control]");
const clearButton = document.querySelector("[data-search-clear]");
const indexMaintenance = document.querySelector("[data-search-index-maintenance]");
const rebuildIndexButton = document.querySelector("[data-search-rebuild-index]");
const rebuildStatus = document.querySelector("[data-search-rebuild-status]");
const statusMessage = document.querySelector("[data-search-status]");
const searchMeta = document.querySelector("[data-search-meta]");
const resultsList = document.querySelector("[data-search-results]");
const pagination = document.querySelector("[data-search-pagination]");
const previousButton = document.querySelector("[data-search-previous]");
const nextButton = document.querySelector("[data-search-next]");
const pageSummary = document.querySelector("[data-search-page-summary]");

const state = {
  clientProjects: null,
  filters: readFiltersFromUrl(),
  page: 1,
  pageSize: 25,
  searchTargets: [],
};

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  state.filters = readFiltersFromControls();
  state.page = 1;
  updateUrlFromState();
  loadResults();
});

[moduleSelect, recordTypeSelect, clientSelect, projectSelect, tagSelect, noteCollectionInput, statusSelect].forEach((control) => {
  control?.addEventListener("change", () => {
    state.filters = readFiltersFromControls();
    state.page = 1;
    if (control === moduleSelect) {
      populateRecordTypeFilter();
      state.filters.recordType = recordTypeSelect?.value || "";
    }
    updateUrlFromState();
    loadResults();
  });
});

clearButton?.addEventListener("click", () => {
  state.filters = emptyFilters();
  state.page = 1;
  applyFiltersToControls();
  updateUrlFromState();
  renderPromptState();
});

previousButton?.addEventListener("click", () => {
  if (state.page <= 1) {
    return;
  }
  state.page -= 1;
  updateUrlFromState();
  loadResults();
});

nextButton?.addEventListener("click", () => {
  state.page += 1;
  updateUrlFromState();
  loadResults();
});

rebuildIndexButton?.addEventListener("click", rebuildSearchIndex);

initialize();

async function initialize() {
  state.page = readPageFromUrl();
  applyFiltersToControls();
  await Promise.allSettled([loadSearchTargets(), loadFilterOptions()]);
  updateIndexMaintenanceVisibility();
  applyFiltersToControls();

  if (hasSearchCriteria(state.filters)) {
    await loadResults();
  } else {
    renderPromptState();
  }
}

async function rebuildSearchIndex() {
  if (!rebuildIndexButton) {
    return;
  }

  rebuildIndexButton.disabled = true;
  setRebuildStatus("Rebuilding search index...");

  try {
    const response = await fetch("/api/search-index/rebuild", {
      body: "{}",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(errorMessage(body) || "Search index rebuild failed.");
    }

    const indexed = Number(body?.counts?.indexed) || 0;
    const removed = Number(body?.counts?.removed) || 0;
    const repaired = Number(body?.counts?.repaired) || 0;
    setRebuildStatus(`Index rebuilt. ${indexed} indexed, ${removed} removed, ${repaired} repaired.`);

    if (hasSearchCriteria(state.filters)) {
      await loadResults();
    }
  } catch (error) {
    setRebuildStatus(error.message || "Search index rebuild failed.", true);
  } finally {
    rebuildIndexButton.disabled = false;
  }
}

function updateIndexMaintenanceVisibility() {
  const canRebuild = window.LongtailForge?.workspaceContext?.permissionHints?.workspaceSettingsManage === true;

  if (indexMaintenance) {
    indexMaintenance.hidden = !canRebuild;
  }
}

async function loadSearchTargets() {
  try {
    await window.LongtailForge?.workspaceContextReady;
  } catch {
    // The search page can still run with text/client/project/tag filters.
  }

  const targets = window.LongtailForge?.workspaceContext?.searchTargets || readCachedSearchTargets();
  state.searchTargets = normalizeSearchTargets(targets);
  populateModuleFilter();
  populateRecordTypeFilter();
}

async function loadFilterOptions() {
  await Promise.allSettled([loadClientProjectOptions(), loadTagOptions()]);
}

async function loadClientProjectOptions() {
  try {
    const response = await fetch("/api/client-projects", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Client/project filters unavailable.");
    }

    state.clientProjects = await response.json();
    populateClientProjectFilters();
  } catch {
    populateClientProjectFilters();
  }
}

async function loadTagOptions() {
  const tags = await window.LongtailForge?.tags?.loadTags?.({ status: "active" });

  if (!tagSelect) {
    return;
  }

  tagSelect.replaceChildren(
    createOption("", "All tags"),
    ...(Array.isArray(tags) ? tags : []).map((tag) => createOption(tag.tag_id || "", tag.name || tag.slug || "Tag")),
  );
  tagSelect.value = state.filters.tagId || "";
}

async function loadResults() {
  if (!hasSearchCriteria(state.filters)) {
    renderPromptState();
    return;
  }

  setStatus("Loading search results");
  renderLoadingState();

  try {
    const params = buildSearchParams();
    const response = await fetch(`/api/search?${params}`, { cache: "no-store" });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(errorMessage(body) || "Search results unavailable.");
    }

    renderResults(body);
  } catch (error) {
    renderErrorState(error.message || "Search results unavailable.");
  }
}

function renderResults(body = {}) {
  const results = Array.isArray(body.results) ? body.results : [];
  const page = body.pagination?.page || state.page;
  const hasMore = body.pagination?.hasMore === true;

  state.page = page;
  setStatus(results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"} shown` : "No matching results");
  renderMeta(body);

  if (results.length === 0) {
    resultsList?.replaceChildren(emptyElement("No matching results."));
  } else {
    resultsList?.replaceChildren(...groupResults(results).map(createResultGroup));
  }

  renderPagination(hasMore);
}

function renderMeta(body = {}) {
  if (!searchMeta) {
    return;
  }

  const parts = [];
  if (body.targetCount !== undefined) {
    parts.push(`${body.targetCount} searchable ${body.targetCount === 1 ? "type" : "types"}`);
  }
  if (body.backend) {
    parts.push(body.backend);
  }
  searchMeta.textContent = parts.join(" - ");
}

function createResultGroup(group) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const list = document.createElement("div");

  section.className = "search-result-group";
  heading.textContent = group.label;
  list.className = "search-result-group-list";
  list.replaceChildren(...group.results.map(createResultRow));
  section.append(heading, list);
  return section;
}

function createResultRow(result) {
  const row = document.createElement("article");
  const title = result.target?.url ? document.createElement("a") : document.createElement("span");
  const source = document.createElement("span");
  const status = document.createElement("span");
  const snippet = document.createElement("p");
  const meta = document.createElement("p");
  const tags = document.createElement("div");

  row.className = "search-result-row";
  title.className = "search-result-title";
  title.textContent = result.title || "Untitled result";
  if (result.target?.url) {
    title.href = result.target.url;
  }

  source.className = "search-result-source";
  source.textContent = result.sourceLabel || result.source || result.recordType || "Result";
  status.className = "search-result-status";
  status.textContent = result.status || "active";
  snippet.className = "search-result-snippet";
  snippet.textContent = result.snippet || result.summary || "";
  meta.className = "search-result-meta";
  meta.textContent = resultMetaParts(result).join(" - ");
  tags.className = "search-result-tags";
  tags.replaceChildren(...normalizeTags(result.tags).map(createTagChip));

  row.append(title, createResultBadgeRow(source, status), snippet, meta);
  if (tags.childElementCount > 0) {
    row.append(tags);
  }
  return row;
}

function createResultBadgeRow(...items) {
  const row = document.createElement("div");
  row.className = "search-result-badges";
  row.append(...items);
  return row;
}

function createTagChip(tag) {
  if (window.LongtailForge?.tags?.createTagChip) {
    return window.LongtailForge.tags.createTagChip(tag);
  }

  const chip = document.createElement("span");
  chip.className = "tag-chip";
  chip.textContent = tag.name || tag.slug || "Tag";
  return chip;
}

function groupResults(results) {
  const groups = new Map();

  for (const result of results) {
    const key = `${result.sourceLabel || result.source || result.moduleId}:${result.recordType}`;
    const group = groups.get(key) || {
      label: result.sourceLabel || result.source || result.recordType || result.moduleId || "Results",
      results: [],
    };

    group.results.push(result);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function renderPagination(hasMore) {
  if (!pagination || !previousButton || !nextButton || !pageSummary) {
    return;
  }

  pagination.hidden = state.page <= 1 && !hasMore;
  previousButton.disabled = state.page <= 1;
  nextButton.disabled = !hasMore;
  pageSummary.textContent = `Page ${state.page}`;
}

function renderPromptState() {
  setStatus("Enter search criteria to begin.");
  if (searchMeta) {
    searchMeta.textContent = "";
  }
  resultsList?.replaceChildren(emptyElement("Enter search criteria to begin."));
  renderPagination(false);
}

function renderLoadingState() {
  resultsList?.replaceChildren(emptyElement("Loading search results..."));
}

function renderErrorState(message) {
  setStatus(message, true);
  if (searchMeta) {
    searchMeta.textContent = "";
  }
  resultsList?.replaceChildren(emptyElement("Search results unavailable."));
  renderPagination(false);
}

function populateModuleFilter() {
  if (!moduleSelect) {
    return;
  }

  const previousValue = state.filters.source || moduleSelect.value;
  const modules = [...new Map(state.searchTargets.map((target) => [
    target.sourceLabel,
    target.sourceLabel || moduleLabel(target.moduleId),
  ])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));

  moduleSelect.replaceChildren(
    createOption("", "All sources"),
    ...modules.map(([source, label]) => createOption(source, label)),
  );
  moduleSelect.value = modules.some(([source]) => source === previousValue) ? previousValue : "";
}

function populateRecordTypeFilter() {
  if (!recordTypeSelect) {
    return;
  }

  const source = moduleSelect?.value || state.filters.source || "";
  const previousValue = state.filters.recordType || recordTypeSelect.value;
  const targets = state.searchTargets
    .filter((target) => !source || target.sourceLabel === source)
    .sort((left, right) => left.label.localeCompare(right.label));

  recordTypeSelect.replaceChildren(
    createOption("", "All record types"),
    ...targets.map((target) => createOption(target.recordType, target.label)),
  );
  recordTypeSelect.value = targets.some((target) => target.recordType === previousValue) ? previousValue : "";
}

function populateClientProjectFilters() {
  const clients = normalizeClients(state.clientProjects);
  const projects = normalizeProjects(state.clientProjects);

  if (clientControl) {
    clientControl.hidden = clients.length === 0;
  }
  if (clientSelect) {
    clientSelect.replaceChildren(createOption("", "All clients"), ...clients.map((client) => createOption(client.id, client.name)));
    clientSelect.value = clients.some((client) => client.id === state.filters.clientId) ? state.filters.clientId : "";
  }
  if (projectSelect) {
    projectSelect.replaceChildren(createOption("", "All projects"), ...projects.map((project) => createOption(project.id, project.name)));
    projectSelect.value = projects.some((project) => project.id === state.filters.projectId) ? state.filters.projectId : "";
  }
}

function normalizeClients(data) {
  return (Array.isArray(data?.clients) ? data.clients : [])
    .filter((client) => client.id && client.status !== "Inactive")
    .map((client) => ({ id: client.id, name: client.name || client.id }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeProjects(data) {
  const projects = [];

  for (const project of Array.isArray(data?.workspaceProjects) ? data.workspaceProjects : []) {
    if (project.id && project.status !== "Inactive") {
      projects.push({ id: project.id, name: project.name || project.id });
    }
  }

  for (const client of Array.isArray(data?.clients) ? data.clients : []) {
    for (const project of Array.isArray(client.projects) ? client.projects : []) {
      if (project.id && project.status !== "Inactive") {
        projects.push({
          id: project.id,
          name: client.name ? `${client.name} / ${project.name || project.id}` : project.name || project.id,
        });
      }
    }
  }

  return projects.sort((left, right) => left.name.localeCompare(right.name));
}

function applyFiltersToControls() {
  if (textInput) {
    textInput.value = state.filters.text || "";
  }
  if (moduleSelect) {
    moduleSelect.value = state.filters.source || "";
  }
  populateRecordTypeFilter();
  if (recordTypeSelect) {
    recordTypeSelect.value = state.filters.recordType || "";
  }
  if (clientSelect) {
    clientSelect.value = state.filters.clientId || "";
  }
  if (projectSelect) {
    projectSelect.value = state.filters.projectId || "";
  }
  if (tagSelect) {
    tagSelect.value = state.filters.tagId || "";
  }
  if (noteCollectionInput) {
    noteCollectionInput.value = state.filters.noteCollectionId || "";
  }
  if (statusSelect) {
    statusSelect.value = state.filters.status || "";
  }
}

function readFiltersFromControls() {
  return {
    text: textInput?.value?.trim() || "",
    source: moduleSelect?.value || "",
    recordType: recordTypeSelect?.value || "",
    clientId: clientSelect?.value || "",
    projectId: projectSelect?.value || "",
    tagId: tagSelect?.value || "",
    noteCollectionId: noteCollectionInput?.value?.trim() || "",
    status: statusSelect?.value || "",
  };
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return {
    text: params.get("text") || params.get("q") || params.get("query") || "",
    source: params.get("source") || "",
    recordType: params.get("recordType") || params.get("type") || "",
    clientId: params.get("clientId") || params.get("client") || "",
    projectId: params.get("projectId") || params.get("project") || "",
    tagId: params.get("tagId") || params.get("tag") || "",
    noteCollectionId: params.get("noteCollectionId") || params.get("note_collection_id") || params.get("collection") || "",
    status: params.get("status") || params.get("recordStatus") || "",
  };
}

function readPageFromUrl() {
  const page = Number.parseInt(new URLSearchParams(window.location.search).get("page") || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function updateUrlFromState() {
  const params = buildUrlParams();
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function buildSearchParams() {
  const params = buildUrlParams();
  params.set("limit", String(state.pageSize));
  return params;
}

function buildUrlParams() {
  const params = new URLSearchParams();

  appendParam(params, "text", state.filters.text);
  appendParam(params, "source", state.filters.source);
  appendParam(params, "recordType", state.filters.recordType);
  appendParam(params, "clientId", state.filters.clientId);
  appendParam(params, "projectId", state.filters.projectId);
  appendParam(params, "tagId", state.filters.tagId);
  appendParam(params, "noteCollectionId", state.filters.noteCollectionId);
  appendParam(params, "status", state.filters.status);
  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  return params;
}

function appendParam(params, key, value) {
  if (value) {
    params.set(key, value);
  }
}

function hasSearchCriteria(filters) {
  return Object.values(filters).some((value) => String(value || "").trim());
}

function emptyFilters() {
  return {
    text: "",
    source: "",
    recordType: "",
    clientId: "",
    projectId: "",
    tagId: "",
    noteCollectionId: "",
    status: "",
  };
}

function normalizeSearchTargets(targets = []) {
  const seen = new Set();

  return (Array.isArray(targets) ? targets : [])
    .map((target) => ({
      id: target.id || `${target.moduleId || ""}:${target.recordType || ""}`,
      label: target.label || target.sourceLabel || target.recordType || "",
      moduleId: target.moduleId || "",
      recordType: target.recordType || "",
      sourceLabel: target.sourceLabel || target.label || target.moduleId || "",
    }))
    .filter((target) => {
      if ((!target.moduleId && !target.sourceLabel) || !target.recordType || seen.has(target.id)) {
        return false;
      }
      seen.add(target.id);
      return true;
    });
}

function moduleLabel(moduleId) {
  return String(moduleId || "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Module";
}

function readCachedSearchTargets() {
  try {
    const context = JSON.parse(window.localStorage.getItem("lf_workspace_context") || "null");
    return Array.isArray(context?.searchTargets) ? context.searchTargets : [];
  } catch {
    return [];
  }
}

function resultMetaParts(result) {
  const parts = [];
  const clientName = result.context?.client?.name || result.context?.project?.clientName || "";
  const projectName = result.context?.project?.name || "";

  if (clientName) {
    parts.push(clientName);
  }
  if (projectName) {
    parts.push(projectName);
  }
  if (result.collectionPath) {
    parts.push(result.collectionPath);
  }
  if (result.updatedAt) {
    parts.push(`Updated ${formatDate(result.updatedAt)}`);
  }

  return parts;
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter((tag) => tag && (tag.name || tag.slug || tag.tagId)) : [];
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function emptyElement(message) {
  const element = document.createElement("p");
  element.className = "placeholder-copy";
  element.textContent = message;
  return element;
}

function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function setRebuildStatus(message, isError = false) {
  if (!rebuildStatus) {
    return;
  }

  rebuildStatus.textContent = message;
  rebuildStatus.classList.toggle("is-error", isError);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function errorMessage(body) {
  if (body?.error?.message) {
    return body.error.message;
  }
  if (typeof body?.error === "string") {
    return body.error;
  }
  return "";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
}());
