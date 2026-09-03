import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/files.service.js");
const accountingService = read("src/services/files-storage-accounting.service.js");
const routes = read("src/routes/files.routes.js");
const consumer = read("public/js/files-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} source @param {string} opener @param {string} indent */
function returnLiteral(source, opener, indent) {
  const body = functionBody(source, opener);
  const at = body.lastIndexOf("return {");
  assert.notEqual(at, -1, opener + " must end in an object literal");
  return body.slice(at, body.indexOf("\n" + indent + "};", at));
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/**
 * The shipped reader, instantiated from the page's own source.
 *
 * Sliced rather than reimplemented, so these behavioural checks exercise the function that
 * actually runs in the browser. It depends on nothing but the two helpers taken with it.
 */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = consumer.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return consumer.slice(start, consumer.indexOf("\n  }\n", start) + 4);
  };
  const table = /const ACCOUNTING_TOTALS = Object\.freeze\(\[[\s\S]*?\]\);/.exec(consumer);
  assert.ok(table, "the totals table must exist in the page source");
  const source = [
    table[0],
    slice("function isSettingsRecord(value) {"),
    slice("function readWorkspaceFileSettingsResponse(body) {"),
    "return readWorkspaceFileSettingsResponse;",
  ].join("\n");
  return new Function(source)();
}

const validTotals = {
  externalFileCount: 2,
  externalReportedBytes: 4096,
  fileCount: 7,
  internalBytes: 8192,
  internalFileCount: 5,
};
/** @param {Record<string, unknown>} [totals] */
const validBody = (totals = validTotals) => ({
  accounting: { entries: [{ storageKind: "internal" }], totals: { ...totals } },
  settings: { fileTypePolicyMode: "safe_default" },
});

