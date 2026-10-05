import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The last four namespace publications, declared by `0.33.33.38.2.3.3`.
 *
 * All four are **kept for compatibility**, and each declaration says only what its writer
 * actually does. That distinction is the whole point: a declaration with no diagnostic weight is
 * not automatically truthful, so each writer is annotated too - an implicit-`any` writer would
 * have satisfied any state type at all.
 *
 * - `supportView` is a **record boundary**, not a validated Support View DTO.
 * - `sessionAuthWarnings.show` raises a warning; it grants nothing and restores nothing.
 * - `helpPageReady` is the boolean sentinel it has always been.
 * - `overlayHost` adopts the contract `0.33.33.39.3` published and checked.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const navigationSource = read("public/js/navigation.js");
const helpSource = read("public/js/help.js");
const contractsSource = read("src/types/browser-contracts.d.ts");
const bootstrapSource = read("public/js/shared/app-shell-bootstrap.js");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

describe("supportView promises the boundary that exists and no more", () => {
  it("is declared as a frozen record of unknown values", () => {
    assert.match(contractsSource,
      /export type BrowserSupportViewState = Readonly<Record<string, unknown>>;/,
      "the members are not promised, because nothing validates them");
    assert.match(contractsSource, /supportView\?: BrowserSupportViewState \| null;/,
      "optional before publication, null when inactive");
  });

  it("declares none of the fields consumers read out of unknown", () => {
    const declaration = contractsSource.slice(contractsSource.indexOf("export type BrowserSupportViewState"));
    const block = declaration.slice(0, declaration.indexOf(";") + 1);
    for (const field of ["effectiveUserLabel", "actorUsername", "expiresAt", "readOnly"]) {
      assert.ok(!block.includes(field), `${field} is read out of unknown, not validated`);
    }
  });

  it("annotates the writer at the boundary the adapter actually proves", () => {
    // Without this the writer's parameter would be implicitly `any`, and any declared state type
    // would have looked compatible with it.
    const writer = slice(navigationSource, "function applySupportViewState(supportView) {");
    assert.match(navigationSource, /@param \{Record<string, unknown> \| null\} supportView/,
      "the parameter states the adapter's boundary");
    assert.match(writer, /supportNamespace\.supportView = supportView \? Object\.freeze\(\{ \.\.\.supportView \}\) : null;/,
      "a shallow frozen copy, or null");
    assert.match(bootstrapSource, /supportView: asRecord\(source\.supportView\),/,
      "and the adapter still proves only the object boundary");
  });

  it("has exactly one caller, passing that boundary", () => {
    const calls = navigationSource.match(/applySupportViewState\(/g) || [];
    assert.equal(calls.length, 2, "one call site plus the declaration");
    assert.match(navigationSource, /applySupportViewState\(shell\.supportView \|\| null\);/);
  });

  it("freezes shallowly, so nested values are still unknown and still mutable", () => {
    // The declaration says `Readonly<Record<string, unknown>>`; that is the top level only.
    const nested = { actor: { username: "support" } };
    const published = Object.freeze({ ...nested, readOnly: true });
    assert.equal(Object.isFrozen(published), true);
    assert.equal(Object.isFrozen(published.actor), false,
      "nested validation is separate 0.33.33.38.4 work, not a consequence of this declaration");
  });

  it("preserves additional keys rather than reducing to a known shape", () => {
    const source = { anythingElse: 7, expiresAt: "2026-01-01T00:00:00.000Z", readOnly: true };
    const published = Object.freeze({ ...source });
    assert.deepEqual(Object.keys(published).sort(), ["anythingElse", "expiresAt", "readOnly"]);
  });
});

describe("sessionAuthWarnings retains the callable hook it already published", () => {
  it("declares the one method the writer publishes", () => {
    assert.match(contractsSource, /export interface BrowserSessionAuthWarnings \{\s*\n\s*show\(\): Promise<void>;\s*\n\}/,
      "one method, resolving with no value");
    assert.match(contractsSource, /sessionAuthWarnings\?: BrowserSessionAuthWarnings;/);
  });

  it("checks the publication against that contract on the literal", () => {
    assert.match(navigationSource,
      /@type \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserSessionAuthWarnings\}\s*\n\s*\*\/\s*\n\s*const sessionAuthWarningsApi = \{\s*\n\s*show: showSessionAuthWarning,\s*\n\s*\};/);
    assert.match(navigationSource, /window\.LongtailForge\.sessionAuthWarnings = sessionAuthWarningsApi;/);
  });

  it("is not async, because the shared promise identity depends on that", () => {
    // An async wrapper answers a fresh promise per call. The whole point of the slot is that a
    // second call while the dialog is open returns the *same* pending promise.
    assert.ok(!/async function showSessionAuthWarning/.test(navigationSource),
      "making it async to obtain an easy return annotation would change promise identity");
    assert.match(navigationSource, /@returns \{Promise<void>\}/);
    assert.match(navigationSource, /@type \{Promise<void> \| null\}/, "the pending slot is typed too");
  });

  it("shares the pending promise and resets after the dialog finishes", () => {
    const body = slice(navigationSource, "function showSessionAuthWarning() {");
    assert.match(body, /if \(sessionAuthWarningPromise\) \{\s*\n\s*return sessionAuthWarningPromise;/,
      "a second call answers the first promise rather than opening a second dialog");
    assert.match(body, /sessionAuthWarningPromise = null;\s*\n\s*resolve\(\);/,
      "and the slot is cleared before the promise settles");
  });

  it("keeps cancellation prevention, the sign-in redirect and the fallback close", () => {
    const body = slice(navigationSource, "function showSessionAuthWarning() {");
    assert.match(body, /dialog\.addEventListener\("cancel", \(event\) => \{\s*\n\s*event\.preventDefault\(\);/);
    assert.match(body, /window\.location\.replace\(SESSION_LOGIN_PATH\);/);
    assert.match(body, /if \(typeof dialog\.close === "function"\) \{[\s\S]*?\} else \{[\s\S]*?finish\(\);/,
      "the non-dialog fallback still finishes");
    assert.match(body, /if \(typeof dialog\.showModal === "function"\) \{[\s\S]*?\} else \{[\s\S]*?setAttribute\("open", ""\);/);
    assert.match(body, /loginButton\.focus\(\);/);
    assert.match(body, /setAttribute\("role", "alertdialog"\)/);
    assert.match(body, /setAttribute\("aria-modal", "true"\)/);
  });

  it("describes a warning rather than a grant", () => {
    const declaration = contractsSource.slice(contractsSource.indexOf("The session-warning compatibility hook"));
    const block = declaration.slice(0, declaration.indexOf("export interface BrowserSessionAuthWarnings"));
    assert.ok(/not\*\* an authentication grant/.test(block),
      "the contract says what the hook does not do, because the name invites the opposite reading");
  });
});

describe("helpPageReady stays the sentinel it is", () => {
  it("is declared as an optional boolean, with no interface built around it", () => {
    assert.match(contractsSource, /helpPageReady\?: boolean;/);
    assert.ok(!/interface BrowserHelpPageReady/.test(contractsSource),
      "a boolean does not need an interface");
    assert.ok(!/helpPageReady\?: Promise/.test(contractsSource),
      "it is a sentinel, not a readiness promise");
  });

  it("is still assigned true at the end of the Help script, and nowhere else", () => {
    const assignments = helpSource.match(/helpPageReady = /g) || [];
    assert.equal(assignments.length, 1, "one assignment");
    assert.match(helpSource, /window\.LongtailForge\.helpPageReady = true;/);

    const at = helpSource.indexOf("window.LongtailForge.helpPageReady = true;");
    const tail = helpSource.slice(at).trim().split("\n").filter((line) => line.trim() && line.trim() !== "}());");
    assert.equal(tail.length, 1, "nothing runs after it");
    assert.ok(!/await[\s\S]{0,80}helpPageReady/.test(helpSource),
      "no await was introduced ahead of the sentinel");
  });

  it("is published nowhere else in the estate", () => {
    for (const file of ["public/js/navigation.js", "public/js/dashboard.entry.js"]) {
      assert.ok(!read(file).includes("helpPageReady"), `${file} must not publish the Help sentinel`);
    }
  });
});

describe("overlayHost adopts the contract its writer already checks", () => {
  it("declares the member against the published interface, unweakened", () => {
    assert.match(contractsSource, /overlayHost\?: BrowserOverlayHost;/);
    assert.match(contractsSource, /export interface BrowserOverlayHost \{\s*\n\s*create\(options\?: BrowserOverlayHostOptions\): BrowserOverlayController;\s*\n\}/,
      "the root API is still exactly `{ create }`");
  });

  it("leaves the controller and handle as separate nested contracts", () => {
    for (const name of ["BrowserOverlayController", "BrowserOverlayHandle", "BrowserOverlayRegistration"]) {
      assert.ok(contractsSource.includes(`export interface ${name} {`), `${name} stays its own contract`);
    }
  });

  it("did not restate or alter the writer", () => {
    const writer = read("public/js/shared/overlay-host.js");
    assert.ok(!/Object\.freeze\(overlayHostApi\)/.test(writer),
      "the hook is still not frozen; adopting a contract must not change the object");
    assert.match(writer, /root\.overlayHost = overlayHostApi;/, "publication unchanged");
  });
});

describe("declaration coverage", () => {
  it("declares every member the namespace interface now carries", () => {
    for (const member of ["helpPageReady?: boolean;", "overlayHost?: BrowserOverlayHost;",
      "sessionAuthWarnings?: BrowserSessionAuthWarnings;", "supportView?: BrowserSupportViewState | null;"]) {
      assert.ok(contractsSource.includes("  " + member), member + " must be declared");
    }
  });

  it("keeps the root index signature, which is a separate closeout", () => {
    // `0.33.33.38.2.5` removes it. Declaration coverage and permissiveness are different questions.
    assert.match(contractsSource, /\[key: string\]: unknown;/,
      "still present at this checkpoint");
  });
});
