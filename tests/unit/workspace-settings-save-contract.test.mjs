import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Workspace Settings save protocol, corrected by `0.33.33.38.4.5.10`.
 *
 * **The defect lived between two correct-looking pieces.** `settingsPageController` runs
 * `const saved = await options.onSave?.(); if (saved !== false) setClean();` - so a save handler
 * must answer `false` when nothing was saved. `saveSettings` answered `false` from its renderer
 * validation and its `catch`, and `true` from all three committed-write paths, but the
 * workspace-name rejection exited with a bare `return`. `undefined !== false`, so the controller
 * cleaned a form that had never been saved, and `setClean` re-snapshotted the rejected value as
 * the baseline Revert restores.
 *
 * The behavioural proof is `tests/e2e/workspace-settings-rejected-save.spec.mjs`, which drives the
 * real Save action in a browser. This suite pins the protocol itself, so a future exit that
 * forgets to answer is caught without waiting for the browser run.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/workspace-settings.js");
const controller = read("public/js/shared/settings-page-controller.js");

/**
 * The `if (...) { ... }` block a claim is about, bounded to its own braces.
 *
 * Written because the first draft of this suite used `[\s\S]*?` between the condition and the
 * expected `return`, and an unbounded gap let a *later* exit satisfy a claim about this one - the
 * same weakness `0.33.33.38.4.7.2.3` repairs in the Lists summary suite. Two mutations slipped
 * through before this replaced it.
 * @param {string} body
 * @param {string} opener
 */
function guardedBlock(body, opener) {
  const start = body.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in saveSettings");
  const end = body.indexOf("\n    }\n", start);
  assert.notEqual(end, -1, opener + " must close at its own indentation");
  return body.slice(start, end + 6);
}

/** The body of `saveSettings`, from its opener to the closer at its own indentation. */
function saveSettingsBody() {
  const at = page.indexOf("  async function saveSettings() {");
  assert.notEqual(at, -1, "saveSettings must exist");
  const end = page.indexOf("\n  }\n", at);
  assert.notEqual(end, -1, "saveSettings must terminate");
  return page.slice(at, end + 4);
}

describe("the controller contract this page must satisfy", () => {
  it("cleans the form for any answer other than false", () => {
    // Read from the controller rather than restated, so a change there breaks this rather than
    // silently invalidating the page's protocol.
    assert.match(controller, /const saved = await options\.onSave\?\.\(\);\s*\n\s*if \(saved !== false\) setClean\(\);/,
      "the controller treats every non-false answer as a successful save");
    assert.match(controller, /function setClean\(\) \{\s*\n\s*snapshot = new Map\(listControls\(\)\.map/,
      "and setClean re-snapshots the current controls as the saved baseline");
  });

  it("gates Save and Revert on that same dirty flag", () => {
    // This is why a wrongly-cleaned form is user-visible: both actions disappear.
    assert.match(controller, /saveButtons\.forEach\(\(button\) => \{ button\.disabled = !dirty \|\| saving; \}\);/);
    assert.match(controller, /revertButtons\.forEach\(\(button\) => \{ button\.disabled = !dirty \|\| saving; \}\);/);
  });
});

describe("every exit of saveSettings answers the protocol", () => {
  it("answers false when the workspace name is rejected", () => {
    const block = guardedBlock(saveSettingsBody(), "if (!settings.workspaceName) {");
    assert.match(block, /setWorkspaceSettingsStatus\("Workspace name is required\."\);/,
      "the rejection message is unchanged");
    assert.match(block, /\n\s*return false;\n/,
      "and this block answers false, not undefined");
    assert.ok(!/\n\s*return (true|;)/.test(block),
      "this block answers nothing else");
  });

  it("carries no bare return at all", () => {
    // The specific shape of the original defect. A bare `return;` anywhere in this function is
    // an answer of `undefined`, which the controller reads as success.
    const body = saveSettingsBody();
    assert.ok(!/\n\s*return;\s*\n/.test(body),
      "no exit may answer undefined");
    const answers = [...body.matchAll(/\n\s*return (true|false);/g)].map((entry) => entry[1]);
    assert.ok(answers.includes("true") && answers.includes("false"),
      "both answers are used");
    assert.equal(answers.length, 6,
      "two rejections, three committed-write answers, and the catch");
  });

  it("keeps false for the renderer validation and the catch", () => {
    const body = saveSettingsBody();
    const validation = guardedBlock(body, "if (!requireSettingsRenderer().validate(requireWorkspaceSettingsForm())) {");
    assert.match(validation, /\n\s*return false;\n/,
      "contributed-settings validation still rejects with false");
    assert.ok(!/\n\s*return (true|;)/.test(validation),
      "and rejects with nothing else");
    assert.match(body, /\} catch \(error\) \{[\s\S]*?return false;\s*\n\s*\}/,
      "and a failed request still answers false");
  });

  it("keeps true for all three committed-write outcomes", () => {
    const body = saveSettingsBody();
    /** @type {[string, RegExp][]} */
    const outcomes = [
      ["the save result could not be read", /Workspace settings saved, but the refreshed settings could not be read[\s\S]{0,120}?return true;/],
      ["the catalog refresh could not be read", /Workspace settings saved, but the refreshed settings catalog could not be read[\s\S]{0,120}?return true;/],
      ["the ordinary success", /flashSavedState\(\);\s*\n\s*return true;/],
    ];
    for (const [label, pattern] of outcomes) {
      assert.match(body, pattern, label + " must still answer true, because the write committed");
    }
  });

  it("declares the protocol so a future silent exit fails checking", () => {
    const at = page.indexOf("  async function saveSettings() {");
    const doc = page.slice(page.lastIndexOf("/**", at), at);
    assert.match(doc, /@returns \{Promise<boolean>\}/,
      "the local protocol is declared on the function it governs");
    assert.match(doc, /settingsPageController/,
      "and the doc names the contract it satisfies rather than asserting a bare type");
  });
});

describe("behaviour the correction must not have moved", () => {
  it("still rejects the name before any request is built", () => {
    const body = saveSettingsBody();
    const rejection = body.indexOf('setWorkspaceSettingsStatus("Workspace name is required.");');
    const write = body.indexOf("putJson");
    assert.notEqual(rejection, -1, "the rejection exists");
    assert.notEqual(write, -1, "and the write exists");
    assert.ok(rejection < write, "so a rejected name never reaches the server");
  });

  it("keeps the single write and the saved-but-unrefreshed outcomes", () => {
    const body = saveSettingsBody();
    assert.equal((body.match(/putJson/g) || []).length, 1, "exactly one write in the whole path");
    assert.match(body, /await requireNamespace\(\)\.refreshAppShell\?\.\(\);/, "the app shell still refreshes");
    assert.match(body, /applyWorkspaceName\(savedSettings\.workspaceName\);/);
  });

  it("leaves the other settings pages' handlers alone", () => {
    // Every sibling already answered explicitly; this correction is one page, one exit.
    for (const script of ["user-settings", "notes-settings", "files-settings", "module-settings"]) {
      const source = read(`public/js/${script}.js`);
      const at = source.search(/async function save\w*\(\) \{/);
      if (at === -1) continue;
      const body = source.slice(at, source.indexOf("\n  }\n", at) + 4);
      assert.ok(!/\n\s*return;\s*\n/.test(body), script + " still answers explicitly");
    }
  });
});
