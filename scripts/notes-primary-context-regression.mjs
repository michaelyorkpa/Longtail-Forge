import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-primary-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-primary-context.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Primary-Context-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertBrowserPrimaryContextContract();
  await assertBusinessPrimaryContextTargets(session, workspace);
  await assertFamilyPrimaryContextTargets(session);
  await assertIntegrity();

  console.log("Notes primary context regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertBrowserPrimaryContextContract() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const notesHtml = await fs.readFile(path.join(process.cwd(), "views/protected/notes.html"), "utf8");
  const notesCss = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");

  assert.match(notesHtml, /css\/longtail-forge\.css\?v=43/);
  assert.match(notesHtml, /js\/notes\.js\?v=58/);
  assert.match(notesJs, /function createPrimaryContextSection\(\)/);
  assert.match(notesJs, /text: "Primary Context"/);
  assert.match(notesJs, /noteSelect\("noteClientId", \[\]\)/);
  assert.match(notesJs, /noteSelect\("noteProjectId", \[\]\)/);
  assert.match(notesJs, /workspaceType: ""/);
  assert.match(notesJs, /clientField\.hidden = true/);
  assert.match(notesJs, /clientInput\?\.addEventListener\("change", handlePrimaryClientChange\)/);
  assert.match(notesJs, /projectInput\?\.addEventListener\("change", handlePrimaryProjectChange\)/);
  assert.match(notesJs, /context\.workspaceType \|\| context\.workspace_type \|\| ""/);
  assert.match(notesJs, /function normalizeWorkspaceType\(value = ""\)/);
  assert.match(notesJs, /return normalizeWorkspaceType\(state\.workspaceType\) === "business" && workspaceHasClientTools\(\)/);
  assert.match(notesJs, /function workspaceHasClientTools\(\)/);
  assert.match(notesJs, /tools\.includes\("clients_projects"\)/);
  assert.match(notesJs, /primaryClientField\.hidden = !clientAvailable/);
  assert.match(notesJs, /primaryClientField\.style\.display = clientAvailable \? "" : "none"/);
  assert.match(notesJs, /function populateWorkspaceVisibilityOptions\(selectedValue = visibilityInput\?\.value \|\| "internal"\)/);
  assert.match(notesJs, /noteSelect\("noteVisibility", modalFieldOptions\(modal, "visibility"\)\.filter\(\(\[value\]\) => value !== "client_visible"\)\)/);
  assert.match(notesJs, /\.filter\(\(\[value\]\) => value !== "client_visible" \|\| usesBusinessScope\(\)\)/);
  assert.match(notesJs, /function readEditorVisibility\(\)/);
  assert.match(notesJs, /visibility: readEditorVisibility\(\)/);
  assert.match(notesJs, /async function openEditor\(note = null\) \{\s*note = await hydrateEditorNote\(note\);/, "Edit Note should hydrate saved notes before Primary Context controls are populated");
  assert.match(notesJs, /async function hydrateEditorNote\(note = null\)[\s\S]*api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(noteId\)\}`[\s\S]*cache: "no-store"[\s\S]*return result\.note/, "Editor hydration should read the authoritative no-store note payload");
  assert.match(notesJs, /const selectedClientId = note\?\.client_id \|\| "";[\s\S]*const selectedProjectId = note\?\.project_id \|\| "";[\s\S]*loadPrimaryContextOptions\(\{[\s\S]*clientId: selectedClientId,[\s\S]*projectId: selectedProjectId,[\s\S]*\}\);/, "Edit Note should pass direct note IDs into Primary Context option loading before browser selects can drop unavailable values");
  assert.match(notesJs, /function primaryClientFallbackOption\(selectedClientId = ""\)/, "Saved Primary Context client values should stay selectable even when provider paging omits them");
  assert.match(notesJs, /function primaryProjectFallbackOption\(selectedProjectId = ""\)/, "Saved Primary Context project values should stay selectable even when provider paging omits them");
  assert.match(notesJs, /populatePrimaryClientOptions\(derivedClientId\);[\s\S]*populatePrimaryProjectOptions\(selectedProjectId\);/, "Primary Context option loading should preserve selected direct context values");
  assert.doesNotMatch(notesJs, /primaryContextManuallyChanged|readEditorPrimaryContextPayload|inferPrimaryContextFromEditorTargets|primaryContextFromTarget|taskLinkPrimaryContext|applyContextTarget/, "Linked Context must not create, update, delete, or recover Primary Context");
  assert.match(notesJs, /state\.primaryContextClients = clients\.filter\(isActivePrimaryClientTarget\)/);
  assert.match(notesJs, /function isActivePrimaryClientTarget\(client = \{\}\)/);
  assert.match(notesJs, /normalizeText\(client\.status\)\.toLowerCase\(\) === "active"/);
  assert.match(notesJs, /client_id: usesBusinessScope\(\) \? normalizeText\(clientInput\.value\) \|\| null : null/);
  assert.match(notesJs, /project_id: normalizeText\(projectInput\.value\) \|\| null/);
  assert.match(notesJs, /function primaryProjectOptionLabel\(project = \{\}\)/);
  assert.match(notesJs, /return `\$\{projectName\} - \$\{contextName\}`;/);
  assert.match(notesJs, /function linkRecordNodes\(note\)[\s\S]*notePrimaryContextItem\(note\)[\s\S]*linkItem\(note, link\)/);
  assert.match(notesJs, /function notePrimaryContextItem\(note = \{\}\)[\s\S]*text: "Primary Context"[\s\S]*className: "notes-link-item notes-primary-context-row"/);
  assert.match(notesJs, /function notePrimaryContextSummary\(note = \{\}\)[\s\S]*context\.client\?\.label \|\| unavailableTargetLabel\("client"\)[\s\S]*context\.project\?\.label \|\| unavailableTargetLabel\("project"\)/);
  assert.match(notesJs, /\["noteTaskId", "noteUserId"\]/);
  assert.doesNotMatch(notesJs, /linked\.push\(`Client: \$\{contextSummaryLabel\("client"\)\}`\)|linked\.push\(`Project: \$\{contextSummaryLabel\("project"\)\}`\)/);
  assert.match(notesCss, /\.notes-primary-context\s*\{[\s\S]*border-top:\s*1px solid var\(--color-border-subtle\);/);
}

async function assertBusinessPrimaryContextTargets(session, workspace) {
  await setWorkspaceType(session.workspace_id, "business");
  const suffix = randomUUID().slice(0, 8);
  const clientId = `primary-client-${suffix}`;
  const inactiveClientId = `inactive-primary-client-${suffix}`;
  const clientProjectId = `primary-client-project-${suffix}`;
  const workspaceProjectId = `primary-workspace-project-${suffix}`;

  await clientsRepository.create(session.workspace_id, {
    id: clientId,
    name: "Primary Context Client",
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: inactiveClientId,
    name: "Inactive Primary Context Client",
    status: "Inactive",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, clientId, {
    id: clientProjectId,
    name: "Primary Context Client Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: workspaceProjectId,
    name: "Primary Context Workspace Project",
    status: "Active",
    billable: "yes",
  });

  const clientTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "Primary Context Client" });
  const clientTarget = clientTargets.targets.find((target) => target.targetId === clientId);
  const inactiveClientTarget = clientTargets.targets.find((target) => target.targetId === inactiveClientId);
  assert.equal(clientTarget?.label, "Primary Context Client");
  assert.equal(clientTarget?.status, "Active");
  assert.equal(inactiveClientTarget?.status, "Inactive");
  assert.doesNotMatch(clientTarget?.label || "", /Client -|Active|primary-client-/);

  const projectTargets = await notesService.listLinkTargets(session, { targetType: "project", q: "Primary Context" });
  const clientProject = projectTargets.targets.find((target) => target.targetId === clientProjectId);
  const workspaceProject = projectTargets.targets.find((target) => target.targetId === workspaceProjectId);
  assert.equal(clientProject?.label, "Primary Context Client Project");
  assert.equal(clientProject?.clientId, clientId);
  assert.equal(clientProject?.clientName, "Primary Context Client");
  assert.equal(workspaceProject?.label, "Primary Context Workspace Project");
  assert.equal(workspaceProject?.clientId || "", "");
  assert.equal(workspaceProject?.workspaceName, workspace.workspace_name || "Workspace");

  const clientOnlyNote = await notesService.create({
    title: "Primary client-only note",
    body_markdown: "Business client-only context.",
    client_id: clientId,
    project_id: null,
  }, session);
  assert.equal(clientOnlyNote.note.client_id, clientId);
  assert.equal(clientOnlyNote.note.project_id || "", "");

  const workspaceProjectNote = await notesService.create({
    title: "Primary workspace-project note",
    body_markdown: "Business workspace project context.",
    client_id: null,
    project_id: workspaceProjectId,
  }, session);
  assert.equal(workspaceProjectNote.note.client_id || "", "");
  assert.equal(workspaceProjectNote.note.project_id, workspaceProjectId);

  const updated = await notesService.update(workspaceProjectNote.note.note_id, {
    ...workspaceProjectNote.note,
    client_id: null,
    project_id: null,
  }, session);
  assert.equal(updated.note.client_id || "", "");
  assert.equal(updated.note.project_id || "", "");
}

async function assertFamilyPrimaryContextTargets(session) {
  await setWorkspaceType(session.workspace_id, "family");
  const suffix = randomUUID().slice(0, 8);
  const familyProjectId = `primary-family-project-${suffix}`;

  await projectsRepository.create(session.workspace_id, "", {
    id: familyProjectId,
    name: "Family Primary Context Project",
    status: "Active",
    billable: "no",
  });

  const clientTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "Primary Context Client" });
  assert.equal(clientTargets.targets.length, 0);

  const projectTargets = await notesService.listLinkTargets(session, { targetType: "project", q: "Family Primary Context Project" });
  const project = projectTargets.targets.find((target) => target.targetId === familyProjectId);
  assert.equal(project?.label, "Family Primary Context Project");
  assert.equal(project?.clientId || "", "");

  const note = await notesService.create({
    title: "Family primary-project note",
    body_markdown: "Family project context.",
    client_id: null,
    project_id: familyProjectId,
  }, session);
  assert.equal(note.note.client_id || "", "");
  assert.equal(note.note.project_id, familyProjectId);
}

async function assertIntegrity() {
  const result = await querySql("PRAGMA integrity_check;");
  assert.equal(result[0]?.integrity_check, "ok");
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id, name AS workspace_name FROM workspaces ORDER BY rowid LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "workspace fixture is required");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user?.user_id, "protected user fixture is required");
  return {
    display_name: user.display_name || user.username,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}
