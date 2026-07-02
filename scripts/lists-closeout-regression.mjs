import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Closeout-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { helpService } = await import("../src/services/help.service.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");
const { searchService } = await import("../src/services/search.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await searchService.ensureSearchBackendStorage({ refresh: true });

  const businessSession = await seedBusinessSession();
  const familySession = await seedFamilySession();

  await assertManifestAndHelp();
  await assertHelpDiscoveryAndSearch(businessSession);
  await assertDeveloperDocs();
  await assertFrameworkBoundaries();
  await assertBusinessUseCases(businessSession);
  await assertFamilyUseCases(familySession);
  await assertResumeSafeState(businessSession);
  await assertIntegrity();

  console.log("Lists closeout regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestAndHelp() {
  const listsModule = modulesService.getModule("lists");
  const articleIds = new Set(listsModule.help.articles.map((article) => article.id));
  const articleBodies = await Promise.all(listsModule.help.articles.map(async (article) => {
    const body = article.body || await fs.readFile(path.join("help", ...article.contentPath.split("/")), "utf8");
    return `${article.title}\n${article.summary}\n${body}`;
  }));
  const articleText = articleBodies.join("\n");

  assert.equal(listsModule.version, "0.33.5.21.0.5");
  assert.ok(listsModule.help.sections.some((section) => section.id === "lists.overview"));
  for (const articleId of [
    "lists.basics",
    "lists.items",
    "lists.statuses",
    "lists.reusable",
    "lists.business-context",
    "lists.links",
    "lists.search-tags-files",
    "lists.resume-context",
  ]) {
    assert.ok(articleIds.has(articleId), `${articleId} should be declared as a current-state Lists Help article`);
  }

  for (const phrase of [
    "operational execution aids",
    "Checking an item, completing an item, and marking an item as received are separate actions",
    "Reusable lists are normal list records",
    "Business workspaces label the module as Procurement Lists",
    "Lists can link to supported records",
    "Search results remain permission-shaped",
    "Tags are not permissions",
    "Files attach through the framework file service",
    "next unchecked item",
  ]) {
    assert.match(articleText, new RegExp(escapeRegExp(phrase), "i"));
  }

  assert.doesNotMatch(articleText, /future roadmap|coming soon|will be implemented|medical|diagnostic|neurodiverg/i);
  assert.doesNotMatch(articleText, /inventory management|ERP software/i, "Help should describe Lists boundaries without positioning Lists as inventory or ERP");
}

async function assertHelpDiscoveryAndSearch(session) {
  const help = await helpService.list(session);
  const listsArticles = help.articles.filter((article) => article.moduleId === "lists");

  assert.ok(help.sections.some((section) => section.id === "lists.overview"));
  assert.equal(listsArticles.length, 8);
  assert.ok(listsArticles.every((article) => article.ownerType === "module"));
  assert.ok(listsArticles.every((article) => article.moduleId === "lists"));
  assert.ok(listsArticles.every((article) => article.title));

  const { article } = await helpService.readArticle(session, "lists.resume-context");
  assert.match(article.body, /earliest needed-by date/i);
  assert.doesNotMatch(article.body, /future roadmap/i);

  const summary = await searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    workspaceId: session.workspace_id,
  });
  const rows = await querySql(`
SELECT module_id, record_type, record_id, source, title
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'lists'
  AND record_type = 'help_article'
ORDER BY record_id;
`);

  assert.equal(summary.counts.failed, 0);
  assert.deepEqual(rows.map((row) => row.record_id).sort(), listsArticles.map((article) => article.id).sort());
  assert.ok(rows.every((row) => row.source === "Help"));
}

async function assertDeveloperDocs() {
  const docs = await fs.readFile(path.join(process.cwd(), "docs/lists-module.md"), "utf8");

  for (const phrase of [
    "current Lists implementation as of 0.33.5.21.0.5",
    "The framework owns module registration",
    "Workspace Labels",
    "Reusable Lists And Catalog Suggestions",
    "Catalog item create/update history",
    "Linked Records",
    "Resume-Safe Context",
    "Search, Tags, And Files",
    "What Lists Should Not Own",
  ]) {
    assert.match(docs, new RegExp(escapeRegExp(phrase)));
  }

  assert.doesNotMatch(docs, /future roadmap promises/i);
}

