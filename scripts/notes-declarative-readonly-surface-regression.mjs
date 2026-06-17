import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readText("views/protected/notes.html");
const notesModule = readText("src/modules/notes/module.js");
const notesJs = readText("public/js/notes.js");
const stylesheet = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));

assert.equal(packageJson.version, "0.33.5.18.5.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.5.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.5.2", "package-lock package entry should report the current app version");

// Protected view is now a minimal framework host; as of .18.4 the dialogs are framework-built too.
assert.match(html, /<main class="wide-page notes-page" data-notes-host><\/main>/, "Notes view should be a minimal framework host");
assert.match(html, /css\/longtail-forge\.css\?v=29/, "Notes host should load the refreshed stylesheet");
assert.match(html, /js\/shared\/icons\.js\?v=2[\s\S]*js\/shared\/view-builder\.js\?v=6[\s\S]*js\/shared\/view-renderer\.js\?v=4[\s\S]*js\/notes\.js\?v=23/, "Notes host should load the icon helper, view builder, and renderer before the module adapter");
assert.doesNotMatch(html, /data-notes-list|data-notes-collections-panel|data-note-filter-status|class="notes-filters-panel"/, "Notes static HTML should not own the converted read workspace anatomy");
assert.doesNotMatch(html, /data-note-dialog/, "Editor dialog is framework-built as of .18.4, not static HTML");
assert.doesNotMatch(html, /data-note-collection-dialog/, "Collection dialog is framework-built as of .18.4, not static HTML");
assert.match(notesJs, /createNoteDialogShell/, "notes.js should build the editor dialog shell from the descriptor modal");
assert.match(notesJs, /createCollectionDialogShell/, "notes.js should build the collection dialog shell from the descriptor modal");

