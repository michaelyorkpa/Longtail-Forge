import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-editor-dialog-contracts.test.mjs`.** `0.33.33.43.7` closed 35 diagnostics and
// most of that is annotation the compiler proves. The executable changes are the control lookups
// and sweeps now narrowing with `instanceof`, and two implicit conversions written out - so the
// cases attack those, plus the parser behaviour the annotations describe.
//
// The two conversion cases are the ones worth having: in both, the *plausible* explicit form is a
// different conversion from the one the callee already performed.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the conversions, and the wrong spelling for each ---------------------------------------------
  ["the option value is converted with String instead of the callee's own ToString",
    "      const parsed = JSON.parse(`${value}`);",
    "      const parsed = JSON.parse(String(value));"],
  ["the option value stops being converted at all",
    "      const parsed = JSON.parse(`${value}`);",
    "      const parsed = value;"],
  ["the save flag stops being converted, so undefined reaches the setter",
    "    saveButton.disabled = Boolean(forceDisabled || !targetSelect?.value || selectedTarget?.disabled);",
    "    saveButton.disabled = forceDisabled || !targetSelect?.value || selectedTarget?.disabled;"],
  ["the save flag ignores a disabled selection",
    "    saveButton.disabled = Boolean(forceDisabled || !targetSelect?.value || selectedTarget?.disabled);",
    "    saveButton.disabled = Boolean(forceDisabled || !targetSelect?.value);"],

  // --- the control lookups and sweeps -----------------------------------------------------------------
  ["the client select stops going through the context finder",
    'const clientSelect = findFileContextSelect(dialog, "[data-file-context-client]");',
    'const clientSelect = dialog.querySelector("[data-file-context-client]");'],
  ["the business field is asserted rather than narrowed",
    "    const clientField = clientFieldElement instanceof HTMLElement ? clientFieldElement : null;",
    "    const clientField = /** @type {HTMLElement | null} */ (clientFieldElement);"],
  ["the save button is narrowed to the wrong subtype",
    "    const saveButton = saveButtonElement instanceof HTMLButtonElement ? saveButtonElement : null;",
    "    const saveButton = saveButtonElement instanceof HTMLAnchorElement ? saveButtonElement : null;"],
  ["one disable sweep stops narrowing",
    "      if (control instanceof HTMLSelectElement) {\n        control.disabled = disabled;\n      }",
    "      control.disabled = disabled;"],
  ["a disable sweep stops disabling anything",
    "        control.disabled = disabled;\n      }",
    "        void disabled;\n      }"],
  ["the client sweep ignores the business scope",
    "        control.disabled = disabled || !business;",
    "        control.disabled = disabled;"],
  ["the save state stops being resynchronised after a sweep",
    "    syncFileEditorSaveState(dialog, disabled);",
    "    void disabled;"],

  // --- the parsers the annotations describe ------------------------------------------------------------
  ["a parsed non-object is returned rather than refused",
    '      return parsed && typeof parsed === "object" ? parsed : {};',
    "      return parsed;"],
  // Both this case and the list one below answer a wrong *value* rather than throwing. A mutation
  // that makes the source throw crashes the suite instead of failing an assertion, and the runner
  // refuses that as proof - correctly, since a crash does not show the test would have noticed.
  ["an unparseable value answers a phantom shape rather than empty",
    "    } catch {\n      return {};\n    }",
    '    } catch {\n      return { targetId: "" };\n    }'],
  ["an option with no identity is offered",
    "    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];",
    "    return Array.isArray(options) ? options : [];"],
  ["a non-array body answers a phantom choice rather than nothing",
    "    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [];",
    "    return Array.isArray(options) ? options.filter((option) => option?.value || option?.targetId) : [{}];"],

  // --- the declared shapes and the guards that justify them ---------------------------------------------
  ["the focus target is declared as a specific element rather than what the test admits",
    "@typedef {{ focus?: unknown } | null | undefined} FileEditorFocusTarget",
    "@typedef {HTMLElement | null | undefined} FileEditorFocusTarget"],
  ["the editor grows a second row shape beside the first",
    "   *   targetLabel?: string, fileName?: string, previewable?: unknown, reviewable?: unknown }} FileEditorRow",
    "   *   targetLabel?: string, fileName?: string, previewable?: unknown, reviewable?: unknown }} FileEditorRow\n"
      + "   * @typedef {{ fileName?: string }} FileEditorRow"],
  ["the host's refresh is called without its type test",
    '        if (typeof hostContext?.refresh === "function") {',
    "        if (hostContext?.refresh) {"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-editor-dialog-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
