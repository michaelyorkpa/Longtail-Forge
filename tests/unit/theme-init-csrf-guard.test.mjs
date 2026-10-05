/* global Headers, Request */
import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/theme-init.js");

/**
 * **This guard decides whether a CSRF header reaches a request**, so the evidence is weighted
 * toward proving the wrapper answers exactly what it answered before, rather than toward the
 * sixteen annotations the checkpoint cleared.
 *
 * Two reads changed and both are held still here: the double-wrap marker moved from a
 * truthiness read to `Object.hasOwn`, and `init` stopped being inferred as `{}`. Everything
 * else - which requests are protected, how headers merge, how the token is cached - is asserted
 * because it must not have moved.
 */

const LIFTED = [
  "readCookie", "installCsrfFetchGuard", "resolveRequestUrl",
  "resolveRequestMethod", "isProtectedApiMutation",
];

const GUARD_MARKER = "__longtailCsrfGuard";

/**
 * A fetch as this fixture hands it around: callable, and possibly carrying a marker.
 * @typedef {(input?: unknown, init?: RequestInit) => Promise<unknown>} FetchLike
 */

/**
 * The fetch currently on the fixture's window, proved callable.
 * @param {{ window: { fetch: FetchLike | null } }} testCase
 * @returns {FetchLike}
 */
function installedFetch(testCase) {
  const candidate = testCase.window.fetch;
  assert.ok(candidate, "the guard must have left a fetch on the window");
  return candidate;
}

/**
 * @param {object} [options]
 * @param {string} [options.cookie] what `document.cookie` holds
 * @param {FetchLike | null} [options.existingFetch] the fetch already on the window, if any
 * @param {string} [options.origin] the page origin
 */
function guardCase(options = {}) {
  const { cookie = "", existingFetch, origin = "https://app.test" } = options;
  /** @type {{ input: unknown, init: RequestInit | undefined }[]} */
  const calls = [];
  /** @type {unknown[]} */
  const tokenResponses = [];

  /** @param {unknown} input @param {RequestInit} [init] */
  const recordingFetch = (input, init) => {
    calls.push({ init, input });
    if (String(input).includes("/api/csrf-token")) {
      const queued = tokenResponses.shift();
      return Promise.resolve(queued ?? { json: () => Promise.resolve({ csrfToken: "minted" }), ok: true });
    }
    return Promise.resolve({ ok: true });
  };
  /** @type {{ Headers: typeof Headers, Request: typeof Request, URL: typeof URL, fetch: FetchLike | null, location: { href: string, origin: string } }} */
  const window = {
    Headers, Request, URL,
    fetch: existingFetch === undefined ? recordingFetch : existingFetch,
    location: { href: `${origin}/notes.html`, origin },
  };
  const sandbox = vm.createContext({ document: { cookie }, window });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  // The two constants the guard closes over at module scope.
  vm.runInContext('const CSRF_COOKIE_NAME = "lf_csrf"; const CSRF_HEADER_NAME = "X-CSRF-Token";', sandbox);

  return {
    api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox),
    calls, tokenResponses, window,
  };
}

/** @param {{ init: RequestInit | undefined }} call */
const headerOf = (call) => new Headers(call.init?.headers ?? undefined).get("X-CSRF-Token");

describe("CSRF guard installation", () => {
  it("wraps an unguarded fetch and stamps its own marker", () => {
    const testCase = guardCase();
    const before = testCase.window.fetch;
    testCase.api.installCsrfFetchGuard();
    assert.notEqual(testCase.window.fetch, before, "the global must be replaced");
    const installed = installedFetch(testCase);
    assert.equal(Object.hasOwn(installed, GUARD_MARKER), true);
    assert.equal(Object.getOwnPropertyDescriptor(installed, GUARD_MARKER)?.value, true, "the marker is still literally true");
  });

  it("declines to wrap a fetch already carrying the marker", () => {
    const guarded = Object.assign(() => Promise.resolve({ ok: true }), { [GUARD_MARKER]: true });
    const testCase = guardCase({ existingFetch: guarded });
    testCase.api.installCsrfFetchGuard();
    assert.equal(testCase.window.fetch, guarded, "an already-guarded global must be left alone");
  });

  it("does nothing at all when there is no fetch to wrap", () => {
    const testCase = guardCase({ existingFetch: null });
    assert.doesNotThrow(() => testCase.api.installCsrfFetchGuard());
    assert.equal(testCase.window.fetch, null);
  });

  /**
   * **Divergence one, on a value nothing produces.** The truthiness read accepted a marker
   * found anywhere on the prototype chain; `Object.hasOwn` asks only about this function. Only
   * `theme-init.js` writes this marker, and it writes it directly onto the fetch it built, so
   * nothing in the estate reaches this. Wrapping is also the safe direction: an unmarked fetch
   * gains protection rather than silently going without it.
   */
  it("wraps a fetch whose marker is only inherited, where the truthiness read would not have", () => {
    const inherited = Object.assign(
      Object.setPrototypeOf(() => Promise.resolve({ ok: true }), Object.assign(() => {}, { [GUARD_MARKER]: true })),
      {},
    );
    assert.equal(inherited[GUARD_MARKER], true, "the fixture must really inherit a truthy marker");
    assert.equal(Object.hasOwn(inherited, GUARD_MARKER), false, "and must not own it");

    const testCase = guardCase({ existingFetch: inherited });
    testCase.api.installCsrfFetchGuard();
    assert.notEqual(testCase.window.fetch, inherited, "the inherited marker no longer counts as guarded");
  });

  /**
   * **Divergence two, also on a value nothing produces.** A falsy *own* marker read as
   * unguarded before and reads as guarded now. `theme-init.js` is the only writer and only ever
   * writes `true`, so nothing reaches this either; it is recorded rather than left to be found.
   */
  it("treats a falsy own marker as already guarded, where the truthiness read would have rewrapped", () => {
    const falsyMarked = Object.assign(() => Promise.resolve({ ok: true }), { [GUARD_MARKER]: false });
    const testCase = guardCase({ existingFetch: falsyMarked });
    testCase.api.installCsrfFetchGuard();
    assert.equal(testCase.window.fetch, falsyMarked);
  });
});

