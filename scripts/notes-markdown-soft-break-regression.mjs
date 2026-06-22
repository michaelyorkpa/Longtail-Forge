import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MARKDOWN_RENDER_MODES,
  renderMarkdownToHtml,
} from "../src/core/markdown/markdown.service.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-markdown-soft-break-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-markdown-soft-break.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Markdown-Soft-Break-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertFrameworkModes();
  await assertNotesSoftBreaks(session);
  await assertRawHtmlStaysEscaped(session);

  console.log("Notes Markdown soft line break regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertFrameworkModes() {
  const source = "Alpha\nBeta";
  const documentHtml = renderMarkdownToHtml(source);
  const userAuthoredHtml = renderMarkdownToHtml(source, { mode: MARKDOWN_RENDER_MODES.USER_AUTHORED });

  assert.doesNotMatch(documentHtml, /<br>/, "default Markdown rendering should preserve repo-authored document line-break semantics");
  assert.match(userAuthoredHtml, /Alpha<br\s*\/?>\s*Beta/, "user-authored Markdown mode should render soft line breaks visibly");
}

async function assertNotesSoftBreaks(session) {
  const bodyMarkdown = [
    "12v side",
    "Fuse 1 is lights",
    "Fuse 2 is Heater",
    "Fuse 3 is Pump",
    "",
    "Second paragraph",
    "Next line",
  ].join("\n");

  const created = await notesService.create({
    title: "Soft break fixture",
    body_markdown: bodyMarkdown,
    library_bucket: "reference",
  }, session);
  const readResult = await notesService.read(created.note.note_id, session);
  const preview = await notesService.previewMarkdown({ body_markdown: bodyMarkdown }, session);

  assert.equal(readResult.note.body_markdown, bodyMarkdown, "saved Markdown should not be rewritten to force line breaks");
  assert.equal(preview.bodyMarkdown, bodyMarkdown, "preview Markdown echo should not be rewritten to force line breaks");

  for (const html of [readResult.note.body_html, preview.bodyHtml]) {
    assert.match(
      html,
      /<p>12v side<br\s*\/?>\s*Fuse 1 is lights<br\s*\/?>\s*Fuse 2 is Heater<br\s*\/?>\s*Fuse 3 is Pump<\/p>/,
      "Notes read and preview HTML should render single newlines as visible line breaks",
    );
    assert.match(
      html,
      /<\/p>\s*<p>Second paragraph<br\s*\/?>\s*Next line<\/p>/,
      "blank lines should still create normal paragraph boundaries",
    );
  }
}

async function assertRawHtmlStaysEscaped(session) {
  const preview = await notesService.previewMarkdown({ body_markdown: "Line one\n<br>\nLine two" }, session);

  assert.match(preview.bodyHtml, /&lt;br&gt;/, "raw break markup should render as escaped text");
  assert.doesNotMatch(preview.bodyHtml, /Line one<br\s*\/?>\s*<br\s*\/?>\s*Line two/, "raw break markup should not be accepted as active HTML");
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
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    protected_user: true,
  };
}
