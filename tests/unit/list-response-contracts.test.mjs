// Runtime proof for the Lists detail response contracts.
//
// `normalizeListRecord` looked like a total normaliser and is not one. It answers `{ ...list, ... }`
// and maps each item and link to `{ ...item, id }`, so it reconstructs nine members of the list and
// one member of each element, and **inherits everything else from whatever it was handed**. It is a
// trust boundary for what it rebuilds and for nothing else, which is why the checking happens in
// `readListDetail` before the normaliser sees anything.
//
// Producer authority is `LIST_COLUMNS`, `ITEM_COLUMNS` and `LINK_COLUMNS` in
// `src/modules/lists/lists.repo.js`; contract authority is the browser declaration. Breaking either
// leaves the other standing, as `0.33.33.38.4.11` established.
//
// **The column list is not the wire.** `0.33.33.43.44` found that the repository's row mappers
// booleanize `is_reusable` and parse `metadata_json` on every read, before any shaper spreads the
// row, so a page checking the column types refused every real list. The suite now runs the real
// mappers into the browser predicates, which is the check that would have caught it.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const repositorySource = readText("src/modules/lists/lists.repo.js");
const mappers = sandbox(repositorySource,
  ["parseMetadata", "listRowToAppValue", "itemRowToAppValue", "linkRowToAppValue"], []);
const declarationSource = readText("src/types/browser-contracts.d.ts");
const listsPage = readText("public/js/lists.js");

const lists = sandbox(listsPage,
  ["isResponseRecord", "hasListText", "hasListNullableText", "isListSummary", "isListItem", "isListLink",
    "readListDetail", "readSavedListId"],
  ["LIST_TEXT_COLUMNS", "LIST_NULLABLE_COLUMNS", "LIST_SHAPED_BOOLEANS", "ITEM_TEXT_COLUMNS",
    "ITEM_NULLABLE_COLUMNS", "LINK_TEXT_COLUMNS", "LINK_NULLABLE_COLUMNS"]);

describe("the Lists column authorities", () => {
  it("checks every column the three queries select", () => {
    const cases = [
      { columns: "LIST_COLUMNS", contract: "BrowserListColumns", checked: ["LIST_TEXT_COLUMNS", "LIST_NULLABLE_COLUMNS"], extra: ["is_reusable", "metadata_json"] },
      { columns: "ITEM_COLUMNS", contract: "BrowserListItem", checked: ["ITEM_TEXT_COLUMNS", "ITEM_NULLABLE_COLUMNS"], extra: ["actual_cost", "estimated_cost", "metadata_json", "quantity", "sort_order"] },
      { columns: "LINK_COLUMNS", contract: "BrowserListLink", checked: ["LINK_TEXT_COLUMNS", "LINK_NULLABLE_COLUMNS"], extra: ["metadata_json"] },
    ];
    for (const entry of cases) {
      const selected = selectedColumns(entry.columns);
      const checked = entry.checked.flatMap((table) => plain(lists[table]));
      assert.deepEqual([...checked, ...entry.extra].sort(), selected.slice().sort(),
        `${entry.columns} must be exactly what the browser checks plus the members it deliberately leaves unchecked`);
      const declared = declaredMembers(entry.contract);
      for (const column of selected) {
        assert.ok(declared.includes(column), `${entry.contract} must describe ${column}`);
      }
    }
  });

  it("reads the row mapper's boolean and leaves the parsed metadata unchecked", () => {
    assert.match(declarationBlock("BrowserListColumns"), /\n  is_reusable: boolean;/,
      "the column is INTEGER, but the row mapper booleanizes it before any shaper spreads the row");
    assert.match(declarationBlock("BrowserListColumns"), /\n  metadata_json: unknown;/,
      "and parses the metadata into whatever JSON was stored");
    assert.match(declarationBlock("BrowserListSummary"), /\n  isReusable: boolean;/,
      "the boolean the shaper builds beside it");
    assert.equal(lists.isListSummary({ ...summaryFixture(), is_reusable: 1 }), false,
      "the column's integer never reaches the wire, so it is not the shape the server sends");
    assert.equal(lists.isListSummary({ ...summaryFixture(), isReusable: 1 }), false,
      "and an integer where the shaped boolean belongs is not either");
    for (const metadata of [{}, { key: "value" }, [], null, "text"]) {
      assert.equal(lists.isListSummary({ ...summaryFixture(), metadata_json: metadata }), true,
        "the page never reads the metadata, so whatever JSON it parsed to is accepted");
    }
  });
});

