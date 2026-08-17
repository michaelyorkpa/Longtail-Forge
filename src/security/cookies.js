import { config } from "../config.js";
import { getRequestContext } from "../core/request-context.js";
import { normalizeThemeAutoSource, normalizeThemeMode } from "../utils/normalizers.js";

/** @typedef {{ maxAgeSeconds?: number, path?: string, domain?: string, httpOnly?: boolean, sameSite?: string, secure?: boolean }} CookieOptions */
/** @typedef {Parameters<typeof getRequestContext>[0]} CookieRequest */
/** @typedef {{ requestContext: { isSecure: boolean } }} SecureCookieContextRequest */

/** @param {string} sessionId @param {number} maxAgeSeconds @param {CookieRequest | SecureCookieContextRequest | null} [request] */
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

/** @param {CookieRequest | SecureCookieContextRequest | null} [request] */
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

/** @param {string} token @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildCsrfCookie(token, request = null) {
  return buildCookie(config.cookies.csrfName, token, {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildExpiredCsrfCookie(request = null) {
  return buildCookie(config.cookies.csrfName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {unknown} themeMode @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildThemeCookie(themeMode, request = null) {
  return buildCookie(config.cookies.themeName, normalizeThemeMode(themeMode), {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {unknown} themeAutoSource @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildThemeAutoSourceCookie(themeAutoSource, request = null) {
  return buildCookie(config.cookies.themeAutoSourceName, normalizeThemeAutoSource(themeAutoSource), {
    domain: config.cookies.domain,
    maxAgeSeconds: config.cookies.maxAgeSeconds,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildExpiredThemeCookie(request = null) {
  return buildCookie(config.cookies.themeName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {CookieRequest | SecureCookieContextRequest | null} [request] */
function buildExpiredThemeAutoSourceCookie(request = null) {
  return buildCookie(config.cookies.themeAutoSourceName, "", {
    domain: config.cookies.domain,
    maxAgeSeconds: 0,
    path: config.cookies.path,
    sameSite: config.cookies.sameSite,
    secure: shouldSecureCookie(request),
  });
}

/** @param {string} name @param {string} value @param {CookieOptions} [options] @returns {string} */
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

/** @param {CookieRequest | SecureCookieContextRequest | null} request @returns {boolean} */
function shouldSecureCookie(request) {
  if (hasSecureCookieContext(request)) {
    return config.cookies.secure || Boolean(request.requestContext.isSecure);
  }
  return config.cookies.secure || Boolean(request && getRequestContext(request).isSecure);
}

/** @param {CookieRequest | SecureCookieContextRequest | null} request @returns {request is SecureCookieContextRequest} */
function hasSecureCookieContext(request) {
  return Boolean(request?.requestContext && typeof request.requestContext.isSecure === "boolean");
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
