import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * The tag page's control narrowings, checked against the markup that actually builds them.
 *
 * **This suite exists because a narrowing can be wrong in a way no compiler reports.** An earlier
 * checkpoint narrowed a Support View control to `HTMLInputElement` on the strength of its binding
 * name; the element the view renders is a `textarea`, so the narrowing refused a real control and
 * the page silently stopped working. Nothing in the type system objected - the declaration was
 * internally consistent and the file compiled clean.
 *
 * So the cases below do not ask whether `tags.js` type-checks. They read
 * `views/protected/tags.html`, find the element carrying each `data-tag-*` attribute, and assert
 * that the subtype `tags.js` demands is the subtype the view supplies. `[data-tag-description]`
 * is the live trap here: it reads like a textarea and is an `input type="text"`.
 */

const { readText } = createProjectTextReader();
const source = readText("public/js/tags.js");
const view = readText("views/protected/tags.html");

/**
 * The element `views/protected/tags.html` renders for one `data-tag-*` attribute.
 *
 * The lookahead stops `data-tag-status` from matching `data-tag-status-filter`, which is a
 * different control on the same page.
 * @param {string} attribute
 * @returns {string | null}
 */
function renderedTagName(attribute) {
  const pattern = new RegExp(`<([a-z]+)\\b[^>]*\\b${attribute}(?![-\\w])[^>]*>`);
  const match = view.match(pattern);

  return match ? match[1] : null;
}

/**
 * The finder `tags.js` captures one binding through.
 * @param {string} binding
 * @returns {string | null}
 */
function capturedThrough(binding) {
  const match = source.match(new RegExp(`const ${binding} = ([A-Za-z]+)\\(`));

  return match ? match[1] : null;
}

/** Every element name that is an `HTMLElement` but neither an input nor a form. */
const PLAIN_ELEMENTS = ["p", "div", "span", "button", "section", "article"];

/** @type {[string, string, string, string[]][]} binding, attribute, finder, element names it admits */
const NARROWED = [
  ["tagForm", "data-tag-form", "findTagForm", ["form"]],
  ["tagIdInput", "data-tag-id", "findTagInput", ["input"]],
  ["tagNameInput", "data-tag-name", "findTagInput", ["input"]],
  ["tagSlugInput", "data-tag-slug", "findTagInput", ["input"]],
  ["tagColorInput", "data-tag-color", "findTagInput", ["input"]],
  ["tagDescriptionInput", "data-tag-description", "findTagInput", ["input"]],
  ["tagSearchInput", "data-tag-search", "findTagInput", ["input"]],
  ["tagConflictMessage", "data-tag-conflict", "findTagMessage", PLAIN_ELEMENTS],
];

/** The subtype each finder checks, so a finder cannot quietly stop checking. */
const FINDERS = [
  ["findTagInput", "HTMLInputElement"],
  ["findTagForm", "HTMLFormElement"],
  ["findTagMessage", "HTMLElement"],
];

describe("Tag page control narrowing matches the rendered markup", () => {
  for (const [binding, attribute, finder, admitted] of NARROWED) {
    it(`${binding} narrows to what ${attribute} actually is`, () => {
      const rendered = renderedTagName(attribute);

      assert.ok(rendered, `views/protected/tags.html renders no element carrying ${attribute}`);
      assert.equal(
        capturedThrough(binding),
        finder,
        `${binding} must be captured through ${finder}`,
      );
      assert.ok(
        admitted.includes(String(rendered)),
        `${attribute} is rendered as <${rendered}>, which ${finder} refuses - the narrowing would `
          + "discard a control the page needs",
      );
    });
  }

  it("the description field is an input, not the textarea its name suggests", () => {
    assert.equal(
      renderedTagName("data-tag-description"),
      "input",
      "if this ever becomes a textarea, findTagInput must stop being its finder",
    );
    assert.equal(capturedThrough("tagDescriptionInput"), "findTagInput");
  });

  it("the markup reader discriminates between subtypes rather than answering constantly", () => {
    const form = renderedTagName("data-tag-form");
    const field = renderedTagName("data-tag-name");
    const line = renderedTagName("data-tag-conflict");

    assert.deepEqual([form, field, line], ["form", "input", "p"]);
    assert.equal(renderedTagName("data-tag-absent"), null, "an attribute the view lacks reads null");
    assert.equal(
      renderedTagName("data-tag-status"),
      "p",
      "data-tag-status must not match the data-tag-status-filter buttons",
    );
  });

  for (const [finder, subtype] of FINDERS) {
    it(`${finder} checks ${subtype} rather than asserting it`, () => {
      const block = source.slice(source.indexOf(`function ${finder}(selector)`));

      assert.match(
        block.slice(0, block.indexOf("\n  }")),
        new RegExp(`element instanceof ${subtype} \\? element : null`),
        `${finder} must check the subtype, not assert it`,
      );
    });
  }

  it("the status filter buttons are filtered to elements that carry a dataset", () => {
    assert.match(
      source,
      /const statusButtons = \[\.\.\.document\.querySelectorAll\("\[data-tag-status-filter\]"\)\]\s*\n\s*\.filter\(\(button\) => button instanceof HTMLElement\);/,
      "statusButtons reads button.dataset, so the list must be filtered to HTMLElement",
    );
    assert.equal(
      renderedTagName("data-tag-status-filter"),
      "button",
      "the status filters must stay real buttons",
    );
  });
});

