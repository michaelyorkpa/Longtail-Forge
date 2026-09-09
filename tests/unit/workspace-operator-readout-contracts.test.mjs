import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Workspace Settings operator readouts, checked by `0.33.33.44.1`.
 *
 * **One behaviour boundary, two readouts.** Runtime Diagnostics and Jobs render into three sibling
 * containers built by the same `readoutSection` helper, and both follow the same policy: the
 * section is *optional* - a deployment that does not render it is skipped entirely by the loader -
 * and the render helpers beneath that loader are *required*, because they are only reachable once
 * the loader has established presence.
 *
 * That is why this child takes the DOM containers and the render inputs together rather than as
 * two cohorts: the containers' optionality and the renderers' requiredness are the same fact.
 */

const page = readFileSync(new URL("../../public/js/workspace-settings.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const host = readFileSync(new URL("../../public/js/shared/settings-host.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

const CONTAINERS = [
  ["runtimeDiagnosticsSummary", "[data-runtime-diagnostics-summary]", "requireRuntimeDiagnosticsSummary"],
  ["jobObservabilitySummary", "[data-job-observability-summary]", "requireJobObservabilitySummary"],
  ["jobObservabilityFailures", "[data-job-observability-failures]", "requireJobObservabilityFailures"],
];

describe("the containers are acquired the way the host builds them", () => {
  it("matches the element the readout sections actually render", () => {
    // All three are plain `<div>` grids inside a `readoutSection`, so `HTMLElement` is the widest
    // thing the page verifies and the narrowest thing `replaceChildren`/`appendChild` need.
    for (const dataset of ["runtimeDiagnosticsSummary", "jobObservabilitySummary", "jobObservabilityFailures"]) {
      const at = host.indexOf(`dataset: { ${dataset}: "" },`);
      assert.notEqual(at, -1, dataset + " must be built by the settings host");
      const element = host.slice(host.lastIndexOf('element("', at), at);
      assert.match(element, /^element\("div", \{/, dataset + " is a div");
    }
    assert.match(host, /readoutSection\("Runtime Diagnostics", "runtime-diagnostics-readout"/);
    assert.match(host, /readoutSection\("Jobs", "job-observability-readout"/);
  });

  it("captures all three through the page's existing checked lookup", () => {
    for (const [name, selector] of CONTAINERS) {
      assert.match(page, new RegExp(`const ${name} = findElement\\("\\${selector.replace(/[[\]]/g, "\\$&")}"\\);`
        .replace("\\\\", "\\")), name + " is captured through findElement");
    }
    assert.match(slice("  function findElement(selector) {"),
      /node instanceof HTMLElement \? node : null;/,
      "and that lookup narrows by a runtime check, not an assertion");
  });

  it("adds no new lookup helper, because the page already had the right one", () => {
    assert.equal((page.match(/function findElement\(/g) || []).length, 1);
    for (const invented of ["findGrid", "findReadout", "findSummary"]) {
      assert.ok(!page.includes("function " + invented), invented + " must not exist");
    }
  });
});

describe("optional section, required renderer", () => {
  it("keeps each loader's own early exit", () => {
    const runtime = slice("  async function loadRuntimeDiagnostics() {");
    assert.match(runtime, /if \(!runtimeDiagnosticsSummary\) \{\s*\n\s*return false;\s*\n\s*\}/,
      "an absent runtime container still skips the whole readout");
    const jobs = slice("  async function loadJobObservability(options = {}) {");
    assert.match(jobs, /if \(!jobObservabilitySummary \|\| !jobObservabilityFailures\) \{\s*\n\s*return;\s*\n\s*\}/,
      "and an absent jobs container still skips that one");
  });

  it("checks each container at the render helper that already dereferenced it", () => {
    for (const [name, , guard] of CONTAINERS) {
      assert.ok(!new RegExp(`\\n\\s*${name}\\.(replaceChildren|appendChild|append)\\(`).test(executable),
        name + " must no longer be dereferenced unguarded");
      assert.ok(executable.includes(guard + "()."), guard + " must be used at the render helpers");
    }
  });

  it("raises a named error rather than dereferencing null", () => {
    for (const [, , guard] of CONTAINERS) {
      const body = slice("  function " + guard + "() {");
      assert.match(body, /throw new Error\("Workspace settings requires its [^"]+\."\);/,
        guard + " must raise, not substitute");
      assert.ok(!/createElement|\|\|/.test(body), guard + " must not fabricate a stand-in element");
    }
  });

  it("did not promote the optional sections to required", () => {
    // The page must still load with neither readout rendered; only the helpers beneath the
    // loaders' guards demand a container.
    // The module-evaluation prologue: captures and listener wiring, up to the first declaration.
    // Everything after it is a function body, reachable only through a loader.
    const firstDeclaration = executable.search(/\n {2}(?:async )?function /);
    assert.notEqual(firstDeclaration, -1, "the page must declare functions");
    const prologue = executable.slice(0, firstDeclaration);
    assert.match(prologue, /const runtimeDiagnosticsSummary = findElement\(/,
      "the prologue is where the containers are captured");
    for (const [, , guard] of CONTAINERS) {
      assert.ok(!prologue.includes(guard),
        guard + " must not run during module evaluation or page wiring");
    }
  });

  it("queries each container once, at module evaluation", () => {
    for (const [name] of CONTAINERS) {
      assert.equal((page.match(new RegExp(`const ${name} = find`, "g")) || []).length, 1,
        name + " is captured once");
      assert.ok(!new RegExp(`${name}\\s*=\\s*(document\\.)?(querySelector|findElement)`)
        .test(page.slice(page.indexOf("async function loadRuntimeDiagnostics"))),
        name + " is never re-queried later");
    }
  });
});

describe("the render inputs are typed from the readers that produce them", () => {
  it("types both runtime consumers as the reader's own answer", () => {
    // `readRuntimeDiagnosticsResponse` answers `BrowserRuntimeDiagnostics | null` and the caller
    // refuses `null`, so both consumers receive the validated record.
    for (const consumer of ["renderRuntimeDiagnostics", "readRuntimeDiagnosticWarnings"]) {
      const at = page.indexOf("  function " + consumer + "(diagnostics) {");
      assert.notEqual(at, -1, consumer + " must take the diagnostics record");
      assert.match(page.slice(page.lastIndexOf("/**", at), at),
        /@param \{BrowserRuntimeDiagnostics\} diagnostics/,
        consumer + " must name the validated record");
    }
    assert.match(page, /@returns \{BrowserRuntimeDiagnostics \| null\}/,
      "which is what the reader answers");
  });

  it("types the jobs renderer as the readout the reader validates", () => {
    const at = page.indexOf("  function renderJobObservability(jobs, options = {}) {");
    assert.notEqual(at, -1);
    assert.match(page.slice(page.lastIndexOf("/**", at), at),
      /@param \{BrowserJobReadout\} jobs/);
    assert.match(page, /@returns \{value is BrowserJobReadout\}/,
      "and the page's own predicate is what establishes it");
  });

  it("types the accumulated failure list, and says why it accumulates", () => {
    const at = page.indexOf("  let jobObservabilityFailureItems = [];");
    assert.notEqual(at, -1);
    const doc = page.slice(page.lastIndexOf("/**", at), at);
    assert.match(doc, /@type \{BrowserJobFailureSummary\[\]\}/);
    assert.match(doc, /Load more/, "the doc records why the slot is cumulative");
    assert.match(page, /@param \{BrowserJobFailureSummary\[\]\} items/,
      "and the item renderer takes that same element type");
  });

  it("reuses the published contracts rather than declaring new ones", () => {
    const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8");
    for (const name of ["BrowserJobReadout", "BrowserJobFailureSummary", "BrowserRuntimeDiagnostics"]) {
      assert.ok(contracts.includes("export interface " + name + " {"), name + " is already published");
    }
    assert.equal((page.match(/BrowserJobReadout\} BrowserJobReadout/g) || []).length, 1,
      "each contract is named locally exactly once");
    assert.equal((page.match(/BrowserJobFailureSummary\} BrowserJobFailureSummary/g) || []).length, 1);
  });
});

describe("readout behaviour this child must not have moved", () => {
  it("keeps the loading, unavailable and populated states of both readouts", () => {
    for (const state of [
      'createRuntimeDiagnosticItem("Runtime", "Loading...")',
      'createRuntimeDiagnosticItem("Runtime", "Unavailable")',
      'createRuntimeDiagnosticItem("Jobs", "Loading...")',
      'createRuntimeDiagnosticItem("Jobs", "Unavailable")',
    ]) {
      assert.ok(page.includes(state), state + " must survive");
    }
  });

  it("keeps the append-versus-replace rule for the Load more page", () => {
    const body = slice("  function renderJobObservability(jobs, options = {}) {");
    assert.match(body, /jobObservabilityFailureItems = options\.append\s*\n\s*\? \[\.\.\.jobObservabilityFailureItems, \.\.\.incomingItems\]/,
      "appending still extends the list rather than replacing it");
    assert.match(body, /renderJobFailureItems\(jobObservabilityFailureItems\);/,
      "and the renderer is handed the accumulated list");
  });

  it("keeps the failures-shown count reading from the accumulated list", () => {
    assert.match(page, /createRuntimeDiagnosticItem\("Failures Shown", `\$\{jobObservabilityFailureItems\.length\} of \$\{formatRuntimeNumber\(pagination\.total\)\}`\)/,
      "the count still compares what is shown against the producer's total");
  });

  it("leaves the justified runtime-diagnostics assertion alone", () => {
    // The 2026-09-08 audit found this assertion's validation complete; unrelated cleanup is not
    // authorised, and removing it would be exactly that.
    assert.match(page, /return \/\*\* @type \{BrowserRuntimeDiagnostics\} \*\/ \(\/\*\* @type \{unknown\} \*\/ \(diagnostics\)\);/,
      "the checked double assertion stays");
  });

  it("stays inside this lane's files", () => {
    // `0.33.33.44.1` is a retained-lane child; it must not reach into a delegated controller.
    assert.match(host, /dataset: \{ runtimeDiagnosticsSummary: "" \},/,
      "the shared host is only read, not rewritten, by this suite");
  });
});
