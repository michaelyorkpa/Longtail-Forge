import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/search.js");

const LIFTED = [
  "findForm", "findInput", "findSelect", "findButton", "findElement",
  "searchRecord", "searchRecordList", "searchText", "hasResultTargetUrl",
  "emptyFilters", "readFiltersFromUrl", "readFiltersFromControls", "hasSearchCriteria",
  "appendParam", "buildUrlParams", "buildSearchParams", "readPageFromUrl", "updateUrlFromState",
  "normalizeClients", "normalizeProjects", "normalizeSearchTargets", "normalizeTags",
  "moduleLabel", "formatDate", "resultMetaParts",
  "groupResults", "createResultRow", "createResultGroup", "createResultBadgeRow", "createTagChip",
  "createOption", "tagSelectHasValue", "emptyElement",
  "renderMeta", "renderPagination", "setStatus", "setRebuildStatus",
  "populateModuleFilter", "populateRecordTypeFilter", "populateClientProjectFilters",
  "updateIndexMaintenanceVisibility",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {string} [options.search] the page's query string
 * @param {Record<string, unknown>} [options.filters] the filters state already holds
 * @param {Record<string, unknown>[]} [options.searchTargets]
 * @param {Record<string, unknown> | null} [options.clientProjects]
 * @param {number} [options.page]
 * @param {unknown} [options.permissionHints]
 */
function searchCase(options = {}) {
  const document = new FakeDocument();

  /** @param {string} tag */
  const control = (tag) => document.createElement(tag);

  const textInput = control("input");
  const moduleSelect = control("select");
  const recordTypeSelect = control("select");
  const clientSelect = control("select");
  const projectSelect = control("select");
  const tagSelect = control("select");
  const noteCollectionInput = control("input");
  const statusSelect = control("select");
  const clientControl = control("div");
  const indexMaintenance = control("div");
  const rebuildStatus = control("p");
  const statusMessage = control("p");
  const searchMeta = control("p");
  const pagination = control("div");
  const previousButton = control("button");
  const nextButton = control("button");
  const pageSummary = control("span");

  /** @type {string[]} */
  const replacedUrls = [];

  const state = {
    clientProjects: options.clientProjects ?? null,
    filters: options.filters || {
      text: "", source: "", recordType: "", clientId: "",
      projectId: "", tagId: "", noteCollectionId: "", status: "",
    },
    page: options.page ?? 1,
    pageSize: 25,
    searchTargets: options.searchTargets || [],
  };

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    URLSearchParams,
    Date,
    window: {
      location: { search: options.search || "", pathname: "/search.html" },
      history: {
        /** @param {unknown} data @param {unknown} title @param {string} url */
        replaceState: (data, title, url) => replacedUrls.push(url),
      },
      LongtailForge: {
        workspaceContext: { permissionHints: options.permissionHints ?? {} },
      },
    },
    state,
    textInput, moduleSelect, recordTypeSelect, clientSelect, projectSelect, tagSelect,
    noteCollectionInput, statusSelect, clientControl, indexMaintenance, rebuildStatus,
    statusMessage, searchMeta, pagination, previousButton, nextButton, pageSummary,
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);

  /** @param {import("../../scripts/test-support/fake-dom.mjs").FakeElement} select */
  const optionPairs = (select) => select.children.map((option) => [option.value, option.textContent]);

  return {
    api, sandbox, document, state, replacedUrls, optionPairs,
    textInput, moduleSelect, recordTypeSelect, clientSelect, projectSelect, tagSelect,
    noteCollectionInput, statusSelect, clientControl, indexMaintenance, rebuildStatus,
    statusMessage, searchMeta, pagination, previousButton, nextButton, pageSummary,
  };
}

