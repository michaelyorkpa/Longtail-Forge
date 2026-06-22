import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-linked-context-client-project-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-linked-context-client-project.db");
process.env.SUPER_ADMIN_PASSWORD = "Linked-Context-Client-Project-Test-123!";

const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertBrowserUsesProviderLabels();
  await assertBusinessClientTargets(session);
  await assertBusinessProjectTargets(session, workspace);
  await assertFamilyProjectTargets(session);
  await assertIntegrity();

  console.log("Linked Context Client/Project label and sort regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertBrowserUsesProviderLabels() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const notesServiceJs = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8");

  assert.match(notesJs, /function primaryClientOptionLabel\(client = \{\}\)[\s\S]*providerDisplayLabel\(client\.displayLabel, client\.display_label\)/, "Primary Context client options should prefer provider display labels without trimming hierarchy indentation");
  assert.match(notesJs, /function primaryProjectOptionLabel\(project = \{\}\)[\s\S]*const providerLabel = providerDisplayLabel\(project\.displayLabel, project\.display_label\)[\s\S]*return providerLabel;/, "Primary Context project options should prefer provider display labels");
  assert.match(notesJs, /function targetPickerDisplayLabel\(target = \{\}\)[\s\S]*const providerLabel = providerDisplayLabel\(target\.displayLabel, target\.display_label\)[\s\S]*return providerLabel;/, "Linked Context picker options should render provider display labels directly");
  assert.match(notesJs, /function providerDisplayLabel\(\.\.\.values\)[\s\S]*if \(label\.trim\(\)\)[\s\S]*return label;/, "Provider display labels should be presence-checked without trimming provider-owned text");
  assert.doesNotMatch(notesJs, /return contextName \? `\$\{label\} \(\$\{contextName\}\)` : label;/, "Business project picker fallback should no longer use parenthesized browser-built labels");
  assert.match(notesServiceJs, /clientsService\.listClients\(session,[\s\S]*include_depth: true,[\s\S]*shape: "flat"[\s\S]*status: "All"/, "Notes Client targets should consume Clients/Projects-owned hierarchy ordering");
  assert.doesNotMatch(notesServiceJs, /filterReadableClients\(session, await clientsRepository\.readAll\(session\.workspace_id\)\)/, "Notes should not bypass Clients/Projects-owned client target ordering");
}

async function assertBusinessClientTargets(session) {
  await setWorkspaceType(session.workspace_id, "business");
  const suffix = randomUUID().slice(0, 8);
  const childId = `lc-sort-child-${suffix}`;
  const parentId = `lc-sort-parent-${suffix}`;
  const siblingId = `lc-sort-sibling-${suffix}`;

  await clientsRepository.create(session.workspace_id, {
    id: parentId,
    name: "LC Sort Client Parent",
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: childId,
    name: "LC Sort Client Aardvark Child",
    parent_client_id: parentId,
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: siblingId,
    name: "LC Sort Client Sibling",
    status: "Inactive",
    billable: "yes",
  });

  const result = await notesService.listLinkTargets(session, { targetType: "client", q: "LC Sort Client", limit: 20 });
  const targets = result.targets.filter((target) => [childId, parentId, siblingId].includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), [
    parentId,
    childId,
    siblingId,
  ]);
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    "LC Sort Client Parent",
    "  - LC Sort Client Aardvark Child",
    "LC Sort Client Sibling",
  ]);
  assert.deepEqual(targets.map((target) => target.label), [
    "LC Sort Client Parent",
    "LC Sort Client Aardvark Child",
    "LC Sort Client Sibling",
  ]);

  for (const target of targets) {
    assert.equal(target.targetType, "client");
    assert.equal(target.secondaryLabel, "");
    assert.equal(target.workspaceId, session.workspace_id);
    assert.equal(target.isAvailable, true);
    assertCleanDisplayLabel(target.displayLabel, target.targetId);
    assert.doesNotMatch(target.displayLabel, /Client:|- Client|Active|Inactive/);
  }
}

