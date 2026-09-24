import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Clients/Projects readers accept, and what they guarantee.
 *
 * `0.33.33.43.31` opened this file - the last unconverted browser controller - on its response
 * readers and normalizers, the cluster where the contract work lives.
 *
 * Two executable changes carry the checkpoint and both are equivalences rather than conversions:
 * a membership test that guards on `typeof` before delegating to `includes`, and three templates
 * that make explicit the `ToString` `parseInt` already performed on its own argument. Each is
 * measured here rather than asserted.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

/**
 * One reader, lifted with whatever it reaches for.
 * @param {string[]} names @param {Record<string, unknown>} [extra]
 */
function lift(names, extra = {}) {
  const sandbox = vm.createContext({ ...extra });
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }
  return vm.runInContext(`({ ${names.join(", ")} })`, sandbox);
}

describe("The membership test that lets the vocabularies stay text", () => {
  it("answers exactly what includes answered, for every kind of value", () => {
    const { vocabularyHas } = lift(["vocabularyHas"]);
    const vocabulary = ["low", "normal", "high", "urgent"];

    for (const value of ["low", "urgent", "nope", "", 0, 1, null, undefined, true, false, [], ["low"], {}, Number.NaN]) {
      assert.equal(vocabularyHas(vocabulary, value), vocabulary.includes(/** @type {never} */ (value)),
        `${JSON.stringify(String(value))} answers the same either way`);
    }
  });

  it("refuses a symbol rather than throwing, as includes did", () => {
    const { vocabularyHas } = lift(["vocabularyHas"]);

    assert.equal(vocabularyHas(["low"], Symbol("low")), false);
  });

  it("answers false for an empty vocabulary, and for a value in none", () => {
    const { vocabularyHas } = lift(["vocabularyHas"]);

    assert.equal(vocabularyHas([], "low"), false);
    assert.equal(vocabularyHas(["low"], "high"), false);
  });
});

describe("The project task defaults", () => {
  /** @returns {Record<string, Function>} */
  function readers() {
    return lift(["vocabularyHas", "parseJsonArray", "normalizeProjectTaskSortOrder", "normalizeProjectTaskDefaults"], {
      taskDefaultPriorities: ["low", "normal", "high", "urgent"],
      taskDefaultStatuses: ["open", "in_progress", "blocked", "complete", "archived"],
      taskDefaultAssigneeModes: ["creator", "project_admin", "unassigned"],
      defaultProjectTaskSortOrder: ["due_date", "priority", "status"],
      JSON,
    });
  }

  it("answers the page's own fallbacks for a record carrying nothing", () => {
    const { normalizeProjectTaskDefaults } = readers();
    const defaults = normalizeProjectTaskDefaults();

    assert.equal(defaults.priority, "normal");
    assert.equal(defaults.status, "open");
    assert.equal(defaults.defaultAssigneeMode, "creator");
    assert.deepEqual([...defaults.sortOrder], ["due_date", "priority", "status"]);
  });

  it("takes either spelling, camelCase first", () => {
    const { normalizeProjectTaskDefaults } = readers();
    const both = normalizeProjectTaskDefaults({
      priority: "high", task_default_priority: "low",
      status: "blocked", task_default_status: "open",
      defaultAssigneeMode: "unassigned", task_default_assignee_mode: "creator",
    });

    assert.equal(both.priority, "high");
    assert.equal(both.status, "blocked");
    assert.equal(both.defaultAssigneeMode, "unassigned");
  });

  it("reaches the third assignee spelling when neither of the first two is present", () => {
    const { normalizeProjectTaskDefaults } = readers();

    assert.equal(normalizeProjectTaskDefaults({ default_assignee_mode: "project_admin" }).defaultAssigneeMode, "project_admin");
    assert.equal(normalizeProjectTaskDefaults({ task_default_assignee_mode: "unassigned" }).defaultAssigneeMode, "unassigned");
  });

  it("falls back for a value outside the vocabulary, whatever kind it is", () => {
    const { normalizeProjectTaskDefaults } = readers();

    for (const priority of ["nonsense", 7, true, [], {}, null]) {
      assert.equal(normalizeProjectTaskDefaults({ priority }).priority, "normal",
        `${JSON.stringify(String(priority))} is not a priority`);
    }
  });
});

