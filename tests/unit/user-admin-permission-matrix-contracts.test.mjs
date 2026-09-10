import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's permission matrix, typed by `0.33.33.44.8`.
 *
 * **The model declared here is the page's own, not the wire member.**
 * `BrowserRoleAssignment.permission_overrides` is `unknown` deliberately - nothing validates what
 * the server sends - and this child does not change that. What it declares is the value this
 * module *produces*: `createDefaultPermissionOverrides` builds every member, and
 * `normalizePermissionOverrides` coerces every member of an arbitrary input into that shape.
 *
 * That distinction is the whole point, so the cases below **run the shipped normaliser** against
 * hostile inputs rather than asserting the declaration compiles. `0.33.33.44.6` was a declaration
 * over an unchecked boundary; this is a declaration over a boundary the function itself closes,
 * and the difference has to be demonstrated rather than claimed.
 */

const page = readFileSync(new URL("../../public/js/user-admin.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const markup = readFileSync(new URL("../../views/protected/user-admin.html", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** @param {string} opener */
function docFor(opener) {
  const at = page.indexOf(opener);
  assert.notEqual(at, -1, opener + " must exist");
  return page.slice(page.lastIndexOf("/**", at), at);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/** @param {string} dataset */
function renderedTag(dataset) {
  const at = markup.search(new RegExp(`data-${dataset}(?=[\\s=>])`));
  assert.notEqual(at, -1, dataset + " must appear in the rendered markup");
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open, at));
  assert.ok(tag, dataset + " must sit on an element");
  return tag[1];
}

const CONTROLS = [
  ["configure-draft-permissions", "configureDraftPermissionsButton", "HTMLButtonElement", "button"],
  ["role-permissions-dialog", "rolePermissionsDialog", "HTMLDialogElement", "dialog"],
  ["role-permissions-form", "rolePermissionsForm", "HTMLFormElement", "form"],
  ["role-permissions-summary", "rolePermissionsSummary", "HTMLElement", "p"],
  ["permission-matrix", "permissionMatrix", "HTMLElement", "div"],
  ["cancel-role-permissions", "cancelRolePermissionsButton", "HTMLButtonElement", "button"],
];

/** The catalogue the normaliser closes over, shaped as `readPermissionResourceCatalog` vouches. */
const RESOURCES = [
  { key: "time_entries", label: "Time entries", moduleId: "time-tracking", operations: ["create", "read", "update"] },
  { key: "notes", label: "Notes", moduleId: "notes", operations: ["read", "delete"] },
];

/**
 * The normaliser as the page ships it, instantiated from that page's own source with a seeded
 * catalogue. Declared at the shape this harness needs so no case below needs an `any`.
 * @typedef {{ allowEditTime: boolean, allowManualTime: boolean, restrictBilling: boolean,
 *   operationAccess: Record<string, Record<string, boolean>> }} NormalisedOverrides
 *
 * The return shape is declared here so these cases can read it, and every case below is what
 * verifies the declaration is true of the shipped function. It is a harness convenience, not a
 * second claim about production.
 * @type {(overrides?: unknown) => NormalisedOverrides}
 */
const normalizePermissionOverrides = new Function("resources", [
  "let permissionResources = resources;",
  slice("  function isResponseRecord(value) {"),
  slice("  function createDefaultPermissionOverrides() {"),
  slice("  function normalizePermissionOverrides(overrides = {}) {"),
  "return normalizePermissionOverrides;",
].join("\n"))(RESOURCES);

/** @param {Record<string, Record<string, boolean>>} value */
const everyLeafIsBoolean = (value) => {
  assert.ok(value && typeof value === "object", "operationAccess is a record");
  for (const operations of Object.values(value)) {
    assert.ok(operations && typeof operations === "object", "each resource maps to a record");
    for (const allowed of Object.values(operations)) {
      assert.equal(typeof allowed, "boolean", "and every operation is a boolean");
    }
  }
};

describe("the normaliser establishes every member it declares", () => {
  it("answers all-true defaults for the seeded catalogue", () => {
    const overrides = normalizePermissionOverrides();
    assert.deepEqual(overrides, {
      restrictBilling: false,
      allowManualTime: true,
      allowEditTime: true,
      operationAccess: {
        // `delete` is present even though the seeded catalogue does not list it: the final block
        // mirrors the two time allowances into the matrix, and that is pre-existing behaviour.
        time_entries: { create: true, read: true, update: true, delete: true },
        notes: { read: true, delete: true },
      },
    });
  });

  it("keeps every declared member a boolean for a hostile input", () => {
    // Every one of these used to reach the matrix unchanged; the three flags were coerced, the
    // nested records were not.
    for (const hostile of [
      null, undefined, 42, "text", [], () => {},
      { restrictBilling: "yes", allowManualTime: 0, allowEditTime: {} },
      { operationAccess: "not-a-record" },
      { operationAccess: { time_entries: "not-a-record" } },
      { operationAccess: { time_entries: { create: "no", read: null, update: 7 } } },
      { operationAccess: [["time_entries", { create: false }]] },
    ]) {
      const overrides = normalizePermissionOverrides(hostile);
      const label = JSON.stringify(hostile) ?? "undefined";

      assert.equal(typeof overrides.restrictBilling, "boolean", `restrictBilling is a boolean for ${label}`);
      assert.equal(typeof overrides.allowManualTime, "boolean", `allowManualTime is a boolean for ${label}`);
      assert.equal(typeof overrides.allowEditTime, "boolean", `allowEditTime is a boolean for ${label}`);
      everyLeafIsBoolean(overrides.operationAccess);
    }
  });

  it("keeps the coercions the page always made", () => {
    assert.equal(normalizePermissionOverrides({ restrictBilling: "yes" }).restrictBilling, true,
      "any truthy value restricts billing");
    assert.equal(normalizePermissionOverrides({ allowManualTime: false }).allowManualTime, false,
      "only an explicit false withdraws an allowance");
    assert.equal(normalizePermissionOverrides({ allowManualTime: 0 }).allowManualTime, true,
      "and a merely falsy value does not");
  });

  it("honours a real override record, and only where it says false", () => {
    const overrides = normalizePermissionOverrides({
      operationAccess: { time_entries: { read: false }, notes: { delete: false } },
    });
    assert.equal(overrides.operationAccess.time_entries.read, false, "the named operation is withdrawn");
    assert.equal(overrides.operationAccess.notes.delete, false);
    assert.equal(overrides.operationAccess.notes.read, true, "and its sibling is untouched");
  });

  it("lets the time allowances win over a time_entries operation override", () => {
    // Pre-existing and easy to break by accident: whatever the record says about
    // `time_entries` create/update/delete, the final block overwrites all three from
    // `allowManualTime` and `allowEditTime`.
    const overrides = normalizePermissionOverrides({
      operationAccess: { time_entries: { create: false, update: false, delete: false } },
    });
    assert.equal(overrides.operationAccess.time_entries.create, true, "create follows allowManualTime");
    assert.equal(overrides.operationAccess.time_entries.update, true, "update follows allowEditTime");
    assert.equal(overrides.operationAccess.time_entries.delete, true, "and so does delete");

    const withdrawn = normalizePermissionOverrides({ allowManualTime: false, allowEditTime: false });
    assert.equal(withdrawn.operationAccess.time_entries.create, false);
    assert.equal(withdrawn.operationAccess.time_entries.update, false);
    assert.equal(withdrawn.operationAccess.time_entries.delete, false);
  });

  it("keeps a key the catalogue does not carry, rather than discarding the caller's record", () => {
    const overrides = normalizePermissionOverrides({ operationAccess: { retired_module: { read: false } } });
    assert.equal(overrides.operationAccess.retired_module.read, false,
      "an override for a resource this catalogue no longer lists is preserved");
    assert.equal(overrides.operationAccess.time_entries.create, true, "and the catalogue defaults still stand");
  });

  it("does not let a non-record contribute index keys", () => {
    // `Object.entries("ab")` answers [["0","a"],["1","b"]], which used to be written straight into
    // the matrix as resource keys.
    const overrides = normalizePermissionOverrides({ operationAccess: "ab" });
    assert.deepEqual(Object.keys(overrides.operationAccess).sort(), ["notes", "time_entries"],
      "only the catalogue's own resources are present");
  });
});

describe("the model is this page's own, and the wire member stays unknown", () => {
  it("declares the normalised shape locally", () => {
    const at = page.indexOf("}} PermissionOverrides");
    assert.notEqual(at, -1, "PermissionOverrides must be declared");
    const body = page.slice(page.lastIndexOf("@typedef {{", at), at);
    const declared = [...body.matchAll(/^\s+\*\s+(\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(declared, ["allowEditTime", "allowManualTime", "operationAccess", "restrictBilling"]);
    assert.ok(!/PermissionOverrides/.test(contracts), "and it is not published");
  });

  it("leaves the wire member unknown, and says why", () => {
    assert.match(contracts, /permission_overrides: unknown;/,
      "the assignment contract still declines to model what the server sends");
    const doc = page.slice(page.indexOf("The permission overrides **this page has normalised**"),
      page.indexOf("}} PermissionOverrides"));
    assert.match(doc, /declared `unknown` deliberately, and this\s*\n?\s*\* child does not change that/);
    assert.match(docFor("  function normalizePermissionOverrides(overrides = {}) {"),
      /@param \{unknown\} \[overrides\]/, "so the input is declared unknown");
    assert.match(docFor("  function normalizePermissionOverrides(overrides = {}) {"),
      /@returns \{PermissionOverrides\}/, "and only the output is claimed");
  });

  it("narrows the nested records rather than trusting them", () => {
    const body = slice("  function normalizePermissionOverrides(overrides = {}) {");
    assert.match(body, /const source = isResponseRecord\(overrides\) \? overrides : \{\};/);
    assert.match(body, /const operationAccess = isResponseRecord\(source\.operationAccess\) \? source\.operationAccess : \{\};/);
    assert.match(body, /isResponseRecord\(operations\) \? operations : \{\}/);
    assert.match(body, /if \(!isResponseRecord\(resourceAccess\)\) \{/,
      "and the second pass captures the record once, because a narrowing does not survive two index reads");
  });

  it("types the catalogue slot from the reader that vouched for it", () => {
    assert.match(page, /@type \{BrowserPermissionResource\[\]\}\s*\n\s*\*\/\s*\n\s*let permissionResources = \[\];/);
    assert.match(executable, /permissionResources = resourceCatalog;/);
    assert.match(executable, /const resourceCatalog = readPermissionResourceCatalog\(permissionResourcesBody\);/);
    assert.match(executable, /if \(!clientScopes \|\| !assignableWorkspaces \|\| !resourceCatalog/,
      "and a catalogue that cannot be read still refuses the whole bootstrap");
  });

  it("adds no cast while declaring the accumulators", () => {
    // The `reduce` accumulators inferred `{}`; declared locals say the shape without asserting it.
    const body = slice("  function createDefaultPermissionOverrides() {");
    assert.match(body, /\/\*\* @type \{Record<string, Record<string, boolean>>\} \*\/\s*\n\s*const operationAccess = \{\};/);
    assert.match(body, /\/\*\* @type \{Record<string, boolean>\} \*\/\s*\n\s*const operations = \{\};/);
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3,
      "the three casts in the element-checking readers predate this child, and none was added");
  });
});

describe("the dialog's six controls and their required accesses", () => {
  it("matches the markup and acquires each through the shared helper", () => {
    for (const [dataset, slot, constructor, tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
      assert.ok(page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`);
    }
    assert.equal([...page.matchAll(/function findUserAdminControl\(/g)].length, 1, "and no new helper was added");
    assert.equal([...page.matchAll(/function requireUserAdminValue\(/g)].length, 1);
  });

  it("requires only this cluster's controls inside this cluster's functions", () => {
    const slots = new Set(CONTROLS.map(([, slot]) => slot));
    for (const opener of [
      "  function openPermissionDialog({ title, overrides, onSave }) {",
      "  function closePermissionDialog() {",
      "  function renderPermissionMatrix(overrides) {",
      "  function readPermissionMatrix() {",
    ]) {
      const body = slice(opener).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      for (const [, argument] of body.matchAll(/requireUserAdminValue\(([^,]+),/g)) {
        assert.ok(slots.has(argument.trim()),
          `${argument.trim()} in ${opener.trim()} is not one of this cluster's six controls`);
      }
    }
  });

  it("narrows each checkbox at the read rather than trusting the selector", () => {
    const body = slice("  function readPermissionMatrix() {");
    assert.match(body, /if \(!\(checkbox instanceof HTMLInputElement\)\) \{\s*\n\s*return;\s*\n\s*\}/,
      "a matched element that is not an input is skipped rather than read");
    assert.match(body, /const billingFlag = matrix\.querySelector\("\[data-permission-flag='restrictBilling'\]"\);/);
    assert.match(body, /Boolean\(billingFlag instanceof HTMLInputElement && billingFlag\.checked\)/,
      "and the standalone flag is narrowed the same way");
    assert.match(body, /checkbox\.dataset\.permissionResource \?\? ""/,
      "the dataset fallbacks name what the selector guarantees");
    assert.match(body, /The selector is the attribute/, "and the code records why that is safe");
  });
});

describe("permission behaviour this child must not have moved", () => {
  it("keeps the dialog target and its callback", () => {
    const body = slice("  function openPermissionDialog({ title, overrides, onSave }) {");
    assert.match(body, /editingPermissionTarget = \{\s*\n\s*onSave,\s*\n\s*overrides: normalizePermissionOverrides\(overrides\),/,
      "the incoming overrides are normalised once, on open");
    assert.match(slice("  function savePermissionDialog() {"),
      /editingPermissionTarget\.onSave\(readPermissionMatrix\(\)\);\s*\n\s*closePermissionDialog\(\);/,
      "and the callback still receives the matrix read, before the dialog closes");
    assert.match(slice("  function closePermissionDialog() {"), /editingPermissionTarget = null;/);
  });

  it("keeps the matrix rendering every catalogue operation", () => {
    const body = slice("  function renderPermissionMatrix(overrides) {");
    assert.match(body, /permissionResources\.forEach\(\(resource\) => \{/);
    assert.match(body, /checkbox\.checked = getOperationAllowed\(overrides, resource\.key, operation\);/);
    assert.match(body, /checkbox\.dataset\.permissionResource = resource\.key;/);
    assert.match(body, /checkbox\.dataset\.permissionOperation = operation;/);
  });

  it("keeps the two time-entry allowances derived from the matrix", () => {
    const body = slice("  function readPermissionMatrix() {");
    assert.match(body, /overrides\.allowManualTime = getOperationAllowed\(overrides, "time_entries", "create"\);/);
    assert.match(body, /overrides\.allowEditTime = getOperationAllowed\(overrides, "time_entries", "update"\);/);
  });

  it("leaves the clusters it does not own to their own children", () => {
    // Retargeted by `0.33.33.44.9`, which legitimately converted `roleAssignmentList`. Naming
    // specific unconverted controls makes this case a maintenance tax on every later child, so
    // the durable claim is the pair that actually matters: this page is still being converted
    // cluster by cluster, and this cluster's own required accesses stay inside it - which the
    // case above already checks by argument.
    const bare = [...page.matchAll(/= document\.querySelector\("\[data-/g)].length;
    assert.ok(bare > 0, "controls no landed child owns are still bare");
    const checked = [...page.matchAll(/findUserAdminControl\("\[data-/g)].length;
    assert.ok(checked > CONTROLS.length,
      "and more than this cluster's own six are checked, because earlier children landed too");
  });

  it("adds no suppression, any, or namespace surface", () => {
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
  });
});