describe("Tag page controls that are deliberately not narrowed", () => {
  /**
   * These four are captured raw on purpose. Every member `tags.js` reads on them is already
   * `Element`'s, so narrowing them would tighten behaviour with nothing to justify it. The cases
   * below fail if a later change either narrows them without cause or starts reading a subtype
   * member through them.
   * @type {[string, string, RegExp[]][]} binding, attribute, reads that must stay Element's
   */
  const RAW = [
    ["tagList", "data-tag-list", [/tagList\.replaceChildren\(/]],
    ["tagStatus", "data-tag-status", [/tagStatus\.textContent = message;/, /tagStatus\.className = /]],
    ["tagRefreshButton", "data-tag-refresh", [/tagRefreshButton\?\.addEventListener\("click", loadTags\);/]],
    ["tagResetButton", "data-tag-reset", [/tagResetButton\?\.addEventListener\("click", resetForm\);/]],
  ];

  for (const [binding, attribute, reads] of RAW) {
    it(`${binding} stays a plain lookup`, () => {
      assert.match(
        source,
        new RegExp(`const ${binding} = document\\.querySelector\\("\\[${attribute}\\]"\\);`),
        `${binding} needs no subtype, so it must not be narrowed`,
      );

      for (const read of reads) {
        assert.match(source, read, `${binding} must keep reading only Element members`);
      }
    });
  }
});

describe("Tag page absence handling is unchanged by narrowing", () => {
  /**
   * The narrowing is only honest if the page still tolerates a missing control, because that is
   * the path a wrong subtype now takes. Each guard below is the one that makes a refusal helper
   * unnecessary on this page.
   * @type {[string, RegExp][]}
   */
  const GUARDS = [
    ["renderTags returns before touching the list", /function renderTags\(\) {\s*\n\s*if \(!tagList\) {\s*\n\s*return;/],
    ["the conflict line returns before it is written", /function renderTagConflictMessage\(\) {\s*\n\s*if \(!tagConflictMessage\) {\s*\n\s*return;/],
    ["setStatus returns before writing text", /function setStatus\(message, isError = false\) {\s*\n\s*if \(!tagStatus\) {\s*\n\s*return;/],
    ["editTag writes each field only when it is present", /if \(tagIdInput\) {\s*\n\s*tagIdInput\.value = tag\.tag_id \|\| "";/],
    ["the form reset tolerates an absent form", /tagForm\?\.reset\(\);/],
    ["focus after reset tolerates an absent field", /tagNameInput\?\.focus\(\);/],
  ];

  for (const [name, pattern] of GUARDS) {
    it(name, () => {
      assert.match(source, pattern, "this guard is why the page needs no refusal helper");
    });
  }

  it("no control is refused by a thrown error", () => {
    assert.doesNotMatch(
      source.slice(source.indexOf("function findTagInput")),
      /throw new TypeError\(`The tags page requires/,
      "this page degrades rather than refusing; a refusal here would be new behaviour",
    );
  });
});
