import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Files page's option filter actually establishes, and what its consumers may read.
 *
 * `0.33.33.43.10` typed the project option plumbing and stopped at `safeOptionList`, recording why:
 * one filter serves **two different option shapes**, and it tests only that an entry carries a
 * truthy `value` or a truthy `targetId`. `0.33.33.43.11` discharges that deferral by declaring the
 * honest thing - `value` is `unknown` - rather than either consumer's richer expectation.
 *
 * Almost all of that is annotation. The one executable change is `fileOptionValueField`, which
 * transcribes five optional reads of that now-`unknown` value, so this suite **runs** it against
 * the optional chain it claims to equal instead of only reading it.
 */

const source = createProjectTextReader().readText("public/js/files.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/** The helper lifted into a bare realm, alongside a reference spelling of what it claims to be. */
function field() {
  // The context keeps its **own** built-ins. Handing it the outer `Object` would box `"abc"` against
  // the outer `String.prototype` while the probe getter below sits on this realm's, and the receiver
  // test would read `undefined` and look like a failure of the helper rather than of the fixture.
  const sandbox = vm.createContext({});
  vm.runInContext(extractFunctionBlock(source, "fileOptionValueField"), sandbox);
  // The reference is the optional chain the annotation says this is exactly equal to. Comparing
  // against it - rather than against values worked out by hand - is what makes the claim testable.
  vm.runInContext("const optionalChain = (value, key) => value?.[key];", sandbox);
  vm.runInContext(
    "const noReceiver = (value, key) => Reflect.get(Object(value), key);"
      + "Object.defineProperty(String.prototype, 'probeReceiver',"
      + " { configurable: true, get() { 'use strict'; return typeof this; } });",
    sandbox,
  );

  return vm.runInContext("({ fileOptionValueField, optionalChain, noReceiver })", sandbox);
}

describe("A member of an option's value is read exactly as the optional chain read it", () => {
  /**
   * The five call sites previously spelled `option.value?.clientId` and friends, plus one that
   * spelled `(option.value || {}).clientId`. Both collapse to the same thing, which is why the
   * `|| {}` could go: `Object` absorbs nullish into an empty object just as `?.` short-circuits.
   */
  it("answers whatever value?.[key] answers, across every kind of value", () => {
    const { fileOptionValueField, optionalChain } = field();
    const values = [
      null, undefined, {}, { clientId: "c1" }, { clientId: "" }, { clientId: 0 },
      Object.create({ clientId: "inherited" }), [], "abc", "", 0, 5, true, false,
    ];

    for (const value of values) {
      for (const key of ["clientId", "moduleId", "projectId", "targetId", "targetType", "length"]) {
        assert.equal(
          fileOptionValueField(value, key),
          optionalChain(value, key),
          `${String(key)} of ${JSON.stringify(value) ?? String(value)} must not change meaning`,
        );
      }
    }
  });

  it("absorbs a nullish value the way the discarded `|| {}` did", () => {
    const { fileOptionValueField } = field();

    for (const value of [null, undefined]) {
      assert.equal(fileOptionValueField(value, "clientId"), undefined);
    }
    assert.equal(fileOptionValueField({}, "clientId"), undefined, "which is what `|| {}` produced");
  });

  it("boxes a primitive the way a member read on one already did", () => {
    const { fileOptionValueField } = field();

    assert.equal(fileOptionValueField("abc", "length"), 3);
    assert.equal(fileOptionValueField("abc", "clientId"), undefined);
    assert.equal(fileOptionValueField(5, "clientId"), undefined);
  });

  /**
   * The receiver argument is the part that is easy to drop and impossible to notice. A getter is
   * the only thing that can tell the difference, so one is installed to say what it was handed.
   */
  it("passes the value back as the receiver, which a getter can see", () => {
    const { fileOptionValueField, optionalChain, noReceiver } = field();

    assert.equal(fileOptionValueField("abc", "probeReceiver"), "string");
    assert.equal(optionalChain("abc", "probeReceiver"), "string", "this is the behaviour being kept");
    assert.equal(noReceiver("abc", "probeReceiver"), "object", "dropping the third argument would box it");
  });

  it("converts nothing on the way out", () => {
    const { fileOptionValueField } = field();
    const token = Symbol("target");

    assert.equal(fileOptionValueField({ clientId: token }, "clientId"), token, "not `Symbol(target)`");
    assert.equal(fileOptionValueField({ clientId: 0 }, "clientId"), 0, "not `\"0\"`, and not the `||` fallback");
    assert.deepEqual(fileOptionValueField({ clientId: { nested: 1 } }, "clientId"), { nested: 1 });
  });
});

describe("The filter declares what it establishes, not what either consumer wants", () => {
  it("types the value it cannot describe as unknown", () => {
    assert.match(
      source,
      /\*\s*targetType\?: string, value\?: unknown \}\} FileEditorTargetOption/,
      "naming it either shape would claim of one caller's list what only the other's guarantees",
    );
    assert.match(source, /\*\*It admits two different option shapes, and promises neither\.\*\*/);
    assert.match(source, /\*\*Proved:\*\* each entry carries one of those two members\./);
  });

  it("still filters on exactly the two members it names", () => {
    assert.match(
      source,
      /options\.filter\(\(option\) => option\?\.value \|\| option\?\.targetId\)/,
      "the declaration is only honest while this is what the filter tests",
    );
  });

  it("does not resolve the mismatch by splitting into two parallel declarations", () => {
    for (const invented of ["FileTargetOptionEntry", "FileProjectOptionEntry", "FileOptionEntry"]) {
      assert.doesNotMatch(source, new RegExp(`\\}\\} ${invented}\\b`), `${invented} would duplicate the filter`);
    }
  });
});

