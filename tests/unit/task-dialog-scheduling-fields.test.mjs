import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/task-dialog.js");
function fixture() {
  const fields = Object.fromEntries(["recurring", "recurrenceDetails", "recurrenceSummary", "reminderOverride", "reminderOverrideFields", "reminderDateTimeHours1", "reminderDateTimeHours2", "reminderDateTimeHours2Enabled", "reminderDateOnlyDays1", "reminderDateOnlyDays2", "reminderDateOnlyDays2Enabled", "effectiveReminders"].map((name) => [name, {}]));
  const f = vm.createContext({ fields, recurrenceDraft: {}, recurrenceDialog: {}, closeTaskModal() {} });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "writeTaskControl", "defaultRecurrenceDraft", "writeRecurrenceFields", "updateRecurrenceState", "formatRecurrenceSummary", "recurrenceCadenceLabel", "writeReminderFields", "normalizeReminderPolicy", "normalizeOffsetList", "formatOffsetList", "updateReminderOverrideState", "updateSecondaryReminderState", "readPositiveInteger", "saveRecurrenceDraft", "readRecurrencePayload", "readReminderPolicy"])
    vm.runInContext(extractFunctionBlock(source, name), f);
  return f;
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task scheduling field consumption", () => {
  it("retains nullish and primitive recurrence defaults and the original falsy rules", () => {
    const f = fixture();
    for (const value of [undefined, null, false, 0, "", "text", Symbol("seed")]) {
      f.writeRecurrenceFields(value);
      assert.deepEqual(plain(f.recurrenceDraft), { enabled: false, frequency: "WEEKLY", interval: 1, endDate: "" });
      assert.equal(f.fields.recurrenceSummary.textContent, "Not recurring.");
      assert.equal(f.fields.recurrenceDetails.disabled, true);
    }
    f.writeRecurrenceFields({ enabled: "yes", frequency: "MONTHLY", interval: "2tail", endDate: "", end_date: "2030-10-01" });
    assert.equal(f.fields.recurrenceSummary.textContent, "Every 2 months until 2030-10-01.");
    assert.equal(f.fields.recurrenceDetails.disabled, false);
    f.writeRecurrenceFields({ enabled: true, interval: -2 });
    assert.equal(f.recurrenceDraft.interval, -2);
  });

  it("preserves inherited recurrence getter receivers, read order and string-hint coercion", () => {
    const f = fixture();
    /** @type {string[]} */
    const log = [];
    const interval = { [Symbol.toPrimitive](/** @type {string} */ hint) { log.push(hint); return "3rest"; } };
    const details = Object.create(Object.fromEntries(["enabled", "frequency", "interval", "endDate", "end_date"].map((name) => [name, null])));
    for (const [name, value] of Object.entries({ enabled: true, frequency: "WEEKDAYS", interval, endDate: "", end_date: "2031-01-01" }))
      Object.defineProperty(Object.getPrototypeOf(details), name, { get() { assert.equal(this, details); log.push(name); return value; } });
    f.writeRecurrenceFields(details);
    assert.deepEqual(log, ["enabled", "frequency", "interval", "string", "endDate", "end_date"]);
    assert.equal(f.fields.recurrenceSummary.textContent, "Every 3 weekdays until 2031-01-01.");
  });

  it("does not publish a partial recurrence draft when interval coercion fails", () => {
    const f = fixture(); const previous = { enabled: false }; f.recurrenceDraft = previous;
    f.fields.recurring.checked = "untouched";
    assert.throws(() => f.writeRecurrenceFields({ enabled: true, interval: Symbol("bad") }), { name: "TypeError" });
    assert.equal(f.recurrenceDraft, previous);
    assert.equal(f.fields.recurring.checked, "untouched");
  });

  it("keeps all cadence variants and the existing fallback", () => {
    const f = fixture();
    for (const [frequency, expected] of [["DAILY", "days"], ["WEEKLY", "weeks"], ["MONTHLY", "months"], ["WEEKDAYS", "weekdays"], ["WEEKENDS", "weekend days"], ["OTHER", "weeks"]])
      assert.equal(f.recurrenceCadenceLabel(frequency, 2), `Every 2 ${expected}`);
    assert.equal(f.recurrenceCadenceLabel("WEEKDAYS", 1), "Every weekday");
    assert.equal(f.recurrenceCadenceLabel("WEEKENDS", 1), "Every weekend day");
    assert.equal(f.formatRecurrenceSummary({ frequency: "monthly", interval: 1, endDate: "" }), "Every month.");
  });

  it("normalizes offset arrays without sorting, deduplicating or consuming non-arrays", () => {
    const f = fixture();
    assert.deepEqual(plain(f.normalizeOffsetList([0, -1, "bad", "120x", 120, 240], [1])), [120, 120]);
    const fallback = [120, 1440]; const result = f.normalizeOffsetList(new Set([60]), fallback);
    assert.deepEqual(plain(result), fallback); assert.notEqual(result, fallback);
    assert.throws(() => f.normalizeOffsetList([Symbol("bad")], fallback), { name: "TypeError" });
    assert.equal(f.formatOffsetList([120, 1500], "hours"), "2h, 25h");
    assert.equal(f.formatOffsetList([4320, 1440], "days"), "3d, 1d");
  });

  it("keeps reminder policy alias precedence and required-null failure", () => {
    const f = fixture();
    assert.deepEqual(plain(f.normalizeReminderPolicy({ dateTime: [], date_time: [60], dateOnly: null, date_only: [2880] })), { dateTime: [120, 1440], dateOnly: [2880] });
    for (const value of [undefined, false, 0, "", Symbol("empty")])
      assert.deepEqual(plain(f.normalizeReminderPolicy(value)), { dateTime: [120, 1440], dateOnly: [4320, 1440] });
    assert.throws(() => f.normalizeReminderPolicy(null), { name: "TypeError", message: "Task detail projection is unavailable." });
  });

  it("hydrates saved overrides, independently disables secondary offsets and retains effective text", () => {
    const f = fixture();
    f.writeReminderFields({ overrideEnabled: true, taskPolicy: { dateTime: [180], dateOnly: [2880, 1440] }, effectivePolicy: { offsets: { dateTime: [60, 120], dateOnly: [4320] } } });
    assert.equal(f.fields.reminderOverride.checked, true);
    assert.equal(f.fields.reminderOverrideFields.hidden, false);
    assert.equal(f.fields.reminderDateTimeHours1.value, "3");
    assert.equal(f.fields.reminderDateTimeHours2Enabled.checked, false);
    assert.equal(f.fields.reminderDateTimeHours2.disabled, true);
    assert.equal(f.fields.reminderDateOnlyDays2Enabled.checked, true);
    assert.equal(f.fields.reminderDateOnlyDays2.disabled, false);
    assert.deepEqual(plain(f.readReminderPolicy()), { dateTime: [180], dateOnly: [2880, 1440] });
    assert.equal(f.fields.effectiveReminders.textContent, "Effective: timed 1h, 2h; date-only 3d.");
  });

  it("keeps repeated inherited effective-policy reads and ignores unused task policy", () => {
    const f = fixture();
    /** @type {string[]} */
    const log = []; let reads = 0;
    const details = Object.create({
      get overrideEnabled() { assert.equal(this, details); log.push("override"); return false; },
      get taskPolicy() { throw new Error("unused"); },
      get effectivePolicy() { assert.equal(this, details); log.push("effective"); const minutes = ++reads * 60; const policy = { get offsets() { assert.equal(this, policy); log.push("offsets"); return { dateTime: [minutes], dateOnly: [1440] }; } }; return policy; },
    });
    f.writeReminderFields(details);
    assert.deepEqual(log, ["override", "effective", "offsets", "effective", "offsets", "override"]);
    assert.equal(f.fields.reminderDateTimeHours1.value, "1");
    assert.equal(f.fields.effectiveReminders.textContent, "Effective: timed 2h; date-only 1d.");
  });

  it("keeps absent reminder detail defaults and fails before field writes on malformed offsets", () => {
    const f = fixture();
    for (const detail of [undefined, null, false, 7, "text", { effectivePolicy: 9 }]) {
      f.writeReminderFields(detail);
      assert.equal(f.fields.reminderOverride.checked, false);
      assert.equal(f.fields.reminderOverrideFields.hidden, true);
      assert.equal(f.fields.reminderDateTimeHours1.value, "2");
    }
    f.fields.reminderOverride.checked = "untouched";
    assert.throws(() => f.writeReminderFields({ overrideEnabled: true, taskPolicy: { dateTime: [Symbol("bad")] } }), { name: "TypeError" });
    assert.equal(f.fields.reminderOverride.checked, "untouched");
  });

  it("keeps draft save prevention, opaque field values, update-before-close and payload identity", () => {
    const f = fixture();
    /** @type {string[]} */
    const log = []; const frequency = { toString: () => "WEEKLY" }; const endDate = { toString: () => "2030-01-01" };
    f.fields.recurring.checked = "enabled";
    f.fields.recurrence = { frequency: { value: frequency }, interval: { value: "4" }, endDate: { value: endDate } };
    f.updateRecurrenceState = () => log.push("update");
    f.closeTaskModal = (/** @type {unknown} */ dialog, /** @type {unknown} */ reason) => { assert.equal(dialog, f.recurrenceDialog); assert.equal(reason, "saved"); log.push("close"); };
    f.saveRecurrenceDraft({ preventDefault() { log.push("prevent"); } });
    assert.deepEqual(log, ["prevent", "update", "close"]);
    assert.equal(f.recurrenceDraft.frequency, frequency); assert.equal(f.recurrenceDraft.endDate, endDate);
    assert.deepEqual(plain(f.readRecurrencePayload()), { enabled: true, applyTo: "instance", frequency: {}, interval: 4, endDate: {} });
  });
});
