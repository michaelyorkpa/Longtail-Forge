/* global document */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The record sinks state their conversions (`0.33.33.43.58`, operator-approved).
 *
 * Each sink the record fields reach used to hand the platform the raw value and now hands it the
 * value converted by the approved rule for that operation. The claim is proved on real Chromium
 * controls, because a fake DOM does not model the setters' own conversions:
 *
 * | Operation | Rule |
 * |---|---|
 * | `encodeURIComponent` | `` encodeURIComponent(`${v}`) `` |
 * | `dataset` write | `` `${v}` `` |
 * | `select.value` | `` `${v}` `` |
 * | `textContent` | `` `${v ?? ""}` `` |
 * | `HTMLInputElement.value` | `` v === null ? "" : `${v}` `` |
 *
 * For every probe, the two writes leave the control in the same state, call conversion hooks the
 * same number of times, and fail - when they fail - with the same kind of error, the hook's own
 * error staying that very error. The one wording difference is the setter's context prefix on a
 * conversion failure, which the operator approved. Then two real page functions run from both
 * versions, to show the page's own call sites write the same DOM.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "1c78eaf0:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** The rule each operation now states, as shipped at its sites. */
const SHIPPED_RULES = [
  "summary.textContent = `${client.name ?? \"\"}`;",
  "input.value = clientName === null ? \"\" : `${clientName}`;",
  "nameInput.value = projectName === null ? \"\" : `${projectName}`;",
  "select.value = `${client.parent_client_id || \"\"}`;",
  "input.dataset.clientNameInput = `${client.id}`;",
  "`/api/projects/${encodeURIComponent(`${project.id}`)}`,",
];

/**
 * @typedef {{ state?: unknown, threw?: string, message?: string, hookError?: boolean, stateAfter?: unknown, calls: string[] }} WriteOutcome
 * @typedef {{ sink: string, probe: string, original: WriteOutcome, rule: WriteOutcome }} SinkComparison
 */

