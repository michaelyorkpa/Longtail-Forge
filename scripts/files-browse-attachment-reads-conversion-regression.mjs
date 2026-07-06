import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.32";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-browse-reads-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-browse-reads-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Files-Browse-Reads-Conversion-Test-123!";
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
  const taskId = await createTask(session, `Files 27.18 task ${randomUUID()}`);

  await assertBrowseReadMetadataPaths(session, taskId);
  await assertIntegrity();

  console.log("Files browse and attachment reads conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Files browse/read conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Files browse/read conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files browse/read conversion version");

  assert.match(filesServiceSource, /from "\.\.\/core\/database\.js"/, "Files service should import database access from the provider-neutral facade");
  assertFunctionUsesNamedParams("listAttachments", [
    /file_attachments\.workspace_id = :attachmentWorkspaceId/,
    /db\.dialect\.comparison\.likePattern\(filename/,
    /db\.dialect\.comparison\.containsNoCase\("files\.original_filename", ":attachmentFilenamePattern"\)/,
    /await db\.query\(`/,
  ]);
  assertFunctionUsesNamedParams("readAttachmentCandidateRows", [
    /LIMIT :attachmentPageLimit/,
    /OFFSET :attachmentPageOffset/,
    /return db\.query\(`/,
  ]);
  assertFunctionUsesNamedParams("readFileRow", [
    /return db\.get\(`/,
    /workspace_id = :workspaceId/,
    /file_id = :fileId/,
  ]);
  assertFunctionUsesNamedParams("readAttachmentById", [
    /return db\.get\(`/,
    /file_attachment_id = :attachmentId/,
  ]);
  assertFunctionUsesNamedParams("readActiveAttachmentsForFile", [
    /return db\.query\(`/,
    /file_attachments\.file_id = :fileId/,
  ]);

  const convertedBlocks = [
    functionBlock(filesServiceSource, "listAttachments"),
    functionBlock(filesServiceSource, "readAttachmentCandidateRows"),
    functionBlock(filesServiceSource, "readFileRow"),
    functionBlock(filesServiceSource, "readAttachmentById"),
    functionBlock(filesServiceSource, "readActiveAttachmentsForFile"),
    functionBlock(filesServiceSource, "attachmentOrderByClause"),
  ].join("\n");

  assert.doesNotMatch(convertedBlocks, /\bsqlText\b|\bsqlInteger\b|\bsqlNullableText\b|\bsqlNullableInteger\b|\bquerySql\b|\brunSql\b/, "converted Files browse/read blocks should not use literal helpers or compatibility query wrappers");
  assert.doesNotMatch(convertedBlocks, /LOWER\(files\.|COLLATE NOCASE/, "converted Files browse/read blocks should route case-insensitive SQL through dialect seams");
  assert.match(functionBlock(filesServiceSource, "attachmentOrderByClause"), /orderByNoCase\("COALESCE\(files\.display_name, files\.original_filename, ''\)", "ASC"\)/, "filename ordering should use the comparison seam");
  assert.match(functionBlock(filesServiceSource, "attachmentOrderByClause"), /orderByNoCase\("files\.status", "ASC"\)/, "status ordering should use the comparison seam");

  assert.match(auditDocs, /Current totals as of 0\.33\.5\.27\.32:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 385[\s\S]*Total runtime database operation calls seen by the audit scanner: 429/, "audit docs should record the current Files conversion ratchet");
  assert.match(auditDocs, /\| services\/files\.service \| Converted \| 0 \| 0 \| 32 \| 33 \|/, "audit inventory should record the fully converted Files service state");
  assert.match(auditDocs, /0\.33\.5\.27\.18 Files Browse and Attachment Reads Conversion[\s\S]*browse\/read metadata paths[\s\S]*709 runtime literal-helper invocations[\s\S]*145 direct interpolated SQL operation sites[\s\S]*206 existing bound operation sites/, "audit docs should record the Files browse/read conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.18[\s\S]*Files browse and attachment read metadata paths[\s\S]*709 remaining helper invocations/, "database docs should record the concrete Files browse/read conversion");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.18 - Conversion wave: Files browse and attachment reads[\s\S]*- \[x\] Convert Files browse[\s\S]*- \[x\] Preserve compact browse\/recovery listing[\s\S]*- \[x\] Coordinate with storage follow-ups[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Files browse/read conversion slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.18 - [\s\S]*Files browse and attachment reads conversion[\s\S]*709 helper invocations[\s\S]*145 direct interpolated operation sites[\s\S]*206 bound operation sites/, "changelog should record the Files browse/read conversion burndown");
  assert.match(regressionSuite, /scripts\/files-browse-attachment-reads-conversion-regression\.mjs/, "regression suite should include the Files browse/read conversion proof");
}

function assertFunctionUsesNamedParams(functionName, patterns) {
  const block = functionBlock(filesServiceSource, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

async function assertBrowseReadMetadataPaths(session, taskId) {
  const searchNeedle = `Needle_%_${randomUUID().slice(0, 8)}`;
  const first = await uploadAndScan(session, taskId, {
    originalFilename: `${searchNeedle}-alpha.txt`,
    text: "first text preview body",
  });
  const second = await uploadAndScan(session, taskId, {
    originalFilename: `${searchNeedle}-beta.md`,
    text: "# Markdown preview\n\nSecond file body.",
  });

  await runSql(`
UPDATE file_attachments
SET created_at = '2026-01-01T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_attachment_id = ${sqlText(first.attachment.fileAttachmentId)};

UPDATE file_attachments
SET created_at = '2026-01-02T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_attachment_id = ${sqlText(second.attachment.fileAttachmentId)};
`);

  const filtered = await filesService.listAttachments(session, {
    filename: searchNeedle.toLowerCase(),
    limit: 1,
    moduleId: "tasks",
    offset: 0,
    sort: "filename",
    targetId: taskId,
    targetType: "task",
  });
  assert.equal(filtered.pagination.returned, 1, "filename-filtered attachment reads should stay paged");
  assert.equal(filtered.pagination.hasMore, true, "visible attachment page should report another readable row");
  assert.equal(filtered.attachments[0].fileId, first.file.fileId, "filename sort should remain stable and case-insensitive");
  assert.equal(filtered.attachments[0].file.originalFilename, first.file.originalFilename, "browse reads should expose the persisted safe filename");
  assert.equal(JSON.stringify(filtered).includes("storage_key"), false, "browse reads must not expose storage keys");

  const counts = await filesService.countAttachmentsForTargets(session, {
    moduleId: "tasks",
    targetType: "task",
    targetIds: [taskId],
  });
  assert.equal(counts.counts[taskId], 2, "attachment counts should keep permission-shaped visible counts");

  const readFile = await filesService.readFileForSession(session, first.file.fileId);
  assert.equal(readFile.fileId, first.file.fileId, "readFileForSession should return the uploaded file through the converted read helper");
  assert.equal(Object.hasOwn(readFile, "storage_key"), false, "file reads must not expose storage keys");

  const preview = await filesService.readAttachmentPreviewDescriptor(session, second.attachment.fileAttachmentId);
  assert.equal(preview.preview.state, "previewable", "markdown attachment should remain previewable");
  assert.equal(preview.preview.kind, "markdown", "preview descriptor should preserve preview kind");

  const content = await filesService.readAttachmentPreviewContent(session, second.attachment.fileAttachmentId);
  assert.equal(content.content.kind, "markdown", "preview content should still use the route-safe markdown response");
  assert.match(content.content.bodyHtml, /<h1>Markdown preview<\/h1>/);

  const download = await filesService.downloadFile(session, first.file.fileId);
  assert.equal(download.file.fileId, first.file.fileId, "download should still resolve file metadata through converted reads");
  assert.equal((await streamToString(download.stream)), "first text preview body");
}

async function uploadAndScan(session, taskId, options) {
  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from(options.text).toString("base64"),
    displayName: options.originalFilename,
    moduleId: "tasks",
    originalFilename: options.originalFilename,
    targetId: taskId,
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

  return upload;
}

async function createTask(session, title) {
  const taskId = randomUUID();
  const now = new Date().toISOString();
  await runSql(`
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
VALUES (
  ${sqlText(taskId)},
  ${sqlText(session.workspace_id)},
  NULL,
  NULL,
  ${sqlText(title)},
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
  return taskId;
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

async function streamToString(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
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
