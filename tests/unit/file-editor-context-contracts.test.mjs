import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Files editor's target-context readers and the payload they build.
 *
 * `0.33.33.43.6` typed these nine readers. Most of that is annotation the compiler proves, but two
 * things are not: the context controls are now found through an `instanceof` check, which is a
 * runtime filter, and the payload's shape is asserted by a local typedef that nothing validates at
 * runtime. The cases below cover both - the filter by lifting it and running it, and the typedef's
 * honesty by holding its claims against the code that has to satisfy them.
 *
 * **The declared payload is a local typedef because no browser contract publishes one.** The route
 * accepts `UpdateFileContextSchema` (`src/core/files/files.contracts.js`), which admits a camelCase
 * and a snake_case spelling of each member. This page sends only camelCase, and only three members
 * are proved - the builder throws unless module, target type and target id are all non-empty.
 */

const source = createProjectTextReader().readText("public/js/files.js");

// `fileOptionValueField` joined this list with `0.33.33.43.11`, which re-typed the option `value`
// to the `unknown` its filter actually establishes and transcribed the optional reads of it through
// that helper. A lifted function may gain no free variable, so the helper has to be lifted beside
// the label builder that now calls it - it is a dependency of the code under test, not a new
// subject, and the suite still asserts only what the label builder answers.
const LIFTED = [
  "fileEditorTargetContextLabel", "findFileContextSelect", "fileEditorSelectedValue",
  "fileOptionValueField",
];

/**
 * A sandbox whose `HTMLSelectElement` is a real constructor, so `instanceof` means something across
 * the realm boundary. A fake that is merely shaped like a select must be refused, which is the
 * whole point of the narrowing.
 * @param {{ control?: unknown }} [options]
 */
function editorCase(options = {}) {
  const sandbox = vm.createContext({});
  vm.runInContext("class HTMLSelectElement { constructor(fields) { Object.assign(this, fields); } }", sandbox);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  const api = vm.runInContext(`({ ${LIFTED.join(", ")}, HTMLSelectElement })`, sandbox);
  const dialog = { querySelector: () => options.control ?? null };

  return { api, dialog };
}

describe("The context control lookup accepts only a real select", () => {
  it("returns the control when it is one", () => {
    const { api, dialog } = editorCase();
    const control = new api.HTMLSelectElement({ value: "client-1" });
    const found = api.findFileContextSelect({ querySelector: () => control }, "[data-file-context-client]");

    assert.equal(found, control);
    void dialog;
  });

  it("refuses a control that merely looks like one", () => {
    const { api } = editorCase();
    const impostor = { dataset: { fileContextLoaded: "true" }, value: "client-1" };

    assert.equal(api.findFileContextSelect({ querySelector: () => impostor }, "[sel]"), null);
  });

  it("answers null when the dialog has no such control", () => {
    const { api } = editorCase();

    assert.equal(api.findFileContextSelect({ querySelector: () => null }, "[sel]"), null);
  });
});

describe("The selected value falls back rather than refusing", () => {
  it("reads the control only once it reports itself loaded", () => {
    const { api } = editorCase();
    const loaded = new api.HTMLSelectElement({ dataset: { fileContextLoaded: "true" }, value: "project-9" });
    const pending = new api.HTMLSelectElement({ dataset: { fileContextLoaded: "false" }, value: "project-9" });

    assert.equal(api.fileEditorSelectedValue({ querySelector: () => loaded }, "[sel]"), "project-9");
    assert.equal(api.fileEditorSelectedValue({ querySelector: () => pending }, "[sel]", "fallback"), "fallback");
  });

  it("falls back for an absent control, and to empty when there is no fallback", () => {
    const { api } = editorCase();
    const none = { querySelector: () => null };

    assert.equal(api.fileEditorSelectedValue(none, "[sel]", "row-value"), "row-value");
    assert.equal(api.fileEditorSelectedValue(none, "[sel]"), "");
  });

  /**
   * The narrowing's only behavioural consequence, stated as a case: a control of the wrong subtype
   * now takes the same path an absent one takes. It does not throw, and it does not read a value.
   */
  it("treats a control of the wrong subtype exactly as an absent one", () => {
    const { api } = editorCase();
    const impostor = { querySelector: () => ({ dataset: { fileContextLoaded: "true" }, value: "leaked" }) };

    assert.equal(api.fileEditorSelectedValue(impostor, "[sel]", "row-value"), "row-value");
    assert.notEqual(api.fileEditorSelectedValue(impostor, "[sel]"), "leaked");
  });

  it("treats an empty value as absent, which is what the fallback is for", () => {
    const { api } = editorCase();
    const empty = new api.HTMLSelectElement({ dataset: { fileContextLoaded: "true" }, value: "" });

    assert.equal(api.fileEditorSelectedValue({ querySelector: () => empty }, "[sel]"), "");
  });
});

