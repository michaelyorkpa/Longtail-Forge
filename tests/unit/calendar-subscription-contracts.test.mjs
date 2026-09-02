// Runtime proof for the calendar subscription response boundaries.
//
// One producer, `toPublicSubscription`, answers every private-feeds route, and it reconstructs
// the descriptor **exactly** - eleven members, all by name - so the browser contract is exact
// too, and it is pinned to the server's own `PrivateFeedPublicSubscription` as well as to the
// shaper's literal.
//
// **The feed URL is never on that descriptor.** Create and rotate answer it beside a descriptor
// on a second contract; the list and the revoke never send it, and the server could not: it
// stores only the hash of the token's secret. The proofs here guard that distinction from both
// sides - the secret must be its own contract, and the descriptor must not grow an optional one.
//
// The options body from `/api/client-projects?view=options` is narrowed to its envelope only.
// Its elements are a cross-page vocabulary this page's own normalisers are total over, and that
// is recorded as later-owner debt rather than settled by a container check.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/private-feeds.service.js");
const routesSource = readText("src/routes/private-feeds.routes.js");
const serverDeclarationSource = readText("src/types/private-feed-contracts.d.ts");
const clientsServiceSource = readText("src/modules/client-projects/clients.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/calendar-settings.js");

const parser = sandbox(page,
  ["isResponseRecord", "isNullableText", "isCalendarSubscription", "readCalendarSubscriptions",
    "readCalendarSubscriptionSecret", "readClientProjectOptions"],
  ["CALENDAR_SCOPE_TYPES", "SUBSCRIPTION_TEXT", "SUBSCRIPTION_NULLABLE_TEXT"]);

const shaper = extractFunctionBlock(serviceSource, "toPublicSubscription");
const shaperMembers = literalMembers(shaper, 4);
const ownerMembers = literalMembers(shaper.slice(shaper.indexOf("owner: {"), shaper.indexOf("revocationReason:")), 6);
const scopeMembers = literalMembers(shaper.slice(shaper.indexOf("scope: {"), shaper.indexOf("status:")), 6);

describe("the descriptor against its producer", () => {
  it("is the exact reconstruction the shaper writes", () => {
    assert.deepEqual(shaperMembers.slice().sort(),
      ["createdAt", "name", "ownedByCurrentUser", "owner", "revocationReason", "revokedAt", "rotatedAt",
        "scope", "status", "subscriptionId", "timezone"],
      "toPublicSubscription names eleven members");
    assert.deepEqual(declaredMembers(declarationSource, "BrowserCalendarSubscription").slice().sort(),
      shaperMembers.slice().sort(),
      "and the browser contract is exactly those eleven");
    assert.deepEqual(declaredMembers(serverDeclarationSource, "PrivateFeedPublicSubscription").slice().sort(),
      shaperMembers.slice().sort(),
      "which is the record the server already declares for the same shaper");
  });

  it("builds the owner and scope records by hand, so those are exact too", () => {
    assert.deepEqual(ownerMembers.slice().sort(),
      declaredMembers(declarationSource, "BrowserCalendarSubscriptionOwner").slice().sort(),
      "the owner record is the two members the shaper writes");
    assert.deepEqual(scopeMembers.slice().sort(),
      declaredMembers(declarationSource, "BrowserCalendarSubscriptionScope").slice().sort(),
      "and the scope record is the two members the shaper writes");
  });

  it("answers every route with this one shaper", () => {
    assert.match(extractFunctionBlock(serviceSource, "listCalendarSubscriptions"),
      /subscriptions: rows\.map\(\(row\) => toPublicSubscription\(row, session\)\),/,
      "listCalendarSubscriptions shapes through toPublicSubscription and nothing else");
    for (const route of ["createCalendarSubscription", "rotateCalendarSubscription"]) {
      assert.match(extractFunctionBlock(serviceSource, route), /\n\s+subscription: toPublicSubscription\([\w.]+, session\),\r?\n/,
        `${route} shapes through toPublicSubscription and does not reshape on the way out`);
    }
    assert.equal(serviceSource.split("function toPublicSubscription(").length, 2,
      "there is one shaper, not one per route");
  });

  it("keeps the status as text because the producer does", () => {
    assert.match(shaper, /status: token\?\.status \|\| "revoked",/,
      "the shaper answers the row column with a fallback rather than a closed vocabulary");
    assert.match(declarationBlock(serverDeclarationSource, "PrivateFeedPublicSubscription"), /\n  status: string;/,
      "and the server contract keeps that column as text");
    assert.match(declarationBlock(declarationSource, "BrowserCalendarSubscription"), /\n  status: string;/,
      "so the browser does not close it either");
    for (const status of ["active", "revoked", "something-else"]) {
      assert.equal(parser.isCalendarSubscription({ ...subscription(), status }), true, `${status} is text`);
    }
    assert.equal(parser.isCalendarSubscription({ ...subscription(), status: 1 }), false);
  });

  it("closes the scope type because the row column and the fallback do", () => {
    assert.match(serverDeclarationSource, /export type PrivateFeedScopeType = "workspace" \| "client" \| "project";/,
      "the token row is typed to three words");
    assert.match(shaper, /type: token\?\.scope_type \|\| "workspace",/, "and the fallback is one of them");
    assert.deepEqual(unionLiterals(declarationSource, "BrowserCalendarScopeType"), ["client", "project", "workspace"],
      "so the browser union is the same three");
    assert.deepEqual(plain(parser.CALENDAR_SCOPE_TYPES).slice().sort(), unionLiterals(declarationSource, "BrowserCalendarScopeType"),
      "and the runtime table is pinned to the union rather than to itself");
    assert.equal(parser.isCalendarSubscription(withScope(subscription(), "team")), false,
      "a word the row cannot hold is not a scope");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual(
      [...plain(parser.SUBSCRIPTION_TEXT), ...plain(parser.SUBSCRIPTION_NULLABLE_TEXT),
        "ownedByCurrentUser", "owner", "scope"].sort(),
      declaredMembers(declarationSource, "BrowserCalendarSubscription").slice().sort(),
      "the browser checks every member the descriptor declares");
    for (const member of plain(parser.SUBSCRIPTION_NULLABLE_TEXT)) {
      assert.match(declarationBlock(declarationSource, "BrowserCalendarSubscription"),
        new RegExp(`\\n  ${member}: string \\| null;`), `${member} is text or null`);
      assert.match(shaper, new RegExp(`${String(member).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)} \\|\\| null,`),
        `because the shaper answers ${member} with a null fallback`);
    }
  });
});

