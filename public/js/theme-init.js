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

  function readCookie(name) {
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`));

    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
  }

  function installCsrfFetchGuard() {
    if (typeof window.fetch !== "function" || window.fetch.__longtailCsrfGuard) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    let pendingToken = null;
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
    guardedFetch.__longtailCsrfGuard = true;
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

  function resolveRequestUrl(input) {
    try {
      const value = typeof input === "string" || input instanceof window.URL ? input : input.url;
      return new window.URL(value, window.location.href);
    } catch {
      return null;
    }
  }

  function resolveRequestMethod(input, init) {
    const inputMethod = typeof window.Request === "function" && input instanceof window.Request ? input.method : "GET";
    return String(init.method || inputMethod || "GET").toUpperCase();
  }

  function isProtectedApiMutation(url, method) {
    return !["GET", "HEAD", "OPTIONS"].includes(method)
      && url.pathname.startsWith("/api/")
      && !url.pathname.startsWith("/api/v1/");
  }

  function normalizeThemeMode(value) {
    return ["light", "auto", "dark"].includes(value) ? value : "light";
  }

  function normalizeThemeAutoSource(value) {
    return value === "system" ? "system" : "system";
  }

  function resolveThemeMode(themeModeValue, themeAutoSourceValue) {
    const normalizedThemeMode = normalizeThemeMode(themeModeValue);

    if (normalizedThemeMode !== "auto") {
      return normalizedThemeMode;
    }

    return resolveAutoThemeMode(themeAutoSourceValue);
  }

  function resolveAutoThemeMode(themeAutoSourceValue) {
    if (normalizeThemeAutoSource(themeAutoSourceValue) === "system" && typeof window.matchMedia === "function") {
      return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
    }

    return "light";
  }
})();