async function assertFrameworkBoundaries() {
  const service = await fs.readFile(path.join(process.cwd(), "src/modules/lists/lists.service.js"), "utf8");
  const repository = await fs.readFile(path.join(process.cwd(), "src/modules/lists/lists.repo.js"), "utf8");
  const routes = await fs.readFile(path.join(process.cwd(), "src/modules/lists/lists.routes.js"), "utf8");
  const moduleManifest = await fs.readFile(path.join(process.cwd(), "src/modules/lists/module.js"), "utf8");

  assert.match(service, /permissionsService/, "Lists service should use framework permissions");
  assert.match(service, /searchIndexSyncService/, "Lists service should use framework search sync");
  assert.match(service, /auditService\.record/, "Lists service should use framework audit");
  assert.match(service, /modulesService\.emitInternalEvent/, "Lists service should emit framework internal events");
  assert.match(moduleManifest, /help:/, "Lists Help should be contributed through the module manifest");
  assert.match(moduleManifest, /taggableTypes:/, "Lists should declare tag integration through the manifest");
  assert.match(moduleManifest, /searchableTypes:/, "Lists should declare search integration through the manifest");
  assert.match(moduleManifest, /attachableTypes:/, "Lists should declare file attachment integration through the manifest");
  assert.doesNotMatch(`${service}\n${repository}\n${routes}`, /INSERT\s+INTO\s+search_index|UPDATE\s+search_index|DELETE\s+FROM\s+search_index|search_index_fts/i);
  assert.doesNotMatch(`${service}\n${repository}\n${routes}`, /INSERT\s+INTO\s+file_attachments|UPDATE\s+file_attachments|DELETE\s+FROM\s+file_attachments|INSERT\s+INTO\s+files|UPDATE\s+files|DELETE\s+FROM\s+files/i);
}

async function assertBusinessUseCases(session) {
  const { clientId, projectId } = await seedClientProject(session.workspace_id);
  const procurement = await listsService.create({
    list_type: "procurement",
    project_id: projectId,
    title: "Closeout Project Parts List",
  }, session);

  assert.equal(procurement.list.client_id, clientId);
  assert.equal(procurement.list.project_id, projectId);

  await listsService.createItem(procurement.list.list_id, {
    item_name: "Closeout control board",
    needed_by_date: "2026-06-20",
    quantity: 1,
    save_to_catalog: true,
    unit: "each",
  }, session);
  await listsService.createItem(procurement.list.list_id, {
    item_name: "Closeout office labels",
    quantity: 2,
    unit: "pack",
  }, session);

  const suggestions = await listsService.suggestItems(session, {
    listId: procurement.list.list_id,
    q: "control",
  });
  assert.equal(suggestions.suggestions[0].item_name, "Closeout control board");

  const reusable = await listsService.markReusable(procurement.list.list_id, session);
  assert.equal(reusable.list.is_reusable, true);
  const workingCopy = await listsService.duplicate(procurement.list.list_id, {}, session);
  assert.equal(workingCopy.list.status, "active");
  assert.equal(workingCopy.list.sourceContext.sourceList.title, "Closeout Project Parts List");
  assert.ok(workingCopy.items.every((item) => item.checked_at === null && item.completed_at === null));

  const bom = await listsService.create({
    list_type: "bill_of_materials",
    project_id: projectId,
    title: "Closeout Finalized BOM",
  }, session);
  await listsService.createItem(bom.list.list_id, {
    actual_cost: 12,
    item_name: "Closeout BOM Part",
    purchase_status: "received",
  }, session);
  const finalized = await listsService.finalize(bom.list.list_id, session);
  assert.equal(finalized.list.status, "finalized");
  const duplicatedBom = await listsService.duplicate(bom.list.list_id, {}, session);
  assert.equal(duplicatedBom.list.status, "active");
  assert.equal(duplicatedBom.list.sourceContext.duplicatedFrom.status, "finalized");
}

