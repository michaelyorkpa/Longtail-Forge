import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const contracts = read("src/types/browser-contracts.d.ts");
const navigation = read("public/js/navigation.js");
const footer = read("public/js/footer.js");
const workspaceSettings = read("public/js/workspace-settings.js");

/** Every browser file that references either member, so the audit cannot miss one. */
const CONSUMERS = [
  "audit-log", "calendar-settings", "calendar", "clients-projects", "files", "footer", "lists",
  "notes", "search", "stop-watch", "support-view-audit", "task-dialog", "tasks", "time-entries",
  "time-entry-dialog", "time-tracking-timer-dialog", "user-settings", "workspace-settings",
];
const sources = Object.fromEntries(CONSUMERS.map((name) => [name, read("public/js/" + name + ".js")]));

/** @param {string} source */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

/**
 * One function body sliced at the indentation it is written at.
 * @param {string} source @param {string} opener @param {number} indent
 */
function slice(source, opener, indent) {
  const pad = " ".repeat(indent);
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

const namespaceBody = (() => {
  const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
  assert.notEqual(at, -1, "the namespace must be declared");
  return contracts.slice(at, contracts.indexOf("\n}\n", at));
})();

const bootstrap = slice(navigation, "async function loadAppShellBootstrap() {", 2);

describe("the pair is one function published twice", () => {
  it("publishes the same expression uncalled and called", () => {
    assert.match(navigation, /^ {2}window\.LongtailForge\.refreshAppShell = loadAppShellBootstrap;$/m);
    assert.match(navigation, /^ {2}window\.LongtailForge\.workspaceContextReady = loadAppShellBootstrap\(\);$/m);
  });

  it("publishes each exactly once, and nothing else publishes them", () => {
    assert.equal(countOf(navigation, /window\.LongtailForge\.refreshAppShell\s*=/g), 1);
    assert.equal(countOf(navigation, /window\.LongtailForge\.workspaceContextReady\s*=/g), 1);
    for (const [name, source] of Object.entries(sources)) {
      if (name === "workspace-settings") {
        continue;
      }
      assert.ok(!/\.(refreshAppShell|workspaceContextReady)\s*=[^=]/.test(source), name + " must not publish either");
    }
  });

  it("declares both against one result type, because they are one function", () => {
    assert.match(namespaceBody, /^ {2}refreshAppShell\?: \(\) => Promise<BrowserAppShellRefreshResult>;$/m);
    assert.match(namespaceBody, /^ {2}workspaceContextReady\?: Promise<BrowserAppShellRefreshResult>;$/m);
  });

  it("does not cast either publication", () => {
    const code = codeOnly(navigation);
    assert.ok(!/@type \{[^}]*\} \*\/ \(loadAppShellBootstrap/.test(navigation));
    assert.ok(!/refreshAppShell = \/\*\*/.test(code));
    assert.ok(!/workspaceContextReady = \/\*\*/.test(code));
  });
});

describe("the result type carries all three completion forms", () => {
  it("declares the union the implementation can actually produce", () => {
    assert.match(
      contracts,
      /^export type BrowserAppShellRefreshResult = Record<string, unknown> \| null \| undefined;$/m,
    );
  });

  it("keeps all three arms, so neither absence is collapsed into the other", () => {
    const alias = contracts.match(/^export type BrowserAppShellRefreshResult = (.*);$/m);
    assert.ok(alias, "the alias must exist");
    for (const arm of ["Record<string, unknown>", "null", "undefined"]) {
      assert.ok(alias[1].includes(arm), arm + " must remain an arm");
    }
    assert.equal(alias[1].split("|").length, 3, "three arms, not two and not four");
  });

  it("finds each arm at a reachable exit of the implementation", () => {
    const body = codeOnly(bootstrap);
    assert.match(body, /window\.location\.replace\("\/login\.html"\);\s*\n\s*return;/,
      "the 401 path redirects and returns undefined");
    assert.match(body, /return workspaceContext;/, "the success path returns the context it built");
    assert.match(body, /\} catch \{[\s\S]*return null;\s*\n\s*\}/, "the catch path returns null");
  });

  it("types the implementation rather than only the publication", () => {
    const at = navigation.indexOf("  async function loadAppShellBootstrap()");
    const doc = navigation.slice(at - 620, at);
    assert.match(doc, /@returns \{Promise<[^}]*BrowserAppShellRefreshResult>\}/);
  });

  it("names the result for the refresh, and keeps it distinct from the stored record", () => {
    // Retargeted by `0.33.33.38.4.15`, which defined the stored record this child deliberately
    // did not. The guard that it did not yet exist is spent; what outlives it is that the two are
    // **different types** - the refresh result is an unknown-valued record, and the stored one is
    // an exact thirteen-member contract.
    assert.match(contracts, /^export type BrowserAppShellRefreshResult = Record<string, unknown> \| null \| undefined;$/m);
    assert.match(contracts, /^export interface BrowserStoredWorkspaceContext \{$/m);
    const alias = contracts.match(/^export type BrowserAppShellRefreshResult = (.*);$/m);
    assert.ok(alias, "the alias must exist");
    assert.ok(
      !/BrowserStoredWorkspaceContext/.test(alias[1]),
      "the refresh result must not be typed as the stored record",
    );
  });
});

