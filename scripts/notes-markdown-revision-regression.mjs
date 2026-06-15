import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-markdown-revision-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-markdown-revision.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Markdown-Revision-Test-123!";

const {
  assertSafeMarkdown,
  createChangelogEntry,
  createMarkdownExcerpt,
  createRevisionSnapshot,
  describeRevisionChanges,
  extractPlainTextFromMarkdown,
  extractWikiLinks,
  normalizeMarkdown,
  renderMarkdownToSafeHtml,
  shouldCreateRevision,
  slugifyNoteTitle,
  validateMarkdownSafety,
} = await import("../src/modules/notes/markdown.js");
const { noteToSearchDocument } = await import("../src/modules/notes/search-indexers.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertMarkdownHelpers();
  await assertEditorBoundary();
  await assertRevisionMigrationApplied();
  await assertRevisionSchema();
  await assertRevisionStorage();
  await assertSearchTextUsesSharedMarkdown();
  await assertIntegrity();

  console.log("Notes Markdown and revision regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertMarkdownHelpers() {
  const markdown = normalizeMarkdown(`
# Heading

**Bold** and *italic* with [safe link](https://example.com).

> Quote

- [ ] Task
- Item
  - Nested item
    - Deep nested item
    1. Deep ordered item
1. Ordered

\`\`\`
const x = 1;
\`\`\`

[[Reference Note|friendly label]]
`);

  assert.equal(markdown.includes("\r"), false);
  assert.equal(assertSafeMarkdown(markdown), markdown);
  assert.equal(validateMarkdownSafety("<script>alert(1)</script>").ok, false);
  assert.equal(validateMarkdownSafety("[bad](javascript:alert(1))").ok, false);
  assert.throws(() => assertSafeMarkdown("<img src=x onerror=alert(1)>"), /unsafe/i);

  const html = renderMarkdownToSafeHtml(markdown);
  assert.ok(html.includes("<h1>Heading</h1>"));
  assert.ok(html.includes("<strong>Bold</strong>"));
  assert.ok(html.includes("<em>italic</em>"));
  assert.match(html, /<blockquote>\s*<p>Quote<\/p>\s*<\/blockquote>/, "Notes should render blockquotes through the shared CommonMark renderer");
  assert.ok(html.includes("type=\"checkbox\" disabled"));
  assert.match(html, /<li>Item\s*<ul>\s*<li>Nested item\s*<ul>\s*<li>Deep nested item<\/li>\s*<\/ul>/, "Indented unordered list items should render as nested lists");
  assert.match(html, /<ol>\s*<li>Deep ordered item\s*<\/li>\s*<\/ol>/, "Indented ordered list items should render as nested ordered lists");
  assert.ok(html.includes("<pre><code>const x = 1;\n</code></pre>"));
  assert.ok(html.includes("note-wiki-link"));
  assert.equal(html.includes("<script>"), false);

  const plainText = extractPlainTextFromMarkdown(markdown);
  assert.ok(plainText.includes("Heading"));
  assert.ok(plainText.includes("friendly label"));
  assert.equal(plainText.includes("```"), false);
  assert.ok(createMarkdownExcerpt(markdown, 40).endsWith("..."));

  const wikiLinks = extractWikiLinks(markdown);
  assert.deepEqual(wikiLinks, [{
    targetTitle: "Reference Note",
    targetSlug: "reference-note",
    displayText: "friendly label",
    raw: "[[Reference Note|friendly label]]",
    status: "unresolved",
  }]);
  assert.equal(slugifyNoteTitle("  Reference Note!  "), "reference-note");
}

async function assertEditorBoundary() {
  const source = await fs.readFile(path.join(root, "public/js/shared/notes-editor.js"), "utf8");
  const notesMarkdownSource = await fs.readFile(path.join(root, "src/modules/notes/markdown.js"), "utf8");

  assert.match(notesMarkdownSource, /\.\.\/\.\.\/core\/markdown\/markdown\.service\.js/, "Notes Markdown adapter should use the shared framework Markdown service");

  [
    "LongtailForge",
    "notesEditor",
    "createPlainTextarea",
    "applyCommand",
    "bold",
    "italic",
    "heading",
    "link",
    "checklist",
    "unorderedList",
    "orderedList",
    "codeBlock",
    "blockquote",
    "wikiLink",
    "keydown",
    "Tab",
    "Enter",
    "continueListMarker",
    "shiftKey",
    "indent",
    "outdent",
  ].forEach((needle) => {
    assert.ok(source.includes(needle), `notes editor helper should include ${needle}`);
  });
  assert.equal(/editorState|proprietary/i.test(source), false, "editor helper should not introduce proprietary storage state");
}

async function assertSearchTextUsesSharedMarkdown() {
  const workspace = await readWorkspace();
  const document = await noteToSearchDocument({
    note_id: "note-search-markdown-1",
    workspace_id: workspace.workspace_id,
    title: "Search Markdown",
    body_markdown: normalizeMarkdown(`
# Search Heading

- Parent
  - Child
- [x] Search task

| Name | Status |
| --- | --- |
| Alpha | Ready |
`),
    body_excerpt: "",
    body_plaintext_index: "",
    library_bucket: "reference",
    status: "active",
    visibility: "internal",
    security_mode: "normal",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.ok(document, "searchable note should produce a search document");
  assert.match(document.body, /Search Heading/, "Notes search text should include headings from shared Markdown plain text");
  assert.match(document.body, /Child/, "Notes search text should include nested list text");
  assert.match(document.body, /Search task/, "Notes search text should include task-list labels without checkbox syntax");
  assert.match(document.body, /Alpha Ready/, "Notes search text should include table text");
  assert.doesNotMatch(document.body, /[#|]|\[x\]/, "Notes search text should not expose Markdown control syntax");
}

async function assertRevisionMigrationApplied() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '045';
`);

  assert.deepEqual(rows[0], {
    version: "045",
    module_id: "notes",
    name: "add_note_revisions_and_wiki_links",
  });
}

async function assertRevisionSchema() {
  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('note_revisions', 'note_wiki_links')
ORDER BY name;
`);
  assert.deepEqual(tables.map((row) => row.name), ["note_revisions", "note_wiki_links"]);

  await assertColumns("note_revisions", [
    "note_revision_id",
    "workspace_id",
    "note_id",
    "revision_number",
    "title",
    "body_markdown",
    "body_excerpt",
    "note_type",
    "library_bucket",
    "status",
    "visibility",
    "security_mode",
    "changed_by_user_id",
    "change_summary",
    "change_reason",
    "created_at",
    "metadata_json",
  ]);
  await assertColumns("note_wiki_links", [
    "note_wiki_link_id",
    "workspace_id",
    "note_id",
    "source_revision_id",
    "raw_target",
    "target_slug",
    "display_text",
    "target_note_id",
    "status",
    "created_at",
    "updated_at",
    "removed_at",
    "metadata_json",
  ]);

  const indexes = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_note_revisions_workspace_note_revision',
    'idx_note_revisions_workspace_note',
    'idx_note_revisions_workspace_note_library',
    'idx_note_revisions_workspace_changed_by',
    'idx_note_revisions_workspace_created_at',
    'idx_note_wiki_links_workspace_note',
    'idx_note_wiki_links_workspace_target_slug',
    'idx_note_wiki_links_workspace_target_note',
    'idx_note_wiki_links_workspace_status',
    'idx_note_wiki_links_unique_active_target'
  )
ORDER BY name;
`);
  assert.equal(indexes.length, 10, "Notes revision pass should create expected history/wiki indexes");
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
}

async function assertRevisionStorage() {
  const workspace = await readWorkspace();
  const user = await readUser();
  const now = new Date().toISOString();
  const note = {
    note_id: "note-markdown-1",
    workspace_id: workspace.workspace_id,
    title: "Markdown Note",
    body_markdown: "# Markdown Note\n\n[[Linked Note]]",
    note_type: "general",
    library_bucket: "reference",
    status: "active",
    visibility: "internal",
    security_mode: "normal",
  };
  const nextNote = {
    ...note,
    title: "Markdown Note Updated",
    body_markdown: "# Markdown Note Updated\n\n[[Linked Note]]",
  };
  const changes = describeRevisionChanges(note, nextNote);
  const snapshot = createRevisionSnapshot(nextNote, {
    revisionNumber: 1,
    changedByUserId: user.user_id,
    changeSummary: "Updated title and body.",
    createdAt: now,
  });
  const changelogEntry = createChangelogEntry(snapshot, changes);

  assert.equal(shouldCreateRevision(note, nextNote), true);
  assert.deepEqual(changes.map((change) => change.field), ["title", "body_markdown"]);
  assert.equal(changelogEntry.titleChanged, true);
  assert.equal(changelogEntry.bodyChanged, true);
  assert.equal(changelogEntry.libraryBucketChanged, false);

  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  body_markdown,
  body_excerpt,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  created_at,
  updated_at
) VALUES (
  ${sqlText(note.note_id)},
  ${sqlText(note.workspace_id)},
  ${sqlText(note.title)},
  ${sqlText(note.body_markdown)},
  ${sqlText(createMarkdownExcerpt(note.body_markdown))},
  ${sqlText(note.library_bucket)},
  'manual',
  ${sqlText(note.status)},
  ${sqlText(note.visibility)},
  ${sqlText(note.security_mode)},
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO note_revisions (
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  body_markdown,
  body_excerpt,
  note_type,
  library_bucket,
  status,
  visibility,
  security_mode,
  changed_by_user_id,
  change_summary,
  change_reason,
  created_at,
  metadata_json
) VALUES (
  'note-revision-1',
  ${sqlText(snapshot.workspace_id)},
  ${sqlText(snapshot.note_id)},
  ${snapshot.revision_number},
  ${sqlText(snapshot.title)},
  ${sqlText(snapshot.body_markdown)},
  ${sqlText(snapshot.body_excerpt)},
  ${sqlText(snapshot.note_type)},
  ${sqlText(snapshot.library_bucket)},
  ${sqlText(snapshot.status)},
  ${sqlText(snapshot.visibility)},
  ${sqlText(snapshot.security_mode)},
  ${sqlText(snapshot.changed_by_user_id)},
  ${sqlText(snapshot.change_summary)},
  ${sqlText(snapshot.change_reason)},
  ${sqlText(snapshot.created_at)},
  ${sqlText(JSON.stringify({ changelogEntry }))}
);

INSERT INTO note_wiki_links (
  note_wiki_link_id,
  workspace_id,
  note_id,
  source_revision_id,
  raw_target,
  target_slug,
  display_text,
  status,
  created_at,
  updated_at
) VALUES (
  'note-wiki-link-1',
  ${sqlText(note.workspace_id)},
  ${sqlText(note.note_id)},
  'note-revision-1',
  'Linked Note',
  'linked-note',
  'Linked Note',
  'unresolved',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const revisionRows = await querySql("SELECT revision_number, title, body_excerpt FROM note_revisions WHERE note_id = 'note-markdown-1';");
  assert.equal(revisionRows[0].revision_number, 1);
  assert.equal(revisionRows[0].title, "Markdown Note Updated");
  assert.ok(revisionRows[0].body_excerpt.includes("Markdown Note Updated"));

  const wikiRows = await querySql("SELECT raw_target, target_slug, status FROM note_wiki_links WHERE note_id = 'note-markdown-1';");
  assert.deepEqual(wikiRows[0], {
    raw_target: "Linked Note",
    target_slug: "linked-note",
    status: "unresolved",
  });

  await assert.rejects(
    () => runSql(`
INSERT INTO note_revisions (
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  security_mode,
  created_at
) VALUES (
  'note-revision-invalid',
  ${sqlText(note.workspace_id)},
  ${sqlText(note.note_id)},
  2,
  'Invalid',
  'plain',
  ${sqlText(now)}
);
`),
    /CHECK(?: constraint failed)?|NOT NULL constraint failed/,
  );
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY workspace_id LIMIT 1;");
  return rows[0];
}

async function readUser() {
  const rows = await querySql("SELECT user_id FROM users ORDER BY user_id LIMIT 1;");
  return rows[0];
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
