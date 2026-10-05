import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * How the Files list pages itself, and what it admits while doing so.
 *
 * `0.33.33.43.14` typed the load-and-pagination path. Most of it is annotation, but one part is a
 * **correction**: the local `FileRecord` and `FileAttachmentRecord` shapes declared three members
 * `string` where the published `BrowserFileAttachmentFile` declares them `string | null`, and
 * `formatDate` declared its parameter `string` for a value the producer sends as `string | null`.
 * Nothing caught that until a caller of `fileRow` was typed, so the cases below fix the `null`
 * behaviour that was always there.
 */

const source = createProjectTextReader().readText("public/js/files.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/**
 * A vm-built value as a host-realm one. Anything the lifted code constructs - including an array
 * returned by `.map` called on a vm array - carries the vm's prototypes, so `deepEqual` reports
 * "same structure but not reference-equal". Identity assertions are unaffected.
 * @param {unknown} value
 */
function plain(value) {
  // `JSON.stringify(undefined)` is `undefined`, and parsing that throws - so an absent value
  // would fail a suite with a raw SyntaxError instead of a readable assertion.
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** The pure readers, lifted. `filesTableColumns` needs the scope predicate and the cell builders. */
function readers({ business = false } = {}) {
  const sandbox = vm.createContext({});
  vm.runInContext(
    `globalThis.state = { workspaceType: ${business ? '"business"' : '"personal"'} };`
      + "globalThis.createFileCell = () => '#file';"
      + "globalThis.createFileStatusCell = () => '#status';"
      + "globalThis.createFileActions = () => '#actions';"
      + "globalThis.createTruncatedText = (value, className) => ({ value, className });",
    sandbox,
  );
  for (const name of ["normalizeFilesPagination", "usesBusinessScope", "filesTableColumns", "formatDate"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext("({ normalizeFilesPagination, filesTableColumns, formatDate })", sandbox);
}

describe("The pagination normaliser is total, and says so", () => {
  it("offers more only when the producer says so and gives somewhere to go", () => {
    const { normalizeFilesPagination } = readers();

    assert.deepEqual(plain(normalizeFilesPagination({ hasMore: true, nextCursor: "c1" })), { hasMore: true, nextCursor: "c1" });
    assert.deepEqual(plain(normalizeFilesPagination({ hasMore: true, nextCursor: "" })), { hasMore: false, nextCursor: "" });
    assert.deepEqual(plain(normalizeFilesPagination({ hasMore: false, nextCursor: "c1" })), { hasMore: false, nextCursor: "c1" });
  });

  /** `=== true`, so a merely truthy flag is not a promise of more. */
  it("requires the flag to be the boolean true, not merely truthy", () => {
    const { normalizeFilesPagination } = readers();

    for (const flag of ["true", 1, {}, "yes"]) {
      assert.equal(normalizeFilesPagination({ hasMore: flag, nextCursor: "c1" }).hasMore, false, `${String(flag)} is not true`);
    }
  });

  /**
   * The snake_case spelling is the reason this parameter could not be typed as the published
   * `BrowserBoundedPagination`: that contract does not carry `next_cursor`, but this reader accepts it.
   */
  it("accepts either spelling of the cursor, preferring the camelCase one", () => {
    const { normalizeFilesPagination } = readers();

    assert.equal(normalizeFilesPagination({ hasMore: true, next_cursor: "snake" }).nextCursor, "snake");
    assert.equal(normalizeFilesPagination({ hasMore: true, nextCursor: "camel", next_cursor: "snake" }).nextCursor, "camel");
  });

  it("answers for nothing at all, which is what makes it total", () => {
    const { normalizeFilesPagination } = readers();

    assert.deepEqual(plain(normalizeFilesPagination()), { hasMore: false, nextCursor: "" });
    assert.deepEqual(plain(normalizeFilesPagination({})), { hasMore: false, nextCursor: "" });
  });

  it("converts and trims whatever carried the cursor", () => {
    const { normalizeFilesPagination } = readers();

    assert.equal(normalizeFilesPagination({ nextCursor: "  c1  " }).nextCursor, "c1");
    assert.equal(normalizeFilesPagination({ nextCursor: 7 }).nextCursor, "7");
    assert.equal(normalizeFilesPagination({ nextCursor: null }).nextCursor, "");
  });
});

describe("A timestamp the producer may not have recorded", () => {
  /**
   * This is the corrected member. `BrowserFileAttachmentFile` declares both timestamps
   * `string | null` - "null until the row records a creation time" - and this reader has always
   * answered `""` for one. Only the declaration was wrong.
   */
  it("answers empty for null, exactly as it did for undefined", () => {
    const { formatDate } = readers();

    assert.equal(formatDate(null), "");
    assert.equal(formatDate(undefined), "");
    assert.equal(formatDate(), "");
    assert.equal(formatDate(""), "");
  });

  it("hands back an unparseable value rather than a date that means nothing", () => {
    const { formatDate } = readers();

    assert.equal(formatDate("not a date"), "not a date");
  });
});

describe("The table's columns, which this page names because the contract does not", () => {
  it("omits the client column outside a business workspace", () => {
    const keys = readers({ business: false }).filesTableColumns().map((/** @type {{key: string}} */ column) => column.key);

    assert.deepEqual(plain(keys), ["fileName", "moduleLabel", "targetLabel", "projectLabel", "statusLabel", "attachedAtLabel", "actions"]);
  });

  it("inserts it, in place, for a business workspace", () => {
    const keys = readers({ business: true }).filesTableColumns().map((/** @type {{key: string}} */ column) => column.key);

    assert.deepEqual(plain(keys), ["fileName", "moduleLabel", "targetLabel", "clientLabel", "projectLabel", "statusLabel", "attachedAtLabel", "actions"]);
  });

  it("marks the first column as the header and the last as right-aligned", () => {
    const columns = readers().filesTableColumns();

    assert.equal(columns[0].header, true);
    assert.equal(columns[0].key, "fileName");
    assert.equal(columns.at(-1)?.align, "right", "the actions column is the one that needed the align member");
  });

  it("renders the truncating columns through the shared truncator", () => {
    const columns = readers().filesTableColumns();
    const target = columns.find((/** @type {{key: string}} */ column) => column.key === "targetLabel");

    assert.deepEqual(plain(target?.render?.({ targetLabel: "a long target" })), { value: "a long target", className: "files-target-label" });
  });
});

describe("What the declarations claim, and what they decline to claim", () => {
  it("declares the pagination reader's input locally, because the published shape lacks a member it reads", () => {
    assert.match(
      source,
      /@param \{\{ hasMore\?: unknown, nextCursor\?: unknown, next_cursor\?: unknown \}\} \[pagination\]/,
    );
    assert.doesNotMatch(
      source,
      /@param \{import\([^)]*\)\.BrowserBoundedPagination\} \[?pagination/,
      "naming the published type would make the snake_case read an error",
    );
    assert.match(contracts, /export interface BrowserBoundedPagination \{/);
    assert.doesNotMatch(
      contracts.slice(contracts.indexOf("export interface BrowserBoundedPagination")).slice(0, 600),
      /next_cursor/,
      "if the contract ever grows that spelling, this local shape should go",
    );
  });

  it("reuses the published attachment vocabulary for the list it was handed", () => {
    assert.match(
      source,
      /@param \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserFileAttachment\[\]\} attachments/,
    );
  });

  it("takes the row type from the builder rather than restating it", () => {
    // `0.33.33.43.15` introduced `FileRowRecord` as an alias for this expression, so the claim is
    // unchanged: the row type is the builder's own return and cannot drift from it.
    //
    // Tied to `renderFilesTable` itself rather than the bare spelling. `0.33.33.43.17` gave
    // `createFilesTable` the same annotation, and with two matches in the file a bare
    // `assert.match` kept passing while *this* one was mutated away - the third time a duplicate
    // spelling has quietly disarmed a pin. A pin belongs to the declaration it is about.
    assert.ok(
      source.includes("@param {FileRowRecord[]} rows\n   */\n  function renderFilesTable(rows) {"),
      "renderFilesTable's own parameter must carry the alias",
    );
    assert.match(source, /@typedef \{ReturnType<typeof fileRow>\} FileRowRecord/);
  });

  it("records the nullability correction where the next reader meets it", () => {
    assert.match(source, /\*\*The two timestamps admit `null`, corrected by `0\.33\.33\.43\.14`\.\*\*/);
    assert.match(source, /createdAt\?: string \| null, created_at\?: string \| null,/);
    assert.match(source, /target\?: \{ label\?: string \} \| null,/);
    assert.match(source, /@param \{string \| null\} \[value\]/);
  });

  it("the published contract it defers to still declares those members nullable", () => {
    assert.match(contracts, /\/\*\* `null` until the row records a creation time\. \*\/\s*\n\s*createdAt: string \| null;/);
    assert.match(contracts, /created_at: string \| null;/);
  });
});
