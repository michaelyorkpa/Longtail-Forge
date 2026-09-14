import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/developer-example.js");
const errorContractSource = reader.readText("public/js/shared/error-contract.js");

/**
 * The only runtime change in `0.33.33.44.37`.
 *
 * The other four diagnostics this checkpoint cleared are parameter annotations, which the compiler
 * proves and a test cannot. This page's failure path is different: it stopped reading `error.message`
 * off an unknown caught value and now reads through the published contract, so what that contract
 * answers for each kind of thrown value is worth asserting rather than assuming.
 *
 * **The real `error-contract.js` runs in the same context**, so this exercises the published
 * `caughtMessage` rather than a stand-in that could agree with a wrong expectation.
 *
 * @param {object} [options]
 * @param {unknown} [options.throws] what `fetch` rejects with, when it should fail
 * @param {unknown} [options.body] what `response.json()` answers, when it should succeed
 * @param {boolean} [options.withContract] whether the page finds `LongtailForge.errors`
 * @param {boolean} [options.withOutput] whether the page finds its output element
 */
function developerExampleCase(options = {}) {
  const { throws, body = { ok: true }, withContract = true, withOutput = true } = options;
  const document = new FakeDocument();
  const output = document.createElement("pre");
  /** @type {string[]} */
  const routes = [];

  const context = vm.createContext({ console: { error: () => {} } });
  context.window = context;
  context.document = {
    /** @param {string} id */
    getElementById: (id) => (withOutput && id === "developer-example-output" ? output : null),
  };
  context.fetch = (/** @type {string} */ route) => {
    routes.push(route);
    if (throws !== undefined) return Promise.reject(throws);
    return Promise.resolve({ json: () => Promise.resolve(body) });
  };

  if (withContract) vm.runInContext(errorContractSource, context);
  return { output, routes, settled: vm.runInContext(source, context) };
}

describe("Developer example page", () => {
  it("renders the route body when the sample route answers", async () => {
    const testCase = developerExampleCase({ body: { status: "ok", checked: 2 } });
    await testCase.settled;
    assert.deepEqual(testCase.routes, ["/api/developer-example/status"]);
    assert.equal(testCase.output.textContent, JSON.stringify({ status: "ok", checked: 2 }, null, 2));
  });

  it("does nothing at all when the page has no output element", async () => {
    const testCase = developerExampleCase({ withOutput: false });
    await testCase.settled;
    assert.deepEqual(testCase.routes, [], "the route must not be fetched without somewhere to show it");
  });

  it("shows the message a thrown Error carries", async () => {
    const testCase = developerExampleCase({ throws: new TypeError("Failed to fetch") });
    await testCase.settled;
    assert.equal(testCase.output.textContent, "Failed to fetch");
  });

  /** A plain object carrying a message is still a message: the contract reads the bag, not the class. */
  it("shows the message a thrown record carries", async () => {
    const testCase = developerExampleCase({ throws: { message: "Route is disabled" } });
    await testCase.settled;
    assert.equal(testCase.output.textContent, "Route is disabled");
  });

  it("falls back for every thrown value that carries no readable message", async () => {
    for (const thrown of [null, "boom", 42, {}, { message: "" }, []]) {
      const testCase = developerExampleCase({ throws: thrown });
      await testCase.settled;
      assert.equal(testCase.output.textContent, "Developer example route failed.", `thrown: ${JSON.stringify(thrown)}`);
    }
  });

  /**
   * **A non-string message now falls back, where the raw read rendered it.** `caughtMessage`
   * requires a string, so a thrown `{ message: 5 }` shows the fallback rather than "5". That is
   * the published contract's decision, adopted here rather than re-litigated, and it is the one
   * behavioural difference this checkpoint introduces.
   */
  it("treats a non-string message as no message", async () => {
    const testCase = developerExampleCase({ throws: { message: 5 } });
    await testCase.settled;
    assert.equal(testCase.output.textContent, "Developer example route failed.");
  });

  it("requires the error contract, and says so, rather than reading through an absent one", async () => {
    const testCase = developerExampleCase({ throws: new Error("boom"), withContract: false });
    await assert.rejects(testCase.settled, /developer example page requires LongtailForge\.errors/);
  });
});

describe("Developer example shapes this page states rather than invents", () => {
  it("reads the caught value through the published contract", () => {
    assert.match(source, /requireErrors\(\)\.caughtMessage\(error, "Developer example route failed\."\)/);
    assert.doesNotMatch(source, /error\?\.message/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });
});
