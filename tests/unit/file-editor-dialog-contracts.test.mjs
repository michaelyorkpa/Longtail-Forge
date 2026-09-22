import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Files editor's dialog half: opening it, building it, and enabling its controls.
 *
 * `0.33.33.43.7` typed the eleven readers that remained. Most of that is annotation, but three
 * things are not, and this suite is aimed at them:
 *
 * - the dialog's controls are now found and swept through `instanceof` checks, so a control of the
 *   wrong subtype is skipped rather than disabled;
 * - `JSON.parse` and the `disabled` setter both had an implicit conversion written out, and in
 *   each case the *wrong* explicit form would have changed behaviour;
 * - the action host and the focus target are declared as what their own guards admit, so the
 *   typedefs have to keep matching the guards.
 *
 * `parseFileEditorTargetValue` and `safeOptionList` are pure and lift cleanly, so they are run
 * rather than only read.
 */

const source = createProjectTextReader().readText("public/js/files.js");

const LIFTED = ["parseFileEditorTargetValue", "safeOptionList"];

function parsers() {
  const sandbox = vm.createContext({});
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

describe("The option value parser answers a usable shape or nothing", () => {
  it("parses the ids an option was built with", () => {
    const { parseFileEditorTargetValue } = parsers();
    const parsed = parseFileEditorTargetValue('{"moduleId":"tasks","targetId":"t1","targetType":"task"}');

    assert.equal(parsed.moduleId, "tasks");
    assert.equal(parsed.targetId, "t1");
    assert.equal(parsed.targetType, "task");
  });

  it("answers an empty object for anything unusable", () => {
    const { parseFileEditorTargetValue } = parsers();

    assert.deepEqual({ ...parseFileEditorTargetValue("") }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue(null) }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue(undefined) }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue("not json") }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue("[1,2]") }, { 0: 1, 1: 2 });
  });

  it("answers empty for a parsed non-object rather than returning it", () => {
    const { parseFileEditorTargetValue } = parsers();

    assert.deepEqual({ ...parseFileEditorTargetValue("42") }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue('"text"') }, {});
    assert.deepEqual({ ...parseFileEditorTargetValue("null") }, {});
  });

  /**
   * The conversion choice. `JSON.parse` converts with `ToString`, which throws on a symbol - and
   * the throw lands in the `catch` that already answers `{}`. `String()` would have answered
   * `"Symbol(x)"`, which `JSON.parse` then rejects into the same `{}`, so the *result* agrees; the
   * reason to prefer the template is that it is the conversion the callee already performed, and
   * the two forms stop agreeing the moment anything reads the thrown error.
   */
  it("converts a symbol the way JSON.parse already did", () => {
    const { parseFileEditorTargetValue } = parsers();

    assert.deepEqual({ ...parseFileEditorTargetValue(Symbol("target")) }, {});
  });
});

describe("The option list offers only choices that identify a target", () => {
  it("keeps entries carrying a value or a target id", () => {
    const { safeOptionList } = parsers();
    const kept = safeOptionList([{ value: "a" }, { targetId: "b" }, { label: "no id" }, null, undefined]);

    assert.equal(kept.length, 2);
  });

  it("answers an empty list for anything that is not an array", () => {
    const { safeOptionList } = parsers();

    for (const value of [null, undefined, "options", 42, { length: 2 }]) {
      assert.deepEqual([...safeOptionList(value)], []);
    }
  });
});