describe("the feed URL", () => {
  it("is answered only by create and rotate", () => {
    for (const route of ["createCalendarSubscription", "rotateCalendarSubscription"]) {
      assert.match(extractFunctionBlock(serviceSource, route), /return \{\s+feedUrl: buildFeedUrl\(rawToken,/,
        `${route} answers the URL built from the raw token it just minted`);
    }
    assert.doesNotMatch(extractFunctionBlock(serviceSource, "listCalendarSubscriptions"), /feedUrl/,
      "the list never sends a URL");
    assert.doesNotMatch(extractFunctionBlock(serviceSource, "removeCalendarSubscription"), /feedUrl/,
      "nor does the revoke");
    assert.doesNotMatch(shaper, /feedUrl|token_hash|rawToken/,
      "and the descriptor shaper never sees the token at all");
  });

  it("is a one-time secret by construction, which is why naming it is a handoff and not a leak", () => {
    for (const route of ["createCalendarSubscription", "rotateCalendarSubscription"]) {
      const block = extractFunctionBlock(serviceSource, route);
      assert.match(block, /const rawToken = createRawToken\(\);/, `${route} mints the token itself`);
      assert.match(block, /hashTokenSecret\(parsedToken\.secret\)\.toString\("hex"\)/,
        "and stores only the hash of its secret, so no later route can rebuild the URL");
    }
    assert.match(extractFunctionBlock(routesSource, "createCalendarSubscription"), /response\.set\("Cache-Control", "no-store"\);/,
      "the create route forbids caching the response");
    assert.match(extractFunctionBlock(routesSource, "rotateCalendarSubscription"), /response\.set\("Cache-Control", "no-store"\);/,
      "and so does the rotate route");
    assert.match(page, /window\.addEventListener\("pagehide", clearSecret\);/,
      "the page clears the URL from memory on navigation");
    assert.match(page, /secretInput\.type = "password";/, "and shows it only behind a reveal");
  });

  it("lives on its own contract and never on the descriptor", () => {
    assert.deepEqual(declaredMembers(declarationSource, "BrowserCalendarSubscriptionSecret"), ["feedUrl", "subscription"],
      "the secret contract is the URL beside one descriptor");
    assert.match(declarationBlock(declarationSource, "BrowserCalendarSubscriptionSecret"), /\n  feedUrl: string;/,
      "and the URL is required there, not optional");
    assert.doesNotMatch(declarationBlock(declarationSource, "BrowserCalendarSubscription"), /feedUrl/,
      "the descriptor must not carry the URL, optionally or otherwise");
    assert.doesNotMatch(declarationBlock(declarationSource, "BrowserCalendarSubscriptionList"), /feedUrl/,
      "and neither may the list");
    assert.deepEqual(declaredMembers(serverDeclarationSource, "PrivateFeedCreateResponse"), ["feedUrl", "subscription"],
      "which mirrors the server's own create contract");
    assert.doesNotMatch(declarationBlock(serverDeclarationSource, "PrivateFeedCollectionResponse"), /feedUrl/,
      "and its collection contract");
  });

  it("is read as a whole or not at all", () => {
    const body = { feedUrl: "https://example.test/feeds/calendar/ltf_feed_x/Name.ics", subscription: subscription() };
    assert.deepEqual(plain(parser.readCalendarSubscriptionSecret(body)), body);
    assert.equal(parser.readCalendarSubscriptionSecret({ ...body, feedUrl: "" }), null,
      "an empty URL was already the clear-the-panel path, and it still is");
    assert.equal(parser.readCalendarSubscriptionSecret({ subscription: subscription() }), null,
      "a missing URL is the same path");
    assert.equal(parser.readCalendarSubscriptionSecret({ ...body, subscription: { name: "x" } }), null,
      "a URL beside a descriptor the browser cannot vouch for is not shown");
    assert.equal(parser.readCalendarSubscriptionSecret({ subscriptions: [subscription()] }), null,
      "and a list body is not a secret");
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      assert.equal(parser.readCalendarSubscriptionSecret(empty), null);
    }
  });
});

describe("the descriptor guard", () => {
  it("rejects what the shaper could not send", () => {
    assert.equal(parser.isCalendarSubscription(subscription()), true);
    for (const member of declaredMembers(declarationSource, "BrowserCalendarSubscription")) {
      assert.equal(parser.isCalendarSubscription(omit(subscription(), member)), false, `${member} is always reconstructed`);
    }
    for (const member of plain(parser.SUBSCRIPTION_TEXT)) {
      assert.equal(parser.isCalendarSubscription({ ...subscription(), [member]: null }), false, `${member} is text`);
    }
    for (const member of plain(parser.SUBSCRIPTION_NULLABLE_TEXT)) {
      assert.equal(parser.isCalendarSubscription({ ...subscription(), [member]: null }), true, `${member} may be null`);
      assert.equal(parser.isCalendarSubscription({ ...subscription(), [member]: 0 }), false, `${member} is text or null`);
    }
    assert.equal(parser.isCalendarSubscription({ ...subscription(), subscriptionId: "" }), false,
      "the token row cannot lack its id");
    assert.equal(parser.isCalendarSubscription({ ...subscription(), ownedByCurrentUser: "yes" }), false,
      "ownership is a comparison, so it is a boolean");
    assert.equal(parser.isCalendarSubscription({ ...subscription(), owner: { displayName: "x" } }), false,
      "a partial owner is not one");
    assert.equal(parser.isCalendarSubscription({ ...subscription(), scope: { label: "x" } }), false,
      "a partial scope is not one");
  });

  it("reads the list totally and vouches for each element", () => {
    assert.match(extractFunctionBlock(serviceSource, "listCalendarSubscriptions"), /subscriptions: rows\.map\(/,
      "the list route sends a subscriptions collection");
    assert.deepEqual(plain(parser.readCalendarSubscriptions({ subscriptions: [subscription(), subscription()] })),
      [subscription(), subscription()]);
    assert.deepEqual(plain(parser.readCalendarSubscriptions({ subscriptions: [subscription(), { name: "x" }, null] })),
      [subscription()], "an element the browser cannot vouch for is dropped, not rendered");
    for (const empty of [null, undefined, "body", 4, [], {}, { subscriptions: null }, { subscriptions: {} }]) {
      assert.deepEqual(plain(parser.readCalendarSubscriptions(empty)), [], "an unusable body yields no rows, as before");
    }
    assert.match(extractFunctionBlock(page, "normalizeSubscriptions"), /Array\.isArray\(subscriptions\) \?/,
      "which is the total behaviour the page's own normaliser already had");
  });
});

describe("the options body", () => {
  it("is an exact envelope whose elements are deliberately left to their owner", () => {
    const producer = extractFunctionBlock(clientsServiceSource, "readClientProjectOptions");
    assert.match(producer, /return \{\n\s+view: "options",\n\s+clients: clients/, "the producer writes view literally");
    assert.match(producer, /workspaceProjects: \(data\.workspaceProjects \|\| \[\]\)/, "and builds both collections by hand");
    assert.deepEqual(declaredMembers(declarationSource, "BrowserClientProjectOptionsBody"), ["clients", "view", "workspaceProjects"]);
    const block = declarationBlock(declarationSource, "BrowserClientProjectOptionsBody");
    assert.match(block, /\n  view: "options";/);
    assert.match(block, /\n  clients: unknown\[\];/, "the client elements are not this page's to name");
    assert.match(block, /\n  workspaceProjects: unknown\[\];/, "nor the project elements");
    assert.match(declarationSource, /later-owner debt[\s\S]{0,300}export interface BrowserClientProjectOptionsBody \{/,
      "and the declaration says so rather than hiding it");
  });

  it("is consumed by normalisers that are total over their elements", () => {
    assert.match(extractFunctionBlock(page, "normalizeClients"), /Array\.isArray\(clients\) \? clients\.map\(\(client\) => \(\{/);
    assert.match(extractFunctionBlock(page, "normalizeProjects"), /Array\.isArray\(projects\) \? projects\.map\(\(project\) => \(\{/);
    assert.match(declarationSource, /normalizeClients\(data\?: unknown, options\?: \{ includeInactive\?: boolean \}\): NormalizedClientOption\[\];/,
      "and the shared surface ten other pages use is total over unknown as well");
  });

  it("narrows the envelope and passes the elements through untouched", () => {
    const body = { clients: [{ id: "c" }], view: "options", workspaceProjects: [{ id: "p" }] };
    assert.deepEqual(plain(parser.readClientProjectOptions(body)), body);
    assert.deepEqual(plain(parser.readClientProjectOptions({ clients: [{ id: "c" }], view: "options" })),
      { clients: [{ id: "c" }], view: "options", workspaceProjects: [] }, "a non-list member yields no elements, as before");
    assert.deepEqual(plain(parser.readClientProjectOptions({ clients: [{ id: "c" }], workspaceProjects: [{ id: "p" }] })),
      { clients: [], view: "options", workspaceProjects: [] },
      "a body that does not announce itself as the options view is not this producer's, whatever it carries");
    for (const empty of [null, undefined, "body", 4, []]) {
      assert.deepEqual(plain(parser.readClientProjectOptions(empty)), { clients: [], view: "options", workspaceProjects: [] });
    }
  });
});

describe("the consumers", () => {
  it("narrow every owned read through the readers", () => {
    // The readers are the one place a raw member may be read, and only after narrowing; the
    // consumers are everything else.
    const consumers = ["readCalendarSubscriptions", "readCalendarSubscriptionSecret", "readClientProjectOptions"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["subscriptionsBody.subscriptions", "optionsBody.clients", "optionsBody.workspaceProjects",
      "body.feedUrl", "body.subscriptions", "body.subscription", "body.clients", "body.workspaceProjects"]) {
      assert.ok(!consumers.includes(raw), `calendar-settings.js must no longer read ${raw} off an unknown body`);
    }
    assert.equal(consumers.split("readCalendarSubscriptions(").length, 3, "the initial load and the reload both narrow the list");
    assert.equal(consumers.split("readCalendarSubscriptionSecret(").length, 3, "create and rotate both narrow the secret");
    assert.match(page, /const options = readClientProjectOptions\(optionsBody\);/);
    assert.match(page, /showSecret\(secret\?\.feedUrl \|\| "", secret\?\.subscription \|\| null, "created"\);/,
      "an unreadable secret takes the clear-the-panel path showSecret already had");
    assert.match(page, /showSecret\(secret\?\.feedUrl \|\| "", secret\?\.subscription \|\| null, "rotated"\);/);
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/);
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

/** @param {string} literal @param {number} indent @returns {string[]} */
function literalMembers(literal, indent) {
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*):`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} source @param {string} name @returns {string} */
function declarationBlock(source, name) {
  const match = source.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} source @param {string} name @returns {string[]} */
function declaredMembers(source, name) {
  return [...declarationBlock(source, name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @param {string} source @param {string} name @returns {string[]} */
function unionLiterals(source, name) {
  const match = source.match(new RegExp(`export type ${name} = ([^;]+);`));
  assert.ok(match, `${name} must be declared`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/** @returns {Record<string, unknown>} */
function subscription() {
  return {
    createdAt: "2026-07-25T12:00:00.000Z",
    name: "Workspace overview",
    ownedByCurrentUser: true,
    owner: { displayName: "Current Administrator", username: "admin@example.test" },
    revocationReason: null,
    revokedAt: null,
    rotatedAt: null,
    scope: { label: "Workspace", type: "workspace" },
    status: "active",
    subscriptionId: "sub-1",
    timezone: "America/New_York",
  };
}

/** @param {Record<string, unknown>} record @param {string} type */
function withScope(record, type) {
  return { ...record, scope: { label: "Scope", type } };
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
