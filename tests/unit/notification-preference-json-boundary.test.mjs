import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const surface = read("public/js/shared/notification-preferences.js");
const page = read("public/js/notifications.js");
const userSettings = read("public/js/user-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * One function body sliced at the indentation it is written at.
 * @param {string} source @param {string} indentedOpener @param {number} indent
 */
function readerBody(source, indentedOpener, indent) {
  const pad = " ".repeat(indent);
  const start = source.indexOf(pad + indentedOpener);
  assert.notEqual(start, -1, indentedOpener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, indentedOpener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/**
 * The catalogue reconstruction exactly as `loadPreferences` performs it.
 * @returns {string}
 */
function shippedCatalogReconstruction() {
  const load = readerBody(surface, "async function loadPreferences() {", 2);
  const start = load.indexOf("    const catalog = ");
  assert.notEqual(start, -1, "the catalogue reconstruction must begin at its guard");
  const end = load.indexOf("\n    };", start);
  assert.notEqual(end, -1, "and must end at its returned object");
  return load.slice(start, end + "\n    };".length);
}

/** The shipped catalogue normalisers, instantiated from the surface's own source. */
function shippedNormalizers() {
  const table = surface.indexOf("const GROUPING_MODES = Object.freeze([");
  assert.notEqual(table, -1, "the grouping vocabulary must exist");
  const eventText = surface.indexOf("const EVENT_TEXT_MEMBERS = Object.freeze([");
  const eventBoolean = surface.indexOf("const EVENT_BOOLEAN_MEMBERS = Object.freeze([");
  assert.notEqual(eventText, -1, "the event text members must exist");
  assert.notEqual(eventBoolean, -1, "the event boolean members must exist");
  return new Function([
    surface.slice(table, surface.indexOf("]);", table) + 3),
    surface.slice(eventText, surface.indexOf("]);", eventText) + 3),
    surface.slice(eventBoolean, surface.indexOf("]);", eventBoolean) + 3),
    readerBody(surface, "function isResponseRecord(value) {", 2),
    readerBody(surface, "function isEventPreference(value) {", 2),
    readerBody(surface, "function normalizeGroupingMode(value) {", 2),
    readerBody(surface, "function normalizeGroupingPreferences(groupingPreferences = {}) {", 2),
    // The catalogue reconstruction sliced out of `loadPreferences` itself. Retyping it here would
    // have made every behavioural assertion below a test of this file rather than of the surface -
    // which is exactly what the first draft did, and six breaks walked straight through it.
    "function buildCatalog(body) {\n" + shippedCatalogReconstruction() + "\n}",
    "return { buildCatalog, normalizeGroupingPreferences, isEventPreference };",
  ].join("\n"))();
}

const { buildCatalog, normalizeGroupingPreferences } = shippedNormalizers();

/** @param {string} name */
function readTable(name) {
  const at = surface.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  return [...surface.slice(at, surface.indexOf("]);", at)).matchAll(/"([A-Za-z_]+)"/g)].map((entry) => entry[1]);
}

/**
 * One event preference as the producer merges one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function eventPreference(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = {};
  for (const member of readTable("EVENT_TEXT_MEMBERS")) record[member] = member === "id" ? "task.assigned" : "value";
  for (const member of readTable("EVENT_BOOLEAN_MEMBERS")) record[member] = true;
  return { ...record, ...overrides };
}

describe("the parsed body is unknown rather than any", () => {
  it("declares the boundary", () => {
    const parser = readerBody(surface, "async function parseJsonResponse(response) {", 2);
    assert.match(surface, /\* @returns \{Promise<unknown>\}\n {3}\*\/\n {2}async function parseJsonResponse\(response\) \{/,
      "parseJsonResponse must declare Promise<unknown>, because JSON.parse returns any");
    assert.match(parser, /return JSON\.parse\(text\);/, "and it still parses the same way");
  });

  it("still answers the same four shapes", () => {
    const parser = readerBody(surface, "async function parseJsonResponse(response) {", 2);
    assert.match(parser, /if \(!text\) \{\n\s+return null;\n\s+\}/, "an empty body is null");
    assert.match(parser, /return response\.ok \? null : \{ error: text \};/,
      "and unparsable text is null on success and an error envelope on failure");
  });

  it("lets no raw JSON.parse escape the module", () => {
    const parses = [...surface.matchAll(/JSON\.parse\(/g)];
    assert.equal(parses.length, 1, "there is one JSON.parse in this module");
    const parser = readerBody(surface, "async function parseJsonResponse(response) {", 2);
    assert.ok(parser.includes("JSON.parse("), "and it is inside the boundary that declares unknown");
    for (const caller of ["loadPreferences", "saveUserPreferences", "saveWorkspaceDefaults"]) {
      const body = readerBody(surface, "async function " + caller + "(", 2);
      assert.match(body, /const body = await parseJsonResponse\(response\);/,
        caller + " reads its body through the boundary");
      assert.doesNotMatch(body, /JSON\.parse\(/, "and never parses one itself");
    }
  });

  it("casts nothing over the raw body", () => {
    const load = readerBody(surface, "async function loadPreferences() {", 2);
    assert.doesNotMatch(load, /@type \{[^}]*\} \*\/ \(body\)/, "a cast over the body proves nothing");
    assert.doesNotMatch(surface, /BrowserNotificationPreferenceCatalog\} \*\/ \(/,
      "and the catalogue is reconstructed rather than asserted");
    assert.match(load, /const catalog = isResponseRecord\(body\) \? body : \{\};/,
      "the body is checked before any member is read off it");
    // Pinned by source: a guard that admits null makes the reconstruction throw rather than
    // refuse, so no fixture can name that failure.
    assert.match(readerBody(surface, "function isResponseRecord(value) {", 2),
      /typeof value === "object" && value !== null && !Array\.isArray\(value\)/,
      "the record guard is the estate's plain-object test");
  });
});

describe("0.33.33.38.4.10's settled behaviour is preserved exactly", () => {
  it("reconstructs a valid catalogue", () => {
    const catalog = buildCatalog({
      canManageWorkspaceDefaults: true,
      events: [eventPreference()],
      groupingPreferences: { groupingMode: "record_type" },
    });
    assert.equal(catalog.canManageWorkspaceDefaults, true, "the flag comes through");
    assert.equal(catalog.events.length, 1, "and the event preference");
    assert.deepEqual(catalog.groupingPreferences, { groupingMode: "record_type" }, "and the grouping mode");
  });

  it("drops a malformed event rather than refusing the catalogue", () => {
    const catalog = buildCatalog({ events: [eventPreference(), { id: "task.assigned" }, eventPreference({ id: "task.due" })] });
    assert.equal(catalog.events.length, 2,
      "element filtering is 0.33.33.38.4.10's deliberate choice for a configurable picker");
    assert.deepEqual(catalog.events.map((/** @type {{id: string}} */ entry) => entry.id), ["task.assigned", "task.due"],
      "and the usable preferences survive");
    const load = readerBody(surface, "async function loadPreferences() {", 2);
    assert.match(load, /catalog\.events\.filter\(isEventPreference\)/, "which is what the filter says");
  });

  it("turns a missing or non-array events member into an empty list", () => {
    for (const events of [undefined, null, "", 7, {}, "events"]) {
      const catalog = buildCatalog({ events });
      assert.deepEqual(catalog.events, [], JSON.stringify(events ?? String(events)) + " becomes an empty list");
    }
    assert.deepEqual(buildCatalog({}).events, [], "and so does a body with no events member at all");
  });

  it("sets canManageWorkspaceDefaults only for the literal true", () => {
    for (const value of ["true", 1, {}, "yes", null, undefined]) {
      assert.equal(buildCatalog({ canManageWorkspaceDefaults: value }).canManageWorkspaceDefaults, false,
        JSON.stringify(value ?? String(value)) + " does not grant workspace defaults");
    }
    assert.equal(buildCatalog({ canManageWorkspaceDefaults: true }).canManageWorkspaceDefaults, true,
      "and the literal does");
  });

  it("falls back to client_project for a malformed grouping preference", () => {
    for (const value of [undefined, null, "", 7, [], { groupingMode: "invented" }, { groupingMode: 7 }, "record_type"]) {
      assert.deepEqual(normalizeGroupingPreferences(value), { groupingMode: "client_project" },
        JSON.stringify(value ?? String(value)) + " falls back to the default grouping");
    }
    // Every non-record fixture above also lacks the member, so `|| {}` behaves identically to the
    // record guard on all of them. An array carrying one is what makes the guard load-bearing.
    assert.deepEqual(normalizeGroupingPreferences(Object.assign([], { groupingMode: "record_type" })),
      { groupingMode: "client_project" },
      "an array is not a grouping preference even when it carries the member");
    for (const mode of readTable("GROUPING_MODES")) {
      assert.deepEqual(normalizeGroupingPreferences({ groupingMode: mode }), { groupingMode: mode },
        mode + " is a grouping mode this surface accepts");
      assert.deepEqual(normalizeGroupingPreferences({ grouping_mode: mode }), { groupingMode: mode },
        "and so is its snake_case spelling");
    }
  });

  it("closes the grouping vocabulary to the type the estate already declares", () => {
    const declared = /export type BrowserNotificationGroupingMode = (.+);/.exec(contracts);
    assert.ok(declared, "the grouping mode type must be declared");
    const fromContract = declared[1].split("|").map((entry) => entry.trim().replace(/"/g, ""));
    assert.deepEqual([...readTable("GROUPING_MODES")].sort(), [...fromContract].sort(),
      "the surface's vocabulary must be exactly what the contract declares");
    assert.ok(!readTable("GROUPING_MODES").includes("invented"), "and nothing else");
  });

  it("still throws the existing API error on a non-OK response, from an unknown body", () => {
    for (const caller of ["loadPreferences", "saveUserPreferences", "saveWorkspaceDefaults"]) {
      const body = readerBody(surface, "async function " + caller + "(", 2);
      assert.match(body, /if \(!response\.ok\) \{\n\s+throw apiError\(body, "/,
        caller + " throws the existing API error before it reads anything");
    }
    const helper = readerBody(surface, "function apiError(body, fallback, status) {", 2);
    assert.match(helper, /root\.errors\?\.createError\?\.\(body, fallback, status\)/,
      "and the unknown body is handed to the shared error helper unchanged");
  });
});

describe("the save results stay unknown, because nobody reads them", () => {
  it("returns the body without reading it", () => {
    for (const caller of ["saveUserPreferences", "saveWorkspaceDefaults"]) {
      const body = readerBody(surface, "async function " + caller + "(", 2);
      assert.match(body, /return body;/, caller + " returns the parsed body");
      assert.doesNotMatch(body, /body\.|body\?\./, "and never reads a member off it");
      assert.doesNotMatch(body, /isResponseRecord\(body\)/, "and does not validate a catalogue nobody uses");
    }
  });

  it("keeps the published surface at Promise<unknown>", () => {
    const declared = functionBody(contracts, "export interface BrowserNotificationPreferences {", "\n}\n");
    assert.match(declared, /saveUserPreferences\(preferences: unknown, groupingPreferences\?: unknown\): Promise<unknown>;/,
      "the user save stays unknown");
    assert.match(declared, /saveWorkspaceDefaults\(defaults: unknown\): Promise<unknown>;/,
      "and so does the workspace save");
    assert.match(declared, /loadPreferences\(\): Promise<BrowserNotificationPreferenceCatalog>;/,
      "while the load keeps the catalogue 0.33.33.38.4.10 narrowed");
  });

  it("proves the callers still ignore the save results", () => {
    // Named at their exact spelling rather than matched loosely, so the positive half of this
    // claim cannot pass on a call site that no longer exists.
    const callSites = [
      { source: page, call: "await preferenceHelper.saveUserPreferences(preferences);" },
      { source: page, call: "await preferenceHelper.saveWorkspaceDefaults(defaults);" },
      { source: userSettings, call: "await notificationPreferences.saveUserPreferences(preferences, groupingPreferences);" },
    ];
    for (const source of [page, userSettings]) {
      assert.doesNotMatch(source, /(?:const|let|var) [a-zA-Z]+ = await [a-zA-Z.]*save(?:User|Workspace)[A-Za-z]*\(/,
        "and no caller binds a save result - one that starts reading it makes that boundary future work");
      assert.doesNotMatch(source, /await [a-zA-Z.]*save(?:UserPreferences|WorkspaceDefaults)\([^)]*\)\./,
        "nor reads a member straight off it");
    }
    for (const { source, call } of callSites) {
      assert.ok(source.includes(call), "the save call site `" + call + "` must exist");
    }
  });

  it("publishes no save-response contract", () => {
    for (const invented of ["BrowserNotificationPreferenceSaveResult", "BrowserNotificationDefaultsSaveResult"]) {
      assert.ok(!contracts.includes(invented), invented + " would describe a body no caller reads");
    }
    assert.equal((contracts.match(/export interface BrowserNotificationPreferenceCatalog\b/g) || []).length, 1,
      "there is one preference catalogue contract and this child adds none");
  });
});

describe("this child changes only the boundary", () => {
  it("adds no transport and no new surface", () => {
    assert.match(surface, /await fetch\("\/api\/notifications\/preferences", \{ cache: "no-store" \}\)/,
      "the transport is unchanged");
    assert.doesNotMatch(surface, /requireApi\(\)\.getJson\(/, "and is not migrated to BrowserApi");
    assert.ok(!read("views/protected/notifications.html").includes("js/api-client.js"),
      "no api-client delivery is added");
  });

  it("does not touch the request payloads", () => {
    const save = readerBody(surface, "async function saveUserPreferences(preferences, groupingPreferences = null) {", 2);
    assert.match(save, /body: JSON\.stringify\(\{\n\s+preferences,\n\s+\.\.\.\(groupingPreferences \? \{ groupingPreferences \} : \{\}\),\n\s+\}\)/,
      "the user save payload is unchanged");
    const defaults = readerBody(surface, "async function saveWorkspaceDefaults(defaults) {", 2);
    assert.match(defaults, /body: JSON\.stringify\(\{ defaults \}\)/, "and so is the workspace one");
  });

  it("keeps the event predicate that 0.33.33.38.4.10 published", () => {
    const predicate = readerBody(surface, "function isEventPreference(value) {", 2);
    assert.match(predicate, /EVENT_TEXT_MEMBERS\.every\(\(member\) => typeof value\[member\] === "string"\)/,
      "the text members are unchanged");
    assert.match(predicate, /EVENT_BOOLEAN_MEMBERS\.every\(\(member\) => typeof value\[member\] === "boolean"\)/,
      "and so are the booleans");
    assert.match(predicate, /value\.id !== ""/, "and the non-empty identity");
  });
});