describe("CSRF guard request selection", () => {
  /** Install the guard and issue one request through it. */
  const issue = async (/** @type {Parameters<typeof guardCase>[0]} */ options, /** @type {unknown} */ input, /** @type {RequestInit | undefined} */ init) => {
    const testCase = guardCase(options);
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)(input, init);
    return testCase;
  };

  it("adds the header to a same-origin API mutation", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "/api/notes", { method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), "cookie-token");
  });

  /**
   * **The lowercase spellings are the ones that prove the normalisation is load-bearing.** An
   * uppercase `GET` matches the safe list with or without `toUpperCase`; a lowercase `get` only
   * matches because the method is normalised first, and without it a plain read would be
   * treated as a mutation.
   */
  it("leaves safe methods untouched, however they are spelled", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get", "head", "Options"]) {
      const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "/api/notes", { method });
      assert.equal(headerOf(testCase.calls[0]), null, `method: ${method}`);
    }
  });

  it("recognises a mutation however it is spelled", async () => {
    for (const method of ["POST", "post", "Patch", "delete", "PUT"]) {
      const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "/api/notes", { method });
      assert.equal(headerOf(testCase.calls[0]), "cookie-token", `method: ${method}`);
    }
  });

  /** **The public API is deliberately excluded**: it authenticates with API keys, not cookies. */
  it("excludes the versioned public API from CSRF protection", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "/api/v1/notes", { method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), null);
  });

  it("leaves non-API paths untouched", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "/notes.html", { method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), null);
  });

  it("leaves a cross-origin mutation untouched", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "https://elsewhere.test/api/notes", { method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), null);
  });

  /**
   * An input the resolver cannot read yields no URL, and the request passes through unprotected
   * rather than throwing. **`null` is the fixture that actually reaches that branch**: an
   * earlier version used `{ url: "::::" }`, which `new URL` happily resolves as a relative path,
   * so the case was passing for the wrong reason and a mutation to the `!url` arm survived it.
   */
  it("passes an input it cannot resolve straight through, unprotected", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, null, { method: "POST" });
    assert.equal(testCase.calls.length, 1, "the request must still be made");
    assert.equal(headerOf(testCase.calls[0]), null, "and must not be treated as protected");
  });

  it("resolves a relative path against the page, rather than failing to read it", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, "api/notes", { method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), "cookie-token", "a page-relative /api path is still protected");
  });

  /** `init` used to be inferred as `{}`; calling with no init at all must still work. */
  it("survives a call with no init, defaulting the method to GET", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes");
    assert.equal(headerOf(testCase.calls[0]), null, "no method means GET, which is not protected");
  });

  it("reads the method off a Request when init names none", async () => {
    const testCase = await issue({ cookie: "lf_csrf=cookie-token" }, new Request("https://app.test/api/notes", { method: "DELETE" }), undefined);
    assert.equal(headerOf(testCase.calls[0]), "cookie-token");
  });
});

describe("CSRF guard header merging", () => {
  it("keeps the caller's other headers and adds its own", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { headers: { Accept: "application/json" }, method: "POST" });
    const sent = new Headers(testCase.calls[0].init?.headers ?? undefined);
    assert.equal(sent.get("Accept"), "application/json");
    assert.equal(sent.get("X-CSRF-Token"), "cookie-token");
  });

  it("carries a Request's own headers through and overlays init on top", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    const request = new Request("https://app.test/api/notes", { headers: { "X-From": "request", "X-Both": "request" }, method: "POST" });
    await installedFetch(testCase)(request, { headers: { "X-Both": "init", "X-From-Init": "init" } });
    const sent = new Headers(testCase.calls[0].init?.headers ?? undefined);
    assert.equal(sent.get("X-From"), "request");
    assert.equal(sent.get("X-From-Init"), "init");
    assert.equal(sent.get("X-Both"), "init", "init headers overlay the request's");
    assert.equal(sent.get("X-CSRF-Token"), "cookie-token");
  });

  /** The guard's own header wins, because it is set last and must not be spoofable by a caller. */
  it("overrides a caller-supplied CSRF header with the real token", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { headers: { "X-CSRF-Token": "forged" }, method: "POST" });
    assert.equal(headerOf(testCase.calls[0]), "cookie-token");
  });

  it("preserves the rest of init while replacing its headers", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { body: "payload", credentials: "include", method: "POST" });
    assert.equal(testCase.calls[0].init?.body, "payload");
    assert.equal(testCase.calls[0].init?.credentials, "include");
    assert.equal(testCase.calls[0].init?.method, "POST");
  });
});

