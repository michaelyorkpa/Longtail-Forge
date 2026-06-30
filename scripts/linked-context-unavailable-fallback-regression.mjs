import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-linked-context-unavailable-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-linked-context-unavailable.db");
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "linked-context-unavailable-secure-key";
process.env.SUPER_ADMIN_PASSWORD = "Linked-Context-Unavailable-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const {
  closeSqlite,
  initializeDatabase,
  querySql,
  runSql,
  sqlNullableText,
  sqlText,
} = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertStaticFallbackContract();
  await assertUnavailableContextReadModel(session);
  await assertStrictCreateStillRejectsMissingTargets(session);
  await assertIntegrity();

  console.log("Linked Context unavailable fallback regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticFallbackContract() {
  const notesServiceSource = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8");
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");

  assert.match(notesServiceSource, /function normalizeSavedTarget\(payload = \{\}\)/, "Saved linked context rows should use a soft read normalizer");
  assert.match(notesServiceSource, /async function canAccessSavedContextTarget\(session, target, seenTargets = new Set\(\)\)/, "Saved context access should distinguish stale rows from strict create validation");
  assert.match(notesServiceSource, /return safeUnavailableTarget\(normalizedTarget\);/, "Failed target summaries should return safe fallback payloads");
  assert.match(notesJs, /function unavailableTargetLabel\(targetType = ""\)[\s\S]*client: "Unavailable client"[\s\S]*project: "Unavailable project"[\s\S]*task: "Unavailable task"[\s\S]*note: "Unavailable note"[\s\S]*list: "Unavailable list"[\s\S]*"Unavailable linked context"/, "Browser fallback labels should stay type-specific where supported and generic otherwise");
}

async function assertUnavailableContextReadModel(session) {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    client: `missing-client-${suffix}`,
    project: `missing-project-${suffix}`,
    task: `missing-task-${suffix}`,
    note: `missing-note-${suffix}`,
    list: `missing-list-${suffix}`,
    legacy: `missing-legacy-${suffix}`,
  };

  await setWorkspace(session.workspace_id, "business", "Unavailable Fallback Business");
  const created = await notesService.create({
    title: "Unavailable fallback host note",
    body_markdown: "Saved context points at stale targets.",
    library_bucket: "reference",
  }, session);

  await insertLink(session, created.note.note_id, "client-projects", "client", ids.client);
  await insertLink(session, created.note.note_id, "client-projects", "project", ids.project);
  await insertLink(session, created.note.note_id, "tasks", "task", ids.task);
  await insertLink(session, created.note.note_id, "notes", "note", ids.note);
  await insertLink(session, created.note.note_id, "lists", "list", ids.list);
  await insertLink(session, created.note.note_id, "legacy", "legacy-ticket", ids.legacy);

  const read = await notesService.read(created.note.note_id, session);

  const expectedLabels = new Map([
    ["client", "Unavailable client"],
    ["project", "Unavailable project"],
    ["task", "Unavailable task"],
    ["note", "Unavailable note"],
    ["list", "Unavailable list"],
    ["legacy-ticket", "Unavailable linked context"],
  ]);

  for (const link of read.note.links) {
    const targetType = link.target_type || link.targetType;
    const expectedLabel = expectedLabels.get(targetType);
    if (!expectedLabel) {
      continue;
    }

    assert.equal(link.label, expectedLabel);
    assert.equal(link.display_label, expectedLabel);
    assert.equal(link.source_url || "", "");
    assert.equal(link.is_available, false);
    assertSafeLabelSet(link, link.target_id || link.targetId);
  }
}

async function assertStrictCreateStillRejectsMissingTargets(session) {
  await assert.rejects(
    () => notesService.create({
      title: "Invalid missing linked target",
      body_markdown: "Normal create validation remains strict.",
      links: [
        {
          module_id: "tasks",
          target_type: "task",
          target_id: `missing-create-task-${randomUUID().slice(0, 8)}`,
        },
      ],
    }, session),
    /linked note target|access/i,
  );
}

async function insertLink(session, noteId, moduleId, targetType, targetId) {
  const now = new Date().toISOString();

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
  ${sqlText(moduleId)},
  ${sqlText(targetType)},
  ${sqlText(targetId)},
  'related',
  'related',
  ${sqlNullableText(session.user_id)},
  ${sqlText(now)},
  NULL,
  NULL
);
`);
}

function assertSafeLabelSet(record = {}, targetId = "") {
  const labels = [
    record.label,
    record.display_label,
    record.displayLabel,
    record.secondary_label,
    record.secondaryLabel,
    record.subtitle,
    record.full_label,
    record.fullLabel,
    record.aria_label,
    record.ariaLabel,
  ].filter(Boolean);

  for (const label of labels) {
    assert.equal(String(label).includes(targetId), false, "Fallback labels should not expose raw target ids");
  }
}

async function setWorkspace(workspaceId, workspaceType, workspaceName) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)},
    name = ${sqlText(workspaceName)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY rowid LIMIT 1;");
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
  const result = await querySql("PRAGMA integrity_check;");
  assert.equal(result[0]?.integrity_check, "ok");
}
