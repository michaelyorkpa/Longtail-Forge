import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The navigation controller's raw `href` input (`0.33.33.38.2.11`).
 *
 * `navigate` and `request` are declared to accept an opaque destination, which is what the
 * controller already did: `request` tests the original value, turns a falsy one into `""`, and
 * converts a truthy one once, inside itself, before any guard or `location.assign` sees it. The
 * implementation moved that conversion into a small helper so the compiler can see it; these cases
 * pin that nothing observable moved with it.
 *
 * Every case runs the actual `createNavigationIntentController` from this tree and from `75533ba8`
 * side by side, with an instrumented `window.URL`, `document.baseURI`, raw values and exit guard,
 * and compares one event log. The browser half of the comparison - Chromium's own URL constructor
 * and a real `<base>` element - is `tests/e2e/navigation-href-input.spec.mjs`.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/navigation.js");
const baseline = execFileSync("git", ["show", "75533ba8:public/js/navigation.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const contracts = reader.readText("src/types/browser-contracts.d.ts");

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["75533ba8", baseline]];
const APP_BASE = "http://longtail.local/app/workbench.html";

/**
 * @typedef {object} Controller
 * @property {(href: unknown, options?: object) => unknown} navigate
 * @property {(intent?: object) => unknown} request
 * @property {(guard?: object | null) => () => void} registerExitGuard
 */

/**
 * One version's controller, with every read it makes of the page recorded in order.
 * @param {string} text
 */
function harness(text) {
  /** @type {string[]} */
  const log = [];
  let baseURI = APP_BASE;
  const browserWindow = {
    get URL() {
      log.push("URL");
      return URL;
    },
    location: {
      /** @param {unknown} href */
      assign(href) { log.push(`assign:${String(href)}`); },
      href: APP_BASE,
      origin: "http://longtail.local",
    },
    navigation: { addEventListener() {} },
  };
  const browserDocument = {
    get baseURI() {
      log.push(`base:${baseURI}`);
      return baseURI;
    },
    addEventListener() {},
  };
  const factory = vm.runInNewContext(`(${extractFunctionBlock(text, "createNavigationIntentController")})`, {
    document: browserDocument,
    SESSION_LOGIN_PATH: "/login.html",
    window: browserWindow,
  });
  /** @type {Controller} */
  const controller = factory();
  return { controller, log, setBase: (/** @type {string} */ value) => { baseURI = value; } };
}

/**
 * The outcome of one synchronous call: what it returned, or what it threw, as plain text.
 * @param {() => unknown} call
 */
function outcome(call) {
  try {
    const returned = call();
    return { threw: null, promise: returned instanceof Promise || Object.prototype.toString.call(returned) === "[object Promise]" };
  } catch (error) {
    return { threw: `${Reflect.get(Object(error), "name")}` , promise: false };
  }
}

/**
 * Raw destinations, built fresh per run so each version's conversion calls are logged alone.
 * @param {string[]} log
 * @param {(value: string) => void} setBase
 * @returns {Array<[string, unknown]>}
 */
function destinations(log, setBase) {
  return [
    ["relative", "tasks.html"],
    ["root-relative", "/notes.html"],
    ["absolute", "https://example.com/x?y=1"],
    ["numeric 7 under a non-root base", 7],
    ["text 7", "7"],
    ["URL object", new URL("http://longtail.local/app/lists.html")],
    ["coercible object", { toString() { log.push("convert"); return "files.html"; } }],
    ["valueOf fallback", { toString() { log.push("toString"); return {}; }, valueOf() { log.push("valueOf"); return "search.html"; } }],
    ["toPrimitive", { [Symbol.toPrimitive](/** @type {string} */ hint) { log.push(`toPrimitive:${hint}`); return 7; } }],
    ["truthy but converts to empty", { toString() { log.push("convert"); return ""; } }],
    ["base-changing conversion", { toString() { log.push("convert"); setBase("http://longtail.local/other/"); return "moved.html"; } }],
    ["malformed", "http://["],
    ["throwing conversion", { toString() { log.push("convert"); throw new Error("conversion failed"); } }],
    ["symbol", Symbol("destination")],
    ["zero", 0],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["false", false],
    ["NaN", Number.NaN],
    ["zero bigint", 0n],
  ];
}

describe("navigate resolves every raw destination exactly as before", () => {
  it("records the same reads, conversions, destination and failure for every value", () => {
    const runs = VERSIONS.map(([, text]) => {
      const { controller, log, setBase } = harness(text);
      return destinations(log, setBase).map(([name, href]) => {
        log.length = 0;
        setBase(APP_BASE);
        const result = outcome(() => controller.navigate(href, { kind: "probe" }));
        return { name, ...result, log: [...log] };
      });
    });
    assert.deepEqual(runs[0], runs[1]);

    const byName = Object.fromEntries(runs[0].map((run) => [run.name, run]));
    assert.deepEqual(byName["numeric 7 under a non-root base"].log.at(-1), "assign:http://longtail.local/app/7",
      "a number resolves against the page's base, which is not the root");
    assert.deepEqual(byName["truthy but converts to empty"].log.at(-1), `assign:${APP_BASE}`,
      "a truthy value that converts to empty text still navigates, to the base itself");
    assert.deepEqual(byName.empty.log, [], "an originally empty destination reads nothing and assigns nothing");
    assert.deepEqual(byName["base-changing conversion"].log, [
      "URL", `base:${APP_BASE}`, "convert", "assign:http://longtail.local/app/moved.html",
    ], "the base is read before the value converts, so a conversion that moves it changes nothing");
    assert.equal(byName.malformed.threw, "TypeError", "a malformed URL still throws synchronously");
    assert.equal(byName.symbol.threw, "TypeError", "a symbol still throws synchronously");
    assert.equal(byName["throwing conversion"].threw, "Error", "a conversion's own error propagates unchanged");
  });

  it("reads a raw href off a request three times, as before - spread, test, argument", () => {
    const runs = VERSIONS.map(([, text]) => {
      const { controller, log } = harness(text);
      const intent = {
        get href() {
          log.push("read href");
          return { toString() { log.push("convert"); return "tasks.html"; } };
        },
        kind: "probe",
      };
      outcome(() => controller.request(intent));
      return [...log];
    });
    assert.deepEqual(runs[0], runs[1]);
    assert.deepEqual(runs[0], [
      "read href", "read href", "URL", "read href", `base:${APP_BASE}`, "convert", "assign:http://longtail.local/app/tasks.html",
    ]);
  });
});

describe("guards, continuations and the pending promise are unchanged", () => {
  /**
   * One held navigation: a guard that holds everything but the login page, two overlapping calls,
   * and every intent the guard receives, reduced to plain data.
   * @param {string} text
   * @param {unknown} href
   */
  async function heldNavigation(text, href) {
    const { controller, log } = harness(text);
    /** @type {unknown[]} */
    const seen = [];
    /** @param {string} stage @param {unknown} intent */
    const record = (stage, intent) => seen.push([stage, typeof Reflect.get(Object(intent), "href"), Reflect.get(Object(intent), "href"), Reflect.get(Object(intent), "kind")]);
    controller.registerExitGuard({
      shouldHold: (/** @type {unknown} */ intent) => { record("shouldHold", intent); return true; },
      beforeContinue: async (/** @type {unknown} */ intent) => { record("beforeContinue", intent); },
      onCommitted: (/** @type {unknown} */ intent) => { record("onCommitted", intent); },
    });
    const first = controller.navigate(href, { kind: "probe" });
    const second = controller.navigate("elsewhere.html", { kind: "probe" });
    const same = first === second;
    await first;
    return { same, seen, log: [...log] };
  }

  it("holds a converted destination, shares the pending promise, and hands guards the normalised text", async () => {
    for (const href of [7, { toString: () => "notes.html" }, "tasks.html"]) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => heldNavigation(text, href)));
      assert.deepEqual(now, before, `held navigation to ${String(href)}`);
      assert.equal(now.same, true, "an overlapping call receives the same pending promise");
      assert.ok(now.seen.every((entry) => Array.isArray(entry) && entry[1] === "string"), "every guard sees a string href");
    }
  });

  it("lets the login page bypass a holding guard, as before", async () => {
    const [now, before] = await Promise.all(VERSIONS.map(([, text]) => heldNavigation(text, "/login.html")));
    assert.deepEqual(now, before);
    assert.equal(now.log.find((entry) => entry.startsWith("assign:")), "assign:http://longtail.local/login.html",
      "the login page is assigned at once, ahead of the held call behind it");
    assert.equal(now.same, false, "and no pending promise was shared, because nothing held it");
  });

  it("still runs a continuation when the href is falsy, held or not", async () => {
    for (const hold of [false, true]) {
      const results = await Promise.all(VERSIONS.map(async ([, text]) => {
        const { controller, log } = harness(text);
        /** @type {string[]} */
        const guardLog = [];
        if (hold) {
          controller.registerExitGuard({
            shouldHold: () => true,
            beforeContinue: async () => { guardLog.push("beforeContinue"); },
            onCommitted: (/** @type {unknown} */ intent) => { guardLog.push(`onCommitted:${String(Reflect.get(Object(intent), "href"))}`); },
          });
        }
        const returned = await controller.request({ continue: () => "continued", commitBeforeContinue: true, href: 0 });
        return { returned, guardLog, log: [...log] };
      }));
      assert.deepEqual(results[0], results[1], hold ? "held" : "not held");
      assert.equal(results[0].returned, "continued", "a falsy href does not mean the request does nothing");
      assert.ok(!results[0].log.some((entry) => entry.startsWith("assign:")), "and nothing is assigned");
    }
  });
});