describe("CSRF token acquisition", () => {
  it("mints a token when the cookie carries none, then sends it", async () => {
    const testCase = guardCase();
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { method: "POST" });
    assert.equal(String(testCase.calls[0].input), "/api/csrf-token");
    assert.equal(testCase.calls[0].init?.credentials, "same-origin");
    assert.equal(headerOf(testCase.calls[1]), "minted");
  });

  it("prefers the cookie and never mints when one is present", async () => {
    const testCase = guardCase({ cookie: "lf_csrf=cookie-token" });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { method: "POST" });
    assert.equal(testCase.calls.length, 1, "no token route should be reached");
    assert.equal(headerOf(testCase.calls[0]), "cookie-token");
  });

  /** Two mutations racing with no cookie must share one in-flight token request. */
  it("shares one in-flight token request between concurrent mutations", async () => {
    const testCase = guardCase();
    testCase.api.installCsrfFetchGuard();
    const guarded = installedFetch(testCase);
    await Promise.all([
      guarded("/api/notes", { method: "POST" }),
      guarded("/api/tasks", { method: "POST" }),
    ]);
    const tokenCalls = testCase.calls.filter((call) => String(call.input).includes("/api/csrf-token"));
    assert.equal(tokenCalls.length, 1, "the pending token must be reused, not requested twice");
  });

  /**
   * The pending promise is an **in-flight dedupe, not a cache**: it is cleared when it settles,
   * so a later mutation asks again rather than reusing a token that may have been rotated.
   */
  it("mints again for a later mutation once the first has settled", async () => {
    const testCase = guardCase();
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { method: "POST" });
    await installedFetch(testCase)("/api/tasks", { method: "POST" });
    const tokenCalls = testCase.calls.filter((call) => String(call.input).includes("/api/csrf-token"));
    assert.equal(tokenCalls.length, 2, "the settled promise must not be held as a cache");
  });

  it("refuses to send a request when the token route fails", async () => {
    const testCase = guardCase();
    testCase.tokenResponses.push({ json: () => Promise.resolve({}), ok: false });
    testCase.api.installCsrfFetchGuard();
    await assert.rejects(installedFetch(testCase)("/api/notes", { method: "POST" }), /Could not establish browser request protection\./);
  });

  it("sends an empty token rather than throwing when the route answers no token", async () => {
    const testCase = guardCase();
    testCase.tokenResponses.push({ json: () => Promise.resolve({ csrfToken: null }), ok: true });
    testCase.api.installCsrfFetchGuard();
    await installedFetch(testCase)("/api/notes", { method: "POST" });
    assert.equal(headerOf(testCase.calls[1]), "");
  });
});

describe("Cookie reader", () => {
  it("reads a named cookie and decodes it", () => {
    const { api } = guardCase({ cookie: "other=1; lf_csrf=a%20token; more=2" });
    assert.equal(api.readCookie("lf_csrf"), "a token");
  });

  it("answers empty for a cookie that is not there", () => {
    const { api } = guardCase({ cookie: "other=1" });
    assert.equal(api.readCookie("lf_csrf"), "");
  });

  it("keeps a value containing equals signs intact", () => {
    const { api } = guardCase({ cookie: "lf_csrf=a=b=c" });
    assert.equal(api.readCookie("lf_csrf"), "a=b=c");
  });

  /** The name is matched as a whole, not as a substring, so a longer name cannot answer for it. */
  it("refuses a cookie whose name merely contains the one asked for", () => {
    const { api } = guardCase({ cookie: "not_lf_csrf=wrong; lf_csrf_extra=also-wrong" });
    assert.equal(api.readCookie("lf_csrf"), "");
  });
});

describe("theme-init shapes this file states rather than invents", () => {
  /** The marker is asked about by own key rather than asserted onto the platform's fetch. */
  it("reads the double-wrap marker by own key", () => {
    assert.match(source, /Object\.hasOwn\(window\.fetch, guardMarker\)/);
    assert.doesNotMatch(source, /window\.fetch\.__longtailCsrfGuard/);
  });

  /** The marker name stays literally what the composition regression brands on. */
  it("still stamps the marker the guard-composition contract reads", () => {
    assert.match(source, /const guardMarker = "__longtailCsrfGuard";/);
    assert.match(source, /guardedFetch\[guardMarker\] = true;/);
  });

  /** Declared inside the guard, because the composition regression lifts that function alone. */
  it("keeps the marker name inside the function the regression lifts", () => {
    const block = extractFunctionBlock(source, "installCsrfFetchGuard");
    assert.match(block, /const guardMarker = "__longtailCsrfGuard";/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });
});
