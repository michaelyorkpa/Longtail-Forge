(function () {
  const THEME_STORAGE_KEY = "lf_theme";
  const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
  const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

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
