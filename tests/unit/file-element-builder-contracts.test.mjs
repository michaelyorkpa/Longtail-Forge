import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Files page's own element builders hand the shared view factory.
 *
 * `0.33.33.43.12` typed the seven small builders and changed **no executable line**. The whole
 * checkpoint is a claim about types, so the suite proves the claim the compiler cannot: that these
 * builders pass their arguments through **unconverted**. A recording factory stands in for the real
 * one, and each case asserts the value that arrives is the very value that went in - by identity,
 * not by shape.
 *
 * The one place a conversion does happen, `createTruncatedText`, had it already: `String(value || "")`
 * is the page's own line, and a case pins it as pre-existing rather than letting it look introduced.
 */

const source = createProjectTextReader().readText("public/js/files.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

const LIFTED = [
  "requireView", "requireFilesViewHelper", "createFilesElement", "metadataText",
  "createFilterLabel", "createBusinessFilterLabel", "createInput", "createFileContextSelect",
  "createFileContextField", "createReadOnlyMetadataRow", "createTruncatedText",
];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isBag(value) {
  return typeof value === "object" && value !== null;
}

/**
 * A recorded value as the bag it must be. The readers exist because everything the factory is
 * handed is `unknown` by contract - which is the point of the checkpoint, so the suite reads it
 * the same careful way the page's own code has to.
 * @param {unknown} value @param {string} [what]
 * @returns {Record<string, unknown>}
 */
function bag(value, what = "an options bag") {
  assert.ok(isBag(value), `expected ${what}`);
  return value;
}

/** @param {unknown} value @returns {unknown[]} */
function list(value) {
  assert.ok(Array.isArray(value), "expected a list of children");
  return value;
}

/**
 * The options bag the recording factory was handed for the nth element it built.
 * @param {{ calls: unknown[] }} api @param {number} [index]
 * @returns {Record<string, unknown>}
 */
function nth(api, index = 0) {
  const built = api.calls.filter((call) => isBag(call) && typeof call.tagName === "string");
  const call = bag(built[index], `at least ${index + 1} element(s) to have been built`);

  return bag(call.options, "every recorded build to carry its options");
}

/**
 * The options bag of the first element built with the given tag.
 * @param {{ calls: unknown[] }} api @param {string} tagName
 * @returns {Record<string, unknown>}
 */
function tagged(api, tagName) {
  const match = api.calls.filter((call) => isBag(call) && call.tagName === tagName)[0];

  return bag(bag(match, `a <${tagName}> to have been built`).options, `<${tagName}> options`);
}

/**
 * The builders over a factory that records rather than builds.
 * @param {{ omitCreateElement?: boolean }} [options]
 */
function builders(options = {}) {
  // Own built-ins: nothing from this realm is injected, so boxing and prototypes stay consistent
  // inside the sandbox. The tooltip helpers are stubbed because `createTruncatedText` only *registers*
  // them - they are free variables it needs, not behaviour under test here.
  const sandbox = vm.createContext({});
  vm.runInContext(
    "globalThis.calls = [];"
      + "globalThis.showFilesTooltip = () => {};"
      + "globalThis.hideFilesTooltip = () => {};"
      + "globalThis.element = (tagName, opts) => ({"
      + "  tagName, options: opts, dataset: {}, tabIndex: -1,"
      + "  setAttribute(name, value) { this[name] = value; },"
      + "  addEventListener() {},"
      + "});"
      + (options.omitCreateElement
        ? "globalThis.window = { LongtailForge: { view: {} } };"
        : "globalThis.window = { LongtailForge: { view: {"
          + "  createElement(tagName, opts) { calls.push({ tagName, options: opts }); return element(tagName, opts); },"
          + "} } };"),
    sandbox,
  );
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")}, calls })`, sandbox);
}

describe("A label and its control reach the factory unconverted", () => {
  it("passes both through as children, by identity", () => {
    const api = builders();
    const control = { marker: "the control node" };
    const label = Symbol("Filename");

    api.createFilterLabel(label, control);

    const children = list(nth(api).children);
    assert.equal(children[0], label, "a symbol label must arrive as itself, not stringified");
    assert.equal(children[1], control, "and the control by reference, not rebuilt");
  });

  it("marks the business-scope variant without touching what it was given", () => {
    const api = builders();
    const control = { marker: "control" };
    const node = api.createBusinessFilterLabel(7, control);

    assert.equal(list(nth(api).children)[0], 7, "a number must not become \"7\" on the way past");
    assert.equal(node.dataset.fileBusinessControl, "", "the business marker is the only thing added");
  });
});

describe("An input carries a value in its attrs and a name in its dataset", () => {
  /**
   * The asymmetry is the point. `dataKey` is a **computed key** in a `Record<string, unknown>`, so
   * it has to be a string; `type` is a **value** in that same record, which asks nothing of it.
   */
  it("keeps the attribute value opaque and the dataset key literal", () => {
    const api = builders();
    const type = Symbol("search");

    api.createInput(type, "fileFilterFilename", { autocomplete: "off" });

    const options = nth(api);
    const attrs = bag(options.attrs, "an attrs bag");
    const dataset = bag(options.dataset, "a dataset bag");

    assert.equal(attrs.type, type, "the attribute value is handed over unconverted");
    assert.equal(attrs.autocomplete, "off", "and the spread extras survive");
    assert.ok(Object.hasOwn(dataset, "fileFilterFilename"), "the dataset key is the string it was given");
    assert.equal(dataset.fileFilterFilename, "");
  });

  it("lets a later attribute override the type it was constructed with", () => {
    const api = builders();

    api.createInput("text", "k", { type: "search" });
    assert.equal(bag(nth(api).attrs).type, "search", "the spread comes second, so it wins");
  });

  it("does the same for the file editor's context pickers", () => {
    const api = builders();
    const name = { toString() { return "never called"; } };

    api.createFileContextSelect("fileContextTarget", name);

    const options = tagged(api, "select");
    assert.equal(bag(options.attrs).name, name, "no conversion, so the toString hook stays unused");
    assert.ok(Object.hasOwn(bag(options.dataset), "fileContextTarget"));
  });
});

describe("The file editor's own rows hand text and children straight through", () => {
  it("builds a labelled field without converting either part", () => {
    const api = builders();
    const control = { marker: "control" };
    const label = Symbol("File name");

    api.createFileContextField(label, control);

    assert.equal(tagged(api, "span").text, label, "the span's text is the value it was given");
    assert.equal(list(tagged(api, "label").children)[1], control, "and the control travels by reference");
  });

  it("keeps a metadata key opaque, because it is a value and not a computed name", () => {
    const api = builders();
    const key = Symbol("size");

    api.createReadOnlyMetadataRow("Size", "1.2 MB", key);

    const dataset = bag(tagged(api, "div").dataset);
    assert.equal(dataset.fileContextMetadataKey, key, "a literal member takes any value");
  });

  it("normalises a missing metadata value through the page's existing reader", () => {
    const api = builders();

    api.createReadOnlyMetadataRow("Size", null, "size");
    assert.equal(tagged(api, "dd").text, "Not recorded", "metadataText already supplied this fallback");
  });
});

describe("The one builder that does convert, converted before this checkpoint", () => {
  it("still reads its value through String, exactly as it did", () => {
    const api = builders();

    api.createTruncatedText(7);
    assert.equal(nth(api).text, "7");
  });

  it("answers a symbol rather than throwing, because String and a template differ", () => {
    const api = builders();

    // `String(sym)` is "Symbol(x)"; `${sym}` throws. The page wrote `String(...)`, so this is what
    // it already did - typing the parameter `unknown` neither introduced nor removed it.
    //
    // The throw is captured rather than allowed to escape: a mutation to the template form would
    // otherwise fail this suite with a raw TypeError, which the campaign runner scores as an
    // incidental error instead of a catch. Comparing the *answer* keeps the difference assertable.
    const answered = (() => {
      try {
        api.createTruncatedText(Symbol("a name"));
        return nth(api).text;
      } catch (error) {
        return error;
      }
    })();

    assert.equal(answered, "Symbol(a name)", "a template form would have thrown here instead");
  });

  it("treats every falsy value as empty, and adds no tooltip for one", () => {
    const api = builders();

    for (const value of [null, undefined, 0, "", false, Number.NaN]) {
      const node = api.createTruncatedText(value);
      assert.equal(node.options.text, "", `${String(value)} must collapse to empty`);
      assert.equal(node.dataset.fullText, undefined, "and carry no full-text marker");
    }
  });

  it("joins a class name in without demanding it be a string", () => {
    const api = builders();

    assert.equal(api.createTruncatedText("x", 0).options.className, "files-truncate", "falsy is filtered out");
    assert.equal(api.createTruncatedText("x", "extra").options.className, "files-truncate extra");
  });
});

describe("Every builder goes through the shared factory, not around it", () => {
  it("refuses a view that cannot create elements, by name", () => {
    const api = builders({ omitCreateElement: true });

    assert.throws(
      () => api.createFilterLabel("Filename", {}),
      { message: "Files browse requires LongtailForge.view.createElement." },
    );
  });
});

describe("The published vocabulary is cited rather than re-invented", () => {
  it("declares no local parallel for the option members the contract owns", () => {
    for (const reserved of ["BrowserViewChildren", "BrowserViewTextValue", "BrowserViewClassNames", "BrowserViewAttributeBag"]) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\}\\} ${reserved}\\b|\\* @typedef \\{[^}]*\\} ${reserved}\\b`),
        `${reserved} belongs to the shared view surface, not to this page`,
      );
    }
    assert.match(
      source,
      /@param \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserViewAttributeBag\} \[attributes\]/,
      "the attrs bag is the published record, reused",
    );
  });

  it("the contract it defers to still says why those members are unknown", () => {
    assert.match(
      contracts,
      /\*\*Option members are `unknown` where the implementation coerces\.\*\*/,
      "if this sentence goes, the reason these parameters are unknown goes with it",
    );
    for (const published of ["BrowserViewChildren", "BrowserViewTextValue", "BrowserViewClassNames"]) {
      assert.match(contracts, new RegExp(`export type ${published} = unknown;`));
    }
    assert.match(contracts, /export type BrowserViewAttributeBag = Record<string, unknown>;/);
  });

  it("types the two computed dataset keys as strings, and says why", () => {
    assert.match(source, /@param \{unknown\} type @param \{string\} dataKey/);
    assert.match(source, /@param \{string\} datasetKey @param \{unknown\} name/);
    assert.match(
      source,
      /\*\*`dataKey` is the one parameter here that is genuinely a string\*\*/,
      "the reason must sit where the next reader meets it",
    );
  });
});