describe("The task sort order is always the whole set", () => {
  /** @returns {Record<string, Function>} */
  function readers() {
    return lift(["parseJsonArray", "normalizeProjectTaskSortOrder"], {
      defaultProjectTaskSortOrder: ["due_date", "priority", "status"],
      JSON,
    });
  }

  it("keeps a stored order and appends what it omitted", () => {
    const { normalizeProjectTaskSortOrder } = readers();

    assert.deepEqual([...normalizeProjectTaskSortOrder(["status"])], ["status", "due_date", "priority"]);
    assert.deepEqual([...normalizeProjectTaskSortOrder(["priority", "due_date"])], ["priority", "due_date", "status"]);
  });

  it("drops entries the page does not know, rather than carrying them", () => {
    const { normalizeProjectTaskSortOrder } = readers();
    const ordered = normalizeProjectTaskSortOrder(["invented", "status"]);

    assert.deepEqual([...ordered], ["status", "due_date", "priority"]);
    assert.equal(ordered.length, 3, "and the result is never longer than the vocabulary");
  });

  it("reads a stored JSON array as well as a real one", () => {
    const { normalizeProjectTaskSortOrder } = readers();

    assert.deepEqual([...normalizeProjectTaskSortOrder('["status"]')], ["status", "due_date", "priority"]);
  });

  it("answers the full default order for anything unreadable", () => {
    const { normalizeProjectTaskSortOrder } = readers();

    for (const value of [undefined, null, "", "{not json", 7, {}]) {
      assert.deepEqual([...normalizeProjectTaskSortOrder(value)], ["due_date", "priority", "status"]);
    }
  });
});

describe("The billing readers", () => {
  it("keeps a zero rate as text rather than treating it as absent", () => {
    const { normalizeBillingRate } = lift(["normalizeBillingRate"]);

    // `?? ""` rather than `|| ""`, which is the whole difference for a rate of zero.
    assert.equal(normalizeBillingRate(0), "0");
    assert.equal(normalizeBillingRate("  12.50  "), "12.50");
    assert.equal(normalizeBillingRate(null), null);
    assert.equal(normalizeBillingRate(undefined), null);
    assert.equal(normalizeBillingRate("   "), null);
  });

  it("accepts both spellings of the billable flag on each side", () => {
    const { normalizeBillableFlag } = lift(["normalizeBillableFlag"]);

    assert.equal(normalizeBillableFlag(false), "no");
    assert.equal(normalizeBillableFlag("no"), "no");
    assert.equal(normalizeBillableFlag(true), "yes");
    assert.equal(normalizeBillableFlag("yes"), "yes");
  });

  it("falls to the caller's default for anything else", () => {
    const { normalizeBillableFlag } = lift(["normalizeBillableFlag"]);

    assert.equal(normalizeBillableFlag(undefined), "yes");
    assert.equal(normalizeBillableFlag("maybe"), "yes");
    assert.equal(normalizeBillableFlag(undefined, "no"), "no", "and the default is the caller's to choose");
  });

  it("clamps the billing period start day into a day every month has", () => {
    const { normalizeBillingPeriod } = lift(["normalizeBillingPeriod"]);

    assert.deepEqual({ ...normalizeBillingPeriod({ type: "custom", startDay: 31 }) }, { type: "custom", startDay: 28 });
    assert.deepEqual({ ...normalizeBillingPeriod({ type: "custom", startDay: 0 }) }, { type: "custom", startDay: 1 });
    assert.deepEqual({ ...normalizeBillingPeriod({ type: "custom", startDay: "15" }) }, { type: "custom", startDay: 15 },
      "a textual day reads the same, which is what the template preserves");
  });

  it("forces a calendar month's start day to the first, whatever was stored", () => {
    const { normalizeBillingPeriod } = lift(["normalizeBillingPeriod"]);

    assert.deepEqual({ ...normalizeBillingPeriod({ startDay: 15 }) }, { type: "calendarMonth", startDay: 1 });
    assert.deepEqual({ ...normalizeBillingPeriod() }, { type: "calendarMonth", startDay: 1 });
  });

  it("answers null for a period that inherits", () => {
    const { normalizeOptionalBillingPeriod } = lift(["normalizeBillingPeriod", "normalizeOptionalBillingPeriod"]);

    assert.equal(normalizeOptionalBillingPeriod(null), null);
    assert.equal(normalizeOptionalBillingPeriod({ type: "inherit" }), null);
    assert.notEqual(normalizeOptionalBillingPeriod({ type: "custom", startDay: 3 }), null);
  });
});