describe("The contract separates the raw input from the normalised request", () => {
  it("declares the raw href unknown only on the input side", () => {
    assert.match(contracts, /navigate\(href: unknown, options\?: BrowserNavigationIntentRequest\): Promise<unknown>;/);
    assert.match(contracts, /request\(intent\?: BrowserNavigationIntentRequestInput\): Promise<unknown>;/);
    assert.match(contracts, /shouldHold\(intent\?: BrowserNavigationIntentRequest\): boolean;/, "the normalised side stays text");
    for (const member of ["beforeContinue", "onCommitted", "onContinueError", "shouldHold"]) {
      assert.match(contracts, new RegExp(`\\n {2}${member}\\?\\(intent: BrowserNavigationIntentRequest[,)]`), `exit guard ${member}`);
    }

    /** @param {string} name */
    const members = (name) => {
      const body = contracts.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
      assert.ok(body, `${name} is declared`);
      return [...body[1].matchAll(/^ {2}(\[key: string\]|\w+\??): ([^;]+);/gm)].map((match) => [match[1], match[2]]);
    };
    const normalised = members("BrowserNavigationIntentRequest");
    const input = members("BrowserNavigationIntentRequestInput");
    assert.deepEqual(input.filter(([name]) => name !== "href?"), normalised.filter(([name]) => name !== "href?"),
      "every other member is the same");
    assert.deepEqual(normalised.find(([name]) => name === "href?"), ["href?", "string"]);
    assert.deepEqual(input.find(([name]) => name === "href?"), ["href?", "unknown"]);
  });

  it("keeps the conversion inside the lifted controller, after the base is read", () => {
    const controller = extractFunctionBlock(current, "createNavigationIntentController");
    assert.match(controller, /href: intent\.href \? resolveRequestHref\(window\.URL, intent\.href, document\.baseURI\) : "",/);
    assert.match(controller, /function resolveRequestHref\(URLConstructor, href, base\) \{\n\s+return new URLConstructor\(`\$\{href\}`, base\)\.href;\n\s+\}/);
    assert.doesNotMatch(controller, /@type \{string\} \*\/ \(/, "nothing asserts an unconverted value is text");
  });
});