describe("The dialog's controls are found and swept through checked lookups", () => {
  /** @type {ReadonlyArray<[string, RegExp]>} */
  const NARROWINGS = [
    ["the client select goes through the context finder",
      /const clientSelect = findFileContextSelect\(dialog, "\[data-file-context-client\]"\);/],
    ["the business field is narrowed for its hidden flag",
      /const clientField = clientFieldElement instanceof HTMLElement \? clientFieldElement : null;/],
    ["the save button is narrowed for its disabled flag",
      /const saveButton = saveButtonElement instanceof HTMLButtonElement \? saveButtonElement : null;/],
  ];

  for (const [label, pattern] of NARROWINGS) {
    it(label, () => {
      assert.match(source, pattern);
    });
  }

  it("both disable sweeps skip a control of the wrong subtype rather than asserting one", () => {
    const block = source.slice(source.indexOf("function setFileEditorControlsDisabled"));
    const body = block.slice(0, block.indexOf("\n  }"));
    const guarded = body.match(/if \(control instanceof HTMLSelectElement\) \{/g) || [];

    assert.equal(guarded.length, 2, "both sweeps must narrow");
    assert.doesNotMatch(body, /\(control\)\s*=>\s*\{\s*\n\s*control\.disabled/,
      "an unguarded sweep would read `disabled` off an Element");
  });

  it("the sweeps still disable, so the narrowing did not quietly disarm them", () => {
    const block = source.slice(source.indexOf("function setFileEditorControlsDisabled"));
    const body = block.slice(0, block.indexOf("\n  }"));

    assert.match(body, /control\.disabled = disabled;/);
    assert.match(body, /control\.disabled = disabled \|\| !business;/);
    assert.match(body, /syncFileEditorSaveState\(dialog, disabled\);/);
  });
});

describe("The two written-out conversions are the ones the callee already performed", () => {
  it("the option value is converted with a template, not String", () => {
    assert.match(
      source,
      /const parsed = JSON\.parse\(`\$\{value\}`\);/,
      "JSON.parse converts with ToString; the template is that conversion",
    );
    assert.doesNotMatch(source, /JSON\.parse\(String\(value\)\)/);
  });

  it("the save button's disabled flag is converted with Boolean, which its setter already did", () => {
    assert.match(
      source,
      /saveButton\.disabled = Boolean\(forceDisabled \|\| !targetSelect\?\.value \|\| selectedTarget\?\.disabled\);/,
      "the last operand is undefined when nothing is selected, and the DOM stored that as false",
    );
  });
});

describe("The declared shapes match the guards that make them safe", () => {
  it("the action host is read only through guards, which is why every member is optional", () => {
    const block = source.slice(source.indexOf("function openFileEditorAction"));
    const body = block.slice(0, block.indexOf("\n  }\n"));

    assert.match(body, /typeof hostContext\?\.refresh === "function"/, "refresh is called, so it is type-tested");
    assert.match(body, /hostContext\?\.complete\?\.\(/);
    assert.match(body, /hostContext\?\.cancel\?\.\(/);
    assert.match(body, /return hostContext\?\.result \|\| dialog;/);
  });

  it("a focus target is declared as exactly what the opener's test admits", () => {
    assert.match(
      source,
      /@typedef \{\{ focus\?: unknown \} \| null \| undefined\} FileEditorFocusTarget/,
      "naming a specific element type here would claim more than the test checks",
    );
    assert.match(
      source,
      /options\.trigger && typeof options\.trigger\.focus === "function"\s*\n\s*\? options\.trigger\s*\n\s*: document\.activeElement;/,
      "and the test itself must stay the thing the typedef is describing",
    );
  });

  it("the dialog is typed from its producer rather than locally", () => {
    assert.match(
      source,
      /@type \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.BrowserViewModalFormElement \| null\}/,
      "renderDescriptorModalForm publishes this return, so no local shape is needed",
    );
  });

  it("the editor keeps one row shape rather than growing a second", () => {
    const rows = source.match(/\}\} FileEditorRow/g) || [];

    assert.equal(rows.length, 1, "the dialog half extended the existing row instead of declaring its own");
    for (const member of ["clientLabel", "targetLabel", "fileName", "previewable", "reviewable"]) {
      assert.match(source, new RegExp(`${member}\\?:`), `${member} is read by this half and must be named`);
    }
  });
});
