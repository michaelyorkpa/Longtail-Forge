import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/browser-recovery.js");

/**
 * The recovery boundary's reads, lifted from the shipped file.
 *
 * `0.33.33.39.40` took `browser-recovery.js` to zero. `present` and `render` are published
 * taking `unknown`, so every member they read is read the way the property access read it -
 * with the handed-over value as the receiver. `framework.fetch-guard-composition` already
 * executes `installFetchGuard`, `isAppApiRequest`, `requestMethod` and `isMutationMethod`
 * for their ordering; these cases cover what those reads answer.
 *
 * One behaviour is stated here because it changed: an absent `options` fails with a named
 * `TypeError` where the member access failed with an anonymous one.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

/** @param {() => unknown} run */
function thrown(run) {
  try {
    run();
  } catch (error) {
    return { name: nameOf(error), message: isBag(error) ? String(error.message) : "" };
  }
  return null;
}

/** @param {string[]} names @param {string[]} [prelude] @param {string[]} [params] */
function lift(names, prelude = [], params = []) {
  const body = [
    ...prelude,
    ...names.map((name) => extractFunctionBlock(source, name)),
    `return { ${names.join(", ")} };`,
  ].join("\n");
  return new Function(...params, body);
}

/** A window stand-in: the file reads only these members off its IIFE parameter. */
function windowStub(origin = "https://forge.test", pathname = "/lists.html") {
  return {
    URL,
    Request: function StubRequest() {},
    location: { href: `${origin}${pathname}`, origin, pathname },
  };
}

describe("the members present and render read off an unknown boundary", () => {
  const { requiredMember, optionalMember } = lift(["requiredMember", "optionalMember"])();

  it("invokes a getter and answers what it returned, own or inherited", () => {
    const record = { marker: "own", get status() { return this.marker; } };
    assert.equal(requiredMember(record, "status"), "own");
    assert.equal(optionalMember(record, "status"), "own");

    // Inherited members answer exactly as the property access answered.
    const inherited = Object.create({ kind: "from-prototype" });
    assert.equal(requiredMember(inherited, "kind"), "from-prototype");
  });

  it("hands the value itself to the getter, which only a primitive can witness", () => {
    // `Object(value)` is the value for every object, so the receiver argument is
    // indistinguishable there - that is why the case below is a primitive. A primitive is
    // boxed, and the getter then sees whichever of the two this read hands it: the primitive,
    // exactly as `value[key]` handed it.
    Object.defineProperty(Number.prototype, "recoveryReceiverProbe", {
      configurable: true,
      get() { return typeof this; },
    });
    try {
      assert.equal(requiredMember(7, "recoveryReceiverProbe"), "number",
        "the getter sees the primitive, not a wrapper around it");
      assert.equal(optionalMember(7, "recoveryReceiverProbe"), "number");
    } finally {
      Reflect.deleteProperty(Number.prototype, "recoveryReceiverProbe");
    }
  });

  it("boxes a primitive the way the member access boxed it", () => {
    assert.equal(requiredMember("abc", "length"), 3);
    assert.equal(optionalMember("abc", "length"), 3);
    assert.equal(requiredMember(7, "missing"), undefined);
  });

  it("answers undefined for an absent value where the access was optional", () => {
    assert.equal(optionalMember(null, "status"), undefined);
    assert.equal(optionalMember(undefined, "status"), undefined);
  });

  it("fails for an absent value where the access was required, and names the member", () => {
    // `present(error, options = {})` and `render(options = {})` default only for `undefined`.
    // An explicit `null` reached a member access and threw; it still throws, named.
    for (const absent of [null, undefined]) {
      const failure = thrown(() => requiredMember(absent, "requestId"));
      assert.equal(failure?.name, "TypeError");
      assert.match(String(failure?.message), /requestId/);
    }
  });
});

