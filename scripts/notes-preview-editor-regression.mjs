import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { extractFunctionBlock } from "./test-support/source-scan.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-preview-editor-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-preview-editor.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Preview-Editor-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspaceId = await readWorkspace();
  const session = await readProtectedSession(workspaceId);

  await assertServerPreview(session);
  await assertStaticBrowserContract();
  await assertEditorKeyboardBehavior();

  console.log("Notes preview and editor regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} NotesSession */
/** The textarea stand-in the editor commands operate on. */
/** @typedef {{ dataset: Record<string, string>, dispatches: unknown[], listeners: Record<string, (event: unknown) => void>, selectionEnd: number, selectionStart: number, value: string, addEventListener: (type: string, handler: (event: unknown) => void) => void, dispatchEvent: (event: unknown) => boolean, focus: () => void }} EditorTextarea */
/** The keyboard event the editor reads; `prevented` is the harness's record of the call. */
/** @typedef {{ key: string, shiftKey: boolean, prevented: boolean, preventDefault: () => void }} EditorKeyEvent */
/** The subset of the installed editor helper this owner drives. */
/** @typedef {{ applyCommand: (textarea: EditorTextarea, command: string) => void, handleKeydown: (event: EditorKeyEvent, textarea: EditorTextarea) => void }} NotesEditorApi */

/** @param {NotesSession} session */
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
    "++underlined text++",
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
  assert.match(preview.bodyHtml, /<u>underlined text<\/u>/);
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

  assert.match(notesHtml, /css\/longtail-forge\.css/);
  assert.match(notesHtml, /js\/shared\/icons\.js/);
  assert.match(notesHtml, /js\/shared\/notes-editor\.js/);
  assert.match(notesHtml, /js\/notes\.js/);
  assert.match(notesJs, /markdownEditor = document\.querySelector\("\[data-note-markdown-editor\]"\);/);
  assert.match(notesJs, /api\.postJson\("\/api\/notes\/preview"/);
  assert.match(notesJs, /previewRequestId/);
  assert.match(notesJs, /bodyInput\?\.addEventListener\("input", \(\) => renderPreview\(\)\)/);
  assert.match(notesJs, /function createNoteMarkdownEditorSection\(toolbar, bodyField, preview\)[\s\S]*className:\s*"notes-markdown-editor-body"[\s\S]*children:\s*\[bodyField,\s*preview\][\s\S]*className:\s*"notes-markdown-editor"[\s\S]*children:\s*\[toolbar,\s*body\]/);
  assert.match(notesJs, /const markdownEditor = createNoteMarkdownEditorSection\(toolbar, bodyField, preview\);/);
  assert.match(notesJs, /\[heading, titleField, detailsGroup, secureWarning, contextPanel, markdownEditor, formStatus\]\.forEach/);
  assert.doesNotMatch(notesJs, /\[heading, titleField, detailsGroup, secureWarning, contextPanel, toolbar, bodyField, preview, formStatus\]\.forEach/, "toolbar should not be a loose sibling that can fall into preview/body layout");
  assert.match(notesJs, /command:\s*"unorderedList",\s*icon:\s*"list",\s*label:\s*"Unordered list"/);
  assert.match(notesJs, /command:\s*"orderedList",\s*text:\s*"1\.",\s*label:\s*"Ordered list"/);
  assert.match(notesJs, /command:\s*"underline",\s*text:\s*"U",\s*label:\s*"Underline"/);
  assert.match(notesJs, /command:\s*"link",\s*icon:\s*"link",\s*label:\s*"Link"/);
  assert.match(notesJs, /preview:\s*true,\s*icon:\s*"eye",\s*label:\s*"Preview"/);
  assert.match(notesJs, /ariaLabel:\s*action\.label/);
  assert.match(notesJs, /title:\s*action\.label/);
  assert.doesNotMatch(notesJs, /"unorderedList",\s*"List",\s*"List"/, "toolbar should not expose the old generic List text button");
  assert.doesNotMatch(notesJs, /function markdownPreviewNodes/);
  assert.doesNotMatch(notesJs, /paragraph\.startsWith\("# "\)/);
  assert.match(notesEditorJs, /continueListMarker/);
  assert.match(notesEditorJs, /event\.key === "Enter"/);
  assertToolbarToggleDoesNotMoveMarkup(notesJs);
  assert.match(css, /\.notes-markdown-editor\s*\{[\s\S]*display:\s*grid;[\s\S]*width:\s*100%;[\s\S]*\}/, "Markdown editor shell should keep toolbar and body in a stable full-width stack");
  assert.match(css, /\.notes-markdown-editor-body\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*width:\s*100%;[\s\S]*\}/, "Markdown editor body should default to a one-column full-width editor when preview is off");
  assert.match(css, /@media\s*\(max-width:\s*899px\)\s*\{[\s\S]*\.notes-markdown-editor\.is-preview-visible \.notes-markdown-editor-body\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*\}/, "Preview-on mobile layout should keep textarea and preview stacked");
  assert.match(css, /@media\s*\(min-width:\s*900px\)\s*\{[\s\S]*\.notes-markdown-editor\.is-preview-visible \.notes-markdown-editor-body\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(280px,\s*1fr\);[\s\S]*\}/, "Preview-on desktop layout should split editor and preview into two body columns");
  assert.match(css, /\.notes-markdown-editor > \.notes-editor-toolbar\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/, "Toolbar should remain the full-width first row above editor and preview content");
  assert.match(css, /\.notes-editor-form\s*\{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*hidden;/, "Notes editor form should not allow preview layout to widen the modal scroll container");
  assert.match(css, /\.notes-markdown-editor-body > label\s*\{[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/, "Body field should fit the mobile stacked editor grid");
  assert.match(css, /\.notes-preview\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*max-height:\s*min\(58vh,\s*560px\);[\s\S]*overflow:\s*auto;/, "Preview should fit its grid track and own long-content scrolling");
  assert.match(css, /\.notes-preview pre,\s*\n\.notes-preview table\s*\{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/, "Wide preview code and tables should scroll inside the preview instead of overflowing the modal");
  assert.match(css, /\.notes-preview table\s*\{[\s\S]*display:\s*block;/, "Preview tables should become block scroll regions when wider than the preview column");
  assert.match(css, /\.notes-preview code\s*\{[\s\S]*overflow-wrap:\s*anywhere;/, "Long inline code should not force horizontal overflow");
  assert.doesNotMatch(css, /\.notes-editor-form > \.surface-modal-footer[\s\S]*position:/, "Notes should not override the framework-owned sticky modal footer positioning");
  assert.match(css, /li\.markdown-task-list-item\s*\{[\s\S]*list-style:\s*none;/, "task-list CSS should suppress the normal list marker");
  assert.match(css, /\.markdown-task-list-checkbox/, "task-list CSS should align rendered checkboxes");
  assert.ok(
    routesSource.indexOf('notesRoutes.post("/notes/preview"') < routesSource.indexOf('notesRoutes.get("/notes/:noteId"'),
    "preview route should be declared before dynamic note routes",
  );
}

/** @param {string} notesJs */
function assertToolbarToggleDoesNotMoveMarkup(notesJs) {
  // Cut through the published helper rather than a hand-written regex. The previous
  // pattern ended the region at a closing brace in column 0, which stopped being this
  // function's own brace the moment `0.33.33.33.6` scoped `notes.js` inside a closure.
  const togglePreviewSource = extractFunctionBlock(notesJs, "togglePreview");

  assert.match(togglePreviewSource, /preview\.hidden = !visible;/, "Preview toggle should continue toggling preview visibility");
  assert.match(togglePreviewSource, /updatePreviewLayoutState\(visible\);/, "Preview toggle should update only the editor layout state");
  assert.doesNotMatch(togglePreviewSource, /append|insertBefore|replaceChildren|noteEditorToolbar|noteMarkdownEditor/, "Preview toggle should not move toolbar/editor markup");
  assert.match(notesJs, /function updatePreviewLayoutState\(visible\) \{[\s\S]*markdownEditor\?\.classList\.toggle\("is-preview-visible", visible\);[\s\S]*\}/);
}

async function assertEditorKeyboardBehavior() {
  const source = await fs.readFile(path.join(process.cwd(), "public/js/shared/notes-editor.js"), "utf8");
  /** @type {{ LongtailForge: { notesEditor?: NotesEditorApi }, Event: new (type: string, options?: { bubbles?: boolean }) => { type: string, bubbles: boolean } }} */
  const windowStub = {
    LongtailForge: {},
    Event: class Event {
      /** @param {string} type @param {{ bubbles?: boolean }} [options] */
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = Boolean(options.bubbles);
      }
    },
  };
  vm.runInNewContext(source, { window: windowStub });
  const editorApi = windowStub.LongtailForge.notesEditor;
  assert.ok(editorApi, "the notes editor helper should install itself on the window namespace");

  const unorderedInsert = createTextarea("", 0, 0);
  editorApi.applyCommand(unorderedInsert, "unorderedList");
  assert.equal(unorderedInsert.value, "- List item");

  const unorderedSelection = createTextarea("existing item", 0, "existing item".length);
  editorApi.applyCommand(unorderedSelection, "unorderedList");
  assert.equal(unorderedSelection.value, "- existing item");

  const orderedInsert = createTextarea("", 0, 0);
  editorApi.applyCommand(orderedInsert, "orderedList");
  assert.equal(orderedInsert.value, "1. List item");

  const orderedSelection = createTextarea("existing item", 0, "existing item".length);
  editorApi.applyCommand(orderedSelection, "orderedList");
  assert.equal(orderedSelection.value, "1. existing item");

  const underlineInsert = createTextarea("", 0, 0);
  editorApi.applyCommand(underlineInsert, "underline");
  assert.equal(underlineInsert.value, "++underlined text++");

  const underlineSelection = createTextarea("existing item", 0, "existing item".length);
  editorApi.applyCommand(underlineSelection, "underline");
  assert.equal(underlineSelection.value, "++existing item++");

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

/** @param {string} value @param {number} [selectionStart] @param {number} [selectionEnd] @returns {EditorTextarea} */
function createTextarea(value, selectionStart = 0, selectionEnd = selectionStart) {
  return {
    dataset: {},
    dispatches: [],
    listeners: {},
    selectionEnd,
    selectionStart,
    value,
    /** @param {string} type @param {(event: unknown) => void} handler */
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    /** @param {unknown} event */
    dispatchEvent(event) {
      this.dispatches.push(event);
      return true;
    },
    focus() {},
  };
}

/** @param {string} key @param {{ shiftKey?: boolean }} [options] @returns {EditorKeyEvent} */
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

/** @returns {Promise<string>} */
async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  const workspaceId = requireFirstRow(rows, "workspace should exist").workspace_id;
  assert.ok(typeof workspaceId === "string" && workspaceId, "the seeded workspace should carry an id");
  return workspaceId;
}

/** @param {string} workspaceId @returns {Promise<NotesSession>} */
async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  return workspaceSessionFixture({
    ...requireFirstRow(rows, "protected user should exist"),
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    workspace_id: workspaceId,
  });
}
