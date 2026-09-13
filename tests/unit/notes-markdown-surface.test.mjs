import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext, FakeElement } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/notes.js");
const names = ["createNoteEditorToolbar", "createNoteEditorToolbarButton", "createNoteMarkdownEditorSection", "handleEditorCommand", "togglePreview",
  "updatePreviewLayoutState", "applyExternalMarkdownLinkPreference", "isAbsoluteHttpUrl", "storeOpenExternalLinksPreference", "readStoredOpenExternalLinksPreference",
  "loadMarkdownRenderingPreference", "readOpenExternalLinksNewTab", "isResponseRecord", "requireNotesValue"];
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const calls = [];
  /** @type {Map<string, string>} */ const storage = new Map();
  browser.window.URL = URL;
  browser.window.localStorage = { setItem: (/** @type {string} */ key, /** @type {string} */ value) => { calls.push(["store", key, value]); storage.set(key, value); },
    getItem: (/** @type {string} */ key) => storage.get(key) ?? null };
  // The shared fake intentionally uses one element class. Distinguish the two real
  // DOM families here so SVG/path dispatch is not proved by an HTML stand-in.
  class HtmlElement {
    static [Symbol.hasInstance](/** @type {unknown} */ value) { return value instanceof FakeElement && !["SVG", "PATH"].includes(value.tagName); }
  }
  const context = vm.createContext({ ...browser, HTMLElement: HtmlElement, calls, state: { openExternalLinksNewTab: false, settingsLoaded: false },
    editor: { applyCommand: (/** @type {string} */ command) => calls.push(["command", command]) },
    renderPreview: () => { calls.push(["preview", context.preview.hidden, context.markdownEditor?.classList.contains("is-preview-visible")]); },
    preferenceAnswer: Promise.resolve({ openExternalLinksNewTab: false }),
    requireApi: () => ({ getJson: (/** @type {string} */ url, /** @type {unknown} */ options) => { calls.push(["get", url, options]); return context.preferenceAnswer; } }),
  });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  const view = context.window.LongtailForge.view;
  context.requireView = () => view;
  // Lift the actual initializer. A declaration/entry change must affect this proof.
  const start = source.indexOf("const NOTE_EDITOR_TOOLBAR_ACTIONS = Object.freeze(["); assert.ok(start >= 0);
  const actions = source.slice(start, source.indexOf("]);", start) + 3);
  const storageKey = source.match(/const OPEN_EXTERNAL_LINKS_STORAGE_KEY = [^;]+;/); assert.ok(storageKey);
  vm.runInContext(`${actions}\n${storageKey[0]}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}`, context);
  const api = vm.runInContext(`({${names.join(",")}})`, context);
  const toolbar = api.createNoteEditorToolbar(), body = browser.document.createElement("label"), preview = browser.document.createElement("div");
  preview.hidden = true;
  const section = api.createNoteMarkdownEditorSection(toolbar, body, preview);
  context.previewToggle = toolbar.querySelector("[data-note-preview-toggle]"); context.preview = preview; context.markdownEditor = section;
  return { api, context, calls, storage, document: browser.document, toolbar, body, preview, section, toggle: context.previewToggle };
}