describe("Search control lookups", () => {
  /**
   * **`document.querySelector` answers `Element`**, and this page reads `value`, `disabled` and
   * `hidden` off almost every control. Each helper answers `null` for a node that is not what the
   * page expects, rather than typing it into something it is not.
   */
  it("answers the control only when it is the subtype the page drives", () => {
    const testCase = searchCase();
    const anchor = testCase.document.createElement("a");
    testCase.document.body.appendChild(anchor);
    anchor.setAttribute("data-probe", "");

    for (const helper of ["findForm", "findInput", "findSelect", "findButton", "findElement"]) {
      const answer = testCase.api[helper]("[data-probe]");
      assert.equal(answer, helper === "findElement" ? anchor : null, helper);
    }
  });

  it("answers nothing when the control is absent entirely", () => {
    const testCase = searchCase();
    for (const helper of ["findForm", "findInput", "findSelect", "findButton", "findElement"]) {
      assert.equal(testCase.api[helper]("[data-missing]"), null, helper);
    }
  });

  it("answers each real control to the helper that claims it", () => {
    const testCase = searchCase();
    for (const [tag, helper] of [["form", "findForm"], ["input", "findInput"], ["select", "findSelect"], ["button", "findButton"]]) {
      const node = testCase.document.createElement(tag);
      node.setAttribute("data-one", "");
      testCase.document.body.replaceChildren(node);
      assert.equal(testCase.api[helper]("[data-one]"), node, helper);
    }
  });
});

describe("Search wire readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.searchRecord({ id: "a" })), { id: "a" });
    assert.equal(api.searchRecord(null), null);
    assert.equal(api.searchRecord(["a"]), null);
    assert.equal(api.searchRecord("a"), null);
  });

  it("keeps a malformed list entry as an empty record, leaving the drop to the normalizers", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.searchRecordList([{ id: "a" }, "b", null, 3])), [{ id: "a" }, {}, {}, {}]);
    assert.deepEqual(plain(api.searchRecordList("a")), []);
  });

  it("reads a member as text the way the untyped reads did", () => {
    const { api } = searchCase();
    assert.equal(api.searchText(0), "");
    assert.equal(api.searchText(false), "");
    assert.equal(api.searchText(null), "");
    assert.equal(api.searchText("note"), "note");
    assert.equal(api.searchText(7), "7");
  });

  /** The one nested member this page names, because its own contract pins the claim. */
  it("recognises a result target only when it carries a non-empty url string", () => {
    const { api } = searchCase();
    assert.equal(api.hasResultTargetUrl({ url: "/notes.html?note=1" }), true);
    assert.equal(api.hasResultTargetUrl({ url: "" }), false);
    assert.equal(api.hasResultTargetUrl({ url: 7 }), false);
    assert.equal(api.hasResultTargetUrl({}), false);
    assert.equal(api.hasResultTargetUrl(null), false);
    assert.equal(api.hasResultTargetUrl("/notes.html"), false);
  });
});

