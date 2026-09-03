// Runtime proof for the workspace deletion response boundary.
//
// Three routes - read, request and cancel - all end in one shaper, so there is one contract
// rather than three with identical members, and `toBrowserState` reconstructs by name rather
// than spreading, which is what makes exact producer-agreement proofs appropriate here.
//
// **Two reductions carry the security argument.** The stored lifecycle row holds ten members
// including `purgeToken`, `backupId`, `requestedByUserId` and the purge job's own state; the
// summary answers six and none of those. The backup record holds twelve including the archive
// filename and its digest; the summary passes through two. Both reductions are pinned here.
//
// **And the malformed-body policy is a deliberate tightening.** `result.deletion || null`
// rendered an unreadable body as "this workspace is not pending deletion" - a safety claim the
// data never made. The reader refuses instead.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/workspace-deletion.service.js");
const routesSource = readText("src/routes/settings.routes.js");
const lifecycleRepoSource = readText("src/repositories/workspace-deletion-lifecycle.repo.js");
const backupRepoSource = readText("src/repositories/workspace-backup-exports.repo.js");
const statusMigration = readText("src/db/migrations/077_workspace_purge_boundary.sql");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/workspace-settings.js");

const parser = sandbox(page,
  ["isDeletionRecord", "isDeletionWord", "isDeletionBackup", "isDeletionLifecycle", "readWorkspaceDeletionState"],
  ["DELETION_STATUSES", "DELETION_REQUIREMENTS", "DELETION_BACKUP_NULLABLE_TEXT",
    "DELETION_LIFECYCLE_TEXT", "DELETION_LIFECYCLE_BOOLEANS"]);

const shaper = extractFunctionBlock(serviceSource, "toBrowserState");
const lifecycleShaper = extractFunctionBlock(serviceSource, "toLifecycleSummary");

/** Everything the stored records hold that must never reach the browser. */
const WITHHELD = ["purgeToken", "purge_token", "purgeStartedAt", "purge_started_at", "backupId", "backup_id",
  "requestedByUserId", "requested_by_user_id", "workspaceId", "archiveFilename", "archiveSha256",
  "createdByUserId", "appVersion", "secureNotesRecoveryRequired"];

