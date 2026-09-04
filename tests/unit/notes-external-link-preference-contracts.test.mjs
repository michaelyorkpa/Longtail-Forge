import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/notes.js");
const service = read("src/services/users.service.js");
const routes = read("src/routes/users.routes.js");
const normalizers = read("src/utils/normalizers.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * The shipped scalar reader, instantiated from the page's own source.
 *
 * The reader under test is the one the browser runs. Retyping it here would prove that a copy
 * in this file behaves, which is not the claim.
 */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = page.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return page.slice(start, page.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    slice("  function isResponseRecord(value) {"),
    slice("  function readOpenExternalLinksNewTab(body) {"),
    "return { readOpenExternalLinksNewTab };",
  ].join("\n"))();
}

const { readOpenExternalLinksNewTab } = shippedReader();

/** A body shaped the way `usersService.readSettings` answers one. */
function settingsBody(overrides = {}) {
  return {
    username: "person",
    displayName: "Person",
    altEmail: null,
    timezone: "UTC",
    themeMode: "auto",
    themeAutoSource: "system",
    preferredLoginLanding: "workbench",
    preferredWorkspaceSwitchLanding: "workbench",
    preferredCalendarView: null,
    openExternalLinksNewTab: false,
    canEnterAccountExportRecovery: false,
    workspaceCreation: { installMode: "saas", availableTypes: [] },
    activeWorkspaceId: "workspace_1",
    workspaces: [],
    ...overrides,
  };
}

describe("the Notes external-link preference reads one producer-owned boolean", () => {
  it("accepts the two values the producer can send", () => {
    assert.equal(readOpenExternalLinksNewTab(settingsBody({ openExternalLinksNewTab: true })), true,
      "a valid true is the enabled preference");
    assert.equal(readOpenExternalLinksNewTab(settingsBody({ openExternalLinksNewTab: false })), false,
      "and a valid false is the disabled one, not an absence");
  });

  it("refuses a member that is not a boolean, whatever it would coerce to", () => {
    for (const value of ["false", "true", 0, 1, null, undefined, {}, [], "yes"]) {
      assert.equal(readOpenExternalLinksNewTab(settingsBody({ openExternalLinksNewTab: value })), null,
        JSON.stringify(value ?? String(value)) + " is not a preference this producer states");
    }
  });

  it("refuses a body with no such member at all", () => {
    const body = Object.fromEntries(Object.entries(settingsBody())
      .filter(([key]) => key !== "openExternalLinksNewTab"));
    assert.ok(!Object.hasOwn(body, "openExternalLinksNewTab"), "the fixture must genuinely lack the member");
    assert.equal(readOpenExternalLinksNewTab(body), null, "a missing member is not a false preference");
  });

  it("refuses a body that is not a response record", () => {
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readOpenExternalLinksNewTab(body), null, String(body) + " is not a settings body");
    }
    // An array with no such member is refused by the member check whether or not the record
    // check is doing anything, so the array claim needs a fixture that carries the member.
    assert.equal(readOpenExternalLinksNewTab(Object.assign([], { openExternalLinksNewTab: true })), null,
      "an array is not a settings body even when it carries the member");
  });

  it("answers the boolean rather than the body", () => {
    const reader = functionBody(page, "  function readOpenExternalLinksNewTab(body) {", "\n  }\n");
    assert.match(reader, /typeof body\.openExternalLinksNewTab === "boolean"/,
      "the member must be proved to be a boolean before either of its values means anything");
    assert.doesNotMatch(reader, /openExternalLinksNewTab === true/,
      "=== true is the raw read this child replaced; it cannot come back inside the reader");
    assert.doesNotMatch(reader, /BrowserUserSettings/,
      "validating one member does not entitle this reader to claim the whole User Settings body");
    for (const other of ["timezone", "workspaces", "themeMode", "canEnterAccountExportRecovery"]) {
      assert.ok(!reader.includes(other), other + " belongs to the User Settings page, not to this reader");
    }
  });

  it("uses the page's own record predicate rather than a cast over the raw body", () => {
    const reader = functionBody(page, "  function readOpenExternalLinksNewTab(body) {", "\n  }\n");
    assert.match(reader, /if \(!isResponseRecord\(body\)\) \{/, "the body is checked, not asserted");
    assert.doesNotMatch(reader, /@type \{[^}]*\} \*\/ \(body\)/, "a cast over a raw body proves nothing");
  });
});

