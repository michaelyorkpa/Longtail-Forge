import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12i";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-propagation-service-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-propagation-service-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Tag-Propagation-Service-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const registrySource = readText("src/services/tag-propagation-registry.js");
const tagsServiceSource = readText("src/services/tags.service.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { readTagPropagationResolver } = await import("../src/services/tag-propagation-registry.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);
  const fixtures = await createResolverFixtures(session);
  await assertBuiltInResolvers(session.workspace_id, fixtures);
  await assertTagsServiceRuntime(session, fixtures);
  await assertIntegrity();

  console.log("Tag propagation and tags service conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Tag propagation service conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Tag propagation service conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Tag propagation service conversion version");

  assert.match(registrySource, /import \{ db \} from "\.\.\/core\/database\.js";/, "tag propagation registry should import the provider-neutral db facade");
  assert.doesNotMatch(registrySource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "tag propagation registry should be fully off literal helpers");
  assert.equal(countMatches(registrySource, /\bdb\.query\(/g), 15, "tag propagation registry should keep its 15 resolver read sites as bound db.query calls");
  assert.equal(countMatches(registrySource, /workspace_id = :workspaceId/g), 18, "tag propagation resolver reads should bind workspace scope, including both sides of note UNION reads");
  assert.match(registrySource, /AND module_id = :moduleId/, "note propagation resolvers should bind the client-projects module ID");
  assert.match(registrySource, /AND target_type = :sourceTargetType/, "note propagation resolvers should bind target type values");
  assert.match(registrySource, /function text\(value\)[\s\S]*String\(value \?\? ""\)/, "registry should preserve sqlText empty-string normalization through bound params");

  assert.match(tagsServiceSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "tags service should import the provider-neutral db facade");
  assert.doesNotMatch(tagsServiceSource, /\.\.\/db\/index\.js/, "tags service should not import legacy db helpers after conversion");
  assert.doesNotMatch(tagsServiceSource, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "tags service should be fully off literal helpers");
  assert.equal(countMatches(tagsServiceSource, /\bdb\.query\(/g), 2, "tags service should keep propagation count reads as bound db.query calls");
  assert.equal(countMatches(tagsServiceSource, /\bdb\.get\(/g), 1, "tags service should keep the dynamic descriptor target read as a bound db.get call");
  assert.match(tagsServiceSource, /function readTargetRecord[\s\S]*assertIdentifier\(descriptor\.tableName[\s\S]*db\.get\(`[\s\S]*WHERE \$\{workspaceField\} = :workspaceId[\s\S]*AND \$\{idField\} = :targetId/, "tag target reads should keep identifier allowlisting and bind target values");
  assert.match(tagsServiceSource, /function text\(value\)[\s\S]*String\(value \?\? ""\)/, "tags service should preserve sqlText empty-string normalization through bound params");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.10b:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the Tag propagation service conversion ratchet");
  assert.match(auditDocs, /\| services\/tag-propagation-registry \| Converted \| 0 \| 0 \| 15 \| 15 \|/, "audit inventory should mark the tag propagation registry converted");
  assert.match(auditDocs, /\| services\/tags\.service \| Converted \| 0 \| 0 \| 3 \| 3 \|/, "audit inventory should mark tags service converted");
  assert.match(auditDocs, /0\.33\.5\.27\.24 Tag Propagation and Tags Service Conversion[\s\S]*`services\/tag-propagation-registry` and `services\/tags\.service` are fully converted[\s\S]*367 runtime literal-helper invocations[\s\S]*68 direct interpolated SQL operation sites[\s\S]*291 existing bound operation sites/, "audit docs should record the Tag propagation service conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.24[\s\S]*`services\/tag-propagation-registry` and `services\/tags\.service` are converted[\s\S]*367 remaining helper invocations/, "database docs should record the concrete Tag propagation service conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.24 - Conversion wave: Tag propagation and tags service[\s\S]*- \[x\] Convert `services\/tag-propagation-registry`[\s\S]*- \[x\] Preserve Client\/Project\/Task\/Note propagation targets[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.24 - [\s\S]*Tag propagation and tags service conversion[\s\S]*367 helper invocations[\s\S]*68 direct interpolated operation sites[\s\S]*291 bound operation sites/, "changelog should record the Tag propagation service conversion burndown");
  assert.match(regressionSuite, /scripts\/tag-propagation-service-conversion-regression\.mjs/, "regression suite should include the Tag propagation service conversion proof");
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user?.user_id, "fresh database should include a protected user");
  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function createResolverFixtures(session) {
  const now = new Date().toISOString();
  const parentClientId = `conversion-parent-client-${randomUUID()}`;
  const childClientId = `conversion-child-client-${randomUUID()}`;
  const parentProjectId = `conversion-parent-project-${randomUUID()}`;
  const childProjectId = `conversion-child-project-${randomUUID()}`;
  const taskId = `conversion-task-${randomUUID()}-' OR 1=1 --`;
  const clientNoteId = `conversion-client-note-${randomUUID()}`;
  const projectNoteId = `conversion-project-note-${randomUUID()}`;
  const linkedClientNoteId = `conversion-linked-client-note-${randomUUID()}`;
  const linkedProjectNoteId = `conversion-linked-project-note-${randomUUID()}`;

  await insertClient(session.workspace_id, parentClientId, "", "Bound Parent Client", now);
  await insertClient(session.workspace_id, childClientId, parentClientId, "Bound Child Client", now);
  await insertProject(session.workspace_id, parentProjectId, childClientId, "", "Bound Parent Project", now);
  await insertProject(session.workspace_id, childProjectId, childClientId, parentProjectId, "Bound Child Project", now);
  await insertTask(session, taskId, childProjectId, now);
  await insertNote(session, clientNoteId, "Client Bound Note", { clientId: parentClientId, now });
  await insertNote(session, projectNoteId, "Project Bound Note", { projectId: parentProjectId, now });
  await insertNote(session, linkedClientNoteId, "Linked Client Bound Note", { now });
  await insertNote(session, linkedProjectNoteId, "Linked Project Bound Note", { now });
  await insertNoteLink(session, linkedClientNoteId, "client", parentClientId, now);
  await insertNoteLink(session, linkedProjectNoteId, "project", parentProjectId, now);

  return {
    childClientId,
    childProjectId,
    clientNoteId,
    linkedClientNoteId,
    linkedProjectNoteId,
    parentClientId,
    parentProjectId,
    projectNoteId,
    taskId,
  };
}

async function assertBuiltInResolvers(workspaceId, fixtures) {
  await assertResolverPairs("client-projects.client-children", [
    { sourceTargetId: fixtures.parentClientId },
    { targetId: fixtures.childClientId },
    {},
  ], workspaceId, [`client:${fixtures.parentClientId}->client:${fixtures.childClientId}`]);

  await assertResolverPairs("client-projects.client-projects", [
    { sourceTargetId: fixtures.childClientId },
    { targetId: fixtures.parentProjectId },
    {},
  ], workspaceId, [`client:${fixtures.childClientId}->project:${fixtures.parentProjectId}`]);

  await assertResolverPairs("client-projects.project-children", [
    { sourceTargetId: fixtures.parentProjectId },
    { targetId: fixtures.childProjectId },
    {},
  ], workspaceId, [`project:${fixtures.parentProjectId}->project:${fixtures.childProjectId}`]);

  await assertResolverPairs("tasks.project-tasks", [
    { sourceTargetId: fixtures.childProjectId },
    { targetId: fixtures.taskId },
    {},
  ], workspaceId, [`project:${fixtures.childProjectId}->task:${fixtures.taskId}`]);

  await assertResolverPairs("notes.client-notes", [
    { sourceTargetId: fixtures.parentClientId },
    {},
  ], workspaceId, [
    `client:${fixtures.parentClientId}->note:${fixtures.clientNoteId}`,
    `client:${fixtures.parentClientId}->note:${fixtures.linkedClientNoteId}`,
  ]);
  await assertResolverPairs("notes.client-notes", [
    { targetId: fixtures.clientNoteId },
  ], workspaceId, [`client:${fixtures.parentClientId}->note:${fixtures.clientNoteId}`]);
  await assertResolverPairs("notes.client-notes", [
    { targetId: fixtures.linkedClientNoteId },
  ], workspaceId, [`client:${fixtures.parentClientId}->note:${fixtures.linkedClientNoteId}`]);

  await assertResolverPairs("notes.project-notes", [
    { sourceTargetId: fixtures.parentProjectId },
    {},
  ], workspaceId, [
    `project:${fixtures.parentProjectId}->note:${fixtures.projectNoteId}`,
    `project:${fixtures.parentProjectId}->note:${fixtures.linkedProjectNoteId}`,
  ]);
  await assertResolverPairs("notes.project-notes", [
    { targetId: fixtures.projectNoteId },
  ], workspaceId, [`project:${fixtures.parentProjectId}->note:${fixtures.projectNoteId}`]);
  await assertResolverPairs("notes.project-notes", [
    { targetId: fixtures.linkedProjectNoteId },
  ], workspaceId, [`project:${fixtures.parentProjectId}->note:${fixtures.linkedProjectNoteId}`]);
}

async function assertResolverPairs(resolverId, contexts, workspaceId, expectedPairs) {
  const resolver = readTagPropagationResolver(resolverId);
  assert.equal(typeof resolver, "function", `${resolverId} should be registered`);

  for (const context of contexts) {
    const rows = await resolver({ ...context, workspaceId });
    const found = rows.map(pairKey).sort();

    for (const expectedPair of expectedPairs) {
      assert.ok(found.includes(expectedPair), `${resolverId} should include ${expectedPair}`);
    }
  }
}

async function assertTagsServiceRuntime(session, fixtures) {
  const parentProjectTag = (await tagsService.create(session, {
    name: "Bound Parent Project Service Tag",
  })).tag;

  await tagsService.assign(session, {
    tagId: parentProjectTag.tag_id,
    targetId: fixtures.parentProjectId,
    targetType: "project",
  });

  assert.ok(
    (await tagsService.listPropagatedTagsForTarget(session, "project", fixtures.childProjectId))
      .some((assignment) => assignment.tag_id === parentProjectTag.tag_id),
    "project-child propagation should still materialize through converted service and registry reads",
  );
  assert.ok(
    (await tagsService.listPropagatedTagsForTarget(session, "task", fixtures.taskId))
      .some((assignment) => assignment.tag_id === parentProjectTag.tag_id),
    "project-task propagation should still cascade through converted service and registry reads",
  );

  const taskTag = (await tagsService.create(session, {
    name: "Bound Task Service Tag",
  })).tag;
  await tagsService.assign(session, {
    tagId: taskTag.tag_id,
    targetId: fixtures.taskId,
    targetType: "task",
  });
  const directTaskAssignments = await tagsService.listDirectTagsForTarget(session, "task", fixtures.taskId);
  assert.deepEqual(
    directTaskAssignments.map((assignment) => assignment.tag_id).sort(),
    [taskTag.tag_id],
    "SQL-like task IDs should still read and write through bound service target lookups",
  );

  const repair = await tagsService.repairTagPropagation(session, { dryRun: true });
  assert.equal(repair.dryRun, true);
  assert.ok(repair.rules_scanned >= 6, "repair should still scan built-in propagation rules");
  assert.ok(repair.scanned_records >= 4, "repair should still read resolver pairs");
  assert.ok(repair.direct_assignments >= 2, "repair count reads should include direct assignments");
  assert.ok(repair.propagated_assignments >= 2, "repair count reads should include propagated assignments");

  const clientsRows = await querySql("SELECT COUNT(*) AS count FROM clients;");
  assert.ok(Number(clientsRows[0]?.count || 0) >= 2, "bound resolver inputs should leave client storage intact");
}

async function insertClient(workspaceId, clientId, parentClientId, name, now) {
  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
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
)
VALUES (
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  ${parentClientId ? sqlText(parentClientId) : "NULL"},
  ${sqlText(name)},
  'active',
  'yes',
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
`);
}

async function insertProject(workspaceId, projectId, clientId, parentProjectId, name, now) {
  await runSql(`
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  ${parentProjectId ? sqlText(parentProjectId) : "NULL"},
  ${sqlText(name)},
  'active',
  'yes',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertTask(session, taskId, projectId, now) {
  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(projectId)},
  'Bound Propagation Task',
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertNote(session, noteId, title, options = {}) {
  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  status,
  visibility,
  client_id,
  project_id,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(noteId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(title)},
  ${sqlText(noteId)},
  '',
  '',
  '',
  'active',
  'internal',
  ${options.clientId ? sqlText(options.clientId) : "NULL"},
  ${options.projectId ? sqlText(options.projectId) : "NULL"},
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(options.now)},
  ${sqlText(options.now)}
);
`);
}

async function insertNoteLink(session, noteId, targetType, targetId, now) {
  await runSql(`
INSERT INTO note_links (
  note_link_id,
  workspace_id,
  note_id,
  module_id,
  target_type,
  target_id,
  link_role,
  scope_role,
  created_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.workspace_id)},
  ${sqlText(noteId)},
  'client-projects',
  ${sqlText(targetType)},
  ${sqlText(targetId)},
  'related',
  'context',
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  NULL,
  '{}'
);
`);
}

async function enableAuditLogging(workspaceId) {
  await runSql(`
UPDATE workspace_settings
SET audit_logging_enabled = 1,
    audit_retention_days = 90
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function pairKey(pair) {
  return `${pair.sourceTargetType}:${pair.sourceTargetId}->${pair.targetType}:${pair.targetId}`;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
