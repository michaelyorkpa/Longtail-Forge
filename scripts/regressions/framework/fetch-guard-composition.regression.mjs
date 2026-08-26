export const regressionMeta = Object.freeze({
  id: "framework.fetch-guard-composition",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "csrf", "recovery", "session"],
  description: "Proves the three window.fetch guards compose in delivery order so protected mutations keep CSRF protection underneath session-expiry handling and above permission-denied recovery.",
  runMode: "static",
});

/* global Headers, Request, setImmediate */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { extractFunctionBlock } from "../../test-support/source-scan.mjs";
import { createFakeBrowserContext } from "../../test-support/fake-dom.mjs";

// `window.fetch` is written by three scripts, which `0.33.33.33.4` first recorded as an
// unresolved ownership conflict. `0.33.33.33.4.1` reclassified it: this is an ordered
// decorator chain over a host primitive, not application modules claiming one Longtail
// Forge surface.
//
// `0.33.33.33.8` corrected the writer list. The rollup had recorded two guards, because
// the publication scan of the day read only direct `window.fetch = ...` assignments and
// shared/browser-recovery.js writes through its own IIFE `global` parameter. It is the
// third writer, and it is the *first* to install: src/services/static.service.js injects
// it at the opening <head>, ahead of every declared page asset.
//
// A governance record that only names the three writers would prove nothing about the
// thing that actually matters, which is that the composition still behaves. This
// regression executes all three guards in the recorded order and proves the composed
// chain, then proves the same assertions fail when the chain is bypassed - so the test
// cannot pass by accident.
//
// What the recovery guard renders is not re-proved here: the permission dialog, its
// accessible structure, and its focus return belong to `framework.browser-recovery-boundary`.
// This regression owns the guard's place in the chain and the decision it makes there,
// so the dialog entry point is recorded rather than rendered.

const browserRecoverySource = await fs.readFile("public/js/shared/browser-recovery.js", "utf8");
const themeInitSource = await fs.readFile("public/js/theme-init.js", "utf8");
const navigationSource = await fs.readFile("public/js/navigation.js", "utf8");
const staticServiceSource = await fs.readFile("src/services/static.service.js", "utf8");

const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Build a context holding all three guards over one recording native fetch.
 *
 * Each guard family is assembled inside its own closure, because they are separate files
 * at runtime and two of them declare an `isAppApiRequest` of their own. Flattening them
 * into one scope would silently let one file's helper answer for another's.
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
    pathname: "/tasks.html",
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
    // 1. shared/browser-recovery.js, injected at <head> and therefore first to install.
    "const recoveryGuard = (function buildRecoveryGuard(global) {",
    "  let permissionDeniedCount = 0;",
    "  function showPermissionDenied() {",
    "    permissionDeniedCount += 1;",
    "    return Promise.resolve(null);",
    "  }",
    extractFunctionBlock(browserRecoverySource, "installFetchGuard"),
    extractFunctionBlock(browserRecoverySource, "isAppApiRequest"),
    extractFunctionBlock(browserRecoverySource, "requestMethod"),
    extractFunctionBlock(browserRecoverySource, "isMutationMethod"),
    "  return {",
    "    install: installFetchGuard,",
    "    permissionDeniedCount: () => permissionDeniedCount,",
    "  };",
    "}(window));",
    // 2. theme-init.js, the first declared page asset to touch fetch.
    "const csrfGuard = (function buildCsrfGuard() {",
    '  const CSRF_COOKIE_NAME = "lf_csrf";',
    `  const CSRF_HEADER_NAME = ${JSON.stringify(CSRF_HEADER_NAME)};`,
    extractFunctionBlock(themeInitSource, "readCookie"),
    extractFunctionBlock(themeInitSource, "resolveRequestUrl"),
    extractFunctionBlock(themeInitSource, "resolveRequestMethod"),
    extractFunctionBlock(themeInitSource, "isProtectedApiMutation"),
    extractFunctionBlock(themeInitSource, "installCsrfFetchGuard"),
    "  return { install: installCsrfFetchGuard };",
    "}());",
    // 3. navigation.js, declared after theme-init on every page that loads both.
    "const sessionGuard = (function buildSessionGuard() {",
    '  const SESSION_LOGIN_PATH = "/login.html";',
    "  let sessionAuthWarningPromise = null;",
    extractFunctionBlock(navigationSource, "isAppApiRequest"),
    extractFunctionBlock(navigationSource, "showSessionAuthWarning"),
    extractFunctionBlock(navigationSource, "installSessionAuthWarningGuard"),
    "  return { install: installSessionAuthWarningGuard };",
    "}());",
    "this.fetchGuards = { recoveryGuard, csrfGuard, sessionGuard };",
  ].join("\n");

  vm.runInNewContext(composedSource, context, { filename: "fetch-guard-composition.js" });
  return context;
}

