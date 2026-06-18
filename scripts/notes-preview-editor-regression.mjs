import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-preview-editor-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-preview-editor.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Preview-Editor-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertServerPreview(session);
  await assertStaticBrowserContract();
  await assertEditorKeyboardBehavior();

  console.log("Notes preview and editor regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertServerPreview(session) {
  const markdown = [
    "# Preview Heading",
    "",
    "- Parent",
    "  - Child",
    "",
    "| Left | Right |",
    "| --- | --- |",
    "| A | B |",
    "",
    "[[Reference Note|friendly label]]",
  ].join("\n");
  const preview = await notesService.previewMarkdown({ body_markdown: markdown }, session);

  assert.equal(preview.bodyFormat, "markdown");
  assert.equal(preview.bodyMarkdown, markdown);
  assert.equal(preview.bodyHtmlFormat, "html");
  assert.match(preview.bodyHtml, /<h1>Preview Heading<\/h1>/);
  assert.match(preview.bodyHtml, /<li>\s*(?:<p>)?Parent(?:<\/p>)?\s*<ul>\s*<li>Child<\/li>/);
  assert.match(preview.bodyHtml, /<table>/);
  assert.match(preview.bodyHtml, /<span class="note-wiki-link"/);

  const taskPreview = await notesService.previewMarkdown({ body_markdown: "- [x] Completed\n- [ ] Open" }, session);
  assert.match(taskPreview.bodyHtml, /<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled checked> Completed<\/li>/);
  assert.match(taskPreview.bodyHtml, /<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled> Open<\/li>/);
  assert.doesNotMatch(taskPreview.bodyHtml, /<li>\s*<input[^>]+type="checkbox"/, "task-list items should not keep the default list item marker");

  await assert.rejects(
    () => notesService.previewMarkdown({ body_markdown: "[bad](javascript:alert(1))" }, session),
    /unsafe/i,
  );
}

async function assertStaticBrowserContract() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const notesEditorJs = await fs.readFile(path.join(process.cwd(), "public/js/shared/notes-editor.js"), "utf8");
  const notesHtml = await fs.readFile(path.join(process.cwd(), "views/protected/notes.html"), "utf8");
  const css = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");
  const routesSource = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.routes.js"), "utf8");

  assert.match(notesHtml, /js\/shared\/notes-editor\.js\?v=3/);
  assert.match(notesHtml, /css\/longtail-forge\.css\?v=37/);
  assert.match(notesHtml, /js\/notes\.js\?v=40/);
  assert.match(notesJs, /api\.postJson\("\/api\/notes\/preview"/);
  assert.match(notesJs, /previewRequestId/);
  assert.match(notesJs, /bodyInput\?\.addEventListener\("input", \(\) => renderPreview\(\)\)/);
  assert.doesNotMatch(notesJs, /function markdownPreviewNodes/);
  assert.doesNotMatch(notesJs, /paragraph\.startsWith\("# "\)/);
  assert.match(notesEditorJs, /continueListMarker/);
  assert.match(notesEditorJs, /event\.key === "Enter"/);
  assert.match(css, /li\.markdown-task-list-item\s*\{[\s\S]*list-style:\s*none;/, "task-list CSS should suppress the normal list marker");
  assert.match(css, /\.markdown-task-list-checkbox/, "task-list CSS should align rendered checkboxes");
  assert.ok(
    routesSource.indexOf('notesRoutes.post("/notes/preview"') < routesSource.indexOf('notesRoutes.get("/notes/:noteId"'),
    "preview route should be declared before dynamic note routes",
  );
}

async function assertEditorKeyboardBehavior() {
  const source = await fs.readFile(path.join(process.cwd(), "public/js/shared/notes-editor.js"), "utf8");
  const windowStub = {
    LongtailForge: {},
    Event: class Event {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = Boolean(options.bubbles);
      }
    },
  };
  vm.runInNewContext(source, { window: windowStub });
  const editorApi = windowStub.LongtailForge.notesEditor;

  const indentTarget = createTextarea("alpha\nbeta", 0, "alpha\nbeta".length);
  editorApi.handleKeydown(keyEvent("Tab"), indentTarget);
  assert.equal(indentTarget.value, "  alpha\n  beta");

  editorApi.handleKeydown(keyEvent("Tab", { shiftKey: true }), indentTarget);
  assert.equal(indentTarget.value, "alpha\nbeta");

  const unordered = createTextarea("- first", "- first".length, "- first".length);
  editorApi.handleKeydown(keyEvent("Enter"), unordered);
  assert.equal(unordered.value, "- first\n- ");

  editorApi.handleKeydown(keyEvent("Enter"), unordered);
  assert.equal(unordered.value, "- first\n");

  const ordered = createTextarea("1. first", "1. first".length, "1. first".length);
  editorApi.handleKeydown(keyEvent("Enter"), ordered);
  assert.equal(ordered.value, "1. first\n2. ");

  const task = createTextarea("- [x] done", "- [x] done".length, "- [x] done".length);
  editorApi.handleKeydown(keyEvent("Enter"), task);
  assert.equal(task.value, "- [x] done\n- [ ] ");

  const plain = createTextarea("plain", "plain".length, "plain".length);
  const event = keyEvent("Enter");
  editorApi.handleKeydown(event, plain);
  assert.equal(plain.value, "plain");
  assert.equal(event.prevented, false);
}

function createTextarea(value, selectionStart = 0, selectionEnd = selectionStart) {
  return {
    dataset: {},
    dispatches: [],
    listeners: {},
    selectionEnd,
    selectionStart,
    value,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    dispatchEvent(event) {
      this.dispatches.push(event);
      return true;
    },
    focus() {},
  };
}

function keyEvent(key, options = {}) {
  return {
    key,
    shiftKey: Boolean(options.shiftKey),
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
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
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "UTC",
    protected_user: true,
  };
}