describe("both members stay optional, because navigation is not on every page", () => {
  it("declares each with a question mark", () => {
    assert.ok(!/^ {2}refreshAppShell: /m.test(namespaceBody));
    assert.ok(!/^ {2}workspaceContextReady: /m.test(namespaceBody));
  });

  it("leaves the root itself optional", () => {
    assert.match(contracts, /^ {4}LongtailForge\?: LongtailForgeBrowserNamespace;$/m);
  });

  it("keeps the refresh call optional at both of its call sites", () => {
    assert.equal(countOf(workspaceSettings, /window\.LongtailForge\.refreshAppShell\?\.\(\)/g), 2);
    assert.ok(
      !/window\.LongtailForge\.refreshAppShell\(\)/.test(workspaceSettings),
      "a required call would change behaviour on a page that tolerates absence",
    );
  });
});

describe("every consumer reference form is accounted for and unchanged", () => {
  it("leaves every direct await exactly as it was", () => {
    // `await undefined` is legal, so an absent member still resolves and the barrier still
    // releases. Nothing here needed a required accessor.
    const awaits = CONSUMERS.flatMap((name) => [...codeOnly(sources[name])
      .matchAll(/await (?:window\.LongtailForge|namespace)\??\.workspaceContextReady/g)]);
    assert.ok(awaits.length >= 20, "the audit must still see the awaits it was written for");
    for (const [name, source] of Object.entries(sources)) {
      assert.ok(
        !/requireWorkspaceContextReady|requireRefreshAppShell/.test(source),
        name + " must not gain a required accessor for an optional barrier",
      );
    }
  });

  it("keeps the one Promise.resolve consumer, which tolerates absence by construction", () => {
    assert.match(
      sources["calendar"],
      /await Promise\.resolve\(window\.LongtailForge\?\.workspaceContextReady\)\.catch\(\(\) => null\)/,
    );
  });

  it("keeps the footer's guard-then-chain, so its finalisation is unchanged", () => {
    const mount = codeOnly(slice(footer, "function mountQuickActionCapture() {", 2));
    // The guard returns before mounting anything when readiness is absent, so `.finally()` was
    // never meant to run in that case. The chain is left exactly as written.
    assert.match(mount, /if \(!window\.LongtailForge\?\.workspaceContextReady \|\| !document\.querySelector\(/);
    assert.match(mount, /window\.LongtailForge\.workspaceContextReady\s*\n\s*\.catch\(\(\) => null\)\s*\n\s*\.finally\(/);
    assert.ok(!/workspaceContextReady\?\.\s*\n?\s*\.?catch/.test(mount), "no optional chain that would skip finally");
  });

  it("reads the members through no alias, destructure or callback anywhere", () => {
    for (const [name, source] of Object.entries(sources)) {
      const code = codeOnly(source);
      assert.ok(!/\{[^}]*\bworkspaceContextReady\b[^}]*\} =/.test(code), name + " must not destructure it");
      assert.ok(!/\{[^}]*\brefreshAppShell\b[^}]*\} =/.test(code), name + " must not destructure it");
      assert.ok(
        !/const \w+ = window\.LongtailForge\??\.(workspaceContextReady|refreshAppShell)\s*;/.test(code),
        name + " must not alias it",
      );
    }
  });
});

describe("no context-shape work lands in this child", () => {
  it("declares no workspace-context member", () => {
    assert.ok(!/^ {2}workspaceContext\?:/m.test(namespaceBody), "that member belongs to 0.33.33.38.2.2.5.2");
  });

  it("did not type the storage path, which 0.33.33.38.4.15 later did", () => {
    // Retargeted by that child. The guard was that this one added no context-shape work; the fact
    // that outlives it is that the storage path answers the **stored** record while the refresh
    // this child declared still answers the transient one.
    for (const fn of ["function storeWorkspaceContext(", "function readWorkspaceContext("]) {
      const at = navigation.indexOf("  " + fn);
      assert.notEqual(at, -1, fn + " must still exist");
      // Only the block immediately above counts: a fixed window reaches the previous function's
      // doc and would pass for a declaration carrying none of its own.
      const before = navigation.slice(0, at).trimEnd();
      assert.ok(before.endsWith("*/"), fn + " must carry its own JSDoc block");
      const doc = before.slice(before.lastIndexOf("/**"));
      assert.match(doc, /BrowserStoredWorkspaceContext/, fn + " answers the stored record");
    }
    const at = navigation.indexOf("  async function loadAppShellBootstrap()");
    assert.match(navigation.slice(at - 620, at), /BrowserAppShellRefreshResult/,
      "and the refresh still answers the transient result");
  });

  it("gives no wire value a trusted context type without normalising it", () => {
    // Retargeted by `0.33.33.38.4.15`: the stored record now appears in this file, reached only
    // through the constructor. What the guard defended is unchanged - no response body is cast
    // into a context, and the app-shell body still goes through the adapter.
    const code = codeOnly(navigation);
    assert.match(code, /const shell = bootstrapAdapter\.normalize\(await response\.json\(\)\);/,
      "the app-shell path is unchanged");
    assert.ok(!/@type \{[^}]*\} \*\/ \(await response\.json\(\)\)/.test(navigation), "no cast over a body");
    assert.ok(!/@type \{[^}]*BrowserStoredWorkspaceContext[^}]*\} \*\/ \(/.test(navigation),
      "and no cast into the stored record");
  });

  it("keeps the transient object arm as an unknown-valued record", () => {
    const alias = contracts.match(/^export type BrowserAppShellRefreshResult = (.*);$/m);
    assert.ok(alias, "the alias must exist");
    assert.match(alias[1], /Record<string, unknown>/);
    assert.ok(!/AppShellBootstrap\b/.test(alias[1]), "not the adapter's envelope either");
  });
});
