import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/lists.js");
const service = read("src/modules/lists/catalog-items.service.js");
const repo = read("src/modules/lists/lists.repo.js");
const routes = read("src/modules/lists/lists.routes.js");
const schema = read("src/db/schema/current.sql");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = page.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return page.slice(start, page.indexOf("\n  }\n", start) + 4);
  };
  const table = page.indexOf("const SUGGESTION_NULLABLE_COLUMNS = Object.freeze([");
  assert.notEqual(table, -1, "the nullable column table must exist");
  return new Function([
    page.slice(table, page.indexOf("]);", table) + 3),
    slice("  function isResponseRecord(value) {"),
    slice("  function hasListNullableText(value, columns) {"),
    slice("  function isCatalogAmount(value) {"),
    slice("  function isItemSuggestion(value) {"),
    slice("  function readItemSuggestions(body) {"),
    "return { readItemSuggestions, isCatalogAmount };",
  ].join("\n"))();
}

const { readItemSuggestions, isCatalogAmount } = shippedReader();

/**
 * The `list_item_catalog` columns, read out of the schema rather than typed here.
 *
 * @returns {Map<string, {type: string, notNull: boolean, check: string}>}
 */
function catalogColumns() {
  const start = schema.indexOf("CREATE TABLE list_item_catalog (");
  assert.notEqual(start, -1, "the catalog table must exist in the schema");
  const block = schema.slice(start, schema.indexOf("\n);", start));
  /** @type {Map<string, {type: string, notNull: boolean, check: string}>} */
  const columns = new Map();
  for (const line of block.split("\n").slice(1)) {
    const match = /^ {2}([a-z_]+) (TEXT|REAL|INTEGER)(.*)$/.exec(line.replace(/,$/, ""));
    if (!match) continue;
    columns.set(match[1], {
      type: match[2],
      notNull: match[3].includes("NOT NULL"),
      check: (/CHECK \((.*)\)/.exec(match[3]) || ["", ""])[1],
    });
  }
  assert.ok(columns.size > 10, "the schema block must have been parsed");
  return columns;
}

