import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Scoped to what changed and to the two contracts worth defending.** Nineteen of the
// twenty-three diagnostics were parameter annotations the compiler proves. What changed at
// runtime is the form narrowing, its named refusal, and the `flatMap` collection. The landing
// path and the account normalizer are attacked alongside them because this is the unauthenticated
// entry point: the first decides where an authenticated session is sent, and the second decides
// which credentials the demo chooser can offer.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the collection this checkpoint changed -------------------------------------------------------
  ["a refused account survives into the list",
    "        ? [normalized]\n        : [];",
    "        ? [normalized]\n        : [normalized];"],
  ["every account is refused",
    "        ? [normalized]\n        : [];",
    "        ? []\n        : [];"],
  ["the completeness check stops requiring every member",
    "      return Object.values(normalized).every((item) => Array.isArray(item) ? item.length > 0 : Boolean(item))",
    "      return true"],
  ["an empty list counts as a present member",
    "Array.isArray(item) ? item.length > 0 : Boolean(item)",
    "Array.isArray(item) ? true : Boolean(item)"],
  ["a blank text member counts as present",
    "Array.isArray(item) ? item.length > 0 : Boolean(item)",
    "Array.isArray(item) ? item.length > 0 : true"],

  // --- the duplicate-username refusal ------------------------------------------------------------------
  ["two accounts may share a username",
    "    if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {\n      return [];\n    }",
    "    if (false) {\n      return [];\n    }"],
  ["the duplicate check reads the wrong member",
    "    if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {",
    "    if (new Set(accounts.map((account) => account.roleName)).size !== accounts.length) {"],

  // --- the list container refusal ------------------------------------------------------------------------
  ["a body that carries no list is read anyway",
    "    if (!Array.isArray(value)) {\n      return [];\n    }",
    "    if (false) {\n      return [];\n    }"],

  // --- the landing path, which decides where an authenticated session goes --------------------------------
  ["any landing path the body names is followed",
    '  function normalizeLandingPath(value) {\n    return typeof value === "string" && [',
    '  function normalizeLandingPath(value) {\n    return typeof value === "string" ? value : "/dashboard.html";\n    // eslint-disable-next-line no-unreachable\n    return typeof value === "string" && ['],
  ["the landing list gains a path it does not name",
    '      "/dashboard.html",\n      "/workbench.html",',
    '      "/dashboard.html",\n      "/admin.html",\n      "/workbench.html",'],
  ["an unrecognised landing path is followed rather than defaulted",
    '    ].includes(value) ? value : "/dashboard.html";',
    "    ].includes(value) ? value : String(value);"],

  // --- the theme normalizers ------------------------------------------------------------------------------
  ["an unrecognised theme mode is stored",
    '    return typeof value === "string" && ["light", "auto", "dark"].includes(value) ? value : "light";',
    '    return typeof value === "string" ? value : "light";'],
  ["every theme mode collapses to the default",
    '    return typeof value === "string" && ["light", "auto", "dark"].includes(value) ? value : "light";',
    '    return "light";'],

  // --- the text readers the normalizer is built from --------------------------------------------------------
  ["a text member stops being trimmed",
    "  function normalizePublicDemoText(value) {",
    "  function normalizePublicDemoText(value) {\n    if (typeof value === \"string\") return value;"],
  ["a list stops dropping its blank entries",
    "      ? value.map(normalizePublicDemoText).filter(Boolean)",
    "      ? value.map(normalizePublicDemoText)"],

  // --- the form narrowing and its refusal ---------------------------------------------------------------------
  ["the cached form stops being narrowed to a form element",
    "  const loginForm = loginFormElement instanceof HTMLFormElement ? loginFormElement : null;",
    "  const loginForm = loginFormElement;"],
  ["an absent form is skipped instead of refused",
    '    if (!loginForm) {\n      throw new TypeError("The login page requires its login form.");\n    }\n    return loginForm;',
    "    return loginForm;"],

  // --- `0.33.33.38.3.3`: the rest of the page's lookups, and their refusals ---------------------
  // Each of these turns a checked lookup back into an unchecked one, or a required control into
  // an optional no-op. The second shape is the one that matters: it leaves the password-change
  // form wired to nothing and reports success.
  ["a control stops being narrowed to an input element",
    "    return node instanceof HTMLInputElement ? node : null;",
    "    return node;"],
  ["a control stops being narrowed to a button element",
    "    return node instanceof HTMLButtonElement ? node : null;",
    "    return node;"],
  ["the password-change form stops being narrowed",
    '  const requiredPasswordForm = asForm(document.querySelector("[data-required-password-form]"));',
    '  const requiredPasswordForm = document.querySelector("[data-required-password-form]");'],
  ["an absent submit button is skipped instead of refused",
    '    if (!button) {\n      throw new TypeError("The login page requires its submit button.");\n    }\n    return button;',
    "    return button;"],
  ["an absent password control is skipped instead of refused",
    '    if (!input) {\n      throw new TypeError("The login page requires its password-change controls.");\n    }\n    return input;',
    "    return input;"],
  ["the submit button is disabled through an optional chain",
    "      requireSubmitButton(submitButton).disabled = true;",
    "      if (submitButton) submitButton.disabled = true;"],
  ["the password-change form is revealed through an optional chain",
    "    requireRequiredPasswordForm().hidden = false;",
    "    if (requiredPasswordForm) requiredPasswordForm.hidden = false;"],
];

runMutationCampaign({
  sourcePath: "public/js/login.js",
  suites: ["tests/unit/login-public-demo-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