describe("Search filter round trip", () => {
  const populated = {
    text: "invoice", source: "notes", recordType: "note", clientId: "c1",
    projectId: "p1", tagId: "t1", noteCollectionId: "col1", status: "active",
  };

  it("reads every filter out of the url", () => {
    const testCase = searchCase({
      search: "?text=invoice&source=notes&recordType=note&clientId=c1&projectId=p1&tagId=t1&noteCollectionId=col1&status=active",
    });
    assert.deepEqual(plain(testCase.api.readFiltersFromUrl()), populated);
  });

  /** Each filter accepts more than one query name, which is what makes shared links work. */
  it("accepts every alias the page publishes", () => {
    const aliases = searchCase({
      search: "?q=invoice&type=note&client=c1&project=p1&tag=t1&collection=col1&recordStatus=active",
    });
    assert.deepEqual(plain(aliases.api.readFiltersFromUrl()), { ...populated, source: "" });

    const more = searchCase({ search: "?query=invoice&note_collection_id=col1" });
    const read = plain(more.api.readFiltersFromUrl());
    assert.equal(read.text, "invoice");
    assert.equal(read.noteCollectionId, "col1");
  });

  it("prefers the canonical query name over its aliases", () => {
    const testCase = searchCase({ search: "?text=canonical&q=alias&query=other" });
    assert.equal(testCase.api.readFiltersFromUrl().text, "canonical");
  });

  it("answers every filter empty when the url carries none", () => {
    const testCase = searchCase({ search: "" });
    assert.deepEqual(plain(testCase.api.readFiltersFromUrl()), plain(testCase.api.emptyFilters()));
  });

  it("writes the filters onto the controls and reads the same ones back", () => {
    const testCase = searchCase({ filters: populated });
    testCase.textInput.value = "invoice";
    testCase.moduleSelect.value = "notes";
    testCase.recordTypeSelect.value = "note";
    testCase.clientSelect.value = "c1";
    testCase.projectSelect.value = "p1";
    testCase.tagSelect.value = "t1";
    testCase.noteCollectionInput.value = "col1";
    testCase.statusSelect.value = "active";
    assert.deepEqual(plain(testCase.api.readFiltersFromControls()), populated);
  });

  it("trims the two free-text controls and only those", () => {
    const testCase = searchCase();
    testCase.textInput.value = "  invoice  ";
    testCase.noteCollectionInput.value = "  col1  ";
    testCase.moduleSelect.value = "  notes  ";
    const read = plain(testCase.api.readFiltersFromControls());
    assert.equal(read.text, "invoice");
    assert.equal(read.noteCollectionId, "col1");
    assert.equal(read.source, "  notes  ", "a select's value is whatever the option carried");
  });

  it("knows when any filter is set, and when none is", () => {
    const { api } = searchCase();
    assert.equal(api.hasSearchCriteria(api.emptyFilters()), false);
    assert.equal(api.hasSearchCriteria({ ...api.emptyFilters(), text: "   " }), false, "whitespace is not criteria");
    assert.equal(api.hasSearchCriteria({ ...api.emptyFilters(), text: "x" }), true);
    assert.equal(api.hasSearchCriteria({ ...api.emptyFilters(), tagId: "t1" }), true);
  });
});

describe("Search url and request parameters", () => {
  it("carries only the filters that are set", () => {
    const testCase = searchCase({ filters: { ...searchCase().api.emptyFilters(), text: "invoice", tagId: "t1" } });
    assert.equal(testCase.api.buildUrlParams().toString(), "text=invoice&tagId=t1");
  });

  it("names every filter by its canonical query name", () => {
    const testCase = searchCase({
      filters: {
        text: "a", source: "b", recordType: "c", clientId: "d",
        projectId: "e", tagId: "f", noteCollectionId: "g", status: "h",
      },
    });
    assert.equal(
      testCase.api.buildUrlParams().toString(),
      "text=a&source=b&recordType=c&clientId=d&projectId=e&tagId=f&noteCollectionId=g&status=h",
    );
  });

  it("omits the first page and carries every later one", () => {
    const first = searchCase({ page: 1 });
    assert.equal(first.api.buildUrlParams().has("page"), false);
    const later = searchCase({ page: 3 });
    assert.equal(later.api.buildUrlParams().get("page"), "3");
  });

  /** The request carries the page size; the shareable URL does not. */
  it("adds the page size to the request but not to the url", () => {
    const testCase = searchCase({ filters: { ...searchCase().api.emptyFilters(), text: "x" } });
    assert.equal(testCase.api.buildSearchParams().get("limit"), "25");
    assert.equal(testCase.api.buildUrlParams().has("limit"), false);
  });

  it("replaces the url without adding a history entry, and drops a bare query", () => {
    const withFilters = searchCase({ filters: { ...searchCase().api.emptyFilters(), text: "x" } });
    withFilters.api.updateUrlFromState();
    assert.deepEqual(withFilters.replacedUrls, ["/search.html?text=x"]);

    const bare = searchCase();
    bare.api.updateUrlFromState();
    assert.deepEqual(bare.replacedUrls, ["/search.html"], "no trailing question mark when nothing is set");
  });

  it("reads a usable page from the url and refuses the rest", () => {
    assert.equal(searchCase({ search: "?page=4" }).api.readPageFromUrl(), 4);
    assert.equal(searchCase({ search: "?page=0" }).api.readPageFromUrl(), 1);
    assert.equal(searchCase({ search: "?page=-2" }).api.readPageFromUrl(), 1);
    assert.equal(searchCase({ search: "?page=abc" }).api.readPageFromUrl(), 1);
    assert.equal(searchCase({ search: "" }).api.readPageFromUrl(), 1);
  });

  it("appends a parameter only when it carries a value", () => {
    const { api } = searchCase();
    const params = new URLSearchParams();
    api.appendParam(params, "text", "x");
    api.appendParam(params, "empty", "");
    assert.equal(params.toString(), "text=x");
  });
});

