import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesHtml = readText("views/protected/notes.html");
const notesJs = readText("public/js/notes.js");
const viewBuilderJs = readText("public/js/shared/view-builder.js");
const viewRendererJs = readText("public/js/shared/view-renderer.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.6.9.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.6.9.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.6.9.2", "package-lock package entry should report the current app version");

assert.match(notesHtml, /js\/shared\/view-builder\.js\?v=10/, "Notes should cache-bust the shared view builder stack helper");
assert.match(notesHtml, /js\/shared\/view-renderer\.js\?v=8/, "Notes should cache-bust the shared view renderer modal opener");
assert.match(notesHtml, /css\/longtail-forge\.css\?v=45/, "Notes should cache-bust stacked modal warning styles");
assert.match(notesHtml, /js\/notes\.js\?v=59/, "Notes should cache-bust the Notes modal wiring");

assert.match(notesJs, /label: "Tags", title: "Tags", role: "utility"/, "Tags utility should use the concise label while keeping the icon button");
assert.match(notesJs, /label: "Files", title: "Files", role: "utility"/, "Files utility should use the concise label while keeping the icon button");
assert.doesNotMatch(notesJs, /Note tags|Note files/, "Notes utility buttons should not expose the old longer labels");
assert.match(notesJs, /view\.showModal\(dialog\)/, "The Add/Edit Note dialog should open through the shared modal stack helper");
assert.match(notesJs, /view\.closeModal\(dialog\)/, "Closing or saving the Add/Edit Note dialog should close child modals safely");
assert.match(notesJs, /view\.showModal\(collectionDialog\)/, "Collection dialogs should use the shared modal stack helper");
assert.match(notesJs, /view\.closeModal\(collectionDialog\)/, "Collection dialogs should close through the shared modal stack helper");

assert.match(viewBuilderJs, /const modalStack = \[\]/, "View builder should own a modal stack");
assert.match(viewBuilderJs, /function showModal\(dialog, options = \{\}\)/, "View builder should expose showModal");
assert.match(viewBuilderJs, /function closeModal\(dialog, value = ""\)/, "View builder should expose closeModal");
assert.match(viewBuilderJs, /function closeChildModals\(parent, value = "parent-closed"\)/, "View builder should close child modals when a parent closes");
assert.match(viewBuilderJs, /function isTopModal\(dialog\)/, "View builder should expose top-modal checks");
assert.match(viewBuilderJs, /event\.target === dialog && !isTopModal\(dialog\)/, "Backdrop-style clicks on non-top dialogs should be guarded");
assert.match(viewBuilderJs, /"cancel"[\s\S]*!isTopModal\(dialog\)[\s\S]*event\.preventDefault\(\)/, "Escape/cancel on non-top dialogs should be guarded");
assert.match(viewRendererJs, /state\.view\.showModal\(dialog\)/, "Descriptor modal opening should route through the shared stack helper");
assert.match(regressionSuite, /scripts\/notes-modal-stack-guardrails-regression\.mjs/, "The modal stack regression should be part of the full suite");

const context = createBrowserContext();
vm.runInNewContext(viewBuilderJs, context, { filename: "view-builder.js" });
const view = context.window.LongtailForge.view;

for (const helperName of ["showModal", "closeModal", "closeChildModals", "isTopModal"]) {
  assert.equal(typeof view[helperName], "function", `LongtailForge.view.${helperName} should be exposed`);
}

const parentDialog = view.createModal({ title: "Edit Note", body: ["Parent"] });
const childDialog = view.createModal({ title: "Tags", body: ["Child"] });
context.document.body.append(parentDialog, childDialog);

view.showModal(parentDialog);
assert.equal(parentDialog.open, true, "showModal should open the parent dialog");
assert.equal(parentDialog.dataset.viewModalStackLevel, "1", "Parent dialog should be stack level 1");
assert.equal(parentDialog.dataset.viewModalStackTop, "true", "Parent should be top before a child opens");

view.showModal(childDialog, { parent: parentDialog });
assert.equal(childDialog.open, true, "showModal should open the child dialog");
assert.equal(parentDialog.dataset.viewModalStackTop, undefined, "Parent should stop being top while a child is open");
assert.equal(childDialog.dataset.viewModalStackLevel, "2", "Child dialog should be stack level 2");
assert.equal(childDialog.dataset.viewModalStackTop, "true", "Child should become the top modal");
assert.equal(view.isTopModal(parentDialog), false, "Parent should not be top while child is open");
assert.equal(view.isTopModal(childDialog), true, "Child should be top while open");