async function assertBusinessProjectTargets(session, workspace) {
  await setWorkspaceType(session.workspace_id, "business");
  const suffix = randomUUID().slice(0, 8);
  const acmeId = `lc-sort-project-acme-${suffix}`;
  const zenithId = `lc-sort-project-zenith-${suffix}`;
  const workspaceName = workspace.workspace_name || "Workspace";
  const projects = {
    workspaceAlpha: `lc-sort-ws-alpha-${suffix}`,
    workspaceZeta: `lc-sort-ws-zeta-${suffix}`,
    acmeBeta: `lc-sort-acme-beta-${suffix}`,
    zenithAlpha: `lc-sort-zenith-alpha-${suffix}`,
  };

  await clientsRepository.create(session.workspace_id, {
    id: acmeId,
    name: "LC Sort Acme Project Client",
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: zenithId,
    name: "LC Sort Zenith Project Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: projects.workspaceZeta,
    name: "LC Sort Zeta Workspace Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: projects.workspaceAlpha,
    name: "LC Sort Alpha Workspace Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, acmeId, {
    id: projects.acmeBeta,
    name: "LC Sort Beta Client Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, zenithId, {
    id: projects.zenithAlpha,
    name: "LC Sort Alpha Client Project",
    status: "Active",
    billable: "yes",
  });

  const result = await notesService.listLinkTargets(session, { targetType: "project", q: "LC Sort", limit: 50 });
  const orderedTargets = result.targets.filter((target) => Object.values(projects).includes(target.targetId));

  assert.deepEqual(orderedTargets.map((target) => target.targetId), [
    projects.workspaceAlpha,
    projects.workspaceZeta,
    projects.acmeBeta,
    projects.zenithAlpha,
  ]);
  assert.deepEqual(orderedTargets.map((target) => target.displayLabel), [
    `LC Sort Alpha Workspace Project - ${workspaceName}`,
    `LC Sort Zeta Workspace Project - ${workspaceName}`,
    "LC Sort Beta Client Project - LC Sort Acme Project Client",
    "LC Sort Alpha Client Project - LC Sort Zenith Project Client",
  ]);

  for (const target of orderedTargets) {
    assert.equal(target.targetType, "project");
    assert.equal(target.workspaceId, session.workspace_id);
    assert.equal(target.isAvailable, true);
    assertCleanDisplayLabel(target.displayLabel, target.targetId);
    assert.doesNotMatch(target.displayLabel, /Project:|Active|Inactive|Completed|open|closed/i);
  }
}

async function assertFamilyProjectTargets(session) {
  await setWorkspaceType(session.workspace_id, "family");
  const suffix = randomUUID().slice(0, 8);
  const alphaId = `lc-sort-family-alpha-${suffix}`;
  const zetaId = `lc-sort-family-zeta-${suffix}`;

  await projectsRepository.create(session.workspace_id, "", {
    id: zetaId,
    name: "LC Sort Family Zeta",
    status: "Active",
    billable: "no",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: alphaId,
    name: "LC Sort Family Alpha",
    status: "Active",
    billable: "no",
  });

  const clientTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "LC Sort", limit: 20 });
  assert.equal(clientTargets.targets.length, 0, "Family workspaces should not expose Client target options");

  const result = await notesService.listLinkTargets(session, { targetType: "project", q: "LC Sort Family", limit: 20 });
  const targets = result.targets.filter((target) => [alphaId, zetaId].includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), [alphaId, zetaId]);
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    "LC Sort Family Alpha",
    "LC Sort Family Zeta",
  ]);

  for (const target of targets) {
    assert.equal(target.secondaryLabel, "");
    assertCleanDisplayLabel(target.displayLabel, target.targetId);
    assert.doesNotMatch(target.displayLabel, /Project:|- Workspace|Active|Inactive/);
  }
}

function assertCleanDisplayLabel(displayLabel, targetId) {
  assert.ok(displayLabel, "display label should be present");
  assert.doesNotMatch(displayLabel, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "display label should not expose raw UUIDs");
  assert.equal(displayLabel.includes(targetId), false, "display label should not echo the target id");
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
