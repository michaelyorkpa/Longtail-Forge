// Runtime proof for the User Settings response boundary.
//
// Three producers, not two, and the trace is what found the third: `GET /api/user/settings`,
// `PUT /api/user/settings`, and `DELETE /api/user/workspaces/:workspaceId`. The settings
// catalogue loaded beside the first is a fourth producer that contributes no diagnostic here,
// so this child does not type it.
//
// **GET and PUT do not share a shape, and the difference is the point.** `saveSettings` answers
// ten members; `readSettings` answers those ten plus four the save never sends. The contracts
// express that as an extension rather than as four optional members, and a proof pins both
// routes to the same ten so they cannot drift.
//
// **The closed unions are earned by the check.** `BrowserUserRecord` wrote these same
// vocabularies down in prose and kept `string`, because this estate refuses to close a union
// over a wire field nothing validates. This boundary validates them, so it may close them - the
// same rule, applied where the check now exists. The proof reads that record's own reasoning.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/users.service.js");
const routesSource = readText("src/routes/users.routes.js");
const repositorySource = readText("src/repositories/workspaces.repo.js");
const normalizersSource = readText("src/utils/normalizers.js");
const schemaSource = readText("src/db/schema/current.sql");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/user-settings.js");

const parser = sandbox(page,
  ["isResponseRecord", "isWord", "isUserSettingsProfile", "isUserSettingsWorkspace", "isWorkspaceCreationType",
    "isWorkspaceCreationOptions", "isUserSettingsWorkspaces", "readUserSettingsProfile", "readUserSettings",
    "readWorkspaceRemoval"],
  ["USER_THEME_MODES", "USER_THEME_AUTO_SOURCES", "USER_LANDING_PAGES", "USER_CALENDAR_VIEWS",
    "USER_LANDING_MEMBERS", "USER_PROFILE_TEXT", "USER_WORKSPACE_TEXT", "WORKSPACE_TYPES",
    "WORKSPACE_INSTALL_MODES", "WORKSPACE_CREATION_TYPE_TEXT"]);

const readSettings = extractFunctionBlock(serviceSource, "readSettings");
const saveSettings = extractFunctionBlock(serviceSource, "saveSettings");
const removal = extractFunctionBlock(serviceSource, "removeOwnWorkspaceMembership");
const creationOptions = extractFunctionBlock(serviceSource, "readWorkspaceCreationOptions");
const readForUser = extractFunctionBlock(repositorySource, "readForUser");

const getMembers = literalMembers(readSettings.slice(readSettings.lastIndexOf("return {")), 4);
const putMembers = literalMembers(saveSettings.slice(saveSettings.lastIndexOf("return {")), 4);