/**
 * @typedef {{
 *   recoveryGuard: { install: () => void, permissionDeniedCount: () => number },
 *   csrfGuard: { install: () => void },
 *   sessionGuard: { install: () => void },
 * }} FetchGuards
 */
/** @typedef {{ __longtailRecoveryGuard?: boolean, __longtailCsrfGuard?: boolean, __longtailSessionAuthGuard?: boolean }} GuardBrands */

/** @param {unknown} value @returns {GuardBrands} */
function guardBrands(value) {
  return /** @type {GuardBrands} */ (value);
}

/**
 * Let the guard chain's awaits resolve without depending on a timer. Each guard adds a
 * turn, so this drains the microtask queue through the check phase rather than counting
 * a fixed number of turns - counting turns made the 401 proof depend on how many guards
 * happened to be installed underneath it.
 */
async function settleMicrotasks() {
  await new Promise((resolve) => { setImmediate(resolve); });
  await new Promise((resolve) => { setImmediate(resolve); });
}

// ---------------------------------------------------------------------------
// 1. Delivery order, proved from the delivery mechanisms themselves.
//
// The two declared guards can be witnessed by reading the pages that declare them. The
// injected one cannot: no page declares browser-recovery.js, so the injector is executed
// over a real page and the resulting document is read instead. An order proof with no
// witnesses would not be a proof, so both halves count what they proved.
// ---------------------------------------------------------------------------
const injectionSource = [
  extractFunctionBlock(staticServiceSource, "injectErrorBoundaryScripts"),
  "this.inject = injectErrorBoundaryScripts;",
].join("\n");
/** @type {{inject?: (contents: string) => string}} */
const injectionContext = {};
vm.runInNewContext(injectionSource, injectionContext, { filename: "inject-error-boundary-scripts.js" });
const injectErrorBoundaryScripts = injectionContext.inject;
assert.equal(typeof injectErrorBoundaryScripts, "function", "the head injector must be extractable from static.service.js");

const deliveredPage = injectErrorBoundaryScripts?.(await fs.readFile("views/protected/tasks.html", "utf8")) ?? "";
// The injected assets are absolute; the declared ones are page-relative. That difference
// is the whole reason a page scan cannot witness the injected guard.
const deliveredPositions = [
  ["/js/shared/browser-recovery.js", deliveredPage.indexOf("/js/shared/browser-recovery.js")],
  ["js/theme-init.js", deliveredPage.indexOf("js/theme-init.js")],
  ["js/navigation.js", deliveredPage.indexOf("js/navigation.js")],
];
for (const [asset, position] of deliveredPositions) {
  assert.notEqual(position, -1, `the delivered document must contain ${asset}`);
}
assert.ok(
  Number(deliveredPositions[0][1]) < Number(deliveredPositions[1][1]),
  "static.service.js must inject browser-recovery.js ahead of the declared page assets, which is"
    + " what makes it the first guard to install",
);
assert.ok(
  Number(deliveredPositions[1][1]) < Number(deliveredPositions[2][1]),
  "page delivery must place theme-init.js before navigation.js",
);
assert.match(
  deliveredPage,
  /<head\b[^>]*>\s*<script src="\/js\/shared\/error-contract\.js"><\/script>\s*<script src="\/js\/shared\/browser-recovery\.js"><\/script>/,
  "the recovery guard must be injected at the opening <head>, not merely somewhere earlier"
    + " than the declared assets of one page",
);