describe("Both deferred consumers take what the view builder itself takes", () => {
  it("annotates createOption as (unknown, unknown), converting nothing", () => {
    assert.match(source, /@param \{unknown\} value @param \{unknown\} label\s*\n\s*\*\/\s*\n\s*function createOption\(value, label\)/);
  });

  it("matches the published sibling it mirrors, rather than inventing a narrower one", () => {
    assert.match(
      contracts,
      /createOption\(value: unknown, text: unknown\): HTMLOptionElement;/,
      "0.33.33.39.24 widened the shared one for this same reason; a narrower local copy would contradict it",
    );
  });

  it("types the select config by what its readers test, leaving the list unknown", () => {
    assert.match(
      source,
      /@param \{\{ selectedValue\?: string, placeholder\?: string, options\?: unknown,\s*\n\s*\*\s*currentValue\?: unknown, currentLabel\?: unknown \}\} config/,
    );
  });
});

describe("The project control is found the way its two siblings already were", () => {
  /**
   * `hydrateContextSelect` writes `select.value` and `select.dataset`, so it wants a real control.
   * `0.33.33.43.6` published `findFileContextSelect`, which narrows with `instanceof`, and the
   * client and target lookups already used it - the project lookup was simply the one left raw.
   */
  it("goes through the checked lookup rather than a bare querySelector", () => {
    assert.match(
      source,
      /const projectSelect = findFileContextSelect\(dialog, "\[data-file-context-project\]"\);/,
    );
    assert.match(source, /const control = dialog\.querySelector\(selector\);\s*\n\s*return control instanceof HTMLSelectElement \? control : null;/);
  });

  it("is a select by construction, which is what makes that lookup total rather than a new refusal", () => {
    assert.match(
      extractFunctionBlock(source, "createFileContextSelect"),
      /return createFilesElement\("select", \{/,
      "this page builds the control itself, so the narrowing rejects nothing that can occur",
    );
    assert.match(source, /createFileContextSelect\("fileContextProject", "projectId"\)/);
  });
});
