import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @typedef {import("../../scripts/test-support/fake-dom.mjs").FakeElement} FakeElement */

/**
 * The values Clients/Projects keeps for its own elements (`0.33.33.43.46`).
 *
 * The tag picker field and the two billing editors used to ride on the elements they built, as
 * `tagPicker`, `billingPeriodEditor` and `billingRoundingEditor`, and `saveClientSettings` read them
 * back by finding those elements again. They now live in page-local `WeakMap`s, written and read at
 * the same points. What these cases pin:
 *
 * 1. **The tag field answers exactly as before** - the stub until the picker mounts, the mounted
 *    picker after, the stub again when mounting answers nothing.
 * 2. **Saving a client reads all three back exactly as before**, in every mount state, including
 *    the pending one where only the stub can answer.
 * 3. **The one difference, which no path reaches:** an element that merely carries the old property
 *    is no longer read. Only these builders set the data attributes the save searches for.
 * 4. **`showDialog` changed only its declared parameter**, and the maps are initialised before the
 *    bootstrap call can reach them.
 *
 * The real builders and `saveClientSettings` run in a fake document, from both the current page and
 * the `4c6a5d33` version; only the record write and its surroundings are stubbed.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "4c6a5d33:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["4c6a5d33", baseline]];

const MAPS = ["tagPickersByField", "billingPeriodEditorsByField", "billingRoundingEditorsByField"];
const LIFTED = [
  "requireNamespace", "requirePageController", "createOption", "mountTagPicker", "createTagPickerField",
  "formatOrdinal", "populateBillingPeriodStartDays", "vocabularyHas",
  "normalizeBillingPeriod", "formatBillingPeriod", "createBillingPeriodEditor",
  "normalizeBillingRounding", "formatBillingRounding", "createBillingRoundingEditor",
  "normalizeBillingRate", "normalizeBillableFlag", "saveClientSettings",
];

/**
 * @typedef {object} PageFunctions
 * @property {(label: string, tags?: unknown[], targetKind?: string) => { element: FakeElement, readTagIds: () => unknown }} createTagPickerField
 * @property {(options: object) => { element: FakeElement, getValue: () => unknown }} createBillingPeriodEditor
 * @property {(options: object) => { element: FakeElement, getValue: () => unknown }} createBillingRoundingEditor
 * @property {(client: object, container: unknown, options?: object) => Promise<unknown>} saveClientSettings
 */

/**
 * One version of the page's tag field, billing editors and client save, lifted into a sandbox.
 * @param {string} text
 * @param {{ mountPicker?: () => Promise<unknown> }} [options]
 */
function pageFrom(text, options = {}) {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const saved = [];
  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: {
      LongtailForge: {
        pageController: {
          /** @param {unknown} value @param {unknown} label */
          createOption(value, label) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = label === undefined ? "" : String(label);
            return option;
          },
        },
        tags: options.mountPicker ? { mountPicker: options.mountPicker } : {},
      },
    },
    tagOptions: [],
    setStatus: () => undefined,
    // The save's audit details format the effective billing values; they only reach the stubbed
    // write, so the two resolvers answer the record's own values or the workspace defaults.
    /** @param {{ billing_period?: unknown }} client */
    getEffectiveClientBillingPeriod: (client) => client.billing_period || { type: "calendarMonth", startDay: 1 },
    /** @param {{ billing_rounding?: unknown }} client */
    getEffectiveClientBillingRounding: (client) => client.billing_rounding || { enabled: false, increment: "nearestQuarterHour" },
    requireModalDialogs: () => ({ confirm: async () => true }),
    /** @param {unknown} client */
    saveClientRecord: async (client) => {
      saved.push(JSON.parse(JSON.stringify(client)));
      return true;
    },
  });
  for (const name of MAPS) {
    const at = text.indexOf(`  const ${name} = `);
    if (at !== -1) {
      vm.runInContext(text.slice(at, text.indexOf(";", at) + 1), sandbox);
    }
  }
  for (const name of LIFTED) {
    vm.runInContext(extractFunctionBlock(text, name), sandbox);
  }
  /** @type {PageFunctions} */
  const page = vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
  return { document, saved, page };
}

