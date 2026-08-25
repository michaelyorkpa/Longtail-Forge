export const regressionMeta = Object.freeze({
  id: "framework.fetch-guard-composition",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "csrf", "session"],
  description: "Proves the two window.fetch guards compose in order so protected mutations keep CSRF protection underneath the session-expiry handling.",
  runMode: "static",
});

// `window.fetch` is written by two scripts, which `0.33.33.33.4` first recorded as an
// unresolved ownership conflict. `0.33.33.33.4.1` reclassified it: this is an ordered
// decorator chain over a host primitive, not two application modules claiming one
// Longtail Forge surface.
//
// A governance record that only names the two writers would prove nothing about the
// thing that actually matters, which is that the composition still behaves. This
// regression executes both guards in the recorded order and proves the composed chain,
// then proves the same assertions fail when the chain is bypassed - so the test cannot
// pass by accident.

/* global Headers, Request */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { extractFunctionBlock } from "../../test-support/source-scan.mjs";
import { createFakeBrowserContext } from "../../test-support/fake-dom.mjs";

const themeInitSource = await fs.readFile("public/js/theme-init.js", "utf8");
const navigationSource = await fs.readFile("public/js/navigation.js", "utf8");

const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Build a context holding both guards over one recording native fetch.
 * @param {{ responseStatus?: number }} options
 */
function createComposedFetchContext({ responseStatus = 200 } = {}) {
  const context = createFakeBrowserContext({
    iconButton: false,
    globals: { URL, Headers, Request },
    window: { URL, Headers, Request },
  });
  context.responseStatus = responseStatus;
  /** @type {Array<{url: string, method: string, csrf: string}>} */
  const nativeCalls = [];
  context.nativeCalls = nativeCalls;
  context.replacedLocations = [];
  context.window.location = {
    href: "http://longtail.test/tasks.html",
    origin: "http://longtail.test",
    /** @param {string} path */
    replace(path) {
      /** @type {string[]} */ (context.replacedLocations).push(path);
    },
  };
  Object.assign(context.document, { cookie: "lf_csrf=seeded-csrf-token" });

  // The one real network boundary. Everything above it is the composed chain.
  /**
   * @param {string | {url?: string}} input
   * @param {{method?: string, headers?: Headers | Record<string, string>}} [init]
   */
  context.window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url;
    const headers = new Headers(init.headers || undefined);
    nativeCalls.push({
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      csrf: headers.get(CSRF_HEADER_NAME) || "",
    });
    return { status: context.responseStatus, json: async () => ({ csrfToken: "issued-csrf-token" }) };
  };

  const composedSource = [
    'const CSRF_COOKIE_NAME = "lf_csrf";',
    `const CSRF_HEADER_NAME = ${JSON.stringify(CSRF_HEADER_NAME)};`,
    extractFunctionBlock(themeInitSource, "readCookie"),
    extractFunctionBlock(themeInitSource, "resolveRequestUrl"),
    extractFunctionBlock(themeInitSource, "resolveRequestMethod"),
    extractFunctionBlock(themeInitSource, "isProtectedApiMutation"),
    extractFunctionBlock(themeInitSource, "installCsrfFetchGuard"),
    'const SESSION_LOGIN_PATH = "/login.html";',
    "let sessionAuthWarningPromise = null;",
    extractFunctionBlock(navigationSource, "isAppApiRequest"),
    extractFunctionBlock(navigationSource, "showSessionAuthWarning"),
    extractFunctionBlock(navigationSource, "installSessionAuthWarningGuard"),
    "this.fetchGuards = { installCsrfFetchGuard, installSessionAuthWarningGuard };",
  ].join("\n");

  vm.runInNewContext(composedSource, context, { filename: "fetch-guard-composition.js" });
  return context;
}

/** @typedef {{ installCsrfFetchGuard: () => void, installSessionAuthWarningGuard: () => void }} FetchGuards */
/** @typedef {{ __longtailCsrfGuard?: boolean, __longtailSessionAuthGuard?: boolean }} GuardBrands */

/** @param {unknown} value @returns {GuardBrands} */
function guardBrands(value) {
  return /** @type {GuardBrands} */ (value);
}

/** Let the guard chain's awaits resolve without depending on a timer. */
async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// 1. theme-init installs the CSRF guard first, over the native fetch.
// ---------------------------------------------------------------------------
const composed = createComposedFetchContext();
const guards = /** @type {FetchGuards} */ (composed.fetchGuards);
const nativeFetch = composed.window.fetch;

guards.installCsrfFetchGuard();
assert.notEqual(
  composed.window.fetch,
  nativeFetch,
  "theme-init.js must replace window.fetch with its CSRF guard",
);
assert.equal(
  guardBrands(composed.window.fetch).__longtailCsrfGuard,
  true,
  "the CSRF guard must mark itself so a second installation is a no-op",
);

