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

assert.equal(packageJson.version, "0.33.5.21.7.8", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.7.8", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.7.8", "package-lock package entry should report the current app version");

// Protected view is now a minimal framework host; as of .18.4 the dialogs are framework-built too.
assert.match(html, /<main class="wide-page notes-page" data-notes-host><\/main>/, "Notes view should be a minimal framework host");
assert.match(html, /css\/longtail-forge\.css\?v=56/, "Notes host should load the refreshed stylesheet");
assert.match(html, /js\/shared\/icons\.js\?v=4[\s\S]*js\/shared\/view-builder\.js\?v=11[\s\S]*js\/shared\/view-renderer\.js\?v=12[\s\S]*js\/notes\.js\?v=69/, "Notes host should load the icon helper, view builder, and renderer before the module adapter");
assert.doesNotMatch(html, /data-notes-list|data-notes-collections-panel|data-note-filter-status|class="notes-filters-panel"/, "Notes static HTML should not own the converted read workspace anatomy");
assert.doesNotMatch(html, /data-note-dialog/, "Editor dialog is framework-built as of .18.4, not static HTML");
assert.doesNotMatch(html, /data-note-collection-dialog/, "Collection dialog is framework-built as of .18.4, not static HTML");
assert.match(notesJs, /createNoteDialogShell/, "notes.js should build the editor dialog shell from the descriptor modal");
assert.match(notesJs, /createCollectionDialogShell/, "notes.js should build the collection dialog shell from the descriptor modal");
assert.match(notesJs, /createCollectionActionsDialogShell/, "notes.js should build collection actions in a modal instead of a drawer dropdown");