/**
 * A suggestion shaped the way `shapeCatalogItemForBrowser` answers one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function suggestion(overrides = {}) {
  return {
    catalog_item_id: "catalog_1",
    id: "catalog_1",
    workspace_id: "workspace_1",
    item_name: "Painter's tape",
    normalized_name: "painters tape",
    list_type: null,
    client_id: null,
    project_id: null,
    quantity: 2,
    unit: "roll",
    vendor_name: "Hardware Co",
    url: "https://example.test/tape",
    estimated_cost: 4.5,
    notes: null,
    use_count: 3,
    last_used_at: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    archived_at: null,
    metadata_json: null,
    ...overrides,
  };
}

describe("the suggestion minimum matches what the catalogue guarantees", () => {
  it("requires the two counts the schema declares NOT NULL with a non-negative check", () => {
    const columns = catalogColumns();
    for (const name of ["quantity", "use_count"]) {
      const column = columns.get(name);
      assert.ok(column, name + " must be a catalog column");
      assert.equal(column.notNull, true, name + " is NOT NULL, so the browser may require it");
      assert.match(column.check, new RegExp(name + " >= 0"), name + " carries a non-negative check");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: null })] })?.length, 0,
        name + " may not be null");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: -1 })] })?.length, 0,
        name + " may not be negative");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: "2" })] })?.length, 0,
        name + " may not be a numeric string");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: 0 })] })?.length, 1,
        name + " may be zero, which the check permits");
    }
  });

  it("allows the nullable amount the schema declares nullable", () => {
    const column = catalogColumns().get("estimated_cost");
    assert.ok(column, "estimated_cost must be a catalog column");
    assert.equal(column.notNull, false, "estimated_cost is nullable");
    assert.match(column.check, /estimated_cost IS NULL OR estimated_cost >= 0/, "with a non-negative check when set");
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ estimated_cost: null })] })?.length, 1,
      "null is a value this column may hold");
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ estimated_cost: -1 })] })?.length, 0,
      "a negative cost is not");
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ estimated_cost: "4.50" })] })?.length, 0,
      "and neither is a string");
  });

  it("refuses NaN and Infinity, which would autofill an unusable form value", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(isCatalogAmount(amount), false, String(amount) + " is not a catalogue amount");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ quantity: amount })] })?.length, 0,
        String(amount) + " may not reach a quantity field");
    }
    assert.equal(isCatalogAmount(0), true, "and a real zero still is one");
  });

  it("treats the four nullable text columns exactly as the schema does", () => {
    const columns = catalogColumns();
    const table = page.slice(page.indexOf("const SUGGESTION_NULLABLE_COLUMNS"), page.indexOf("]);", page.indexOf("const SUGGESTION_NULLABLE_COLUMNS")));
    const declared = [...table.matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
    assert.deepEqual([...declared].sort(), ["notes", "unit", "url", "vendor_name"], "the four the picker reads");
    for (const name of declared) {
      const column = columns.get(name);
      assert.ok(column, name + " must be a catalog column");
      assert.equal(column.type, "TEXT", name + " is a text column");
      assert.equal(column.notNull, false, name + " is nullable in the schema, so the browser may not require it");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: null })] })?.length, 1,
        name + " may be null");
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ [name]: 7 })] })?.length, 0,
        name + " may not be a number");
    }
  });

  it("requires a non-empty identity and a non-empty name, because both are used as one", () => {
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ catalog_item_id: "" })] })?.length, 0,
      "an empty catalog_item_id would be submitted by the form as an item that does not exist");
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ item_name: "" })] })?.length, 0,
      "an empty item_name would be an unselectable datalist entry that matches every blank input");
    for (const value of [null, 7, undefined]) {
      assert.equal(readItemSuggestions({ suggestions: [suggestion({ catalog_item_id: value })] })?.length, 0,
        JSON.stringify(value ?? String(value)) + " is not an identity");
    }
  });

  it("promises only what the picker reads", () => {
    const declared = functionBody(contracts, "export interface BrowserListItemSuggestion {", "\n}\n");
    const members = [...declared.matchAll(/^ {2}([a-z_]+)[?]?: /gm)].map((entry) => entry[1]);
    const consumed = new Set();
    const datalist = functionBody(page, "  function updateSuggestionDatalist(container, list) {", "\n  }\n");
    const apply = functionBody(page, "  function applySuggestionSelection(form, list, value) {", "\n  }\n");
    const label = functionBody(page, "  function suggestionLabel(suggestion) {", "\n  }\n");
    for (const source of [datalist, apply, label]) {
      for (const [, member] of source.matchAll(/\bsuggestion\??\.([a-z_]+)/g)) consumed.add(member);
    }
    // `entry` is the matched suggestion in the selection path and the created option element in
    // the datalist path, so it is only scanned where it names a suggestion.
    for (const [, member] of apply.matchAll(/\bentry\??\.([a-z_]+)/g)) consumed.add(member);
    assert.deepEqual([...members].sort(), [...consumed].sort(),
      "every declared member is read by the picker, and every member the picker reads is declared");
    assert.ok(consumed.size >= 9, "and the picker's reads must have been found");
  });

  it("does not promise the alias or the persistence columns", () => {
    const declared = functionBody(contracts, "export interface BrowserListItemSuggestion {", "\n}\n");
    for (const member of [
      "normalized_name", "metadata_json", "last_used_at", "workspace_id",
      "created_by_user_id", "updated_by_user_id", "archived_at", "list_type",
    ]) {
      assert.doesNotMatch(declared, new RegExp("^ {2}" + member + "[?]?: ", "m"),
        member + " is a persistence column this picker never reads");
    }
    assert.doesNotMatch(declared, /^ {2}id[?]?: /m,
      "the shaper's id alias is not read by this picker and is not promised");
    assert.equal(readItemSuggestions({ suggestions: [suggestion({ id: undefined })] })?.length, 1,
      "and a suggestion without it is still usable");
  });
});

describe("the envelope and the element are judged differently, on purpose", () => {
  it("rejects a body that is not an item-suggestions body", () => {
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readItemSuggestions(body), null, String(body) + " is not a suggestions body");
    }
    assert.equal(readItemSuggestions(Object.assign([], { suggestions: [] })), null,
      "an array is not a suggestions body even when it carries the member");
    assert.equal(readItemSuggestions({}), null, "a missing suggestions member is not an empty catalogue");
    for (const suggestions of [null, "", 0, false, {}, "suggestions"]) {
      assert.equal(readItemSuggestions({ suggestions }), null,
        JSON.stringify(suggestions) + " is not a list of suggestions");
    }
  });

  it("accepts a real empty catalogue", () => {
    assert.deepEqual(readItemSuggestions({ suggestions: [] }), [],
      "a workspace with no matching catalog items is an answer, not a failure");
  });

  it("drops one unusable candidate and keeps the usable ones", () => {
    const wire = { suggestions: [suggestion(), { catalog_item_id: "catalog_2" }, suggestion({ catalog_item_id: "catalog_3" })] };
    const result = readItemSuggestions(wire);
    assert.equal(result?.length, 2, "a suggestion that cannot be autofilled is one fewer shortcut, not a failed read");
    assert.deepEqual(result?.map((/** @type {{catalog_item_id: string}} */ entry) => entry.catalog_item_id), ["catalog_1", "catalog_3"],
      "and the usable candidates are still offered");
  });

  it("records why this differs from an authoritative list", () => {
    const doc = page.slice(page.indexOf("   * The usable suggestions of an item-suggestions body"),
      page.indexOf("  function readItemSuggestions(body) {"));
    assert.match(doc, /advisory/, "the reason for filtering rather than refusing is written down");
    assert.match(doc, /authoritative/, "and it is stated against the case where refusing is correct");
  });

  it("proves the container guard by source, because removing it crashes rather than refuses", () => {
    const reader = functionBody(page, "  function readItemSuggestions(body) {", "\n  }\n");
    assert.match(reader, /!Array\.isArray\(body\.suggestions\)/,
      "the suggestions container is proved to be an array before filter() is called on it");
  });
});

