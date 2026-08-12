import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "../../test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under views.current-static-contracts by 0.33.33.9.
const { readText } = createProjectTextReader();

const helper = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const listsJs = readText("public/js/lists.js");
const css = readText("public/css/longtail-forge.css");

// Framework primitive structure and accessibility.
const context = createFakeBrowserContext({ iconButton: { iconClass: false } });
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

console.log("View index primitive regression passed.");