// Manifest descriptor for the Notes read surface.
assert.match(notesModule, /viewSurfaces:\s*\[/, "Notes manifest should declare a viewSurfaces descriptor");
assert.match(notesModule, /id:\s*"notes\.workspace"/, "Notes descriptor should use a stable surface id");
assert.match(notesModule, /layout:\s*"stacked"/, "Notes descriptor should use the stacked layout");
assert.match(notesModule, /route:\s*"\/api\/notes"/, "Notes descriptor should keep the canonical notes read route");

// Browser adapter wiring: framework renders the shell, notes.js mounts the chrome and read content.
assert.match(notesJs, /buildNotesViewShell/, "notes.js should build the framework view shell");
assert.match(notesJs, /view\.renderSurface\(\{ \.\.\.descriptor, dataSource: null, modals: \[\] \}, host\)/, "notes.js should render the descriptor shell without letting the renderer fetch data or render duplicate modals");
assert.match(notesJs, /notesViewSurfaceDescriptor/, "notes.js should resolve the delivered descriptor");
assert.match(notesJs, /workspaceContext\?\.viewSurfaces/, "notes.js should prefer the app-shell delivered descriptor");
assert.match(notesJs, /fallbackNotesViewSurfaceDescriptor/, "notes.js should keep a startup fallback descriptor");
assert.match(notesJs, /decorateNotesDeclarativeSurface/, "notes.js should decorate the framework shell with legacy hooks");
assert.match(notesJs, /createNotesLibraryPanel/, "notes.js should mount Library filters as a separate framework collapsible panel");
assert.match(notesJs, /indexPanel\?\.before\(createNotesLibraryPanel\(\)\)/, "Library filters should be inserted separately from the Notes list panel");
assert.match(notesJs, /summaryTitle\.textContent = "Notes List"/, "The descriptor index panel should be labelled Notes List");
assert.match(notesJs, /summary\.classList\.add\("has-summary-actions"\)/, "Notes list summary should reserve a right-aligned pagination action area");
assert.match(notesJs, /createNotesLibraryChrome/, "Notes module should own Library bucket and collection filter chrome");
assert.match(notesJs, /createNotesListChrome/, "Notes module should own Notes list and pagination chrome inside the framework index panel");
assert.match(notesJs, /icon:\s*"library-add"/, "New Collection should use the shared library-add icon");
assert.match(notesJs, /toolbar\.append\(tabs, collectionCreate\)/, "New Collection should sit in the Library toolbar with the bucket buttons");
assert.match(notesJs, /createNotesPagination/, "Notes pagination should be mounted in the collapsible Notes summary");
assert.match(notesJs, /collapseNotesNavigationPanels/, "Selecting a note should collapse the Library and Notes navigation panels");
assert.match(notesJs, /detail\.replaceChildren\(\)/, "The Notes detail panel should start as a blank reading window");
assert.match(notesJs, /tagChips\(note\.tags \|\| \[\], \{ limit: 2, showOverflow: true \}\)/, "Notes list stubs should cap visible tags at two");
assert.match(notesJs, /overflow\.textContent = "\.\.\."/, "Notes list tag overflow should use an ellipsis chip");
assert.doesNotMatch(notesJs, /data\.notesListTitle|data-notes-list-title|notes-list-excerpt/, "Notes list should not render an extra title or body excerpt in list stubs");
assert.doesNotMatch(notesJs, /text:\s*"Collections"/, "Library panel should not render a redundant Collections heading");
assert.match(notesJs, /registerNotesViewBehaviors/, "notes.js should register the create-note behavior");
assert.match(stylesheet, /\.view-page-header\s*\{[\s\S]*margin-bottom:\s*8px;/, "Framework page headers should leave space before the next surface panel");
assert.match(stylesheet, /\.view-collapsible-index-summary\s*\{[\s\S]*position:\s*relative;[\s\S]*color:\s*var\(--color-text\);[\s\S]*font-weight:\s*700;/, "Library and Notes List summaries should match the Filters heading style");
assert.doesNotMatch(stylesheet, /\.view-collapsible-index-summary\s*\{[^}]*display:\s*flex;/, "Collapsible summaries should keep native disclosure markers instead of flexing away the caret");
assert.match(stylesheet, /\.view-collapsible-index-summary\.has-summary-actions\s*\{[\s\S]*padding-right:\s*150px;/, "Only summaries with right-side controls should reserve action space");
assert.match(stylesheet, /\.view-stacked \.view-collapsible-index--unscrolled \.view-collapsible-index-body\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*visible;/, "A framework modifier (not a module class) should opt a static index panel out of the notes-list scroll cap");
assert.match(notesJs, /view-collapsible-index--unscrolled/, "Notes Library panel should opt out of the scroll cap via the framework modifier class");
assert.doesNotMatch(stylesheet, /\.view-stacked[^,{]*\.notes-/, "Framework stacked rules should not reference Notes module classes");
assert.match(stylesheet, /\.view-stacked\s*\{[\s\S]*gap:\s*0;/, "Framework stacked panels should not leave white space between navigation and detail panels");
assert.match(stylesheet, /\.notes-library-toolbar\s*\{[\s\S]*justify-content:\s*space-between;/, "Library toolbar should align bucket buttons and New Collection on one row");
assert.match(stylesheet, /\.notes-library-toolbar \[data-note-collection-create\]\s*\{[\s\S]*flex:\s*0 0 auto;/, "New Collection should stay with the Library toolbar actions");
assert.match(stylesheet, /\.notes-collection-picker-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(150px, 0\.85fr\) minmax\(190px, 1\.15fr\) auto;/, "Library and Collection selects should sit side-by-side with collection actions");
assert.match(stylesheet, /\.view-collapsible-index:not\(\[open\]\) \.view-collapsible-index-summary-actions\s*\{[\s\S]*display:\s*none;/, "Notes pagination should hide when the Notes panel is collapsed");
assert.match(stylesheet, /\.notes-list-chip-strip\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*8px;[\s\S]*right:\s*8px;/, "Notes list chips should sit in the top-right of compact stubs");
assert.match(stylesheet, /\.notes-tag-overflow\s*\{[\s\S]*min-width:\s*34px;/, "Notes list tag overflow chip should be compact and visible");
assert.match(stylesheet, /\.notes-list-heading strong\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/, "Notes list titles should truncate to fit compact stubs");

// Read workflow, routes, and Markdown body remain module-owned and preserved.
assert.match(notesJs, /\/api\/notes\/preview/, "Notes live preview route should stay module-owned");
assert.match(notesJs, /body_html/, "Notes detail should render the server Markdown-rendered body_html");
assert.match(notesJs, /collectionFilterOptions/, "Notes collection read logic should remain in the module");

for (const item of [
  "Add a `viewSurfaces` descriptor for the Notes protected workspace read path on the Notes manifest.",
  "Reduce `views/protected/notes.html` to a minimal framework host element the renderer fills.",
  "Render the note body through the 0.33.5.17 Markdown service; do not reintroduce ad-hoc rendering.",
  "Keep note creation/editing, modals, revisions, and linked-record management on the existing",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(item)}`), `Roadmap item should be checked: ${item}`);
}

assert.match(changelog, /## Version 0\.33\.5\.18\.3 - /, "Changelog should record the Notes read-only proof");
assert.match(regressionSuite, /scripts\/notes-declarative-readonly-surface-regression\.mjs/, "Regression suite should include the Notes declarative proof regression");

console.log("Notes declarative read-only surface regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
