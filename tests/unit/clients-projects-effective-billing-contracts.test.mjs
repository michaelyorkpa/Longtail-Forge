import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * How a Clients/Projects record's effective billing is resolved, checked exhaustively.
 *
 * `0.33.33.43.40` typed the effective-billing resolvers. A wrong inheritance here means a wrong
 * billed amount, so these cases check the inheritance order itself rather than a handful of
 * examples.
 *
 * **They avoid re-implementing the rule they test.** An oracle that restates `a || b || c` would
 * only prove the code agrees with a copy of itself. Instead every level carries a distinct sentinel
 * object - one for the project, one for the client, one for the workspace - and each case asserts
 * **which sentinel comes back, by identity**. That tells you which level won without encoding how.
 *
 * One asymmetry is pinned rather than changed: rounding consults `project.client_id` and sends a
 * project with no client straight to the workspace, while period always inherits through the
 * `client` it is handed. Every caller hands a project its own owning entry, so the two agree in
 * practice; the cases below record exactly where they would diverge if one ever did not.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

const RESOLVERS = [
  "getEffectiveClientBillingPeriod",
  "getEffectiveClientBillingRate",
  "getEffectiveProjectBillingPeriod",
  "getEffectiveClientBillingRounding",
  "getEffectiveProjectBillingRounding",
];

/** Distinct objects, so identity alone says which level a resolved value came from. */
const WORKSPACE = {
  period: { level: "workspace", kind: "period" },
  rate: "ws-rate",
  rounding: { level: "workspace", kind: "rounding" },
};

/** @param {Record<string, unknown>} [settings] */
function liftResolvers(settings = {}) {
  const sandbox = vm.createContext({
    workspaceSettings: {
      billingPeriod: WORKSPACE.period,
      defaultBillingRate: WORKSPACE.rate,
      billingRounding: WORKSPACE.rounding,
      ...settings,
    },
  });
  for (const name of RESOLVERS) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext(`({ ${RESOLVERS.join(", ")} })`, sandbox);
}

/** Every combination of "this level has its own value" and "it has none". */
function* grid() {
  for (const projectHasOwn of [true, false])
    for (const clientHasOwn of [true, false])
      for (const projectHasClient of [true, false])
        yield { projectHasOwn, clientHasOwn, projectHasClient };
}

describe("The billing period, resolved at every combination of levels", () => {
  it("takes the most specific level that has one: project, then client, then workspace", () => {
    const { getEffectiveProjectBillingPeriod } = liftResolvers();
    let checked = 0;

    for (const { projectHasOwn, clientHasOwn, projectHasClient } of grid()) {
      const projectOwn = { level: "project" };
      const clientOwn = { level: "client" };
      const client = { billing_period: clientHasOwn ? clientOwn : null };
      const project = { billing_period: projectHasOwn ? projectOwn : null, client_id: projectHasClient ? "c1" : "" };

      const expected = projectHasOwn ? projectOwn : clientHasOwn ? clientOwn : WORKSPACE.period;
      assert.equal(getEffectiveProjectBillingPeriod(client, project), expected,
        JSON.stringify({ projectHasOwn, clientHasOwn, projectHasClient }));
      checked += 1;
    }
    assert.equal(checked, 8, "every combination was checked");
  });

  it("does not consult the project's client id - it always inherits through the client it is handed", () => {
    // The period half of the asymmetry. A project with no client, handed a client that has its own
    // period, takes that client's period. Unreachable today - callers pass the owning entry - and
    // pinned so a caller that ever breaks that pairing shows up here.
    const { getEffectiveProjectBillingPeriod } = liftResolvers();
    const clientOwn = { level: "client" };

    assert.equal(getEffectiveProjectBillingPeriod({ billing_period: clientOwn }, { billing_period: null, client_id: "" }), clientOwn);
  });
});

describe("The rounding, resolved at every combination of levels", () => {
  it("skips the client for a project that has none, and falls through it for one that does", () => {
    const { getEffectiveProjectBillingRounding } = liftResolvers();
    let checked = 0;

    for (const { projectHasOwn, clientHasOwn, projectHasClient } of grid()) {
      const projectOwn = { level: "project" };
      const clientOwn = { level: "client" };
      const client = { billing_rounding: clientHasOwn ? clientOwn : null };
      const project = { billing_rounding: projectHasOwn ? projectOwn : null, client_id: projectHasClient ? "c1" : "" };

      const inherited = projectHasClient ? (clientHasOwn ? clientOwn : WORKSPACE.rounding) : WORKSPACE.rounding;
      const expected = projectHasOwn ? projectOwn : inherited;
      assert.equal(getEffectiveProjectBillingRounding(client, project), expected,
        JSON.stringify({ projectHasOwn, clientHasOwn, projectHasClient }));
      checked += 1;
    }
    assert.equal(checked, 8, "every combination was checked");
  });

  it("is where the two resolvers part ways, when a clientless project is handed a real client", () => {
    // The rounding half. Same inputs as the period case above: rounding goes to the workspace,
    // period goes to the client. Both agree whenever `client` is the project's own owner.
    const { getEffectiveProjectBillingRounding, getEffectiveProjectBillingPeriod } = liftResolvers();
    const client = { billing_period: { level: "client" }, billing_rounding: { level: "client" } };
    const project = { billing_period: null, billing_rounding: null, client_id: "" };

    assert.equal(getEffectiveProjectBillingRounding(client, project), WORKSPACE.rounding);
    assert.equal(getEffectiveProjectBillingPeriod(client, project), client.billing_period);
  });

  it("agrees with period when the client handed in is the workspace grouping", () => {
    // The case that actually occurs for a workspace project: its owning entry is the grouping.
    const { getEffectiveProjectBillingRounding, getEffectiveProjectBillingPeriod } = liftResolvers();
    const grouping = { isWorkspaceScope: true, billing_period: null, billing_rounding: null };
    const project = { billing_period: null, billing_rounding: null, client_id: "" };

    assert.equal(getEffectiveProjectBillingRounding(grouping, project), WORKSPACE.rounding);
    assert.equal(getEffectiveProjectBillingPeriod(grouping, project), WORKSPACE.period);
  });
});