describe("The target option label names only what distinguishes a choice", () => {
  it("shows the client and project when the current context differs", () => {
    const { api } = editorCase();
    const option = { clientId: "c1", clientLabel: "Acme", projectId: "p1", projectLabel: "Rebuild" };

    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c2", projectId: "p2" }), "Acme / Rebuild");
  });

  it("drops a label the current context already matches", () => {
    const { api } = editorCase();
    const option = { clientId: "c1", clientLabel: "Acme", projectId: "p1", projectLabel: "Rebuild" };

    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c1", projectId: "p2" }), "Rebuild");
    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c1", projectId: "p1" }), "");
  });

  it("reads the ids nested under value when they are not flat", () => {
    const { api } = editorCase();
    const option = { clientLabel: "Acme", projectLabel: "Rebuild", value: { clientId: "c1", projectId: "p1" } };

    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c1", projectId: "p1" }), "");
    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c9", projectId: "p9" }), "Acme / Rebuild");
  });

  it("falls back to the option's own context label only when it has neither", () => {
    const { api } = editorCase();

    assert.equal(api.fileEditorTargetContextLabel({ contextLabel: "Personal" }, {}), "Personal");
    assert.equal(api.fileEditorTargetContextLabel({ clientLabel: "Acme", contextLabel: "Personal" }, { clientId: "" }), "Acme");
  });

  /**
   * The distinction the case above cannot make. An option whose only label is **suppressed**
   * because the current context already matches it has said all it has to say - nothing - and must
   * stay silent. Falling back to the context label there would re-add text the suppression just
   * removed, and the two cases above both return before reaching that branch.
   */
  it("stays silent when its only label was suppressed rather than absent", () => {
    const { api } = editorCase();
    const option = { clientId: "c1", clientLabel: "Acme", contextLabel: "Personal" };

    assert.equal(api.fileEditorTargetContextLabel(option, { clientId: "c1" }), "");
  });

  it("answers empty rather than undefined when it has nothing to say", () => {
    const { api } = editorCase();

    assert.equal(api.fileEditorTargetContextLabel({}, {}), "");
    assert.equal(api.fileEditorTargetContextLabel({}), "");
  });
});

describe("The payload typedef's claims are the ones the code makes", () => {
  it("declares only the camelCase half the page actually sends", () => {
    const block = source.slice(source.indexOf("function fileEditorContextPayload"));
    const body = block.slice(0, block.indexOf("\n  }"));

    for (const member of ["moduleId", "targetId", "targetType"]) {
      assert.match(body, new RegExp(`${member}:`), `${member} must still be sent`);
    }
    assert.doesNotMatch(body, /module_id|target_id|target_type|client_id|project_id/,
      "the route accepts a snake_case spelling too, but this page has never sent one");
  });

  it("proves its three required members by refusing to return without them", () => {
    assert.match(
      source,
      /if \(!payload\.moduleId \|\| !payload\.targetType \|\| !payload\.targetId \|\| selectedTarget\?\.disabled\) \{\s*\n\s*throw new Error\("Choose an available target before saving\."\);/,
      "the typedef calls these three proved, so the builder must be what proves them",
    );
  });

  it("adds the two optional ids only when they carry something", () => {
    assert.match(source, /if \(clientId\) \{\s*\n\s*payload\.clientId = clientId;/);
    assert.match(source, /if \(projectId\) \{\s*\n\s*payload\.projectId = projectId;/);
  });

  it("says plainly that the optional ids are a precondition rather than proved", () => {
    assert.match(
      source,
      /\*\*Precondition, not proved:\*\* the two optional\s*\n\s*\* ids are whatever the chosen option's dataset or the dialog's own controls carried/,
      "the typedef must not imply a validation this page never performs",
    );
  });
});

describe("The narrowing matches the builder", () => {
  it("all three context controls are built as selects", () => {
    assert.match(
      source,
      /function createFileContextSelect\(datasetKey, name\) \{\s*\n\s*return createFilesElement\("select", \{/,
      "findFileContextSelect demands a select, so this must keep making one",
    );
    for (const key of ["fileContextTarget", "fileContextClient", "fileContextProject"]) {
      assert.match(source, new RegExp(`createFileContextSelect\\("${key}"`), `${key} must come from that builder`);
    }
  });

  it("the lookup checks rather than asserts", () => {
    assert.match(
      source,
      /return control instanceof HTMLSelectElement \? control : null;/,
      "a cast here would claim the subtype rather than establish it",
    );
  });

  /**
   * Counted rather than merely present. `0.33.33.43.7` added two more sites that look the target
   * select up, and an `includes` check passes while any one of them survives - so mutating a single
   * site went undetected. Every lookup of this control must go through the checked finder.
   */
  it("every target-select lookup that reads a subtype member goes through the checked finder", () => {
    const checked = source.match(/findFileContextSelect\(dialog, "\[data-file-context-target\]"\)/g) || [];
    const raw = source.match(/dialog\.querySelector\("\[data-file-context-target\]"\)(\?\.addEventListener)?/g) || [];

    assert.ok(checked.length >= 3, `expected every subtype read to be checked, found ${checked.length}`);
    // One raw lookup is correct and must stay raw: it only registers a listener, which is every
    // element's. Narrowing it would claim more than that site uses. Any *other* raw lookup would
    // be reading a select member off an Element.
    assert.deepEqual(
      raw,
      ['dialog.querySelector("[data-file-context-target]")?.addEventListener'],
      "a raw lookup is only correct where nothing but Element members are read through it",
    );
  });
});
