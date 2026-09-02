// Runtime proof for the API key response bodies.
//
// One service answers the three API key routes with two record vocabularies and one secret.
// The list entry is the nine columns `readAll` selects by name plus the key's scopes; the
// public record is what `toPublicApiKey` reconstructs beside a create or revoke; the raw key
// is minted, hashed and handed over exactly once, on create. Every one of those is an exact
// reconstruction, so every contract here is exact, and each is pinned to the literal or the
// query that builds it.
//
// **The secret is guarded from both sides.** The list query must never select the hash, the
// public shaper must never emit it, the audit trail must record only the prefix, and neither
// browser record may grow a raw key or a hash - optionally or otherwise.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/api-keys.service.js");
const repositorySource = readText("src/repositories/api-keys.repo.js");
const modulesSource = readText("src/core/modules/modules.service.js");
const registrySource = readText("src/core/modules/registry.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/api-keys.js");

const parser = sandbox(page,
  ["isResponseRecord", "isText", "isNullableText", "hasApiKeyShape", "isApiKeyListEntry", "isApiKeyRecord",
    "isApiScope", "readApiKeyCollection", "readApiKeySecret"],
  ["API_KEY_ENTRY_TEXT", "API_KEY_RECORD_TEXT", "API_KEY_NULLABLE_TEXT", "API_SCOPE_TEXT"]);

const listRoute = extractFunctionBlock(serviceSource, "list");
const createRoute = extractFunctionBlock(serviceSource, "create");
const revokeRoute = extractFunctionBlock(serviceSource, "revoke");
const shaper = extractFunctionBlock(serviceSource, "toPublicApiKey");
const readAll = extractFunctionBlock(repositorySource, "readAll");
const catalogue = extractFunctionBlock(modulesSource, "listAvailableApiScopes");

/** The column list `readAll` selects, read from its SQL rather than from any table. */
const selectedColumns = [...readAll.slice(readAll.indexOf("SELECT"), readAll.indexOf("FROM api_keys"))
  .matchAll(/^\s*(\w+),?\s*$/gm)].map((entry) => entry[1]).filter((name) => name !== "SELECT");

