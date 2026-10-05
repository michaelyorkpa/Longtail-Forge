import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's `workspaceType` scalar, read by `0.33.33.38.4.4.4.2`.
 *
 * **The server closes this vocabulary, and this suite proves the two agree.** The column is open
 * text, but `GET /api/settings` returns through `normalizeSettings`, which runs the shared
 * `normalizeWorkspaceType` - trim, lowercase, and anything outside `WORKSPACE_TYPES` becomes
 * `"business"`. Every value that normaliser can emit is accepted here, asserted by running it
 * rather than assumed. So the browser reader is not second-guessing the server's vocabulary; it
 * is establishing that the body is the settings response at all, which is what the `unknown` from
 * `getJson` actually leaves open.
 *
 * **The same column reaches the browser twice with two different promises**, and that is not an
 * inconsistency: `workspaceToAppValue` copies `workspace_type` raw and never reaches the
 * normaliser, which is why `BrowserAssignableWorkspace.workspaceType` is `string`.
 *
 * **The behaviour changed for malformed input.** The call site previously ran a page-local
 * defaulting normaliser that answered `"business"` for every value it did not recognise. The page
 * now refuses the bootstrap. A well-formed settings response cannot trigger that refusal - only a
 * body that is not the settings response can - but it is a tightening and is named as one.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const userAdminSource = read("public/js/user-admin.js");
const contractsSource = read("src/types/browser-contracts.d.ts");
const schemaSource = read("src/db/schema/current.sql");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/** Lift the shipped reader with the predicate it calls. */
function liftReader() {
  return new Function([
    slice(userAdminSource, "function isBootstrapRecord(value) {"),
    slice(userAdminSource, "function readWorkspaceType(body) {"),
    "  return readWorkspaceType;",
  ].join("\n"))();
}

/** Lift the server-side normaliser the settings response returns through. */
function liftServerNormalizer() {
  const workspacesSource = read("src/utils/workspaces.js");
  const at = workspacesSource.indexOf("function normalizeWorkspaceType(value) {");
  assert.notEqual(at, -1, "the server normaliser must exist");
  return new Function([
    workspacesSource.slice(0, workspacesSource.indexOf("\n", workspacesSource.indexOf("const DEFAULT_WORKSPACE_TYPE"))),
    workspacesSource.slice(at, workspacesSource.indexOf("\n}\n", at) + 3),
    "return normalizeWorkspaceType;",
  ].join("\n"))();
}

