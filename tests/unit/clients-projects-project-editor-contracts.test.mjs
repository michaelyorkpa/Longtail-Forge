import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects project editor, its create surfaces, and the stand-in they can be handed.
 *
 * `0.33.33.43.37` typed the project editor and both create surfaces. Most of that is annotation.
 * Two executable changes came with it, and these cases hold both:
 *
 * 1. **The workspace stand-in is built by the builder, not restated beside it.** It used to be a
 *    second literal that had drifted from the builder - it lacked `taskReminderPolicy`. Once the
 *    create dialog was typed, the stand-in could no longer be passed to it, because a record missing
 *    a member of its own type is not that type. Every member but one is the identical expression;
 *    the one addition is a member **no reader in this page touches on a grouping**.
 * 2. **The project's rate field states the conversion it already had.** `null` into an input's
 *    `value` writes the empty string, which `.43.34` measured in Chromium for the client's rate.
 *    `?? ""` is equivalent only while the normaliser answers `null` and never `undefined`.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

const READERS = [
  "vocabularyHas",
  "normalizeBillingPeriod",
  "normalizeBillingRounding",
  "normalizeBillingRate",
  "normalizeOptionalBillingPeriod",
  "normalizeOptionalBillingRounding",
  "normalizeBillingContact",
  "normalizeReminderOffsetList",
  "normalizeTaskReminderPolicy",
  "buildWorkspaceProjectsGrouping",
  "isWorkspaceGrouping",
  "isRealClient",
  "getWorkspaceProjectClient",
];

/**
 * The stand-in's producer and everything it reaches for.
 * @param {{ clients?: unknown[], capabilities?: Record<string, unknown>, simplified?: boolean }} [page]
 */
function liftStandIn(page = {}) {
  const sandbox = vm.createContext({
    workspaceSettings: {
      defaultBillingRate: "140",
      billingPeriod: { type: "custom", startDay: 15 },
      billingRounding: { enabled: true, increment: "nearestHour" },
    },
    usesProjectRoundingOnly: () => page.simplified === true,
    workspaceProjectsLabel: () => "Workspace projects",
    clientProjectData: { clients: page.clients || [], capabilities: page.capabilities || {} },
  });

  const at = source.indexOf("  const billingContactFields = ");
  vm.runInContext(source.slice(at, source.indexOf("];", at) + 2), sandbox);
  for (const name of READERS) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext(`({ ${READERS.join(", ")} })`, sandbox);
}

/** @param {unknown} value */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("The workspace stand-in, now built by the builder", () => {
  it("carries every member the old literal carried, with the values it computed", () => {
    // These are the thirteen members the removed literal produced, in full-billing mode, written
    // out as expectations rather than re-derived - so a drift in the builder shows up here.
    const standIn = plain(liftStandIn({ capabilities: { canCreateWorkspaceProject: true, canManageWorkspaceProjects: true } })
      .getWorkspaceProjectClient());

    assert.equal(standIn.id, "__workspace_projects__");
    assert.equal(standIn.name, "Workspace projects");
    assert.equal(standIn.status, "Active");
    assert.equal(standIn.billable, "yes");
    assert.equal(standIn.billing_rate, "140");
    assert.deepEqual(standIn.billing_period, { type: "custom", startDay: 15 });
    assert.deepEqual(standIn.billing_rounding, { enabled: true, increment: "nearestHour" });
    assert.equal(Object.keys(standIn.billing_contact).length, 11, "every contact field, as normalised");
    assert.equal(standIn.canCreateProject, true);
    assert.equal(standIn.canManageProjects, true);
    assert.equal(standIn.isWorkspaceScope, true);
    assert.deepEqual(standIn.projects, []);
  });

  it("drops the billing members exactly as the literal did when billing is simplified", () => {
    const standIn = plain(liftStandIn({ simplified: true }).getWorkspaceProjectClient());

    assert.equal(standIn.billable, "no");
    assert.equal(standIn.billing_rate, null);
    assert.equal(standIn.billing_period, null);
    // Rounding was never gated on the billing mode, in the literal or the builder.
    assert.deepEqual(standIn.billing_rounding, { enabled: true, increment: "nearestHour" });
  });

  it("translates the normalised capabilities to the same answers the literal gave", () => {
    // The only translation: the builder reads the wire's spelling and this page holds the
    // normalised one. The literal computed `=== true`; so does the adapter, and so does the builder
    // on the boolean it is handed - so a truthy non-boolean is still refused.
    for (const [capability, expected] of [[true, true], [false, false], [undefined, false], ["yes", false], [1, false]]) {
      const standIn = liftStandIn({ capabilities: { canCreateWorkspaceProject: capability, canManageWorkspaceProjects: capability } })
        .getWorkspaceProjectClient();

      assert.equal(standIn.canCreateProject, expected, `create for ${String(capability)}`);
      assert.equal(standIn.canManageProjects, expected, `manage for ${String(capability)}`);
    }
  });

  it("adds exactly one member, and it is the one the builder always produced", () => {
    const standIn = plain(liftStandIn().getWorkspaceProjectClient());
    const literalMembers = [
      "id", "name", "status", "billable", "billing_rate", "billing_period", "billing_rounding",
      "billing_contact", "canCreateProject", "canManageProjects", "isWorkspaceScope", "projects",
    ];

    assert.deepEqual(Object.keys(standIn).filter((key) => !literalMembers.includes(key)), ["taskReminderPolicy"]);
    assert.equal(standIn.taskReminderPolicy.inherited, true, "and it is the inherited policy");
  });

  it("is only the fallback: a grouping the page holds is returned by identity", () => {
    const { buildWorkspaceProjectsGrouping } = liftStandIn();
    const held = buildWorkspaceProjectsGrouping([{ id: "w1" }], {});
    const realClient = { id: "c1", name: "Acme" };

    const found = liftStandIn({ clients: [realClient, held] }).getWorkspaceProjectClient();
    assert.equal(found, held, "the held grouping, not a fresh stand-in");
    assert.equal(found.projects.length, 1);
  });
});

describe("The two predicates are exact complements", () => {
  it("answers opposite for every value the discriminant can hold", () => {
    const { isWorkspaceGrouping, isRealClient } = liftStandIn();

    // Truthiness, as the `find` it replaced tested - so a truthy non-`true` is still a grouping.
    for (const value of [true, false, undefined, null, 0, 1, "", "yes", [], {}]) {
      const entry = { isWorkspaceScope: value };
      assert.equal(isWorkspaceGrouping(entry), !isRealClient(entry), `${JSON.stringify(value)}`);
      assert.equal(isWorkspaceGrouping(entry), Boolean(value));
    }
    assert.equal(isWorkspaceGrouping({}), false, "an entry without the member is a real client");
  });
});

describe("The precondition the project rate field rests on", () => {
  it("normalises the rate to null or text, never undefined", () => {
    const at = source.indexOf("function normalizeProjects(");
    const body = source.slice(at, source.indexOf("\n  }", at));

    // `?? ""` matches the DOM's own conversion of `null`, and would differ only for `undefined`.
    // Both of the rate's branches answer `null` or `normalizeBillingRate`, which answers text or
    // `null` - `.43.34` pins that reader directly.
    assert.match(body, /billing_rate: usesProjectRoundingOnly\(\) \? null : normalizeBillingRate\(project\.billing_rate\),/);
  });

  it("is what the project editor's rate field coalesces against", () => {
    assert.match(source, /billingRateInput\.value = project\.billing_rate \?\? "";/);
  });
});
