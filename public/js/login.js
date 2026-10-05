// Login is the only public form that creates a session cookie.
(function attachLoginPage() {
  const THEME_STORAGE_KEY = "lf_theme";
  const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
  /**
   * One public demo account, as this page's own normalizer proves it.
   *
   * **Earned by construction rather than claimed.** `normalizePublicDemoAccounts` rebuilds every
   * member by name and then refuses the whole account unless each one is a non-empty string or a
   * non-empty list, so the shape below is what survives that check - not what the route is hoped
   * to send. The estate publishes no demo-account record, so it is named here.
   * @typedef {object} PublicDemoAccount
   * @property {string[]} allowedActions
   * @property {string[]} expectedDenials
   * @property {string} password
   * @property {string[]} representativeRecords
   * @property {string} roleName
   * @property {string} scopeLabel
   * @property {string} username
   */

  // `new FormData` takes an `HTMLFormElement`, and `querySelector` answers an `Element`. The
  // narrowing happens once, where the element is acquired, rather than at the one call that
  // needs it. A matching element that is not a form now leaves the page unwired instead of
  // reaching `FormData` with something it would refuse; the login view always renders a form.
  const loginFormElement = document.querySelector("[data-login-form]");
  const loginForm = loginFormElement instanceof HTMLFormElement ? loginFormElement : null;
  const loginStatus = document.querySelector("[data-login-status]");
  const requiredPasswordForm = asForm(document.querySelector("[data-required-password-form]"));
  const requiredCurrentPasswordInput = asInput(document.querySelector("[data-required-current-password]"));
  const requiredNewPasswordInput = asInput(document.querySelector("[data-required-new-password]"));
  const requiredConfirmPasswordInput = asInput(document.querySelector("[data-required-confirm-password]"));
  const requiredPasswordStatus = document.querySelector("[data-required-password-status]");
  const rememberMeInput = asInput(loginForm?.querySelector('[name="rememberMe"]'));
  let pendingLoginLandingPath = "/dashboard.html";

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginStatus("");

      const submitButton = asButton(loginForm.querySelector('button[type="submit"]'));
      const formData = new FormData(loginForm);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");
      const rememberMe = Boolean(rememberMeInput?.checked);

      requireSubmitButton(submitButton).disabled = true;

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password, rememberMe }),
        });

        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw apiError(body, "Login failed.", response.status);
        }

        const themeMode = normalizeThemeMode(body.user?.themeMode);
        const themeAutoSource = normalizeThemeAutoSource(body.user?.themeAutoSource);
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, themeAutoSource);
        window.localStorage.setItem("lf_timezone", body.user?.timezone || "America/New_York");
        if (body.user?.workspaceContext) {
          window.localStorage.setItem("lf_workspace_context", JSON.stringify(body.user.workspaceContext));
        }
        pendingLoginLandingPath = normalizeLandingPath(body.user?.loginLandingPath);
        if (body.user?.passwordChangeRequired) {
          showRequiredPasswordChange(password);
        } else {
          window.location.assign(pendingLoginLandingPath);
        }
      } catch (error) {
        setLoginStatus(requireErrors().caughtMessage(error, "Login failed."));
      } finally {
        requireSubmitButton(submitButton).disabled = false;
      }
    });
  }

  requiredPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = requirePasswordInput(requiredCurrentPasswordInput).value;
    const newPassword = requirePasswordInput(requiredNewPasswordInput).value;
    const confirmPassword = requirePasswordInput(requiredConfirmPasswordInput).value;
    const submitButton = asButton(requireRequiredPasswordForm().querySelector('button[type="submit"]'));

    if (newPassword !== confirmPassword) {
      setRequiredPasswordStatus("New passwords do not match.");
      return;
    }

    requireSubmitButton(submitButton).disabled = true;
    setRequiredPasswordStatus("Changing password...");

    try {
      const response = await fetch("/api/user/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw apiError(body, "Password was not changed.", response.status);
      }

      requireRequiredPasswordForm().reset();
      window.location.replace(pendingLoginLandingPath);
    } catch (error) {
      setRequiredPasswordStatus(requireErrors().caughtMessage(error, "Password was not changed."));
    } finally {
      requireSubmitButton(submitButton).disabled = false;
    }
  });

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("The login page requires LongtailForge.errors.");
    }
    return errors;
  }

  async function redirectIfLoggedIn() {
    try {
      // Keep returning users out of the login form when their cookie is still valid.
      const response = await fetch("/api/session", { cache: "no-store" });

      if (response.ok) {
        const body = await response.json().catch(() => ({}));

        const themeMode = normalizeThemeMode(body.user?.themeMode);
        const themeAutoSource = normalizeThemeAutoSource(body.user?.themeAutoSource);
        window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, themeAutoSource);
        window.localStorage.setItem("lf_timezone", body.user?.timezone || "America/New_York");
        if (body.user?.workspaceContext) {
          window.localStorage.setItem("lf_workspace_context", JSON.stringify(body.user.workspaceContext));
        }
        pendingLoginLandingPath = normalizeLandingPath(body.user?.loginLandingPath);
        if (body.user?.passwordChangeRequired) {
          showRequiredPasswordChange();
        } else {
          window.location.replace(pendingLoginLandingPath);
        }
      }
    } catch {
      // The login page is the fallback when session lookup fails.
    }
  }

  /**
   * The login form this page cannot hide, reset or search without.
   *
   * **It throws rather than returning, and that is the point.** Narrowing the cached element to
   * an `HTMLFormElement` left its nullness as the remaining complaint, and answering that with
   * an early return would have silently skipped showing the password-change form. This fails at
   * the same statement the property read already failed at, naming what is missing.
   * @returns {HTMLFormElement}
   */
  /**
   * The narrowings this page's lookups need.
   *
   * `querySelector` answers an `Element`, and `value`, `checked`, `disabled`, `reset` and
   * `focus` belong to the subtypes the login view renders. Each element is narrowed where it is
   * acquired - the way `loginForm` above already is - so a matching node of the wrong subtype
   * behaves as absence rather than reaching a member it does not carry.
   *
   * These take a node rather than a selector, because half of this page's lookups are scoped to
   * a form rather than to the document.
   *
   * @param {Element | null | undefined} node
   * @returns {HTMLInputElement | null}
   */
  function asInput(node) {
    return node instanceof HTMLInputElement ? node : null;
  }

  /** @param {Element | null | undefined} node @returns {HTMLButtonElement | null} */
  function asButton(node) {
    return node instanceof HTMLButtonElement ? node : null;
  }

  /** @param {Element | null | undefined} node @returns {HTMLFormElement | null} */
  function asForm(node) {
    return node instanceof HTMLFormElement ? node : null;
  }

  /**
   * The submit button a handler is already mid-way through using.
   *
   * Checked at its use rather than at its lookup, so the capture stays exactly as long as it
   * did and the failure lands inside the handler that already caught the null dereference.
   *
   * @param {HTMLButtonElement | null} button
   * @returns {HTMLButtonElement}
   */
  function requireSubmitButton(button) {
    if (!button) {
      throw new TypeError("The login page requires its submit button.");
    }
    return button;
  }

  /**
   * One of the password-change controls, checked at its use for the same reason.
   * @param {HTMLInputElement | null} input
   * @returns {HTMLInputElement}
   */
  function requirePasswordInput(input) {
    if (!input) {
      throw new TypeError("The login page requires its password-change controls.");
    }
    return input;
  }

  /** @returns {HTMLFormElement} */
  function requireRequiredPasswordForm() {
    if (!requiredPasswordForm) {
      throw new TypeError("The login page requires its password-change form.");
    }
    return requiredPasswordForm;
  }

  function requireLoginForm() {
    if (!loginForm) {
      throw new TypeError("The login page requires its login form.");
    }
    return loginForm;
  }

  /** @param {string} [currentPassword] */
  function showRequiredPasswordChange(currentPassword = "") {
    const form = requireLoginForm();
    form.hidden = true;
    requireRequiredPasswordForm().hidden = false;
    requirePasswordInput(requiredCurrentPasswordInput).value = currentPassword;
    form.reset();
    requirePasswordInput(currentPassword ? requiredNewPasswordInput : requiredCurrentPasswordInput).focus();
  }

  /** @param {string} message */
  function setLoginStatus(message) {
    if (loginStatus) {
      loginStatus.textContent = message;
    }
  }

  /** @param {string} message */
  function setRequiredPasswordStatus(message) {
    if (requiredPasswordStatus) {
      requiredPasswordStatus.textContent = message;
    }
  }

  /**
   * The stored theme mode, defaulting anything unrecognised to light.
   *
   * The value arrives from a wire body, so it is declared `unknown`. Asking whether it is a
   * string first is equivalent to what the membership test already answered on its own: a
   * non-string never matched any entry in the list.
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeThemeMode(value) {
    return typeof value === "string" && ["light", "auto", "dark"].includes(value) ? value : "light";
  }

  /**
   * The auto-theme source, of which there is currently exactly one.
   *
   * Both arms answer the same word. That is pre-existing and behaviour-neutral, and typing this
   * file does not require collapsing it, so it is recorded rather than tidied - the same
   * treatment `theme-init.js` received in `0.33.33.44.41`, where the identical branch appears.
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeThemeAutoSource(value) {
    return value === "system" ? "system" : "system";
  }

  /**
   * The landing path this user prefers, defaulting anything unrecognised to the dashboard.
   *
   * **This decides where a freshly authenticated session is sent**, so the closed list is the
   * contract. The string check is equivalent to the membership test it guards.
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeLandingPath(value) {
    return typeof value === "string" && [
      "/dashboard.html",
      "/workbench.html",
      "/tasks.html",
      "/notes.html",
      "/lists.html",
      "/account-recovery.html",
    ].includes(value) ? value : "/dashboard.html";
  }

  redirectIfLoggedIn();
  void loadPublicDemoAccountChooser();

  async function loadPublicDemoAccountChooser() {
    if (!loginForm) {
      return;
    }

    try {
      const response = await fetch("/api/public-demo/accounts", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const body = await response.json().catch(() => null);
      const accounts = normalizePublicDemoAccounts(body?.accounts);
      const notice = normalizePublicDemoText(body?.notice);
      if (accounts.length !== 6 || !notice) {
        return;
      }

      renderPublicDemoAccountChooser(accounts, notice);
    } catch {
      // Login remains the safe fallback when optional demo guidance is unavailable.
    }
  }

  /** @param {PublicDemoAccount[]} accounts @param {string} notice */
  function renderPublicDemoAccountChooser(accounts, notice) {
    // Its only caller has already refused an absent form, so this restates that rather than
    // discovering it; the four control checks below keep their own early return.
    const form = requireLoginForm();
    const usernameInput = asInput(form.querySelector('[name="username"]'));
    const passwordInput = asInput(form.querySelector('[name="password"]'));
    const submitButton = asButton(form.querySelector('button[type="submit"]'));
    const heading = form.querySelector("h1");
    if (!usernameInput || !passwordInput || !submitButton || !heading) {
      return;
    }

    const helper = document.createElement("fieldset");
    helper.className = "demo-account-helper";
    helper.dataset.demoAccountHelper = "";

    const legend = document.createElement("legend");
    legend.textContent = "Explore the public demo";
    helper.append(legend);

    const noticeCopy = document.createElement("p");
    noticeCopy.className = "demo-account-notice";
    noticeCopy.textContent = notice;
    helper.append(noticeCopy);

    const label = document.createElement("label");
    label.htmlFor = "demo-account-choice";
    label.textContent = "Choose a role and scope";
    const select = document.createElement("select");
    select.id = "demo-account-choice";
    select.dataset.demoAccountChoice = "";
    select.required = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a demo account";
    select.append(placeholder);
    for (const account of accounts) {
      const option = document.createElement("option");
      option.value = account.username;
      option.textContent = `${account.roleName} — ${account.scopeLabel}`;
      select.append(option);
    }
    label.append(select);
    helper.append(label);

    const details = document.createElement("section");
    details.className = "demo-account-details";
    details.dataset.demoAccountDetails = "";
    details.setAttribute("aria-live", "polite");
    details.setAttribute("aria-atomic", "true");
    const prompt = document.createElement("p");
    prompt.textContent = "Choose an account to see representative records, useful actions, and expected limits.";
    details.append(prompt);
    helper.append(details);

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.dataset.demoAccountUse = "";
    useButton.disabled = true;
    useButton.textContent = "Use this account";
    helper.append(useButton);

    const helperStatus = document.createElement("p");
    helperStatus.className = "demo-account-status";
    helperStatus.dataset.demoAccountStatus = "";
    helperStatus.setAttribute("role", "status");
    helperStatus.setAttribute("aria-live", "polite");
    helper.append(helperStatus);

    /** @type {PublicDemoAccount | null} */
    let selectedAccount = null;
    select.addEventListener("change", () => {
      selectedAccount = accounts.find((account) => account.username === select.value) || null;
      renderPublicDemoAccountDetails(details, selectedAccount);
      useButton.disabled = !selectedAccount;
      helperStatus.textContent = "";
    });

    useButton.addEventListener("click", () => {
      if (!selectedAccount) {
        return;
      }
      usernameInput.value = selectedAccount.username;
      passwordInput.value = selectedAccount.password;
      usernameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
      passwordInput.dispatchEvent(new window.Event("input", { bubbles: true }));
      setLoginStatus("");
      helperStatus.textContent = `${selectedAccount.roleName} credentials are ready. Activate Log In to authenticate.`;
      submitButton.focus();
    });

    heading.insertAdjacentElement("afterend", helper);
    document.querySelector(".login-page")?.classList.add("login-page--public-demo");
    if (document.activeElement === usernameInput && !usernameInput.value && !passwordInput.value) {
      select.focus();
    }
  }

  /** @param {HTMLElement} container @param {PublicDemoAccount | null} account */
  function renderPublicDemoAccountDetails(container, account) {
    container.replaceChildren();
    if (!account) {
      const prompt = document.createElement("p");
      prompt.textContent = "Choose an account to see representative records, useful actions, and expected limits.";
      container.append(prompt);
      return;
    }

    const heading = document.createElement("h2");
    heading.textContent = `${account.roleName} — ${account.scopeLabel}`;
    container.append(heading);
    appendDemoGuidanceList(container, "Representative records", account.representativeRecords);
    appendDemoGuidanceList(container, "Useful actions", account.allowedActions);
    appendDemoGuidanceList(container, "Expected limits", account.expectedDenials);
  }

  /** @param {HTMLElement} container @param {string} headingText @param {string[]} items */
  function appendDemoGuidanceList(container, headingText, items) {
    const group = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    const list = document.createElement("ul");
    for (const item of items) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.append(listItem);
    }
    group.append(heading, list);
    container.append(group);
  }

  /**
   * The six demo accounts the route offers, or none at all.
   *
   * **`flatMap` rather than `map(...).filter(Boolean)`**, which answers the same list in the
   * same order: `filter(Boolean)` does not tell the compiler the refused entries are gone, so
   * the duplicate-username check below would have been reading a member off a possibly-absent
   * account. Nothing about which accounts survive has changed.
   * @param {unknown} value
   * @returns {PublicDemoAccount[]}
   */
  function normalizePublicDemoAccounts(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const accounts = value.flatMap((account) => {
      const normalized = {
        allowedActions: normalizePublicDemoTextList(account?.allowedActions),
        expectedDenials: normalizePublicDemoTextList(account?.expectedDenials),
        password: normalizePublicDemoText(account?.password),
        representativeRecords: normalizePublicDemoTextList(account?.representativeRecords),
        roleName: normalizePublicDemoText(account?.roleName),
        scopeLabel: normalizePublicDemoText(account?.scopeLabel),
        username: normalizePublicDemoText(account?.username),
      };
      return Object.values(normalized).every((item) => Array.isArray(item) ? item.length > 0 : Boolean(item))
        ? [normalized]
        : [];
    });

    if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {
      return [];
    }
    return accounts;
  }

  /** @param {unknown} value @returns {string[]} */
  function normalizePublicDemoTextList(value) {
    return Array.isArray(value)
      ? value.map(normalizePublicDemoText).filter(Boolean)
      : [];
  }

  /** @param {unknown} value @returns {string} */
  function normalizePublicDemoText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /** @param {unknown} body @param {string} fallback @param {number} status */
  function apiError(body, fallback, status) {
    return window.LongtailForge?.errors?.createError?.(body, fallback, status)
      || new Error(fallback);
  }

  // The required-password-change form is only reached through a server
  // response to a temporary password, so the login end-to-end suite drives the
  // transition directly. Scoping this controller removed the implicit global
  // that suite had been reaching for, so the transition is published as one
  // named surface rather than left as an accident of top-level declaration.
  window.LongtailForge = window.LongtailForge || {};
  window.LongtailForge.loginPage = Object.freeze({ showRequiredPasswordChange });
})();
