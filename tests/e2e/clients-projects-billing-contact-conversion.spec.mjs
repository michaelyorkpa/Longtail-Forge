/* global document */
import { expect, test } from "@playwright/test";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The billing-contact input write states its conversion (`0.33.33.43.55`, operator-approved).
 *
 * `createBillingContactEditor` used to write `input.value = client.billing_contact[fieldName]` and
 * now writes the same value through a template. The claim is proved on real native inputs, after
 * the page's real `normalizeBillingContact` has run, because a fake DOM does not model the `value`
 * setter's own conversion. Three groups are kept apart:
 *
 * 1. **Producer values** - what the normaliser can hand the write - display, convert and trim
 *    identically.
 * 2. **Synthetic probes** - conversion hooks, a throwing hook and a Symbol, which no producer yields -
 *    convert through the same hint the same number of times, and a failure stays a synchronous
 *    `TypeError` or the hook's own error, leaving the input as it was. The only measured wording
 *    difference is the setter's context prefix, which the operator authorised for this conversion.
 * 3. **Raw `null` fed around the normaliser** is not equivalent - the setter writes `""` and the
 *    template writes `"null"` - and is recorded as such. The normaliser turns every falsy value into
 *    `""`, so no path reaches it.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");
const fieldsAt = source.indexOf("  const billingContactFields = [");
const FIELDS_DECLARATION = source.slice(fieldsAt, source.indexOf("];", fieldsAt) + 2);
// `0.33.33.43.58` reads each contact field through the page's wire reader, so the reader is shipped
// alongside the normaliser it serves.
const NORMALIZER = `${extractFunctionBlock(source, "readWireMember")}\n${extractFunctionBlock(source, "normalizeBillingContact")}`;

test("the contact write converts exactly as the input setter did, on real inputs", async ({ page }) => {
  expect(fieldsAt).toBeGreaterThan(-1);
  expect(source).toContain("      input.value = `${client.billing_contact[fieldName]}`;");

  const result = await page.evaluate(({ fieldsDeclaration, normalizer }) => {
    // The page's own normaliser and field list, taken from the shipped source.
    const shipped = new Function(`${fieldsDeclaration}\n${normalizer}\nreturn { normalizeBillingContact, billingContactFields };`)();
    /** @type {(contact: unknown) => Record<string, unknown>} */
    const normalizeBillingContact = shipped.normalizeBillingContact;
    /** @type {[string, string][]} */
    const billingContactFields = shipped.billingContactFields;

    /** @param {(input: HTMLInputElement) => void} write */
    const attempt = (write) => {
      const input = document.createElement("input");
      input.value = "before";
      try {
        write(input);
        return { value: input.value, trimmed: input.value.trim() };
      } catch (error) {
        return {
          threw: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          valueAfter: input.value,
        };
      }
    };
    /** @param {unknown} value */
    const bothWrites = (value) => ({
      // The original untyped write: the element's own `value` setter, with the element as receiver.
      original: attempt((input) => { Reflect.set(input, "value", value); }),
      template: attempt((input) => { input.value = `${value}`; }),
    });

    const producerContacts = [
      { name: "Ada Lovelace", email: "ada@example.com", phone: "555 0100" },
      { name: "  padded  ", email: "\tspaced@example.com\n" },
      {},
      { name: null, email: undefined, phone: 0, address: false, city: "", zip: Number.NaN },
      { name: 42, phone: 5550100, email: -0 },
      { name: true },
      { address: ["1 Main St", "Suite 2"] },
      { name: { first: "Ada" } },
    ];
    const producer = producerContacts.map((raw) => {
      const normalized = normalizeBillingContact(raw);
      return billingContactFields.map(([fieldName]) => ({ fieldName, ...bothWrites(normalized[fieldName]) }));
    });

    /** @param {string} name */
    const hooked = (name) => {
      /** @type {unknown[]} */
      const calls = [];
      const value = {
        [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`${name}:${hint}`); return `${name}-converted`; },
      };
      return { value, calls };
    };
    const synthetic = {
      toPrimitive: (() => {
        const a = hooked("a"); const b = hooked("b");
        return { original: attempt((input) => { Reflect.set(input, "value", a.value); }), template: attempt((input) => { input.value = `${b.value}`; }), calls: [a.calls, b.calls] };
      })(),
      toStringAndValueOf: (() => {
        /** @type {string[]} */ const calls = [];
        const make = () => ({ toString() { calls.push("toString"); return "text"; }, valueOf() { calls.push("valueOf"); return 7; } });
        const original = attempt((input) => { Reflect.set(input, "value", make()); });
        const originalCalls = calls.splice(0);
        const template = attempt((input) => { input.value = `${make()}`; });
        return { original, template, calls: [originalCalls, calls.splice(0)] };
      })(),
      throwingHook: bothWrites({ toString() { throw new RangeError("hook refused"); } }),
      symbol: bothWrites(Symbol("contact")),
    };
    const rawNullAroundTheNormalizer = bothWrites(null);
    return { producer, synthetic, rawNullAroundTheNormalizer };
  }, { fieldsDeclaration: FIELDS_DECLARATION, normalizer: NORMALIZER });

  // 1. Producer values: identical display and identical trimmed save value, field by field.
  for (const contact of result.producer) {
    for (const field of contact) {
      expect(field.template, `${field.fieldName}`).toEqual(field.original);
      expect(field.original).not.toHaveProperty("threw");
    }
  }

  // 2. Synthetic probes.
  expect(result.synthetic.toPrimitive.original).toEqual({ value: "a-converted", trimmed: "a-converted" });
  expect(result.synthetic.toPrimitive.template).toEqual({ value: "b-converted", trimmed: "b-converted" });
  expect(result.synthetic.toPrimitive.calls, "one conversion each, with the string hint").toEqual([["a:string"], ["b:string"]]);
  expect(result.synthetic.toStringAndValueOf.template).toEqual(result.synthetic.toStringAndValueOf.original);
  expect(result.synthetic.toStringAndValueOf.calls, "toString first, once, in both").toEqual([["toString"], ["toString"]]);
  expect(result.synthetic.throwingHook.template, "a hook's own error propagates unchanged").toEqual(result.synthetic.throwingHook.original);
  expect(result.synthetic.throwingHook.original).toMatchObject({ threw: "RangeError", message: "hook refused", valueAfter: "before" });

  const { original: symbolOriginal, template: symbolTemplate } = result.synthetic.symbol;
  expect(symbolOriginal).toMatchObject({ threw: "TypeError", valueAfter: "before" });
  expect(symbolTemplate).toMatchObject({ threw: "TypeError", valueAfter: "before" });
  // The measured wording: the template's message is the setter's without its context prefix. Any
  // prefix is allowed; the rest must be the same message, and neither write may succeed.
  expect(String(symbolOriginal.message).endsWith(String(symbolTemplate.message)), `${symbolOriginal.message} / ${symbolTemplate.message}`).toBe(true);
  test.info().annotations.push({ type: "measured TypeError wording", description: `setter: ${symbolOriginal.message} | template: ${symbolTemplate.message}` });

  // 3. Raw null fed around the normaliser: recorded as not equivalent, and unreachable.
  expect(result.rawNullAroundTheNormalizer).toEqual({
    original: { value: "", trimmed: "" },
    template: { value: "null", trimmed: "null" },
  });
});