// ---------------------------------------------------------------------------
// 2. navigation wraps the fetch already installed, rather than the native one.
// ---------------------------------------------------------------------------
const csrfGuardedFetch = composed.window.fetch;
guards.installSessionAuthWarningGuard();
assert.notEqual(
  composed.window.fetch,
  csrfGuardedFetch,
  "navigation.js must wrap the fetch it received",
);
assert.equal(
  guardBrands(composed.window.fetch).__longtailSessionAuthGuard,
  true,
  "the session guard must mark itself so a second installation is a no-op",
);
assert.notEqual(
  guardBrands(composed.window.fetch).__longtailCsrfGuard,
  true,
  "the outermost fetch is the session guard; the CSRF guard sits underneath it",
);

// Each guard is idempotent against itself: it checks for its own marker on the current
// fetch, so a repeated bootstrap of the same guard cannot stack a second layer.
const composedFetch = composed.window.fetch;
guards.installSessionAuthWarningGuard();
assert.equal(
  composed.window.fetch,
  composedFetch,
  "re-running the session guard must not add a second layer",
);

// The guards are self-idempotent but not order independent, and that is precisely why
// the load order is pinned in governance rather than left to convention. Each guard
// tests only for its own marker, so re-running the CSRF guard on top of the session
// guard would stack a second CSRF layer above it rather than no-op. Nothing does that
// today - theme-init runs once, before navigation - and the ordering assertion in
// full-strict-governance is what keeps it that way.
guards.installCsrfFetchGuard();
assert.notEqual(
  composed.window.fetch,
  composedFetch,
  "the CSRF guard only recognises its own marker, so installing it above the session guard"
    + " stacks rather than no-ops; this is the ordering hazard the load-order pin prevents",
);
// Restore the correctly ordered chain for the behavioural assertions below.
composed.window.fetch = composedFetch;

// ---------------------------------------------------------------------------
// 3. A same-origin protected API mutation still reaches the network with CSRF.
// ---------------------------------------------------------------------------
await composed.window.fetch("/api/tasks/one", { method: "PATCH" });
const mutation = /** @type {Array<{url: string, method: string, csrf: string}>} */ (composed.nativeCalls).at(-1);
assert.equal(mutation?.method, "PATCH", "the mutation must reach the native fetch");
assert.equal(
  mutation?.csrf,
  "seeded-csrf-token",
  "a protected API mutation must still carry its CSRF header through the composed chain;"
    + " if navigation wrapped the native fetch instead of the installed one, this header is lost",
);

// A safe request is not a protected mutation and must not be given a token.
await composed.window.fetch("/api/tasks", { method: "GET" });
assert.equal(
  /** @type {Array<{csrf: string}>} */ (composed.nativeCalls).at(-1)?.csrf,
  "",
  "a GET must pass through both guards untouched",
);

// ---------------------------------------------------------------------------
// 4. An application API 401 still produces the session-auth warning.
// ---------------------------------------------------------------------------
const expired = createComposedFetchContext({ responseStatus: 401 });
const expiredGuards = /** @type {FetchGuards} */ (expired.fetchGuards);
expiredGuards.installCsrfFetchGuard();
expiredGuards.installSessionAuthWarningGuard();
// The warning resolves only when the operator chooses to sign in again, so the request
// promise is deliberately left pending rather than awaited.
const expiredRequest = expired.window.fetch("/api/tasks/one", { method: "PATCH" });
// The vm context has its own realm, so the check is structural rather than instanceof.
assert.equal(typeof expiredRequest?.then, "function", "the composed fetch must return a thenable");
expiredRequest.catch(() => {});
await settleMicrotasks();

const warning = expired.document.querySelector(".framework-session-warning");
assert.ok(
  warning,
  "a 401 on an application API request must still raise the session warning through the chain",
);
assert.equal(
  /** @type {Array<{csrf: string}>} */ (expired.nativeCalls).at(-1)?.csrf,
  "seeded-csrf-token",
  "the expired request must still have been CSRF protected on its way out",
);

// ---------------------------------------------------------------------------
// 5. The proof is sensitive to a bypass, so passing above means something.
// ---------------------------------------------------------------------------
const bypassed = createComposedFetchContext();
const bypassedGuards = /** @type {FetchGuards} */ (bypassed.fetchGuards);
const savedNativeFetch = bypassed.window.fetch;
bypassedGuards.installCsrfFetchGuard();
// Simulate the defect the ordering contract exists to prevent: a later guard that keeps
// its own reference to the native fetch instead of wrapping the one already installed.
/** @param {unknown[]} args */
const bypassingFetch = async (...args) => savedNativeFetch(...args);
bypassed.window.fetch = bypassingFetch;
await bypassed.window.fetch("/api/tasks/one", { method: "PATCH" });
assert.equal(
  /** @type {Array<{csrf: string}>} */ (bypassed.nativeCalls).at(-1)?.csrf,
  "",
  "a guard that captures the native fetch bypasses CSRF protection entirely; this assertion"
    + " documents the failure mode the composed-chain assertions above are proving against",
);

console.log("Fetch guard composition passed: CSRF installs first, session-expiry wraps it, protected mutations stay protected, and a bypass is detectable.");