describe("one shaper for three routes", () => {
  it("is what all three services return", () => {
    for (const name of ["read", "request", "cancel"]) {
      assert.match(extractFunctionBlock(serviceSource, name), /return toBrowserState\(\{/,
        `${name} ends in the shared shaper`);
    }
    assert.equal(serviceSource.split("function toBrowserState(").length, 2, "and there is one shaper, not three");
  });

  it("is wrapped in the same envelope by all three routes", () => {
    for (const route of ["/settings/workspace-deletion\"", "/settings/workspace-deletion/request\"",
      "/settings/workspace-deletion/cancel\""]) {
      const index = routesSource.indexOf(route);
      assert.ok(index > 0, `${route} is registered`);
      assert.match(routesSource.slice(index, index + 400), /json\(\{ deletion \}\)/,
        `${route} answers the same envelope`);
    }
    assert.deepEqual(declaredMembers("BrowserWorkspaceDeletionEnvelope"), ["deletion"],
      "so one envelope contract covers them");
    for (const perRoute of ["BrowserWorkspaceDeletionReadResult", "BrowserWorkspaceDeletionRequestResult",
      "BrowserWorkspaceDeletionCancelResult"]) {
      assert.doesNotMatch(declarationSource, new RegExp(perRoute), `and no ${perRoute} was invented`);
    }
  });

  it("reconstructs by name rather than spreading", () => {
    assert.doesNotMatch(shaper, /\.\.\./, "toBrowserState spreads nothing");
    assert.doesNotMatch(lifecycleShaper, /\.\.\./, "and neither does the lifecycle summary");
    const built = literalMembers(shaper.slice(shaper.indexOf("return {")), 4);
    assert.deepEqual(built.slice().sort(),
      ["acknowledgementPhrase", "backup", "lifecycle", "pending", "workspaceName"],
      "the state is five members built by name");
    assert.deepEqual(declaredMembers("BrowserWorkspaceDeletionState").sort(), built.slice().sort(),
      "and the contract is exactly those five");
  });
});

describe("what the reductions withhold", () => {
  it("drops the purge token, the backup id and the requester id from the lifecycle", () => {
    assert.match(lifecycleRepoSource, /purgeToken: string \| null/, "the stored row carries a purge token");
    assert.match(lifecycleRepoSource, /requestedByUserId: string \| null/, "and the requester's id");
    assert.match(lifecycleRepoSource, /backupId: string \| null/, "and the backup's id");
    const built = literalMembers(lifecycleShaper.slice(lifecycleShaper.indexOf("return {")), 4);
    // The withheld check runs first so that emitting one of these fails by name rather than by
    // the membership comparison below, which any added member would also trip.
    for (const member of WITHHELD) {
      assert.ok(!built.includes(member), `the lifecycle summary must never emit ${member}`);
      assert.ok(!declaredMembers("BrowserWorkspaceDeletionLifecycle").includes(member),
        `and the contract must never name ${member}`);
    }
    assert.deepEqual(built.slice().sort(),
      ["backupProtected", "noCurrentBackupAcknowledged", "purgeAfter", "requestedAt", "requestedByName", "status"],
      "the summary answers six members");
    assert.match(lifecycleShaper, /backupProtected: Boolean\(lifecycle\.backupId\),/,
      "the backup is reported as a fact rather than an identifier");
  });

  it("drops the archive name and digest from the backup summary", () => {
    assert.match(backupRepoSource, /archiveFilename: string, archiveSha256: string/,
      "the backup record carries an archive name and digest");
    const built = literalMembers(shaper.slice(shaper.indexOf("backup: {"), shaper.indexOf("lifecycle:")), 6);
    for (const member of WITHHELD) {
      assert.ok(!built.includes(member), `the backup summary must never emit ${member}`);
      assert.ok(!declaredMembers("BrowserWorkspaceDeletionBackup").includes(member),
        `and the contract must never name ${member}`);
    }
    assert.deepEqual(built.slice().sort(), ["createdAt", "createdByName", "current", "requirement", "windowHours"],
      "the summary answers five members");
    assert.match(declarationDoc("BrowserWorkspaceDeletionBackup"), /never reach the browser/,
      "and the declaration records the reduction");
  });
});

describe("the vocabularies", () => {
  it("closes the status because the column does", () => {
    assert.match(statusMigration, /CHECK \(status IN \('pending_deletion', 'purging'\)\)/,
      "migration 077 constrains the column to two words");
    assert.deepEqual(unionLiterals("BrowserWorkspaceDeletionStatus"), ["pending_deletion", "purging"]);
    assert.deepEqual(plain(parser.DELETION_STATUSES).slice().sort(), checkWords(),
      "and the runtime table is pinned to the column rather than to itself");
    assert.match(lifecycleShaper, /status: lifecycle\.status \|\| "pending_deletion",/,
      "the fallback is one of the column's own words");
    assert.equal(parser.isDeletionLifecycle({ ...lifecycle(), status: "purged" }), false,
      "a word the column cannot hold is not a status");
  });

  it("closes the requirement because one test decides it", () => {
    assert.match(shaper, /requirement: recentBackup \? "recent_backup" : "typed_acknowledgement_required",/,
      "the producer chooses between two literals");
    assert.deepEqual(unionLiterals("BrowserWorkspaceDeletionRequirement"),
      ["recent_backup", "typed_acknowledgement_required"]);
    assert.deepEqual(plain(parser.DELETION_REQUIREMENTS).slice().sort(),
      unionLiterals("BrowserWorkspaceDeletionRequirement"));
    assert.equal(parser.isDeletionBackup({ ...backup(), requirement: "backup_optional" }), false);
  });
});

describe("the acknowledgement phrase", () => {
  it("is required and nullable, because the null means something", () => {
    assert.match(shaper, /acknowledgementPhrase: recentBackup \? null : NO_CURRENT_BACKUP_ACKNOWLEDGEMENT,/,
      "the producer answers null when a current backup satisfies the prerequisite");
    assert.match(serviceSource, /const NO_CURRENT_BACKUP_ACKNOWLEDGEMENT = "DELETE WITHOUT CURRENT BACKUP";/);
    assert.match(declarationBlock("BrowserWorkspaceDeletionState"), /\n  acknowledgementPhrase: string \| null;/,
      "so the member is required and nullable");
    assert.doesNotMatch(declarationBlock("BrowserWorkspaceDeletionState"), /acknowledgementPhrase\?:/,
      "and never optional");
    assert.equal(parser.readWorkspaceDeletionState(envelope({ acknowledgementPhrase: 7 })), null,
      "a number is neither the phrase nor its absence");
  });
});

describe("the producer's own coherence", () => {
  it("derives three members from one recency test, so they cannot disagree", () => {
    assert.match(shaper, /const recentBackup = isRecentBackup\(latestBackup, new Date\(\)\);/,
      "one test decides all three");
    assert.match(shaper, /current: Boolean\(recentBackup\),/);
    assert.equal(parser.readWorkspaceDeletionState(envelope()) !== null, true, "a coherent body reads");
    assert.equal(parser.readWorkspaceDeletionState(envelope({
      acknowledgementPhrase: "DELETE WITHOUT CURRENT BACKUP",
    })), null, "a phrase beside a current backup is a contradiction this producer cannot make");
    assert.equal(parser.readWorkspaceDeletionState(envelope({
      backup: { ...backup(), requirement: "typed_acknowledgement_required" },
    })), null, "and so is a requirement that disagrees with the backup flag");
  });

  it("derives pending from the same value as the lifecycle member", () => {
    assert.match(shaper, /lifecycle: lifecycle \? toLifecycleSummary\(lifecycle\) : null,/);
    assert.match(shaper, /pending: Boolean\(lifecycle\),/,
      "pending comes from the same value the lifecycle member is built from");
    assert.equal(parser.readWorkspaceDeletionState(envelope({ pending: true })), null,
      "pending without a lifecycle is a state the producer never sends");
    assert.equal(parser.readWorkspaceDeletionState(pendingEnvelope({ pending: false })), null,
      "and neither is a lifecycle without pending");
    assert.ok(parser.readWorkspaceDeletionState(pendingEnvelope()), "the pending state itself reads");
  });
});

describe("the members", () => {
  it("checks every member each contract declares", () => {
    assert.deepEqual([...plain(parser.DELETION_BACKUP_NULLABLE_TEXT), "current", "requirement", "windowHours"].sort(),
      declaredMembers("BrowserWorkspaceDeletionBackup").sort(),
      "the browser checks every member the backup contract declares");
    assert.deepEqual([...plain(parser.DELETION_LIFECYCLE_TEXT), ...plain(parser.DELETION_LIFECYCLE_BOOLEANS),
      "status"].sort(), declaredMembers("BrowserWorkspaceDeletionLifecycle").sort(),
      "and every member the lifecycle contract declares");
  });

  it("refuses what the backup shaper could not send", () => {
    assert.equal(parser.isDeletionBackup(backup()), true);
    for (const member of plain(parser.DELETION_BACKUP_NULLABLE_TEXT)) {
      assert.equal(parser.isDeletionBackup({ ...backup(), [member]: null }), true, `${member} is null with no backup`);
      assert.equal(parser.isDeletionBackup({ ...backup(), [member]: 0 }), false, `${member} is text or null`);
      assert.match(shaper, new RegExp(`${member}: latestBackup\\?\\.${member} \\|\\| null,`),
        `which is what the shaper writes for ${member}`);
    }
    assert.equal(parser.isDeletionBackup({ ...backup(), current: "yes" }), false, "the flag is a boolean");
    assert.equal(parser.isDeletionBackup({ ...backup(), windowHours: "24" }), false, "the window is a number");
    assert.equal(parser.isDeletionBackup(omit(backup(), "windowHours")), false, "and always sent");
  });

  it("refuses what the lifecycle shaper could not send", () => {
    assert.equal(parser.isDeletionLifecycle(lifecycle()), true);
    for (const member of plain(parser.DELETION_LIFECYCLE_TEXT)) {
      assert.equal(parser.isDeletionLifecycle({ ...lifecycle(), [member]: null }), false, `${member} is text`);
      assert.equal(parser.isDeletionLifecycle(omit(lifecycle(), member)), false, `${member} is always built`);
    }
    for (const member of plain(parser.DELETION_LIFECYCLE_BOOLEANS)) {
      assert.equal(parser.isDeletionLifecycle({ ...lifecycle(), [member]: "true" }), false, `${member} is a boolean`);
    }
  });

  it("keeps the workspace name a server value", () => {
    assert.match(shaper, /workspaceName: workspace\.workspace_name,/, "it comes from the workspace record");
    assert.match(declarationBlock("BrowserWorkspaceDeletionState"), /\n  workspaceName: string;/);
    assert.equal(parser.readWorkspaceDeletionState(envelope({ workspaceName: null })), null, "and is always text");
    assert.match(page, /workspaceDeletionState\.workspaceName/, "the dialog reads the server's value");
    assert.match(serviceSource, /String\(payload\?\.workspaceName \|\| ""\)\.trim\(\) !== workspace\.workspace_name/,
      "and the server compares the typed name against its own record");
  });
});

describe("the authorization and lifecycle gates", () => {
  it("are asserted before any state is shaped", () => {
    for (const name of ["read", "request", "cancel"]) {
      const block = extractFunctionBlock(serviceSource, name);
      assert.match(block, /assertPublicDemoCapabilityAllowed\("administration\.workspace_lifecycle"\)/,
        `${name} checks the public-demo capability`);
      assert.match(block, /await assertCanManageWorkspaceDeletion\(session\)/, `${name} checks the administrator gate`);
    }
    assert.match(extractFunctionBlock(serviceSource, "assertCanManageWorkspaceDeletion"),
      /permissionsService\.isWorkspaceAdministrator\(session\)/,
      "which requires a Workspace Administrator or Super Admin");
  });

  it("keeps every destructive prerequisite on the server", () => {
    const request = extractFunctionBlock(serviceSource, "request");
    assert.match(request, /throw new AppError\("Workspace deletion is already pending\.", 409\)/);
    assert.match(request, /Type the workspace name exactly to schedule deletion\./);
    assert.match(request, /if \(!recentBackup && String\(payload\?\.acknowledgement \|\| ""\)\.trim\(\) !== NO_CURRENT_BACKUP_ACKNOWLEDGEMENT\)/,
      "the acknowledgement is required by the server, not by the browser");
    const cancel = extractFunctionBlock(serviceSource, "cancel");
    assert.match(cancel, /throw new AppError\("Workspace deletion is not pending\.", 409\)/);
    assert.match(cancel, /Workspace purge has begun and can no longer be canceled\./);
    assert.match(cancel, /The 30-day cancellation period has ended\./);
    assert.match(extractFunctionBlock(serviceSource, "isRecentBackup"), /RECENT_BACKUP_WINDOW_HOURS \* 60 \* 60 \* 1000/,
      "and the recency window is computed on the server");
  });
});

describe("the reader", () => {
  it("accepts the producer's envelope whole, in both states", () => {
    assert.deepEqual(plain(parser.readWorkspaceDeletionState(envelope())), envelope().deletion);
    assert.deepEqual(plain(parser.readWorkspaceDeletionState(pendingEnvelope())), pendingEnvelope().deletion);
  });

  it("refuses an unvouchable body rather than calling it not pending", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { deletion: null }, { deletion: "x" }]) {
      assert.equal(parser.readWorkspaceDeletionState(empty), null,
        "an unreadable body must not become the safe-looking not-pending state");
    }
    // Coherent on every cross-member rule, so only the backup guard itself can refuse it.
    assert.equal(parser.readWorkspaceDeletionState(envelope({
      backup: { current: true, requirement: "recent_backup" },
    })), null, "a nested object is not a backup summary merely because it is an object");
    assert.equal(parser.readWorkspaceDeletionState(pendingEnvelope({ lifecycle: { status: "purging" } })), null,
      "nor is a non-null value a lifecycle summary");
    // Scoped to the load path: the mutation carries the same guard, and an unscoped match was
    // satisfied by it.
    assert.match(extractFunctionBlock(page, "loadWorkspaceDeletion"),
      /if \(!deletion\) \{\s+throw new Error\("Workspace deletion state could not be read\."\);/,
      "so the page throws into the path that hides both destructive controls");
    assert.doesNotMatch(page, /result\.deletion \|\| null/,
      "and the read that rendered an unreadable body as not pending is gone");
  });
});

