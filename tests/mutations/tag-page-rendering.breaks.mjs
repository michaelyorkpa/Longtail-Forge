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
];

runMutationCampaign({
  sourcePath: "public/js/tags.js",
  suites: ["tests/unit/tag-page-rendering.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
