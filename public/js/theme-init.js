(function () {
  const THEME_STORAGE_KEY = "lf_theme";
  const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
  const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
  const CSRF_COOKIE_NAME = "lf_csrf";
  const CSRF_HEADER_NAME = "X-CSRF-Token";

  installCsrfFetchGuard();

  const cookieTheme = readCookie(THEME_STORAGE_KEY);
  const cookieThemeAutoSource = readCookie(THEME_AUTO_SOURCE_STORAGE_KEY);
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) || "";
  const storedThemeAutoSource = window.localStorage.getItem(THEME_AUTO_SOURCE_STORAGE_KEY) || "";
  const documentThemeMode = document.documentElement.dataset.themeMode || document.documentElement.dataset.theme || "";
  const documentThemeAutoSource = document.documentElement.dataset.themeAutoSource || "";
  const themeMode = normalizeThemeMode(cookieTheme || storedTheme || documentThemeMode);
  const themeAutoSource = normalizeThemeAutoSource(cookieThemeAutoSource || storedThemeAutoSource || documentThemeAutoSource);
  const theme = resolveThemeMode(themeMode, themeAutoSource);

  document.documentElement.dataset.themeMode = themeMode;
  document.documentElement.dataset.themeAutoSource = themeAutoSource;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  /** @param {string} name */
  function readCookie(name) {
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`));

    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
  }

  /**
   * Wrap `window.fetch` so same-origin API mutations carry the CSRF header, once.
   *
   * **The marker is read by own key rather than declared onto the DOM's `fetch` type.**
   * Saying `window.fetch` *is* a guarded fetch would assert the very thing this line exists to
   * find out, and the marker is not part of the platform's contract - it is this module's own
   * stamp, and only ever its own. `Object.hasOwn` asks exactly the question the read was
   * asking: does this function carry our mark? It answers the same for every value this file
   * produces, and refuses an inherited one, which the truthiness read would have accepted.
   */
  function installCsrfFetchGuard() {
    // Declared inside the guard, not beside the other constants: the composition regression
    // lifts this function on its own and runs it, so a name declared at module scope would be
    // a free variable there. The marker stays this function's business either way.
    const guardMarker = "__longtailCsrfGuard";

    if (typeof window.fetch !== "function" || Object.hasOwn(window.fetch, guardMarker)) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    /** @type {Promise<string> | null} */
    let pendingToken = null;
    /** @param {RequestInfo | URL} input @param {RequestInit} [init] */
    const guardedFetch = async function (input, init = {}) {
      const url = resolveRequestUrl(input);
      const method = resolveRequestMethod(input, init);
      if (!url || url.origin !== window.location.origin || !isProtectedApiMutation(url, method)) {
        return originalFetch(input, init);
      }

      const csrfToken = readCookie(CSRF_COOKIE_NAME) || await loadCsrfToken();
      const isRequest = typeof window.Request === "function" && input instanceof window.Request;
      const headers = new window.Headers(isRequest ? input.headers : undefined);
      new window.Headers(init.headers || undefined).forEach((value, name) => headers.set(name, value));
      headers.set(CSRF_HEADER_NAME, csrfToken);
      return originalFetch(input, { ...init, headers });
    };
    guardedFetch[guardMarker] = true;
    window.fetch = guardedFetch;

    async function loadCsrfToken() {
      if (!pendingToken) {
        pendingToken = originalFetch("/api/csrf-token", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error("Could not establish browser request protection.");
          }
          const payload = await response.json();
          return String(payload.csrfToken || "");
        }).finally(() => {
          pendingToken = null;
        });
      }
      return pendingToken;
    }
  }

  /** @param {RequestInfo | URL} input @returns {URL | null} */
  function resolveRequestUrl(input) {
    try {
      const value = typeof input === "string" || input instanceof window.URL ? input : input.url;
      return new window.URL(value, window.location.href);
    } catch {
      return null;
    }
  }

  /** @param {RequestInfo | URL} input @param {RequestInit} init */
  function resolveRequestMethod(input, init) {
    const inputMethod = typeof window.Request === "function" && input instanceof window.Request ? input.method : "GET";
    return String(init.method || inputMethod || "GET").toUpperCase();
  }

  /** @param {URL} url @param {string} method */
  function isProtectedApiMutation(url, method) {
    return !["GET", "HEAD", "OPTIONS"].includes(method)
      && url.pathname.startsWith("/api/")
      && !url.pathname.startsWith("/api/v1/");
  }

  /** @param {string} value */
  function normalizeThemeMode(value) {
    return ["light", "auto", "dark"].includes(value) ? value : "light";
  }

  /**
   * The auto-theme source, of which there is currently exactly one.
   *
   * **Both arms answer `"system"`, and that is left exactly as it stands.** The branch is
   * pre-existing, it is behaviour-neutral, and nothing about typing this file requires
   * collapsing it - the parameter is still the module's input even while every value maps to
   * the same answer. Recorded here rather than tidied away, so that narrowing the vocabulary
   * to one source stays a visible decision rather than becoming an accident.
   * @param {string} value
   * @returns {string}
   */
  function normalizeThemeAutoSource(value) {
    return value === "system" ? "system" : "system";
  }

  /** @param {string} themeModeValue @param {string} themeAutoSourceValue */
  function resolveThemeMode(themeModeValue, themeAutoSourceValue) {
    const normalizedThemeMode = normalizeThemeMode(themeModeValue);

    if (normalizedThemeMode !== "auto") {
      return normalizedThemeMode;
    }

    return resolveAutoThemeMode(themeAutoSourceValue);
  }

  /** @param {string} themeAutoSourceValue */
  function resolveAutoThemeMode(themeAutoSourceValue) {
    if (normalizeThemeAutoSource(themeAutoSourceValue) === "system" && typeof window.matchMedia === "function") {
      return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
    }

    return "light";
  }
})();
