import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Time Entry Dialog's context and save round trip, typed by `0.33.33.44.3`.
 *
 * **One round trip, so one boundary.** `prepareContext` fetches the client catalogue and finds
 * the entry, `openDialog` writes that entry into the controls `0.33.33.44.2` typed, and
 * `saveEntry` reads those same controls back into a payload and chooses the create or the update
 * route by whether an entry was selected. What one half writes the other reads, so typing them
 * against one model is what makes the trip checkable rather than checkable twice.
 *
 * Typing the three slots uncovered three real findings the empty types had hidden - an
 * unresolvable client dereferenced without a guard, one context read that skipped the file's own
 * optional idiom, and host params treated as arbitrary data when every read is form text. Each is
 * resolved below rather than typed around.
 */

const page = readFileSync(new URL("../../public/js/time-entry-dialog.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/** @param {string} name */
function typedefBody(name) {
  const at = page.indexOf(`}} ${name}`);
  assert.notEqual(at, -1, name + " must be declared");
  return page.slice(page.lastIndexOf("@typedef {{", at), at);
}

describe("the entry model is this page's own, and it is exact", () => {
  it("declares the thirteen members the normaliser names", () => {
    const normaliser = slice("  function normalizeTimeEntries(data) {");
    const built = [...normaliser.matchAll(/^ {6}(\w+):/gm)].map((entry) => entry[1]).sort();
    assert.equal(built.length, 13, "the normaliser rebuilds thirteen members");
    const declared = [...typedefBody("NormalizedTimeEntry").matchAll(/^\s+\*\s+(\w+):/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, built, "and the model declares exactly those");
  });

  it("declares the converted members at what the normaliser converts them to", () => {
    const body = typedefBody("NormalizedTimeEntry");
    const normaliser = slice("  function normalizeTimeEntries(data) {");
    assert.match(normaliser, /startTime: new Date\(entry\.start_time\)/);
    assert.match(normaliser, /endTime: new Date\(entry\.end_time\)/);
    assert.match(body, /startTime: Date,/, "so the model says Date, not the wire string");
    assert.match(body, /endTime: Date,/);
    assert.match(normaliser, /durationSeconds: Number\(entry\.duration_seconds\) \|\| 0/);
    assert.match(body, /durationSeconds: number,/);
    assert.match(body, /tags: unknown\[\],/,
      "tags are passed through unchecked, so the model does not claim their elements");
  });

  it("answers that model from the normaliser", () => {
    const at = page.indexOf("  function normalizeTimeEntries(data) {");
    assert.match(page.slice(page.lastIndexOf("/**", at), at), /@returns \{NormalizedTimeEntry\[\]\}/);
  });

  it("is declared here rather than published, and says why", () => {
    // `time-entries.js` keeps a separate copy; whether those two are one model is its own
    // boundary, not this child's.
    assert.ok(!/NormalizedTimeEntry/.test(contracts),
      "the page model is not published as a browser contract");
    assert.match(page, /time-entries\.js` keeps a separate copy/,
      "and the reason is recorded where the model is declared");
    const other = readFileSync(new URL("../../public/js/time-entries.js", import.meta.url), "utf8");
    assert.match(other, /function normalizeTimeEntries\(data\) \{/,
      "that separate copy really does exist");
  });
});

describe("the round trip's three slots carry the models they hold", () => {
  it("types the catalogue from the shared helper's published contract", () => {
    assert.match(page, /@type \{NormalizedClientOption\[\]\}\s*\n\s*\*\/\s*\n\s*let clients = \[\];/);
    assert.match(page, /NormalizedClientOption\} NormalizedClientOption \*\//,
      "reused by import rather than redescribed");
    assert.ok(contracts.includes("export interface NormalizedClientOption {"),
      "and that contract is the published one");
    assert.match(executable, /clients = normalizeClients\(clientProjectData, \{ includeInactive: mode === "edit" \}\);/,
      "which is what fills the slot");
  });

  it("types the selected entry as the hinge of the trip", () => {
    assert.match(page, /@type \{NormalizedTimeEntry \| null\}\s*\n\s*\*\/\s*\n\s*let selectedEntry = null;/);
    // Both halves read it, and the save route is chosen by it.
    assert.match(slice("  async function prepareContext({ entryId = \"\", hostContext = null, mode = \"add\", params = {} } = {}) {"),
      /selectedEntry = entryId/, "prepareContext sets it");
    assert.match(executable, /selectedEntry \? readUpdatedTimeEntryId\(|selectedEntry\s*\n?\s*\?/,
      "and the save path branches on it");
  });

  it("types the context as a structural minimum, because configure spreads", () => {
    const body = slice("  function configure(options = {}) {");
    assert.match(body, /\.\.\.context,\s*\n\s*\.\.\.options,/,
      "configure spreads over its named defaults");
    const declared = [...typedefBody("TimeEntryDialogContext").matchAll(/^\s+\*\s+(\w+):/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, ["hostContext", "mode", "onSaved", "setStatus", "tagOptions"],
      "so the model names the five it reads and claims no more");
    assert.match(page, /\/\*\* @type \{TimeEntryDialogContext \| null\} \*\/\s*\n\s*let context = null;/);
  });

  it("names only the host members this dialog calls back into", () => {
    const declared = [...typedefBody("TimeEntryDialogHostContext").matchAll(/^\s+\*\s+(\w+)\??:/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, ["cancel", "complete", "setStatus"]);
    for (const member of declared) {
      assert.ok(executable.includes(`hostContext?.${member}?.(`),
        `${member} is called optionally, which is why it is declared optional`);
    }
  });
});

describe("three findings the empty types had hidden, each resolved rather than typed around", () => {
  it("refuses a save whose client cannot be resolved", () => {
    const body = slice("  async function saveEntry(event) {");
    const guard = body.indexOf("if (!client) {");
    const payload = body.indexOf("client_id: client.isWorkspaceScope");
    assert.notEqual(guard, -1, "the unresolvable client is refused");
    assert.notEqual(payload, -1, "and the payload still reads the client");
    assert.ok(guard < payload, "the refusal precedes the read that would have thrown");
    assert.match(body, /setStatus\("Select a client before saving\."\);\s*\n\s*return;/,
      "through the same status path this handler already uses");
  });

  it("records that the guard is defensive, and why it is unreachable today", () => {
    const markup = slice("  function dialogMarkup() {");
    assert.match(markup, /<select data-time-entry-dialog-client required>/,
      "the select is required, so the browser refuses the submit first");
    // Scoped to the save handler: `populateProjectOptions` carries its own `if (!client)`
    // earlier in the file, and a whole-file search finds that one instead.
    const body = slice("  async function saveEntry(event) {");
    const at = body.indexOf("if (!client) {");
    assert.notEqual(at, -1, "the save handler must carry the guard");
    assert.match(body.slice(at, at + 460), /unreachable while the client select carries `required`/,
      "and the code says so rather than implying a live bug");
  });

  it("reads the context optionally everywhere, with no remaining exception", () => {
    // Two reads are deliberately unguarded because the line above narrows them with
    // `typeof context?.X === "function"`. What must not exist is a read that is neither
    // optional nor narrowed - which is exactly what the tag picker was.
    // Blank lines dropped so the guard is the preceding *statement*, not the preceding line:
    // stripping comments leaves them behind, and a comment between guard and read narrows nothing.
    const lines = executable.split("\n").filter((line) => line.trim() !== "");
    /** @type {string[]} */
    const unnarrowed = [];
    lines.forEach((line, index) => {
      const read = /(^|[^.\w?])context\.(\w+)/.exec(line);
      if (!read) return;
      const guard = new RegExp(`typeof context\\?\\.${read[2]} === "function"`);
      if (!guard.test(lines[index - 1] || "")) unnarrowed.push(read[2]);
    });
    assert.deepEqual(unnarrowed, [],
      "every context read is optional, or narrowed on the line above");
    assert.match(executable, /tags: context\?\.tagOptions \|\| \[\],/,
      "including the tag picker, which previously did not");
  });

  it("requires host params to be form text, which is all this dialog reads", () => {
    const at = page.indexOf("  function openDialog({ entry = null,");
    const doc = page.slice(page.lastIndexOf("/**", at), at);
    assert.match(doc, /params\?: Record<string, string \| undefined>/,
      "params are declared as text");
    assert.match(doc, /form defaults/, "and the doc says why");
    // Every read really is text into a control, through a `|| ""` chain.
    const body = slice("  function openDialog({ entry = null, mode = \"add\", params = {} } = {}) {");
    for (const read of [...body.matchAll(/params\.(\w+)/g)].map((entry) => entry[1])) {
      assert.ok(new RegExp(`params\\.${read}[^;]*\\|\\|`).test(body) || /entryId|recordId|id/.test(read),
        `params.${read} is read through a fallback chain`);
    }
  });
});

describe("the wire body is checked where it arrives, not assumed by whoever passes it", () => {
  it("keeps the normaliser's parameter unchecked and narrows it inside", () => {
    // Typing the parameter at the shape the body wants was tried and is wrong: `api.getJson`
    // answers `unknown`, so it only moves the error to the call site as a TS2345.
    const at = page.indexOf("  function normalizeTimeEntries(data) {");
    assert.match(page.slice(page.lastIndexOf("/**", at), at), /@param \{unknown\} data/,
      "the body arrives unchecked, and the parameter says so");
    const body = slice("  function normalizeTimeEntries(data) {");
    assert.match(body, /const entries = isTimeEntryRecord\(data\) && Array\.isArray\(data\.entries\) \? data\.entries : \[\];/,
      "the envelope is narrowed by this page's own record predicate");
    assert.match(body, /return entries\.filter\(isTimeEntryRow\)\.map\(/,
      "and every row is checked before it is rebuilt - see time-entry-dialog-normalizer-contracts");
  });

  it("does not borrow the save-response predicate for a GET envelope", () => {
    // The call, not the name: the normaliser's comment names the predicate to say why it is
    // *not* reused, and that explanation is worth keeping.
    const normaliser = slice("  function normalizeTimeEntries(data) {").replace(/(^|\s)\/\/[^\n]*/g, "$1");
    assert.ok(!normaliser.includes("isSaveResponseRecord("),
      "all of its uses are genuinely save responses, so borrowing it would make its name untrue");
    const uses = [...page.matchAll(/isSaveResponseRecord\(/g)].length;
    assert.equal(uses, 5, "one declaration and four uses, every one a save response");
  });

  it("checks the host payload before spreading it, and still spreads the whole response", () => {
    // `0.33.33.44.3` reverted this check because it had rebuilt the payload, which the older
    // save contract rightly forbids. The check itself was never the problem: narrowing the value
    // *before* the spread keeps the spread, its members and the validated identity exactly as
    // they were. `{}` is what spreading a non-record already produced.
    const body = slice("  async function saveEntry(event) {");
    assert.match(body, /const savedResult = isSaveResponseRecord\(result\) \? result : \{\};/,
      "the response is established first");
    assert.match(body, /await context\.onSaved\(\{ \.\.\.savedResult, entryId: savedEntryId \}\);/,
      "and the spread still carries the whole decorated response plus the validated identity");
    assert.doesNotMatch(body, /onSaved\(\{ entryId|onSaved\(\{ entry_id/,
      "nothing is truncated for the callback, which is what the older contract protects");
    const contract = readFileSync(new URL("../../tests/unit/time-entry-save-contracts.test.mjs", import.meta.url), "utf8");
    assert.match(contract, /nothing is truncated for the callback/,
      "and that contract still makes the claim, retargeted rather than weakened");
  });

  it("declares the entry points at the same text params prepareContext requires", () => {
    for (const opener of ['  async function openAdd(params = {}, hostContext = null) {',
      '  async function openEdit(params = {}, hostContext = null) {']) {
      const at = page.indexOf(opener);
      assert.notEqual(at, -1, opener + " must exist in the page source");
      const doc = page.slice(page.lastIndexOf("/**", at), at);
      assert.match(doc, /@param \{Record<string, string \| undefined>\} \[params\]/);
      assert.match(doc, /@param \{TimeEntryDialogHostContext \| null\} \[hostContext\]/);
    }
    const prepareAt = page.indexOf("  async function prepareContext({");
    assert.match(page.slice(page.lastIndexOf("/**", prepareAt), prepareAt),
      /params\?: Record<string, string \| undefined>/,
      "which is exactly what they hand it");
    const statusAt = page.indexOf("  function setStatus(message, options = {}) {");
    assert.match(page.slice(page.lastIndexOf("/**", statusAt), statusAt),
      /@param \{\{ isError\?: boolean \}\} \[options\]/,
      "and the status path both halves report through declares its one option");
  });
});

describe("round-trip behaviour this child must not have moved", () => {
  it("keeps the create and update asymmetry the audit found sound", () => {
    // The 2026-09-08 audit verified these two readers model a real producer asymmetry: create
    // answers an outer entry_id, update does not. Reworking them was explicitly out of scope.
    assert.match(page, /function readCreatedTimeEntryId\(body\) \{/);
    assert.match(page, /function readUpdatedTimeEntryId\(body, requestedEntryId\) \{/);
    assert.match(slice("  function readCreatedTimeEntryId(body) {"),
      /body\.entry_id !== nested/, "create still requires both identities to agree");
    assert.match(slice("  function readUpdatedTimeEntryId(body, requestedEntryId) {"),
      /nested !== requestedEntryId/, "update still checks the record it addressed");
    assert.ok(!/entry_id/.test(slice("  function readUpdatedTimeEntryId(body, requestedEntryId) {")
      .replace(/nested/g, "")), "and still invents no outer identity");
  });

  it("keeps prepareContext refusing an entry it cannot find", () => {
    const body = slice("  async function prepareContext({ entryId = \"\", hostContext = null, mode = \"add\", params = {} } = {}) {");
    assert.match(body, /if \(entryId && !selectedEntry\) \{\s*\n\s*throw new Error\("Time entry could not be found\."\);/);
    assert.match(body, /includeInactive: mode === "edit"/,
      "and still widens the catalogue only when editing");
  });

  it("keeps the edit and add population paths distinct", () => {
    const body = slice("  function openDialog({ entry = null, mode = \"add\", params = {} } = {}) {");
    assert.match(body, /fields\.invoiceStatus\.value = entry\.invoiceStatus \|\| "unbilled";/,
      "an edit populates from the entry");
    assert.match(body, /fields\.invoiceStatus\.value = params\.invoiceStatus \|\| params\.invoice_status \|\| "unbilled";/,
      "and an add from the host params");
    assert.match(body, /selectWorkspaceScopeClientIfNeeded\(\);/,
      "with the workspace-scope default still applied on the add path");
  });

  it("adds no cast, suppression, published contract or namespace surface", () => {
    // Checked against the raw source rather than `executable`: in a JSDoc-typed file every one of
    // these lives *inside* a comment, so stripping comments first would leave the claim
    // unfalsifiable - a suppression could be added and this test would still pass.
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.ok(!/\*\/\s*\(/.test(page), "and no `/** @type */ (expr)` cast");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
    assert.ok(!/TimeEntryDialogContext|NormalizedTimeEntry|TimeEntryDialogHostContext/.test(contracts),
      "the three page models stay local");
  });
});
