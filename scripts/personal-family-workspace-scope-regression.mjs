import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-personal-family-scope-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-personal-family-scope.db");
process.env.SUPER_ADMIN_PASSWORD = "Personal-Family-Scope-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { filesService } = await import("../src/services/files.service.js");

let checks = 0;

try {
  await initializeDatabase();
  const session = await readProtectedSession();

  await check("Business workspaces keep client API scopes while Personal and Family hide them", async () => {
    await setWorkspaceType(session.workspace_id, "business");
    const businessScopes = await scopeIds(session.workspace_id);

    assert.ok(businessScopes.includes("clients:read"));
    assert.ok(businessScopes.includes("clients:write"));
    assert.ok(businessScopes.includes("projects:read"));
    assert.ok(businessScopes.includes("projects:write"));

    await setWorkspaceType(session.workspace_id, "personal");
    const personalScopes = await scopeIds(session.workspace_id);

    assert.equal(personalScopes.includes("clients:read"), false);
    assert.equal(personalScopes.includes("clients:write"), false);
    assert.ok(personalScopes.includes("projects:read"));
    assert.ok(personalScopes.includes("projects:write"));

    await setWorkspaceType(session.workspace_id, "family");
    const familyScopes = await scopeIds(session.workspace_id);

    assert.equal(familyScopes.includes("clients:read"), false);
    assert.equal(familyScopes.includes("clients:write"), false);
    assert.ok(familyScopes.includes("projects:read"));
    assert.ok(familyScopes.includes("projects:write"));
  });

  await check("Client attachable target is Business-only while project attachments remain available", async () => {
    await setWorkspaceType(session.workspace_id, "business");
    const businessTargets = await attachableTargetTypes(session.workspace_id);

    assert.ok(businessTargets.includes("client"));
    assert.ok(businessTargets.includes("project"));

    await setWorkspaceType(session.workspace_id, "family");
    const familyTargets = await attachableTargetTypes(session.workspace_id);

    assert.equal(familyTargets.includes("client"), false);
    assert.ok(familyTargets.includes("project"));
  });

  await check("Notes linked-record picker hides Client targets outside Business workspaces", async () => {
    await setWorkspaceType(session.workspace_id, "business");
    const { client } = await clientsService.createClient({
      name: "Legacy Family Hidden Client",
    }, session);
    const businessTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "Legacy Family Hidden Client" });

    assert.ok(businessTargets.targets.some((target) => target.targetId === client.id), "business linked-record picker should expose readable clients");

    await setWorkspaceType(session.workspace_id, "family");
    const familyAllTargets = await notesService.listLinkTargets(session, { targetType: "all", q: "Legacy Family Hidden Client" });
    const familyClientTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "Legacy Family Hidden Client" });

    assert.equal(familyAllTargets.targets.some((target) => target.targetType === "client"), false);
    assert.equal(familyClientTargets.targets.length, 0);
  });

  await check("Personal and Family Lists use workspace project scope without client context", async () => {
    await setWorkspaceType(session.workspace_id, "family");
    const { project } = await clientsService.createProject("", {
      name: "Family Scope Project",
    }, session);
    const clientProjects = await clientsService.readClientProjects(session);

    assert.deepEqual(clientProjects.clients, []);
    assert.ok(clientProjects.workspaceProjects.some((entry) => entry.id === project.id));

    const created = await listsService.create({
      list_type: "shopping",
      project_id: project.id,
      title: "Family Project Shopping List",
    }, session);

    assert.equal(created.list.client_id || "", "");
    assert.equal(created.list.project_id, project.id);
  });

  await check("Files browse payload shows human-readable target labels for Family workspace attachments", async () => {
    const project = (await clientsService.listProjects(session, {})).projects
      .find((entry) => entry.name === "Family Scope Project");

    assert.ok(project?.id, "family project should exist");

    await filesService.uploadAndAttach(session, {
      contentBase64: Buffer.from("family project file").toString("base64"),
      displayName: "Family project note",
      moduleId: "client-projects",
      originalFilename: "family-project-note.txt",
      targetId: project.id,
      targetType: "project",
      visibility: "private",
    });

    const result = await filesService.listAttachments(session, {
      moduleId: "client-projects",
      targetType: "project",
      targetId: project.id,
    });
    const attachment = result.attachments[0];

    assert.equal(attachment.targetLabel, "Family Scope Project");
    assert.equal(attachment.target?.label, "Family Scope Project");
    assert.equal(attachment.clientId || "", "");
    assert.equal(attachment.clientLabel || "", "");
  });

  await check("Protected browser scripts hide client controls and load workspace projects", async () => {
    const filesPage = await fs.readFile(path.join(process.cwd(), "views/protected/files.html"), "utf8");
    const filesScript = await fs.readFile(path.join(process.cwd(), "public/js/files.js"), "utf8");
    const listsPage = await fs.readFile(path.join(process.cwd(), "views/protected/lists.html"), "utf8");
    const listsScript = await fs.readFile(path.join(process.cwd(), "public/js/lists.js"), "utf8");

    assert.match(filesPage, /data-file-business-control/);
    assert.match(filesPage, /js\/files\.js\?v=1/);
    assert.match(filesScript, /await window\.LongtailForge\.workspaceContextReady/);
    assert.match(filesScript, /clientId: usesBusinessScope\(\) \? clientFilter\?\.value : ""/);
    assert.match(filesScript, /targetLabel/);
    assert.match(filesScript, /clientLabel/);
    assert.match(filesScript, /projectLabel/);

    assert.match(listsPage, /js\/lists\.js\?v=3/);
    assert.doesNotMatch(listsScript, /usesBusinessScope\(\) \? loadClientProjects\(\) : Promise\.resolve/);
    assert.match(listsScript, /state\.clients = window\.LongtailForge\.clientProjectOptions\.normalizeClients\(clientProjects\)/);
    assert.match(listsScript, /return !usesBusinessScope\(\) \|\| \["procurement", "parts", "supplies", "bill_of_materials"]/);
  });

  console.log(`Personal and Family workspace scope regression passed ${checks} checks.`);
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function check(name, assertion) {
  await assertion();
  checks += 1;
}

async function scopeIds(workspaceId) {
  return (await modulesService.listAvailableApiScopes(workspaceId))
    .map((scope) => scope.id)
    .sort();
}

async function attachableTargetTypes(workspaceId) {
  return (await modulesService.listActiveAttachableTypes(workspaceId))
    .filter((type) => type.moduleId === "client-projects")
    .map((type) => type.targetType)
    .sort();
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.home_workspace_id, users.active_workspace_id, users.timezone
FROM users
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user?.user_id, "protected user fixture is required");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name || user.username,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
