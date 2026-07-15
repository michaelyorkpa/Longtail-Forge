import { config } from "../config.js";
import { getRequestContext } from "../core/request-context.js";
import { normalizeThemeAutoSource, normalizeThemeMode } from "../utils/normalizers.js";

function buildSessionCookie(sessionId, maxAgeSeconds, request = null) {
  return buildCookie(config.cookies.sessionName, sessionId, {
    httpOnly: config.cookies.httpOnly,
    domain: config.cookies.domain,
    maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildExpiredSessionCookie(request = null) {
  return buildCookie(config.cookies.sessionName, "", {
    httpOnly: config.cookies.httpOnly,
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildCsrfCookie(token, request = null) {
  return buildCookie(config.cookies.csrfName, token, {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildExpiredCsrfCookie(request = null) {
  return buildCookie(config.cookies.csrfName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildThemeCookie(themeMode, request = null) {
  return buildCookie(config.cookies.themeName, normalizeThemeMode(themeMode), {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildThemeAutoSourceCookie(themeAutoSource, request = null) {
  return buildCookie(config.cookies.themeAutoSourceName, normalizeThemeAutoSource(themeAutoSource), {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildExpiredThemeCookie(request = null) {
  return buildCookie(config.cookies.themeName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildExpiredThemeAutoSourceCookie(request = null) {
  return buildCookie(config.cookies.themeAutoSourceName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

function buildCookie(name, value, options = {}) {
  const segments = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `Path=${options.path || "/"}`,
  ];

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function shouldSecureCookie(request) {
  return config.cookies.secure || Boolean(request && getRequestContext(request).isSecure);
}

export {
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredThemeAutoSourceCookie,
  buildExpiredSessionCookie,
  buildExpiredThemeCookie,
  buildSessionCookie,
  buildThemeAutoSourceCookie,
  buildThemeCookie,
};
