import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The claims the Clients/Projects write-path contracts make.
 *
 * `0.33.33.43.36` named the two shapes this page's writes pass around - what a write reports about
 * itself, and what the page should look like afterwards - and typed the chain that consumes them.
 * That is annotation, which the compiler proves. What it cannot prove is the three claims those
 * annotations make in prose, and those are what these cases execute:
 *
 * 1. **The action dispatch is ordered.** `client_created` and `project_created` are matched before
 *    the `client_`/`project_` prefixes they would also satisfy, so a create never reports itself as
 *    an edit. Swapping the branches would still compile.
 * 2. **`complete` being callable is a precondition, not a filter.** The typedef names it as a
 *    function; the runtime test is truthiness, and a truthy non-callable still throws exactly as it
 *    did before rather than being quietly skipped.
 * 3. **The billing contact is a map of every named field, not a map of text.** A first draft of
 *    this checkpoint declared it `Record<string, string>`; the compiler accepted that, because the
 *    reduce's accumulator is untyped, and it was wrong. There is no `String()` in that reduce, so
 *    a truthy value arrives unchanged. These cases hold the corrected claim.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

/** The dispatcher and the completion call it delegates to, lifted together. */
function liftDispatch() {
  /** @type {unknown[]} */
  const completed = [];
  const sandbox = vm.createContext({});
  for (const name of ["completeClientProjectAction", "signalClientProjectModuleAction"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }
  const api = vm.runInContext("({ completeClientProjectAction, signalClientProjectModuleAction })", sandbox);

  return {
    completed,
    ...api,
    /** A host that records what it was told finished. */
    host: { complete: (/** @type {unknown} */ detail) => completed.push(detail) },
  };
}

describe("Which module action a write reports as finished", () => {
  /** @param {string} action @param {Record<string, unknown>} [rest] */
  function dispatch(action, rest = {}) {
    const { signalClientProjectModuleAction, completed, host } = liftDispatch();
    signalClientProjectModuleAction({ action, ...rest }, host);

    return completed.map((/** @type {unknown} */ detail) => JSON.parse(JSON.stringify(detail)));
  }

  it("reports a created client as the add action, not the edit action", () => {
    // `client_created` also starts with `client_`. The order of the branches is the whole contract.
    assert.deepEqual(dispatch("client_created", { client_id: "c1" }), [{ actionId: "clients.add", recordId: "c1" }]);
  });

  it("reports a created project as the add action, not the edit action", () => {
    assert.deepEqual(dispatch("project_created", { project_id: "p1" }), [{ actionId: "projects.add", recordId: "p1" }]);
  });

  it("reports every other client action as the edit action", () => {
    for (const action of ["client_settings_updated", "client_billing_settings_updated", "client_archived"]) {
      assert.deepEqual(dispatch(action, { client_id: "c1" }), [{ actionId: "clients.edit", recordId: "c1" }], action);
    }
  });

  it("reports every other project action as the edit action", () => {
    for (const action of ["project_updated", "project_archived"]) {
      assert.deepEqual(dispatch(action, { project_id: "p1" }), [{ actionId: "projects.edit", recordId: "p1" }], action);
    }
  });

  it("takes the client's identifier for a client action and the project's for a project action", () => {
    // Each branch reads its own record's identifier; a project action carrying both still reports
    // the project, which is what the host is waiting on.
    assert.deepEqual(dispatch("project_updated", { client_id: "c1", project_id: "p1" }),
      [{ actionId: "projects.edit", recordId: "p1" }]);
    assert.deepEqual(dispatch("client_settings_updated", { client_id: "c1", project_id: "p1" }),
      [{ actionId: "clients.edit", recordId: "c1" }]);
  });

  it("falls back to an empty identifier rather than reporting a missing one", () => {
    assert.deepEqual(dispatch("client_created"), [{ actionId: "clients.add", recordId: "" }]);
    assert.deepEqual(dispatch("project_created"), [{ actionId: "projects.add", recordId: "" }]);
  });

  it("reports nothing for an action it does not recognise, or for no action at all", () => {
    const { signalClientProjectModuleAction, completed, host } = liftDispatch();

    for (const action of ["", "tag_created", "workspace_updated"]) {
      signalClientProjectModuleAction({ action }, host);
    }
    signalClientProjectModuleAction({}, host);
    signalClientProjectModuleAction(undefined, host);

    assert.deepEqual(completed, []);
  });
});

describe("Telling the host, when there may be no host", () => {
  it("does nothing when there is none, and nothing when it carries no complete", () => {
    const { completeClientProjectAction } = liftDispatch();

    for (const hostContext of [null, undefined, {}, { complete: null }, { complete: undefined }]) {
      assert.doesNotThrow(() => completeClientProjectAction(hostContext, { actionId: "clients.add", recordId: "c1" }));
    }
  });

  it("passes the completion through unchanged", () => {
    const { completeClientProjectAction, completed, host } = liftDispatch();
    const detail = { actionId: "clients.add", recordId: "c1" };
    completeClientProjectAction(host, detail);

    assert.equal(completed.length, 1);
    assert.equal(completed[0], detail, "by identity, not a copy");
  });

  it("still throws on a truthy complete that is not callable", () => {
    // The typedef names `complete` as a function. That is a **precondition**, not a filter: the
    // runtime test is truthiness, and this case is what proves the annotation did not quietly
    // start skipping a value the page used to fail on.
    const { completeClientProjectAction } = liftDispatch();

    for (const complete of [7, "run", true, {}]) {
      assert.throws(() => completeClientProjectAction({ complete }, { actionId: "clients.add", recordId: "c1" }),
        { name: "TypeError" }, `a ${typeof complete} still throws`);
    }
  });
});

describe("The billing contact is every named field, not a map of text", () => {
  function liftContact() {
    const sandbox = vm.createContext({});
    const at = source.indexOf("  const billingContactFields = ");
    vm.runInContext(source.slice(at, source.indexOf("];", at) + 2), sandbox);
    vm.runInContext(extractFunctionBlock(source, "normalizeBillingContact"), sandbox);

    return vm.runInContext("({ normalizeBillingContact, billingContactFields })", sandbox);
  }

  it("answers every field the page names, whatever it was given", () => {
    const { normalizeBillingContact, billingContactFields } = liftContact();
    const names = billingContactFields.map((/** @type {[string, string]} */ [name]) => name);

    for (const input of [undefined, null, {}, { name: 7 }, { email: null }, { city: ["x"] }]) {
      assert.deepEqual(Object.keys(normalizeBillingContact(input)).sort(), [...names].sort(),
        `every field for ${JSON.stringify(input)}`);
    }
  });

  it("empties a falsy value and passes a truthy one through unchanged", () => {
    const { normalizeBillingContact } = liftContact();

    for (const empty of [null, undefined, "", 0, false, Number.NaN]) {
      assert.equal(normalizeBillingContact({ name: empty }).name, "", `${String(empty)} becomes empty text`);
    }

    // No `String()` in that reduce, which is why the values are `unknown` and not text.
    const city = ["x"];
    assert.equal(normalizeBillingContact({ name: 7 }).name, 7);
    assert.equal(normalizeBillingContact({ name: true }).name, true);
    assert.equal(normalizeBillingContact({ city }).city, city, "by identity");
  });

  it("does not trim: the editor does that on the way in", () => {
    const { normalizeBillingContact } = liftContact();
    const contact = normalizeBillingContact({ name: "  Acme  ", email: "a@b.c" });

    assert.equal(contact.name, "  Acme  ");
    assert.equal(contact.email, "a@b.c");
    assert.equal(contact.city, "", "and an absent field is empty rather than missing");
  });
});
