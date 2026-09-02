// Runtime proof for the Support View target response.
//
// One producer, `listTargets`, answers three members: the viewing administrator, the
// deployment's session lifetime, and the eligible targets. Each record is built by hand from
// selected columns, so each contract here is exact and pinned to the literal that builds it.
//
// **The authorization is the invariant, and it is proven from the query and both gates.**
// Discovery admits only active users holding an active membership of an active workspace, and
// never the actor; `assertOperator` gates the read; `start` independently re-checks everything
// before anything is viewed. The browser contract is what leaves those decisions - it cannot
// widen them, and the proofs require each one to still be there.
//
// The target is **not** a user record. It is a security-filtered summary of five columns, and a
// proof keeps it apart from `BrowserUserRecord`, which a different producer builds.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/support-view.service.js");
const routesSource = readText("src/routes/support-view.routes.js");
const repositorySource = readText("src/repositories/support-sessions.repo.js");
const configSource = readText("src/config.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/support-view.js");

const parser = sandbox(page,
  ["isResponseRecord", "isTargetWorkspace", "isSupportViewTarget", "isSupportViewActor", "readSupportViewTargets"],
  ["TARGET_WORKSPACE_TEXT", "TARGET_TEXT", "ACTOR_TEXT"]);

const listTargets = extractFunctionBlock(serviceSource, "listTargets");
const discovery = extractFunctionBlock(repositorySource, "listEligibleTargets");
const start = extractFunctionBlock(serviceSource, "start");

/** Material a target picker must never promise the browser. */
const UNDISCLOSED = ["password", "passwordHash", "password_hash", "token", "sessionId", "session_id",
  "protected_user", "protectedUser", "user_status", "userStatus", "permissions", "capabilities",
  "roleId", "role_id", "timezone", "email", "ipAddress", "ip_address"];

