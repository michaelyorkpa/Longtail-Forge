import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/catalog-security.service.js");
const routes = read("src/modules/notes/notes.routes.js");
const consumer = read("public/js/notes-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The literal `publicPreflight` builds, sliced from the service rather than listed here. */
function preflightLiteral() {
  const body = functionBody(service, "function publicPreflight(context) {");
  const at = body.indexOf("return {");
  assert.notEqual(at, -1, "the preflight shaper must return an object literal");
  return body.slice(at, body.indexOf("\n  };", at));
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredWords(name) {
  const match = new RegExp("export type " + name + " = ([^;]+);").exec(contracts);
  assert.ok(match, name + " must be declared");
  return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
}

describe("the preflight producer", () => {
  it("answers one envelope built by one shaper", () => {
    const body = functionBody(service, "async function preflight(collectionId, query = {}, session) {");
    assert.match(
      body,
      /return \{ preflight: publicPreflight\(context\) \};/,
      "the preflight route must answer exactly the shaper's own result",
    );
  });

  it("reconstructs fourteen members and spreads nothing", () => {
    const literal = preflightLiteral();
    const members = [...literal.matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      [
        "action", "affectedNoteCount", "affectedRevisionCount", "blockerCodes", "canProceed",
        "catalogCount", "catalogId", "currentPolicy", "execution", "noteTransformCount",
        "revisionTransformCount", "staleSearchDocumentCount", "transitionState", "workRecordCount",
      ],
      "the preflight shaper must build exactly the fourteen declared members",
    );
    assert.ok(!literal.includes("..."), "a spread would make the exact preflight contract unearned");
  });

  it("closes the action vocabulary in the normaliser that throws otherwise", () => {
    const body = functionBody(service, "function normalizeAction(value) {");
    assert.match(body, /throw new AppError/, "an unrecognised action must throw rather than pass through");
    assert.match(body, /TRANSITION_ACTIONS\.ENABLE/, "the normaliser must accept enable");
    assert.match(body, /TRANSITION_ACTIONS\.REMOVE/, "the normaliser must accept remove");
    const table = /TRANSITION_ACTIONS = Object\.freeze\(\{([^}]*)\}\)/.exec(service);
    assert.ok(table, "the service must publish a frozen action table");
    const listed = [...table[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(listed, ["enable", "remove"], "the action table must hold exactly two words");
    assert.deepEqual(
      declaredWords("BrowserNoteCatalogSecurityAction"),
      listed,
      "the declared action union must be the service's own table",
    );
  });

  it("closes the execution vocabulary on the branch that chooses it", () => {
    assert.match(
      service,
      /execution: workRecordCount > CATALOG_SECURITY_SYNC_RECORD_LIMIT \? "job" : "synchronous"/,
      "the preflight execution must come from one two-way branch",
    );
    assert.deepEqual(
      declaredWords("BrowserNoteCatalogSecurityExecution"),
      ["job", "synchronous"],
      "the declared execution union must be that branch's two words",
    );
  });

  it("counts what it collected, so every count is a real total", () => {
    const literal = preflightLiteral();
    for (const [member, source] of [
      ["affectedNoteCount", "context.affectedNotes.length"],
      ["affectedRevisionCount", "context.affectedRevisions.length"],
      ["catalogCount", "context.scopeCollections.length"],
      ["noteTransformCount", "context.notesToTransform.length"],
      ["revisionTransformCount", "context.revisionsToTransform.length"],
    ]) {
      assert.ok(literal.includes(member + ": " + source), member + " must be the length of what it counts");
    }
    assert.match(literal, /canProceed: context\.blockers\.length === 0/, "canProceed must mean there are no blockers");
  });
});

describe("the transition producer", () => {
  it("spreads its own process result, which is why the contract is a structural minimum", () => {
    assert.match(
      service,
      /return \{\n {4}\.\.\.result,\n {4}execution: "synchronous",/,
      "the synchronous branch must spread, so only the members named after it can be claimed",
    );
  });

  it("names the execution the route branches on", () => {
    assert.match(service, /execution: "job",/, "the job branch must name its execution");
    const at = routes.indexOf("notesRoutes.post(\"/notes/collections/:collectionId/security/enable\"");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(
      route,
      /response\.status\(result\.execution === "job" \? 202 : 200\)/,
      "the route itself must branch on the execution word",
    );
  });

  it("also answers a whole collection record the browser is not given a type for", () => {
    assert.match(
      service,
      /collection: await notesRepository\.readCollectionById\(session\.workspace_id, collectionId\),/,
      "the job branch must answer the whole record for this finding to mean anything",
    );
    const declared = declaredInterface("BrowserNoteCatalogSecurityTransition");
    assert.ok(
      !declared.includes("collection"),
      "the over-broad member must not be blessed with a browser type",
    );
    assert.ok(
      !/transition\.collection/.test(consumer),
      "no consumer may read the whole record this contract deliberately leaves undeclared",
    );
  });
});

describe("the transition safeguards", () => {
  it("gates every route on the public-demo capability and the transition permission", () => {
    for (const opener of [
      "async function preflight(collectionId, query = {}, session) {",
      "async function enable(collectionId, rawPayload, session) {",
      "async function remove(collectionId, rawPayload, session) {",
      "async function retry(collectionId, rawPayload, session) {",
    ]) {
      const body = functionBody(service, opener);
      assert.match(
        body,
        /assertPublicDemoCapabilityAllowed\("secure_notes\.catalog_security"\)/,
        opener + " must assert the public-demo capability",
      );
      assert.match(body, /assertTransitionPermissions\(session\)/, opener + " must assert transition permissions");
    }
  });

  it("keeps both downgrade prerequisites on the remove route", () => {
    const body = functionBody(service, "async function remove(collectionId, rawPayload, session) {");
    assert.match(body, /assertDowngradeConfirmation\(payload, context\)/, "remove must confirm the downgrade");
    assert.match(body, /reauthenticateCurrentUser\(payload, session\)/, "remove must reauthenticate the user");
  });

  it("lets only a failed transition be retried", () => {
    const body = functionBody(service, "async function retry(collectionId, rawPayload, session) {");
    assert.match(
      body,
      /security_transition_state !== CATALOG_SECURITY_TRANSITION_STATES\.FAILED/,
      "retry must refuse a transition that has not failed",
    );
    assert.match(body, /throw new AppError\("Only a failed catalog security transition can be retried\./,
      "the refusal must be a thrown error");
  });
});

describe("the declarations", () => {
  it("declares the preflight the shaper builds, with nothing optional", () => {
    const declared = declaredInterface("BrowserNoteCatalogSecurityPreflight");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    const produced = [...preflightLiteral().matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, produced, "declared membership must equal the shaper's own literal");
    assert.ok(!/^  \w+\?:/m.test(declared), "no preflight member may be optional");
  });

  it("reuses the catalog vocabularies for the two members that are those columns", () => {
    const declared = declaredInterface("BrowserNoteCatalogSecurityPreflight");
    assert.match(preflightLiteral(), /currentPolicy: context\.collection\.security_policy/,
      "currentPolicy must be the security_policy column");
    assert.match(preflightLiteral(), /transitionState: context\.collection\.security_transition_state/,
      "transitionState must be the security_transition_state column");
    assert.match(declared, /currentPolicy: BrowserNoteCatalogSecurityPolicy;/,
      "currentPolicy must reuse the column's own published vocabulary");
    assert.match(declared, /transitionState: BrowserNoteCatalogTransitionState;/,
      "transitionState must reuse the column's own published vocabulary");
  });

  it("leaves the blocker codes open text, because nothing compares them to a literal", () => {
    assert.match(declaredInterface("BrowserNoteCatalogSecurityPreflight"), /blockerCodes: string\[\];/,
      "blocker codes must stay open text");
    assert.ok(
      !/blockerCodes[\s\S]{0,80}===/.test(consumer),
      "closing the blocker vocabulary would claim a comparison this page never makes",
    );
  });

  it("declares the transition as a structural minimum", () => {
    const declared = declaredInterface("BrowserNoteCatalogSecurityTransition");
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["execution"], "only the member named after the spread may be claimed");
  });
});

describe("the notes settings consumer", () => {
  it("no longer defaults an unreadable preview to an empty object", () => {
    assert.ok(
      !consumer.includes("result.preflight || {}"),
      "the raw preview default must be gone",
    );
  });

  it("refuses an unreadable preview rather than choosing the wrong dialog", () => {
    assert.match(
      consumer,
      /throw new Error\("Catalog security preview could not be read\./,
      "an unreadable preview must take the page's error path",
    );
  });

  it("reads the transition result before it closes the dialog", () => {
    const handler = consumer.slice(consumer.indexOf("readCatalogSecurityTransition(\n"));
    const readAt = handler.indexOf("if (!transition)");
    const closeAt = handler.indexOf("closeDialog(dialog)");
    assert.ok(readAt !== -1 && closeAt !== -1, "both the read and the close must be present");
    assert.ok(readAt < closeAt, "an unvouchable body must not be able to dismiss the dialog first");
    assert.match(
      consumer,
      /throw new Error\("Catalog security transition result could not be read\./,
      "an unreadable transition must not report an outcome",
    );
  });

  it("validates the blocker code elements it renders one by one", () => {
    const reader = consumer.slice(
      consumer.indexOf("function readCatalogSecurityPreflight"),
      consumer.indexOf("function readCatalogSecurityTransition"),
    );
    assert.match(reader, /Array\.isArray\(blockerCodes\)/, "the container must be checked");
    assert.match(reader, /blockerCodes\.every\(isText\)/, "each rendered element must be checked too");
    assert.match(reader, /typeof canProceed !== "boolean"/, "the confirm-button gate must be a real boolean");
    assert.match(reader, /PREFLIGHT_COUNTS\.every\(\(key\) => isCount\(preflight\[key\]\)\)/,
      "every count must be checked as a finite number");
  });

  it("searches each vocabulary rather than testing membership", () => {
    const reader = consumer.slice(
      consumer.indexOf("function readCatalogSecurityPreflight"),
      consumer.indexOf("async function loadNotesSettings"),
    );
    for (const table of ["SECURITY_ACTIONS", "SECURITY_EXECUTIONS"]) {
      assert.ok(reader.includes(table + ".find("), table + " must be searched, not tested");
      assert.ok(!reader.includes(table + ".includes("), table + " must not answer a bare boolean");
    }
  });

  it("hands the narrowed preview straight into the confirmation", () => {
    assert.match(
      consumer,
      /\/\*\* @param \{BrowserNoteCatalogSecurityPreflight\} preflight \*\//,
      "the confirmation must receive the narrowed preview",
    );
    assert.match(
      consumer,
      /showCatalogSecurityConfirmation\(catalog, requestedAction, preflight\);/,
      "the narrowed preview must be what is passed",
    );
  });
});