// Manifest descriptor for the Notes read surface.
assert.match(notesModule, /viewSurfaces:\s*\[/, "Notes manifest should declare a viewSurfaces descriptor");
assert.match(notesModule, /id:\s*"notes\.workspace"/, "Notes descriptor should use a stable surface id");
assert.match(notesModule, /layout:\s*"slide-out-sidebar"/, "Notes descriptor should use the slide-out sidebar layout");
assert.doesNotMatch(notesModule, /layout:\s*"sidebar-detail"/, "Notes descriptor should no longer use the persistent sidebar-detail layout");
assert.match(notesModule, /sidebarPanels:\s*\[[\s\S]*id:\s*"notes-filters"[\s\S]*type:\s*"filters"[\s\S]*open:\s*false[\s\S]*id:\s*"notes-library"[\s\S]*type:\s*"navigation"[\s\S]*behavior:\s*"notes\.sidebar\.library"[\s\S]*open:\s*true[\s\S]*id:\s*"notes-list"[\s\S]*type:\s*"index"[\s\S]*title:\s*"Notes List"[\s\S]*behavior:\s*"notes\.sidebar\.notes-list-footer"/, "Notes descriptor should declare ordered Filters, Library, and Notes List sidebar panels for the drawer");
assert.match(notesModule, /id:\s*"tags-filter"[\s\S]*field:\s*"tags"[\s\S]*type:\s*"search"[\s\S]*optionsSource:\s*"notes\.filters\.tags"/, "Notes descriptor should declare tag filter search suggestions through the framework option-source hook");
assert.match(notesModule, /route:\s*"\/api\/notes"/, "Notes descriptor should keep the canonical notes read route");

// Browser adapter wiring: framework renders the shell, notes.js mounts the chrome and read content.
assert.match(notesJs, /buildNotesViewShell/, "notes.js should build the framework view shell");
assert.match(notesJs, /view\.renderSurface\(\{ \.\.\.descriptor, dataSource: null, modals: \[\] \}, host\)/, "notes.js should render the descriptor shell without letting the renderer fetch data or render duplicate modals");
assert.match(notesJs, /notesViewSurfaceDescriptor/, "notes.js should resolve the delivered descriptor");
assert.match(notesJs, /workspaceContext\?\.viewSurfaces/, "notes.js should prefer the app-shell delivered descriptor");
assert.match(notesJs, /fallbackNotesViewSurfaceDescriptor/, "notes.js should keep a startup fallback descriptor");
assert.match(notesJs, /layout:\s*"slide-out-sidebar"/, "Notes fallback descriptor should use the slide-out sidebar layout");
assert.match(notesJs, /decorateNotesDeclarativeSurface/, "notes.js should decorate the framework shell with legacy hooks");
assert.match(notesJs, /view\.registerBehavior\("notes\.sidebar\.library"[\s\S]*container\.replaceChildren\(createNotesLibraryChrome\(\)\)/, "Notes module should mount Library chrome through a sidebar panel behavior");
assert.match(notesJs, /view\.registerBehavior\("notes\.sidebar\.notes-list-footer"[\s\S]*container\.replaceChildren\(createNotesListSortControl\(\), createNotesPagination\(\)\)/, "Notes module should mount Notes List footer controls through a sidebar panel behavior");
assert.match(notesJs, /view\.registerBehavior\("notes\.filters\.tags", hydrateNoteTagFilterOptions\)/, "Notes module should hydrate tag filter suggestions through a module-owned behavior");
assert.match(notesJs, /hydrateNoteTagFilterOptions\(\{ mountSearchOptions, setOptions \}[\s\S]*submitMode:\s*"option-or-input"/, "Notes tag filter suggestions should preserve free-text search with selected no-tags support");
assert.match(notesJs, /surface\.querySelector\('\[data-view-sidebar-panel="notes-list"\]'\)/, "Notes module should target the framework Notes List sidebar panel");
assert.match(notesJs, /surface\.querySelector\("\.view-slideout-sidebar-main"\)[\s\S]*surface\.querySelector\("\.view-sidebar-detail-primary"\)/, "Notes detail should prefer the slide-out sidebar primary region and keep compatibility fallbacks");
assert.match(notesJs, /summaryTitle\.textContent = "Notes List"/, "The descriptor index panel should be labelled Notes List");
assert.match(notesJs, /indexFooter\.classList\.add\("notes-list-panel-footer"\)/, "Notes list controls should use the framework collapsible-index footer slot");
assert.match(notesJs, /createNotesLibraryChrome/, "Notes module should own Library bucket and collection filter chrome");
assert.match(notesJs, /createNotesListChrome/, "Notes module should own Notes list chrome inside the framework index panel");
assert.match(notesJs, /createNotesListSortControl/, "Notes module should own the Notes List footer sort control");
assert.match(notesJs, /icon:\s*"more"/, "Collection actions should use the shared more icon");
assert.match(notesJs, /children: \[libraryLabel, collectionControlRow\]/, "Library row should stack Library above a Collection select plus actions row");
assert.match(notesJs, /collectionActionsDialogBody\.replaceChildren\(create, edit, archive, remove\)/, "Collection actions should render in the modal body");
assert.match(notesJs, /collectionDialogAction\("New collection"[\s\S]*role: "primary"/, "New collection should be a named action inside the collection actions modal");
assert.match(notesJs, /disabled: !canManageCollection/, "Edit/archive/delete collection actions should be disabled until a manageable collection is selected");
assert.match(notesJs, /afterCollectionActionsDialogClosed\(\(\) => openCollectionDialog\("create", parentOptions\)\)/, "New collection should open only after the actions modal closes");
assert.match(notesJs, /afterCollectionActionsDialogClosed\(\(\) => openCollectionDialog\("edit", \{ collection \}\)\)/, "Edit collection should open only after the actions modal closes");
assert.match(notesJs, /view\.showModal\(collectionDialog, \{ parent: null \}\)/, "Collection dialog should not inherit the actions modal as a stack parent");
assert.doesNotMatch(notesJs, /dataset\.notesBucket/, "The legacy Library bucket-tab buttons should be retired");
assert.doesNotMatch(notesJs, /dataNoteCollectionCreate|dataset\.noteCollectionCreate|notes-collection-actions-menu/, "The separate New Collection button and drawer dropdown menu should be retired");
assert.match(notesJs, /createNotesPagination/, "Notes pagination should be built for the footer slot");
assert.match(notesJs, /container\.replaceChildren\(createNotesListSortControl\(\), createNotesPagination\(\)\)/, "Notes List footer should keep Sort on the left and pagination on the right");
assert.match(notesJs, /closeNotesSlideOutDrawer/, "Selecting a note should close the slide-out drawer");
assert.match(notesJs, /renderBlankDetailPrompt\(\)/, "The Notes detail panel should render a blank-state prompt when no note is selected");
assert.match(notesJs, /prompt\.append\("Open the ", inlineFilterIcon\(\), " sidebar and select a note to view here\."\)/, "Blank note detail should prompt the user to open the filter sidebar and select a note");
assert.match(notesJs, /icons\?\.createIcon\("filter", \{ size: 16 \}\)/, "Blank note detail should use the shared filter icon inline");
assert.match(notesJs, /tagChips\(note\.tags \|\| \[\], \{ limit: 1, showOverflow: true \}\)/, "Notes list stubs should cap visible tags at one inside the drawer");
assert.match(notesJs, /overflow\.textContent = "\.\.\."/, "Notes list tag overflow should use an ellipsis chip");
assert.doesNotMatch(notesJs, /data\.notesListTitle|data-notes-list-title|notes-list-excerpt/, "Notes list should not render an extra title or body excerpt in list stubs");
assert.doesNotMatch(notesJs, /text:\s*"Collections"/, "Library panel should not render a redundant Collections heading");
assert.match(notesJs, /registerNotesViewBehaviors/, "notes.js should register the create-note behavior");
assert.match(stylesheet, /\.view-page-header\s*\{[\s\S]*margin-bottom:\s*8px;/, "Framework page headers should leave space before the next surface panel");
assert.match(stylesheet, /\.view-collapsible-index-summary\s*\{[\s\S]*position:\s*relative;[\s\S]*color:\s*var\(--color-text\);[\s\S]*font-weight:\s*700;/, "Library and Notes List summaries should match the Filters heading style");
assert.doesNotMatch(stylesheet, /\.view-collapsible-index-summary\s*\{[^}]*display:\s*flex;/, "Collapsible summaries should keep native disclosure markers instead of flexing away the caret");
assert.match(stylesheet, /\.view-collapsible-index-footer\s*\{[\s\S]*justify-content:\s*flex-end;/, "The collapsible-index footer slot should right-align default actions");
assert.match(stylesheet, /\.notes-list-panel-footer\s*\{[\s\S]*justify-content:\s*space-between;[\s\S]*flex-wrap:\s*wrap;/, "Notes List footer should place Sort on the left and pagination on the right");
assert.match(stylesheet, /\.notes-list-panel-footer \.view-sidebar-panel-footer-region\s*\{[\s\S]*justify-content:\s*space-between;/, "Notes List footer mount region should preserve sort-left pagination-right layout");
assert.match(stylesheet, /\.view-slideout-sidebar-main\s*\{[\s\S]*width:\s*100%;/, "Slide-out sidebar main content should retain full available width");
assert.match(stylesheet, /\.view-slideout-sidebar-drawer \.view-sidebar-panel\s*\{[\s\S]*background:\s*var\(--color-surface\);/, "Slide-out sidebar drawer should contain the ordered sidebar panel shells");
assert.match(stylesheet, /\.notes-empty-state--sidebar-hint\s*\{[\s\S]*justify-content:\s*center;[\s\S]*min-height:\s*min\(42vh,\s*320px\);/, "Blank note detail prompt should be centered inside the detail panel");
assert.match(stylesheet, /\.notes-empty-state-icon\s*\{[\s\S]*display:\s*inline-grid;[\s\S]*border:\s*1px solid var\(--color-border\);/, "Blank note detail prompt should frame the inline filter icon");
assert.match(stylesheet, /\.wide-page\s*\{[\s\S]*margin:\s*0 auto 48px;/, "Wide work surfaces should anchor to the top of the content area");
assert.match(stylesheet, /\.view-stacked \.view-collapsible-index--unscrolled \.view-collapsible-index-body\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*visible;/, "A framework modifier (not a module class) should opt a static index panel out of the notes-list scroll cap");
assert.match(notesJs, /view-collapsible-index--unscrolled/, "Notes Library panel should opt out of the scroll cap via the framework modifier class");
assert.doesNotMatch(stylesheet, /\.view-stacked[^,{]*\.notes-/, "Framework stacked rules should not reference Notes module classes");
assert.match(stylesheet, /\.view-stacked\s*\{[\s\S]*gap:\s*0;/, "Framework stacked panels should not leave white space between navigation and detail panels");
assert.match(stylesheet, /\.view-filter-panel-title\s*\{[\s\S]*font-weight:\s*700;/, "The Filters heading should match the bold Library/Notes List headings");
assert.match(stylesheet, /\.view-search-options\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*120;/, "Search filter suggestions should render outside drawer panel clipping");
assert.match(stylesheet, /\.notes-collection-picker-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/, "Library and Collection controls should stack into full drawer rows");
assert.match(stylesheet, /\.notes-collection-control-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/, "Collection select and actions should share a row with a narrow action button");
assert.match(stylesheet, /\.notes-collection-actions-modal-body\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*8px;/, "Collection actions should render in a modal action list");
assert.match(notesJs, /\["archive", "Archive"\]/, "The Library dropdown should include an Archive bucket option");
assert.match(stylesheet, /\.notes-list-chip-strip\s*\{[\s\S]*position:\s*absolute;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*max-width:\s*min\(36%,\s*160px\);/, "Notes list chips should stay in one compact top-right row");
assert.match(stylesheet, /\.notes-tag-overflow\s*\{[\s\S]*min-width:\s*34px;/, "Notes list tag overflow chip should be compact and visible");
assert.match(stylesheet, /\.notes-list-heading strong\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/, "Notes list titles should truncate to fit compact stubs");

// Read workflow, routes, and Markdown body remain module-owned and preserved.
assert.match(notesJs, /\/api\/notes\/preview/, "Notes live preview route should stay module-owned");
assert.match(notesJs, /body_html/, "Notes detail should render the server Markdown-rendered body_html");
assert.match(notesJs, /collectionFilterOptions/, "Notes collection read logic should remain in the module");

assert.match(roadmap, /Completed 0\.33\.5\.18\.6\.1 through 0\.33\.5\.18\.6\.11 are archived/, "live roadmap should document that completed Notes slices are archived");
assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.18\.3 - Notes Declarative Read-Only Surface Proof/, "completed Notes declarative proof slice should be archived out of the live roadmap");

assert.match(changelog, /## Version 0\.33\.5\.18\.3 - /, "Changelog should record the Notes read-only proof");
assert.match(regressionSuite, /scripts\/notes-declarative-readonly-surface-regression\.mjs/, "Regression suite should include the Notes declarative proof regression");

console.log("Notes declarative read-only surface regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