describe("the envelope against its producer", () => {
  it("is exactly the three members listTargets returns", () => {
    const returned = literalMembers(listTargets.slice(listTargets.lastIndexOf("return {")), 4);
    assert.deepEqual(returned.slice().sort(), ["actor", "expiresInSeconds", "targets"],
      "listTargets returns exactly three members");
    assert.deepEqual(declaredMembers("BrowserSupportViewTargetEnvelope").sort(), returned.slice().sort(),
      "and the contract is exactly those three");
  });

  it("is reached only through the operator gate", () => {
    assert.match(listTargets, /const operator = await assertOperator\(session\);/, "listTargets asserts the operator first");
    const gate = extractFunctionBlock(serviceSource, "assertOperator");
    assert.match(gate, /config\.supportView\.enabled/, "Support View must be enabled");
    assert.match(gate, /isSupportViewOperatorSession\(session\)/, "the session must be a normal, non-support-view one");
    assert.match(gate, /permissionsService\.isSuperAdmin\(session\)/, "the caller must be a super administrator");
    assert.match(gate, /assertCan\(session, "support_view\.enter"/, "and must hold the enter permission");
    // Sliced to this one route: the file registers four, and a lazy match across them would
    // have been satisfied by a sibling's header.
    const targetRoute = routesSource.slice(
      routesSource.indexOf('supportViewRoutes.get("/support-view/targets"'),
      routesSource.indexOf('supportViewRoutes.post("/support-view/start"'),
    );
    assert.ok(targetRoute.includes("listTargets"), "the slice is the target route");
    assert.match(targetRoute, /response\.setHeader\("Cache-Control", "no-store"\);/,
      "the route forbids caching the target list");
  });

  it("lists only accounts the query already made eligible", () => {
    assert.match(discovery, /LOWER\(user_workspaces\.status\) = 'active'/, "only active memberships");
    assert.match(discovery, /LOWER\(workspaces\.status\) = 'active'/, "of active workspaces");
    assert.match(discovery, /WHERE LOWER\(users\.user_status\) = 'active'/, "for active users");
    assert.match(discovery, /AND users\.user_id != :actorUserId;/, "and never the administrator themselves");
    assert.match(listTargets, /supportSessionsRepository\.listEligibleTargets\(operator\.user_id\)/,
      "which is the one query the service builds this list from");
  });

  it("is a picker, and start re-checks every decision independently", () => {
    assert.match(start, /if \(!config\.supportView\.enabled\)/, "start re-checks enablement");
    assert.match(start, /session\.session_mode !== "normal" \|\| session\.support_view/, "and refuses a nested start");
    assert.match(start, /if \(effectiveUserId === session\.user_id\)/, "and refuses the administrator as their own target");
    assert.match(start, /assertCan\(session, "support_view\.enter", \{\s+operation: "create",\s+workspace_id: workspaceId,/,
      "and re-checks the permission for the chosen workspace");
    assert.match(start, /verifyCurrentPasswordForSensitiveAction\(session, payload\.currentPassword/,
      "and re-verifies the administrator's password");
    assert.match(start, /assertEligible\(/, "and re-reads eligibility before anything is viewed");
    const eligible = extractFunctionBlock(serviceSource, "assertEligible");
    assert.match(eligible, /row\.effective_status !== "active"/, "which requires an active target");
    assert.match(eligible, /row\.effective_membership_status !== "active"/, "with an active membership");
    assert.match(eligible, /Number\(row\.actor_has_support_permission\) !== 1/, "and an administrator who still holds the permission");
  });
});

describe("the target record", () => {
  it("is the exact five members the producer builds", () => {
    const built = literalMembers(listTargets.slice(listTargets.indexOf("target = {"), listTargets.indexOf("byUserId.set")), 8);
    assert.deepEqual(built.slice().sort(), ["displayName", "label", "userId", "username", "workspaces"],
      "the shaper names five members");
    assert.deepEqual(declaredMembers("BrowserSupportViewTarget").sort(), built.slice().sort(),
      "and the contract is exactly those five");
    assert.match(serviceSource,
      /@typedef \{\{ userId: string, username: string, displayName: string, label: string, workspaces: SupportViewTargetWorkspace\[\] \}\} SupportViewTarget/,
      "which is the record the service already declares");
  });

  it("is a security-filtered summary and not a user record", () => {
    const named = declaredMembers("BrowserSupportViewTarget");
    for (const member of UNDISCLOSED) {
      assert.ok(!named.includes(member), `a target must never promise ${member}`);
    }
    assert.match(discovery, /SELECT\s+users\.user_id,\s+users\.username,\s+users\.display_name,/,
      "the query selects three user columns and no more");
    assert.doesNotMatch(discovery, /password|user_status AS|protected_user|timezone/,
      "and no credential, protection or preference column");
    for (const userOnly of ["status", "role", "created_at", "updated_at"]) {
      assert.ok(!named.includes(userOnly), `${userOnly} belongs to the user record, which a different producer builds`);
    }
    assert.match(declarationSource, /export interface BrowserUserRecord\b/, "that record still exists");
    assert.notDeepEqual(declaredMembers("BrowserUserRecord").sort(), named.slice().sort(),
      "and it is a different shape, which is why it was not reused");
  });

  it("carries a label the shaper always fills", () => {
    assert.match(listTargets, /const displayName = displayLabel\(row\.display_name, row\.username\);/,
      "the display name falls through the username");
    assert.match(extractFunctionBlock(serviceSource, "displayLabel"), /String\(displayName \|\| username \|\| "User unavailable"\)/,
      "to a fixed phrase, so it is never empty");
    assert.match(listTargets, /label: displayName === row\.username \? row\.username : `\$\{displayName\} \(\$\{row\.username\}\)`,/,
      "and the label is the username alone or the display name beside it");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual([...plain(parser.TARGET_TEXT), "workspaces"].sort(),
      declaredMembers("BrowserSupportViewTarget").sort(), "the browser checks every member a target declares");
    assert.deepEqual(plain(parser.TARGET_WORKSPACE_TEXT).slice().sort(),
      declaredMembers("BrowserSupportViewTargetWorkspace").sort(), "and every member a workspace declares");
    assert.deepEqual(plain(parser.ACTOR_TEXT).slice().sort(),
      declaredMembers("BrowserSupportViewActor").sort(), "and every member the actor declares");
  });

  it("refuses what the producer could not send", () => {
    assert.equal(parser.isSupportViewTarget(target()), true);
    for (const member of declaredMembers("BrowserSupportViewTarget")) {
      assert.equal(parser.isSupportViewTarget(omit(target(), member)), false, `${member} is always built`);
    }
    for (const member of plain(parser.TARGET_TEXT)) {
      assert.equal(parser.isSupportViewTarget({ ...target(), [member]: null }), false, `${member} is text`);
      assert.equal(parser.isSupportViewTarget({ ...target(), [member]: 7 }), false, `${member} is not a number`);
    }
    assert.equal(parser.isSupportViewTarget({ ...target(), workspaces: {} }), false, "the workspaces are a list");
  });

  it("never offers an account it cannot name", () => {
    assert.equal(parser.isSupportViewTarget({ ...target(), userId: "" }), false,
      "an empty identifier could never name the account start would act on");
    assert.equal(parser.isSupportViewTarget({ ...target(), label: "" }), false,
      "and an empty label is all the administrator would have seen before choosing it");
  });

  it("never offers a workspace it cannot name", () => {
    // The partial case is asserted first so that trusting the container fails here, and losing
    // only the identifier guard fails on the assertion below it.
    assert.equal(parser.isSupportViewTarget({ ...target(), workspaces: [{ label: "Workspace" }] }), false,
      "a partial workspace is not a workspace");
    assert.equal(parser.isSupportViewTarget({ ...target(), workspaces: [{ ...workspace(), workspaceId: "" }] }), false,
      "nor may a workspace choice lack the identifier the start request sends");
  });
});

describe("the expiry", () => {
  it("is one configured number, not a catalogue and not a member of any target", () => {
    assert.match(listTargets, /expiresInSeconds: config\.supportView\.ttlSeconds,/,
      "the producer sends the deployment's configured lifetime");
    assert.match(configSource, /readInteger\(\s*env,\s*"LONGTAIL_SUPPORT_VIEW_TTL_SECONDS",/, "which is an integer setting");
    assert.match(configSource, /\{ min: 60, max: 60 \* 60 \}/, "bounded to a minute and an hour");
    assert.match(declarationBlock("BrowserSupportViewTargetEnvelope"), /\n  expiresInSeconds: number;/);
    assert.ok(!declaredMembers("BrowserSupportViewTarget").includes("expiresInSeconds"),
      "no target carries its own expiry, because the producer does not build one");
    assert.doesNotMatch(declarationSource, /BrowserSupportViewExpiryOption|expiryChoices/,
      "and there is no catalogue of durations, because the operator chooses none");
  });

  it("falls back to zero exactly where the parse did", () => {
    assert.equal(parser.readSupportViewTargets({ ...envelope(), expiresInSeconds: 900 }).expiresInSeconds, 900);
    for (const bad of ["900", null, undefined, Number.NaN, -1, 0, {}]) {
      assert.equal(parser.readSupportViewTargets({ ...envelope(), expiresInSeconds: bad }).expiresInSeconds, 0,
        `${String(bad)} is not a lifetime, and zero is what the page already showed`);
    }
  });
});

describe("the actor", () => {
  it("is the three members the producer names", () => {
    const built = literalMembers(listTargets.slice(listTargets.indexOf("actor: {"), listTargets.indexOf("expiresInSeconds:")), 6);
    assert.deepEqual(built.slice().sort(), ["label", "userId", "username"], "the producer names three");
    assert.equal(parser.isSupportViewActor(actor()), true);
    for (const member of plain(parser.ACTOR_TEXT)) {
      assert.equal(parser.isSupportViewActor(omit(actor(), member)), false, `${member} is always named`);
    }
  });

  it("promises no capability, permission or session material", () => {
    // Split from the exactness check above so a contract that grows one of these fails here
    // rather than being masked by the member-for-member comparison.
    const named = declaredMembers("BrowserSupportViewActor");
    for (const member of UNDISCLOSED) {
      assert.ok(!named.includes(member), `the actor must never promise ${member}`);
    }
    assert.deepEqual(named.sort(), ["label", "userId", "username"],
      "and the actor contract is exactly the three the producer names");
  });

  it("is not a target, and a target is not the actor", () => {
    assert.equal(parser.isSupportViewTarget(actor()), false, "an actor has no workspaces");
    assert.equal(parser.readSupportViewTargets({ ...envelope(), actor: target() }).actor?.userId, target().userId,
      "the actor record is a subset, so a target satisfies it - which is why they are read from their own members");
    assert.ok(!declaredMembers("BrowserSupportViewTarget").includes("expiresInSeconds"));
    assert.match(declarationBlock("BrowserSupportViewTargetEnvelope"), /\n  actor: BrowserSupportViewActor \| null;/,
      "and the envelope keeps them as separate members");
  });
});

describe("the reader", () => {
  it("accepts the producer's envelope whole", () => {
    assert.deepEqual(plain(parser.readSupportViewTargets(envelope())), envelope());
  });

  it("drops an entry it cannot vouch for rather than offering it", () => {
    const mixed = { ...envelope(), targets: [target(), { userId: "u-2", label: "Ghost" }, null] };
    assert.deepEqual(plain(parser.readSupportViewTargets(mixed)).targets, [target()],
      "a record the browser cannot vouch for is never a selectable target");
    assert.deepEqual(parser.readSupportViewTargets({ ...envelope(), targets: [{}] }).targets, [],
      "an array container alone confers no trust");
  });

  it("degrades exactly as the raw reads did for an unusable body", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { targets: {} }]) {
      const read = plain(parser.readSupportViewTargets(empty));
      assert.deepEqual(read, { actor: null, expiresInSeconds: 0, targets: [] },
        "no targets, no actor and no lifetime, which is the no-active-users state the page already showed");
    }
    assert.equal(parser.readSupportViewTargets({ ...envelope(), actor: { label: "x" } }).actor, null,
      "a partial actor is not an actor");
  });
});

describe("the consumer", () => {
  it("narrows the one read through the reader", () => {
    const consumers = ["readSupportViewTargets", "isSupportViewTarget", "isSupportViewActor", "isTargetWorkspace"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["result.targets", "result.expiresInSeconds", "Number.parseInt(result"]) {
      assert.ok(!consumers.includes(raw), `support-view.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const available = readSupportViewTargets\(\s*await requireApi\(\)\.getJson\("\/api\/support-view\/targets", \{ cache: "no-store" \}\),\s*\);/);
    assert.match(page, /actorText\.textContent = `Administrator: \$\{available\.actor\?\.label \|\| available\.actor\?\.username \|\| "Current administrator"\}`;/,
      "and the administrator line keeps both fallbacks it already had");
    assert.match(page, /@type \{BrowserSupportViewTarget\[\]\}/, "the one direct handoff is annotated");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
  });

  it("keeps the start request reading the narrowed choices", () => {
    assert.match(page, /effectiveUserId: targetSelect\.value,/, "the chosen target is still sent by identifier");
    assert.match(page, /workspaceId: workspaceSelect\.value,/, "with the chosen workspace");
    assert.match(page, /confirmedReadOnly: confirmationInput\.checked,/, "and the read-only confirmation is unchanged");
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

/** @returns {Record<string, unknown>} */
function workspace() {
  return { label: "Acme Workspace", workspaceId: "w-1", workspaceName: "Acme Workspace" };
}

/** @returns {Record<string, unknown>} */
function target() {
  return {
    displayName: "Viewed User",
    label: "Viewed User (viewed.user)",
    userId: "u-1",
    username: "viewed.user",
    workspaces: [workspace()],
  };
}

/** @returns {Record<string, unknown>} */
function actor() {
  return { label: "admin", userId: "u-0", username: "admin" };
}

/** @returns {Record<string, unknown>} */
function envelope() {
  return { actor: actor(), expiresInSeconds: 900, targets: [target()] };
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
