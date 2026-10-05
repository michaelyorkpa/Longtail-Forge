import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Files page's element handles, checked against the builders that actually make them.
 *
 * **This page has no markup to trace: it builds its own chrome and then re-queries it.** So the
 * producer and the consumer are both in this file, and these cases hold the two together. That
 * pairing is the whole point: `0.33.33.38.3.4` narrowed a control on the strength of its binding
 * name, the view rendered a different element, and the page stopped working in silence with the
 * file compiling clean throughout.
 *
 * Each handle below is asserted three ways - the element its builder makes, the subtype its
 * declaration claims, and the lookup that fills it - so a change to any one of the three without
 * the others fails here rather than at runtime.
 */

const source = createProjectTextReader().readText("public/js/files.js");

/**
 * The tag `files.js` builds for one dataset key, read from the `createFilesElement` call that
 * carries it. Returns null when no builder claims the key.
 * @param {string} datasetKey
 * @returns {string | null}
 */
function builtTag(datasetKey) {
  const at = source.indexOf(`dataset: { ${datasetKey}: "" }`);
  if (at === -1) {
    return null;
  }

  const opener = source.lastIndexOf("createFilesElement(\"", source.slice(0, at).lastIndexOf("createFilesElement(\"") + 1);
  const match = source.slice(opener).match(/^createFilesElement\("([a-z]+)"/);

  return match ? match[1] : null;
}

/**
 * @type {ReadonlyArray<{ handle: string, selector: string, declared: string, lookup: string }>}
 * The eleven handles whose declaration claims a subtype, and the four that stay `Element`.
 */
const HANDLES = [
  { handle: "filterForm", selector: "[data-file-filters]", declared: "Element", lookup: "document.querySelector" },
  { handle: "moduleFilter", selector: "[data-file-filter-module]", declared: "HTMLInputElement", lookup: "findFilesInput" },
  { handle: "targetTypeFilter", selector: "[data-file-filter-target-type]", declared: "HTMLInputElement", lookup: "findFilesInput" },
  { handle: "targetIdFilter", selector: "[data-file-filter-target-id]", declared: "HTMLInputElement", lookup: "findFilesInput" },
  { handle: "clientFilter", selector: "[data-file-filter-client]", declared: "HTMLSelectElement", lookup: "findFilesSelect" },
  { handle: "projectFilter", selector: "[data-file-filter-project]", declared: "HTMLSelectElement", lookup: "findFilesSelect" },
  { handle: "advancedProjectFilter", selector: "[data-file-filter-project-id]", declared: "HTMLInputElement", lookup: "findFilesInput" },
  { handle: "filenameFilter", selector: "[data-file-filter-filename]", declared: "HTMLInputElement", lookup: "findFilesInput" },
  { handle: "statusFilter", selector: "[data-file-filter-status]", declared: "HTMLSelectElement", lookup: "findFilesSelect" },
  { handle: "fileStatus", selector: "[data-file-status]", declared: "Element", lookup: "document.querySelector" },
  { handle: "fileList", selector: "[data-file-list]", declared: "Element", lookup: "document.querySelector" },
  { handle: "filePagination", selector: "[data-file-pagination]", declared: "HTMLElement", lookup: "findFilesHtmlElement" },
  { handle: "fileTableMount", selector: "[data-file-table-mount]", declared: "Element", lookup: "document.querySelector" },
  { handle: "loadMoreFilesButton", selector: "[data-file-load-more]", declared: "HTMLButtonElement", lookup: "findFilesButton" },
];

describe("Every Files handle declares what its lookup produces", () => {
  for (const { handle, selector, declared, lookup } of HANDLES) {
    it(`${handle} is declared ${declared} and filled by ${lookup}`, () => {
      assert.match(
        source,
        new RegExp(`@type \\{${declared} \\| null\\}[\\s*]*/\\s*\\n\\s*let ${handle} = null;`),
        `${handle} must declare ${declared} | null`,
      );
      // Compared as a literal rather than built into a regex. The lookup and selector both carry
      // regex metacharacters - a dot and brackets - and hand-escaping them here was both wrong
      // (it escaped one dot and no backslashes) and unnecessary: this assertion wants an exact
      // spelling, which `includes` already gives.
      assert.ok(
        source.includes(`${handle} = ${lookup}("${selector}")`),
        `${handle} must be filled by ${lookup}("${selector}")`,
      );
    });
  }

  it("covers every handle the page caches, so none can be added unchecked", () => {
    const cache = source.slice(source.indexOf("function cacheFilesElements()"));
    const body = cache.slice(0, cache.indexOf("\n  }"));
    const assigned = [...body.matchAll(/^\s*([A-Za-z]+) = /gm)].map((match) => match[1]);

    assert.deepEqual(
      assigned.sort(),
      HANDLES.map((entry) => entry.handle).sort(),
      "a handle was added to cacheFilesElements without a case here",
    );
  });
});

describe("The builders make what the declarations claim", () => {
  /** @type {ReadonlyArray<[string, string, string]>} dataset key, built tag, the handle it fills */
  const BUILT = [
    ["fileFilters", "form", "filterForm"],
    ["fileFilterClient", "select", "clientFilter"],
    ["fileFilterProject", "select", "projectFilter"],
    ["fileFilterStatus", "select", "statusFilter"],
    ["fileTableMount", "div", "fileTableMount"],
    ["filePagination", "div", "filePagination"],
    ["fileLoadMore", "button", "loadMoreFilesButton"],
  ];

  for (const [datasetKey, tag, handle] of BUILT) {
    it(`${handle} is built as a <${tag}>`, () => {
      assert.equal(builtTag(datasetKey), tag, `${datasetKey} must stay a <${tag}>`);
    });
  }

  it("the text filters are built by createInput, which makes an input", () => {
    assert.match(
      source,
      /function createInput\(type, dataKey, attributes = \{\}\) \{\s*\n\s*return createFilesElement\("input", \{/,
      "the four text filters and the filename search all come from here",
    );
    for (const key of ["fileFilterModule", "fileFilterTargetType", "fileFilterTargetId", "fileFilterProjectId"]) {
      assert.match(source, new RegExp(`createInput\\("text", "${key}"`), `${key} must stay a text input`);
    }
    assert.match(source, /createInput\("search", "fileFilterFilename"/);
  });

  it("the tag reader discriminates rather than answering constantly", () => {
    assert.deepEqual(
      [builtTag("fileFilters"), builtTag("fileLoadMore"), builtTag("filePagination")],
      ["form", "button", "div"],
    );
    assert.equal(builtTag("thisKeyIsNotBuilt"), null);
  });
});

describe("The four handles left at Element are left there on purpose", () => {
  /**
   * Every member this page reads on these four is already `Element`'s, so naming a subtype would
   * claim more than the page uses and would refuse a builder that legitimately returned something
   * else. These cases fail if a later change starts reading a subtype member through one of them.
   * @type {ReadonlyArray<[string, RegExp[]]>}
   */
  const ELEMENT_ONLY = [
    ["filterForm", [/filterForm\?\.addEventListener\("submit"/]],
    ["fileStatus", [/fileStatus\.textContent = /, /fileStatus\.classList\./]],
    ["fileList", [/fileList\.replaceChildren\(/]],
    ["fileTableMount", [/fileTableMount\.replaceChildren\(/, /fileTableMount\.querySelector\(/]],
  ];

  for (const [handle, reads] of ELEMENT_ONLY) {
    it(`${handle} is read only through Element members`, () => {
      for (const read of reads) {
        assert.match(source, read, `${handle} must keep reading only Element members`);
      }
    });
  }

  it("fileList's second producer agrees with its first", () => {
    assert.match(
      source,
      /fileList = fileTableMount\.querySelector\("\[data-file-list\]"\);/,
      "the table rebuild re-finds the same tbody the first lookup found",
    );
    assert.match(
      source,
      /tbody\.dataset\.fileList = "";/,
      "and that tbody is the one createFilesTable marks",
    );
  });
});

describe("The checked lookups check rather than assert", () => {
  /** @type {ReadonlyArray<[string, string]>} */
  const FINDERS = [
    ["findFilesInput", "HTMLInputElement"],
    ["findFilesSelect", "HTMLSelectElement"],
    ["findFilesButton", "HTMLButtonElement"],
    ["findFilesHtmlElement", "HTMLElement"],
  ];

  for (const [finder, subtype] of FINDERS) {
    it(`${finder} checks ${subtype}`, () => {
      const block = source.slice(source.indexOf(`function ${finder}(selector)`));

      assert.match(
        block.slice(0, block.indexOf("\n  }")),
        new RegExp(`element instanceof ${subtype} \\? element : null`),
        `${finder} must check the subtype, not assert it`,
      );
    });
  }

  it("no handle is refused, because this page already tolerates absence", () => {
    assert.doesNotMatch(
      source,
      /throw new (Type)?Error\(`?The Files page requires its /,
      "every read is already guarded; a refusal here would be new behaviour",
    );
    assert.match(source, /if \(fileTableMount\) \{/);
    assert.match(source, /if \(!fileList\) \{|fileList\?\./);
  });
});

describe("The tooltip is built into a local before the handle is published", () => {
  /**
   * `activeFilesTooltip` is `HTMLElement | null`, so reading it straight after assignment would
   * have needed a null check the old code did not have. Building into a local keeps every read
   * non-null without adding a guard, and the write order is unchanged.
   */
  it("builds, ids, publishes, then wires - in that order", () => {
    const block = source.slice(source.indexOf("const tooltip = createFilesElement(\"div\""));
    const body = block.slice(0, block.indexOf("positionFilesTooltip();"));

    const order = ["tooltip.id = ", "activeFilesTooltip = tooltip;", "activeFilesTooltipTarget = target;",
      "target.setAttribute(\"aria-describedby\", tooltip.id);", "document.body.appendChild(tooltip);"];
    let cursor = -1;
    for (const step of order) {
      const at = body.indexOf(step);
      assert.notEqual(at, -1, `${step} must still happen`);
      assert.ok(at > cursor, `${step} is out of order`);
      cursor = at;
    }
  });

  it("reads the local rather than the nullable handle", () => {
    assert.doesNotMatch(
      source,
      /activeFilesTooltip\.id = /,
      "reading the module handle here would require a null check that did not exist before",
    );
  });
});
