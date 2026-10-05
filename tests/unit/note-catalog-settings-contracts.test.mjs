import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/notes-collections.service.js");
const routes = read("src/modules/notes/notes.routes.js");
const repo = read("src/modules/notes/notes.repo.js");
const effectiveSecurity = read("src/modules/notes/effective-security.js");
const schemaFile = read("src/db/schema/current.sql");
// Scoped to one table, because `current.sql` constrains a `status` column on many tables and
// declares `library_bucket` NOT NULL on another. A whole-file regex would answer about the wrong one.
const schema = schemaFile.slice(
  schemaFile.indexOf("CREATE TABLE note_library_collections ("),
  schemaFile.indexOf("\n);", schemaFile.indexOf("CREATE TABLE note_library_collections (")),
);
const policyMigration = read("src/db/migrations/088_secure_catalog_policy.sql");
const transitionMigration = read("src/db/migrations/089_secure_catalog_transitions.sql");
const consumer = read("public/js/notes-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The literal `shapeCatalogSettingsRow` builds, sliced from the service rather than listed here. */
function rowLiteral() {
  const body = functionBody(service, "function shapeCatalogSettingsRow(collection) {");
  const at = body.indexOf("return {");
  assert.notEqual(at, -1, "the row shaper must return an object literal");
  return body.slice(at, body.indexOf("\n  };", at));
}

/** The words a `CHECK (<column> IN (...))` constraint allows. @param {string} source @param {string} column */
function checkedWords(source, column) {
  const match = new RegExp("CHECK \\(" + column + " IN \\(([^)]*)\\)").exec(source);
  assert.ok(match, "a CHECK constraint must close " + column);
  return [...match[1].matchAll(/'(\w+)'/g)].map((entry) => entry[1]).sort();
}

/** The words a browser vocabulary table lists. @param {string} name */
function browserWords(name) {
  const match = new RegExp("const " + name + " = Object\\.freeze\\(\\[([^\\]]*)\\]").exec(consumer);
  assert.ok(match, name + " must be a frozen table in the consumer");
  return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
}

/** The words a declared union closes over. @param {string} name */
function declaredWords(name) {
  const match = new RegExp("export type " + name + " = ([^;]+);").exec(contracts);
  assert.ok(match, name + " must be declared");
  return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
}

const ROW_MEMBERS = [
  "catalogId", "depth", "description", "effectiveSecurityMode", "libraryBucket", "parentCatalogId",
  "path", "securityInherited", "securityPolicy", "securityTransitionAction",
  "securityTransitionErrorCode", "securityTransitionJobId", "securityTransitionStartedAt",
  "securityTransitionState", "securityTransitionVersion", "sortOrder", "source", "status",
  "title", "updatedAt",
];

describe("the catalog settings producer", () => {
  it("reconstructs three members and spreads nothing", () => {
    const body = functionBody(service, "async function listCatalogSettings(session) {");
    const at = body.indexOf("return {");
    const literal = body.slice(at, body.indexOf("\n    };", at));
    const members = [...literal.matchAll(/^      (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      ["capabilities", "catalogs", "limits"],
      "the envelope must carry exactly the three declared members",
    );
    assert.ok(!literal.includes("..."), "a spread would make an exact contract unearned");
  });

  it("gates the read before it reads anything", () => {
    const body = functionBody(service, "async function listCatalogSettings(session) {");
    assert.ok(
      body.indexOf("assertCatalogSettingsAccess(session)") < body.indexOf("listCollectionRecords"),
      "the access gate must run before any catalog is read",
    );
  });

  it("lets the server decide the manage-security capability", () => {
    const body = functionBody(service, "async function listCatalogSettings(session) {");
    assert.match(
      body,
      /permissionsService\.canInAnyScope\(session, NOTE_PERMISSIONS\.SECURE_MANAGE\)/,
      "the capability must come from the permissions service, not from a catalog field",
    );
    assert.match(
      body,
      /capabilities: \{ manageSecurity: canManageSecurity \}/,
      "the capability must be reported as the server computed it",
    );
  });

  it("shapes every row through one named shaper", () => {
    const body = functionBody(service, "async function listCatalogSettings(session) {");
    assert.match(body, /\.map\(shapeCatalogSettingsRow\)/, "each catalog must go through the row shaper");
  });

  it("builds exactly the twenty members the browser contract declares", () => {
    const produced = [...rowLiteral().matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(produced, [...ROW_MEMBERS].sort(), "the shaper's own literal must match the declaration");
    assert.ok(!rowLiteral().includes("..."), "the row shaper must reconstruct rather than spread");
  });
});

describe("what the row shaper withholds", () => {
  const literal = rowLiteral();

  it("never names the actor who started a security transition", () => {
    assert.ok(
      transitionMigration.includes("security_transition_actor_user_id"),
      "the column must exist for this withholding to mean anything",
    );
    assert.ok(
      !literal.includes("security_transition_actor_user_id"),
      "the settings row must not disclose who started a catalog security transition",
    );
  });

  it("never names which ancestor imposes inherited security", () => {
    assert.match(
      repo,
      /security_source_catalog_id: security\.securityCatalogId/,
      "the record must carry the source catalog for this withholding to mean anything",
    );
    assert.ok(
      !literal.includes("security_source_catalog_id"),
      "securityInherited says that security is inherited, never from where",
    );
  });

  it("withholds the workspace, the slug, both user stamps and the metadata blob", () => {
    for (const column of [
      "workspace_id", "slug", "created_by_user_id", "updated_by_user_id", "metadata",
      "archived_at", "deleted_at", "security_resolution_state",
    ]) {
      assert.ok(!literal.includes(column), "the settings row must not disclose " + column);
    }
  });
});

describe("the closed vocabularies", () => {
  it("closes the library bucket on the column's own constraint", () => {
    const columnWords = checkedWords(schema, "library_bucket");
    assert.deepEqual(columnWords, ["active_work", "ongoing_area", "reference"],
      "the bucket column must constrain exactly the three Library buckets");
    assert.deepEqual(browserWords("CATALOG_BUCKETS"), columnWords, "the browser table must be the column's");
    assert.deepEqual(declaredWords("BrowserNoteLibraryBucket"), columnWords, "the union must be the column's");
  });

  it("closes the catalog status on the column's own constraint", () => {
    const columnWords = checkedWords(schema, "status");
    assert.deepEqual(columnWords, ["active", "archived", "deleted"],
      "the status column must constrain exactly the three catalog lifecycle states");
    assert.deepEqual(browserWords("CATALOG_STATUSES"), columnWords,
      "the browser status table must be the column's");
    assert.deepEqual(declaredWords("BrowserNoteCatalogStatus"), columnWords,
      "the status union must be the column's");
  });

  it("closes the security policy on migration 088", () => {
    const columnWords = checkedWords(policyMigration, "security_policy");
    assert.deepEqual(columnWords, ["normal", "secure"],
      "migration 088 must constrain the security policy to exactly two words");
    assert.deepEqual(browserWords("CATALOG_SECURITY_POLICIES"), columnWords,
      "the browser policy table must be the migration's");
    assert.deepEqual(declaredWords("BrowserNoteCatalogSecurityPolicy"), columnWords,
      "the policy union must be the migration's");
  });

  it("closes the transition state on migration 088", () => {
    const columnWords = checkedWords(policyMigration, "security_transition_state");
    assert.deepEqual(columnWords, ["failed", "securing", "stable"],
      "migration 088 must constrain the transition state to exactly three words");
    assert.deepEqual(browserWords("CATALOG_TRANSITION_STATES"), columnWords,
      "the browser transition-state table must be the migration's");
    assert.deepEqual(declaredWords("BrowserNoteCatalogTransitionState"), columnWords,
      "the transition-state union must be the migration's");
  });

  it("closes the transition action on migration 089", () => {
    const columnWords = checkedWords(transitionMigration, "security_transition_action");
    assert.deepEqual(columnWords, ["enable", "none", "remove"],
      "migration 089 must constrain the transition action to exactly three words");
    assert.deepEqual(browserWords("CATALOG_TRANSITION_ACTIONS"), columnWords,
      "the browser transition-action table must be the migration's");
    assert.deepEqual(declaredWords("BrowserNoteCatalogTransitionAction"), columnWords,
      "the transition-action union must be the migration's");
  });

  it("closes the effective mode on the resolver's own frozen table", () => {
    const table = /NOTE_EFFECTIVE_SECURITY_MODES = Object\.freeze\(\{([^}]*)\}\)/.exec(effectiveSecurity);
    assert.ok(table, "the resolver must publish a frozen mode table");
    const resolverWords = [...table[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(resolverWords, ["normal", "secure"],
      "the resolver must answer exactly two effective modes");
    assert.deepEqual(browserWords("CATALOG_EFFECTIVE_MODES"), resolverWords,
      "the browser effective-mode table must be the resolver's");
    assert.deepEqual(declaredWords("BrowserNoteEffectiveSecurityMode"), resolverWords,
      "the effective-mode union must be the resolver's");
  });

  it("leaves the source vocabulary open, because no browser code reads it", () => {
    assert.deepEqual(checkedWords(schema, "collection_source"), ["imported", "manual"],
      "the source column must be closed even though the browser leaves it open");
    assert.ok(
      !/catalog\.source\b/.test(consumer),
      "closing a vocabulary nothing reads would claim a check this page never makes",
    );
    const declared = contracts.slice(contracts.indexOf("export interface BrowserNoteCatalogSettingsRow {"));
    assert.match(declared.slice(0, declared.indexOf("\n}")), /source: string;/, "source stays open text");
  });
});

describe("the nullability the column decides", () => {
  const declared = contracts.slice(
    contracts.indexOf("export interface BrowserNoteCatalogSettingsRow {"),
    contracts.indexOf("\n}", contracts.indexOf("export interface BrowserNoteCatalogSettingsRow {")),
  );

  it("keeps the library bucket nullable, because the column permits null and nothing defaults it", () => {
    assert.match(
      schema,
      /library_bucket TEXT CHECK/,
      "the column must carry no NOT NULL for this nullability to be right",
    );
    assert.ok(
      !/library_bucket TEXT NOT NULL/.test(schema),
      "a NOT NULL bucket would make the nullable declaration an over-claim",
    );
    assert.match(declared, /libraryBucket: BrowserNoteLibraryBucket \| null;/, "the bucket must stay nullable");
  });

  it("keeps updatedAt required, because its column is NOT NULL", () => {
    assert.match(schema, /updated_at TEXT NOT NULL/, "the column must be NOT NULL");
    assert.match(declared, /updatedAt: string;/, "updatedAt must not be declared nullable");
  });

  it("declares nothing optional, because the shaper names every member every time", () => {
    assert.ok(!/^  \w+\?:/m.test(declared), "no row member may be optional");
  });
});

describe("the route", () => {
  it("hands the service result to the browser unchanged", () => {
    const at = routes.indexOf("notesRoutes.get(\"/notes/settings/catalogs\"");
    assert.notEqual(at, -1, "the catalog settings route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /notesService\.listCatalogSettings\(/, "the route must call the traced producer");
    assert.match(route, /requireWorkspaceSession\(request\.session\)/, "the route must require a workspace session");
    assert.match(route, /response\.status\(200\)\.json\(result\)/, "the route must answer the service result itself");
  });
});

describe("the notes settings consumer", () => {
  const reader = consumer.slice(
    consumer.indexOf("function readCatalogSettingsRow"),
    consumer.indexOf("async function loadNotesSettings"),
  );

  it("no longer defaults an unread body to an empty catalog list", () => {
    assert.ok(
      !consumer.includes("Array.isArray(result.catalogs) ? result.catalogs : []"),
      "the raw array-or-empty default must be gone",
    );
    assert.ok(
      !consumer.includes("result.capabilities?.manageSecurity === true"),
      "the raw optional-chained capability read must be gone",
    );
  });

  it("refuses an unreadable body rather than rendering an empty workspace", () => {
    assert.match(
      consumer,
      /throw new Error\("Notes catalog settings could not be read\./,
      "an unreadable catalog body must take the page's error path",
    );
  });

  it("refuses the whole envelope when one row cannot be read", () => {
    const envelope = consumer.slice(consumer.indexOf("function readNoteCatalogSettings"));
    assert.match(
      envelope.slice(0, envelope.indexOf("\n  }")),
      /const row = readCatalogSettingsRow\(entry\);\n      if \(!row\) \{\n        return null;/,
      "a row the browser cannot vouch for must refuse the envelope, not be dropped from it",
    );
  });

  it("checks the capability and the limit the envelope claims", () => {
    const envelope = consumer.slice(consumer.indexOf("function readNoteCatalogSettings"));
    assert.match(
      envelope,
      /typeof capabilities\.manageSecurity !== "boolean"/,
      "the manage-security capability must be checked as a boolean",
    );
    assert.match(envelope, /!isCount\(limits\.bulkSelection\)/, "the bulk limit must be checked as a finite number");
  });

  it("checks every member the row contract claims", () => {
    for (const member of ["catalogId", "title", "description", "path", "source", "updatedAt"]) {
      assert.ok(reader.includes(member), "the reader must read " + member);
    }
    assert.match(reader, /isText\(catalogId\)/, "the catalog id must be checked as text");
    assert.match(reader, /isNullableText\(parentCatalogId\)/, "the parent must be checked as nullable text");
    assert.match(reader, /isNullableText\(securityTransitionJobId\)/, "the job id must be checked as nullable text");
    assert.match(reader, /isCount\(depth\)/, "depth must be checked as a finite number");
    assert.match(reader, /isCount\(securityTransitionVersion\)/, "the version must be checked as a finite number");
    assert.match(reader, /typeof securityInherited !== "boolean"/, "inheritance must be checked as a boolean");
  });

  it("searches each vocabulary rather than testing membership", () => {
    for (const table of [
      "CATALOG_BUCKETS", "CATALOG_STATUSES", "CATALOG_SECURITY_POLICIES",
      "CATALOG_EFFECTIVE_MODES", "CATALOG_TRANSITION_STATES", "CATALOG_TRANSITION_ACTIONS",
    ]) {
      assert.ok(reader.includes(table + ".find("), table + " must be searched, not tested");
      assert.ok(!reader.includes(table + ".includes("), table + " must not answer a bare boolean");
    }
  });

  it("distinguishes an absent bucket from an unrecognised one", () => {
    assert.match(
      reader,
      /entry\.libraryBucket === null\s*\n\s*\? null/,
      "null is a value the column permits and must survive the search",
    );
    assert.match(reader, /bucket === undefined/, "an unrecognised bucket must refuse the row");
  });

  it("does not recompute the manage-security decision from catalog fields", () => {
    assert.match(
      consumer,
      /state\.canManageSecurity = settings\.capabilities\.manageSecurity;/,
      "the page must report the server's capability rather than deriving one",
    );
  });

  it("no longer borrows the server's own row type for browser state", () => {
    assert.ok(
      !consumer.includes("notes-collections-contracts.js"),
      "browser state must be typed by a browser contract the page validates at runtime",
    );
    assert.match(
      consumer,
      /\/\*\* @type \{BrowserNoteCatalogSettingsRow\[\]\} \*\//,
      "the catalog state slot must carry the narrowed browser row",
    );
  });
});
