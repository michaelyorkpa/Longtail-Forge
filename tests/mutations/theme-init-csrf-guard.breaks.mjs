import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Weighted toward the guard, not toward the annotations.** This checkpoint cleared sixteen
// diagnostics and thirteen were parameter annotations the compiler proves. What this table
// attacks is the thing the file actually does: decide whether a CSRF header reaches a request.
// The two reads that changed - the double-wrap marker and the `init` default - are attacked
// first, and the security rule around them is attacked because it must not have moved.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the marker read this checkpoint changed --------------------------------------------------
  ["an already-guarded fetch is wrapped a second time",
    'if (typeof window.fetch !== "function" || Object.hasOwn(window.fetch, guardMarker)) {',
    'if (typeof window.fetch !== "function" || false) {'],
  ["no fetch is ever wrapped",
    'if (typeof window.fetch !== "function" || Object.hasOwn(window.fetch, guardMarker)) {',
    "if (true) {"],
  ["a missing fetch stops being checked for",
    'if (typeof window.fetch !== "function" || Object.hasOwn(window.fetch, guardMarker)) {',
    "if (Object.hasOwn(window.fetch, guardMarker)) {"],
  ["the guard stops stamping its own marker",
    "    guardedFetch[guardMarker] = true;",
    "    void guardedFetch;"],
  ["the marker is renamed, so the composition contract no longer recognises it",
    '    const guardMarker = "__longtailCsrfGuard";',
    '    const guardMarker = "__longtailGuard";'],

  // --- which requests are protected ----------------------------------------------------------------
  ["safe methods start carrying the header",
    '    return !["GET", "HEAD", "OPTIONS"].includes(method)',
    "    return true"],
  ["only safe methods carry the header",
    '    return !["GET", "HEAD", "OPTIONS"].includes(method)',
    '    return ["GET", "HEAD", "OPTIONS"].includes(method)'],
  ["every path is treated as an API path",
    '      && url.pathname.startsWith("/api/")',
    "      && true"],
  ["the versioned public API loses its exclusion",
    '      && !url.pathname.startsWith("/api/v1/");',
    "      && true;"],
  ["cross-origin requests start carrying the header",
    "      if (!url || url.origin !== window.location.origin || !isProtectedApiMutation(url, method)) {",
    "      if (!url || !isProtectedApiMutation(url, method)) {"],
  ["an unresolvable input is treated as protected",
    "      if (!url || url.origin !== window.location.origin || !isProtectedApiMutation(url, method)) {",
    "      if (url && (url.origin !== window.location.origin || !isProtectedApiMutation(url, method))) {"],
  ["the method stops being upper-cased",
    '    return String(init.method || inputMethod || "GET").toUpperCase();',
    '    return String(init.method || inputMethod || "GET");'],
  ["the caller's method is ignored in favour of the request's",
    '    return String(init.method || inputMethod || "GET").toUpperCase();',
    '    return String(inputMethod || "GET").toUpperCase();'],
  ["a Request's own method stops being read",
    '    const inputMethod = typeof window.Request === "function" && input instanceof window.Request ? input.method : "GET";',
    '    const inputMethod = "GET";'],

  // --- what the request carries ---------------------------------------------------------------------
  ["the header is never set",
    "      headers.set(CSRF_HEADER_NAME, csrfToken);",
    "      void csrfToken;"],
  ["a caller can spoof the header by setting it themselves",
    "      headers.set(CSRF_HEADER_NAME, csrfToken);\n      return originalFetch(input, { ...init, headers });",
    "      return originalFetch(input, { ...init, headers });"],
  ["a Request's own headers are dropped",
    "      const headers = new window.Headers(isRequest ? input.headers : undefined);",
    "      const headers = new window.Headers(undefined);"],
  ["the caller's init headers are dropped",
    "      new window.Headers(init.headers || undefined).forEach((value, name) => headers.set(name, value));",
    "      void init;"],
  ["the rest of init is discarded along with its headers",
    "      return originalFetch(input, { ...init, headers });",
    "      return originalFetch(input, { headers });"],

  // --- how the token is obtained ----------------------------------------------------------------------
  ["a token is minted even when the cookie already carries one",
    "      const csrfToken = readCookie(CSRF_COOKIE_NAME) || await loadCsrfToken();",
    "      const csrfToken = await loadCsrfToken();"],
  ["no token is ever minted",
    "      const csrfToken = readCookie(CSRF_COOKIE_NAME) || await loadCsrfToken();",
    "      const csrfToken = readCookie(CSRF_COOKIE_NAME);"],
  ["concurrent mutations each mint their own token",
    "      if (!pendingToken) {",
    "      if (true) {"],
  ["the settled token promise is held as a cache",
    "        }).finally(() => {\n          pendingToken = null;\n        });",
    "        });"],
  ["a failed token route is sent anyway",
    '          if (!response.ok) {\n            throw new Error("Could not establish browser request protection.");\n          }',
    "          if (false) {\n            throw new Error(\"Could not establish browser request protection.\");\n          }"],
  ["an absent token is sent as the word null",
    '          return String(payload.csrfToken || "");',
    "          return String(payload.csrfToken);"],

  // --- the cookie reader the token path depends on -------------------------------------------------------
  ["a cookie name is matched as a substring",
    "      .find((item) => item.startsWith(`${name}=`));",
    "      .find((item) => item.includes(name));"],
  ["a cookie value stops being decoded",
    "    return cookie ? decodeURIComponent(cookie.split(\"=\").slice(1).join(\"=\")) : \"\";",
    '    return cookie ? cookie.split("=").slice(1).join("=") : "";'],
  ["a cookie value is truncated at its first equals sign",
    '    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";',
    '    return cookie ? decodeURIComponent(cookie.split("=")[1]) : "";'],
];

runMutationCampaign({
  sourcePath: "public/js/theme-init.js",
  suites: ["tests/unit/theme-init-csrf-guard.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