describe("the producer the browser actually reads", () => {
  // The real row mappers from `lists.repo.js`, fed a row as SQLite returns it: the reusable flag as
  // an integer and the metadata as stored text. What they hand the shapers is what the page must
  // accept. The shaper then adds `id`, `links` and its booleans; those three are supplied here.
  /** @param {string} name @param {(column: string) => unknown} valueFor */
  const databaseRow = (name, valueFor) => Object.fromEntries(selectedColumns(name).map((column) => [column, valueFor(column)]));

  it("accepts a list exactly as the row mapper produces it, for both flag values", () => {
    for (const [flag, metadata] of [[0, null], [1, '{"source":"import"}'], [0, ""]]) {
      /** @type {Record<string, unknown>} */
      const mapped = mappers.listRowToAppValue(databaseRow("LIST_COLUMNS", (column) => (
        column === "is_reusable" ? flag
          : column === "metadata_json" ? metadata
            : plain(lists.LIST_NULLABLE_COLUMNS).includes(column) ? null
              : `${column}-value`
      )));
      assert.equal(typeof mapped.is_reusable, "boolean", "the mapper booleanizes the flag");
      assert.equal(typeof mapped.metadata_json, "object", "and parses the metadata");
      /** @type {Record<string, unknown>} */
      const shaped = { ...mapped, id: mapped.list_id, links: [] };
      for (const member of plain(lists.LIST_SHAPED_BOOLEANS)) shaped[member] = Boolean(flag);
      assert.equal(lists.isListSummary(shaped), true, `a list with is_reusable ${flag} is accepted`);
    }
  });

  it("accepts an item and a link exactly as their row mappers produce them", () => {
    const item = mappers.itemRowToAppValue(databaseRow("ITEM_COLUMNS", (column) => (
      column === "metadata_json" ? '{"k":1}'
        : ["quantity", "estimated_cost", "actual_cost", "sort_order"].includes(column) ? 2
          : plain(lists.ITEM_NULLABLE_COLUMNS).includes(column) ? null
            : `${column}-value`
    )));
    const link = mappers.linkRowToAppValue(databaseRow("LINK_COLUMNS", (column) => (
      column === "metadata_json" ? null
        : plain(lists.LINK_NULLABLE_COLUMNS).includes(column) ? null
          : `${column}-value`
    )));
    assert.equal(lists.isListItem(item), true, "an item as the mapper produces it is accepted");
    assert.equal(lists.isListLink(link), true, "and so is a link");
  });
});

