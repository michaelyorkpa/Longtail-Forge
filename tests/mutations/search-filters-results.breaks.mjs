import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/search.js";
// `tag-surface-declaration` is included because this checkpoint touched the one function it
// guards: it evaluates `createTagChip` standalone to prove the builder reaches for nothing
// outside itself, which no assertion in this checkpoint's own suite can express.
const suites = [
  "tests/unit/search-filters-results-contracts.test.mjs",
  "tests/unit/tag-surface-declaration.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "function searchRecord(value) {",
    "// @ts-expect-error deliberately added\nfunction searchRecord(value) {"],
  ["a control lookup goes back to a raw query",
    'const textInput = findInput("[data-search-text]");',
    'const textInput = document.querySelector("[data-search-text]");'],
  ["a select lookup goes back to a raw query",
    'const moduleSelect = findSelect("[data-search-module]");',
    'const moduleSelect = document.querySelector("[data-search-module]");'],
  ["a button lookup goes back to a raw query",
    'const previousButton = findButton("[data-search-previous]");',
    'const previousButton = document.querySelector("[data-search-previous]");'],
  ["an element lookup goes back to a raw query",
    'const searchMeta = findElement("[data-search-meta]");',
    'const searchMeta = document.querySelector("[data-search-meta]");'],
  ["a snake_case wire member is named in an annotation",
    " * @typedef {Record<string, unknown>} SearchRecord",
    " * @typedef {{ body_text?: string, tags_text?: string }} SearchRecord"],
  ["the form lookup stops checking the element is a form",
    "  return node instanceof HTMLFormElement ? node : null;",
    "  return /** @type {HTMLFormElement | null} */ (node);"],

  // --- the wire readers ----------------------------------------------------------------------
  ["a primitive is taken as a record",
    '  return typeof value === "object" && value !== null && !Array.isArray(value)',
    "  return value !== null && value !== undefined"],
  ["an array is taken as a record",
    'typeof value === "object" && value !== null && !Array.isArray(value)',
    'typeof value === "object" && value !== null'],
  ["a malformed list entry is dropped instead of left for the normalizers",
    "  return entries.map((entry) => searchRecord(entry) || {});",
    "  return entries.map((entry) => searchRecord(entry)).filter(Boolean);"],
  ["a value that is not a list becomes a one-entry list",
    "  const entries = Array.isArray(value) ? value : [];\n  return entries.map((entry) => searchRecord(entry) || {});",
    "  const entries = Array.isArray(value) ? value : [value];\n  return entries.map((entry) => searchRecord(entry) || {});"],
  ["a falsy member reaches its own spelling rather than the empty string",
    '  return String(value || "");',
    '  return String(value ?? "");'],

  // --- the result target -------------------------------------------------------------------------
  ["an empty target url is taken as a link",
    '  return typeof target?.url === "string" && target.url !== "";',
    '  return typeof target?.url === "string";'],
  ["a target url that is not a string is taken as a link",
    '  return typeof target?.url === "string" && target.url !== "";',
    "  return Boolean(target?.url);"],
  ["a result with no target is still built as an anchor",
    "  const title = hasResultTargetUrl(result.target) ? document.createElement(\"a\") : document.createElement(\"span\");",
    '  const title = document.createElement("a");'],
  ["a result with a target is built as plain text",
    "  const title = hasResultTargetUrl(result.target) ? document.createElement(\"a\") : document.createElement(\"span\");",
    '  const title = document.createElement("span");'],
  ["the link target stops being assigned",
    "  if (hasResultTargetUrl(result.target) && title instanceof HTMLAnchorElement) {\n    title.href = result.target.url;\n  }",
    "  if (false) {\n    title.href = \"\";\n  }"],

  // --- the filters -------------------------------------------------------------------------------------
  ["a filter alias stops being read from the url",
    '    text: params.get("text") || params.get("q") || params.get("query") || "",',
    '    text: params.get("text") || "",'],
  ["the canonical query name loses to its alias",
    '    text: params.get("text") || params.get("q") || params.get("query") || "",',
    '    text: params.get("q") || params.get("text") || params.get("query") || "",'],
  ["the record type alias stops being read",
    '    recordType: params.get("recordType") || params.get("type") || "",',
    '    recordType: params.get("recordType") || "",'],
  ["the client alias stops being read",
    '    clientId: params.get("clientId") || params.get("client") || "",',
    '    clientId: params.get("clientId") || "",'],
  ["the collection aliases stop being read",
    '    noteCollectionId: params.get("noteCollectionId") || params.get("note_collection_id") || params.get("collection") || "",',
    '    noteCollectionId: params.get("noteCollectionId") || "",'],
  ["the status alias stops being read",
    '    status: params.get("status") || params.get("recordStatus") || "",',
    '    status: params.get("status") || "",'],
  ["a free-text filter stops being trimmed",
    '    text: textInput?.value?.trim() || "",',
    '    text: textInput?.value || "",'],
  ["the collection filter stops being trimmed",
    '    noteCollectionId: noteCollectionInput?.value?.trim() || "",',
    '    noteCollectionId: noteCollectionInput?.value || "",'],
  ["a filter is read from the wrong control",
    '    clientId: clientSelect?.value || "",',
    '    clientId: projectSelect?.value || "",'],
  ["whitespace is taken as search criteria",
    '  return Object.values(filters).some((value) => String(value || "").trim());',
    "  return Object.values(filters).some((value) => Boolean(value));"],
  ["no filter counts as criteria",
    '  return Object.values(filters).some((value) => String(value || "").trim());',
    "  return false;"],

  // --- the url -------------------------------------------------------------------------------------
  ["an empty filter is written to the url anyway",
    "  if (value) {\n    params.set(key, value);\n  }",
    "  params.set(key, value);"],
  ["a filter stops reaching the url",
    '  appendParam(params, "tagId", state.filters.tagId);',
    ""],
  ["a filter is written under the wrong query name",
    '  appendParam(params, "clientId", state.filters.clientId);',
    '  appendParam(params, "client", state.filters.clientId);'],
  ["the first page is written to the url",
    "  if (state.page > 1) {\n    params.set(\"page\", String(state.page));\n  }",
    '  params.set("page", String(state.page));'],
  ["a later page stops being written to the url",
    "  if (state.page > 1) {\n    params.set(\"page\", String(state.page));\n  }",
    "  if (false) {\n    params.set(\"page\", String(state.page));\n  }"],
  ["the page size leaks into the shareable url",
    "function buildSearchParams() {\n  const params = buildUrlParams();\n  params.set(\"limit\", String(state.pageSize));\n  return params;\n}",
    "function buildSearchParams() {\n  return buildUrlParams();\n}"],
  ["the request stops bounding its page size",
    '  params.set("limit", String(state.pageSize));',
    ""],
  ["a bare query string is left on the url",
    "  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;",
    "  const nextUrl = `${window.location.pathname}?${query}`;"],
  ["the url change pushes a history entry",
    '  window.history.replaceState({}, "", nextUrl);',
    "  window.history.pushState({}, \"\", nextUrl);"],
  ["a page number of zero is accepted from the url",
    "  return Number.isFinite(page) && page > 0 ? page : 1;",
    "  return Number.isFinite(page) ? page : 1;"],
  ["an unreadable page number is accepted from the url",
    "  return Number.isFinite(page) && page > 0 ? page : 1;",
    "  return page;"],

  // --- the rendered row -------------------------------------------------------------------------------------
  ["a result loses its title fallback",
    '  title.textContent = searchText(result.title) || "Untitled result";',
    "  title.textContent = searchText(result.title);"],
  ["a result source loses its fallback chain",
    '  source.textContent = searchText(result.sourceLabel || result.source || result.recordType) || "Result";',
    "  source.textContent = searchText(result.sourceLabel) || \"Result\";"],
  ["a result status loses its default",
    '  status.textContent = searchText(result.status) || "active";',
    "  status.textContent = searchText(result.status);"],
  ["a result snippet stops falling back to its summary",
    "  snippet.textContent = searchText(result.snippet || result.summary);",
    "  snippet.textContent = searchText(result.snippet);"],
  ["a result with no usable tags is given a tag row anyway",
    "  if (tags.childElementCount > 0) {\n    row.append(tags);\n  }",
    "  row.append(tags);"],
  ["a result with tags loses its tag row",
    "  if (tags.childElementCount > 0) {\n    row.append(tags);\n  }",
    "  if (false) {\n    row.append(tags);\n  }"],
  ["a tag with no name, slug or id is kept",
    "  return searchRecordList(tags).filter((tag) => tag.name || tag.slug || tag.tagId);",
    "  return searchRecordList(tags);"],
  ["a tag chip loses its slug fallback",
    '  chip.textContent = String(tag.name || tag.slug || "Tag");',
    '  chip.textContent = String(tag.name || "Tag");'],
  ["the chip builder reaches outside itself, which its own contract refuses",
    '  chip.textContent = String(tag.name || tag.slug || "Tag");',
    '  chip.textContent = searchText(tag.name || tag.slug) || "Tag";'],

  // --- the result meta -------------------------------------------------------------------------------------
  ["the client name stops being read through the project",
    "  const clientName = searchText(searchRecord(context?.client)?.name || contextProject?.clientName);",
    "  const clientName = searchText(searchRecord(context?.client)?.name);"],
  ["the project name is read as the client name",
    "  const clientName = searchText(searchRecord(context?.client)?.name || contextProject?.clientName);",
    "  const clientName = searchText(contextProject?.name);"],
  ["the collection path stops being reported",
    "  if (result.collectionPath) {\n    parts.push(searchText(result.collectionPath));\n  }",
    "  if (false) {\n    parts.push(searchText(result.collectionPath));\n  }"],
  ["the update time stops being reported",
    "  if (result.updatedAt) {\n    parts.push(`Updated ${formatDate(result.updatedAt)}`);\n  }",
    "  if (false) {\n    parts.push(`Updated ${formatDate(result.updatedAt)}`);\n  }"],
  ["an epoch timestamp is coerced to text before it is read as a date",
    '  const date = typeof value === "number" ? new Date(value) : new Date(String(value));',
    "  const date = new Date(String(value));"],
  ["an unreadable date stops being echoed",
    "  if (Number.isNaN(date.getTime())) {\n    return String(value);\n  }",
    '  if (Number.isNaN(date.getTime())) {\n    return "";\n  }'],
  ["an absent date is formatted rather than left blank",
    '  if (!value) {\n    return "";\n  }',
    '  if (false) {\n    return "";\n  }'],

  // --- grouping -------------------------------------------------------------------------------------
  ["results stop being grouped by record type",
    "    const key = `${result.sourceLabel || result.source || result.moduleId}:${result.recordType}`;",
    "    const key = `${result.sourceLabel || result.source || result.moduleId}`;"],
  ["results stop being grouped by source",
    "    const key = `${result.sourceLabel || result.source || result.moduleId}:${result.recordType}`;",
    "    const key = `${result.recordType}`;"],
  ["a sourceless result is collapsed into the empty group",
    "    const key = `${result.sourceLabel || result.source || result.moduleId}:${result.recordType}`;",
    "    const key = `${searchText(result.sourceLabel || result.source || result.moduleId)}:${searchText(result.recordType)}`;"],
  ["a group loses its label fallback chain",
    '      label: searchText(result.sourceLabel || result.source || result.recordType || result.moduleId) || "Results",',
    '      label: searchText(result.sourceLabel) || "Results",'],
  ["a group loses its final label fallback",
    '      label: searchText(result.sourceLabel || result.source || result.recordType || result.moduleId) || "Results",',
    "      label: searchText(result.sourceLabel || result.source || result.recordType || result.moduleId),"],
  ["a group heading stops naming the group",
    "  heading.textContent = group.label;",
    '  heading.textContent = "";'],

  // --- the filter options -------------------------------------------------------------------------------------
  ["the all-sources option is dropped",
    '    createOption("", "All sources"),',
    ""],
  ["sources stop being de-duplicated",
    "  const modules = [...new Map(state.searchTargets.map((target) => [\n    target.sourceLabel,\n    target.sourceLabel || moduleLabel(target.moduleId),\n  ])).entries()]",
    "  const modules = state.searchTargets.map((target) => [\n    target.sourceLabel,\n    target.sourceLabel || moduleLabel(target.moduleId),\n  ])"],
  ["sources stop being ordered by label",
    "    .sort((left, right) => left[1].localeCompare(right[1]));",
    "    .sort(() => 0);"],
  ["a chosen source that no longer exists is kept",
    '  moduleSelect.value = modules.some(([source]) => source === previousValue) ? previousValue : "";',
    "  moduleSelect.value = previousValue;"],
  ["a chosen source is cleared even when it still exists",
    '  moduleSelect.value = modules.some(([source]) => source === previousValue) ? previousValue : "";',
    '  moduleSelect.value = "";'],
  ["record types stop being narrowed to the chosen source",
    "    .filter((target) => !source || target.sourceLabel === source)",
    "    .filter(() => true)"],
  ["record types are narrowed away when no source is chosen",
    "    .filter((target) => !source || target.sourceLabel === source)",
    "    .filter((target) => target.sourceLabel === source)"],
  ["record types stop being ordered by label",
    "    .sort((left, right) => left.label.localeCompare(right.label));",
    "    .sort(() => 0);"],
  ["the all-record-types option is dropped",
    '    createOption("", "All record types"),',
    ""],
  ["the client control is shown for a workspace with no clients",
    "    clientControl.hidden = clients.length === 0;",
    "    clientControl.hidden = false;"],
  ["the client control is hidden for a workspace that has them",
    "    clientControl.hidden = clients.length === 0;",
    "    clientControl.hidden = true;"],
  ["an inactive client is offered as a filter",
    '    .filter((client) => client.id && client.status !== "Inactive")',
    "    .filter((client) => client.id)"],
  ["a client with no id is offered as a filter",
    '    .filter((client) => client.id && client.status !== "Inactive")',
    '    .filter((client) => client.status !== "Inactive")'],
  ["clients stop being ordered by name",
    "    .sort((left, right) => left.name.localeCompare(right.name));\n}",
    "    .sort(() => 0);\n}"],
  ["a client loses its id-as-name fallback",
    "    .map((client) => ({ id: searchText(client.id), name: searchText(client.name) || searchText(client.id) }))",
    "    .map((client) => ({ id: searchText(client.id), name: searchText(client.name) }))"],
  ["an inactive workspace project is offered as a filter",
    '    if (project.id && project.status !== "Inactive") {\n      projects.push({ id: searchText(project.id), name: searchText(project.name) || searchText(project.id) });',
    '    if (project.id) {\n      projects.push({ id: searchText(project.id), name: searchText(project.name) || searchText(project.id) });'],
  ["a client project loses its client prefix",
    "          name: client.name ? `${searchText(client.name)} / ${projectName}` : projectName,",
    "          name: projectName,"],
  ["a workspace project is read from the client list instead of its own",
    "  for (const project of searchRecordList(data?.workspaceProjects)) {",
    "  for (const project of searchRecordList(data?.clients)) {"],
  ["projects stop being ordered by name",
    "  return projects.sort((left, right) => left.name.localeCompare(right.name));",
    "  return projects;"],

  // --- target normalization -------------------------------------------------------------------------------------
  ["a target with no record type is offered as a filter",
    "      if ((!target.moduleId && !target.sourceLabel) || !target.recordType || seen.has(target.id)) {",
    "      if ((!target.moduleId && !target.sourceLabel) || seen.has(target.id)) {"],
  ["a target with no owner is offered as a filter",
    "      if ((!target.moduleId && !target.sourceLabel) || !target.recordType || seen.has(target.id)) {",
    "      if (!target.recordType || seen.has(target.id)) {"],
  ["duplicate targets stop being collapsed",
    "      if ((!target.moduleId && !target.sourceLabel) || !target.recordType || seen.has(target.id)) {",
    "      if ((!target.moduleId && !target.sourceLabel) || !target.recordType) {"],
  ["a target loses its composed id fallback",
    '      id: searchText(target.id) || `${searchText(target.moduleId)}:${searchText(target.recordType)}`,',
    "      id: searchText(target.id),"],
  ["a target loses its label fallback chain",
    "      label: searchText(target.label || target.sourceLabel || target.recordType),",
    "      label: searchText(target.label),"],
  ["a target loses its source fallback chain",
    "      sourceLabel: searchText(target.sourceLabel || target.label || target.moduleId),",
    "      sourceLabel: searchText(target.sourceLabel),"],
  ["a module id stops being title-cased",
    "    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)",
    "    .map((part) => part)"],
  ["a module id stops being split on its separator",
    '    .split("-")',
    '    .split("_")'],
  ["an absent module id loses its name",
    '    .join(" ") || "Module";',
    '    .join(" ");'],

  // --- the page chrome -------------------------------------------------------------------------------------
  ["a zero searchable-type count is reported as blank",
    "    parts.push(`${body.targetCount} searchable ${body.targetCount === 1 ? \"type\" : \"types\"}`);",
    "    parts.push(`${searchText(body.targetCount)} searchable ${body.targetCount === 1 ? \"type\" : \"types\"}`);"],
  ["the searchable-type count loses its singular",
    '    parts.push(`${body.targetCount} searchable ${body.targetCount === 1 ? "type" : "types"}`);',
    "    parts.push(`${body.targetCount} searchable types`);"],
  ["an absent searchable-type count is reported anyway",
    "  if (body.targetCount !== undefined) {",
    "  if (true) {"],
  ["the backend stops being reported",
    "  if (body.backend) {\n    parts.push(searchText(body.backend));\n  }",
    "  if (false) {\n    parts.push(searchText(body.backend));\n  }"],
  ["paging is shown on a single page of results",
    "  pagination.hidden = state.page <= 1 && !hasMore;",
    "  pagination.hidden = false;"],
  ["paging is hidden when there is a next page",
    "  pagination.hidden = state.page <= 1 && !hasMore;",
    "  pagination.hidden = true;"],
  ["the previous control is enabled on the first page",
    "  previousButton.disabled = state.page <= 1;",
    "  previousButton.disabled = false;"],
  ["the next control is enabled with nothing more to show",
    "  nextButton.disabled = !hasMore;",
    "  nextButton.disabled = false;"],
  ["the page summary stops naming the page",
    "  pageSummary.textContent = `Page ${state.page}`;",
    '  pageSummary.textContent = "Page";'],
  ["index maintenance is revealed without an explicit permission",
    "  const canRebuild = window.LongtailForge?.workspaceContext?.permissionHints?.workspaceSettingsManage === true;",
    "  const canRebuild = Boolean(window.LongtailForge?.workspaceContext?.permissionHints?.workspaceSettingsManage);"],
  ["index maintenance is revealed to everyone",
    "  const canRebuild = window.LongtailForge?.workspaceContext?.permissionHints?.workspaceSettingsManage === true;",
    "  const canRebuild = true;"],
  ["index maintenance is never revealed",
    "    indexMaintenance.hidden = !canRebuild;",
    "    indexMaintenance.hidden = true;"],
  ["a status error stops being marked",
    '  statusMessage.classList.toggle("is-error", isError);',
    '  statusMessage.classList.toggle("is-error", false);'],
  ["a rebuild error stops being marked",
    '  rebuildStatus.classList.toggle("is-error", isError);',
    '  rebuildStatus.classList.toggle("is-error", false);'],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