// The declared half is proved across every rendered view rather than the one page above.
/** @param {string} directory @param {string[]} out */
async function collectViews(directory, out) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collectViews(full, out);
    else if (full.endsWith(".html")) out.push(full);
  }
}
/** @type {string[]} */
const views = [];
await collectViews("views", views);
let viewsDeclaringBothGuards = 0;
/** @type {string[]} */
const misorderedViews = [];
for (const view of views) {
  const html = await fs.readFile(view, "utf8");
  const themePosition = html.indexOf("js/theme-init.js");
  const navigationPosition = html.indexOf("js/navigation.js");
  if (themePosition === -1 || navigationPosition === -1) continue;
  viewsDeclaringBothGuards += 1;
  if (themePosition > navigationPosition) misorderedViews.push(view);
}
assert.deepEqual(misorderedViews, [], `every view declaring both guards must declare theme-init first: ${misorderedViews.join(", ")}`);
assert.ok(
  viewsDeclaringBothGuards > 0,
  "no rendered view declares both declared guards, so the declared half of the order proof has"
    + " no witnesses and proves nothing",
);

// ---------------------------------------------------------------------------
// 2. browser-recovery installs first, over the native fetch.
// ---------------------------------------------------------------------------
const composed = createComposedFetchContext();
const guards = /** @type {FetchGuards} */ (composed.fetchGuards);
const nativeFetch = composed.window.fetch;

guards.recoveryGuard.install();
assert.notEqual(
  composed.window.fetch,
  nativeFetch,
  "shared/browser-recovery.js must replace window.fetch with its recovery guard",
);
assert.equal(
  guardBrands(composed.window.fetch).__longtailRecoveryGuard,
  true,
  "the recovery guard must mark itself so a second installation is a no-op",
);
const recoveryGuardedFetch = composed.window.fetch;
guards.recoveryGuard.install();
assert.equal(
  composed.window.fetch,
  recoveryGuardedFetch,
  "re-running the recovery guard must not add a second layer",
);

// ---------------------------------------------------------------------------
// 3. theme-init wraps the fetch already installed, rather than the native one.
// ---------------------------------------------------------------------------
guards.csrfGuard.install();
assert.notEqual(
  composed.window.fetch,
  recoveryGuardedFetch,
  "theme-init.js must wrap the fetch it received",
);
assert.equal(
  guardBrands(composed.window.fetch).__longtailCsrfGuard,
  true,
  "the CSRF guard must mark itself so a second installation is a no-op",
);
assert.notEqual(
  guardBrands(composed.window.fetch).__longtailRecoveryGuard,
  true,
  "the CSRF guard sits above the recovery guard rather than replacing it",
);

// ---------------------------------------------------------------------------
// 4. navigation wraps what theme-init installed.
// ---------------------------------------------------------------------------
const csrfGuardedFetch = composed.window.fetch;
guards.sessionGuard.install();
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
guards.sessionGuard.install();
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
guards.csrfGuard.install();
assert.notEqual(
  composed.window.fetch,
  composedFetch,
  "the CSRF guard only recognises its own marker, so installing it above the session guard"
    + " stacks rather than no-ops; this is the ordering hazard the load-order pin prevents",
);
// Restore the correctly ordered chain for the behavioural assertions below.
composed.window.fetch = composedFetch;

// ---------------------------------------------------------------------------
// 5. A same-origin protected API mutation still reaches the network with CSRF.
// ---------------------------------------------------------------------------
await composed.window.fetch("/api/tasks/one", { method: "PATCH" });
const mutation = /** @type {Array<{url: string, method: string, csrf: string}>} */ (composed.nativeCalls).at(-1);
assert.equal(mutation?.method, "PATCH", "the mutation must reach the native fetch");
assert.equal(
  mutation?.csrf,
  "seeded-csrf-token",
  "a protected API mutation must still carry its CSRF header through the composed chain;"
    + " if a later guard wrapped the native fetch instead of the installed one, this header is lost",
);

// A safe request is not a protected mutation and must not be given a token.
await composed.window.fetch("/api/tasks", { method: "GET" });
assert.equal(
  /** @type {Array<{csrf: string}>} */ (composed.nativeCalls).at(-1)?.csrf,
  "",
  "a GET must pass through all three guards untouched",
);
assert.equal(
  guards.recoveryGuard.permissionDeniedCount(),
  0,
  "a successful request must never raise permission-denied recovery",
);

