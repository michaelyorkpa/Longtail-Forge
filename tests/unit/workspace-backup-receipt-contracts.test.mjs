import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/workspace-backups.service.js");
const repo = read("src/repositories/workspace-backup-exports.repo.js");
const routes = read("src/routes/settings.routes.js");
const consumer = read("public/js/workspace-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The literal `toBrowserReceipt` builds, sliced from the service rather than listed here. */
function receiptLiteral() {
  const body = functionBody(service, "function toBrowserReceipt(receipt, workspace) {");
  const at = body.indexOf("return {");
  assert.notEqual(at, -1, "the receipt shaper must return an object literal");
  return body.slice(at, body.indexOf("\n  };", at));
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = consumer.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return consumer.slice(start, consumer.indexOf("\n  }\n", start) + 4);
  };
  const tables = [...consumer.matchAll(/const BACKUP_RECEIPT_\w+ = Object\.freeze\(\[[\s\S]*?\]\);/g)].map((m) => m[0]);
  assert.equal(tables.length, 2, "both receipt member tables must exist in the page source");
  const source = [
    ...tables,
    slice("function isDeletionRecord(value) {"),
    slice("function readWorkspaceBackupReceipt(value) {"),
    slice("function readWorkspaceBackupEnvelope(body) {"),
    "return readWorkspaceBackupEnvelope;",
  ].join("\n");
  return new Function(source)();
}

const receipt = (overrides = {}) => ({
  appVersion: "0.33.33",
  archiveSha256: "a".repeat(64),
  createdAt: "2026-09-03T00:00:00.000Z",
  createdByName: "Workspace administrator",
  fileObjectBytes: 4096,
  fileObjectCount: 12,
  packageLabel: "Workspace backup created 3 Sep 2026",
  secureNotesKeyIncluded: false,
  secureNotesRecoveryRequired: false,
  status: "created",
  workspaceName: "Acme",
  ...overrides,
});

describe("the backup receipt producer", () => {
  it("answers both routes through one shaper", () => {
    assert.match(
      functionBody(service, "async function readLatest(session) {"),
      /return receipt \? toBrowserReceipt\(receipt, workspace\) : null;/,
      "the read must answer the shaper or null",
    );
    assert.match(
      functionBody(service, "async function create(session) {"),
      /return toBrowserReceipt\(\{ \.\.\.receipt, createdByName: session\.display_name \|\| session\.username \}, workspace\);/,
      "the create must answer the same shaper, adding only the acting administrator's name",
    );
  });

  it("reconstructs eleven members and spreads nothing", () => {
    const literal = receiptLiteral();
    const members = [...literal.matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      [
        "appVersion", "archiveSha256", "createdAt", "createdByName", "fileObjectBytes",
        "fileObjectCount", "packageLabel", "secureNotesKeyIncluded", "secureNotesRecoveryRequired",
        "status", "workspaceName",
      ],
      "the receipt must carry exactly the eleven declared members",
    );
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
  });

  it("writes two of them as constants rather than discovering them", () => {
    const literal = receiptLiteral();
    assert.match(literal, /secureNotesKeyIncluded: false,/, "the secure-notes key flag must be a written constant");
    assert.match(literal, /status: "created",/, "the status must be a written constant");
    const declared = declaredInterface("BrowserWorkspaceBackupReceipt");
    assert.match(declared, /secureNotesKeyIncluded: false;/, "and must be declared as the literal it is");
    assert.match(declared, /status: "created";/, "and so must the status");
  });

  it("withholds the stored row's identifiers", () => {
    const literal = receiptLiteral();
    for (const column of ["backupId", "workspaceId", "archiveFilename", "createdByUserId"]) {
      assert.ok(repo.includes(column), "the stored row must carry " + column + " for this withholding to mean anything");
      assert.ok(!literal.includes(column), "the receipt must not disclose " + column);
    }
  });

  it("does answer the integrity digest, which is the deliberate contrast", () => {
    assert.match(receiptLiteral(), /archiveSha256: receipt\.archiveSha256,/,
      "the administrator who made the package may check its digest");
    const declared = declaredInterface("BrowserWorkspaceBackupReceipt");
    assert.match(declared, /archiveSha256: string;/, "and the contract must say so plainly");
  });

  it("gates both routes on the public-demo capability and the backup permission", () => {
    for (const opener of [
      "async function readLatest(session) {",
      "async function create(session) {",
    ]) {
      const body = functionBody(service, opener);
      assert.match(body, /assertPublicDemoCapabilityAllowed\("backups\.workspace"\)/,
        opener + " must assert the public-demo capability");
      assert.match(body, /assertCanManageWorkspaceBackup\(session\)/,
        opener + " must assert the backup permission");
    }
  });

  it("wraps both answers the same way", () => {
    for (const opener of [
      "settingsRoutes.get(\"/settings/workspace-backups/latest\"",
      "settingsRoutes.post(\"/settings/workspace-backups\"",
    ]) {
      const at = routes.indexOf(opener);
      assert.notEqual(at, -1, opener + " must exist");
      const route = routes.slice(at, routes.indexOf("}));", at));
      assert.match(route, /workspaceBackupsService\.(readLatest|create)\(request\.session\)/,
        opener + " must call its traced producer");
      assert.match(route, /\.json\(\{ backup \}\)/, opener + " must wrap the receipt as the same one member");
    }
  });
});