describe("Search result rows", () => {
  const linked = { title: "Invoice note", target: { url: "/notes.html?note=1" }, sourceLabel: "Notes", status: "active" };

  /** A result with somewhere to go is a link; one without is plain text, not a dead link. */
  it("builds an anchor for a result with a target and a span for one without", () => {
    const testCase = searchCase();
    const withTarget = testCase.api.createResultRow(linked);
    assert.equal(withTarget.children[0].tagName, "A");
    assert.equal(withTarget.children[0].href, "/notes.html?note=1");

    const withoutTarget = testCase.api.createResultRow({ title: "Orphan" });
    assert.equal(withoutTarget.children[0].tagName, "SPAN");
    assert.equal(withoutTarget.children[0].href, undefined);
  });

  it("builds a span, and assigns no href, for a target whose url is unusable", () => {
    const testCase = searchCase();
    for (const target of [{ url: "" }, { url: 7 }, {}, "url"]) {
      const row = testCase.api.createResultRow({ title: "T", target });
      assert.equal(row.children[0].tagName, "SPAN", JSON.stringify(target));
      assert.equal(row.children[0].href, undefined);
    }
  });

  it("titles a result that carries none", () => {
    const testCase = searchCase();
    assert.equal(testCase.api.createResultRow({}).children[0].textContent, "Untitled result");
  });

  it("names the source through its three fallbacks and defaults the status to active", () => {
    const testCase = searchCase();
    const badges = (/** @type {Record<string, unknown>} */ result) => testCase.api.createResultRow(result).children[1].children;
    assert.equal(badges({ sourceLabel: "Notes", source: "notes", recordType: "note" })[0].textContent, "Notes");
    assert.equal(badges({ source: "notes", recordType: "note" })[0].textContent, "notes");
    assert.equal(badges({ recordType: "note" })[0].textContent, "note");
    assert.equal(badges({})[0].textContent, "Result");
    assert.equal(badges({})[1].textContent, "active");
  });

  it("prefers a snippet over a summary and shows neither as empty", () => {
    const testCase = searchCase();
    const snippet = (/** @type {Record<string, unknown>} */ r) => testCase.api.createResultRow(r).children[2].textContent;
    assert.equal(snippet({ snippet: "S", summary: "U" }), "S");
    assert.equal(snippet({ summary: "U" }), "U");
    assert.equal(snippet({}), "");
  });

  it("appends a tag row only when the result carries usable tags", () => {
    const testCase = searchCase();
    const withTags = testCase.api.createResultRow({ ...linked, tags: [{ name: "Billable" }] });
    assert.equal(withTags.children.length, 5);
    const withoutTags = testCase.api.createResultRow({ ...linked, tags: [{}, null, "x"] });
    assert.equal(withoutTags.children.length, 4, "a tag with no name, slug or id is not a tag");
  });

  it("names a tag chip through its own fallbacks", () => {
    const { api } = searchCase();
    assert.equal(api.createTagChip({ name: "Billable", slug: "billable" }).textContent, "Billable");
    assert.equal(api.createTagChip({ slug: "billable" }).textContent, "billable");
    assert.equal(api.createTagChip({}).textContent, "Tag");
  });

  it("keeps only tags that carry a name, a slug or an id", () => {
    const { api } = searchCase();
    assert.equal(api.normalizeTags([{ name: "a" }, { slug: "b" }, { tagId: "c" }, {}, null, "d"]).length, 3);
    assert.deepEqual(plain(api.normalizeTags("not-a-list")), []);
  });
});

