import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const clientsService = read("src/modules/client-projects/clients.service.js");
const usersService = read("src/services/users.service.js");
const usersRoutes = read("src/routes/users.routes.js");
const modulesService = read("src/core/modules/modules.service.js");
const workspacesRepo = read("src/repositories/user-workspaces.repo.js");
const schema = read("src/db/schema/current.generated.sql");
const sharedOptions = read("public/js/shared/client-project-options.js");
const page = read("public/js/user-admin.js");
const html = read("views/protected/user-admin.html");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** Member names of an object literal, shorthand properties included. @param {string} literal */
function membersOf(literal) {
  return [...literal.matchAll(/(?:^|[{,])\s*([A-Za-z_]\w*)\s*(?=[:,}])/g)].map((entry) => entry[1]).sort();
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.search(new RegExp("export interface " + name + "(?: extends \\w+)? \\{"));
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredMembers(name) {
  return [...declaredInterface(name).matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shipped reader block, instantiated from the page's own source. */
function shippedReaders() {
  const start = page.indexOf('  /** @typedef {import("../../src/types/browser-contracts.js").BrowserUserAdminClientScope}');
  const end = page.indexOf("  async function loadUsers() {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above loadUsers");
  return new Function(page.slice(start, end) + `
    return {
      isAssignableWorkspace,
      isPermissionResource,
      readAssignableWorkspaces,
      readClientProjectScopes,
      readPermissionResourceCatalog,
      tables: {
        nullableText: ASSIGNABLE_WORKSPACE_NULLABLE_TEXT,
        text: ASSIGNABLE_WORKSPACE_TEXT,
      },
    };`)();
}

const project = (overrides = {}) => ({
  id: "project_1",
  name: "Migration",
  status: "Active",
  parent_project_id: "",
  billable: "yes",
  billing_rate: null,
  billing_period: null,
  billing_rounding: null,
  ...overrides,
});

const client = (overrides = {}) => ({
  id: "client_1",
  name: "Northwind",
  status: "Active",
  parent_client_id: "",
  billable: "yes",
  billing_rate: null,
  billing_period: null,
  billing_rounding: null,
  projects: [project()],
  ...overrides,
});

const optionsBody = (overrides = {}) => ({
  view: "options",
  clients: [client()],
  workspaceProjects: [],
  ...overrides,
});

const workspace = (overrides = {}) => ({
  ownerUserId: "user_1",
  ownerUsername: "ada",
  workspaceId: "ws_1",
  workspaceName: "Raymond Tec",
  workspaceType: "business",
  ...overrides,
});

const resource = (overrides = {}) => ({
  key: "tasks",
  label: "Tasks",
  moduleId: "tasks",
  operations: ["view", "create"],
  ...overrides,
});

const readClientProjectOptions = functionBody(clientsService, "async function readClientProjectOptions(session, options = {}) {");
const optionsLiteral = readClientProjectOptions.slice(readClientProjectOptions.indexOf("  return {"));

describe("the client/project option body", () => {
  it("answers an exact envelope with its view written literally", () => {
    const top = [...optionsLiteral.matchAll(/^ {4}(\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(top, ["clients", "view", "workspaceProjects"],
      "the options body must carry exactly its three members");
    assert.match(optionsLiteral, /^ {4}view: "options",$/m, "and write its view as a constant");
    assert.ok(!/^ {4}\.\.\./m.test(optionsLiteral), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserClientProjectOptionsBody"),
      ["clients", "view", "workspaceProjects"],
      "the already-published envelope contract must still mirror it");
    assert.match(declaredInterface("BrowserClientProjectOptionsBody"), /view: "options";/,
      "including the literal view");
  });

  it("keeps its elements unnamed in that envelope, as the surface owner recorded", () => {
    const declared = declaredInterface("BrowserClientProjectOptionsBody");
    assert.match(declared, /clients: unknown\[\];/, "the shared option record is not this child's to name");
    assert.match(declared, /workspaceProjects: unknown\[\];/, "and neither is the workspace-project one");
  });

  it("reconstructs its client and project options by name", () => {
    for (const [shaper, members] of [
      ["function clientOptionFields(client) {", ["billable", "billing_period", "billing_rate", "billing_rounding", "id", "name", "parent_client_id", "status"]],
      ["function projectOptionFields(project) {", ["billable", "billing_period", "billing_rate", "billing_rounding", "id", "name", "parent_project_id", "status"]],
    ]) {
      const literal = functionBody(clientsService, String(shaper), "\n  };");
      assert.deepEqual(membersOf(literal.slice(literal.indexOf("{"))), members,
        shaper + " must reconstruct exactly its members");
      assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
    }
  });

  it("takes its identity from columns the schema declares NOT NULL", () => {
    const clients = functionBody(schema, "CREATE TABLE clients (", "\n);");
    const projects = functionBody(schema, "CREATE TABLE projects (", "\n);");
    for (const [table, source] of [["clients", clients], ["projects", projects]]) {
      assert.match(source, /^ {2}id TEXT NOT NULL,$/m, table + ".id must be NOT NULL");
      assert.match(source, /^ {2}name TEXT NOT NULL,$/m, table + ".name must be NOT NULL");
    }
  });
});

describe("the workspace-scope decision", () => {
  it("records what the shared normaliser would have added", () => {
    const body = functionBody(sharedOptions, "  function normalizeClients(data, options = {}) {", "\n  }\n");
    assert.match(body, /if \(workspaceProjects\.length === 0\) \{\n\s+return orderedClients;\n\s+\}/,
      "the shared normaliser returns the plain clients only when there are no workspace projects");
    assert.match(body, /return \[\n\s+\{\n\s+id: WORKSPACE_SCOPE_ID,[\s\S]*isWorkspaceScope: true,/,
      "and otherwise prepends a synthetic workspace-scope client");
    assert.match(body, /const orderedClients = orderClientHierarchy\(clients\);/,
      "it also reorders the client hierarchy, which would change this page's scope option order");
    assert.match(body, /name: workspaceProjectsLabel\(\),/,
      "and depends on the workspace-projects terminology helper");
  });

  it("does not adopt it, and cannot introduce that row by construction", () => {
    assert.ok(!html.includes("shared/client-project-options.js"),
      "User Admin must not gain the shared options script for four identity fields");
    // Matched as a call: the reader's own doc comment names the normaliser to explain why it
    // is not adopted, and a bare-name search would have been failed by that explanation.
    assert.doesNotMatch(page, /normalizeClients\s*\(/,
      "and must not call the shared normaliser");
    const reader = functionBody(page, "  function readClientProjectScopes(body) {", "\n  }\n");
    assert.match(reader, /Array\.isArray\(body\.workspaceProjects\)/,
      "the reader proves the member exists, because the envelope is exact");
    assert.ok(!/body\.workspaceProjects\.(map|forEach|filter|concat|every|some)/.test(reader),
      "but never reads through it, so a workspace-scoped project cannot become a role scope");
    assert.ok(!page.includes("isWorkspaceScope") && !page.includes("WORKSPACE_SCOPE_ID"),
      "and the synthetic scope has no spelling anywhere on this page");
  });

  it("keeps the role-scope pickers reading the clients collection alone", () => {
    const scopes = functionBody(page, "  function renderScopeOptions(", "\n  }\n");
    assert.ok(scopes.includes("clients.forEach"), "client scopes come from the vouched client list");
    assert.ok(!scopes.includes("workspaceProjects"), "and workspace projects are not offered as scopes");
  });
});

describe("the assignable workspace list", () => {
  const list = functionBody(usersService, "async function listWorkspaces(session) {");

  it("answers one member behind the users.manage read right", () => {
    assert.match(list, /await permissionsService\.assertCan\(session, "users\.manage", \{ workspace_id: session\.workspace_id, operation: "read" \}\);/,
      "the list must assert the manage right for a read in the session's own workspace");
    const asserted = list.indexOf("assertCan");
    assert.notEqual(asserted, -1, "the list must assert the manage right");
    assert.ok(asserted < list.indexOf("readAssignableWorkspaces"),
      "and must do so before reading any workspace");
    assert.deepEqual(membersOf(list.slice(list.indexOf("return {"))), ["workspaces"],
      "the envelope must carry exactly its one member");
    assert.deepEqual(declaredMembers("BrowserAssignableWorkspaceList"), ["workspaces"],
      "and the declaration must mirror it");
    assert.match(usersRoutes, /usersRoutes\.get\("\/workspaces", asyncRoute\(async \(request, response\) => \{\n\s+const result = await usersService\.listWorkspaces\(request\.session\);/,
      "the route must call the traced producer");
  });

  it("reconstructs five members by name, from a query that enumerates its columns", () => {
    const literal = functionBody(usersService, "function workspaceToAppValue(workspace) {", "\n  };");
    assert.deepEqual(
      membersOf(literal.slice(literal.indexOf("{"))),
      ["ownerUserId", "ownerUsername", "workspaceId", "workspaceName", "workspaceType"],
      "the workspace value must carry exactly its five members",
    );
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserAssignableWorkspace"),
      membersOf(literal.slice(literal.indexOf("{"))),
      "and the declaration must mirror the producer");
    const query = functionBody(workspacesRepo, "async function readAllWorkspaces() {");
    assert.doesNotMatch(query, /SELECT\s+\*/, "the query must enumerate its columns");
    assert.match(query, /WHERE lower\(workspaces\.status\) = 'active'/, "and answer only active workspaces");
    assert.match(query, /ORDER BY name;/, "in the order the page renders");
    assert.match(query, /LEFT JOIN users AS owner/, "reaching the owner name through a left join");
  });

  it("does not close the workspace type, because this producer does not", () => {
    const workspaces = functionBody(schema, "CREATE TABLE workspaces (", "\n);");
    assert.match(workspaces, /^ {2}workspace_type TEXT NOT NULL DEFAULT 'business',$/m,
      "the column carries a default and no CHECK");
    // Matched in both orders: a table-level `CHECK (workspace_type IN (...))` would have
    // slipped past a pattern that only looked for a constraint written after the column.
    assert.doesNotMatch(workspaces, /workspace_type[^,\n]*CHECK|CHECK\s*\([^)]*workspace_type/,
      "so the schema closes nothing");
    assert.match(functionBody(usersService, "function workspaceToAppValue(workspace) {", "\n  };"),
      /workspaceType: workspace\.workspace_type,/, "and the shaper copies the column raw");
    assert.match(declaredInterface("BrowserAssignableWorkspace"), /workspaceType: string;/,
      "so the browser must declare it as text");
    assert.doesNotMatch(declaredInterface("BrowserAssignableWorkspace"), /BrowserWorkspaceType/,
      "reusing the settings vocabulary here would promise a guarantee nobody makes");
    assert.match(contracts, /export type BrowserWorkspaceType = "business" \| "family" \| "personal";/,
      "even though that vocabulary exists for the producer that does close it");
  });

  it("is not reused from another workspace shape", () => {
    for (const other of ["BrowserUserSettingsWorkspace", "BrowserSupportViewTargetWorkspace"]) {
      const at = contracts.search(new RegExp("export interface " + other + "\\b"));
      if (at === -1) {
        continue;
      }
      assert.doesNotMatch(declaredInterface("BrowserAssignableWorkspace"), new RegExp(other),
        "matching member names is not producer identity");
    }
    // Counted by bare name, not by call: one of the two uses is `.map(workspaceToAppValue)`,
    // which a call-shaped search would have missed while still reporting a plausible total.
    assert.equal((usersService.match(/\bworkspaceToAppValue\b/g) || []).length, 3,
      "this shaper is reached only from the assignable-workspace reader and its own definition");
    const reader = functionBody(usersService, "async function readAssignableWorkspaces(session) {");
    assert.match(reader, /return allWorkspaces\.map\(workspaceToAppValue\);/,
      "the super-administrator branch shapes through it");
    assert.match(reader, /visibleWorkspaces\.push\(workspaceToAppValue\(workspace\)\);/,
      "and so does the permission-filtered branch");
  });
});

describe("the permission resource catalog", () => {
  const list = functionBody(usersService, "async function listPermissionResources(session) {");

  it("answers one member behind the users.manage read right", () => {
    assert.match(list, /await permissionsService\.assertCan\(session, "users\.manage", \{\n {4}workspace_id: session\.workspace_id,\n {4}operation: "read",\n {2}\}\);/,
      "the catalog must assert the manage right for a read");
    assert.deepEqual(membersOf(list.slice(list.indexOf("return {"))), ["resources"],
      "the envelope must carry exactly its one member");
    assert.deepEqual(declaredMembers("BrowserPermissionResourceCatalog"), ["resources"],
      "and the declaration must mirror it");
  });

  it("reconstructs four members and sends no required-permission list", () => {
    const literal = functionBody(modulesService, "function normalizeResourceDefinition(resource) {", "\n  };");
    assert.deepEqual(membersOf(literal.slice(literal.indexOf("{"))),
      ["key", "label", "moduleId", "operations"],
      "the resource definition must carry exactly its four members");
    // Checked at member indent: the operations value legitimately spreads a `Set` to
    // de-duplicate itself, and a bare "..." search would have called that an object spread.
    assert.ok(!/^ {4}\.\.\./m.test(literal), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserPermissionResource"), membersOf(literal.slice(literal.indexOf("{"))),
      "and the declaration must mirror the producer");
    assert.doesNotMatch(literal, /requiredPermissions/,
      "the required permissions decide visibility server-side and are not sent");
    assert.doesNotMatch(declaredInterface("BrowserPermissionResource"), /requiredPermissions/,
      "so the browser contract must not name them either");
  });

  it("leaves module status, terminology and permission filtering to the server", () => {
    const body = functionBody(modulesService, "async function listActiveResourceDefinitions(workspaceId, session = /** @type {RequestSession|null} */ (null)) {");
    assert.match(body, /listWorkspaceContributions\(workspaceId, session, "resourceDefinitions"\)/,
      "only enabled modules may contribute resources");
    assert.match(body, /resolveContributionTerminology\(resource, workspaceType, "resourceDefinitions"\)/,
      "workspace terminology is resolved server-side");
    assert.match(body, /if \(await requiredPermissionsAllowed\(resolvedResource, session\)\) \{/,
      "and a resource the caller may not see is filtered out before the response");
    assert.doesNotMatch(page, /PERMISSION_RESOURCES/, "the browser must not own a catalog of its own");
    assert.doesNotMatch(page, /knowledge_base|\btickets\b/i,
      "and must not anticipate resources no module has contributed");
  });

  it("no longer normalises the catalog it receives", () => {
    assert.ok(!page.includes("normalizePermissionResources"),
      "the local normaliser is gone: what it did beyond the server's own normalisation was drop resources silently");
    assert.match(modulesService, /operations: \[\.\.\.new Set\(\(resource\.operations \|\| \[\]\)\.map\(\(operation\) => String\(operation \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\)\],/,
      "because the server already trims and de-duplicates the operations");
    assert.match(modulesService, /label: String\(resource\.label \|\| resource\.key \|\| ""\)\.trim\(\),/,
      "and already falls the label back to the key");
  });
});

describe("the shipped readers, run against real bodies", () => {
  const {
    isAssignableWorkspace, isPermissionResource, readAssignableWorkspaces,
    readClientProjectScopes, readPermissionResourceCatalog, tables,
  } = shippedReaders();

  it("checks the workspace members the producer writes", () => {
    const literal = functionBody(usersService, "function workspaceToAppValue(workspace) {", "\n  };");
    assert.deepEqual([...tables.text, ...tables.nullableText].sort(),
      membersOf(literal.slice(literal.indexOf("{"))),
      "the reader must check every member the producer sends");
  });

  it("accepts a real options body and keeps the producer's own rows", () => {
    const wire = optionsBody();
    const result = readClientProjectScopes(wire);
    assert.ok(result, "a real options body must be accepted");
    assert.equal(result[0], wire.clients[0], "and its clients passed on by identity, not rebuilt");
    assert.equal(result[0].projects[0].id, "project_1", "with their projects intact");
  });

  it("accepts a workspace with no clients at all", () => {
    const result = readClientProjectScopes(optionsBody({ clients: [] }));
    assert.ok(result, "a personal or family workspace really does answer no clients");
    assert.equal(result.length, 0, "and that is an empty list, not an unreadable one");
  });

  it("keeps inactive clients and projects, because includeInactive asked for them", () => {
    const result = readClientProjectScopes(optionsBody({
      clients: [client({ status: "Inactive", projects: [project({ status: "Inactive" })] })],
    }));
    assert.ok(result, "an inactive client is still a role scope");
    assert.equal(result[0].status, "Inactive", "and its status is untouched");
    assert.equal(result[0].projects[0].status, "Inactive", "as is its project's");
  });

  it("refuses a body that is not the options view", () => {
    for (const bad of [
      null, undefined, 7, [], {},
      optionsBody({ view: "list" }),
      optionsBody({ view: "" }),
      optionsBody({ view: undefined }),
      optionsBody({ clients: undefined }),
      optionsBody({ clients: "none" }),
      optionsBody({ workspaceProjects: undefined }),
    ]) {
      assert.equal(readClientProjectScopes(bad), null, "an unusable options body must be refused");
    }
  });

  it("refuses a client or project the page could not submit as a scope", () => {
    for (const bad of [
      client({ id: "" }), client({ id: null }), client({ id: 7 }),
      client({ name: null }), client({ name: undefined }),
      client({ projects: undefined }), client({ projects: "none" }),
      client({ projects: [project({ id: "" })] }),
      client({ projects: [project({ name: 7 })] }),
      client({ projects: [null] }),
    ]) {
      assert.equal(readClientProjectScopes(optionsBody({ clients: [bad] })), null,
        "a scope the page cannot submit must refuse the whole list");
    }
  });

  it("refuses the whole list rather than dropping one unreadable client", () => {
    assert.equal(
      readClientProjectScopes(optionsBody({ clients: [client(), { name: "Nameless" }] })),
      null,
      "a picker missing one client looks exactly like a workspace that has one fewer",
    );
  });

  it("accepts a real workspace list, including one with no owner", () => {
    const wire = { workspaces: [workspace(), workspace({ workspaceId: "ws_2", ownerUserId: null, ownerUsername: null })] };
    const result = readAssignableWorkspaces(wire);
    assert.ok(result, "a real workspace list must be accepted");
    assert.equal(result[0], wire.workspaces[0], "and passed on by identity");
    assert.equal(result[1].ownerUsername, null, "an unowned workspace really has no owner name");
  });

  it("accepts an administrator who may assign membership nowhere", () => {
    const result = readAssignableWorkspaces({ workspaces: [] });
    assert.ok(result, "the server filters by status, membership and users.manage");
    assert.equal(result.length, 0, "so an empty list is a real answer the page already renders");
  });

  it("refuses a workspace body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, [], {}, { workspaces: null }, { workspaces: "none" }]) {
      assert.equal(readAssignableWorkspaces(bad), null, "an unusable workspace body must be refused");
    }
  });

  it("refuses a workspace the page could not offer as a membership", () => {
    for (const bad of [
      workspace({ workspaceId: "" }), workspace({ workspaceId: null }),
      workspace({ workspaceName: null }), workspace({ workspaceType: 7 }),
      workspace({ ownerUserId: 7 }), workspace({ ownerUsername: {} }),
    ]) {
      assert.equal(isAssignableWorkspace(bad), false, "a malformed workspace must be refused");
      assert.equal(readAssignableWorkspaces({ workspaces: [workspace(), bad] }), null,
        "and must refuse the whole list rather than hide a membership option");
    }
  });

  it("accepts any workspace type word, because the producer closes none", () => {
    for (const type of ["business", "family", "personal", "trial"]) {
      assert.equal(isAssignableWorkspace(workspace({ workspaceType: type })), true,
        type + " is a value this raw column can hold");
    }
  });

  it("accepts a real catalog, including a framework resource with no module", () => {
    const wire = { resources: [resource(), resource({ key: "workspace_settings", label: "Workspace Settings", moduleId: "" })] };
    const result = readPermissionResourceCatalog(wire);
    assert.ok(result, "a real catalog must be accepted");
    assert.equal(result[0], wire.resources[0], "and passed on by identity");
    assert.equal(result[1].moduleId, "", "a framework resource belongs to no contributed module");
  });

  it("refuses a catalog body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, [], {}, { resources: null }, { resources: "none" }]) {
      assert.equal(readPermissionResourceCatalog(bad), null, "an unusable catalog body must be refused");
    }
  });

  it("refuses a resource the matrix could not render", () => {
    for (const bad of [
      resource({ key: "" }), resource({ key: null }),
      resource({ label: "" }), resource({ label: undefined }),
      resource({ moduleId: null }), resource({ moduleId: 7 }),
      resource({ operations: [] }), resource({ operations: undefined }),
      resource({ operations: "view" }), resource({ operations: ["view", ""] }),
      resource({ operations: [7] }), resource({ operations: [null] }),
    ]) {
      assert.equal(isPermissionResource(bad), false, "a resource the matrix cannot render must be refused");
      assert.equal(readPermissionResourceCatalog({ resources: [resource(), bad] }), null,
        "and must refuse the whole catalog rather than shorten it");
    }
  });

  it("shortens no catalog: every resource the producer sent survives", () => {
    const wire = { resources: [resource(), resource({ key: "notes", label: "Notes", moduleId: "notes" }), resource({ key: "lists", label: "Lists", moduleId: "lists" })] };
    const result = readPermissionResourceCatalog(wire);
    assert.ok(result, "a real catalog must be accepted");
    assert.equal(result.length, wire.resources.length,
      "the count the server sent must be the count the matrix renders");
    assert.deepEqual(result.map((/** @type {{ key: string }} */ entry) => entry.key), ["tasks", "notes", "lists"],
      "in the server's own order, which is the order it sorted them into");
  });
});

describe("the bootstrap is committed as one transaction", () => {
  const load = functionBody(page, "  async function loadUsers() {", "\n  }\n");

  it("no longer trusts any of the three raw reads", () => {
    for (const raw of [
      "clientProjectBody.clients || []",
      "workspacesBody.workspaces || []",
      "normalizePermissionResources(permissionResourcesBody.resources)",
    ]) {
      assert.ok(!page.includes(raw), raw + " must be gone");
    }
  });

  it("narrows all three before committing any of them", () => {
    for (const [name, reader] of [
      ["clientScopes", "readClientProjectScopes(clientProjectBody)"],
      ["assignableWorkspaces", "readAssignableWorkspaces(workspacesBody)"],
      ["resourceCatalog", "readPermissionResourceCatalog(permissionResourcesBody)"],
    ]) {
      const read = load.indexOf(`const ${name} = ${reader};`);
      assert.notEqual(read, -1, name + " must be narrowed into a local");
      const commit = load.indexOf("      clients = clientScopes;");
      assert.notEqual(commit, -1, "the bootstrap must commit its collections");
      assert.ok(read < commit, name + " must be read before anything is committed");
    }
  });

  it("refuses the whole bootstrap when any one body is unreadable", () => {
    const guard = load.indexOf("if (!clientScopes || !assignableWorkspaces || !resourceCatalog) {");
    assert.notEqual(guard, -1, "one guard must cover all three responses");
    const commit = load.indexOf("      clients = clientScopes;");
    assert.notEqual(commit, -1, "the bootstrap must commit its collections");
    assert.ok(guard < commit,
      "so a third body found malformed cannot leave the first two standing as a completed bootstrap");
    assert.match(load, /throw new Error\("The user administration bootstrap could not be read\./,
      "and the refusal must throw");
  });

  it("routes that refusal into the page's existing users-load error path", () => {
    const refusal = load.indexOf("could not be read.");
    assert.notEqual(refusal, -1, "the bootstrap must refuse");
    assert.ok(refusal < load.indexOf("} catch (error) {"), "into the existing catch");
    assert.match(load, /setUserAdminStatus\(requireErrors\(\)\.caughtMessage\(error, "Users could not be loaded\."\), true\);/,
      "which is the page's own load failure path");
    assert.doesNotMatch(load, /alert\(|showModal|toast/i, "and adds no new failure surface");
  });

  it("leaves the other bootstrap producers to their own children", () => {
    for (const untouched of [
      "roles = readRoleOptions(rolesBody);",
      "readUserListResponse(usersBody)",
      "applyAddUserOptions(addUserOptionsBody)",
    ]) {
      assert.ok(load.includes(untouched), untouched + " belongs to another child and is untouched");
    }
  });

  it("leaves the workspace-type delivery tail parked, exactly as it was", () => {
    assert.match(load, /activeWorkspaceType = normalizeWorkspaceType\(settingsBody\.workspaceType\);/,
      "the settings read is delivery-blocked and this child must not close it");
    assert.ok(!html.includes("settings-host.js"),
      "and must not add the settings host that would deliver its shared reader");
  });
});