describe("the list detail envelope", () => {
  it("accepts a body the server could send", () => {
    const body = { items: [itemFixture()], links: [linkFixture()], list: summaryFixture() };
    assert.deepEqual(plain(lists.readListDetail(body)), body);
  });

  it("checks elements rather than containers, before the normaliser sees them", () => {
    const mixed = {
      items: [itemFixture(), { list_item_id: "i-2" }, null, "item"],
      links: [linkFixture(), { list_link_id: "l-2" }, 4],
      list: summaryFixture(),
    };
    const read = plain(lists.readListDetail(mixed));
    assert.deepEqual(read.items, [itemFixture()], "an array of items does not make its entries items");
    assert.deepEqual(read.links, [linkFixture()], "an array of links does not make its entries links");
  });

  it("reports an absent list as absent rather than null", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { list: null }, { list: "list" }, { list: { list_id: "l" } }]) {
      const read = lists.readListDetail(empty);
      assert.equal(read.list, undefined,
        "the normaliser's own `list = {}` default must still apply, which it does only for undefined");
      assert.deepEqual(plain(read.items), []);
      assert.deepEqual(plain(read.links), []);
    }
  });

  it("rejects records it cannot vouch for", () => {
    for (const member of plain(lists.LIST_TEXT_COLUMNS)) {
      assert.equal(lists.isListSummary(omit(summaryFixture(), member)), false, `${member} must be present`);
      assert.equal(lists.isListSummary({ ...summaryFixture(), [member]: null }), false, `${member} is NOT NULL`);
    }
    for (const member of plain(lists.LIST_NULLABLE_COLUMNS)) {
      assert.equal(lists.isListSummary({ ...summaryFixture(), [member]: null }), true, `${member} may be null`);
      assert.equal(lists.isListSummary(omit(summaryFixture(), member)), false, `${member} is selected, so it is present`);
    }
    for (const member of plain(lists.LIST_SHAPED_BOOLEANS)) {
      assert.equal(lists.isListSummary(omit(summaryFixture(), member)), false, `${member} is built by the shaper`);
    }
    assert.equal(lists.isListSummary({ ...summaryFixture(), links: "none" }), false, "the shaper always sends an array of links");
    assert.equal(lists.isListSummary({ ...summaryFixture(), list_id: "" }), false);
    for (const member of plain(lists.ITEM_TEXT_COLUMNS)) {
      assert.equal(lists.isListItem({ ...itemFixture(), [member]: 4 }), false, `${member} is text`);
    }
    for (const member of plain(lists.LINK_TEXT_COLUMNS)) {
      assert.equal(lists.isListItem({ ...linkFixture(), [member]: null }), false, `${member} is NOT NULL`);
    }
    assert.equal(lists.isListItem(linkFixture()), false, "a link is not an item");
    assert.equal(lists.isListLink(itemFixture()), false, "and an item is not a link");
  });
});

describe("the saved list identifier", () => {
  it("keeps one identifier vocabulary in the order the call sites already used", () => {
    assert.equal(lists.readSavedListId({ list: { list_id: "l-1", id: "other" } }), "l-1",
      "the column wins, as `result.list?.list_id || result.list?.id` did");
    assert.equal(lists.readSavedListId({ list: { id: "l-2" } }), "l-2",
      "the shaper's duplicate is the fallback, not a second vocabulary");
    for (const empty of [null, undefined, "body", {}, { list: null }, { list: {} },
      { list: { list_id: "" } }, { list: { list_id: 7 } }]) {
      assert.equal(lists.readSavedListId(empty), "",
        "a body without a usable identifier answers the empty string, exactly as `|| \\u0022\\u0022` did");
    }
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/** @param {string} name @returns {string[]} */
function selectedColumns(name) {
  const match = repositorySource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `${name} must remain a readable column list`);
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  const block = declarationBlock(name);
  const inherited = /extends BrowserListColumns/.test(block) ? declaredMembers("BrowserListColumns") : [];
  return [...inherited, ...[...block.matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1])];
}

/** @returns {Record<string, unknown>} */
function summaryFixture() {
  /** @type {Record<string, unknown>} */
  const list = { id: "list_id-value", is_reusable: false, links: [], metadata_json: {} };
  for (const column of plain(lists.LIST_TEXT_COLUMNS)) list[column] = `${column}-value`;
  for (const column of plain(lists.LIST_NULLABLE_COLUMNS)) list[column] = `${column}-value`;
  for (const member of plain(lists.LIST_SHAPED_BOOLEANS)) list[member] = false;
  return list;
}

/** @returns {Record<string, unknown>} */
function itemFixture() {
  /** @type {Record<string, unknown>} */
  const item = { metadata_json: {} };
  for (const column of plain(lists.ITEM_TEXT_COLUMNS)) item[column] = `${column}-value`;
  for (const column of plain(lists.ITEM_NULLABLE_COLUMNS)) item[column] = null;
  return item;
}

/** @returns {Record<string, unknown>} */
function linkFixture() {
  /** @type {Record<string, unknown>} */
  const link = { metadata_json: {} };
  for (const column of plain(lists.LINK_TEXT_COLUMNS)) link[column] = `${column}-value`;
  for (const column of plain(lists.LINK_NULLABLE_COLUMNS)) link[column] = null;
  return link;
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