describe("Notes Markdown toolbar and preview boundary", () => {
  it("constructs every actual toolbar action in order with its command, text/icon and accessible label", () => {
    const f = fixture();
    const expected = [["bold", "Bold", "B"], ["italic", "Italic", "I"], ["underline", "Underline", "U"], ["heading", "Heading", "H"],
      ["unorderedList", "Unordered list", ""], ["orderedList", "Ordered list", "1."], ["checklist", "Checklist", ""], ["link", "Link", ""],
      ["wikiLink", "Wiki link", "Wiki"], ["", "Preview", ""]];
    assert.equal(f.toolbar.dataset.noteEditorToolbar, ""); assert.equal(f.toolbar.children.length, expected.length);
    for (const [index, [command, label, text]] of expected.entries()) {
      const button = f.toolbar.children[index]; assert.ok(button); assert.equal(button.tagName, "BUTTON");
      assert.equal(button.dataset.noteCommand || "", command); assert.equal(button.getAttribute("aria-label"), label); assert.equal(button.title, label);
      assert.equal(button.classList.contains("notes-editor-toolbar-button"), true);
      assert.equal(button.classList.contains("icon-button"), !text);
      if (text) assert.equal(button.textContent, text);
      else assert.equal(button.dataset.icon, { unorderedList: "list", checklist: "list-checks", link: "link", "": "eye" }[command], "The shared icon factory receives the actual icon");
      assert.equal(button.getAttribute("aria-pressed"), command ? null : "false");
    }
    assert.strictEqual(f.toolbar.children.at(-1), f.toggle);
  });

  it("builds the toolbar above the body/preview siblings without copying or unhiding them", () => {
    const f = fixture();
    assert.equal(f.section.dataset.noteMarkdownEditor, ""); assert.equal(f.section.className, "notes-markdown-editor");
    assert.strictEqual(f.section.children[0], f.toolbar); assert.equal(f.section.children.length, 2);
    const body = f.section.children[1]; assert.ok(body); assert.equal(body.className, "notes-markdown-editor-body");
    assert.equal(body.dataset.noteMarkdownEditorBody, ""); assert.strictEqual(body.children[0], f.body); assert.strictEqual(body.children[1], f.preview);
    assert.equal(f.preview.hidden, true);
  });

  it("dispatches the owning button's command exactly once from button, HTML child, SVG and path targets", () => {
    const f = fixture();
    for (const command of ["bold", "italic", "underline", "heading", "unorderedList", "orderedList", "checklist", "link", "wikiLink"]) {
      const button = f.toolbar.querySelector(`[data-note-command="${command}"]`); assert.ok(button);
      for (const tag of ["button", "span", "svg", "path"]) {
        const target = tag === "button" ? button : f.document.createElement(tag);
        if (target !== button) { target.dataset.noteCommand = "wrong"; button.appendChild(target); }
        f.calls.length = 0;
        f.api.handleEditorCommand({ target, currentTarget: f.toolbar });
        assert.deepEqual(f.calls.map(([kind, value]) => [kind, value]), [["command", command], ["preview", true]]);
      }
    }
  });

  it("ignores disabled, non-command, non-button and foreign-toolbar activations", () => {
    const f = fixture(), button = f.toolbar.children[0]; assert.ok(button);
    const nonButton = f.document.createElement("span"); nonButton.dataset.noteCommand = "bold"; f.toolbar.appendChild(nonButton);
    const foreign = f.api.createNoteEditorToolbar(); f.toolbar.appendChild(foreign);
    const outside = f.document.createElement("button"); outside.dataset.noteCommand = "bold";
    button.disabled = true;
    for (const target of [null, new globalThis.EventTarget(), f.toolbar, f.toggle, nonButton, foreign.children[0], outside, button, { dataset: { noteCommand: "bold" } }]) {
      f.calls.length = 0; assert.doesNotThrow(() => f.api.handleEditorCommand({ target, currentTarget: f.toolbar })); assert.deepEqual(f.calls, []);
    }
    button.disabled = false;
    for (const currentTarget of [null, {}, f.document.createElement("svg")]) {
      f.api.handleEditorCommand({ target: button, currentTarget }); assert.deepEqual(f.calls, []);
    }
    button.dataset.noteCommand = ""; f.api.handleEditorCommand({ target: button, currentTarget: f.toolbar }); assert.deepEqual(f.calls, []);
  });

  it("keeps preview dispatch when the optional editor is absent, and does not swallow an editor exception", () => {
    const f = fixture(), target = f.toolbar.children[0];
    f.context.editor = null; f.api.handleEditorCommand({ target, currentTarget: f.toolbar }); assert.deepEqual(f.calls.map(([kind]) => kind), ["preview"]);
    const failure = new Error("command failure"); f.context.editor = { applyCommand: () => { throw failure; } }; f.calls.length = 0;
    assert.throws(() => f.api.handleEditorCommand({ target, currentTarget: f.toolbar }), (error) => error === failure); assert.deepEqual(f.calls, []);
  });

  it("toggles the existing nodes and layout before rendering, and never renders on close", () => {
    const f = fixture(), parent = f.preview.parentNode;
    for (const initial of ["false", "unexpected", null]) {
      if (initial === null) f.toggle.removeAttribute("aria-pressed"); else f.toggle.setAttribute("aria-pressed", initial);
      f.calls.length = 0; f.api.togglePreview();
      assert.equal(f.toggle.getAttribute("aria-pressed"), "true"); assert.equal(f.preview.hidden, false);
      assert.equal(f.section.classList.contains("is-preview-visible"), true); assert.deepEqual(f.calls, [["preview", false, true]]);
      assert.strictEqual(f.preview.parentNode, parent); assert.strictEqual(f.section.children[0], f.toolbar);
      f.api.togglePreview(); assert.equal(f.toggle.getAttribute("aria-pressed"), "false"); assert.equal(f.preview.hidden, true);
      assert.equal(f.section.classList.contains("is-preview-visible"), false); assert.equal(f.calls.length, 1);
    }
  });

  it("retains required-control timing and tolerates an absent optional layout wrapper", () => {
    const f = fixture(); f.context.previewToggle = null;
    assert.throws(() => f.api.togglePreview(), /Required Notes value/); assert.equal(f.preview.hidden, true); assert.deepEqual(f.calls, []);
    f.context.previewToggle = f.toggle; f.context.preview = null;
    assert.throws(() => f.api.togglePreview(), /Required Notes value/); assert.equal(f.toggle.getAttribute("aria-pressed"), "true");
    assert.equal(f.section.classList.contains("is-preview-visible"), false); assert.deepEqual(f.calls, []);
    f.context.markdownEditor = null; assert.doesNotThrow(() => f.api.updatePreviewLayoutState(true));
  });

  it("changes only absolute HTTP(S) anchors and retains the secure new-tab pair and in-place reversal", () => {
    const f = fixture(), container = f.document.createElement("div");
    const urls = ["https://example.test/a", "http://example.test", "HTTPS://EXAMPLE.TEST", "/notes.html", "#heading", "//example.test", "mailto:user@example.test", "javascript:alert(1)", "data:text/plain,body", ""];
    const anchors = urls.map((href) => { const a = f.document.createElement("a"); a.setAttribute("href", href); a.setAttribute("target", "kept"); a.setAttribute("rel", "kept"); container.appendChild(a); return a; });
    const noHref = f.document.createElement("a"); noHref.setAttribute("target", "kept"); container.appendChild(noHref);
    const nonAnchor = f.document.createElement("div"); nonAnchor.setAttribute("href", urls[0]); container.appendChild(nonAnchor);
    f.context.state.openExternalLinksNewTab = true; f.api.applyExternalMarkdownLinkPreference(container);
    for (const [i, a] of anchors.entries()) { assert.equal(a.getAttribute("target"), i < 3 ? "_blank" : "kept"); assert.equal(a.getAttribute("rel"), i < 3 ? "noopener noreferrer" : "kept"); }
    assert.equal(noHref.getAttribute("target"), "kept"); assert.equal(nonAnchor.getAttribute("target"), null);
    f.context.state.openExternalLinksNewTab = false; f.api.applyExternalMarkdownLinkPreference(container);
    for (const [i, a] of anchors.entries()) { assert.equal(a.getAttribute("target"), i < 3 ? null : "kept"); assert.equal(a.getAttribute("rel"), i < 3 ? null : "kept"); }
    assert.doesNotThrow(() => f.api.applyExternalMarkdownLinkPreference(null)); assert.doesNotThrow(() => f.api.applyExternalMarkdownLinkPreference(undefined));
  });

  it("classifies a nullable DOM href without changing empty, malformed or unsupported-protocol results", () => {
    const f = fixture();
    for (const value of [null, undefined, "", " ", "/relative", "#fragment", "//example.test", "bad url", "file:///tmp/a", "ftp://example.test", "mailto:test@example.test"]) assert.equal(f.api.isAbsoluteHttpUrl(value), false);
    for (const value of ["https://example.test/a?q=1#anchor", "http://example.test:8080/", " https://example.test "]) assert.equal(f.api.isAbsoluteHttpUrl(value), true);
  });

  it("stores only the checked boolean preference and preserves the cached value on an unreadable response", async () => {
    const f = fixture();
    for (const value of [true, false]) {
      f.context.preferenceAnswer = Promise.resolve({ openExternalLinksNewTab: value }); f.calls.length = 0;
      await f.api.loadMarkdownRenderingPreference();
      assert.equal(f.context.state.openExternalLinksNewTab, value); assert.equal(f.context.state.settingsLoaded, true);
      assert.equal(f.api.readStoredOpenExternalLinksPreference(), value);
      assert.deepEqual(plain(f.calls[0]), ["get", "/api/user/settings", { cache: "no-store" }]);
      assert.equal(f.calls.filter(([kind]) => kind === "store").length, 1); assert.equal([...f.storage.values()][0], String(value));
      assert.deepEqual([...f.storage.keys()], ["lf_open_external_links_new_tab"]);
    }
    for (const response of [null, {}, { openExternalLinksNewTab: "true" }]) {
      f.context.preferenceAnswer = Promise.resolve(response); f.calls.length = 0; await f.api.loadMarkdownRenderingPreference();
      assert.equal(f.context.state.openExternalLinksNewTab, false); assert.equal(f.context.state.settingsLoaded, false);
      assert.equal(f.calls.some(([kind]) => kind === "store"), false);
    }
    // Baseline readOpenExternalLinksNewTab reads a boolean even through a prototype.
    // This existing reader is unchanged; the storage annotation claims only its boolean
    // result, not own-member validation. JSON response objects do not carry this fixture's prototype.
    f.context.preferenceAnswer = Promise.resolve(Object.create({ openExternalLinksNewTab: true }));
    await f.api.loadMarkdownRenderingPreference();
    assert.equal(f.context.state.openExternalLinksNewTab, true); assert.equal(f.api.readStoredOpenExternalLinksPreference(), true);
  });
});