describe("the producer closes this vocabulary, and the reader agrees with it", () => {
  it("returns the settings body through the shared normaliser", () => {
    const normalizers = read("src/utils/normalizers.js");
    assert.match(normalizers, /import \{ getWorkspaceCapabilities, normalizeWorkspaceType \} from "\.\/workspaces\.js";/);
    assert.match(normalizers,
      /const workspaceType = normalizeWorkspaceType\(settings\?\.workspaceType \|\| settings\?\.workspace_type\);/,
      "normalizeSettings closes the value before it reaches the wire");
    // Pinned to the site that carries the column, not merely to the function name: this file has
    // a second `normalizeSettings` call for the no-row fallback, and matching that one would
    // let the real path stop normalising unnoticed.
    assert.match(read("src/repositories/settings.repo.js"),
      /return normalizeSettings\(\{\s*\n\s*workspaceName: booleanRow\.workspace_name,\s*\n\s*workspaceType: booleanRow\.workspace_type,/,
      "the row's raw column value is what the repository hands to the normaliser");
    assert.match(read("src/services/settings.service.js"), /async function readInternal\(session\) \{/,
      "which is what GET /api/settings answers");
  });

  it("accepts every value that normaliser can emit, proved by running it", () => {
    const normalizeWorkspaceType = liftServerNormalizer();
    const readWorkspaceType = liftReader();
    const hostile = [undefined, null, "", 7, true, {}, [], "BUSINESS", "  Family  ", "nonprofit",
      "personal", "family", "PERSONAL"];
    const emitted = new Set(hostile.map((value) => normalizeWorkspaceType(value)));
    assert.deepEqual([...emitted].sort(), ["business", "family", "personal"],
      "the normaliser's whole range is the three words");
    for (const workspaceType of emitted) {
      assert.equal(readWorkspaceType({ workspaceType }), workspaceType,
        "the browser reader accepts everything the server can send");
    }
  });

  it("agrees with the server's vocabulary word for word", () => {
    assert.match(read("src/utils/workspaces.js"),
      /const WORKSPACE_TYPES = new Set\(\["business", "personal", "family"\]\);/);
    assert.match(contractsSource, /export type BrowserWorkspaceType = "business" \| "family" \| "personal";/,
      "the same three, so a fourth added on the server is a compile error here, not a silent default");
  });

  it("leaves the other producer of the same column open, because it skips the normaliser", () => {
    // `workspaceToAppValue` copies `workspace.workspace_type` straight out. Same column, no
    // normaliser, so `BrowserAssignableWorkspace.workspaceType` is `string` and stays that way.
    assert.match(read("src/services/users.service.js"), /workspaceType: workspace\.workspace_type,/);
    const at = contractsSource.indexOf("export interface BrowserAssignableWorkspace {");
    assert.match(contractsSource.slice(at, contractsSource.indexOf("\n}\n", at)), /workspaceType: string;/,
      "that boundary validates nothing, so it promises nothing");
    assert.match(schemaSource, /workspace_type TEXT NOT NULL DEFAULT 'business',/,
      "the column itself is open text, which is what makes the two promises differ");
  });
});

describe("the reader validates every way the value can be wrong", () => {
  it("accepts exactly the three the vocabulary admits", () => {
    const readWorkspaceType = liftReader();
    for (const workspaceType of ["business", "family", "personal"]) {
      assert.equal(readWorkspaceType({ workspaceType }), workspaceType);
    }
  });

  it("refuses a body that is not a record", () => {
    const readWorkspaceType = liftReader();
    for (const body of [null, undefined, "business", 7, [], [{ workspaceType: "business" }]]) {
      assert.equal(readWorkspaceType(body), null, String(body) + " is not a settings response");
    }
  });

  it("refuses an absent value rather than defaulting it", () => {
    const readWorkspaceType = liftReader();
    assert.equal(readWorkspaceType({}), null);
    assert.equal(readWorkspaceType({ workspaceType: undefined }), null);
    assert.equal(readWorkspaceType({ workspaceType: null }), null);
  });

  it("refuses a non-text value", () => {
    const readWorkspaceType = liftReader();
    for (const workspaceType of [7, true, {}, ["business"], new String("business")]) {
      assert.equal(readWorkspaceType({ workspaceType }), null,
        "a value that is not one of the three literals is refused whatever its type");
    }
  });

  it("refuses a word outside the vocabulary, including a plausible future type", () => {
    const readWorkspaceType = liftReader();
    for (const workspaceType of ["nonprofit", "education", "Business", "BUSINESS", "business ", ""]) {
      assert.equal(readWorkspaceType({ workspaceType }), null,
        JSON.stringify(workspaceType) + " is not one of the three");
    }
  });

  it("reads the value off the response's own member, not an alias", () => {
    // The service emits `workspaceType`. `workspace_type` is a PUT-submission spelling the read
    // response does not carry, so accepting it would be inventing a producer.
    const readWorkspaceType = liftReader();
    assert.equal(readWorkspaceType({ workspace_type: "personal" }), null);
    assert.equal(readWorkspaceType({ workspaceType: "personal", workspace_type: "family" }), "personal");
  });
});

describe("the tightening is real and is not disguised", () => {
  it("removed the total defaulting normaliser rather than leaving it beside the reader", () => {
    // It answered `"business"` for everything it did not recognise. Left in place with no caller,
    // it would sit there looking like validation.
    assert.ok(!/function normalizeWorkspaceType/.test(userAdminSource),
      "the defaulting normaliser is gone");
    assert.ok(!/\["business", "personal", "family"\]\.includes/.test(userAdminSource),
      "and so is its membership test, which never refused anything");
  });

  it("changed the answer for exactly the inputs the old normaliser absorbed", () => {
    const readWorkspaceType = liftReader();
    const normalizeWorkspaceType = liftServerNormalizer();
    // The page-local normaliser as it stood, reconstructed to state the difference rather than
    // assert it.
    /** @param {unknown} value */
    const previous = (value) => (["business", "personal", "family"].includes(/** @type {string} */ (value))
      ? value
      : "business");
    for (const workspaceType of [undefined, null, 7, "nonprofit", ""]) {
      assert.equal(previous(workspaceType), "business", "the page used to display this as business");
      assert.equal(readWorkspaceType({ workspaceType }), null, "and now refuses to display it at all");
      assert.notEqual(normalizeWorkspaceType(workspaceType), workspaceType,
        "and the settings response cannot carry this value, so the refusal needs a broken body");
    }
    for (const workspaceType of ["business", "family", "personal"]) {
      assert.equal(readWorkspaceType({ workspaceType }), previous(workspaceType),
        "a value the server can actually send is answered identically");
    }
  });

  it("routes the refusal through the load-error path the page already has", () => {
    const body = slice(userAdminSource, "async function loadUsers() {");
    assert.match(body, /const workspaceType = readWorkspaceType\(settingsBody\);/);
    assert.match(body, /if \(!clientScopes \|\| !assignableWorkspaces \|\| !resourceCatalog \|\| !workspaceType\) \{/,
      "it joins the bootstrap guard the three collection readers already share");
    assert.match(body, /throw new Error\("The user administration bootstrap could not be read\."\);/);
    assert.match(body, /activeWorkspaceType = workspaceType;/,
      "and the slot is only ever assigned a value that passed the guard");
    assert.ok(!/normalizeWorkspaceType/.test(body), "no defaulting survives at the call site");
  });

  it("keeps that guard reaching the existing catch, not a new failure surface", () => {
    const body = slice(userAdminSource, "async function loadUsers() {");
    assert.match(body, /setUserAdminStatus\(requireErrors\(\)\.caughtMessage\(error, "Users could not be loaded\."\), true\);/,
      "the throw lands in the status line the page already shows for a failed load");
    assert.match(body, /if \(requireErrors\(\)\.caughtStatus\(error\) === 401\) \{/,
      "and the session-expiry branch still precedes it");
  });
});

describe("the scalar is typed without importing the whole response", () => {
  it("annotates the slot to the closed type", () => {
    assert.match(userAdminSource, /@type \{BrowserWorkspaceType\} \*\/\s*\n\s*let activeWorkspaceType = "business";/,
      "the page slot holds the vocabulary, not open text");
  });

  it("declares the reader's answer as nullable, because refusal is a real outcome", () => {
    const at = userAdminSource.indexOf("function readWorkspaceType(body) {");
    assert.notEqual(at, -1);
    assert.match(userAdminSource.slice(at - 1100, at), /@returns \{BrowserWorkspaceType \| null\}/);
  });

  it("borrows the existing closed type rather than declaring a second vocabulary", () => {
    assert.match(contractsSource, /export type BrowserWorkspaceType = "business" \| "family" \| "personal";/);
    assert.match(userAdminSource,
      /@typedef \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserWorkspaceType\} BrowserWorkspaceType/);
  });

  it("declares no settings response interface, because one scalar is what this reads", () => {
    // A complete `GET /api/settings` reader is a separate obligation with its own owner. Declaring
    // one here would promise validation of `enabledModules`, `permissionIds`,
    // `workspaceCapabilities` and `workspaceDeletion` that this child does not perform.
    assert.ok(!/BrowserSettingsResponse/.test(contractsSource + userAdminSource),
      "no whole-response contract was invented for a scalar");
    const body = slice(userAdminSource, "function readWorkspaceType(body) {");
    for (const unread of ["enabledModules", "permissionIds", "workspaceCapabilities", "workspaceDeletion"]) {
      assert.ok(!body.includes(unread), unread + " is not read here, so it is not claimed here");
    }
  });
});

describe("what this child was told not to reach for", () => {
  it("added no settings page script and no namespace method", () => {
    assert.ok(!/settings-host/.test(userAdminSource), "User Admin still loads no settings host");
    assert.ok(!/settings-host/.test(read("views/protected/user-admin.html")),
      "and the page shell did not gain one");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(userAdminSource),
      "the reader is local; it publishes nothing onto the namespace");
  });

  it("read the live response rather than a cached workspace context", () => {
    const body = slice(userAdminSource, "async function loadUsers() {");
    assert.ok(!/workspaceContext/.test(body),
      "the stored context can be stale; this bootstrap asks the server");
    assert.match(body, /requireApi\(\)\.getJson\("\/api\/settings", \{ cache: "no-store" \}\),/,
      "and asks it uncached, exactly as before");
  });

  it("used no cast, suppression or assertion to obtain the closed type", () => {
    const body = slice(userAdminSource, "function readWorkspaceType(body) {");
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(body));
    assert.ok(!/\/\*\* @type \{/.test(body), "the narrowing is the comparison, not an assertion");
    assert.ok(!/\bas\s+\w/.test(body));
    assert.ok(!/:\s*any\b/.test(body));
  });
});