describe("Search result meta", () => {
  it("reads the client name through the result context or its project", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.resultMetaParts({ context: { client: { name: "Acme" } } })), ["Acme"]);
    assert.deepEqual(plain(api.resultMetaParts({ context: { project: { clientName: "Acme" } } })), ["Acme"]);
  });

  it("orders the client, the project, the collection and the update", () => {
    const { api } = searchCase();
    assert.deepEqual(
      plain(api.resultMetaParts({
        context: { client: { name: "Acme" }, project: { name: "Rebuild" } },
        collectionPath: "Handbook / Onboarding",
        updatedAt: "2026-09-13T12:00:00.000Z",
      })).slice(0, 3),
      ["Acme", "Rebuild", "Handbook / Onboarding"],
    );
  });

  it("reports the update time last, and only when the result carries one", () => {
    const { api } = searchCase();
    const parts = plain(api.resultMetaParts({ collectionPath: "Handbook", updatedAt: "2026-09-13T12:00:00.000Z" }));
    assert.equal(parts.length, 2);
    assert.match(parts[1], /^Updated .*2026/);
    assert.deepEqual(plain(api.resultMetaParts({ collectionPath: "Handbook" })), ["Handbook"]);
  });

  it("omits each part the result does not carry", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.resultMetaParts({})), []);
    assert.deepEqual(plain(api.resultMetaParts({ context: "not-a-record" })), []);
  });

  /**
   * **The numeric branch is kept separate on purpose**: `new Date(1700000000000)` is an instant
   * while `new Date("1700000000000")` is not a date at all.
   */
  it("formats an epoch number as a date rather than echoing it", () => {
    const { api } = searchCase();
    assert.match(api.formatDate(1757764800000), /20\d\d/);
    assert.match(api.formatDate("2026-09-13T12:00:00.000Z"), /2026/);
    assert.equal(api.formatDate("not-a-date"), "not-a-date");
    assert.equal(api.formatDate(""), "");
    assert.equal(api.formatDate(null), "");
  });
});

describe("Search result grouping", () => {
  const results = [
    { sourceLabel: "Notes", recordType: "note", title: "A" },
    { sourceLabel: "Notes", recordType: "note", title: "B" },
    { sourceLabel: "Notes", recordType: "collection", title: "C" },
    { source: "tasks", recordType: "task", title: "D" },
  ];

  it("groups by source and record type together, keeping order", () => {
    const { api } = searchCase();
    const groups = plain(api.groupResults(results));
    assert.deepEqual(groups.map((/** @type {{label: string}} */ g) => g.label), ["Notes", "Notes", "tasks"]);
    assert.deepEqual(groups.map((/** @type {{results: unknown[]}} */ g) => g.results.length), [2, 1, 1]);
  });

  it("labels a group through the same fallbacks a row uses", () => {
    const { api } = searchCase();
    assert.equal(plain(api.groupResults([{ recordType: "note" }]))[0].label, "note");
    assert.equal(plain(api.groupResults([{ moduleId: "notes" }]))[0].label, "notes");
    assert.equal(plain(api.groupResults([{}]))[0].label, "Results");
  });

  /**
   * The key is interpolated rather than coerced, so a result carrying none of the three source
   * members keeps its own distinct key instead of collapsing into the empty one.
   */
  it("keeps a sourceless result in its own group", () => {
    const { api } = searchCase();
    const groups = plain(api.groupResults([{ recordType: "note", title: "A" }, {}]));
    assert.equal(groups.length, 2);
    assert.match(source, /const key = `\$\{result\.sourceLabel \|\| result\.source \|\| result\.moduleId\}:\$\{result\.recordType\}`/);
  });

  it("heads each group with its label", () => {
    const testCase = searchCase();
    const section = testCase.api.createResultGroup({ label: "Notes", results: [{ title: "A" }] });
    assert.equal(section.children[0].textContent, "Notes");
    assert.equal(section.children[1].children.length, 1);
  });
});

