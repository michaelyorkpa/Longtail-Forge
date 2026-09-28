import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeNode} FakeNode */

/**
 * The Clients/Projects read-surface state boundary (`0.33.33.43.53`).
 *
 * `activeClientProjectsReadSurface` is declared from its one writer - the framework's surface
 * element, or `null` - and its reads narrowed with it. Two reads needed a body change, each proved
 * equivalent over the values that can reach it:
 *
 * 1. **The selection roots** filter `null` rather than falsy values: the slot holds `null` or the
 *    element `renderSurface` asserted it built, and `document` is never falsy.
 * 2. **The client filter** is read through the checked lookup for a `select`: the descriptor's
 *    filter is `type: "select"`, rendered as `<select name="clientId">`, and nothing else on the
 *    surface carries that name. The one difference, which no path reaches, is pinned below.
 *
 * Every read runs beside its `9747680c` version, in its own fake document with the real shared
 * `checked-dom.js`, and each outcome - a thrown one included - is compared as data.
 */

const BASE = "9747680c";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const checkedDomSource = reader.readText("public/js/shared/checked-dom.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const READERS = ["selectedProjectClientFilterValue", "refreshActiveClientProjectsReadSurface", "querySelectionInputs"];
const EDITS = [
  [
    "    const roots = [activeClientProjectsReadSurface, document].filter(Boolean);\n"
      + "    // The collected controls stay undeclared with the surface above: `querySelectorAll` answers\n"
      + "    // `Element`, and the callers read `dataset` and `value` off what this returns.",
    "    // The surface is `null` or the element the framework asserted it rendered, so this keeps what\n"
      + "    // `Boolean` kept.\n"
      + "    const roots = [activeClientProjectsReadSurface, document].filter((root) => root !== null);\n"
      + "    // The collected controls stay undeclared: `querySelectorAll` answers `Element`, and the callers\n"
      + "    // read `dataset` and `value` off what this returns. They belong to the lookup boundary.",
  ],
  [
    "    const control = activeClientProjectsReadSurface?.querySelector?.('[name=\"clientId\"]');",
    "    const control = activeClientProjectsReadSurface\n"
      + "      ? requireCheckedDom().find(activeClientProjectsReadSurface, '[name=\"clientId\"]', HTMLSelectElement)\n"
      + "      : null;",
  ],
];

/**
 * @typedef {object} SurfaceReaders
 * @property {() => string} selectedProjectClientFilterValue
 * @property {() => Promise<void>} refreshActiveClientProjectsReadSurface
 * @property {(selector: string) => FakeNode[]} querySelectionInputs
 * @property {(surface: unknown) => void} setSurface
 */

/**
 * One version's surface readers in a sandbox with the real shared checked-DOM contract.
 * @param {string} text
 */
function readersFrom(text) {
  const document = new FakeDocument();
  const context = vm.createContext({ document, ...fakeDomConstructors(), window: {} });
  vm.runInContext(checkedDomSource, context);
  vm.runInContext(`
    let activeClientProjectsReadSurface = null;
    function setSurface(surface) { activeClientProjectsReadSurface = surface; }
  `, context);
  for (const name of [...READERS, "requireCheckedDom"]) {
    vm.runInContext(extractFunctionBlock(text, name), context);
  }
  /** @type {SurfaceReaders} */
  const page = vm.runInContext(`({ ${[...READERS, "setSurface"].join(", ")} })`, context);
  return { document, page };
}

/** @typedef {ReturnType<typeof readersFrom>} Readers */

/**
 * A surface element as the framework hands it over, with its own `refresh`.
 * @param {FakeDocument} document @param {unknown[]} log @param {unknown} [refresh]
 */
function surfaceIn(document, log, refresh = async () => { log.push("refresh"); }) {
  const surface = document.createElement("section");
  Object.defineProperty(surface, "refresh", { value: refresh, enumerable: false });
  document.body.appendChild(surface);
  return surface;
}

/**
 * The surface's client filter, as the framework renders the descriptor's `select`.
 * @param {FakeDocument} document @param {FakeNode} parent @param {string} value @param {string} [tag]
 */
function clientFilterIn(document, parent, value, tag = "select") {
  const form = document.createElement("form");
  const control = document.createElement(tag);
  control.setAttribute("name", "clientId");
  control.value = value;
  form.appendChild(control);
  parent.appendChild(form);
  return control;
}

/** @param {FakeDocument} document @param {FakeNode} parent @param {string} id */
function pickIn(document, parent, id) {
  const input = document.createElement("input");
  input.setAttribute("data-pick", "");
  input.dataset.id = id;
  parent.appendChild(input);
  return input;
}

/** @type {Record<string, (readers: Readers) => unknown>} */
const SCENARIOS = {
  "the filter value with no surface": ({ page }) => page.selectedProjectClientFilterValue(),
  "the filter value with a surface but no filter": ({ document, page }) => {
    page.setSurface(surfaceIn(document, []));
    return page.selectedProjectClientFilterValue();
  },
  "the filter value across the control's real states": ({ document, page }) => {
    const surface = surfaceIn(document, []);
    page.setSurface(surface);
    const control = clientFilterIn(document, surface, "All");
    return ["All", "__workspace_projects__", "c-1", "  c-2  ", ""].map((value) => {
      control.value = value;
      return page.selectedProjectClientFilterValue();
    });
  },
  "the refresh with no surface, a surface, and a surface without a refresh": async ({ document, page }) => {
    /** @type {unknown[]} */
    const log = [];
    await page.refreshActiveClientProjectsReadSurface();
    page.setSurface(surfaceIn(document, log));
    await page.refreshActiveClientProjectsReadSurface();
    page.setSurface(surfaceIn(document, log, "not a function"));
    await page.refreshActiveClientProjectsReadSurface();
    return log;
  },
  "selection inputs without a surface": ({ document, page }) => {
    pickIn(document, document.body, "page-a");
    return page.querySelectionInputs("[data-pick]").map((input) => input.dataset.id);
  },
  "selection inputs with a surface, searched first and counted once": ({ document, page }) => {
    pickIn(document, document.body, "page-before");
    const surface = surfaceIn(document, []);
    pickIn(document, surface, "surface-a");
    pickIn(document, surface, "surface-b");
    pickIn(document, document.body, "page-after");
    page.setSurface(surface);
    return page.querySelectionInputs("[data-pick]").map((input) => input.dataset.id);
  },
};

/** @param {string} text @param {(readers: Readers) => unknown} scenario */
async function run(text, scenario) {
  /** @type {unknown} */
  let outcome;
  try {
    outcome = await scenario(readersFrom(text));
  } catch (error) {
    outcome = { threw: error instanceof Error ? error.message : String(error) };
  }
  return JSON.parse(JSON.stringify({ outcome }));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

/** The page-controller smoke check, which reads the slot for its first check. @param {string} text */
function smokeCheck(text) {
  const at = text.indexOf("    runSmoke: () => {");
  expect(at, "the smoke check is still registered").toBeGreaterThan(-1);
  return text.slice(at, text.indexOf("\n    },\n", at));
}

describe("The boundary changed its declaration and exactly two reads", () => {
  it(`keeps every other body the ${BASE} body, and the two reads differ by their edits alone`, () => {
    for (const name of ["refreshActiveClientProjectsReadSurface", "renderClientProjectsReadSurface", "initializeClientProjectsPage"]) {
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(withoutJsDoc(extractFunctionBlock(baseline, name)));
    }
    for (const name of ["querySelectionInputs", "selectedProjectClientFilterValue"]) {
      const expected = EDITS.reduce((body, [from, to]) => body.replace(from, to), withoutJsDoc(extractFunctionBlock(baseline, name)));
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(expected);
    }
    expect(smokeCheck(current)).toBe(smokeCheck(baseline));
  });

  it("declares the slot from its writer", () => {
    expect(current).toMatch(/@type \{ReturnType<typeof renderClientProjectsReadSurface>\}\n\s+\*\/\n\s+let activeClientProjectsReadSurface = null;/);
  });
});

describe("Every read answers exactly what it did", () => {
  it("matches its baseline version in every state", async () => {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, scenario)));
      expect(now, name).toEqual(before);
      expect(now.outcome?.threw, `${name} runs`).toBeUndefined();
    }
  });

  it("anchors the outcomes the comparison relies on", async () => {
    expect((await run(current, SCENARIOS["the filter value across the control's real states"])).outcome)
      .toEqual(["", "", "c-1", "c-2", ""]);
    expect((await run(current, SCENARIOS["the refresh with no surface, a surface, and a surface without a refresh"])).outcome)
      .toEqual(["refresh"]);
    expect((await run(current, SCENARIOS["selection inputs with a surface, searched first and counted once"])).outcome)
      .toEqual(["surface-a", "surface-b", "page-before", "page-after"]);
  });

  it("refuses only a control no path renders: a non-select named clientId", async () => {
    /** @param {Readers} readers */
    const scenario = ({ document, page }) => {
      const surface = surfaceIn(document, []);
      page.setSurface(surface);
      clientFilterIn(document, surface, "c-9", "input");
      return page.selectedProjectClientFilterValue();
    };
    const [now, before] = await Promise.all(VERSIONS.map(([, text]) => run(text, scenario)));
    expect(before.outcome, "the bare lookup read any element's value").toBe("c-9");
    expect(now.outcome, "the checked lookup reads only the select the descriptor renders").toBe("");
  });
});
