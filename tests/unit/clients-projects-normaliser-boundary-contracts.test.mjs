import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects normaliser boundary (`0.33.33.43.56`).
 *
 * Four diagnostics close: the three permission readers take what their callers pass, and the billing
 * contact's reducer starts from a declared accumulator - the same fresh object the `{}` literal was.
 * The four wire normalisers and the rounding reader are **held**, pending an operator decision, and
 * only gained notes saying so. What these cases pin: every held body and every annotated reader is
 * its `03f859c0` body once comments are removed, the contact reader differs by exactly its
 * accumulator, and it answers what it did for every contact shape - absent, empty, falsy, truthy,
 * extra and getter-backed members - with a fresh record on every call.
 */

const BASE = "03f859c0";
const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const UNCHANGED = [
  "canCreateChildClient", "canCreateProjectForClient", "canManageProjectClientScope",
  "normalizeClientRecord", "normalizeData", "normalizeProjects", "normalizeSettings", "normalizeBillingRounding",
];

/** A function block without its comments, so only an annotation or a note can differ. @param {string} block */
const withoutComments = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "").replace(/[ \t]*\/\/[^\n]*\n/g, "");

/** @param {string} text */
function contactReaderFrom(text) {
  const context = vm.createContext({});
  const at = text.indexOf("  const billingContactFields = [");
  expect(at).toBeGreaterThan(-1);
  vm.runInContext(text.slice(at, text.indexOf("];", at) + 2), context);
  vm.runInContext(extractFunctionBlock(text, "normalizeBillingContact"), context);
  /** @type {(contact?: unknown) => Record<string, unknown>} */
  const normalizeBillingContact = vm.runInContext("normalizeBillingContact", context);
  return normalizeBillingContact;
}

/** @returns {unknown[]} */
function contactShapes() {
  /** @type {string[]} */
  const reads = [];
  const withGetter = Object.defineProperty({}, "email", {
    enumerable: true,
    get() { reads.push("email"); return "getter@example.com"; },
  });
  const inherited = Object.create({ name: "Inherited" });
  return [
    undefined, null, {}, { name: "Ada", email: "ada@example.com", phone: "555" },
    { name: 0, email: false, phone: "", address: null, city: undefined, zip: Number.NaN },
    { name: 42, email: true, address: ["1 Main St"], city: { line: "x" } },
    { name: "Ada", extra: "dropped", _private: 1 },
    withGetter, inherited, { reads },
  ];
}

/** @param {(contact?: unknown) => Record<string, unknown>} normalize */
function runShapes(normalize) {
  const shapes = contactShapes();
  const reads = /** @type {{ reads: string[] }} */ (shapes.at(-1)).reads;
  const results = shapes.slice(0, -1).map((shape) => {
    try {
      const record = normalize(shape);
      return { keys: Object.keys(record), values: Object.values(record).map((value) => (typeof value === "object" && value !== null ? JSON.stringify(value) : String(value))) };
    } catch (error) {
      return { threw: error instanceof Error ? error.message : String(error) };
    }
  });
  return { results, reads };
}

describe("Only annotations, notes and the contact accumulator changed", () => {
  it(`keeps every held and annotated body the ${BASE} body`, () => {
    for (const name of UNCHANGED) {
      expect(withoutComments(extractFunctionBlock(current, name)), name).toBe(withoutComments(extractFunctionBlock(baseline, name)));
    }
  });

  it("changes the contact reader by its declared accumulator alone", () => {
    expect(withoutComments(extractFunctionBlock(current, "normalizeBillingContact")))
      .toBe(withoutComments(extractFunctionBlock(baseline, "normalizeBillingContact"))
        .replace("    return billingContactFields.reduce(", "    const initialContact = {};\n    return billingContactFields.reduce(")
        .replace("    }, {});", "    }, initialContact);"));
  });

  it("records the held wire normalisers and rounding reader as pending, not typed", () => {
    for (const name of ["normalizeData", "normalizeProjects", "normalizeSettings"]) {
      const at = current.indexOf(`  function ${name}(`);
      const doc = current.slice(current.lastIndexOf("/**", at), at);
      expect(doc, name).toMatch(/pending/);
      expect(doc, name).not.toMatch(/@param/);
    }
  });
});

describe("The contact reader answers what it did", () => {
  it("for every contact shape, and reads a getter once per field as before", () => {
    const [now, before] = VERSIONS.map(([, text]) => JSON.parse(JSON.stringify(runShapes(contactReaderFrom(text)))));
    expect(now).toEqual(before);
    const record = contactReaderFrom(current)({ name: "Ada", email: "ada@example.com", phone_number: "555", extra: "dropped" });
    expect([record.name, record.email, record.phone_number]).toEqual(["Ada", "ada@example.com", "555"]);
    expect(Object.hasOwn(record, "extra"), "members the page does not name are not carried").toBe(false);
  });

  it("returns a fresh record on every call", () => {
    const normalize = contactReaderFrom(current);
    const first = normalize({ name: "A" });
    const second = normalize({ name: "B" });
    expect(first).not.toBe(second);
    first.name = "changed";
    expect(normalize({}).name).toBe("");
    expect(second.name).toBe("B");
  });
});