describe("present reads its status and request id in the order it always did", () => {
  /**
   * `present` reaches `render` for every status but 403, so the rendered options are what
   * its reads produced. `recoveryKind` is stubbed to carry the status it was given.
   */
  function present() {
    /** @type {{ kind: unknown, requestId: unknown } | null} */
    let rendered = null;
    const api = lift(
      ["present", "requiredMember", "optionalMember"],
      [
        "function showPermissionDenied() { capture({ kind: \"permission-denied\" }); return Promise.resolve(); }",
        "function recoveryKind(status) { return `kind-${status}`; }",
        "function render(options) { capture(options); return Promise.resolve(null); }",
      ],
      ["capture"],
    )(/** @param {unknown} options */ (options) => {
      assert.ok(isBag(options));
      rendered = { kind: options.kind, requestId: options.requestId };
    });
    return { api, read: () => rendered };
  }

  it("prefers the options status, then the error's, and converts as parseInt converted", () => {
    const { api, read } = present();
    api.present({ status: 500 }, { status: "409 conflict" });
    assert.equal(read()?.kind, "kind-409", "the options status wins, parsed from its digits");

    api.present({ status: "502" }, {});
    assert.equal(read()?.kind, "kind-502", "an absent options status falls back to the error's");

    api.present({}, {});
    assert.equal(read()?.kind, "kind-0", "no status at all reads as zero, as `|| 0` answered");

    api.present({ status: {} }, {});
    assert.equal(read()?.kind, "kind-0", "a value with no digits is NaN and then zero");
  });

  it("reads the status through a getter on the value it was given", () => {
    const { api, read } = present();
    api.present({}, { digits: "404", get status() { return this.digits; } });
    assert.equal(read()?.kind, "kind-404");
  });

  it("still fails where converting the status failed", () => {
    const { api } = present();
    // `Number.parseInt` converted its argument to a string, and a symbol has never survived
    // that conversion. The template does the same conversion and fails the same way.
    assert.equal(thrown(() => api.present({}, { status: Symbol("nope") }))?.name, "TypeError");
  });

  it("trims the request id and keeps String's own conversion", () => {
    const { api, read } = present();
    api.present({ requestId: "  from-error  " }, {});
    assert.equal(read()?.requestId, "from-error");

    api.present({ requestId: "ignored" }, { requestId: "  from-options  " });
    assert.equal(read()?.requestId, "from-options", "the options request id wins");

    api.present({}, {});
    assert.equal(read()?.requestId, "", "nothing at all is the empty string");

    const symbol = Symbol("req");
    api.present({}, { requestId: symbol });
    assert.equal(read()?.requestId, String(symbol),
      "String accepts a symbol where the template would not, and that is what this call used");
  });

  it("fails on an absent options bag, where the member access failed", () => {
    const { api } = present();
    assert.equal(thrown(() => api.present({}, null))?.name, "TypeError");
  });
});

describe("the status a recovery kind is chosen from", () => {
  const { recoveryKind } = lift(["recoveryKind", "optionalMember"])();

  it("maps each status the surface distinguishes", () => {
    assert.equal(recoveryKind(401, null), "login-required");
    assert.equal(recoveryKind(403, null), "unavailable");
    assert.equal(recoveryKind(404, null), "unavailable");
    assert.equal(recoveryKind(409, null), "conflict");
    assert.equal(recoveryKind(502, null), "dependency-unavailable");
    assert.equal(recoveryKind(503, null), "dependency-unavailable");
    assert.equal(recoveryKind(0, null), "unexpected");
    assert.equal(recoveryKind(418, null), "unexpected");
  });

  it("reads the error's name without requiring an error", () => {
    assert.equal(recoveryKind(0, { name: "TypeError" }), "dependency-unavailable",
      "a failed fetch reaches the dependency surface by its name alone");
    assert.equal(recoveryKind(0, { name: "RangeError" }), "unexpected");
    assert.equal(recoveryKind(0, undefined), "unexpected", "an absent error is not a failure to read");
    assert.equal(recoveryKind(0, "TypeError"), "unexpected", "the name is a member, not the value");
  });
});

