import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Deliberately small, and honest about what it is for.** This checkpoint cleared twenty-four
// diagnostics; twenty-two were parameter annotations and two were a default inferring `{}`, all
// of which the compiler proves. **Exactly one executable line changed** - the debounce timer
// starts unset rather than null - so this table is not evidence of new behaviour. It is here to
// confirm the new cases actually bite, which the last two checkpoints' campaigns both showed is
// worth checking: each found a case of mine passing for the wrong reason.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the one line this checkpoint changed, and the helper around it ----------------------------
  ["a pending call stops being cancelled, so a burst no longer collapses",
    "      window.clearTimeout(timer);",
    "      void timer;"],
  ["the timer handle stops being kept, so nothing can cancel it",
    "      timer = window.setTimeout(() => callback(...args), delay);",
    "      window.setTimeout(() => callback(...args), delay);"],
  ["the caller's delay is ignored",
    "      timer = window.setTimeout(() => callback(...args), delay);",
    "      timer = window.setTimeout(() => callback(...args), 0);"],
  ["the forwarded arguments are dropped",
    "      timer = window.setTimeout(() => callback(...args), delay);",
    "      timer = window.setTimeout(() => callback(), delay);"],
  ["the callback runs immediately rather than on a timer",
    "      timer = window.setTimeout(() => callback(...args), delay);",
    "      callback(...args);"],

  // --- the usage summary the annotations now describe ----------------------------------------------
  ["the breakdown opens for every tag",
    "    if (direct || propagated || system) {",
    "    if (true) {"],
  ["the breakdown never opens",
    "    if (direct || propagated || system) {",
    "    if (false) {"],
  ["a system count alone stops opening the breakdown",
    "    if (direct || propagated || system) {",
    "    if (direct || propagated) {"],
  ["the system count is listed even when there is none",
    "      if (system) {\n        parts.push(`${system} system`);\n      }",
    "      parts.push(`${system} system`);"],
  ["the singular and plural are swapped",
    '    const parts = [`${count} ${count === 1 ? "use" : "uses"}`];',
    '    const parts = [`${count} ${count === 1 ? "uses" : "use"}`];'],
  ["the total loses its fallback to zero",
    "    const count = Number(tag.usage_count || 0);",
    "    const count = Number(tag.usage_count);"],

  // --- the slug derivation -------------------------------------------------------------------------
  ["a slug stops being lower-cased",
    "      .toLowerCase()",
    "      .toString()"],
  ["punctuation stops collapsing to hyphens",
    "      .replace(/[^a-z0-9]+/g, \"-\")",
    '      .replace(/[^a-z0-9]+/g, "")'],
  ["leading and trailing hyphens survive",
    '      .replace(/^-+|-+$/g, "")',
    "      .replace(/^$/g, \"\")"],
  ["a slug stops being truncated",
    "      .slice(0, 80);",
    "      .slice(0);"],

  // --- the date and the row action ------------------------------------------------------------------
  ["an unreadable date is rendered rather than named unknown",
    '    if (!date || Number.isNaN(date.getTime())) {\n      return "unknown";\n    }',
    "    if (false) {\n      return \"unknown\";\n    }"],
  // Not attacked: widening `options.danger === true` to `Boolean(options.danger)` is
  // **equivalent under the declared contract**. `options` is `{ danger?: boolean }`, so the two
  // expressions differ only for values the declaration forbids, and the sole caller passes
  // `tag.status === "active"` - a real boolean. A case for it would have had to break the type
  // to fail, which is inventing an unreachable input rather than proving anything.
  ["a plain action button is never marked dangerous",
    '    button.classList.toggle("danger-button", options.danger === true);',
    '    button.classList.toggle("danger-button", false);'],
  ["the icon button loses its danger variant",
    '        variant: options.danger ? "danger" : "",',
    '        variant: "",'],
  ["the icon button is labelled with its icon name",
    "        label,\n        title: label,",
    "        label: icon,\n        title: label,"],

  // --- `0.33.33.38.3.7`: the control narrowings ---------------------------------------------------
  //
  // These are aimed at `tag-page-control-narrowing.test.mjs`, not at the rendering suite above.
  // The narrowings are runtime-inert for correct markup - `instanceof` only changes what happens
  // when the view renders the wrong element - so the cases attack the two things that can actually
  // go wrong: a finder that stops checking, and a binding pointed at a subtype the view does not
  // supply. The last three attack the absence handling that is the reason this page gets no
  // refusal helper at all.
  ["a finder asserts the subtype instead of checking it",
    "    return element instanceof HTMLInputElement ? element : null;",
    "    return /** @type {HTMLInputElement | null} */ (element);"],
  ["the input finder demands a textarea, which the view never renders",
    "    return element instanceof HTMLInputElement ? element : null;",
    "    return element instanceof HTMLTextAreaElement ? element : null;"],
  ["the form finder stops checking",
    "    return element instanceof HTMLFormElement ? element : null;",
    "    return element;"],
  ["the conflict line's finder demands an input",
    "    return element instanceof HTMLElement ? element : null;",
    "    return element instanceof HTMLInputElement ? element : null;"],
  ["the description field stops being narrowed at all",
    'const tagDescriptionInput = findTagInput("[data-tag-description]");',
    'const tagDescriptionInput = document.querySelector("[data-tag-description]");'],
  ["a field is captured through the wrong finder",
    'const tagNameInput = findTagInput("[data-tag-name]");',
    'const tagNameInput = findTagMessage("[data-tag-name]");'],
  ["the status filter list stops being filtered to elements that carry a dataset",
    '  const statusButtons = [...document.querySelectorAll("[data-tag-status-filter]")]\n'
      + "    .filter((button) => button instanceof HTMLElement);",
    '  const statusButtons = [...document.querySelectorAll("[data-tag-status-filter]")];'],
  ["a control this page needs no subtype for is narrowed anyway",
    'const tagList = document.querySelector("[data-tag-list]");',
    'const tagList = findTagMessage("[data-tag-list]");'],
  ["the list render stops tolerating an absent list",
    "    if (!tagList) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  ["the form reset stops tolerating an absent form",
    "    tagForm?.reset();",
    "    tagForm.reset();"],
  ["an absent control starts being refused rather than skipped",
    "  function findTagInput(selector) {\n    const element = document.querySelector(selector);",
    "  function findTagInput(selector) {\n    const element = document.querySelector(selector);\n"
      + "    if (!element) {\n      throw new TypeError(`The tags page requires its ${selector}.`);\n    }"],
];

runMutationCampaign({
  sourcePath: "public/js/tags.js",
  suites: ["tests/unit/tag-page-rendering.test.mjs", "tests/unit/tag-page-control-narrowing.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