// ---------------------------------------------------------------------------
// 6. A 403 on an API mutation still reaches permission-denied recovery, through the
//    two guards installed above it.
// ---------------------------------------------------------------------------
const denied = createComposedFetchContext({ responseStatus: 403 });
const deniedGuards = /** @type {FetchGuards} */ (denied.fetchGuards);
deniedGuards.recoveryGuard.install();
deniedGuards.csrfGuard.install();
deniedGuards.sessionGuard.install();

const deniedResponse = await denied.window.fetch("/api/tasks/one", { method: "PATCH" });
await settleMicrotasks();
assert.equal(
  deniedGuards.recoveryGuard.permissionDeniedCount(),
  1,
  "a 403 on a same-origin API mutation must still raise permission-denied recovery through"
    + " the CSRF and session guards installed above it",
);
assert.equal(
  /** @type {{status?: number}} */ (deniedResponse)?.status,
  403,
  "the recovery guard must return the response to its caller rather than swallowing it",
);
assert.equal(
  /** @type {Array<{csrf: string}>} */ (denied.nativeCalls).at(-1)?.csrf,
  "seeded-csrf-token",
  "the denied mutation must still have been CSRF protected on its way out",
);

// The recovery guard is deliberately narrow: only same-origin API mutations.
await denied.window.fetch("/api/tasks", { method: "GET" });
await settleMicrotasks();
assert.equal(
  deniedGuards.recoveryGuard.permissionDeniedCount(),
  1,
  "a 403 on a safe request must not raise permission-denied recovery",
);
await denied.window.fetch("https://elsewhere.test/api/tasks/one", { method: "PATCH" });
await settleMicrotasks();
assert.equal(
  deniedGuards.recoveryGuard.permissionDeniedCount(),
  1,
  "a 403 from another origin must not raise permission-denied recovery",
);

// ---------------------------------------------------------------------------
// 7. An application API 401 still produces the session-auth warning.
// ---------------------------------------------------------------------------
const expired = createComposedFetchContext({ responseStatus: 401 });
const expiredGuards = /** @type {FetchGuards} */ (expired.fetchGuards);
expiredGuards.recoveryGuard.install();
expiredGuards.csrfGuard.install();
expiredGuards.sessionGuard.install();
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
assert.equal(
  expiredGuards.recoveryGuard.permissionDeniedCount(),
  0,
  "a 401 is session expiry, not permission denial; the two guards must not both claim it",
);

// ---------------------------------------------------------------------------
// 8. The proof is sensitive to a bypass at either end, so passing above means something.
// ---------------------------------------------------------------------------
const bypassed = createComposedFetchContext();
const bypassedGuards = /** @type {FetchGuards} */ (bypassed.fetchGuards);
const savedNativeFetch = bypassed.window.fetch;
bypassedGuards.recoveryGuard.install();
bypassedGuards.csrfGuard.install();
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

// The innermost guard is the one with the most to lose from that defect: a later guard
// holding a native reference removes the recovery guard from the chain altogether, so a
// permission failure is never presented at all.
const detached = createComposedFetchContext({ responseStatus: 403 });
const detachedGuards = /** @type {FetchGuards} */ (detached.fetchGuards);
const detachedNativeFetch = detached.window.fetch;
detachedGuards.recoveryGuard.install();
/** @param {unknown[]} args */
const detachedFetch = async (...args) => detachedNativeFetch(...args);
detached.window.fetch = detachedFetch;
detachedGuards.sessionGuard.install();
await detached.window.fetch("/api/tasks/one", { method: "PATCH" });
await settleMicrotasks();
assert.equal(
  detachedGuards.recoveryGuard.permissionDeniedCount(),
  0,
  "with a native-capturing guard above it the recovery guard never sees the 403 at all;"
    + " this is why every guard must wrap the fetch that is current when it installs",
);

console.log(
  `Fetch guard composition passed: recovery installs first under injection, CSRF wraps it, session-expiry wraps that,`
  + ` protected mutations stay protected, 403 still reaches recovery, and a bypass at either end is detectable`
  + ` (${viewsDeclaringBothGuards} views witness the declared order).`,
);
