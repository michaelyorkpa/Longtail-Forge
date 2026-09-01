// Login is the only public form that creates a session cookie.
(function attachLoginPage() {
  const THEME_STORAGE_KEY = "lf_theme";
  const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const requiredPasswordForm = document.querySelector("[data-required-password-form]");
  const requiredCurrentPasswordInput = document.querySelector("[data-required-current-password]");
  const requiredNewPasswordInput = document.querySelector("[data-required-new-password]");
  const requiredConfirmPasswordInput = document.querySelector("[data-required-confirm-password]");
  const requiredPasswordStatus = document.querySelector("[data-required-password-status]");
  const rememberMeInput = loginForm?.querySelector('[name="rememberMe"]');
  let pendingLoginLandingPath = "/dashboard.html";

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginStatus("");

      const submitButton = loginForm.querySelector('button[type="submit"]');
      const formData = new FormData(loginForm);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");
      const rememberMe = Boolean(rememberMeInput?.checked);

      submitButton.disabled = true;

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
        submitButton.disabled = false;
      }
    });
  }

  requiredPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = requiredCurrentPasswordInput.value;
    const newPassword = requiredNewPasswordInput.value;
    const confirmPassword = requiredConfirmPasswordInput.value;
    const submitButton = requiredPasswordForm.querySelector('button[type="submit"]');

    if (newPassword !== confirmPassword) {
      setRequiredPasswordStatus("New passwords do not match.");
      return;
    }

    submitButton.disabled = true;
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

      requiredPasswordForm.reset();
      window.location.replace(pendingLoginLandingPath);
    } catch (error) {
      setRequiredPasswordStatus(requireErrors().caughtMessage(error, "Password was not changed."));
    } finally {
      submitButton.disabled = false;
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

  function showRequiredPasswordChange(currentPassword = "") {
    loginForm.hidden = true;
    requiredPasswordForm.hidden = false;
    requiredCurrentPasswordInput.value = currentPassword;
    loginForm.reset();
    (currentPassword ? requiredNewPasswordInput : requiredCurrentPasswordInput).focus();
  }

  function setLoginStatus(message) {
    if (loginStatus) {
      loginStatus.textContent = message;
    }
  }

  function setRequiredPasswordStatus(message) {
    if (requiredPasswordStatus) {
      requiredPasswordStatus.textContent = message;
    }
  }

  function normalizeThemeMode(value) {
    return ["light", "auto", "dark"].includes(value) ? value : "light";
  }

  function normalizeThemeAutoSource(value) {
    return value === "system" ? "system" : "system";
  }

  function normalizeLandingPath(value) {
    return [
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

  function renderPublicDemoAccountChooser(accounts, notice) {
    const usernameInput = loginForm.querySelector('[name="username"]');
    const passwordInput = loginForm.querySelector('[name="password"]');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const heading = loginForm.querySelector("h1");
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

  function normalizePublicDemoAccounts(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const accounts = value.map((account) => {
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
        ? normalized
        : null;
    }).filter(Boolean);

    if (new Set(accounts.map((account) => account.username)).size !== accounts.length) {
      return [];
    }
    return accounts;
  }

  function normalizePublicDemoTextList(value) {
    return Array.isArray(value)
      ? value.map(normalizePublicDemoText).filter(Boolean)
      : [];
  }

  function normalizePublicDemoText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

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