describe("the consumers", () => {
  it("narrow both owned reads through the reader", () => {
    const consumers = ["isDeletionBackup", "isDeletionLifecycle", "readWorkspaceDeletionState"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["result.deletion"]) {
      assert.ok(!consumers.includes(raw), `workspace-settings.js must no longer read ${raw} off an unknown body`);
    }
    assert.equal(page.split("readWorkspaceDeletionState(").length, 4,
      "the load and the mutation both narrow, beside the reader's own declaration");
    assert.match(page, /if \(!deletion\) \{\s+throw new Error\("Workspace deletion state could not be read\."\);\s+\}\s+workspaceDeletionDialog\.close\(\);/,
      "the mutation reads before it closes the dialog, so a bad body cannot close it on a fabricated state");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/);
  });

  it("preserves the lifecycle rendering exactly", () => {
    assert.match(page, /This workspace is not pending deletion\./, "the not-pending placeholder is unchanged");
    assert.match(page, /A workspace backup from the last \$\{deletion\.backup\.windowHours\} hours is available\./);
    assert.match(page, /No current workspace backup is available\. Scheduling deletion requires the displayed typed acknowledgement\./);
    assert.match(page, /createRuntimeDiagnosticItem\("Grace Period Ends", formatRuntimeDate\(lifecycle\.purgeAfter\)\)/);
    assert.match(page, /The workspace remains fully operational during the grace period\./);
    assert.match(page, /window\.LongtailForge\.refreshAppShell\?\.\(\)/, "and the app shell still refreshes after a mutation");
  });

  it("leaves the page's other producers to their own children", () => {
    for (const other of ["result.diagnostics", "result.backup", "result.jobs", "result.users", "result.data"]) {
      assert.ok(page.includes(other), `${other} is another child's read and is untouched`);
    }
    assert.doesNotMatch(declarationSource, /BrowserWorkspaceRuntimeDiagnostics|BrowserWorkspaceJobObservability/,
      "and this child declares nothing for them");
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

/**
 * The members an object literal names at one indent, written `name: value` or as shorthand.
 * @param {string} literal @param {number} indent @returns {string[]}
 */
function literalMembers(literal, indent) {
  return [...new Set([...literal.replaceAll("\r\n", "\n").matchAll(new RegExp(`^ {${indent}}([a-zA-Z_]\\w*)(?::|,$)`, "gm"))]
    .map((entry) => entry[1]))];
}

/** The words the status column's own CHECK admits, read from the migration. */
function checkWords() {
  const match = statusMigration.match(/CHECK \(status IN \(([^)]+)\)\)/);
  assert.ok(match, "the column must carry a CHECK");
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
}

/** @param {string} name @returns {string} */
function declarationDoc(name) {
  const index = declarationSource.indexOf(`export interface ${name} {`);
  assert.ok(index > 0, `${name} must be declared`);
  const opened = declarationSource.lastIndexOf("/**", index);
  assert.ok(opened > 0, `${name} must be documented`);
  return declarationSource.slice(opened, index);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @param {string} name @returns {string[]} */
function unionLiterals(name) {
  const match = declarationSource.match(new RegExp(`export type ${name} =([^;]+);`));
  assert.ok(match, `${name} must be declared`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/** @returns {Record<string, unknown>} A backup summary for a workspace whose backup is current. */
function backup() {
  return {
    createdAt: "2026-09-02T12:00:00.000Z",
    createdByName: "Current Administrator",
    current: true,
    requirement: "recent_backup",
    windowHours: 24,
  };
}

/** @returns {Record<string, unknown>} */
function lifecycle() {
  return {
    backupProtected: true,
    noCurrentBackupAcknowledged: false,
    purgeAfter: "2026-10-02T12:00:00.000Z",
    requestedAt: "2026-09-02T12:00:00.000Z",
    requestedByName: "Current Administrator",
    status: "pending_deletion",
  };
}

/** @param {Record<string, unknown>} [overrides] A coherent not-pending envelope. */
function envelope(overrides = {}) {
  return {
    deletion: {
      acknowledgementPhrase: null,
      backup: backup(),
      lifecycle: null,
      pending: false,
      workspaceName: "Acme",
      ...overrides,
    },
  };
}

/** @param {Record<string, unknown>} [overrides] A coherent pending envelope. */
function pendingEnvelope(overrides = {}) {
  return { deletion: { ...envelope().deletion, lifecycle: lifecycle(), pending: true, ...overrides } };
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