const parentCancel = createEvent("cancel", parentDialog);
parentDialog.dispatchEvent(parentCancel);
assert.equal(parentCancel.defaultPrevented, true, "Non-top parent cancel should be prevented");

const childCancel = createEvent("cancel", childDialog);
childDialog.dispatchEvent(childCancel);
assert.equal(childCancel.defaultPrevented, false, "Top child cancel should not be prevented by the stack guard");

view.closeModal(parentDialog, "saved");
assert.equal(parentDialog.open, false, "Closing parent should close the parent dialog");
assert.equal(childDialog.open, false, "Closing parent should close any child dialogs");
assert.equal(view.isTopModal(parentDialog), false, "Closed parent should leave the modal stack");
assert.equal(view.isTopModal(childDialog), false, "Closed child should leave the modal stack");

view.showModal(parentDialog);
view.closeModal(null);
assert.equal(parentDialog.open, true, "closeModal without a dialog should not close unrelated top-level dialogs");
view.closeModal(parentDialog);

console.log("Notes modal stack guardrails regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function createBrowserContext() {
  const document = new FakeDocument();
  const window = {
    document,
    LongtailForge: {
      icons: {
        createIconButton(options = {}) {
          const button = document.createElement("button");
          button.type = options.type || "button";
          if (options.iconOnly !== false && !options.text) {
            button.classList.add("icon-button");
            button.setAttribute("aria-label", options.label);
            button.title = options.title || options.label;
          }
          if (options.text) {
            button.textContent = options.text;
          }
          button.dataset.icon = options.icon;
          return button;
        },
      },
    },
  };
  return { window, document, WeakMap };
}

function FakeDocument() {
  this.body = new FakeElement("body");
  this.activeElement = null;
  this.createElement = (tagName) => new FakeElement(tagName);
  this.createTextNode = (text) => {
    const node = new FakeElement("#text");
    node.textContent = String(text);
    return node;
  };
}

function FakeElement(tagName) {
  this.tagName = String(tagName).toUpperCase();
  this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
  this.children = [];
  this.attributes = new Map();
  this.dataset = {};
  this.classList = new FakeClassList(this);
  this.eventListeners = new Map();
  this._textContent = "";
  this.open = false;
  this.returnValue = "";

  this.append = (...children) => {
    children.forEach((child) => this.appendChild(child));
  };

  this.appendChild = (child) => {
    this.children.push(child);
    child.parentNode = this;
    return child;
  };

  this.setAttribute = (name, value) => {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
    }
    if (name === "open") {
      this.open = true;
    }
  };

  this.getAttribute = (name) => (this.attributes.has(name) ? this.attributes.get(name) : null);
  this.hasAttribute = (name) => this.attributes.has(name);
  this.removeAttribute = (name) => {
    this.attributes.delete(name);
    if (name === "open") {
      this.open = false;
    }
  };

  this.addEventListener = (type, listener) => {
    const listeners = this.eventListeners.get(type) || [];
    listeners.push(listener);
    this.eventListeners.set(type, listeners);
  };

  this.dispatchEvent = (event) => {
    event.target = event.target || this;
    for (const listener of this.eventListeners.get(event.type) || []) {
      listener(event);
    }
    return !event.defaultPrevented;
  };

  this.showModal = () => {
    this.setAttribute("open", "");
  };

  this.close = (value = "") => {
    this.returnValue = String(value);
    this.removeAttribute("open");
    this.dispatchEvent(createEvent("close", this));
  };

  this.focus = () => {};

  Object.defineProperty(this, "className", {
    get: () => this.classList.toString(),
    set: (value) => {
      this.classList = new FakeClassList(this);
      String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
    },
  });

  Object.defineProperty(this, "textContent", {
    get: () => {
      if (this._textContent) {
        return this._textContent;
      }
      return this.children.map((child) => child.textContent).join("");
    },
    set: (value) => {
      this._textContent = String(value ?? "");
      this.children = [];
    },
  });
}

function FakeClassList(element) {
  this.element = element;
  this.values = new Set();

  this.add = (...names) => {
    names.filter(Boolean).forEach((name) => this.values.add(String(name)));
    this.element.attributes.set("class", this.toString());
  };

  this.contains = (name) => this.values.has(name);
  this.toString = () => [...this.values].join(" ");
}

function createEvent(type, target) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    target,
    type,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}