/** A mount the test settles by hand. */
function controlledMount() {
  /** @type {(value: unknown) => void} */
  let settle = () => undefined;
  const mountPicker = () => new Promise((resolve) => { settle = resolve; });
  return { mountPicker, settle: (/** @type {unknown} */ value) => settle(value) };
}

const flush = () => setImmediate();
const MOUNTED = { readTagIds: () => ["tag-a", "tag-b"] };

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

describe("The tag field answers exactly as before", () => {
  it("answers the stub, then the mounted picker, and the stub again when mounting answers nothing", async () => {
    /** @type {Record<string, unknown>} */
    const byVersion = {};
    for (const [version, text] of VERSIONS) {
      const answers = [];
      for (const outcome of [MOUNTED, null]) {
        const mount = controlledMount();
        const { page } = pageFrom(text, { mountPicker: mount.mountPicker });
        const field = page.createTagPickerField("Client Tags", [], "client");
        answers.push(plain(field.readTagIds()));
        mount.settle(outcome);
        await flush();
        answers.push(plain(field.readTagIds()));
      }
      const { page } = pageFrom(text);
      const unmounted = page.createTagPickerField("Client Tags", [], "client");
      answers.push(plain(unmounted.readTagIds()), unmounted.element.hidden);
      byVersion[version] = answers;
    }
    assert.deepEqual(byVersion.current, byVersion["4c6a5d33"]);
    assert.deepEqual(byVersion.current, [[], ["tag-a", "tag-b"], [], [], [], true]);
  });

  it("no longer leaves the value on the element", () => {
    const [currentField, baselineField] = VERSIONS.map(([, text]) => pageFrom(text).page.createTagPickerField("Client Tags", [], "client"));
    assert.equal(Object.hasOwn(currentField.element, "tagPicker"), false);
    assert.equal(Object.hasOwn(baselineField.element, "tagPicker"), true, "the replaced version wrote it there");

    const [currentPeriod, baselinePeriod] = VERSIONS.map(([, text]) => pageFrom(text).page.createBillingPeriodEditor({
      legend: "Billing Period", inheritLabel: "Inherit", value: null, inheritedPeriod: { type: "calendarMonth", startDay: 1 },
    }));
    assert.equal(Object.hasOwn(currentPeriod.element, "billingPeriodEditor"), false);
    assert.equal(Object.hasOwn(baselinePeriod.element, "billingPeriodEditor"), true);
  });
});

