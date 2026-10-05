import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof; never run concurrently with a server or source verification.
const path = "public/js/notes.js";
const original = Buffer.from(readFileSync(path));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = hash(original);
// The actual toolbar initializer is lifted by the suite, so entry mutations are observable.
// The explicit null-URL guard has the same answer as the old URL-parser catch. Removing
// just that guard is not a behavior break; its narrowing is checked by the strict compiler.
const cases = [
  // Five focused breaks for the explicitly authorized pre-existing icon-click defect.
  [
    "command dispatch regresses to the direct event target",
    "handleEditorCommand",
    "const button = target.closest(\"button[data-note-command]\");",
    "const button = target;"
  ],
  [
    "command dispatch excludes SVG and path targets",
    "handleEditorCommand",
    "target instanceof Element",
    "target instanceof HTMLElement"
  ],
  [
    "command dispatch crosses toolbar ownership",
    "handleEditorCommand",
    "|| button.closest(\"[data-note-editor-toolbar]\") !== toolbar",
    ""
  ],
  [
    "command dispatch admits disabled buttons",
    "handleEditorCommand",
    "|| button.disabled",
    ""
  ],
  [
    "one activation executes the command twice",
    "handleEditorCommand",
    "editor?.applyCommand(command);",
    "editor?.applyCommand(command); editor?.applyCommand(command);"
  ],
  [
    "toolbar initializer loses a command",
    "NOTE_EDITOR_TOOLBAR_ACTIONS",
    "{ command: \"bold\", text: \"B\", label: \"Bold\" },",
    ""
  ],
  [
    "toolbar skips the first command",
    "createNoteEditorToolbar",
    "NOTE_EDITOR_TOOLBAR_ACTIONS.forEach",
    "NOTE_EDITOR_TOOLBAR_ACTIONS.slice(1).forEach"
  ],
  [
    "toolbar loses its mount hook",
    "createNoteEditorToolbar",
    "toolbar.dataset.noteEditorToolbar = \"\";",
    ""
  ],
  [
    "toolbar action gets the wrong icon",
    "createNoteEditorToolbarButton",
    "icon: action.icon,",
    "icon: \"eye\","
  ],
  [
    "toolbar loses icon-only presentation",
    "createNoteEditorToolbarButton",
    "iconOnly: Boolean(action.icon && !action.text),",
    "iconOnly: false,"
  ],
  [
    "toolbar loses command text",
    "createNoteEditorToolbarButton",
    "text: action.text || \"\",",
    "text: \"\","
  ],
  [
    "toolbar loses accessible label",
    "createNoteEditorToolbarButton",
    "ariaLabel: action.label,",
    "ariaLabel: \"Wrong\","
  ],
  [
    "toolbar loses title",
    "createNoteEditorToolbarButton",
    "title: action.label,",
    "title: \"Wrong\","
  ],
  [
    "toolbar dispatches wrong command",
    "createNoteEditorToolbarButton",
    "button.dataset.noteCommand = action.command;",
    "button.dataset.noteCommand = \"wrong\";"
  ],
  [
    "toolbar preview hook disappears",
    "createNoteEditorToolbarButton",
    "button.dataset.notePreviewToggle = \"\";",
    ""
  ],
  [
    "toolbar preview starts pressed",
    "createNoteEditorToolbarButton",
    "button.setAttribute(\"aria-pressed\", \"false\");",
    "button.setAttribute(\"aria-pressed\", \"true\");"
  ],
  [
    "preview moves before editor body",
    "createNoteMarkdownEditorSection",
    "children: [bodyField, preview]",
    "children: [preview, bodyField]"
  ],
  [
    "toolbar moves below editor body",
    "createNoteMarkdownEditorSection",
    "children: [toolbar, body]",
    "children: [body, toolbar]"
  ],
  [
    "editor body loses its hook",
    "createNoteMarkdownEditorSection",
    "body.dataset.noteMarkdownEditorBody = \"\";",
    ""
  ],
  [
    "editor section loses its hook",
    "createNoteMarkdownEditorSection",
    "section.dataset.noteMarkdownEditor = \"\";",
    ""
  ],
  [
    "editor body loses its layout class",
    "createNoteMarkdownEditorSection",
    "className: \"notes-markdown-editor-body\"",
    "className: \"wrong\""
  ],
  [
    "preview reads wrong pressed state",
    "togglePreview",
    "=== \"true\"",
    "=== \"false\""
  ],
  [
    "preview inverts visibility",
    "togglePreview",
    "const visible = !pressed;",
    "const visible = pressed;"
  ],
  [
    "preview stops updating pressed state",
    "togglePreview",
    "requireNotesValue(previewToggle).setAttribute(\"aria-pressed\", String(visible));",
    ""
  ],
  [
    "preview writes wrong hidden state",
    "togglePreview",
    "preview.hidden = !visible;",
    "preview.hidden = visible;"
  ],
  [
    "preview omits layout transition",
    "togglePreview",
    "updatePreviewLayoutState(visible);",
    ""
  ],
  [
    "preview renders on close too",
    "togglePreview",
    "if (visible) {",
    "if (true) {"
  ],
  [
    "preview mount is required too early",
    "togglePreview",
    "const pressed =",
    "requireNotesValue(preview); const pressed ="
  ],
  [
    "missing preview mount is ignored",
    "togglePreview",
    "requireNotesValue(preview);",
    ""
  ],
  [
    "preview layout class changes",
    "updatePreviewLayoutState",
    "\"is-preview-visible\"",
    "\"wrong\""
  ],
  [
    "missing optional editor wrapper throws",
    "updatePreviewLayoutState",
    "markdownEditor?.classList",
    "markdownEditor.classList"
  ],
  [
    "missing Markdown mount throws",
    "applyExternalMarkdownLinkPreference",
    "if (!container) {",
    "if (false) {"
  ],
  [
    "Markdown rewrites non-anchor nodes",
    "applyExternalMarkdownLinkPreference",
    "querySelectorAll(\"a[href]\")",
    "querySelectorAll(\"[href]\")"
  ],
  [
    "Markdown rewrites relative and unsupported links",
    "applyExternalMarkdownLinkPreference",
    "if (!isAbsoluteHttpUrl(anchor.getAttribute(\"href\"))) {",
    "if (false) {"
  ],
  [
    "Markdown reverses user preference",
    "applyExternalMarkdownLinkPreference",
    "if (state.openExternalLinksNewTab) {",
    "if (!state.openExternalLinksNewTab) {"
  ],
  [
    "Markdown loses new-tab target",
    "applyExternalMarkdownLinkPreference",
    "anchor.setAttribute(\"target\", \"_blank\");",
    "anchor.setAttribute(\"target\", \"_self\");"
  ],
  [
    "Markdown loses noopener",
    "applyExternalMarkdownLinkPreference",
    "\"noopener noreferrer\"",
    "\"noreferrer\""
  ],
  [
    "Markdown retains old new-tab target",
    "applyExternalMarkdownLinkPreference",
    "anchor.removeAttribute(\"target\");",
    ""
  ],
  [
    "Markdown retains old new-tab rel",
    "applyExternalMarkdownLinkPreference",
    "anchor.removeAttribute(\"rel\");",
    ""
  ],
  [
    "URL classifier admits FTP",
    "isAbsoluteHttpUrl",
    "parsed.protocol === \"http:\" || parsed.protocol === \"https:\"",
    "parsed.protocol === \"http:\" || parsed.protocol === \"https:\" || parsed.protocol === \"ftp:\""
  ],
  [
    "URL classifier loses HTTPS",
    "isAbsoluteHttpUrl",
    "parsed.protocol === \"http:\" || parsed.protocol === \"https:\"",
    "parsed.protocol === \"http:\""
  ],
  [
    "URL classifier accepts null",
    "isAbsoluteHttpUrl",
    "if (value === null) return false;",
    "if (value === null) return true;"
  ],
  [
    "preference storage reverses boolean",
    "storeOpenExternalLinksPreference",
    "value ? \"true\" : \"false\"",
    "value ? \"false\" : \"true\""
  ],
  [
    "preference storage changes cache key",
    "storeOpenExternalLinksPreference",
    "setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY,",
    "setItem(\"wrong\","
  ],
  [
    "preference storage is skipped",
    "storeOpenExternalLinksPreference",
    "window.localStorage.setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY, value ? \"true\" : \"false\");",
    ""
  ]
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-markdown-surface.test.mjs", "tests/unit/notes-list-query.test.mjs", "tests/unit/notes-external-link-preference-contracts.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const start = source.indexOf(`const ${name} = Object.freeze([`);
    const region = start === -1 ? extractFunctionBlock(source, name) : source.slice(start, source.indexOf("]);", start) + 3);
    assert.ok(region.includes(from), `${label}: intended mutation site must exist`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax errors are not caught breaks\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: an infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT: ${label}`);
      }
    } finally {
      writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, `${label}: byte restoration`);
    }
  }
} finally {
  writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, "final byte restoration");
  console.log(`Restored SHA-256 ${before}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
