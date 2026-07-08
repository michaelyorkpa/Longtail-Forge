import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.11";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-context-targets-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-context-targets-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Files-Context-Targets-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesServiceSource = readText("src/services/files.service.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { filesService, handleFileScanJob } = await import("../src/services/files.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);
  const fixtures = await seedFixtures(session);

  await assertContextAndTargetOptionRuntime(session, fixtures);
  await assertIntegrity();

  console.log("Files context and attachable targets conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Files context/targets conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Files context/targets conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files context/targets conversion version");

  assert.match(filesServiceSource, /from "\.\.\/core\/database\.js"/, "Files service should import database access from the provider-neutral facade");
  assertFunctionUsesNamedParams("updateAttachmentContext", [
    /await db\.run\(`/,
    /SET module_id = :attachmentModuleId/,
    /target_type = :attachmentTargetType/,
    /target_id = :attachmentTargetId/,
    /client_id = :attachmentClientId/,
    /project_id = :attachmentProjectId/,
    /file_attachment_id = :attachmentId/,
  ]);
  assertFunctionUsesNamedParams("readAttachableTarget", [
    /safeSqlIdentifier\(attachableType\.tableName\)/,
    /safeSqlIdentifier\(attachableType\.idField\)/,
    /safeSqlIdentifier\(attachableType\.labelField\)/,
    /await db\.get\(`/,
    /WHERE \${workspaceField} = :attachableTargetWorkspaceId/,
    /AND \${idField} = :attachableTargetId/,
  ]);
  assertFunctionUsesNamedParams("readAttachmentContextLabels", [
    /db\.get\(`/,
    /workspace_id = :contextWorkspaceId/,
    /id = :contextClientId/,
    /id = :contextProjectId/,
  ]);
  assertFunctionUsesNamedParams("readWorkspaceType", [
    /const row = await db\.get\(`/,
    /workspace_id = :workspaceId/,
  ]);
  assertFunctionUsesNamedParams("readClientLabelMap", [
    /await db\.query\(`/,
    /id IN \(:clientIds\)/,
  ]);
  assertFunctionUsesNamedParams("readProjectLabelMap", [
    /await db\.query\(`/,
    /id IN \(:projectIds\)/,
  ]);
  assertFunctionUsesNamedParams("readAttachableTargetOptionRows", [
    /await readTableColumnSet\(tableName\)/,
    /db\.dialect\.comparison\.likePattern\(filters\.search/,
    /db\.dialect\.comparison\.containsNoCase\(labelExpression, ":attachableTargetSearchPattern"\)/,
    /return db\.query\(`/,
    /LIMIT :attachableTargetLimit/,
  ]);
  assertFunctionUsesNamedParams("assertNoDuplicateActiveAttachmentContext", [
    /const row = await db\.get\(`/,
    /workspace_id = :attachmentWorkspaceId/,
    /file_id = :attachmentFileId/,
    /module_id = :attachmentModuleId/,
    /target_type = :attachmentTargetType/,
    /target_id = :attachmentTargetId/,
    /file_attachment_id <> :attachmentId/,
  ]);

  const convertedBlocks = [
    functionBlock(filesServiceSource, "updateAttachmentContext"),
    functionBlock(filesServiceSource, "readAttachableTarget"),
    functionBlock(filesServiceSource, "readAttachmentContextLabels"),
    functionBlock(filesServiceSource, "readWorkspaceType"),
    functionBlock(filesServiceSource, "readAttachableTargetOptionRows"),
    functionBlock(filesServiceSource, "readClientLabelMap"),
    functionBlock(filesServiceSource, "readProjectLabelMap"),
    functionBlock(filesServiceSource, "assertNoDuplicateActiveAttachmentContext"),
  ].join("\n");

  assert.doesNotMatch(convertedBlocks, /\bsqlText\b|\bsqlInteger\b|\bsqlNullableText\b|\bsqlNullableInteger\b|\bquerySql\b|\brunSql\b/, "converted Files context/target blocks should not use literal helpers or compatibility query wrappers");
  assert.doesNotMatch(convertedBlocks, /COLLATE NOCASE|LOWER\(\${labelExpression}\)/, "converted Files target-option blocks should route case-insensitive SQL through dialect seams");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.10b:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the current Files conversion ratchet");
  assert.match(auditDocs, /\| services\/files\.service \| Converted \| 0 \| 0 \| 32 \| 33 \|/, "audit inventory should record the fully converted Files service state");
  assert.match(auditDocs, /0\.33\.5\.27\.19 Files Context and Attachable Targets Conversion[\s\S]*File Context attachment update path[\s\S]*687 runtime literal-helper invocations[\s\S]*137 direct interpolated SQL operation sites[\s\S]*214 existing bound operation sites/, "audit docs should record the Files context/targets conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.19[\s\S]*Files context and attachable-target metadata paths[\s\S]*687 remaining helper invocations/, "database docs should record the concrete Files context/targets conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.19 - Conversion wave: Files context and attachable targets[\s\S]*- \[x\] Convert File Context update reads\/writes[\s\S]*- \[x\] Preserve attachment-scoped File Context behavior[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.19 - [\s\S]*Files context and attachable targets conversion[\s\S]*687 helper invocations[\s\S]*137 direct interpolated operation sites[\s\S]*214 bound operation sites/, "changelog should record the Files context/targets conversion burndown");
  assert.match(regressionSuite, /scripts\/files-context-targets-conversion-regression\.mjs/, "regression suite should include the Files context/targets conversion proof");
}

function assertFunctionUsesNamedParams(functionName, patterns) {
  const block = functionBlock(filesServiceSource, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

async function assertContextAndTargetOptionRuntime(session, fixtures) {
  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("Files context target conversion body").toString("base64"),
    displayName: "files-context-targets.txt",
    moduleId: "tasks",
    originalFilename: "files-context-targets.txt",
    targetId: fixtures.originalTaskId,
    targetType: "task",
    visibility: "private",
  });
  await handleFileScanJob({
    payload: {
      fileId: upload.file.fileId,
      requestedByUserId: session.user_id,
      workspaceId: session.workspace_id,
    },
  });

  const targetOptions = await filesService.listAttachableTargetOptions(session, {
    clientId: fixtures.clientId,
    projectId: fixtures.projectId,
  });
  const taskOption = targetOptions.options.find((option) => option.targetId === fixtures.originalTaskId);
  const noteOption = targetOptions.options.find((option) => option.targetId === fixtures.noteId);
  assert.ok(taskOption, "target options should include the readable Task target");
  assert.ok(noteOption, "target options should include the readable Note target");
  assert.equal(taskOption.label, "Files Context Original Task");
  assert.equal(noteOption.label, "Files Context Note");
  assert.equal(noteOption.clientLabel, "Files Context Client");
  assert.equal(noteOption.projectLabel, "Files Context Project");
  assert.match(noteOption.contextLabel, /Files Context Client/);
  assert.match(noteOption.contextLabel, /Files Context Project/);
  assertNoStorageLeak(targetOptions);
  assertSafeLabels(targetOptions);

  const rawLabelOptions = await filesService.listAttachableTargetOptions(session, {
    moduleId: "tasks",
    search: fixtures.rawLabelTaskId,
    targetType: "task",
  });
  assert.equal(rawLabelOptions.count, 1, "raw-id titled targets should remain searchable by target value");
  assert.equal(rawLabelOptions.options[0].label, "Untitled Task", "raw-id target labels should be replaced with a readable fallback");
  assertSafeLabels(rawLabelOptions);

  const updated = await filesService.updateAttachmentContext(session, upload.attachment.fileAttachmentId, {
    clientId: fixtures.clientId,
    moduleId: "notes",
    projectId: fixtures.projectId,
    targetId: fixtures.noteId,
    targetType: "note",
  });
  assert.equal(updated.attachment.moduleId, "notes");
  assert.equal(updated.attachment.targetType, "note");
  assert.equal(updated.attachment.targetId, fixtures.noteId);
  assert.equal(updated.attachment.clientId, fixtures.clientId);
  assert.equal(updated.attachment.projectId, fixtures.projectId);
  assert.equal(updated.attachment.targetLabel, "Files Context Note");
  assert.equal(updated.attachment.clientLabel, "Files Context Client");
  assert.equal(updated.attachment.projectLabel, "Files Context Project");
  assertNoStorageLeak(updated);
  assertSafeLabels(updated);

  const attachmentRows = await querySql(`
SELECT module_id, target_type, target_id, client_id, project_id
FROM file_attachments
WHERE file_attachment_id = ${sqlText(upload.attachment.fileAttachmentId)};
`);
  assert.deepEqual(attachmentRows[0], {
    client_id: fixtures.clientId,
    module_id: "notes",
    project_id: fixtures.projectId,
    target_id: fixtures.noteId,
    target_type: "note",
  });

  const secondLink = await filesService.attachExistingFile(session, {
    fileId: upload.file.fileId,
    moduleId: "tasks",
    targetId: fixtures.secondTaskId,
    targetType: "task",
    visibility: "private",
  });

  await assert.rejects(
    () => filesService.updateAttachmentContext(session, secondLink.attachment.fileAttachmentId, {
      clientId: fixtures.clientId,
      moduleId: "notes",
      projectId: fixtures.projectId,
      targetId: fixtures.noteId,
      targetType: "note",
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /already attached/);
      return true;
    },
    "duplicate active attachment contexts should remain rejected",
  );
}

async function seedFixtures(session) {
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const projectId = randomUUID();
  const originalTaskId = randomUUID();
  const secondTaskId = randomUUID();
  const noteId = randomUUID();
  const rawLabelTaskId = randomUUID();

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(session.workspace_id)};

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
)
VALUES (
  ${sqlText(clientId)},
  ${sqlText(session.workspace_id)},
  NULL,
  'Files Context Client',
  'Active',
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
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(clientId)},
  NULL,
  'Files Context Project',
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
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
VALUES
  (${sqlText(originalTaskId)}, ${sqlText(session.workspace_id)}, ${sqlText(clientId)}, ${sqlText(projectId)}, 'Files Context Original Task', '', 'open', 'normal', ${sqlText(session.user_id)}, ${sqlText(session.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(secondTaskId)}, ${sqlText(session.workspace_id)}, ${sqlText(clientId)}, ${sqlText(projectId)}, 'Files Context Second Task', '', 'open', 'normal', ${sqlText(session.user_id)}, ${sqlText(session.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(rawLabelTaskId)}, ${sqlText(session.workspace_id)}, ${sqlText(clientId)}, ${sqlText(projectId)}, ${sqlText(rawLabelTaskId)}, '', 'open', 'normal', ${sqlText(session.user_id)}, ${sqlText(session.user_id)}, ${sqlText(now)}, ${sqlText(now)});

INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  client_id,
  project_id,
  metadata_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(noteId)},
  ${sqlText(session.workspace_id)},
  'Files Context Note',
  NULL,
  '',
  '',
  '',
  'general',
  'reference',
  'manual',
  'active',
  'private',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  '{}',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    clientId,
    noteId,
    originalTaskId,
    projectId,
    rawLabelTaskId,
    secondTaskId,
  };
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
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

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: workspaceId,
  };
}

function assertNoStorageLeak(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /storage_key/i);
  assert.doesNotMatch(text, /storageKey/i);
  assert.doesNotMatch(text, /storage_path/i);
  assert.doesNotMatch(text, /storagePath/i);
  assert.doesNotMatch(text, /scanner/i);
  assert.doesNotMatch(text, /protected[\\/]/i);
}

function assertSafeLabels(value) {
  for (const [key, item] of walk(value)) {
    if (!/label$/i.test(key)) {
      continue;
    }
    assert.ok(!looksLikeRawIdentifier(item), `${key} should not expose a raw identifier label`);
  }
}

function* walk(value, key = "") {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* walk(item, key);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    yield [key, String(value || "")];
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    yield* walk(childValue, childKey);
  }
}

function looksLikeRawIdentifier(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}/i.test(text);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function functionBlock(source, functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}`);
  const syncStart = source.indexOf(`function ${functionName}`);
  const start = asyncStart >= 0 && (syncStart < 0 || asyncStart < syncStart) ? asyncStart : syncStart;
  assert.notEqual(start, -1, `${functionName} should exist`);

  let braceStart = -1;
  let parenDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") {
      parenDepth += 1;
    } else if (character === ")") {
      parenDepth -= 1;
    } else if (character === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  assert.notEqual(braceStart, -1, `${functionName} body should exist`);
  let depth = 0;

  for (let index = braceStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find end of ${functionName}`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