describe("Saving a client reads all three values back exactly as before", () => {
  /**
   * One client editor built from a version's own builders, then saved.
   * @param {string} text
   * @param {"pending" | "mounted" | "null" | "no-field"} tagState
   */
  async function saveFrom(text, tagState) {
    const mount = controlledMount();
    const { document, saved, page } = pageFrom(text, { mountPicker: mount.mountPicker });
    const container = document.createElement("div");
    const nameInput = document.createElement("input");
    nameInput.dataset.clientNameInput = "c1";
    nameInput.value = "Acme Renamed";
    const rateInput = document.createElement("input");
    rateInput.dataset.clientBillingRateInput = "c1";
    rateInput.value = "150";
    const billableInput = document.createElement("input");
    billableInput.dataset.clientBillableInput = "c1";
    billableInput.checked = true;
    container.append(nameInput, rateInput, billableInput);
    if (tagState !== "no-field") {
      container.append(page.createTagPickerField("Client Tags", [], "client").element);
    }
    container.append(
      page.createBillingPeriodEditor({
        legend: "Billing Period", inheritLabel: "Inherit", value: { type: "custom", startDay: 15 },
        inheritedPeriod: { type: "calendarMonth", startDay: 1 },
      }).element,
      page.createBillingRoundingEditor({
        legend: "Rounding", inheritLabel: "Inherit", value: { enabled: true, increment: "nearestHalfHour" },
        inheritedRounding: { enabled: false, increment: "nearestQuarterHour" },
      }).element,
    );
    if (tagState === "mounted" || tagState === "null") {
      mount.settle(tagState === "mounted" ? MOUNTED : null);
      await flush();
    }

    const client = {
      id: "c1", name: "Acme", status: "Active", parent_client_id: "", billing_contact: {},
      billing_rate: null, billable: "no", billing_period: null, billing_rounding: null, tags: [], tagIds: ["stale"],
    };
    await page.saveClientSettings(client, container, {});
    assert.equal(saved.length, 1, "the save reached the record write");
    return saved[0];
  }

  it("in every tag-picker state, with both billing editors", async () => {
    for (const tagState of /** @type {const} */ (["pending", "mounted", "null", "no-field"])) {
      const [currentSave, baselineSave] = await Promise.all(VERSIONS.map(([, text]) => saveFrom(text, tagState)));
      assert.deepEqual(currentSave, baselineSave, `${tagState}: the same record is written`);
    }

    const written = {
      pending: await saveFrom(current, "pending"),
      mounted: await saveFrom(current, "mounted"),
      null: await saveFrom(current, "null"),
      "no-field": await saveFrom(current, "no-field"),
    };
    assert.deepEqual(Reflect.get(Object(written.pending), "tagIds"), [], "a pending picker answers through its stub");
    assert.deepEqual(Reflect.get(Object(written.mounted), "tagIds"), ["tag-a", "tag-b"]);
    assert.deepEqual(Reflect.get(Object(written.null), "tagIds"), [], "a picker that mounted nothing keeps its stub");
    assert.equal(Object.hasOwn(Object(written["no-field"]), "tagIds"), false, "no tag field deletes the payload");
    assert.deepEqual(Reflect.get(Object(written.mounted), "billing_period"), { type: "custom", startDay: 15 });
    assert.deepEqual(Reflect.get(Object(written.mounted), "billing_rounding"), { enabled: true, increment: "nearestHalfHour" });
  });

  it("names its one difference: an element that merely carries the old property is not read", async () => {
    // Unreachable: only these builders set the attributes the save searches for, and nothing
    // outside this file ever read or wrote the properties. Recorded rather than hidden.
    for (const [version, text, expected] of /** @type {const} */ ([
      ["current", current, { tagIds: false, period: null }],
      ["4c6a5d33", baseline, { tagIds: true, period: "imitation" }],
    ])) {
      const { document, saved, page } = pageFrom(text);
      const container = document.createElement("div");
      const nameInput = document.createElement("input");
      nameInput.dataset.clientNameInput = "c1";
      nameInput.value = "Acme";
      const rateInput = document.createElement("input");
      rateInput.dataset.clientBillingRateInput = "c1";
      const billableInput = document.createElement("input");
      billableInput.dataset.clientBillableInput = "c1";
      const tagField = document.createElement("div");
      tagField.dataset.clientTags = "";
      Object.defineProperty(tagField, "tagPicker", { value: { readTagIds: () => ["imitation"] } });
      const periodField = document.createElement("fieldset");
      periodField.dataset.billingPeriodEditor = "";
      Object.defineProperty(periodField, "billingPeriodEditor", { value: { getValue: () => "imitation" } });
      container.append(nameInput, rateInput, billableInput, tagField, periodField);

      await page.saveClientSettings({ id: "c1", name: "Acme", billing_contact: {}, billing_period: null }, container, {});
      const record = Object(saved[0]);
      assert.equal(Object.hasOwn(record, "tagIds"), expected.tagIds, `${version}: tag field`);
      assert.equal(Reflect.get(record, "billing_period"), expected.period, `${version}: billing period`);
    }
  });
});

describe("What else moved", () => {
  it("changes only showDialog's declared parameter", () => {
    assert.equal(extractFunctionBlock(current, "showDialog"), extractFunctionBlock(baseline, "showDialog"),
      "the body, and so all three opening branches, is unchanged");
    assert.match(current, /@param \{HTMLDialogElement\} dialog\n {3}\* @param \{HTMLElement \| null\} \[focusTarget\]\n {3}\*\/\n {2}function showDialog\(/);
  });

  it("initialises the maps before the bootstrap call can reach them", () => {
    const bootstrap = current.indexOf("\n  initializeClientProjectsPage();\n");
    assert.notEqual(bootstrap, -1);
    for (const name of MAPS) {
      const at = current.indexOf(`\n  const ${name} = new WeakMap();\n`);
      assert.ok(at !== -1 && at < bootstrap, `${name} is declared above the bootstrap call`);
    }
  });
});
