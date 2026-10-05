(function initializeSearchPage() {
/**
 * The page's controls, each narrowed to the subtype the page actually drives.
 *
 * **`document.querySelector` answers `Element`, and this page reads `value`, `disabled` and
 * `hidden` off almost all of them.** These five checks are the markup contract restated where the
 * page reads it: `search.html` ships a real form, text and collection inputs, five selects, and
 * buttons for clear, rebuild and paging. A control that is not what the page expects answers
 * `null` here rather than being typed into something it is not, and every read below already
 * guards for absence.
 * @param {string} selector
 * @returns {HTMLFormElement | null}
 */
function findForm(selector) {
  const node = document.querySelector(selector);
  return node instanceof HTMLFormElement ? node : null;
}

/** @param {string} selector @returns {HTMLInputElement | null} */
function findInput(selector) {
  const node = document.querySelector(selector);
  return node instanceof HTMLInputElement ? node : null;
}

/** @param {string} selector @returns {HTMLSelectElement | null} */
function findSelect(selector) {
  const node = document.querySelector(selector);
  return node instanceof HTMLSelectElement ? node : null;
}

/** @param {string} selector @returns {HTMLButtonElement | null} */
function findButton(selector) {
  const node = document.querySelector(selector);
  return node instanceof HTMLButtonElement ? node : null;
}

/**
 * A rendered element this page reads `hidden` or `textContent` from.
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function findElement(selector) {
  const node = document.querySelector(selector);
  return node instanceof HTMLElement ? node : null;
}

const searchForm = findForm("[data-search-form]");
const textInput = findInput("[data-search-text]");
const moduleSelect = findSelect("[data-search-module]");
const recordTypeSelect = findSelect("[data-search-record-type]");
const clientSelect = findSelect("[data-search-client]");
const projectSelect = findSelect("[data-search-project]");
const tagSelect = findSelect("[data-search-tag]");
const noteCollectionInput = findInput("[data-search-note-collection]");
const statusSelect = findSelect("[data-search-status-filter]");
const clientControl = findElement("[data-search-client-control]");
const clearButton = findButton("[data-search-clear]");
const indexMaintenance = findElement("[data-search-index-maintenance]");
const rebuildIndexButton = findButton("[data-search-rebuild-index]");
const rebuildStatus = findElement("[data-search-rebuild-status]");
const statusMessage = findElement("[data-search-status]");
const searchMeta = findElement("[data-search-meta]");
const resultsList = findElement("[data-search-results]");
const pagination = findElement("[data-search-pagination]");
const previousButton = findButton("[data-search-previous]");
const nextButton = findButton("[data-search-next]");
const pageSummary = findElement("[data-search-page-summary]");

/**
 * A record this page read out of a search response, with no member guaranteed.
 *
 * The result rows, their contexts and the client/project options are all untrusted wire values,
 * and their vocabularies belong to whichever module contributed the searchable type - so the
 * page states what it verifies, that it is reading from a record, rather than naming members it
 * does not own.
 * @typedef {Record<string, unknown>} SearchRecord
 */

/**
 * The eight filters this page carries, as **its own three producers** write them.
 *
 * Named precisely rather than left open, because `emptyFilters`, `readFiltersFromUrl` and
 * `readFiltersFromControls` are the only builders and each writes all eight as strings. The URL
 * round-trip reads them back by these same names.
 * @typedef {object} SearchFilters
 * @property {string} text
 * @property {string} source
 * @property {string} recordType
 * @property {string} clientId
 * @property {string} projectId
 * @property {string} tagId
 * @property {string} noteCollectionId
 * @property {string} status
 */

/**
 * One searchable type, as `normalizeSearchTargets` produces it.
 *
 * The published workspace context declares `searchTargets` as an unknown list on purpose - it is
 * assembled from module contributions - so this page's own normalizer is what gives it a shape.
 * @typedef {object} SearchTarget
 * @property {string} id
 * @property {string} label
 * @property {string} moduleId
 * @property {string} recordType
 * @property {string} sourceLabel
 */

/**
 * One client or project the filters offer, as this page's normalizers produce it.
 * @typedef {{ id: string, name: string }} SearchFilterOption
 */

/**
 * @typedef {object} SearchPageState
 * @property {SearchRecord | null} clientProjects
 * @property {SearchFilters} filters
 * @property {number} page
 * @property {number} pageSize
 * @property {SearchTarget[]} searchTargets
 */

/** @type {SearchPageState} */
const state = {
  clientProjects: null,
  filters: readFiltersFromUrl(),
  page: 1,
  pageSize: 25,
  searchTargets: [],
};

/**
 * The record a search member carries, or `null`.
 *
 * Arrays are refused because every caller asks this for a member it will read *by name*, and an
 * array answers `undefined` for each of them anyway.
 * @param {unknown} value
 * @returns {SearchRecord | null}
 */
function searchRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {SearchRecord} */ (value)
    : null;
}

/**
 * A search list, with every entry read as a record.
 *
 * A malformed entry becomes an empty record rather than being dropped, because the normalizers
 * below already filter what they cannot use - on an id, or on a record type - so removing it here
 * would take that decision away from them.
 * @param {unknown} value
 * @returns {SearchRecord[]}
 */
function searchRecordList(value) {
  /** @type {readonly unknown[]} */
  const entries = Array.isArray(value) ? value : [];
  return entries.map((entry) => searchRecord(entry) || {});
}

/**
 * A search member as text.
 *
 * `String(value || "")` rather than `String(value ?? "")`, so the falsy members the untyped reads
 * sent to their own fallbacks still reach the empty string.
 * @param {unknown} value
 * @returns {string}
 */
function searchText(value) {
  return String(value || "");
}

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

/** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

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
    throw new Error("Search requires LongtailForge.errors.");
  }
  return errors;
}

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
  setRebuildStatus("Queueing search index rebuild...");

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

    const receipt = searchRecord(body);
    const jobId = searchText(receipt?.jobId || searchRecord(receipt?.job)?.jobId);
    setRebuildStatus(jobId ? `Index rebuild queued. Job ${jobId}.` : "Index rebuild queued.");
  } catch (error) {
    setRebuildStatus(requireErrors().caughtMessage(error, "Search index rebuild failed."), true);
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
    const response = await fetch("/api/client-projects?view=options", { cache: "no-store" });
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
    tagFilterAllOption(),
    tagFilterNoTagsOption(),
    ...(Array.isArray(tags) ? tags : []).map((tag) => createOption(tag.tag_id || "", tag.name || tag.slug || "Tag")),
  );
  tagSelect.value = tagSelectHasValue(state.filters.tagId) ? state.filters.tagId : "";
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
    renderErrorState(requireErrors().caughtMessage(error, "Search results unavailable."));
  }
}

/** @param {unknown} responseBody */
function renderResults(responseBody) {
  const body = searchRecord(responseBody) || {};
  const results = searchRecordList(body.results);
  const pagination = searchRecord(body.pagination);
  const page = Number(pagination?.page) || state.page;
  const hasMore = pagination?.hasMore === true;

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

/** @param {SearchRecord} body */
function renderMeta(body) {
  if (!searchMeta) {
    return;
  }

  /** @type {string[]} */
  const parts = [];
  if (body.targetCount !== undefined) {
    // Interpolated rather than read through `searchText`, which sends a falsy member to the empty
    // string: a workspace with **zero** searchable types passes the guard above and must still
    // report "0 searchable types" rather than a blank one.
    parts.push(`${body.targetCount} searchable ${body.targetCount === 1 ? "type" : "types"}`);
  }
  if (body.backend) {
    parts.push(searchText(body.backend));
  }
  searchMeta.textContent = parts.join(" - ");
}

/** @param {SearchResultGroup} group */
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

/**
 * Whether a result's target carries a URL to navigate to.
 *
 * **`target` is the one nested member this page names**, because its own contract pins the
 * claim: a result title links to `result.target.url`. Everything else on a result stays unnamed
 * for the reason `SearchRecord` gives - the vocabulary belongs to the contributing module.
 * @param {unknown} value
 * @returns {value is { url: string }}
 */
function hasResultTargetUrl(value) {
  const target = searchRecord(value);
  return typeof target?.url === "string" && target.url !== "";
}

/** @param {SearchRecord} result */
function createResultRow(result) {
  const row = document.createElement("article");
  const title = hasResultTargetUrl(result.target) ? document.createElement("a") : document.createElement("span");
  const source = document.createElement("span");
  const status = document.createElement("span");
  const snippet = document.createElement("p");
  const meta = document.createElement("p");
  const tags = document.createElement("div");

  row.className = "search-result-row";
  title.className = "search-result-title";
  title.textContent = searchText(result.title) || "Untitled result";
  // The same read that chose the element decides the assignment, but that correlation is not one
  // the compiler can follow across two expressions - so the narrowing restates it. It can only
  // ever refuse, and only for a value that would not have been an anchor in the first place.
  if (hasResultTargetUrl(result.target) && title instanceof HTMLAnchorElement) {
    title.href = result.target.url;
  }

  source.className = "search-result-source";
  source.textContent = searchText(result.sourceLabel || result.source || result.recordType) || "Result";
  status.className = "search-result-status";
  status.textContent = searchText(result.status) || "active";
  snippet.className = "search-result-snippet";
  snippet.textContent = searchText(result.snippet || result.summary);
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

/** @param {...Node} items */
function createResultBadgeRow(...items) {
  const row = document.createElement("div");
  row.className = "search-result-badges";
  row.append(...items);
  return row;
}

/**
 * One tag chip for a search result.
 *
 * **The shared-chip branch that stood here was unreachable and is removed.** It guarded on
 * `LongtailForge.tags.createTagChip`, which `shared/tags.js` keeps internal and has never
 * published, so the guard has always been false and results have always taken this fallback.
 * Publishing that member to satisfy the guard would be a runtime change, and the near-miss
 * TypeScript suggests instead - `createTag` - posts a new tag, so the dead branch was worse than
 * it looked. `0.33.33.38.2.2.9` recorded this defect; `0.33.33.38.2.2.10` removes it.
 * @param {SearchRecord} tag
 * @returns {HTMLSpanElement}
 */
function createTagChip(tag) {
  const chip = document.createElement("span");
  chip.className = "tag-chip";
  // Coerced in place rather than through `searchText`, because this builder is deliberately
  // self-contained: `tag-surface-declaration` evaluates it standalone to prove it reaches for
  // nothing outside itself, which is the whole point of the dead branch that was removed here.
  chip.textContent = String(tag.name || tag.slug || "Tag");
  return chip;
}

/**
 * One rendered group of results that share a source and a record type.
 * @typedef {{ label: string, results: SearchRecord[] }} SearchResultGroup
 */

/** @param {SearchRecord[]} results @returns {SearchResultGroup[]} */
function groupResults(results) {
  /** @type {Map<string, SearchResultGroup>} */
  const groups = new Map();

  for (const result of results) {
    // Interpolated rather than read through `searchText`, which is both what the grouping
    // contract pins and the more faithful spelling: a result carrying none of the three source
    // members keeps its own distinct key instead of collapsing into the empty one.
    const key = `${result.sourceLabel || result.source || result.moduleId}:${result.recordType}`;
    const group = groups.get(key) || {
      label: searchText(result.sourceLabel || result.source || result.recordType || result.moduleId) || "Results",
      results: [],
    };

    group.results.push(result);
    groups.set(key, group);
  }

  return [...groups.values()];
}

/** @param {boolean} hasMore */
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

/** @param {string} message */
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

/** @param {SearchRecord | null} data @returns {SearchFilterOption[]} */
function normalizeClients(data) {
  return searchRecordList(data?.clients)
    .filter((client) => client.id && client.status !== "Inactive")
    .map((client) => ({ id: searchText(client.id), name: searchText(client.name) || searchText(client.id) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** @param {SearchRecord | null} data @returns {SearchFilterOption[]} */
function normalizeProjects(data) {
  /** @type {SearchFilterOption[]} */
  const projects = [];

  for (const project of searchRecordList(data?.workspaceProjects)) {
    if (project.id && project.status !== "Inactive") {
      projects.push({ id: searchText(project.id), name: searchText(project.name) || searchText(project.id) });
    }
  }

  for (const client of searchRecordList(data?.clients)) {
    for (const project of searchRecordList(client.projects)) {
      if (project.id && project.status !== "Inactive") {
        const projectName = searchText(project.name) || searchText(project.id);
        projects.push({
          id: searchText(project.id),
          name: client.name ? `${searchText(client.name)} / ${projectName}` : projectName,
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

/** @returns {SearchFilters} */
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

/** @returns {SearchFilters} */
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

/** @param {URLSearchParams} params @param {string} key @param {string} value */
function appendParam(params, key, value) {
  if (value) {
    params.set(key, value);
  }
}

/** @param {SearchFilters} filters */
function hasSearchCriteria(filters) {
  return Object.values(filters).some((value) => String(value || "").trim());
}

/** @returns {SearchFilters} */
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

/** @param {unknown} [targets] @returns {SearchTarget[]} */
function normalizeSearchTargets(targets = []) {
  /** @type {Set<string>} */
  const seen = new Set();

  return searchRecordList(targets)
    .map((target) => ({
      id: searchText(target.id) || `${searchText(target.moduleId)}:${searchText(target.recordType)}`,
      label: searchText(target.label || target.sourceLabel || target.recordType),
      moduleId: searchText(target.moduleId),
      recordType: searchText(target.recordType),
      sourceLabel: searchText(target.sourceLabel || target.label || target.moduleId),
    }))
    .filter((target) => {
      if ((!target.moduleId && !target.sourceLabel) || !target.recordType || seen.has(target.id)) {
        return false;
      }
      seen.add(target.id);
      return true;
    });
}

/** @param {unknown} moduleId */
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

/** @param {SearchRecord} result @returns {string[]} */
function resultMetaParts(result) {
  /** @type {string[]} */
  const parts = [];
  const context = searchRecord(result.context);
  const contextProject = searchRecord(context?.project);
  const clientName = searchText(searchRecord(context?.client)?.name || contextProject?.clientName);
  const projectName = searchText(contextProject?.name);

  if (clientName) {
    parts.push(clientName);
  }
  if (projectName) {
    parts.push(projectName);
  }
  if (result.collectionPath) {
    parts.push(searchText(result.collectionPath));
  }
  if (result.updatedAt) {
    parts.push(`Updated ${formatDate(result.updatedAt)}`);
  }

  return parts;
}

/** @param {unknown} tags @returns {SearchRecord[]} */
function normalizeTags(tags) {
  return searchRecordList(tags).filter((tag) => tag.name || tag.slug || tag.tagId);
}

/** @param {string} value @param {string} label */
function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function tagFilterAllOption() {
  return window.LongtailForge?.tags?.allTagsOption?.() || createOption("", "All tags");
}

function tagFilterNoTagsOption() {
  return window.LongtailForge?.tags?.noTagsOption?.() || createOption("__no_tags__", "No Tags");
}

/** @param {string} value */
function tagSelectHasValue(value) {
  return [...(tagSelect?.options || [])].some((option) => option.value === value);
}

/** @param {string} message */
function emptyElement(message) {
  const element = document.createElement("p");
  element.className = "placeholder-copy";
  element.textContent = message;
  return element;
}

/** @param {string} message @param {boolean} [isError] */
function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

/** @param {string} message @param {boolean} [isError] */
function setRebuildStatus(message, isError = false) {
  if (!rebuildStatus) {
    return;
  }

  rebuildStatus.textContent = message;
  rebuildStatus.classList.toggle("is-error", isError);
}

/** @param {Response} response @returns {Promise<unknown>} */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/** @param {unknown} body @returns {string} */
function errorMessage(body) {
  return window.LongtailForge?.errors?.read?.(body, "").message || "";
}

/**
 * **The numeric branch is kept separate on purpose.** `new Date(1700000000000)` is an instant
 * while `new Date("1700000000000")` is not a date at all, so coercing everything to text first
 * would silently turn an epoch timestamp into the raw number on screen.
 * @param {unknown} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
}());