describe("Search filter population", () => {
  // Deliberately not in sorted order: a no-op sort must not be able to pass these.
  const searchTargets = [
    { id: "t:task", label: "Task", moduleId: "tasks", recordType: "task", sourceLabel: "Tasks" },
    { id: "n:note", label: "Note", moduleId: "notes", recordType: "note", sourceLabel: "Notes" },
    { id: "n:col", label: "Collection", moduleId: "notes", recordType: "collection", sourceLabel: "Notes" },
  ];

  it("offers each distinct source once, sorted, behind an all-sources option", () => {
    const testCase = searchCase({ searchTargets });
    testCase.api.populateModuleFilter();
    assert.deepEqual(testCase.optionPairs(testCase.moduleSelect), [
      ["", "All sources"], ["Notes", "Notes"], ["Tasks", "Tasks"],
    ]);
  });

  it("keeps the chosen source when it still exists and clears it when it does not", () => {
    const kept = searchCase({ searchTargets, filters: { ...searchCase().api.emptyFilters(), source: "Tasks" } });
    kept.api.populateModuleFilter();
    assert.equal(kept.moduleSelect.value, "Tasks");

    const cleared = searchCase({ searchTargets, filters: { ...searchCase().api.emptyFilters(), source: "Gone" } });
    cleared.api.populateModuleFilter();
    assert.equal(cleared.moduleSelect.value, "");
  });

  it("narrows the record types to the chosen source", () => {
    const testCase = searchCase({ searchTargets });
    testCase.moduleSelect.value = "Notes";
    testCase.api.populateRecordTypeFilter();
    assert.deepEqual(testCase.optionPairs(testCase.recordTypeSelect), [
      ["", "All record types"], ["collection", "Collection"], ["note", "Note"],
    ]);
  });

  it("offers every record type when no source is chosen", () => {
    const testCase = searchCase({ searchTargets });
    testCase.api.populateRecordTypeFilter();
    assert.equal(testCase.recordTypeSelect.children.length, 4);
  });

  it("hides the client control when the workspace has no clients", () => {
    const without = searchCase({ clientProjects: { clients: [] } });
    without.api.populateClientProjectFilters();
    assert.equal(without.clientControl.hidden, true);

    const withClients = searchCase({ clientProjects: { clients: [{ id: "c1", name: "Acme" }] } });
    withClients.api.populateClientProjectFilters();
    assert.equal(withClients.clientControl.hidden, false);
  });

  it("offers clients and projects behind their all-options, sorted by name", () => {
    const testCase = searchCase({
      clientProjects: {
        clients: [{ id: "c2", name: "Beta" }, { id: "c1", name: "Acme" }],
        workspaceProjects: [{ id: "p1", name: "Shared" }],
      },
    });
    testCase.api.populateClientProjectFilters();
    assert.deepEqual(testCase.optionPairs(testCase.clientSelect), [["", "All clients"], ["c1", "Acme"], ["c2", "Beta"]]);
    assert.deepEqual(testCase.optionPairs(testCase.projectSelect), [["", "All projects"], ["p1", "Shared"]]);
  });

  /** An inactive client or project is not an option; the filters must not offer what cannot match. */
  it("refuses an inactive client or project", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.normalizeClients({ clients: [{ id: "c1", name: "A", status: "Inactive" }] })), []);
    assert.deepEqual(plain(api.normalizeProjects({ workspaceProjects: [{ id: "p1", name: "P", status: "Inactive" }] })), []);
    assert.equal(api.normalizeClients({ clients: [{ name: "No id" }] }).length, 0);
  });

  it("prefixes a client's project with the client name and leaves a workspace project bare", () => {
    const { api } = searchCase();
    const projects = plain(api.normalizeProjects({
      workspaceProjects: [{ id: "p0", name: "Shared" }],
      clients: [{ id: "c1", name: "Acme", projects: [{ id: "p1", name: "Rebuild" }] }],
    }));
    assert.deepEqual(projects.map((/** @type {{name: string}} */ p) => p.name), ["Acme / Rebuild", "Shared"]);
  });

  it("names a client or project by its id when it carries no name", () => {
    const { api } = searchCase();
    assert.equal(plain(api.normalizeClients({ clients: [{ id: "c1" }] }))[0].name, "c1");
    assert.equal(plain(api.normalizeProjects({ workspaceProjects: [{ id: "p1" }] }))[0].name, "p1");
  });

  it("answers nothing for options that are not a record at all", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.normalizeClients(null)), []);
    assert.deepEqual(plain(api.normalizeProjects(null)), []);
  });

  it("answers whether the tag select already offers a value", () => {
    const testCase = searchCase();
    testCase.tagSelect.appendChild(testCase.api.createOption("t1", "Billable"));
    assert.equal(testCase.api.tagSelectHasValue("t1"), true);
    assert.equal(testCase.api.tagSelectHasValue("t2"), false);
  });
});

