import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Time Entry Dialog's helper surface, typed by `0.33.33.44.4`.
 *
 * **The helpers are typed from the models `0.33.33.44.3` declared**, which is what makes this one
 * boundary rather than twenty-one annotations: `NormalizedTimeEntry` for what an entry is,
 * `NormalizedClientOption`/`NormalizedProjectOption` for what the catalogue holds. Every helper
 * either resolves a client or a project out of that catalogue, or formats a value the entry model
 * already names.
 *
 * **It needed a shared prerequisite, and that is reported rather than banked.** `BrowserRecord`
 * carries `[key: string]: unknown`, and a published contract *interface* has no implicit index
 * signature - so `NormalizedClientOption` could not be passed to the record helpers however
 * exactly its shape matched. The helpers read seven named members and never index an arbitrary
 * key, so their parameters now say that. The widening is strictly more permissive and cost
 * `0.33.33.39` nothing.
 */

const page = readFileSync(new URL("../../public/js/time-entry-dialog.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const records = readFileSync(new URL("../../public/js/shared/records.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const pageController = readFileSync(new URL("../../public/js/shared/page-controller.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/**
 * The JSDoc block immediately above a declaration.
 * @param {string} opener
 * @param {string} [source]
 */
function docFor(opener, source = page) {
  const at = source.indexOf(opener);
  assert.notEqual(at, -1, opener + " must exist");
  return source.slice(source.lastIndexOf("/**", at), at);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

describe("the shared prerequisite, widened to what the helpers actually require", () => {
  it("declares the named members separately, with no index signature", () => {
    const fields = contracts.slice(
      contracts.indexOf("export interface BrowserRecordFields {"),
      contracts.indexOf("}", contracts.indexOf("export interface BrowserRecordFields {")) + 1,
    );
    assert.ok(fields.includes("export interface BrowserRecordFields {"), "the named-member type exists");
    assert.ok(!/\[key: string\]/.test(fields),
      "and carries no index signature - that is the whole point of it");
    for (const member of ["clientId", "clientName", "id", "isWorkspaceScope", "name", "projectId", "projectName", "username"]) {
      assert.match(fields, new RegExp(`^\\s+${member}\\?: unknown;`, "m"), member + " is named");
    }
  });

  it("keeps BrowserRecord as the indexed record, built from those members", () => {
    assert.match(contracts, /export interface BrowserRecord extends BrowserRecordFields \{\s*\n\s*\[key: string\]: unknown;\s*\n\}/,
      "the open record still exists for readers that genuinely index arbitrary keys");
  });

  it("widens every record-helper position, and no other", () => {
    const helpers = contracts.slice(contracts.indexOf("export interface BrowserRecords {"),
      contracts.indexOf("}", contracts.indexOf("export interface BrowserRecords {")) + 1);
    assert.match(helpers, /getProjectMatchKey\(project\?: BrowserRecordFields \| null\)/);
    assert.match(helpers, /matchesClient\(entry\?: BrowserRecordFields \| null, client\?: BrowserRecordFields \| null\)/);
    assert.match(helpers, /matchesProject\(entry\?: BrowserRecordFields \| null, project\?: BrowserRecordFields \| null\)/);
    assert.match(helpers, /sortByName<Item extends BrowserRecordFields>/);
    assert.match(contracts, /setStatus\(element: HTMLElement \| null \| undefined[^\n]*\n\s+sortByName<Item extends BrowserRecordFields>/,
      "the page controller's sortByName is widened with them");
    // Nothing else moved. Read comment-stripped, because the new doc block names the type it
    // replaces in prose and that must not count as a surviving signature.
    const declarations = contracts.replace(/\/\*[\s\S]*?\*\//g, " ");
    const remaining = [...declarations.matchAll(/BrowserRecord\b(?!Fields)/g)].length;
    assert.equal(remaining, 1, "the interface declaration is the only place it still appears");
  });

  it("is honest about what the implementations read", () => {
    // The widening is only truthful if nothing indexes an arbitrary key.
    const body = records.slice(records.indexOf("function normalizeKey"), records.indexOf("namespace.records ="));
    // Any element access, not just a dynamic one: `record?.["id"]` reads the same member but
    // stops the source saying so, and the widening's whole justification is that these helpers
    // name every member they touch.
    assert.ok(!/\?\.\[|\w\[["'`]/.test(body), "records.js reads members by name, never by index");
    for (const member of ["isWorkspaceScope", "clientId", "clientName", "id", "name", "projectId", "projectName"]) {
      assert.ok(body.includes("?." + member), member + " is read by name");
    }
    assert.match(records, /BrowserRecordFields\} SharedRecord/,
      "and records.js declares against the widened type");
    assert.match(pageController, /BrowserRecordFields\} PageBrowserRecord/,
      "as does the page controller, whose generic must match the published signature");
  });
});

describe("the helpers are typed from the models this file already declared", () => {
  it("resolves clients and projects at the published catalogue contracts", () => {
    assert.match(docFor("  function getClient(clientId) {"),
      /@param \{string\} clientId @returns \{NormalizedClientOption \| undefined\}/,
      "a lookup that can miss answers an optional");
    assert.match(docFor("  function getProject(clientId, projectId) {"),
      /@returns \{NormalizedProjectOption \| undefined\}/);
    assert.match(docFor("  function normalizeClients(data, options = {}) {"),
      /@param \{unknown\} data[\s\S]*@returns \{NormalizedClientOption\[\]\}/,
      "the catalogue arrives unchecked and leaves typed");
    assert.match(page, /NormalizedProjectOption\} NormalizedProjectOption \*\//,
      "the project contract is imported, not redescribed");
  });

  it("types the entry-shaped helpers at the entry model", () => {
    for (const opener of [
      "  function findClientIdForEntry(entry) {",
      "  function findProjectIdForEntry(entry) {",
      "  function getEffectiveEntryBillable(entry) {",
    ]) {
      assert.match(docFor(opener), /@param \{NormalizedTimeEntry\} entry/, opener + " takes the entry model");
    }
    assert.match(docFor("  function entryHeading(entry) {"),
      /@param \{NormalizedTimeEntry \| null\} entry/,
      "the heading helper accepts null, because the add path passes it");
  });

  it("declares the billable normaliser at what its three callers pass", () => {
    // A wire string, a contract union and an absent member - so `unknown`, narrowed by the
    // comparisons that were already there.
    assert.match(docFor("  function normalizeBillable(value) {"),
      /@param \{unknown\} value @returns \{"yes" \| "no" \| ""\}/);
    const body = slice("  function normalizeBillable(value) {");
    assert.match(body, /value === "yes" \|\| value === true/, "the narrowing comparisons are unchanged");
    assert.match(body, /value === "no" \|\| value === false/);
  });
});

describe("two guards rewritten so they narrow, and one coercion made explicit", () => {
  it("narrows by early return instead of Boolean(), with the same result", () => {
    // `Boolean(x) && expr` does not narrow `x`, so the members after it stayed possibly-undefined.
    // An early return narrows and answers the same value: false when absent, the comparison
    // otherwise.
    assert.ok(!/Boolean\(client\) &&|Boolean\(project\) &&/.test(executable),
      "neither non-narrowing guard survives");
    const client = slice("  function matchesClient(entry, client) {");
    assert.match(client, /if \(!client\) \{\s*\n\s*return false;\s*\n\s*\}/);
    assert.match(client, /return \(entry\.clientId \|\| ""\) === \(client\.isWorkspaceScope \? "" : client\.id\);/,
      "and the comparison itself is untouched");
    const project = slice("  function matchesProject(entry, project) {");
    assert.match(project, /if \(!project\) \{\s*\n\s*return false;\s*\n\s*\}/);
    assert.match(project, /return entry\.projectId === project\.id;/);
  });

  it("keeps both helpers delegating to the shared implementation first", () => {
    // The local bodies are the fallback; the shared helper still wins when present.
    assert.match(slice("  function matchesClient(entry, client) {"),
      /if \(namespace\.records\?\.matchesClient\) \{\s*\n\s*return namespace\.records\.matchesClient\(entry, client\);/);
    assert.match(slice("  function matchesProject(entry, project) {"),
      /if \(namespace\.records\?\.matchesProject\) \{\s*\n\s*return namespace\.records\.matchesProject\(entry, project\);/);
  });

  it("stringifies the duration explicitly, because every caller passes a number", () => {
    assert.match(docFor("  function setDurationInputs(totalSeconds) {"),
      /@param \{number\} totalSeconds/);
    assert.match(slice("  function setDurationInputs(totalSeconds) {"),
      /Number\.parseInt\(String\(totalSeconds\), 10\) \|\| 0/,
      "parseInt was already stringifying a number; declaring the parameter made that visible");
    // The three call sites really do pass numbers.
    assert.match(executable, /setDurationInputs\(entry\.durationSeconds\);/);
    assert.match(executable, /setDurationInputs\(0\);/);
    assert.match(executable, /setDurationInputs\(Math\.round\(/);
    // And the part clamp reads control text, so it stays a string.
    assert.match(docFor("  function clampDurationPart(value) {"), /@param \{string\} value/);
    assert.match(executable, /clampDurationPart\(fields\.duration\w+\.value\)/);
  });
});

describe("the context holder, and what is deliberately left", () => {
  it("declares configure at the structural minimum plus what callers carry", () => {
    assert.match(docFor("  function configure(options = {}) {"),
      /@param \{Partial<TimeEntryDialogContext> & Record<string, unknown>\} \[options\]/,
      "five known members, and a caller may legitimately carry more");
    assert.match(slice("  function configure(options = {}) {"), /\.\.\.context,\s*\n\s*\.\.\.options,/,
      "which is true because it spreads");
    // `prepareContext` is the caller that carries more, and its status callback is why this
    // needed declaring at all.
    assert.match(page, /params,\s*\n\s*tagOptions,\s*\n\s*setStatus: \(message, options = \{\}\) =>/,
      "the status callback now takes its parameter types from this declaration");
  });

  it("names an owner for every diagnostic it deliberately leaves", () => {
    // Deferral must be explicit, not accidental omission.
    const doc = docFor("  let tagPicker = null;");
    assert.match(doc, /Owned by a later `0\.33\.33\.44` child, not forgotten/);
    assert.match(doc, /no published contract yet/, "and says what settling it depends on");
    assert.match(doc, /Nothing else in this file is undeclared/);
    assert.match(slice("  async function saveEntry(event) {"),
      /Left spreading an unchecked value on purpose/,
      "the contracted spread keeps the reason `0.33.33.44.3` recorded");
  });

  it("adds no cast, suppression or namespace surface", () => {
    // Raw source: all of these live in comments, so a stripped view could not fail.
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.ok(!/\*\/\s*\(/.test(page), "and no `/** @type */ (expr)` cast");
    for (const source of [records, pageController]) {
      assert.ok(!/@ts-expect-error|@ts-ignore/.test(source), "nor in the shared files this widened");
    }
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing new is published");
  });
});