describe("the producer's own suggestion objects survive", () => {
  it("keeps the elements the producer sent", () => {
    const original = suggestion({ future_catalog_field: { nested: true } });
    const result = readItemSuggestions({ suggestions: [original] });
    assert.equal(result?.[0], original, "the producer's object is answered, not a rebuild of it");
    assert.equal(result?.[0].id, "catalog_1", "so the shaper's alias survives");
    assert.deepEqual(result?.[0].future_catalog_field, { nested: true },
      "and so does anything the catalogue grows next");
  });

  it("does not rebuild the suggestion to the promised minimum", () => {
    const reader = functionBody(page, "  function readItemSuggestions(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /catalog_item_id:|item_name:|quantity:/,
      "rebuilding would strip the context, ranking and usage columns the response carries");
    assert.doesNotMatch(reader, /\.map\(/, "the elements are answered as they arrived");
  });
});

describe("the suggestion path behaves exactly as it did", () => {
  const load = functionBody(page, "  async function loadItemSuggestions(list) {", "\n  }\n");

  it("no longer performs the raw read", () => {
    assert.doesNotMatch(page, /result\.suggestions \|\| \[\]/, "the raw read must be gone from the page");
    assert.match(load, /readItemSuggestions\(await api\.getJson\(`\/api\/lists\/item-suggestions\?/,
      "and the boundary is the reader");
  });

  it("does not record a body it could not read as a loaded empty catalogue", () => {
    const refusal = load.indexOf("if (!suggestions) {");
    assert.notEqual(refusal, -1, "an unreadable body must be refused");
    assert.match(load, /if \(!suggestions\) \{\n\s+throw new Error\("The item suggestions could not be read\."\);\n\s+\}/,
      "by throwing into the existing catch rather than storing an empty list beside a successful read");
    const stored = load.indexOf("state.itemSuggestions.set(list.list_id, suggestions);");
    assert.notEqual(stored, -1, "the vouched-for suggestions are stored");
    assert.ok(refusal < stored, "and the refusal comes first");
  });

  it("keeps the existing silent-failure behaviour of an optional feature", () => {
    assert.match(load, /\} catch \{\n\s+state\.itemSuggestions\.set\(list\.list_id, \[\]\);\n\s+return \[\];\n\s+\}/,
      "the catch this page already had is unchanged");
    assert.doesNotMatch(load, /setStatus\(|alert\(/, "and no failure surface is added to an advisory feature");
  });

  it("still scopes, limits and guards the request as it did", () => {
    assert.match(load, /if \(!list\?\.list_id\) \{\n\s+return \[\];\n\s+\}/, "a list is still required");
    assert.match(load, /limit: "12",\n\s+listId: list\.list_id,/, "and the limit and scope are unchanged");
  });

  it("still matches item names case-insensitively and submits the catalog identity", () => {
    const apply = functionBody(page, "  function applySuggestionSelection(form, list, value) {", "\n  }\n");
    assert.match(apply, /\(entry\.item_name \|\| ""\)\.toLowerCase\(\) === String\(value \|\| ""\)\.trim\(\)\.toLowerCase\(\)/,
      "the case-insensitive name match is unchanged");
    assert.match(apply, /setFormValue\(form, "catalog_item_id", suggestion\?\.catalog_item_id \|\| ""\);/,
      "and the identity the form submits still comes from the matched suggestion");
    for (const [field, expression] of [
      ["quantity", "suggestion.quantity ?? 1"],
      ["unit", 'suggestion.unit || ""'],
      ["vendor_name", 'suggestion.vendor_name || ""'],
      ["url", 'suggestion.url || ""'],
      ["estimated_cost", 'suggestion.estimated_cost ?? ""'],
      ["notes", 'suggestion.notes || ""'],
    ]) {
      assert.ok(apply.includes(`setFormValue(form, "${field}", ${expression});`), field + " autofill is unchanged");
    }
  });

  it("still builds the datalist from the stored suggestions", () => {
    const datalist = functionBody(page, "  function updateSuggestionDatalist(container, list) {", "\n  }\n");
    assert.match(datalist, /entry\.dataset\.catalogItemId = suggestion\.catalog_item_id;/,
      "each option still carries the catalog identity");
    assert.match(page, /return state\.itemSuggestions\.get\(list\?\.list_id\) \|\| \[\];/,
      "and both consumers still read the same stored list");
  });
});

describe("the server keeps the decisions that are its own", () => {
  it("checks list readability and list access before it suggests anything", () => {
    const suggest = functionBody(service, "  async function suggestItems(session, query = {}) {", "\n  }\n");
    const readable = suggest.indexOf("await dependencies.assertListsReadable(session);");
    assert.notEqual(readable, -1, "the module read check comes first");
    const query = suggest.indexOf("dependencies.repository.listCatalogSuggestions(");
    assert.notEqual(query, -1, "and the catalogue is queried");
    assert.ok(readable < query, "in that order");
    assert.match(suggest, /await dependencies\.assertCanAccessList\(session, listRecord, "read"\);/,
      "a requested list is access-checked");
    assert.match(suggest, /permissionsService\.assertCan\(session, LIST_PERMISSIONS\.VIEW, listResource\(/,
      "and a request without one falls back to the workspace list permission");
    assert.doesNotMatch(page, /LIST_PERMISSIONS|assertCanAccessList/, "the browser re-derives none of it");
  });

  it("owns the query, the limit and the context scoping", () => {
    const suggest = functionBody(service, "  async function suggestItems(session, query = {}) {", "\n  }\n");
    for (const field of ["clientId", "limit", "listType", "projectId", "query"]) {
      assert.match(suggest, new RegExp("^\\s+" + field + ": ", "m"), field + " is normalized server-side");
    }
    const repository = functionBody(repo, "async function listCatalogSuggestions(workspaceId, filters = {}) {");
    assert.match(repository, /Math\.max\(1, Math\.min\(Number\(filters\.limit\) \|\| 8, 20\)\)/,
      "the limit is clamped in the repository");
    assert.match(repository, /"archived_at IS NULL"/, "and archived catalogue rows never leave it");
  });

  it("answers an exact envelope over a spread element", () => {
    const suggest = functionBody(service, "  async function suggestItems(session, query = {}) {", "\n  }\n");
    assert.match(suggest, /return \{ suggestions: suggestions\.map\(shapeCatalogItemForBrowser\) \};/,
      "the envelope is one named member and is exact");
    const shaper = functionBody(service, "function shapeCatalogItemForBrowser(item) {");
    assert.match(shaper, /return \{ \.\.\.item, id: item\.catalog_item_id \};/,
      "and the element spreads, which is why the browser record is a structural minimum");
    assert.match(routes, /listsRoutes\.get\("\/lists\/item-suggestions"[\s\S]{0,200}response\.status\(200\)\.json\(result\);/,
      "the route answers that envelope unchanged");
  });
});

describe("this child stays inside the suggestions producer", () => {
  it("publishes one contract and not the persistence record", () => {
    assert.equal((contracts.match(/export interface BrowserListItemSuggestion\b/g) || []).length, 1,
      "one suggestion contract");
    for (const invented of ["BrowserCatalogItemRecord", "BrowserListItemSuggestionsEnvelope", "BrowserListsCatalog"]) {
      assert.ok(!contracts.includes(invented), invented + " would widen this child past its producer");
    }
  });

  it("leaves the blocked list-summary read where 0.33.33.38.4.7.2 put it", () => {
    assert.match(page, /const summaries = result\.lists \|\| \[\];/,
      "the list summary read is deferred on a measured state handoff and is untouched");
  });

  it("adds no state annotation the measurement did not require", () => {
    // Anchored on the neighbouring slot: asserting the line alone would pass with an annotation
    // added directly above it, which is exactly the change this claim is about.
    assert.match(page, /\n {4}itemDialogList: null,\n {4}itemSuggestions: new Map\(\),\n {4}linkTargetSearchTimer: null,/,
      "the Map slot is left exactly as it was, because narrowing the read did not block anything");
  });
});