describe("Search target normalization", () => {
  it("fills each member through its own fallbacks", () => {
    const { api } = searchCase();
    const [target] = plain(api.normalizeSearchTargets([{ moduleId: "notes", recordType: "note" }]));
    assert.deepEqual(target, { id: "notes:note", label: "note", moduleId: "notes", recordType: "note", sourceLabel: "notes" });
  });

  /** A target with no record type cannot be filtered on, and one with no owner cannot be labelled. */
  it("drops a target that names no record type or no owner", () => {
    const { api } = searchCase();
    assert.equal(api.normalizeSearchTargets([{ moduleId: "notes" }]).length, 0);
    assert.equal(api.normalizeSearchTargets([{ recordType: "note" }]).length, 0);
    assert.equal(api.normalizeSearchTargets([{ sourceLabel: "Notes", recordType: "note" }]).length, 1);
  });

  it("keeps the first of two targets that share an id", () => {
    const { api } = searchCase();
    const targets = plain(api.normalizeSearchTargets([
      { id: "same", moduleId: "notes", recordType: "note", label: "First" },
      { id: "same", moduleId: "notes", recordType: "note", label: "Second" },
    ]));
    assert.equal(targets.length, 1);
    assert.equal(targets[0].label, "First");
  });

  it("answers nothing for a value that is not a list", () => {
    const { api } = searchCase();
    assert.deepEqual(plain(api.normalizeSearchTargets("targets")), []);
    assert.deepEqual(plain(api.normalizeSearchTargets()), []);
  });

  it("titles a module id and names an absent one", () => {
    const { api } = searchCase();
    assert.equal(api.moduleLabel("time-tracking"), "Time Tracking");
    assert.equal(api.moduleLabel("notes"), "Notes");
    assert.equal(api.moduleLabel(""), "Module");
    assert.equal(api.moduleLabel(null), "Module");
  });
});

