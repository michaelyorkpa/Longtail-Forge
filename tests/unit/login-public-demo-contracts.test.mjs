import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/login.js");

/**
 * The login page's public-demo normalizer and its landing-path contract.
 *
 * Nineteen of the twenty-three diagnostics were parameter annotations the compiler proves. What
 * changed at runtime is a short list: the cached form is narrowed at acquisition, an absent one
 * is refused by name rather than by a property read, and the account normalizer answers through
 * `flatMap` instead of `map(...).filter(Boolean)`. The normalizer is also the page's own proof
 * of the account shape, and **the landing path decides where a freshly authenticated session is
 * sent**, so its closed list is asserted rather than assumed.
 */

const LIFTED = [
  "normalizePublicDemoAccounts", "normalizePublicDemoTextList", "normalizePublicDemoText",
  "normalizeThemeMode", "normalizeThemeAutoSource", "normalizeLandingPath",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function loginCase() {
  const sandbox = vm.createContext({});
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

/**
 * One account as the route sends it, with every member the normalizer requires.
 *
 * The return is a record so a case can delete a member by name and watch the whole account be
 * refused, which is the point of the completeness check.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
const account = (overrides = {}) => ({
  allowedActions: ["read notes"],
  expectedDenials: ["delete workspace"],
  password: "demo-pass",
  representativeRecords: ["a note"],
  roleName: "Reader",
  scopeLabel: "Workspace",
  username: "demo-reader",
  ...overrides,
});

/** Six distinct accounts, which is the count the chooser requires before it renders. */
const sixAccounts = () => [0, 1, 2, 3, 4, 5].map((index) => account({ username: `demo-${index}` }));

describe("Public demo account normalizer", () => {
  it("keeps the seven members it proves, and nothing else", () => {
    const api = loginCase();
    const [normalized] = api.normalizePublicDemoAccounts([account({ extra: "ignored" })]);
    assert.deepEqual(Object.keys(normalized).sort(), [
      "allowedActions", "expectedDenials", "password", "representativeRecords",
      "roleName", "scopeLabel", "username",
    ]);
    assert.equal(normalized.extra, undefined, "an unmodelled member must not survive");
  });

  it("answers the six accounts the chooser expects", () => {
    const api = loginCase();
    assert.equal(api.normalizePublicDemoAccounts(sixAccounts()).length, 6);
  });

  /** Every member is required: an account missing one is refused entirely, not patched. */
  it("refuses an account missing any single member", () => {
    const api = loginCase();
    for (const member of ["allowedActions", "expectedDenials", "password",
      "representativeRecords", "roleName", "scopeLabel", "username"]) {
      const incomplete = account();
      delete incomplete[member];
      assert.deepEqual(plain(api.normalizePublicDemoAccounts([incomplete])), [], `member: ${member}`);
    }
  });

  it("refuses an account whose text member is blank or whose list is empty", () => {
    const api = loginCase();
    assert.deepEqual(plain(api.normalizePublicDemoAccounts([account({ roleName: "   " })])), []);
    assert.deepEqual(plain(api.normalizePublicDemoAccounts([account({ allowedActions: [] })])), []);
    assert.deepEqual(plain(api.normalizePublicDemoAccounts([account({ username: "" })])), []);
  });

  /**
   * **Duplicate usernames void the whole list**, because the chooser keys its selection by
   * username and two identical keys would make the wrong credentials reachable.
   */
  it("answers nothing at all when two accounts share a username", () => {
    const api = loginCase();
    const duplicated = [account({ username: "same" }), account({ username: "same" })];
    assert.deepEqual(plain(api.normalizePublicDemoAccounts(duplicated)), []);
  });

  /**
   * `flatMap` replaced `map(...).filter(Boolean)` so the duplicate check below is not reading a
   * member off a refused account. The list it answers must be unchanged: refused entries gone,
   * survivors in their original order.
   */
  it("drops refused accounts and keeps the survivors in order", () => {
    const api = loginCase();
    const mixed = [account({ username: "a" }), account({ username: "b", password: "" }), account({ username: "c" })];
    assert.deepEqual(api.normalizePublicDemoAccounts(mixed).map((/** @type {{ username: string }} */ entry) => entry.username), ["a", "c"]);
  });

  /**
   * **Non-throwing first.** Dropping the array guard makes the collection call `flatMap` on a
   * value that has none, so the reader crashes rather than answering an empty list - and a
   * crash is not the same evidence as a wrong answer.
   */
  it("answers nothing for a body that carries no list", () => {
    const api = loginCase();
    for (const value of [null, undefined, "accounts", 6, {}]) {
      assert.doesNotThrow(() => api.normalizePublicDemoAccounts(value), `value: ${JSON.stringify(value)}`);
      assert.deepEqual(plain(api.normalizePublicDemoAccounts(value)), [], `value: ${JSON.stringify(value)}`);
    }
  });

  it("trims the text it keeps and drops blanks from the lists", () => {
    const api = loginCase();
    const [normalized] = api.normalizePublicDemoAccounts([account({
      allowedActions: ["  read  ", "", "   ", "write"],
      roleName: "  Reader  ",
    })]);
    assert.equal(normalized.roleName, "Reader");
    assert.deepEqual(plain(normalized.allowedActions), ["read", "write"]);
  });

  it("refuses a non-record entry without refusing its neighbours", () => {
    const api = loginCase();
    const mixed = [null, account({ username: "a" }), "account", 5];
    assert.deepEqual(api.normalizePublicDemoAccounts(mixed).map((/** @type {{ username: string }} */ entry) => entry.username), ["a"]);
  });
});

describe("Login landing path", () => {
  /**
   * **This decides where a freshly authenticated session is sent.** The list is closed, so a
   * value outside it must land on the dashboard rather than being followed.
   */
  it("follows only the six paths it names", () => {
    const api = loginCase();
    for (const path of ["/dashboard.html", "/workbench.html", "/tasks.html",
      "/notes.html", "/lists.html", "/account-recovery.html"]) {
      assert.equal(api.normalizeLandingPath(path), path);
    }
  });

  it("sends anything else to the dashboard", () => {
    const api = loginCase();
    for (const path of ["/admin.html", "https://elsewhere.test/", "//elsewhere.test/",
      "/dashboard.html?next=x", "", " /tasks.html", null, undefined, 5, {}, ["/tasks.html"]]) {
      assert.equal(api.normalizeLandingPath(path), "/dashboard.html", `path: ${JSON.stringify(path)}`);
    }
  });
});

describe("Login theme normalizers", () => {
  it("keeps the three theme modes and defaults anything else", () => {
    const api = loginCase();
    for (const mode of ["light", "auto", "dark"]) assert.equal(api.normalizeThemeMode(mode), mode);
    for (const mode of ["", "Dark", "system", null, undefined, 5, {}]) {
      assert.equal(api.normalizeThemeMode(mode), "light", `mode: ${JSON.stringify(mode)}`);
    }
  });

  /** Both arms answer the same word; the case records that rather than asserting a choice. */
  it("answers one auto source for every value", () => {
    const api = loginCase();
    for (const value of ["system", "", "manual", null, undefined, 5]) {
      assert.equal(api.normalizeThemeAutoSource(value), "system", `value: ${String(value)}`);
    }
  });
});

describe("login.js shapes this page states rather than invents", () => {
  /** The account shape is earned by the normalizer, not claimed from a published record. */
  it("names the demo account locally over the members its normalizer proves", () => {
    assert.match(source, /@typedef \{object\} PublicDemoAccount/);
    for (const member of ["allowedActions", "expectedDenials", "password",
      "representativeRecords", "roleName", "scopeLabel", "username"]) {
      assert.match(source, new RegExp(`@property \\{string(?:\\[\\])?\\} ${member}`), `missing ${member}`);
    }
  });

  /** The form is narrowed once, at acquisition, because FormData requires a form element. */
  it("narrows the cached login form to a form element", () => {
    assert.match(source, /const loginForm = loginFormElement instanceof HTMLFormElement \? loginFormElement : null;/);
    assert.match(source, /new FormData\(loginForm\)/);
  });

  /**
   * **The absent form is refused by name, not by an early return.** A silent skip would have
   * stopped the password-change form from ever appearing.
   */
  it("refuses an absent form rather than skipping the work that needs it", () => {
    assert.match(source, /function requireLoginForm\(\) \{[\s\S]*throw new TypeError\("The login page requires its login form\."\)/);
    assert.doesNotMatch(source, /if \(!loginForm\) \{\n\s*return;\n\s*\}\n\s*loginForm\./);
  });

  /**
   * `0.33.33.38.3.3` extended that one narrowing to the rest of the page's lookups.
   *
   * `querySelector` answers an `Element`; `value`, `checked`, `disabled`, `reset` and `focus`
   * belong to the subtypes the login view renders. Each narrowing is `instanceof`, which is
   * what the DOM actually guarantees - not a cast, an assertion or a type parameter treated as
   * validation - and each takes a node rather than a selector, because half of this page's
   * lookups are scoped to a form.
   */
  it("narrows every control it reads a subtype member from", () => {
    assert.match(source, /function asInput\(node\) \{\s*\n\s*return node instanceof HTMLInputElement \? node : null;/);
    assert.match(source, /function asButton\(node\) \{\s*\n\s*return node instanceof HTMLButtonElement \? node : null;/);
    assert.match(source, /function asForm\(node\) \{\s*\n\s*return node instanceof HTMLFormElement \? node : null;/);
    assert.doesNotMatch(source, /@type \{HTMLInputElement\}|\/\*\* @type \{HTML[A-Za-z]+Element\} \*\/ \(/,
      "no lookup is asserted into its subtype");

    for (const [binding, narrower] of [
      ["requiredPasswordForm", "asForm"],
      ["requiredCurrentPasswordInput", "asInput"],
      ["requiredNewPasswordInput", "asInput"],
      ["requiredConfirmPasswordInput", "asInput"],
      ["rememberMeInput", "asInput"],
    ]) {
      assert.match(source, new RegExp(`const ${binding} = ${narrower}\\(`), `${binding} is narrowed`);
    }
  });

  /**
   * **A required control is refused by name at its use, not skipped.** Turning any of these
   * into an optional no-op would leave the password-change form wired to nothing and report
   * success, which is the failure this cohort exists to prevent.
   */
  it("refuses an absent required control rather than skipping the write", () => {
    assert.match(source, /function requireSubmitButton\(button\) \{[\s\S]*throw new TypeError\("The login page requires its submit button\."\)/);
    assert.match(source, /function requirePasswordInput\(input\) \{[\s\S]*throw new TypeError\("The login page requires its password-change controls\."\)/);
    assert.match(source, /function requireRequiredPasswordForm\(\) \{[\s\S]*throw new TypeError\("The login page requires its password-change form\."\)/);
    // Counted rather than matched once: both handlers disable and re-enable their button, so a
    // single `assert.match` would still pass with one of the four sites weakened.
    assert.equal((source.match(/requireSubmitButton\(submitButton\)\.disabled/g) || []).length, 4,
      "both handlers disable and re-enable through the checked button");
    assert.match(source, /requireRequiredPasswordForm\(\)\.hidden = false;/);
    assert.doesNotMatch(source, /submitButton\?\.disabled|requiredPasswordForm\?\.hidden|requiredCurrentPasswordInput\?\.value/,
      "no required control is read through an optional chain");
    assert.doesNotMatch(source, /if \(submitButton\)|if \(requiredPasswordForm\)|if \(requiredCurrentPasswordInput\)/,
      "nor through a guard that turns a required write into a no-op");
  });

  /** `filter(Boolean)` does not tell the compiler the refused entries are gone. */
  it("collects surviving accounts through flatMap", () => {
    assert.match(source, /const accounts = value\.flatMap\(\(account\) => \{/);
    assert.doesNotMatch(source, /\}\)\.filter\(Boolean\);/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });
});