describe("the copy each recovery surface carries", () => {
  const { surfaceCopy } = lift(["surfaceCopy", "safeCurrentPath"], [], ["global"])(windowStub());

  it("answers one surface per kind, carrying the kind it was asked for", () => {
    assert.equal(surfaceCopy("login-required").actionHref, "/login.html");
    assert.equal(surfaceCopy("login-required").kind, "login-required");
    assert.equal(surfaceCopy("unavailable").actionHref, "/dashboard.html");
    assert.equal(surfaceCopy("conflict").actionHref, "/lists.html", "reload returns to this page");
    assert.equal(surfaceCopy("dependency-unavailable").actionHref, "/lists.html");
  });

  it("falls through to the unexpected surface for anything else", () => {
    for (const kind of [undefined, null, "", "other", 7, Object("login-required")]) {
      const surface = surfaceCopy(kind);
      assert.equal(surface.kind, "unexpected", `kind: ${String(kind)}`);
      assert.equal(surface.actionHref, "/dashboard.html");
    }
  });

  it("refuses a protocol-relative path, which would leave the site", () => {
    const offsite = lift(["surfaceCopy", "safeCurrentPath"], [], ["global"])(
      windowStub("https://forge.test", "//evil.example/"),
    );
    assert.equal(offsite.surfaceCopy("conflict").actionHref, "/dashboard.html");
  });
});

describe("the element the permission dialog returns focus to", () => {
  const { isFocusableTrigger } = lift(["isFocusableTrigger"])();

  it("accepts an element that can take focus, of any realm", () => {
    assert.equal(isFocusableTrigger({ focus: () => {} }), true);
    assert.equal(isFocusableTrigger({ nodeType: 1, tagName: "BUTTON", focus() {} }), true);
  });

  it("refuses one that cannot, which is what the typeof check refused", () => {
    // `document.activeElement` answers an `Element`; focusing is not every element's.
    assert.equal(isFocusableTrigger({ nodeType: 1, tagName: "svg" }), false);
    assert.equal(isFocusableTrigger({ focus: "not a function" }), false);
    assert.equal(isFocusableTrigger(null), false);
    assert.equal(isFocusableTrigger(undefined), false);
  });

  it("reads focus with the element as the receiver", () => {
    const element = { callable: true, get focus() { return this.callable ? () => {} : null; } };
    assert.equal(isFocusableTrigger(element), true);
    element.callable = false;
    assert.equal(isFocusableTrigger(element), false);
  });
});

describe("the requests the fetch guard recognises", () => {
  const guard = lift(
    ["isAppApiRequest", "requestMethod", "isMutationMethod"],
    [],
    ["global"],
  )(windowStub());

  it("recognises a same-origin API path however the request names it", () => {
    assert.equal(guard.isAppApiRequest("/api/tasks"), true);
    assert.equal(guard.isAppApiRequest("https://forge.test/api/tasks"), true);
    assert.equal(guard.isAppApiRequest(new URL("https://forge.test/api/tasks")), true);
    assert.equal(guard.isAppApiRequest({ url: "/api/tasks" }), true,
      "a Request-shaped value is read through its own url member");
  });

  it("refuses another origin, another path, and anything unreadable", () => {
    assert.equal(guard.isAppApiRequest("https://evil.example/api/tasks"), false);
    assert.equal(guard.isAppApiRequest("/lists.html"), false);
    assert.equal(guard.isAppApiRequest(null), false, "an absent input is not an API request");
    assert.equal(guard.isAppApiRequest({ get url() { throw new Error("unreadable"); } }), false,
      "a throwing read is caught, as it always was");
    assert.equal(guard.isAppApiRequest(Symbol("/api/tasks")), false,
      "a value that cannot become a string is caught rather than thrown");
  });

  it("reads the method from init first, then the request, and uppercases it", () => {
    assert.equal(guard.requestMethod(null, { method: "post" }), "POST");
    assert.equal(guard.requestMethod(null, {}), "GET", "no method at all is GET");
    assert.equal(guard.requestMethod(null, null), "GET", "an absent init is not a failure to read");
    assert.equal(guard.requestMethod(null, { digits: "delete", get method() { return this.digits; } }),
      "DELETE", "the method is read with init as the receiver");
  });

  it("treats everything but the three safe methods as a mutation", () => {
    for (const safe of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(guard.isMutationMethod(safe), false, safe);
    }
    for (const mutation of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(guard.isMutationMethod(mutation), true, mutation);
    }
  });
});
