import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const helper = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const listsJs = readText("public/js/lists.js");
const css = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));

assert.equal(packageJson.version, "0.33.5.21.7.4", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.7.4", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.7.4", "package-lock package entry should report the current app version");

// Framework primitive structure and accessibility.
const context = createBrowserContext();
vm.runInNewContext(helper, context, { filename: "view-builder.js" });
const view = context.window.LongtailForge.view;

assert.equal(typeof view.createIndexList, "function", "LongtailForge.view.createIndexList should be exposed");

const node = context.document.createElement("span");
node.textContent = "Active";
const list = view.createIndexList({
  ariaLabel: "List index",
  items: [
    {
      id: "alpha",
      label: "Alpha list",
      selected: true,
      onSelect: () => {},
      chips: [node, "Procurement", "", null, "0/0 checked"],
      meta: ["Mt Goat Mowers", "", "2 linked records"],
    },
    {
      id: "beta",
      label: "Beta list",
      chips: [],
      meta: [],
    },
  ],
});

assert.equal(list.tagName, "UL", "index list should be an unordered list");
assert(list.classList.contains("view-index-list"), "index list should carry the framework class");
assert.equal(list.getAttribute("role"), "list", "index list should declare a list role");

const buttons = list.querySelectorAll(".view-index-list-button");
assert.equal(buttons.length, 2, "each item should render a selectable button");
assert.equal(buttons[0].getAttribute("type"), "button", "index items should use real buttons");
assert.equal(buttons[0].dataset.viewIndexId, "alpha", "index buttons should carry their record id");
assert(buttons[0].classList.contains("is-selected"), "selected item should be marked selected");
assert.equal(buttons[0].getAttribute("aria-current"), "true", "selected item should expose aria-current");
assert.equal(buttons[1].getAttribute("aria-current"), null, "unselected item should not expose aria-current");
assert.equal(list.querySelector(".view-index-list-label").textContent, "Alpha list", "primary label should render");
assert(list.querySelector(".view-index-list-chips"), "chip row should render when chips are provided");
assert(list.querySelector(".view-index-list-chips").classList.contains("surface-chip-row"), "chip row should reuse the shared chip-row surface class");
assert(list.querySelector(".view-index-list-meta"), "secondary meta lines should render");

assert.throws(() => view.createIndexList({ items: [{}] }), /Index list items require a label/, "index items should require a label");
assert.doesNotMatch(helper, /\binnerHTML\b|\binsertAdjacentHTML\b/, "view builder must not inject HTML strings");
assert.match(helper, /createIndexList,/, "view builder should export createIndexList in the frozen namespace");

// Renderer consumes the shared primitive for selector/index anatomy.
assert.match(renderer, /view\.createIndexList\(/, "renderer should build the index through the shared primitive");
assert.match(renderer, /"createIndexList"/, "renderer should require the createIndexList primitive");

// Imperative Lists adopts the primitive and abandons the multi-column table selector.
assert.match(listsJs, /view\.createIndexList\(/, "Lists should render its index with the shared primitive");
assert.match(listsJs, /function listIndexItem\(/, "Lists should map records to index items");
assert.doesNotMatch(listsJs, /columns:\s*\[\s*"List"/, "Lists index should no longer be a multi-column data table");
assert.match(listsJs, /dataset\.listsIndexContent/, "Lists should preserve the index content hook");
assert.match(listsJs, /dataset\.listsList/, "Lists should preserve the index list hook");

// CSS owns the split + index list and drops the duplicate one-off Lists grid.
assert.match(css, /\.view-index-list\s*\{/, "CSS should define the index list primitive");
assert.match(css, /\.view-split-list-detail\s*\{[\s\S]*width:\s*100%/, "framework split should fill available width");
assert.match(css, /@media[^{]*\{\s*\.view-split-list-detail\s*\{[\s\S]*grid-template-columns:\s*1fr/, "framework split should own responsive collapse");
assert.doesNotMatch(css, /\.lists-workspace\s*\{[\s\S]*grid-template-columns/, "legacy one-off Lists grid override should be removed");

assert.match(regressionSuite, /scripts\/view-index-primitive-regression\.mjs/, "Regression suite should include the index primitive regression");

console.log("View index primitive regression passed.");

function createBrowserContext() {
  const document = new FakeDocument();
  const window = {
    document,
    LongtailForge: {
      icons: {
        createIconButton(options = {}) {
          const button = document.createElement("button");
          button.type = options.type || "button";
          button.classList.add("action-button");
          if (options.text) {
            button.textContent = options.text;
          }
          return button;
        },
      },
    },
  };
  return { window, document };
}

function FakeDocument() {
  this.createElement = (tagName) => new FakeElement(tagName);
  this.createTextNode = (text) => {
    const textNode = new FakeElement("#text");
    textNode.textContent = String(text);
    return textNode;
  };
}

function FakeElement(tagName) {
  this.tagName = String(tagName).toUpperCase();
  this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
  this.children = [];
  this.attributes = new Map();
  this.dataset = {};
  this.classList = new FakeClassList(this);
  this._textContent = "";
  this.open = false;
  this.hidden = false;
  this.disabled = false;
  this.type = "";

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
  };

  this.getAttribute = (name) => (this.attributes.has(name) ? this.attributes.get(name) : null);

  this.removeAttribute = (name) => {
    this.attributes.delete(name);
  };

  this.addEventListener = () => {};

  this.querySelector = (selector) => findAll(this, selector)[0] || null;
  this.querySelectorAll = (selector) => findAll(this, selector);

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
    names.filter(Boolean).forEach((name) => {
      const token = String(name);
      if (/\s/.test(token)) {
        throw new Error("The token can not contain whitespace.");
      }
      this.values.add(token);
    });
    this.element.attributes.set("class", this.toString());
  };

  this.contains = (name) => this.values.has(name);
  this.toString = () => [...this.values].join(" ");
}

function findAll(root, selector) {
  const matches = [];
  const queue = [...root.children];
  while (queue.length) {
    const element = queue.shift();
    if (matchesSelector(element, selector)) {
      matches.push(element);
    }
    queue.push(...element.children);
  }
  return matches;
}

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