describe("The reminder offsets", () => {
  it("keeps up to two positive offsets, in the order given", () => {
    const { normalizeReminderOffsetList } = lift(["normalizeReminderOffsetList"]);

    assert.deepEqual([...normalizeReminderOffsetList([120, 1440, 60], [1])], [120, 1440]);
  });

  it("drops entries that are not finite positive numbers", () => {
    const { normalizeReminderOffsetList } = lift(["normalizeReminderOffsetList"]);

    assert.deepEqual([...normalizeReminderOffsetList([0, -5, "abc", null, 30], [1])], [30]);
  });

  it("reads a textual offset the same as a numeric one, which is what the template preserves", () => {
    const { normalizeReminderOffsetList } = lift(["normalizeReminderOffsetList"]);

    assert.deepEqual([...normalizeReminderOffsetList(["120", 1440], [1])], [120, 1440]);
  });

  it("answers the caller's fallback when nothing survives, and for a non-array", () => {
    const { normalizeReminderOffsetList } = lift(["normalizeReminderOffsetList"]);

    assert.deepEqual([...normalizeReminderOffsetList([], [4320, 1440])], [4320, 1440]);
    assert.deepEqual([...normalizeReminderOffsetList("nope", [4320])], [4320]);
    assert.deepEqual([...normalizeReminderOffsetList([0, -1], [99])], [99]);
  });
});

describe("Reading one module setting", () => {
  /** One settings payload shaped the way the reader walks it. */
  function settings() {
    return {
      moduleSettings: [
        { moduleId: "other", settings: [{ id: "defaultBillingRate", value: "wrong-module" }] },
        { moduleId: "client-projects", settings: [
          { id: "defaultBillingRate", value: "42" },
          { id: "billingPeriodStartDay", value: 0 },
          { id: "emptyText", value: "" },
          { id: "falseFlag", value: false },
          { id: "noValue" },
        ] },
      ],
    };
  }

  it("answers the stored value from the right module", () => {
    const { readModuleSettingValue } = lift(["readModuleSettingValue"], { Object });

    assert.equal(readModuleSettingValue(settings(), "client-projects", "defaultBillingRate", "fallback"), "42");
  });

  /**
   * The distinction that matters: a setting explicitly stored as `0`, `""` or `false` is a real
   * value. Only one that was never written falls back.
   */
  it("keeps a falsy stored value rather than falling back", () => {
    const { readModuleSettingValue } = lift(["readModuleSettingValue"], { Object });

    assert.equal(readModuleSettingValue(settings(), "client-projects", "billingPeriodStartDay", 99), 0);
    assert.equal(readModuleSettingValue(settings(), "client-projects", "emptyText", "fallback"), "");
    assert.equal(readModuleSettingValue(settings(), "client-projects", "falseFlag", true), false);
  });

  it("falls back for a setting with no value, an unknown setting, or an unknown module", () => {
    const { readModuleSettingValue } = lift(["readModuleSettingValue"], { Object });

    assert.equal(readModuleSettingValue(settings(), "client-projects", "noValue", "fallback"), "fallback");
    assert.equal(readModuleSettingValue(settings(), "client-projects", "invented", "fallback"), "fallback");
    assert.equal(readModuleSettingValue(settings(), "no-such-module", "defaultBillingRate", "fallback"), "fallback");
  });

  it("falls back for a payload carrying no module settings at all", () => {
    const { readModuleSettingValue } = lift(["readModuleSettingValue"], { Object });

    assert.equal(readModuleSettingValue(null, "client-projects", "defaultBillingRate", "fallback"), "fallback");
    assert.equal(readModuleSettingValue({}, "client-projects", "defaultBillingRate", "fallback"), "fallback");
  });
});

describe("The cascade this checkpoint measured and did not bank", () => {
  it("leaves the rounding reader untyped, and records why", () => {
    // Declaring it makes the reader's return concrete, which flows through `normalizeData` into
    // the client and project records and meets two consumers the current inference hides.
    const at = source.indexOf("function normalizeBillingRounding(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.doesNotMatch(block, /@param \{[^}]*\} \[?rounding\]?/,
      "the rounding reader is annotated; this deferral is discharged and the pin should go with it");
    assert.match(block, /inference cascade,[\s*]*not a defect/,
      "and the note still distinguishes the cascade from a dropped member");
  });

  it("confirms the member the cascade appeared to be about is genuinely built", () => {
    // `canManage` surfaced in the cascade and is not dropped: the normaliser writes it. Recording
    // that is what keeps the next checkpoint from chasing a defect that is not there.
    assert.match(source, /canManage: client\.can_manage === true,/,
      "the normaliser still builds the capability the cascade named");
  });
});
