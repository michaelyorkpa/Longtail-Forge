import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The `GET /api/lists` summary collection, closed by `0.33.33.38.4.7.2.2`.
 *
 * **The collection decides which lists the page loads**, which is why a malformed summary refuses
 * the whole body rather than being filtered away: dropping one and rendering the rest would
 * present a shortened collection as a complete one and the user would have no way to tell. An
 * empty `lists` array is a legitimate answer.
 *
 * `isListSummary` is reused rather than copied. Both `GET /api/lists` and `GET /api/lists/:id`
 * shape their rows through `shapeListsForBrowser`; the collection route adds tag decoration,
 * canonical filtering and sorting on top, none of which changes a shaped member.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const listsSource = read("public/js/lists.js");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * A function body with its comments removed, so a claim about executed code cannot be satisfied
 * by prose that happens to name the same call.
 * @param {string} body
 */
function executableBody(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** @param {string} source @param {string} name */
function constant(source, name) {
  const start = source.indexOf("  const " + name + " = ");
  assert.notEqual(start, -1, name + " must exist");
  return source.slice(start, source.indexOf("]);", start) + 4);
}

/** The shipped column tables and record predicates, lifted together. */
const PREDICATE_PARTS = [
  constant(listsSource, "LIST_TEXT_COLUMNS"),
  constant(listsSource, "LIST_NULLABLE_COLUMNS"),
  constant(listsSource, "LIST_SHAPED_BOOLEANS"),
  constant(listsSource, "ITEM_TEXT_COLUMNS"),
  constant(listsSource, "ITEM_NULLABLE_COLUMNS"),
  constant(listsSource, "LINK_TEXT_COLUMNS"),
  constant(listsSource, "LINK_NULLABLE_COLUMNS"),
  slice(listsSource, "function isResponseRecord(value) {"),
  slice(listsSource, "function hasListText(value, columns) {"),
  slice(listsSource, "function hasListNullableText(value, columns) {"),
  slice(listsSource, "function isListSummary(value) {"),
  slice(listsSource, "function isListItem(value) {"),
  slice(listsSource, "function isListLink(value) {"),
];

/** The shipped summary reader. */
function liftReader() {
  return new Function([...PREDICATE_PARTS, slice(listsSource, "function readListSummaries(body) {"),
    "  return readListSummaries;"].join("\n"))();
}

/**
 * The shipped `loadLists`, over the shipped reader and predicate, with a controllable detail
 * loader and API client.
 * @param {{ body?: unknown, detail?: Function }} wiring
 */
function liftLoadLists({ body, detail }) {
  /** @type {{ lists: unknown[] }} */
  const state = { lists: ["the previous collection"] };
  /** @type {string[]} */
  const routes = [];
  const built = new Function("state", "requireApi", "buildListQueryParams", "loadListDetail", [
    ...PREDICATE_PARTS,
    slice(listsSource, "function readListSummaries(body) {"),
    slice(listsSource, "function isLoadedListRecord(record) {"),
    slice(listsSource, "async function loadLists() {"),
    "  return loadLists;",
  ].join("\n"));
  const loadLists = built(
    state,
    () => ({
      getJson: (/** @type {string} */ route) => {
        routes.push(route);
        return Promise.resolve(body);
      },
    }),
    () => "status=active&type=all",
    detail || ((/** @type {string} */ listId) => Promise.resolve({ list_id: listId })),
  );
  return { loadLists, routes, state };
}

/**
 * The shipped detail loader, over the shipped detail reader and normaliser.
 * @param {(route: string, init?: unknown) => Promise<unknown>} respond
 */
function liftLoadListDetail(respond) {
  const built = new Function("requireApi", "encodeURIComponent", [
    ...PREDICATE_PARTS,
    slice(listsSource, "function readListDetail(body) {"),
    slice(listsSource, "function normalizeListRecord(list = {}, items = [], links = []) {"),
    slice(listsSource, "function normalizeListProgress(progress = {}, items = []) {"),
    slice(listsSource, "function nextNeededDateFromItems(items = []) {"),
    slice(listsSource, "async function loadListDetail(listId, fallback = null) {"),
    "  return loadListDetail;",
  ].join("\n"));
  return built(() => ({ getJson: respond }), globalThis.encodeURIComponent);
}

/** One list exactly as `shapeListsForBrowser` emits it. */
function wireSummary(overrides = {}) {
  return {
    archived_at: null,
    client_id: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_user_id: null,
    deleted_at: null,
    description: null,
    duplicated_from_list_id: null,
    finalized_at: null,
    finalized_by_user_id: null,
    id: "list-1",
    isBillOfMaterials: false,
    isReusable: true,
    is_reusable: 1,
    links: [],
    list_id: "list-1",
    list_type: "checklist",
    metadata_json: null,
    progress: { totalItemCount: 0 },
    project_id: null,
    resumeContext: { sourceUrl: "" },
    sourceContext: { duplicatedFrom: null, sourceList: null },
    source_list_id: null,
    status: "active",
    title: "Kitchen restock",
    updated_at: "2026-01-02T00:00:00.000Z",
    updated_by_user_id: null,
    workspace_id: "ws-1",
    ...overrides,
  };
}

describe("what the collection reader accepts", () => {
  it("accepts an empty collection as a legitimate answer", () => {
    assert.deepEqual(liftReader()({ lists: [], query: {} }), []);
  });

  it("accepts a populated collection and returns the array by identity", () => {
    const lists = [wireSummary(), wireSummary({ id: "list-2", list_id: "list-2" })];
    const body = { lists, query: { status: "active" } };
    const answer = liftReader()(body);

    assert.equal(answer, lists, "the array itself is handed back, not a copy");
    assert.equal(answer[0], lists[0], "and so are its elements");
    assert.equal(answer.length, 2);
  });

  it("carries richer producer fields the page later spreads", () => {
    const lists = [wireSummary({ tags: [{ tag_id: "t1" }], someLaterColumn: 7 })];
    const answer = liftReader()({ lists });
    assert.deepEqual(answer[0].tags, [{ tag_id: "t1" }], "tag decoration survives");
    assert.equal(answer[0].someLaterColumn, 7);
  });

  it("keeps the wire column numeric, because that is what the shaper sends", () => {
    const answer = liftReader()({ lists: [wireSummary({ is_reusable: 1 })] });
    assert.equal(answer[0].is_reusable, 1, "the reader does not coerce; the normaliser does");
    assert.equal(typeof answer[0].is_reusable, "number");
  });
});

describe("what the collection reader refuses", () => {
  const rejected = /** @type {const} */ ([
    ["a non-object body", "not-a-body"],
    ["a null body", null],
    ["an array body", [wireSummary()]],
    ["a body with no lists member", { query: {} }],
    ["a lists member that is not an array", { lists: {} }],
    ["a summary that is not an object", { lists: ["list-1"] }],
    ["a summary missing a required column", { lists: [wireSummary({ title: undefined })] }],
    ["a summary whose required column is null", { lists: [wireSummary({ status: null })] }],
    ["a summary whose numeric column is text", { lists: [wireSummary({ is_reusable: "1" })] }],
    ["a summary whose shaped boolean is missing", { lists: [wireSummary({ isReusable: undefined })] }],
    ["a summary whose links member is not an array", { lists: [wireSummary({ links: null })] }],
    ["a summary with an empty list_id", { lists: [wireSummary({ list_id: "" })] }],
    ["one malformed summary among valid ones", { lists: [wireSummary(), { title: "partial" }] }],
  ]);

  for (const [name, body] of rejected) {
    it(`refuses ${name}`, () => {
      assert.throws(() => liftReader()(body), /^Error: The list collection could not be read\.$/);
    });
  }

  it("refuses the whole collection rather than displaying a shortened one", () => {
    // Filtering the bad row would render one list and look like a complete answer.
    const body = { lists: [wireSummary(), { title: "partial" }, wireSummary({ id: "list-3", list_id: "list-3" })] };
    assert.throws(() => liftReader()(body), /could not be read/);
  });
});

describe("the collection load", () => {
  it("loads one detail per summary and stores the results", async () => {
    /** @type {string[]} */
    const requested = [];
    const { loadLists, routes, state } = liftLoadLists({
      body: { lists: [wireSummary(), wireSummary({ id: "list-2", list_id: "list-2" })] },
      detail: (/** @type {string} */ listId) => {
        requested.push(listId);
        return Promise.resolve({ list_id: listId });
      },
    });
    await loadLists();

    assert.deepEqual(requested, ["list-1", "list-2"], "one request per summary");
    assert.equal(routes.length, 1, "and one request for the collection itself");
    assert.match(routes[0], /^\/api\/lists\?status=active&type=all$/, "with the page's own filters");
    assert.deepEqual(state.lists, [{ list_id: "list-1" }, { list_id: "list-2" }]);
  });

  it("keeps the server's order even when details resolve out of order", async () => {
    /** @type {Array<() => void>} */
    const resolvers = [];
    const { loadLists, state } = liftLoadLists({
      body: {
        lists: [wireSummary({ id: "a", list_id: "a" }), wireSummary({ id: "b", list_id: "b" }),
          wireSummary({ id: "c", list_id: "c" })],
      },
      detail: (/** @type {string} */ listId) => new Promise((resolve) => {
        resolvers.push(() => resolve({ list_id: listId }));
      }),
    });
    const pending = loadLists();
    // The detail promises are not created until the collection request has settled.
    while (resolvers.length < 3) {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    // Resolve last, then first, then middle.
    resolvers[2]();
    resolvers[0]();
    resolvers[1]();
    await pending;

    assert.deepEqual(/** @type {{ list_id: string }[]} */ (state.lists).map((entry) => entry.list_id),
      ["a", "b", "c"], "canonical server ordering survives out-of-order resolution");
  });

  it("drops only the rows whose detail answered nothing", async () => {
    const { loadLists, state } = liftLoadLists({
      body: { lists: [wireSummary({ id: "a", list_id: "a" }), wireSummary({ id: "b", list_id: "b" })] },
      detail: (/** @type {string} */ listId) => Promise.resolve(listId === "a" ? { list_id: "a" } : null),
    });
    await loadLists();
    assert.deepEqual(state.lists, [{ list_id: "a" }]);
  });

  it("stores an empty collection for an empty answer", async () => {
    const { loadLists, state } = liftLoadLists({ body: { lists: [] } });
    await loadLists();
    assert.deepEqual(state.lists, []);
  });

  it("leaves the previous collection in place when the body cannot be read", async () => {
    for (const body of [{ query: {} }, { lists: {} }, { lists: [{ title: "partial" }] }]) {
      const { loadLists, state } = liftLoadLists({ body });
      await assert.rejects(() => loadLists(), /could not be read/);
      assert.deepEqual(state.lists, ["the previous collection"],
        "no partial assignment from an incomplete load");
    }
  });

  it("validates the collection before issuing any detail request", async () => {
    let details = 0;
    const { loadLists } = liftLoadLists({
      body: { lists: [wireSummary(), { title: "partial" }] },
      detail: () => { details += 1; return Promise.resolve(null); },
    });
    await assert.rejects(() => loadLists());
    assert.equal(details, 0, "a refused collection issues no detail requests at all");
  });
});

describe("the detail load and its summary fallback", () => {
  it("normalizes a successful detail response", async () => {
    const loadListDetail = liftLoadListDetail(() => Promise.resolve({
      items: [], links: [], list: wireSummary({ title: "Loaded" }),
    }));
    const record = await loadListDetail("list-1", null);

    assert.equal(record.title, "Loaded");
    assert.equal(record.is_reusable, true, "the numeric wire column becomes the page boolean");
    assert.equal(record.list_id, "list-1");
  });

  it("falls back to the summary when the detail request rejects", async () => {
    const loadListDetail = liftLoadListDetail(() => Promise.reject(new Error("offline")));
    const summary = wireSummary({ title: "From the collection" });
    const record = await loadListDetail("list-1", summary);

    assert.equal(record.title, "From the collection", "the list is still rendered");
    assert.equal(record.is_reusable, true, "and still normalized");
    assert.deepEqual(record.items, [], "with no items, because the detail never arrived");
  });

  it("answers null only when there is no summary to fall back to", async () => {
    const loadListDetail = liftLoadListDetail(() => Promise.reject(new Error("offline")));
    assert.equal(await loadListDetail("list-1", null), null);
  });

  it("keeps the detail route's own tolerant policy, which this child does not tighten", async () => {
    // `readListDetail` filters malformed items and answers `list: undefined` for a body it cannot
    // read. That is `0.33.33.38.4.7.1`'s policy and it is deliberately left alone here.
    const loadListDetail = liftLoadListDetail(() => Promise.resolve({ items: ["bad"], links: [], list: null }));
    const record = await loadListDetail("list-1", null);
    assert.deepEqual(record.items, [], "a malformed item is dropped, not refused");
    assert.equal(record.list_id, undefined, "and an unreadable list yields the draft record");
  });
});

describe("the shipped source", () => {
  it("reuses the existing predicate rather than copying a second column table", () => {
    const reader = slice(listsSource, "function readListSummaries(body) {");
    assert.match(reader, /body\.lists\.every\(isListSummary\)/);
    assert.equal((listsSource.match(/const LIST_TEXT_COLUMNS = /g) || []).length, 1,
      "one column table, not two");
  });

  it("claims only the portion of the response this consumer reads", () => {
    const reader = slice(listsSource, "function readListSummaries(body) {");
    assert.ok(!/\bquery\b/.test(reader), "the returned query is not validated, and is not claimed");
    assert.match(listsSource, /@returns \{BrowserListSummary\[\]\}/,
      "the reader answers the collection, not an envelope");
  });

  it("assigns state.lists only at the completed-load point", () => {
    // **Presence before position.** `indexOf` answers `-1` for a needle that is not there, and
    // `-1 < n` is true for every positive `n` - so an ordering comparison alone passes vacuously
    // once the operation it orders has been deleted. `0.33.33.38.4.7.2.3` repaired this after the
    // 2026-09-08 audit removed `readListSummaries(result)` entirely and watched the assertion
    // still pass. Comments are stripped first, so a mention in prose cannot stand in for
    // executed code.
    const body = executableBody(slice(listsSource, "async function loadLists() {"));

    const assignment = body.indexOf("state.lists = ");
    const validation = body.indexOf("readListSummaries(result)");
    const settle = body.indexOf("await Promise.all(");

    assert.equal((body.match(/state\.lists = /g) || []).length, 1,
      "loadLists must assign state.lists exactly once");
    assert.notEqual(assignment, -1, "loadLists must assign state.lists");
    assert.notEqual(validation, -1,
      "loadLists must validate the collection through readListSummaries(result)");
    assert.notEqual(settle, -1,
      "loadLists must await Promise.all, so every detail request has settled");

    assert.ok(validation < settle,
      "the collection must be validated before any detail request is issued");
    assert.ok(settle < assignment,
      "every detail must have settled before state.lists is assigned");
    assert.ok(validation < assignment,
      "and the collection must be validated before state.lists is assigned");
  });
});
