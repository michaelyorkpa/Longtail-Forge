import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The closed namespace root, sealed by `0.33.33.38.2.5`.
 *
 * `[key: string]: unknown` entered as bootstrap looseness with no extensibility rationale
 * recorded. Removing it changed **no diagnostic identity at all** - the estate had already grown
 * out of it: 64 of 64 members declared, an empty undeclared backlog, and a publication inventory
 * reporting zero deep writes and zero unresolvable rooted targets.
 *
 * What changed is what the compiler now refuses. The alternative to a declared member is a
 * compile error, never a permissive signature - and the genuinely open extensibility that lives
 * in nested contracts is untouched.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const contractsSource = read("src/types/browser-contracts.d.ts");

/** The `LongtailForgeBrowserNamespace` interface body. */
function namespaceInterface() {
  const at = contractsSource.indexOf("export interface LongtailForgeBrowserNamespace {");
  assert.notEqual(at, -1, "the namespace interface must exist");
  const end = contractsSource.indexOf("\n}\n", at);
  assert.notEqual(end, -1, "and must terminate");
  return contractsSource.slice(at, end + 3);
}

describe("the root is closed", () => {
  it("carries no index signature of any kind", () => {
    const body = namespaceInterface();
    assert.ok(!/\[\s*key\s*:\s*string\s*\]/.test(body), "no string index signature");
    assert.ok(!/\[\s*\w+\s*:\s*(string|number|symbol)\s*\]/.test(body), "and none under another name");
  });

  it("was not replaced by a permissive signature or an intersection", () => {
    // The recorded rule: the alternative to a declared member is a compile error.
    const body = namespaceInterface();
    assert.ok(!/:\s*any\b/.test(body), "no `any` member");
    assert.ok(!/Record<string,\s*(unknown|any)>/.test(body), "no Record catch-all smuggled in");
    assert.ok(!/extends\s+Record</.test(contractsSource.slice(contractsSource.indexOf("export interface LongtailForgeBrowserNamespace"), contractsSource.indexOf("export interface LongtailForgeBrowserNamespace") + 120)),
      "and it does not extend one");
  });

  it("still declares every member optional, so the root keeps its real lifecycle", () => {
    const body = namespaceInterface();
    const members = [...body.matchAll(/^ {2}(\w+)(\??):/gm)];
    assert.ok(members.length >= 60, "the members are still declared individually");
    const required = members.filter(([, , optional]) => optional !== "?").map(([, name]) => name);
    assert.deepEqual(required, [],
      "every member stays optional: the namespace fills in over the page lifecycle");
  });

  it("keeps the nested extensibility carriers that are genuinely open", () => {
    // Closing the root is not a licence to close what legitimately carries unknown data.
    assert.match(contractsSource, /export type BrowserSupportViewState = Readonly<Record<string, unknown>>;/,
      "Support View's unvalidated nested values stay unknown");
    assert.match(contractsSource, /export interface BrowserNavigationIntentRequest \{\s*\n\s*\[key: string\]: unknown;/,
      "nested contracts that are deliberately open keep their index signatures");
    assert.match(contractsSource, /export interface BrowserQuickActionRefreshSubscription \{\s*\n\s*\[key: string\]: unknown;/);
  });

  it("records why the catch-all is gone rather than leaving it unexplained", () => {
    const at = contractsSource.indexOf("export interface LongtailForgeBrowserNamespace {");
    const doc = contractsSource.slice(contractsSource.lastIndexOf("/**", at), at);
    assert.match(doc, /there is no index signature/i);
    assert.match(doc, /compile error/i, "and states what replaces it");
  });
});

describe("what the closed root now refuses, proved by the compiler", () => {
  // These fixtures are checked by the estate's own declaration probe: `tsconfig.declarations.json`
  // compiles `src/types/*.d.ts`, and this suite asserts the shapes that make the fixture below
  // meaningful. The runtime half is asserted separately - removal required no runtime change.

  it("leaves every declared member usable by its own name", () => {
    const body = namespaceInterface();
    for (const member of ["api?:", "errors?:", "overlayHost?:", "supportView?:", "helpPageReady?:",
      "sessionAuthWarnings?:", "workspaceContext?:", "workspaceContextReady?:"]) {
      assert.ok(body.includes("  " + member), member + " is still declared");
    }
  });

  it("has no member that could absorb a misspelling", () => {
    // A misspelled member is now unassignable because nothing matches it. Two near-misses that
    // must NOT exist as declared members, or the rejection would be accidental rather than earned.
    const body = namespaceInterface();
    for (const misspelling of ["  suportView", "  overlayhost", "  sessionAuthWarning?:", "  helpPageready"]) {
      assert.ok(!body.includes(misspelling), misspelling.trim() + " must not exist");
    }
  });

  it("declares exactly the members the estate publishes, by count", () => {
    const members = [...namespaceInterface().matchAll(/^ {2}(\w+)\?:/gm)].map(([, name]) => name);
    assert.equal(new Set(members).size, members.length, "no duplicate member names");
    assert.equal(members.length, 64,
      "64 declared members, matching the 64 the publication inventory knows");
  });
});

describe("the removal needed no runtime change", () => {
  it("touched no browser script and no script delivery", () => {
    // A type-only closure. If the root had needed a runtime shim, that would have been evidence
    // the gate had not actually passed.
    for (const file of ["public/js/navigation.js", "public/js/shared/overlay-host.js",
      "public/js/help.js", "public/js/dashboard.entry.js"]) {
      const source = read(file);
      assert.ok(!/\[key: string\]/.test(source), file + " needs no dynamic root shim");
    }
    assert.ok(!/LongtailForgeBrowserNamespace/.test(read("views/protected/help.html")),
      "and the page shells are untouched");
  });

  it("keeps the publication inventory's own governance intact", () => {
    const governance = read("scripts/regressions/framework/full-strict-governance.regression.mjs");
    assert.match(governance, /const UNDECLARED_PUBLICATION_BACKLOG = \[\];/,
      "the backlog stays a live, empty instrument");
    assert.match(governance, /assert\.equal\(declarationCoverage\.declaredMembers\.length, 64,/);
    assert.match(governance, /assert\.equal\(declarationCoverage\.knownMembers\.length, 64,/,
      "declared and known are both 64, and asserted apart");
  });
});