describe("the settings producer", () => {
  it("reconstructs two members and spreads nothing", () => {
    const literal = returnLiteral(service, "async function readWorkspaceFileSettings(session) {", "  ");
    const members = [...literal.matchAll(/^    (\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["accounting", "settings"], "the settings body must carry exactly two members");
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
  });

  it("makes the save answer the read itself, not a copy of it", () => {
    const body = functionBody(service, "async function saveWorkspaceFileSettings(session, payload = {}) {");
    assert.match(
      body,
      /return readWorkspaceFileSettings\(session\);/,
      "the save must end by calling the read, which is what makes one contract cover both routes",
    );
  });

  it("takes the accounting from the same function the accounting route uses", () => {
    const settingsBody = functionBody(service, "async function readWorkspaceFileSettings(session) {");
    assert.match(
      settingsBody,
      /const accounting = await readStorageAccounting\(session\);/,
      "the settings body must embed the storage accounting producer",
    );
    const accountingBody = functionBody(service, "async function readStorageAccounting(session, filters = {}) {");
    assert.match(
      accountingBody,
      /filesStorageAccountingService\.readStorageAccounting\(\{/,
      "that producer must be the storage accounting service",
    );
    const at = routes.indexOf("filesRoutes.get(\"/files/storage/accounting\"");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(
      route,
      /filesService\.readStorageAccounting\(request\.session, request\.query\)/,
      "the accounting route must reach the same producer, which is what earns the shared declaration",
    );
  });

  it("hands both settings bodies to the browser unchanged", () => {
    for (const [opener, call] of [
      ["filesRoutes.get(\"/files/settings\"", "filesService.readWorkspaceFileSettings(request.session)"],
      ["filesRoutes.put(\"/files/settings\"", "filesService.saveWorkspaceFileSettings(request.session, payload)"],
    ]) {
      const at = routes.indexOf(opener);
      assert.notEqual(at, -1, opener + " must exist");
      const route = routes.slice(at, routes.indexOf("}));", at));
      assert.ok(route.includes(call), opener + " must call its traced producer");
      assert.match(route, /response\.status\(200\)\.json\(result\)/, opener + " must answer the producer's result");
    }
  });

  it("keeps both settings routes behind the Files settings permission", () => {
    for (const opener of [
      "async function readWorkspaceFileSettings(session) {",
      "async function saveWorkspaceFileSettings(session, payload = {}) {",
      "async function readStorageAccounting(session, filters = {}) {",
    ]) {
      const body = functionBody(service, opener);
      assert.match(
        body,
        /permissionsService\.assertCan\(session, "files\.manage_workspace_settings"/,
        opener + " must assert the Files workspace-settings permission",
      );
    }
  });
});

describe("the accounting producer", () => {
  it("reconstructs entries and totals, and spreads nothing", () => {
    const literal = returnLiteral(accountingService, "async function readStorageAccounting(input) {", "  ");
    const members = [...literal.matchAll(/^    (\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["entries", "totals"], "the accounting result must carry exactly two members");
    assert.ok(!literal.includes("..."), "a spread would make the exact accounting membership unearned");
  });

  it("seeds the five totals, so none can ever be absent", () => {
    const body = functionBody(accountingService, "function summarizeStorageAccounting(entries = []) {");
    const seed = body.slice(body.lastIndexOf("}, {"));
    const seeded = [...seed.matchAll(/^    (\w+): 0,/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      seeded,
      ["externalFileCount", "externalReportedBytes", "fileCount", "internalBytes", "internalFileCount"],
      "the reduce must seed exactly the five declared totals at zero",
    );
    const declaredMembers = [...declaredInterface("BrowserFileStorageAccountingTotals")
      .matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(declaredMembers, seeded, "the declared totals must be the reduce's own seed");
  });

  it("clamps nothing, which is why the contract promises finiteness and not integers", () => {
    const shaper = functionBody(accountingService, "function shapeStorageAccountingRow(row) {");
    assert.ok(!shaper.includes("clampInteger"), "the row shaper must not clamp, or the contract would understate it");
    assert.match(shaper, /fileCount: Number\(row\.file_count \|\| 0\)/, "counts must be plain Number coercions");
    const declared = declaredInterface("BrowserFileStorageAccountingTotals");
    assert.ok(!/: 0 \|/.test(declared), "no total may be declared as a narrowed numeric literal union");
  });

  it("leaves the entry breakdown undescribed, because nothing reads into one", () => {
    assert.match(declaredInterface("BrowserFileStorageAccounting"), /entries: unknown\[\];/,
      "entries must stay an unnamed container");
    assert.ok(
      !/accounting\.entries/.test(consumer),
      "declaring the entry members would claim checks this page never makes",
    );
  });
});

describe("the declaration", () => {
  it("declares the settings body's membership exactly, with nothing optional", () => {
    const declared = declaredInterface("BrowserWorkspaceFileSettingsResponse");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["accounting", "settings"], "declared membership must equal the producer's literal");
    assert.ok(!/^  \w+\?:/m.test(declared), "neither member may be optional");
  });

  it("leaves the settings half undescribed rather than freezing its vocabulary", () => {
    assert.match(declaredInterface("BrowserWorkspaceFileSettingsResponse"), /settings: unknown;/,
      "the settings member must be declared present and left unnamed");
    const shaper = functionBody(service, "function shapeWorkspaceFileSettings(settings) {");
    assert.match(shaper, /policyModes: \[\.\.\.FILE_TYPE_POLICY_MODES\]/,
      "the settings shaper must exist for this deferral to be a real choice");
    assert.ok(
      !/response\.settings\./.test(consumer) && !/settings\.allowedExtensions/.test(consumer),
      "this page must not read the settings half it declines to name",
    );
  });

  it("does not send the readout back through the save", () => {
    const saveCall = consumer.slice(consumer.indexOf("api.putJson(\"/api/files/settings\""));
    const payload = saveCall.slice(0, saveCall.indexOf("});"));
    assert.ok(!payload.includes("accounting"), "accounting is a readout and must never be written back");
    assert.ok(!payload.includes("totals"), "no total may be sent as a settings value");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readResponse = shippedReader();

  it("accepts a valid body and answers the five totals", () => {
    const result = readResponse(validBody());
    assert.ok(result, "a valid body must be accepted");
    assert.deepEqual(result.accounting.totals, validTotals, "every total must survive the read");
  });

  it("accepts a real all-zero record, because zero usage is a fact the server can state", () => {
    const zeros = {
      externalFileCount: 0,
      externalReportedBytes: 0,
      fileCount: 0,
      internalBytes: 0,
      internalFileCount: 0,
    };
    const result = readResponse({ accounting: { entries: [], totals: zeros }, settings: {} });
    assert.ok(result, "an empty workspace's real zeros must be accepted");
    assert.deepEqual(result.accounting.totals, zeros, "the zeros must be reported as the zeros they are");
  });

  it("refuses an absent accounting record rather than treating it as zero usage", () => {
    assert.equal(readResponse({ settings: {} }), null, "a body with no accounting must be refused");
    assert.equal(readResponse({ accounting: null, settings: {} }), null, "a null accounting must be refused");
  });

  it("refuses a missing total rather than defaulting it", () => {
    const { internalBytes, ...partial } = validTotals;
    assert.equal(typeof internalBytes, "number", "the omitted total must be one the producer really answers");
    assert.equal(readResponse(validBody(partial)), null, "a body missing one total must be refused whole");
  });

  it("refuses a total that is not a finite number", () => {
    for (const bad of ["8192", null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      assert.equal(
        readResponse(validBody({ ...validTotals, internalBytes: bad })),
        null,
        "a non-finite internalBytes must be refused: " + String(bad),
      );
    }
  });

  it("refuses a non-array entry breakdown, and accepts one it does not read into", () => {
    assert.equal(
      readResponse({ accounting: { entries: {}, totals: validTotals }, settings: {} }),
      null,
      "entries must be a container",
    );
    const opaque = readResponse({ accounting: { entries: [1, "x", null], totals: validTotals }, settings: {} });
    assert.ok(opaque, "entries this page never reads into need not be described");
  });

  it("answers its own five totals rather than handing back the body's object", () => {
    const body = validBody({ ...validTotals, sneakyExtra: 99 });
    const result = readResponse(body);
    assert.ok(result, "an extra member on the totals must not by itself refuse the body");
    assert.deepEqual(
      Object.keys(result.accounting.totals).sort(),
      ["externalFileCount", "externalReportedBytes", "fileCount", "internalBytes", "internalFileCount"],
      "the reader must reconstruct the five totals rather than alias the wire object",
    );
    assert.notEqual(
      result.accounting.totals,
      body.accounting.totals,
      "the returned totals must not be the same object the wire supplied",
    );
  });

  it("refuses a body that is not an object at all", () => {
    for (const bad of [null, undefined, 7, "accounting", [], true]) {
      assert.equal(readResponse(bad), null, "a primitive body must be refused: " + String(bad));
    }
  });

  it("refuses a body with no settings member, because the producer always names both", () => {
    assert.equal(
      readResponse({ accounting: { entries: [], totals: validTotals } }),
      null,
      "a body missing the settings member did not come from this producer",
    );
  });
});

describe("the files settings consumer", () => {
  it("no longer defaults an unread readout to an empty object", () => {
    assert.ok(!consumer.includes("result.accounting || {}"), "the raw accounting default must be gone");
    assert.ok(!consumer.includes("accounting.totals || {}"), "the raw totals default must be gone");
    for (const total of ["internalFileCount", "internalBytes", "externalFileCount", "externalReportedBytes"]) {
      assert.ok(
        !consumer.includes("totals." + total + " || 0"),
        "the coerced zero for " + total + " must be gone",
      );
    }
  });

  it("starts from unknown usage rather than from zero usage", () => {
    assert.match(consumer, /let accounting = null;/, "the readout state must start absent, not empty");
    assert.match(
      consumer,
      /@type \{BrowserFileStorageAccounting \| null\}/,
      "the state slot must admit that the readout can be absent",
    );
  });

  it("renders an explicit unavailable readout instead of fabricated zeros", () => {
    const renderer = functionBody(consumer, "  function renderAccounting() {");
    assert.match(renderer, /if \(!accounting\) \{/, "an absent readout must take its own branch");
    assert.match(renderer, /Storage usage is unavailable\./, "the absent branch must say usage is unknown");
    const absentBranch = renderer.slice(
      renderer.indexOf("if (!accounting) {"),
      renderer.indexOf("const totals = accounting.totals;"),
    );
    assert.ok(
      absentBranch.includes("}));\n      return;\n    }\n"),
      "the absent branch must return before any total is read",
    );
  });

  it("refuses an unreadable load rather than showing a usage figure", () => {
    assert.match(
      consumer,
      /throw new Error\("Files settings could not be read\./,
      "an unreadable settings body must take the page's error path",
    );
  });

  it("never reports a completed save as failed just because the readout was unreadable", () => {
    const save = functionBody(consumer, "  async function saveFilesSettings() {");
    assert.match(
      save,
      /accounting = response \? response\.accounting : null;/,
      "an unreadable body must drop the readout, not the save",
    );
    assert.match(
      save,
      /"Files settings saved\. Storage usage could not be read\."/,
      "the status must say what actually happened",
    );
    assert.ok(
      save.indexOf("return true;") !== -1,
      "a save the server completed must still be reported as completed",
    );
  });
});