test("each sink's stated conversion writes what its setter wrote, on native controls", async ({ page }) => {
  for (const rule of SHIPPED_RULES) expect(source, rule).toContain(rule);

  /** @type {SinkComparison[]} */
  const comparisons = await page.evaluate(() => {
    const hookError = new RangeError("the conversion hook refused");
    /** @type {string[]} */
    let calls = [];
    /** @type {Array<[string, () => unknown]>} */
    const probes = [
      ["an id", () => "c-1"], ["empty text", () => ""], ["whitespace", () => "  spaced  "], ["the text null", () => "null"],
      ["zero", () => 0], ["negative zero", () => -0], ["a number", () => 7], ["NaN", () => Number.NaN],
      ["true", () => true], ["false", () => false], ["null", () => null], ["undefined", () => undefined],
      ["a bigint", () => BigInt(10)], ["an array", () => [1, 2]], ["an empty array", () => []], ["an object", () => ({})],
      ["a toString object", () => ({ toString() { calls.push("toString"); return "custom"; } })],
      ["a valueOf object", () => ({
        valueOf() { calls.push("valueOf"); return 5; },
        toString() { calls.push("toString"); return "text"; },
      })],
      ["a Symbol", () => Symbol("id")],
      ["a null-prototype object", () => Object.create(null)],
      ["a throwing hook", () => ({ toString() { calls.push("toString"); throw hookError; } })],
      ["a primitive-refusing hook", () => ({ [Symbol.toPrimitive]() { calls.push("toPrimitive"); return {}; } })],
    ];
    const selectOptions = [
      "before", "c-1", "", "  spaced  ", "null", "0", "7", "NaN", "true", "false", "undefined", "10", "1,2",
      "[object Object]", "custom", "text",
    ];

    /**
     * @typedef {{
     *   setup: () => unknown,
     *   state: (target: unknown, answer?: unknown) => unknown,
     *   original: (target: unknown, value: unknown) => unknown,
     *   rule: (target: unknown, value: unknown) => unknown,
     * }} Sink
     */
    /** @param {unknown} target */
    const element = (target) => /** @type {HTMLElement} */ (target);
    /** @type {Record<string, Sink>} */
    const sinks = {
      textContent: {
        setup: () => { const span = document.createElement("span"); span.textContent = "before"; return span; },
        state: (target) => element(target).textContent,
        original: (target, value) => Reflect.set(element(target), "textContent", value),
        rule: (target, value) => { element(target).textContent = `${value ?? ""}`; },
      },
      "input value": {
        setup: () => { const input = document.createElement("input"); input.value = "before"; return input; },
        state: (target) => /** @type {HTMLInputElement} */ (target).value,
        original: (target, value) => Reflect.set(element(target), "value", value),
        rule: (target, value) => { /** @type {HTMLInputElement} */ (target).value = value === null ? "" : `${value}`; },
      },
      "select value": {
        setup: () => {
          const select = document.createElement("select");
          for (const optionValue of selectOptions) {
            const option = document.createElement("option");
            option.value = optionValue;
            select.append(option);
          }
          select.value = "before";
          return select;
        },
        state: (target) => {
          const select = /** @type {HTMLSelectElement} */ (target);
          return [select.value, select.selectedIndex];
        },
        original: (target, value) => Reflect.set(element(target), "value", value),
        rule: (target, value) => { /** @type {HTMLSelectElement} */ (target).value = `${value}`; },
      },
      dataset: {
        setup: () => { const div = document.createElement("div"); div.dataset.probe = "before"; return div; },
        state: (target) => [element(target).dataset.probe, element(target).getAttribute("data-probe")],
        original: (target, value) => Reflect.set(element(target).dataset, "probe", value),
        rule: (target, value) => { element(target).dataset.probe = `${value}`; },
      },
      encodeURIComponent: {
        setup: () => null,
        state: (_target, answer) => answer,
        original: (_target, value) => Reflect.apply(encodeURIComponent, undefined, [value]),
        rule: (_target, value) => encodeURIComponent(`${value}`),
      },
    };

    /** @param {Sink} sink @param {(target: unknown, value: unknown) => unknown} write @param {() => unknown} make */
    const run = (sink, write, make) => {
      const target = sink.setup();
      const value = make();
      calls = [];
      try {
        const answer = write(target, value);
        return { state: sink.state(target, answer), calls };
      } catch (error) {
        return {
          threw: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          hookError: error === hookError,
          stateAfter: sink.state(target),
          calls,
        };
      }
    };

    return Object.entries(sinks).flatMap(([name, sink]) => probes.map(([probe, make]) => ({
      sink: name,
      probe,
      original: run(sink, sink.original, make),
      rule: run(sink, sink.rule, make),
    })));
  });

  expect(comparisons).toHaveLength(5 * 22);
  /** @type {string[]} */
  const wordingDifferences = [];
  for (const { sink, probe, original, rule } of comparisons) {
    const label = `${sink}: ${probe}`;
    expect(rule.threw, `${label} fails in the same way`).toBe(original.threw);
    expect(rule.calls, `${label} converts through the same hooks`).toEqual(original.calls);
    if (original.threw === undefined) {
      expect(rule.state, label).toEqual(original.state);
      continue;
    }
    expect(rule.stateAfter, `${label} leaves the control as it was`).toEqual(original.stateAfter);
    expect(rule.hookError, `${label} lets the hook's own error through`).toBe(original.hookError);
    if (rule.message !== original.message) {
      // The approved difference: the setter prefixes its own context to the same conversion error.
      expect(original.message, label).toMatch(new RegExp(`${String(rule.message).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      wordingDifferences.push(label);
    }
  }
  const find = (/** @type {string} */ sink, /** @type {string} */ probe) => comparisons.find((entry) => entry.sink === sink && entry.probe === probe);
  // Each operation's own treatment of null and undefined, which each rule reproduces.
  expect(find("textContent", "null")?.rule.state).toBe("");
  expect(find("textContent", "undefined")?.rule.state).toBe("");
  expect(find("input value", "null")?.rule.state).toBe("");
  expect(find("input value", "undefined")?.rule.state).toBe("undefined");
  expect(find("select value", "null")?.rule.state).toEqual(["null", 4]);
  expect(find("select value", "undefined")?.rule.state).toEqual(["undefined", 10]);
  expect(find("select value", "an object")?.rule.state).toEqual(["[object Object]", 13]);
  expect(find("dataset", "null")?.rule.state).toEqual(["null", "null"]);
  expect(find("encodeURIComponent", "null")?.rule.state).toBe("null");
  expect(find("dataset", "a throwing hook")?.rule.hookError).toBe(true);
  // Only conversion failures differ in wording, and only at the setters.
  expect(wordingDifferences.every((label) => /Symbol|null-prototype|primitive-refusing/.test(label))).toBe(true);
  expect(wordingDifferences.some((label) => label.startsWith("encodeURIComponent"))).toBe(false);
});

test("the page's own call sites write the same DOM from both versions", async ({ page }) => {
  const functions = {
    current: [extractFunctionBlock(source, "createAddProjectSubmitButton"), extractFunctionBlock(source, "createRelatedProjectNameCell")],
    baseline: [extractFunctionBlock(baseline, "createAddProjectSubmitButton"), extractFunctionBlock(baseline, "createRelatedProjectNameCell")],
  };
  expect(functions.current[0]).not.toBe(functions.baseline[0]);
  expect(functions.current[1]).not.toBe(functions.baseline[1]);

  const results = await page.evaluate((versions) => {
    /** @type {Array<[string, () => unknown]>} */
    const probes = [
      ["an id", () => "c-1"], ["whitespace", () => "  spaced  "], ["empty text", () => ""], ["a number", () => 7],
      ["zero", () => 0], ["null", () => null], ["undefined", () => undefined], ["an object", () => ({ toString: () => "custom" })],
      ["a Symbol", () => Symbol("id")],
    ];
    /** @param {string[]} blocks */
    const load = (blocks) => {
      const appendTagChips = () => undefined;
      return new Function("appendTagChips", `${blocks.join("\n")}\nreturn { createAddProjectSubmitButton, createRelatedProjectNameCell };`)(appendTagChips);
    };
    /** @param {() => Element} build @param {(built: Element) => unknown} read */
    const attempt = (build, read) => {
      try {
        return { state: read(build()) };
      } catch (error) {
        return { threw: error instanceof Error ? error.constructor.name : typeof error };
      }
    };
    return Object.fromEntries(Object.entries(versions).map(([version, blocks]) => {
      const shipped = load(blocks);
      return [version, probes.map(([probe, make]) => ({
        probe,
        button: attempt(() => shipped.createAddProjectSubmitButton(make()), (built) => /** @type {HTMLElement} */ (built).dataset.addProjectButton),
        nameCell: attempt(() => shipped.createRelatedProjectNameCell({ name: make(), project: { tags: [] } }), (built) => built.textContent),
      }))];
    }));
  }, functions);

  expect(results.current).toEqual(results.baseline);
  expect(results.current.find((entry) => entry.probe === "null")).toEqual({
    probe: "null", button: { state: "null" }, nameCell: { state: "" },
  });
});