async function assertFamilyUseCases(session) {
  const grocery = await listsService.create({
    title: "Closeout Grocery List",
  }, session);
  assert.equal(grocery.list.list_type, "shopping");
  assert.equal(grocery.list.client_id, null);

  const packing = await listsService.create({
    list_type: "packing",
    title: "Closeout Trip Packing List",
  }, session);
  await listsService.createItem(packing.list.list_id, {
    item_name: "Charging cable",
    quantity: 1,
  }, session);
  const reusablePacking = await listsService.markReusable(packing.list.list_id, session);
  assert.equal(reusablePacking.list.is_reusable, true);
  const tripCopy = await listsService.duplicate(packing.list.list_id, {}, session);
  assert.equal(tripCopy.items[0].item_name, "Charging cable");

  await assert.rejects(
    () => listsService.create({
      client_id: randomUUID(),
      title: "Blocked family client list",
    }, session),
    /business workspaces/i,
  );
}

async function assertResumeSafeState(session) {
  const list = await listsService.create({
    title: "Closeout Resume List",
  }, session);
  const firstItem = await listsService.createItem(list.list.list_id, {
    item_name: "Resume first item",
    needed_by_date: "2026-06-21",
  }, session);
  await listsService.createItem(list.list.list_id, {
    item_name: "Resume second item",
    needed_by_date: "2026-06-22",
  }, session);
  await listsService.checkItem(list.list.list_id, firstItem.item.list_item_id, session);

  const read = await listsService.read(list.list.list_id, session);
  assert.equal(read.list.progress.totalItemCount, 2);
  assert.equal(read.list.progress.checkedItemCount, 1);
  assert.equal(read.list.progress.nextUncheckedItemLabel, "Resume second item");
  assert.equal(read.list.progress.earliestNeededByDate, "2026-06-21");
  assert.ok(read.list.progress.lastActivityAt);
  assert.equal(read.list.resumeContext.sourceUrl, `lists.html?list=${encodeURIComponent(list.list.list_id)}`);

  await listsService.softDelete(list.list.list_id, session);
  await assert.rejects(
    () => listsService.read(list.list.list_id, session),
    /List not found/,
  );
}

async function seedBusinessSession() {
  const workspace = (await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`))[0];
  assert.ok(workspace?.workspace_id, "default workspace should exist");

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(workspace.workspace_id)};
`);

  const user = await readProtectedUser();
  return {
    active_workspace_id: workspace.workspace_id,
    home_workspace_id: workspace.workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspace.workspace_id,
  };
}

async function seedFamilySession() {
  const workspaceId = randomUUID();
  const user = await readProtectedUser();

  await runSql(`
INSERT INTO workspaces (
  workspace_id,
  name,
  workspace_type,
  status,
  created_at,
  updated_at
) VALUES (
  ${sqlText(workspaceId)},
  'Closeout Family Workspace',
  'family',
  'active',
  '2026-06-11T00:00:00.000Z',
  '2026-06-11T00:00:00.000Z'
);

INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  task_timers_enabled,
  created_at,
  updated_at
) VALUES (
  ${sqlText(workspaceId)},
  1,
  1,
  '',
  'monthly',
  1,
  0,
  '0.25',
  1,
  30,
  '2026-06-11T00:00:00.000Z',
  1,
  '2026-06-11T00:00:00.000Z',
  '2026-06-11T00:00:00.000Z'
);

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(user.user_id)},
  ${sqlText(workspaceId)},
  'active',
  '2026-06-11T00:00:00.000Z',
  '2026-06-11T00:00:00.000Z'
);

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
) VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(user.user_id)},
  'workspace_admin',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  '2026-06-11T00:00:00.000Z',
  '2026-06-11T00:00:00.000Z'
);
`);

  await modulesService.syncModuleRegistry(workspaceId);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}

async function seedClientProject(workspaceId) {
  const now = "2026-06-11T00:00:00.000Z";
  const clientId = randomUUID();
  const projectId = randomUUID();

  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
) VALUES (
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  NULL,
  'Closeout Client',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
) VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  'Closeout Project',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return { clientId, projectId };
}

async function readProtectedUser() {
  const user = (await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`))[0];

  assert.ok(user?.user_id, "protected user fixture is required");
  return user;
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