describe("The client-level resolvers", () => {
  it("take the client's own value, else the workspace's, for period, rate and rounding", () => {
    const resolvers = liftResolvers();
    const own = { period: { level: "client" }, rate: "125", rounding: { level: "client" } };

    assert.equal(resolvers.getEffectiveClientBillingPeriod({ billing_period: own.period }), own.period);
    assert.equal(resolvers.getEffectiveClientBillingPeriod({ billing_period: null }), WORKSPACE.period);
    assert.equal(resolvers.getEffectiveClientBillingRate({ billing_rate: own.rate }), own.rate);
    assert.equal(resolvers.getEffectiveClientBillingRate({ billing_rate: null }), WORKSPACE.rate);
    assert.equal(resolvers.getEffectiveClientBillingRounding({ billing_rounding: own.rounding }), own.rounding);
    assert.equal(resolvers.getEffectiveClientBillingRounding({ billing_rounding: null }), WORKSPACE.rounding);
  });

  it("falls back on any falsy own value, including an empty rate", () => {
    // `||`, not `??`: an empty-string rate - which is what a cleared rate field normalises to
    // before it becomes null - inherits the workspace default rather than billing at "".
    const { getEffectiveClientBillingRate } = liftResolvers();

    for (const rate of [null, undefined, ""]) {
      assert.equal(getEffectiveClientBillingRate({ billing_rate: rate }), WORKSPACE.rate, JSON.stringify(rate));
    }
  });
});

/** The formatters and everything they reach for. */
function liftFormatters() {
  const names = ["vocabularyHas", "normalizeBillingPeriod", "normalizeBillingRounding", "formatOrdinal",
    "normalizeBillableFlag", "formatBillingPeriod", "formatBillingRounding", ...RESOLVERS,
    "getProjectRoundingInheritLabel", "formatProjectBillingSummary"];
  const sandbox = vm.createContext({
    workspaceSettings: {
      billingPeriod: { type: "calendarMonth", startDay: 1 },
      defaultBillingRate: "140",
      billingRounding: { enabled: true, increment: "nearestHour" },
    },
  });
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }
  return vm.runInContext(`({ ${names.join(", ")} })`, sandbox);
}

describe("How a rounding rule is described", () => {
  it("names each increment, says when rounding is off, and falls back for an unknown increment", () => {
    const { formatBillingRounding } = liftFormatters();

    assert.equal(formatBillingRounding({ enabled: true, increment: "nearestHour" }), "Nearest hour");
    assert.equal(formatBillingRounding({ enabled: true, increment: "nearestHalfHour" }), "Nearest half hour");
    assert.equal(formatBillingRounding({ enabled: true, increment: "nearestQuarterHour" }), "Nearest quarter hour");
    assert.equal(formatBillingRounding({ enabled: false, increment: "nearestHour" }), "No rounding");
    assert.equal(formatBillingRounding(null), "No rounding");
    // The label map is declared open, but the normaliser never hands it an unknown key: an unknown
    // increment becomes the quarter hour first, so the map lookup always hits.
    assert.equal(formatBillingRounding({ enabled: true, increment: "fortnightly" }), "Nearest quarter hour");
  });
});

describe("The inherited-rounding label", () => {
  it("names the workspace for a clientless project and for the grouping, and the client otherwise", () => {
    const { getProjectRoundingInheritLabel } = liftFormatters();
    const client = { billing_rounding: { enabled: true, increment: "nearestHalfHour" } };

    assert.equal(getProjectRoundingInheritLabel(client, { client_id: "c1" }), "Use client rounding (Nearest half hour)");
    assert.equal(getProjectRoundingInheritLabel(client, { client_id: "" }), "Use workspace rounding (Nearest hour)");
    assert.equal(getProjectRoundingInheritLabel({ ...client, isWorkspaceScope: true }, { client_id: "c1" }),
      "Use workspace rounding (Nearest hour)");
  });

  it("accepts the synthesized project the add form hands it before any project exists", () => {
    // Why its `project` parameter is typed by the one member read, not as a project record.
    const { getProjectRoundingInheritLabel } = liftFormatters();

    assert.equal(getProjectRoundingInheritLabel({ billing_rounding: null }, { client_id: "c1" }), "Use client rounding (Nearest hour)");
    assert.equal(getProjectRoundingInheritLabel({ billing_rounding: null }, null), "Use workspace rounding (Nearest hour)");
  });
});

describe("A project's billing summary", () => {
  it("says non-billable before anything else, whatever the project's rate", () => {
    const { formatProjectBillingSummary } = liftFormatters();

    assert.equal(formatProjectBillingSummary({}, { billable: "no", billing_rate: "200" }), "Non-billable");
  });

  it("joins the rate, the effective period and the effective rounding", () => {
    const { formatProjectBillingSummary } = liftFormatters();
    const client = { billing_period: null, billing_rounding: null };

    assert.equal(formatProjectBillingSummary(client, { billable: "yes", billing_rate: "200", client_id: "c1" }),
      "$200/hour / Calendar month / Nearest hour");
    assert.equal(formatProjectBillingSummary(client, { billable: "yes", billing_rate: null, client_id: "c1" }),
      "Billable / Calendar month / Nearest hour", "a billable project with no rate of its own says so");
  });
});