describe("the three routes against their producer", () => {
  it("answer exactly the members the service returns", () => {
    assert.deepEqual(literalMembers(listRoute.slice(listRoute.lastIndexOf("return {")), 4).sort(),
      ["apiKeys", "availableScopes"], "list answers the collection");
    assert.deepEqual(literalMembers(createRoute.slice(createRoute.lastIndexOf("return {")), 4).sort(),
      ["apiKey", "apiKeys", "availableScopes", "rawKey"], "create answers the secret beside the collection");
    assert.deepEqual(literalMembers(revokeRoute.slice(revokeRoute.lastIndexOf("return {")), 4).sort(),
      ["apiKey", "apiKeys", "availableScopes"], "revoke answers the record beside the collection, and no raw key");
    assert.deepEqual(declaredMembers("BrowserApiKeyCollection").sort(), ["apiKeys", "availableScopes"],
      "the collection contract is exactly the two shared members");
    assert.deepEqual(declaredMembers("BrowserApiKeySecret").sort(), ["apiKey", "rawKey"],
      "the secret contract is exactly the two members only create adds");
    assert.match(declarationSource, /export type BrowserApiKeyCreation = BrowserApiKeyCollection & BrowserApiKeySecret;/,
      "and the creation body is the two composed");
    assert.deepEqual(declaredMembers("BrowserApiKeyRevocation").sort(), ["apiKey"],
      "the revocation adds the record and nothing else");
  });

  it("are all gated by workspace settings authority", () => {
    for (const [name, block] of [["list", listRoute], ["create", createRoute], ["revoke", revokeRoute]]) {
      assert.match(block, /assertCan\(session, "workspace_settings\.manage"/, `${name} asserts the permission first`);
    }
  });
});

describe("the list entry", () => {
  it("is the nine selected columns with the scopes attached, and never the hash", () => {
    assert.deepEqual(selectedColumns.slice().sort(),
      ["api_key_id", "created_at", "created_by_user_id", "key_prefix", "last_used_at", "name", "revoked_at", "status", "workspace_id"],
      "readAll selects nine columns by name");
    assert.ok(!selectedColumns.includes("key_hash"), "and the hash is not one of them");
    assert.match(readAll, /return keys\.map\(\(key\) => \(\{\s+\.\.\.key,\s+scopes: scopesByKeyId\.get\(key\.api_key_id\) \|\| \[\],\s+\}\)\);/,
      "each row gains its scopes and nothing else");
    assert.deepEqual(declaredMembers("BrowserApiKeyListEntry").sort(), [...selectedColumns, "scopes"].sort(),
      "the entry contract is exactly those columns plus scopes");
    assert.match(listRoute, /apiKeys: await apiKeysRepository\.readAll\(session\.workspace_id\),/, "which is what list sends");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual([...plain(parser.API_KEY_ENTRY_TEXT), ...plain(parser.API_KEY_NULLABLE_TEXT), "scopes"].sort(),
      declaredMembers("BrowserApiKeyListEntry").sort(), "the browser checks every member the entry declares");
    assert.deepEqual([...plain(parser.API_KEY_RECORD_TEXT), ...plain(parser.API_KEY_NULLABLE_TEXT), "scopes"].sort(),
      declaredMembers("BrowserApiKeyRecord").sort(), "and every member the record declares");
    assert.deepEqual(plain(parser.API_SCOPE_TEXT).slice().sort(), declaredMembers("BrowserApiScope").sort(),
      "and every member the scope declares");
  });

  it("rejects what the list could not send", () => {
    assert.equal(parser.isApiKeyListEntry(listEntry()), true);
    for (const member of declaredMembers("BrowserApiKeyListEntry")) {
      assert.equal(parser.isApiKeyListEntry(omit(listEntry(), member)), false, `${member} is always selected`);
    }
    for (const member of plain(parser.API_KEY_NULLABLE_TEXT)) {
      assert.equal(parser.isApiKeyListEntry({ ...listEntry(), [member]: null }), true, `${member} may be null`);
      assert.equal(parser.isApiKeyListEntry({ ...listEntry(), [member]: 0 }), false, `${member} is text or null`);
    }
    assert.equal(parser.isApiKeyListEntry({ ...listEntry(), scopes: ["tasks:read", 4] }), false, "a scope is text");
    assert.equal(parser.isApiKeyListEntry({ ...listEntry(), scopes: "tasks:read" }), false, "scopes is a list");
  });

  it("keeps the status as text because the column and the server do", () => {
    assert.match(repositorySource, /api_key_id: string, workspace_id: string, created_by_user_id: string, name: string, key_prefix: string, status: string,/,
      "the server row type keeps status open");
    assert.match(declarationBlock("BrowserApiKeyListEntry"), /\n  status: string;/);
    assert.match(declarationBlock("BrowserApiKeyRecord"), /\n  status: string;/);
    assert.equal(parser.isApiKeyListEntry({ ...listEntry(), status: "suspended" }), true, "text is text");
  });
});

describe("the public record", () => {
  it("is the exact reconstruction the shaper writes, without the creator", () => {
    const written = literalMembers(shaper, 4);
    assert.deepEqual(written.slice().sort(),
      ["api_key_id", "created_at", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "status", "workspace_id"],
      "toPublicApiKey names nine members");
    assert.deepEqual(declaredMembers("BrowserApiKeyRecord").sort(), written.slice().sort(),
      "and the record contract is exactly those nine");
    assert.ok(!written.includes("created_by_user_id"), "the creator is a list-only disclosure");
    assert.ok(!declaredMembers("BrowserApiKeyRecord").includes("created_by_user_id"),
      "which is why the two records are kept apart rather than merged");
    assert.equal(parser.isApiKeyRecord(omit(listEntry(), "created_by_user_id")), true);
    assert.equal(parser.isApiKeyRecord(omit(omit(listEntry(), "created_by_user_id"), "key_prefix")), false);
  });

  it("feeds the audit trail, which records only the prefix", () => {
    assert.match(createRoute, /newValue: toPublicApiKey\(apiKey\),/, "the audit's new value is the public record");
    const audit = createRoute.slice(createRoute.indexOf("auditService.record({"), createRoute.indexOf("return {"));
    assert.match(audit, /metadata: \{\s+key_prefix: apiKey\.key_prefix,/, "the metadata carries the prefix");
    assert.doesNotMatch(audit, /rawKey|keyHash|key_hash/, "and never the raw key or its hash");
  });
});

describe("the raw key", () => {
  it("is minted, hashed and handed over exactly once", () => {
    assert.match(serviceSource, /function createRawApiKey\(\) \{\s+return `\$\{API_KEY_PREFIX\}_\$\{randomBytes\(24\)\.toString\("base64url"\)\}`;/,
      "the key is random");
    assert.match(createRoute, /keyHash: hashApiKey\(rawKey\),\s+keyPrefix: createKeyPrefix\(rawKey\),/,
      "and stored as a hash with a display prefix");
    assert.match(serviceSource, /function hashApiKey\(rawKey\) \{\s+return createHash\("sha256"\)/, "the hash is SHA-256");
    assert.match(serviceSource, /function createKeyPrefix\(rawKey\) \{\s+return rawKey\.slice\(0, 17\);/, "the prefix is seventeen characters");
    assert.match(createRoute, /\n\s+rawKey,\r?\n/, "create answers the raw key");
    assert.doesNotMatch(listRoute, /rawKey/, "the list never does");
    assert.doesNotMatch(revokeRoute, /rawKey/, "and neither does the revoke");
    assert.doesNotMatch(shaper, /rawKey|key_hash/, "and the shaper never sees it");
  });

  it("lives on the secret contract and never on a record", () => {
    for (const name of ["BrowserApiKeyListEntry", "BrowserApiKeyRecord", "BrowserApiKeyCollection", "BrowserApiKeyRevocation", "BrowserApiScope"]) {
      assert.doesNotMatch(declarationBlock(name), /rawKey|key_hash|keyHash/, `${name} must not carry key material, optionally or otherwise`);
    }
    assert.match(declarationBlock("BrowserApiKeySecret"), /\n  rawKey: string;/, "and on the secret it is required");
  });

  it("is read as a whole or not at all", () => {
    const body = { apiKey: omit(listEntry(), "created_by_user_id"), rawKey: "ltf_key_abcdefghijklmnop", apiKeys: [], availableScopes: [] };
    assert.deepEqual(plain(parser.readApiKeySecret(body)), { apiKey: body.apiKey, rawKey: body.rawKey });
    assert.equal(parser.readApiKeySecret({ ...body, rawKey: "" }), null, "an empty key already hid the panel, and still does");
    assert.equal(parser.readApiKeySecret(omit(body, "rawKey")), null);
    assert.equal(parser.readApiKeySecret({ ...body, apiKey: { name: "x" } }), null, "a key beside a record the browser cannot vouch for is not shown");
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      assert.equal(parser.readApiKeySecret(empty), null);
    }
  });
});

describe("the scope catalogue", () => {
  it("is the exact six members the modules service writes", () => {
    const written = literalMembers(catalogue.slice(catalogue.lastIndexOf("return {")), 8);
    assert.deepEqual(written.slice().sort(), ["access", "description", "id", "label", "moduleId", "scope"],
      "listAvailableApiScopes writes six members");
    assert.deepEqual(declaredMembers("BrowserApiScope").sort(), written.slice().sort());
    assert.match(catalogue, /\.filter\(\(scope\) => enabledModuleIdSet\.has\(scope\.moduleId\)\)/, "after enablement filtering");
    assert.match(catalogue, /evaluatePublicDemoCapability\(scope\.publicDemoCapability\)\.allowed/, "and public-demo filtering");
  });

  it("keeps access as text because the registry passes a declared value through", () => {
    assert.match(registrySource, /access: scope\.access \|\| \(String\(scope\.id \|\| ""\)\.endsWith\(":write"\) \? "write" : "read"\),/,
      "a module's declared access is answered as given");
    assert.match(declarationBlock("BrowserApiScope"), /\n  access: string;/);
    assert.equal(parser.isApiScope({ ...scope(), access: "admin" }), true, "any declared word is accepted");
    assert.equal(parser.isApiScope({ ...scope(), access: 1 }), false, "but access is still checked as text");
    for (const member of declaredMembers("BrowserApiScope")) {
      assert.equal(parser.isApiScope(omit(scope(), member)), false, `${member} is always written`);
    }
  });
});

describe("the collection reader", () => {
  it("reads both lists totally and vouches for each element", () => {
    const body = { apiKeys: [listEntry()], availableScopes: [scope()] };
    assert.deepEqual(plain(parser.readApiKeyCollection(body)), body);
    assert.deepEqual(plain(parser.readApiKeyCollection({ apiKeys: [listEntry(), { name: "x" }], availableScopes: [scope(), null] })),
      body, "an element the browser cannot vouch for is dropped, not rendered");
    assert.deepEqual(plain(parser.readApiKeyCollection({ apiKeys: [{}], availableScopes: [{}] })),
      { apiKeys: [], availableScopes: [] }, "an array container alone confers no trust");
    for (const empty of [null, undefined, "body", 4, [], {}, { apiKeys: {}, availableScopes: "tasks:read" }]) {
      assert.deepEqual(plain(parser.readApiKeyCollection(empty)), { apiKeys: [], availableScopes: [] },
        "an unusable body yields the empty lists the || [] reads already did");
    }
  });
});

describe("the consumers", () => {
  it("narrow every owned read through the readers", () => {
    const consumers = ["readApiKeyCollection", "readApiKeySecret"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["body.apiKeys", "body.availableScopes", "body.rawKey", "body.apiKey"]) {
      assert.ok(!consumers.includes(raw), `api-keys.js must no longer read ${raw} off an unknown body`);
    }
    assert.equal(consumers.split("readApiKeyCollection(").length, 4, "list, create and revoke all narrow the collection");
    assert.match(page, /const issued = readApiKeySecret\(body\);/);
    assert.match(page, /showRawKey\(issued\?\.rawKey \|\| ""\);/, "an unreadable secret takes the hidden-panel path showRawKey already had");
    assert.match(page, /setApiKeyStatus\(`Created \$\{issued\?\.apiKey\.name \|\| name\}\.`\);/);
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
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
function listEntry() {
  return {
    api_key_id: "key-1",
    created_at: "2026-09-02T12:00:00.000Z",
    created_by_user_id: "u-1",
    key_prefix: "ltf_key_abcdefghi",
    last_used_at: null,
    name: "Integration",
    revoked_at: null,
    scopes: ["tasks:read"],
    status: "active",
    workspace_id: "w-1",
  };
}

/** @returns {Record<string, unknown>} */
function scope() {
  return { access: "read", description: "Read tasks", id: "tasks:read", label: "Tasks", moduleId: "tasks", scope: "tasks:read" };
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