describe("the two settings routes against their producers", () => {
  it("answer ten members in common", () => {
    assert.deepEqual(putMembers.slice().sort(),
      ["altEmail", "displayName", "openExternalLinksNewTab", "preferredCalendarView", "preferredLoginLanding",
        "preferredWorkspaceSwitchLanding", "themeAutoSource", "themeMode", "timezone", "username"],
      "saveSettings answers exactly ten members");
    assert.deepEqual(declaredMembers("BrowserUserSettingsProfile").sort(), putMembers.slice().sort(),
      "and the profile contract is exactly those ten");
    for (const member of putMembers) {
      assert.ok(getMembers.includes(member), `readSettings sends ${member} too`);
    }
  });

  it("differ by exactly the four only the read sends", () => {
    const extra = getMembers.filter((member) => !putMembers.includes(member)).sort();
    assert.deepEqual(extra, ["activeWorkspaceId", "canEnterAccountExportRecovery", "workspaceCreation", "workspaces"],
      "readSettings adds four members the save never answers");
    assert.match(declarationSource, /export interface BrowserUserSettings extends BrowserUserSettingsProfile \{/,
      "so the read contract extends the save contract rather than repeating it");
    assert.deepEqual(declaredMembers("BrowserUserSettings").sort(), extra,
      "and names only the difference");
    for (const member of extra) {
      assert.doesNotMatch(declarationBlock("BrowserUserSettingsProfile"), new RegExp(`\\n  ${member}[?:]`),
        `${member} must not appear on the shape the save answers`);
    }
  });

  it("rebuild the same ten through the same normalisers, so they cannot drift", () => {
    assert.match(readSettings, /const appUser = userRowToAppValue\(user\);/, "the read copies them out of the row shaper");
    for (const [member, normalizer] of [
      ["themeMode", "normalizeThemeMode"],
      ["themeAutoSource", "normalizeThemeAutoSource"],
      ["preferredCalendarView", "normalizeCalendarViewPreference"],
      ["openExternalLinksNewTab", "normalizeBooleanPreference"],
    ]) {
      assert.match(saveSettings, new RegExp(`${member} = ${normalizer}\\(payload\\.${member}\\)`),
        `the save rebuilds ${member} through ${normalizer}`);
      assert.match(extractFunctionBlock(normalizersSource, "userRowToAppValue"), new RegExp(`${member}: ${normalizer}\\(`),
        `and the row shaper builds it through ${normalizer} too`);
    }
    for (const member of plain(parser.USER_LANDING_MEMBERS)) {
      assert.match(saveSettings, new RegExp(`normalizeUserLandingPage\\(payload\\.${member}\\)`),
        `the save rebuilds ${member} through the landing normaliser`);
      assert.match(extractFunctionBlock(normalizersSource, "userRowToAppValue"),
        new RegExp(`${member}: normalizeUserLandingPage\\(`), "and so does the row shaper");
    }
  });

  it("set the theme cookies from what they answered", () => {
    for (const route of ['get("/user/settings"', 'put("/user/settings"']) {
      const slice = routesSource.slice(routesSource.indexOf(route));
      assert.match(slice.slice(0, 500), /buildThemeCookie\(result\.themeMode, request\)/,
        `the ${route} route seeds the theme cookie from its own answer`);
      assert.match(slice.slice(0, 500), /buildThemeAutoSourceCookie\(result\.themeAutoSource, request\)/);
    }
  });
});

describe("the closed vocabularies", () => {
  it("are closed here because this boundary checks them, unlike the user record", () => {
    assert.match(declarationSource, /this estate has refused since `userPreferences` to declare a closed union over a wire field\s+\* nothing validates/,
      "the user record states the rule this child is following");
    assert.match(declarationBlock("BrowserUserRecord"), /\n  themeMode: string;/,
      "and left the same value open, because nothing checked it there");
    assert.match(declarationDoc("BrowserUserThemeMode"), /the difference is\s+\* the check/,
      "this contract records why it may close it");
    assert.match(declarationSource, /export type BrowserUserThemeMode = "auto" \| "dark" \| "light";/);
  });

  it("match the normalisers word for word", () => {
    for (const [name, normalizer, table] of [
      ["BrowserUserThemeMode", "normalizeThemeMode", "USER_THEME_MODES"],
      ["BrowserUserLandingPage", "normalizeUserLandingPage", "USER_LANDING_PAGES"],
      ["BrowserUserCalendarView", "normalizeCalendarViewPreference", "USER_CALENDAR_VIEWS"],
    ]) {
      const words = normalizerWords(normalizer);
      assert.deepEqual(unionLiterals(name), words, `${name} is the vocabulary ${normalizer} answers`);
      assert.deepEqual(plain(parser[table]).slice().sort(), words,
        `and the runtime table is pinned to the normaliser rather than to itself`);
    }
  });

  it("declares the auto source a single literal because the normaliser answers one word", () => {
    assert.match(extractFunctionBlock(normalizersSource, "normalizeThemeAutoSource"),
      /return value === "system" \? "system" : "system";/,
      "every path answers the same word, fallback included");
    assert.deepEqual(unionLiterals("BrowserUserThemeAutoSource"), ["system"],
      "so the union is that one word and not a choice");
    assert.deepEqual(plain(parser.USER_THEME_AUTO_SOURCES), ["system"],
      "and the runtime table is that one word too");
    assert.equal(parser.isUserSettingsProfile({ ...profile(), themeAutoSource: "manual" }), false,
      "a second source is not something this producer can send");
  });

  it("refuses a word outside each vocabulary", () => {
    assert.equal(parser.isUserSettingsProfile(profile()), true);
    assert.equal(parser.isUserSettingsProfile({ ...profile(), themeMode: "midnight" }), false, "an unknown theme mode");
    assert.equal(parser.isUserSettingsProfile({ ...profile(), preferredLoginLanding: "reports" }), false, "an unknown landing");
    assert.equal(parser.isUserSettingsProfile({ ...profile(), preferredWorkspaceSwitchLanding: "reports" }), false);
    assert.equal(parser.isUserSettingsProfile({ ...profile(), preferredCalendarView: "year" }), false, "an unknown span");
    assert.equal(parser.isUserSettingsProfile({ ...profile(), preferredCalendarView: null }), true,
      "though no preference at all is a real answer");
  });
});

describe("the profile members", () => {
  it("follows the shaper's own nullability", () => {
    assert.equal(parser.isUserSettingsProfile({ ...profile(), altEmail: null }), true,
      "the alternate address is the one text the shaper genuinely nulls");
    assert.match(extractFunctionBlock(normalizersSource, "normalizeOptionalEmail"), /return email \|\| null;/);
    assert.equal(parser.isUserSettingsProfile({ ...profile(), altEmail: 0 }), false,
      "but it is still checked as text when it is present");
    for (const member of plain(parser.USER_PROFILE_TEXT)) {
      assert.equal(parser.isUserSettingsProfile({ ...profile(), [member]: null }), false, `${member} is never null`);
      assert.equal(parser.isUserSettingsProfile(omit(profile(), member)), false, `${member} is always sent`);
    }
    assert.equal(parser.isUserSettingsProfile({ ...profile(), username: "" }), false,
      "an account with no name could not have been read back");
    assert.equal(parser.isUserSettingsProfile({ ...profile(), openExternalLinksNewTab: "yes" }), false,
      "the preference normaliser answers a boolean, so a word is not what arrives");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual([...plain(parser.USER_PROFILE_TEXT), ...plain(parser.USER_LANDING_MEMBERS),
      "altEmail", "openExternalLinksNewTab", "preferredCalendarView", "themeAutoSource", "themeMode"].sort(),
      declaredMembers("BrowserUserSettingsProfile").sort(),
      "the browser checks every member the profile declares");
    assert.deepEqual(plain(parser.USER_WORKSPACE_TEXT).slice().sort(), declaredMembers("BrowserUserSettingsWorkspace").sort());
    assert.deepEqual([...plain(parser.WORKSPACE_CREATION_TYPE_TEXT), "moduleSettings"].sort(),
      declaredMembers("BrowserWorkspaceCreationType").sort());
  });

  it("is not a user record, and does not pretend to be", () => {
    for (const adminOnly of ["user_id", "userStatus", "protectedUser", "passwordChangeRequired", "workspaceMemberships"]) {
      assert.ok(declaredMembers("BrowserUserRecord").includes(adminOnly), `${adminOnly} is on the administration record`);
      assert.ok(!declaredMembers("BrowserUserSettingsProfile").includes(adminOnly),
        `and must not appear on what an account sees about itself`);
      assert.ok(!getMembers.includes(adminOnly), `because readSettings does not send ${adminOnly}`);
    }
    assert.doesNotMatch(declarationBlock("BrowserUserSettingsProfile"), /password/i,
      "and no credential member may ever appear here");
  });
});

describe("the workspace-creation options", () => {
  it("are the four members the producer builds", () => {
    const built = literalMembers(creationOptions.slice(creationOptions.lastIndexOf("return {")), 4);
    assert.deepEqual(built.slice().sort(), ["availableTypes", "canCreateWorkspaces", "installMode", "workspaceCreationEnabled"]);
    assert.deepEqual(declaredMembers("BrowserWorkspaceCreationOptions").sort(), built.slice().sort());
    assert.deepEqual(unionLiterals("BrowserWorkspaceInstallMode"), ["saas", "self_hosted"]);
    assert.match(creationOptions, /const installMode = configuredInstallMode === "saas" \? "saas" : "self_hosted";/,
      "which is the one comparison that decides it");
    assert.deepEqual(unionLiterals("BrowserWorkspaceType"), ["business", "family", "personal"]);
    assert.match(creationOptions, /\? \["business"\]\s*:\s*\["business", "personal", "family"\];/,
      "and the producer starts from a literal list it only ever filters");
  });

  it("leaves the module settings to the module that declares them", () => {
    assert.match(extractFunctionBlock(serviceSource, "readWorkspaceCreationModuleSettings"), /\.\.\.moduleDefinition,/,
      "the producer spreads each module's own definition");
    assert.match(declarationBlock("BrowserWorkspaceCreationType"), /\n  moduleSettings: unknown\[\];/,
      "so its vocabulary is not this response's to name");
    assert.equal(parser.isWorkspaceCreationType({ ...creationType(), moduleSettings: [{ anything: true }] }), true,
      "and anything a module declared is still a module setting");
    assert.equal(parser.isWorkspaceCreationType({ ...creationType(), moduleSettings: {} }), false,
      "though the container itself is still checked");
  });

  it("validates every creatable type", () => {
    assert.equal(parser.isWorkspaceCreationOptions(creation()), true);
    assert.equal(parser.isWorkspaceCreationOptions({ ...creation(), availableTypes: [] }), true,
      "an empty list is a real answer: creation disabled, unpermitted, or unentitled");
    assert.equal(parser.isWorkspaceCreationOptions({ ...creation(), availableTypes: [{ label: "Business" }] }), false,
      "a partial type is not one");
    assert.equal(parser.isWorkspaceCreationOptions({ ...creation(), availableTypes: [{ ...creationType(), workspaceType: "enterprise" }] }), false,
      "and a kind the producer never offers is not a choice");
    for (const member of ["availableTypes", "canCreateWorkspaces", "installMode", "workspaceCreationEnabled"]) {
      assert.equal(parser.isWorkspaceCreationOptions(omit(creation(), member)), false, `${member} is always built`);
    }
  });
});

describe("the workspaces and the recovery capability", () => {
  it("are the four columns the query selects", () => {
    const selected = [...readForUser.slice(readForUser.indexOf("SELECT"), readForUser.indexOf("FROM user_workspaces"))
      .matchAll(/(\w+)(?: AS (\w+))?,?\s*$/gm)].map((entry) => entry[2] || entry[1]).filter((name) => name !== "SELECT");
    assert.deepEqual(selected.slice().sort(), ["status", "workspace_id", "workspace_name", "workspace_type"],
      "readForUser selects four columns");
    assert.deepEqual(declaredMembers("BrowserUserSettingsWorkspace").sort(), selected.slice().sort(),
      "and the contract is exactly those, snake_case, because they are a row");
    assert.notDeepEqual(declaredMembers("BrowserUserWorkspaceMembership").sort(), selected.slice().sort(),
      "which is a different shape from the administration membership record");
  });

  it("keeps the two row vocabularies open because no column closes them", () => {
    const workspaces = schemaSource.slice(schemaSource.indexOf("CREATE TABLE workspaces ("));
    assert.doesNotMatch(workspaces.slice(0, workspaces.indexOf(");")), /CHECK/, "the workspaces table carries no CHECK");
    assert.match(declarationBlock("BrowserUserSettingsWorkspace"), /\n  status: string;/);
    assert.match(declarationBlock("BrowserUserSettingsWorkspace"), /\n  workspace_type: string;/);
    assert.equal(parser.isUserSettingsWorkspace({ ...workspace(), status: "invited" }), true, "text is text");
    for (const member of plain(parser.USER_WORKSPACE_TEXT)) {
      assert.equal(parser.isUserSettingsWorkspace(omit(workspace(), member)), false, `${member} is always selected`);
    }
  });

  it("reports the recovery permission and can never manufacture it", () => {
    assert.match(readSettings, /canEnterAccountExportRecovery: await permissionsService\.isWorkspaceAdministrator\(session\),/,
      "the server computes it from a permission check");
    assert.match(declarationBlock("BrowserUserSettings"), /\n  canEnterAccountExportRecovery: boolean;/,
      "and the browser reports a boolean");
    assert.match(declarationBlock("BrowserUserSettings"), /The browser reports it and never decides it/);
    assert.equal(parser.readUserSettings({ ...settings(), canEnterAccountExportRecovery: "true" }), null,
      "a word is not a permission result");
    assert.equal(parser.readUserSettings(omit(settings(), "canEnterAccountExportRecovery")), null,
      "and the route sends it on every response");
  });
});

describe("the workspace removal", () => {
  it("has two real answers, and they are told apart by their own shapes", () => {
    assert.match(removal, /return \{\s+accountExportRecovery: true,\s+activeWorkspaceId: null,\s+workspaces: \[\],\s+\};/,
      "the recovery answer is three members with a literal true");
    assert.match(removal, /return \{\s+activeWorkspaceId: session\.workspace_id,\s+workspaces: await workspacesRepository\.readForUser\(session\.user_id\),\s+\};/,
      "and the ordinary answer omits the flag entirely");
    assert.match(declarationBlock("BrowserWorkspaceMembershipResult"), /\n  accountExportRecovery\?: never;/,
      "which is what `?: never` records");
    assert.match(declarationSource, /export type BrowserWorkspaceRemovalResult =\s+\| BrowserAccountExportRecoveryResult\s+\| BrowserWorkspaceMembershipResult;/,
      "so the two are a union rather than one record with optional members");
  });

  it("only reports recovery when the producer actually declared it", () => {
    assert.deepEqual(plain(parser.readWorkspaceRemoval(recovery())), recovery());
    assert.deepEqual(plain(parser.readWorkspaceRemoval(ordinary())), ordinary());
    assert.equal(parser.readWorkspaceRemoval({ ...recovery(), accountExportRecovery: "true" }), null,
      "a truthy word is not the literal the producer writes");
    assert.equal(parser.readWorkspaceRemoval({ ...recovery(), activeWorkspaceId: "w-1" }), null,
      "recovery leaves no active workspace, so a named one contradicts it");
    assert.equal(parser.readWorkspaceRemoval({ ...ordinary(), accountExportRecovery: false }), null,
      "the ordinary answer omits the flag rather than sending it false");
    assert.equal(parser.readWorkspaceRemoval({ ...ordinary(), activeWorkspaceId: null }), null,
      "and it always names the workspace the account is left on");
  });

  it("validates every workspace element on both answers", () => {
    assert.equal(parser.readWorkspaceRemoval({ ...ordinary(), workspaces: [workspace(), { status: "active" }] }), null,
      "an array container alone confers no trust");
    assert.equal(parser.readWorkspaceRemoval(omit(ordinary(), "workspaces")), null);
    assert.equal(parser.readUserSettings({ ...settings(), workspaces: [{ workspace_id: "w-1" }] }), null,
      "and the load response is checked the same way");
  });
});

describe("the readers", () => {
  it("accept each producer's body whole", () => {
    assert.deepEqual(plain(parser.readUserSettings(settings())), settings());
    assert.deepEqual(plain(parser.readUserSettingsProfile(profile())), profile());
  });

  it("refuse a save response the account would write back", () => {
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      assert.equal(parser.readUserSettingsProfile(empty), null);
      assert.equal(parser.readUserSettings(empty), null);
    }
    assert.equal(parser.readUserSettingsProfile({ ...profile(), themeMode: "midnight" }), null,
      "a form repopulated from an unreadable response would be saved back over real preferences");
    assert.match(page, /if \(!saved\) \{\s+throw new Error\("The saved user settings response could not be read\."\);/,
      "so the save takes the error path the page already had");
    assert.match(page, /if \(!settings\) \{\s+throw new Error\("The user settings response could not be read\."\);/);
    assert.match(page, /if \(!removal\) \{\s+throw new Error\("The workspace removal response could not be read\."\);/);
  });

  it("does not accept the save response where the load response is required", () => {
    assert.equal(parser.readUserSettings(profile()), null,
      "the save answers ten members, and the load needs fourteen");
    assert.deepEqual(plain(parser.readUserSettingsProfile(settings())), settings(),
      "though a load response satisfies the save contract, because it extends it");
  });
});

describe("the consumers", () => {
  it("narrow every owned read through the readers", () => {
    const readers = ["isUserSettingsProfile", "isUserSettingsWorkspace", "isWorkspaceCreationType",
      "isWorkspaceCreationOptions", "isUserSettingsWorkspaces", "readUserSettings", "readUserSettingsProfile",
      "readWorkspaceRemoval"];
    const consumers = readers.reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["body.themeMode", "body.themeAutoSource", "body.workspaceCreation", "body.accountExportRecovery",
      "applyThemeMode(body", "applyWorkspaceAccess(body)"]) {
      assert.ok(!consumers.includes(raw), `user-settings.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /applyThemeMode\(settings\.themeMode, settings\.themeAutoSource\);/, "the load applies the narrowed theme");
    assert.match(page, /applyThemeMode\(saved\.themeMode, saved\.themeAutoSource\);/, "and so does the save");
    assert.match(page, /applyWorkspaceCreation\(settings\.workspaceCreation\);/);
    assert.match(page, /if \(removal\.accountExportRecovery\) \{/, "the recovery redirect reads the narrowed union");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
    assert.match(declarationSource, /deleteJson\([^)]*\): Promise<unknown>;/);
  });

  it("leaves the settings catalogue and the notification preferences to their own owners", () => {
    assert.match(page, /getJson\("\/api\/settings\/catalog", \{ cache: "no-store" \}\)/,
      "the catalogue is still read as it was: it is a different producer and contributes no read here");
    assert.match(page, /settingsCatalog = catalog;/, "and still handed to the settings host untouched");
    assert.doesNotMatch(page, /readSettingsCatalog|isSettingsCatalog/, "this child declares no catalogue contract");
    assert.match(page, /requireNotificationPreferences\(\)/,
      "notification preferences keep the surface their own checkpoint published");
    assert.doesNotMatch(declarationBlock("BrowserUserSettings"), /notificationPreferences/,
      "and are not absorbed into this response");
  });

  it("preserves the behaviour a static owner pins", () => {
    assert.match(page, /Leaving \$\{workspace\.workspaceName \|\| "workspace"\}/, "the leaving status copy is unchanged");
    assert.match(page, /"Workspace membership removed\."/);
    assert.match(page, /"Workspace membership was not removed\."/);
    assert.match(page, /window\.location\.assign\("\/login\.html\?accountRecovery=1"\)/, "and the recovery destination");
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

/**
 * The words a normaliser's `includes` guard admits, read from the normaliser rather than from
 * any table this owner also checks.
 * @param {string} name @returns {string[]}
 */
function normalizerWords(name) {
  const block = extractFunctionBlock(normalizersSource, name);
  const match = block.match(/\[([^\]]+)\]\.includes\(/);
  assert.ok(match, `${name} must gate on a literal list`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/** @param {string} name @returns {string} */
function declarationDoc(name) {
  const index = declarationSource.search(new RegExp(`export (?:interface|type) ${name}\\b`));
  assert.ok(index > 0, `${name} must be declared`);
  const opened = declarationSource.lastIndexOf("/**", index);
  assert.ok(opened > 0 && declarationSource.slice(opened, index).trim().endsWith("*/"), `${name} must be documented`);
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

/** @returns {Record<string, unknown>} */
function profile() {
  return {
    altEmail: "alt@example.test",
    displayName: "Current Administrator",
    openExternalLinksNewTab: false,
    preferredCalendarView: "week",
    preferredLoginLanding: "dashboard",
    preferredWorkspaceSwitchLanding: "workbench",
    themeAutoSource: "system",
    themeMode: "auto",
    timezone: "America/New_York",
    username: "admin",
  };
}

/** @returns {Record<string, unknown>} */
function workspace() {
  return { status: "active", workspace_id: "w-1", workspace_name: "Acme", workspace_type: "business" };
}

/** @returns {Record<string, unknown>} */
function creationType() {
  return { defaultName: "Acme", label: "Business", moduleSettings: [], workspaceType: "business" };
}

/** @returns {Record<string, unknown>} */
function creation() {
  return {
    availableTypes: [creationType()],
    canCreateWorkspaces: true,
    installMode: "self_hosted",
    workspaceCreationEnabled: true,
  };
}

/** @returns {Record<string, unknown>} */
function settings() {
  return {
    ...profile(),
    activeWorkspaceId: "w-1",
    canEnterAccountExportRecovery: true,
    workspaceCreation: creation(),
    workspaces: [workspace()],
  };
}

/** @returns {Record<string, unknown>} */
function recovery() {
  return { accountExportRecovery: true, activeWorkspaceId: null, workspaces: [] };
}

/** @returns {Record<string, unknown>} */
function ordinary() {
  return { activeWorkspaceId: "w-1", workspaces: [workspace()] };
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