describe("the Notes load path stores nothing the producer did not state", () => {
  const load = functionBody(page, "  async function loadMarkdownRenderingPreference() {", "\n  }\n");

  it("no longer performs the raw read", () => {
    assert.doesNotMatch(page, /state\.openExternalLinksNewTab = settings\.openExternalLinksNewTab === true;/,
      "the raw read must be gone from the whole page, not merely from this function");
    assert.doesNotMatch(load, /settings\.openExternalLinksNewTab/, "and the load path must not reintroduce it");
  });

  it("refuses before it writes anything", () => {
    const refusal = load.indexOf("if (preference === null) {");
    assert.notEqual(refusal, -1, "the load must refuse an unreadable preference");
    const assignment = load.indexOf("state.openExternalLinksNewTab = preference;");
    assert.notEqual(assignment, -1, "and it must assign the vouched-for value");
    assert.ok(refusal < assignment, "the refusal has to come before the assignment");
    const stored = load.indexOf("storeOpenExternalLinksPreference(");
    assert.notEqual(stored, -1, "the load must persist the preference it accepted");
    assert.ok(refusal < stored, "and refuse before it persists anything");
    const loaded = load.indexOf("state.settingsLoaded = true;");
    assert.notEqual(loaded, -1, "the load must record a successful read");
    assert.ok(refusal < loaded, "and refuse before it claims the settings loaded");
  });

  it("routes the refusal into the page's existing catch rather than a new failure surface", () => {
    assert.match(load, /\} catch \{\n\s+state\.settingsLoaded = false;\n\s+\}/,
      "a malformed body must land in the catch the page already had");
    assert.doesNotMatch(load, /alert\(|window\.confirm|setStatus\(/, "and add no new failure surface");
    assert.equal((load.match(/state\.settingsLoaded = false;/g) || []).length, 1,
      "there is one failure outcome, not a second one invented for malformed data");
  });

  it("does not write a fabricated false over the viewer's cached preference", () => {
    const stored = load.indexOf("storeOpenExternalLinksPreference(state.openExternalLinksNewTab);");
    assert.notEqual(stored, -1, "the accepted preference is persisted");
    const catchAt = load.indexOf("} catch {");
    assert.notEqual(catchAt, -1, "the catch exists");
    assert.ok(stored < catchAt, "and the only write to storage sits inside the try, above the catch");
    assert.doesNotMatch(load.slice(catchAt), /storeOpenExternalLinksPreference/,
      "the failure path must not persist a preference the server never stated");
  });

  it("keeps the cached preference the page started with when the read fails", () => {
    assert.match(page, /openExternalLinksNewTab: readStoredOpenExternalLinksPreference\(\),/,
      "the state slot is seeded from the cache");
    const catchAt = load.indexOf("} catch {");
    assert.doesNotMatch(load.slice(catchAt), /state\.openExternalLinksNewTab/,
      "and the failure path must leave that seeded value exactly where it was");
  });
});

describe("the external-link security behaviour this child must not disturb", () => {
  const apply = functionBody(page, "  function applyExternalMarkdownLinkPreference(container) {", "\n  }\n");

  it("still pairs the new tab with noopener noreferrer", () => {
    const target = apply.indexOf('anchor.setAttribute("target", "_blank");');
    const rel = apply.indexOf('anchor.setAttribute("rel", "noopener noreferrer");');
    assert.notEqual(target, -1, "the enabled preference opens a new tab");
    assert.notEqual(rel, -1, "and protects it");
    assert.ok(target < rel, "in that order, inside the same branch");
    assert.match(apply, /\} else \{\n\s+anchor\.removeAttribute\("target"\);\n\s+anchor\.removeAttribute\("rel"\);/,
      "a valid disabled preference removes both");
  });

  it("still handles only absolute http(s) links", () => {
    assert.match(apply, /if \(!isAbsoluteHttpUrl\(anchor\.getAttribute\("href"\)\)\) \{\n\s+return;/,
      "anything that is not an absolute http(s) URL is skipped");
    const isAbsolute = functionBody(page, '  function isAbsoluteHttpUrl(value = "") {', "\n  }\n");
    assert.match(isAbsolute, /parsed\.protocol === "http:" \|\| parsed\.protocol === "https:"/,
      "and the two protocols are the whole vocabulary");
    assert.doesNotMatch(isAbsolute, /window\.location\.href/, "relative app links are not external links");
  });
});

describe("the producer independently guarantees the member is a boolean", () => {
  it("normalizes the column to a strict boolean before the response is built", () => {
    const normalize = functionBody(normalizers, "function normalizeBooleanPreference(value) {");
    assert.match(normalizers, /openExternalLinksNewTab: normalizeBooleanPreference\(row\.open_external_links_new_tab\)/,
      "the user app value is built through the normalizer");
    const shipped = new Function(normalize + "\n}\nreturn normalizeBooleanPreference;")();
    for (const value of [1, 0, "1", "true", "yes", "on", "no", "", null, undefined, {}, [], NaN]) {
      assert.equal(typeof shipped(value), "boolean",
        JSON.stringify(value ?? String(value)) + " must still leave the normalizer as a boolean");
    }
    assert.equal(shipped(1), true, "and the column's stored 1 is the enabled preference");
    assert.equal(shipped(0), false, "and its stored 0 is the disabled one");
  });

  it("names the member in the reconstruction the route answers", () => {
    const readSettings = functionBody(service, "async function readSettings(session) {");
    assert.match(readSettings, /openExternalLinksNewTab: appUser\.openExternalLinksNewTab,/,
      "readSettings sends the normalized value");
    assert.doesNotMatch(readSettings, /\.\.\.appUser/, "the response is a reconstruction, not a spread of the row");
    assert.match(routes, /usersRoutes\.get\("\/user\/settings"[\s\S]{0,400}response\.status\(200\)\.json\(result\);/,
      "and the GET route answers that reconstruction unchanged");
  });

  it("agrees with the published declaration, which was derived independently", () => {
    const profile = functionBody(contracts, "export interface BrowserUserSettingsProfile {", "\n}\n");
    // Anchored at both ends: this one line already refuses `openExternalLinksNewTab?: boolean`
    // and `openExternalLinksNewTab: boolean | null`, so a separate assertion for each would be
    // a claim no mutation can reach on its own.
    assert.match(profile, /^ {2}openExternalLinksNewTab: boolean;$/m,
      "BrowserUserSettingsProfile must declare the member as a required, non-nullable boolean");
  });
});

describe("this child stays inside its one member", () => {
  it("publishes no new contract for a scalar that is already declared", () => {
    assert.equal((contracts.match(/export interface BrowserUserSettingsProfile\b/g) || []).length, 1,
      "there is one profile contract");
    for (const invented of ["BrowserNotesUserSettings", "BrowserExternalLinkPreference", "BrowserNoteSettingsBody"]) {
      assert.ok(!contracts.includes(invented), invented + " would be a second User Settings model");
    }
  });

  it("adds no delivery dependency to the Notes page", () => {
    const view = read("views/protected/notes.html");
    assert.ok(!view.includes("js/settings-host.js"), "the settings host is not loaded to erase one diagnostic");
    assert.ok(!view.includes("js/user-settings.js"), "and neither is the User Settings page script");
    assert.ok(!page.includes("LongtailForge.userSettings"), "no new namespace surface is claimed either");
  });

  it("leaves the other Notes producers to their own children", () => {
    assert.ok(page.includes("result.revisions || []"),
      "the revisions read is 0.33.33.38.4.12's and is untouched");
  });
});