describe("Search page chrome", () => {
  it("reports the searchable type count with its singular and plural", () => {
    const one = searchCase();
    one.api.renderMeta({ targetCount: 1 });
    assert.equal(one.searchMeta.textContent, "1 searchable type");

    const many = searchCase();
    many.api.renderMeta({ targetCount: 4, backend: "sqlite" });
    assert.equal(many.searchMeta.textContent, "4 searchable types - sqlite");
  });

  it("reports a zero count rather than omitting it", () => {
    const testCase = searchCase();
    testCase.api.renderMeta({ targetCount: 0 });
    assert.equal(testCase.searchMeta.textContent, "0 searchable types");
  });

  it("says nothing when the response carries neither count nor backend", () => {
    const testCase = searchCase();
    testCase.api.renderMeta({});
    assert.equal(testCase.searchMeta.textContent, "");
  });

  it("shows paging only when there is somewhere to go", () => {
    const first = searchCase({ page: 1 });
    first.api.renderPagination(false);
    assert.equal(first.pagination.hidden, true);

    const hasNext = searchCase({ page: 1 });
    hasNext.api.renderPagination(true);
    assert.deepEqual(
      [hasNext.pagination.hidden, hasNext.previousButton.disabled, hasNext.nextButton.disabled],
      [false, true, false],
    );

    const later = searchCase({ page: 2 });
    later.api.renderPagination(false);
    assert.deepEqual(
      [later.pagination.hidden, later.previousButton.disabled, later.nextButton.disabled, later.pageSummary.textContent],
      [false, false, true, "Page 2"],
    );
  });

  /** The rebuild control is an administrator action, so an unstated hint must not reveal it. */
  it("reveals index maintenance only for an explicit manage permission", () => {
    const allowed = searchCase({ permissionHints: { workspaceSettingsManage: true } });
    allowed.api.updateIndexMaintenanceVisibility();
    assert.equal(allowed.indexMaintenance.hidden, false);

    for (const hints of [{}, { workspaceSettingsManage: false }, { workspaceSettingsManage: "true" }, { workspaceSettingsManage: 1 }]) {
      const refused = searchCase({ permissionHints: hints });
      refused.api.updateIndexMaintenanceVisibility();
      assert.equal(refused.indexMaintenance.hidden, true, JSON.stringify(hints));
    }
  });

  it("marks an error on each status line and clears it again", () => {
    const testCase = searchCase();
    testCase.api.setStatus("Loading search results");
    assert.equal(testCase.statusMessage.classList.contains("is-error"), false);
    testCase.api.setStatus("Search results unavailable.", true);
    assert.equal(testCase.statusMessage.classList.contains("is-error"), true);

    testCase.api.setRebuildStatus("Index rebuild queued.");
    assert.equal(testCase.rebuildStatus.textContent, "Index rebuild queued.");
    testCase.api.setRebuildStatus("Search index rebuild failed.", true);
    assert.equal(testCase.rebuildStatus.classList.contains("is-error"), true);
  });
});

describe("Search shapes this page states rather than invents", () => {
  /**
   * The result rows and the client/project options are untrusted wire values whose vocabularies
   * belong to the contributing module, so the page states only that it reads from a record. What
   * it names precisely is what its own producers write.
   */
  it("reads responses as unguaranteed records and names only what it produces", () => {
    assert.match(source, /@typedef \{Record<string, unknown>\} SearchRecord/);
    assert.match(source, /@typedef \{object\} SearchFilters/);
    assert.match(source, /@typedef \{object\} SearchTarget/);
    const contracts = reader.readText("src/types/browser-contracts.d.ts");
    assert.match(contracts, /searchTargets: unknown\[\];/,
      "the published context leaves the target list unknown on purpose");
  });

  /**
   * `document.querySelector` answers `Element`, and this page reads `value`, `disabled` and
   * `hidden` off almost every control - which is where its DOM-family diagnostics came from.
   */
  it("routes all twenty-one control lookups through a checked helper", () => {
    for (const helper of ["findForm", "findInput", "findSelect", "findButton", "findElement"]) {
      assert.equal((source.match(new RegExp(`function ${helper}\\(selector\\)`, "g")) || []).length, 1);
    }
    const lookups = source.match(/^const \w+ = find(?:Form|Input|Select|Button|Element)\(/gm) || [];
    assert.equal(lookups.length, 21);
    assert.equal(/^const \w+ = document\.querySelector\(/m.test(source), false,
      "and none is left as a raw query");
  });

  it("names the one nested result member its own contract pins", () => {
    assert.match(source, /function hasResultTargetUrl\(value\)/);
    assert.match(source, /title\.href = result\.target\.url;/);
  });

  it("carries no suppression and no snake_case wire member", () => {
    assert.doesNotMatch(source, /body_text|tags_text/);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