describe("the declaration", () => {
  it("declares the shaper's own membership, with nothing optional", () => {
    const declared = declaredInterface("BrowserWorkspaceBackupReceipt");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    const produced = [...receiptLiteral().matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, produced, "declared membership must equal the shaper's own literal");
    assert.ok(!/^  \w+\?:/m.test(declared), "no receipt member may be optional");
  });

  it("makes null the read's answer, not the envelope's shape being unknown", () => {
    const declared = declaredInterface("BrowserWorkspaceBackupEnvelope");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["backup"], "the envelope must carry exactly one member");
    assert.match(declared, /backup: BrowserWorkspaceBackupReceipt \| null;/,
      "and that member must admit the read's empty answer");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readEnvelope = shippedReader();

  it("accepts a real receipt", () => {
    const result = readEnvelope({ backup: receipt() });
    assert.ok(result && result.backup, "a valid receipt must be accepted");
    assert.equal(result.backup.archiveSha256, "a".repeat(64), "its digest must survive the read");
    assert.equal(result.backup.status, "created", "and so must its constant status");
  });

  it("accepts the read's answer for a workspace never backed up", () => {
    const result = readEnvelope({ backup: null });
    assert.ok(result, "an explicit null must be accepted");
    assert.equal(result.backup, null, "and answered as the null it is");
  });

  it("refuses an unreadable body rather than reading it as never backed up", () => {
    for (const bad of [null, undefined, 7, "backup", [], {}]) {
      assert.equal(readEnvelope(bad), null, "an envelope with no backup member must be refused: " + String(bad));
    }
  });

  it("refuses a receipt claiming to carry a secure-notes key", () => {
    assert.equal(
      readEnvelope({ backup: receipt({ secureNotesKeyIncluded: true }) }),
      null,
      "a receipt contradicting the shaper's constant did not come from it",
    );
  });

  it("refuses a receipt describing anything but a created package", () => {
    for (const status of ["pending", "failed", "", null, undefined]) {
      assert.equal(
        readEnvelope({ backup: receipt({ status }) }),
        null,
        "an unproducible status must refuse the receipt: " + String(status),
      );
    }
  });

  it("refuses a receipt missing a member the shaper always writes", () => {
    for (const key of ["appVersion", "archiveSha256", "createdAt", "createdByName", "packageLabel", "workspaceName"]) {
      // Built by omission rather than by assigning `undefined`, so the fixture stays a plain
      // record this test can index without widening the receipt's own shape.
      const partial = Object.fromEntries(Object.entries(receipt()).filter(([name]) => name !== key));
      assert.equal(readEnvelope({ backup: partial }), null, "a receipt without " + key + " must be refused");
    }
  });

  it("refuses a receipt whose counts are not finite numbers", () => {
    for (const bad of ["4096", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(
        readEnvelope({ backup: receipt({ fileObjectBytes: bad }) }),
        null,
        "a non-finite byte count must refuse the receipt: " + String(bad),
      );
    }
  });

  it("refuses a receipt whose recovery flag is not a boolean", () => {
    assert.equal(readEnvelope({ backup: receipt({ secureNotesRecoveryRequired: "yes" }) }), null,
      "the recovery flag must be a real boolean");
  });

  it("accepts a receipt carrying members this contract never promised", () => {
    const result = readEnvelope({ backup: receipt({ someFutureReceiptMember: 1 }) });
    assert.ok(result && result.backup, "an unrecognised member must not refuse the receipt");
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.backup, "someFutureReceiptMember"),
      false,
      "but it must not be answered either, because the receipt is reconstructed",
    );
  });
});

describe("the workspace settings consumer", () => {
  it("no longer reads an unreadable body as no backup", () => {
    assert.ok(!consumer.includes("result.backup || null"), "the raw backup default must be gone");
  });

  it("refuses an unreadable read rather than saying none was ever taken", () => {
    assert.match(
      consumer,
      /throw new Error\("The latest workspace backup could not be read\./,
      "an unreadable read must take the backup error path",
    );
  });

  it("never says no backup was taken beside one that just was", () => {
    const create = functionBody(consumer, "  async function createWorkspaceBackup() {");
    assert.match(
      create,
      /"Workspace backup created, but its receipt could not be read\./,
      "the create must report the package it built even when the receipt is unreadable",
    );
    assert.ok(
      create.indexOf("could not be read.") < create.indexOf("renderWorkspaceBackupSummary(envelope.backup)"),
      "and must return before rendering a summary it could not read",
    );
  });

  it("checks the constants rather than displaying whatever arrived", () => {
    const reader = consumer.slice(
      consumer.indexOf("function readWorkspaceBackupReceipt"),
      consumer.indexOf("function readWorkspaceBackupEnvelope"),
    );
    assert.match(reader, /value\.secureNotesKeyIncluded !== false/, "the secure-notes constant must be checked");
    assert.match(reader, /value\.status !== "created"/, "the status constant must be checked");
    assert.match(reader, /Number\.isFinite\(value\[key\]\)/, "both counts must be checked as finite numbers");
  });
});
