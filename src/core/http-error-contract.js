import { getRequestContext } from "./request-context.js";

/** @typedef {import("../types/http-contracts.js").HttpIdentityRequest & { get?: (name: string) => string | undefined }} HttpErrorRequest */
/** @typedef {import("../types/route-contracts.js").RouteResponse} RouteResponse */
/** @typedef {{ code?: string, fields?: unknown[], message?: string, statusCode?: unknown }} HttpErrorOptions */
/** @typedef {{ code: string, fields?: unknown[], message: string, requestId: string }} ApiErrorValue */
/** @typedef {{ code?: string, message?: string, requestPath?: string }} BrowserRecoveryOptions */
/** @typedef {{ actionHref: string, actionLabel: string, kind: string, message: string, showRequestId: boolean, title: string }} BrowserRecoverySurface */

/** @type {Readonly<Record<number, string>>} */
const ERROR_CODE_BY_STATUS = Object.freeze({
  400: "bad_request",
  401: "authentication_required",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "rate_limited",
  500: "internal_server_error",
  502: "bad_gateway",
  503: "service_unavailable",
});

/** @type {Readonly<Record<number, string>>} */
const SAFE_MESSAGE_BY_STATUS = Object.freeze({
  400: "The request could not be processed.",
  401: "Login required.",
  403: "You do not have permission to perform that action.",
  404: "The requested resource was not found.",
  405: "Method not allowed.",
  409: "The request conflicts with the current state.",
  413: "The request is too large.",
  415: "The request content type is not supported.",
  429: "Too many requests. Try again later.",
  500: "Internal server error.",
  502: "A dependency could not complete the request.",
  503: "The service is temporarily unavailable.",
});

const THEME_COOKIE_NAME = "lf_theme";

/** @param {number} statusCode @returns {string} */
function errorCodeForStatus(statusCode) {
  return ERROR_CODE_BY_STATUS[statusCode] || "request_error";
}

/** @param {number} statusCode @returns {string} */
function safeMessageForStatus(statusCode) {
  return SAFE_MESSAGE_BY_STATUS[statusCode] || "The request could not be completed.";
}

/** @param {HttpErrorRequest} request @param {HttpErrorOptions} [options] */
function apiErrorPayload(request, options = {}) {
  const statusCode = normalizeStatusCode(options.statusCode);
  /** @type {ApiErrorValue} */
  const error = {
    code: options.code || errorCodeForStatus(statusCode),
    message: options.message || safeMessageForStatus(statusCode),
    requestId: getRequestContext(request).requestId,
  };

  if (Array.isArray(options.fields) && options.fields.length > 0) {
    error.fields = options.fields;
  }

  if (isPublicApiRequest(request)) {
    return {
      apiVersion: "v1",
      error,
    };
  }

  return { error };
}

/** @param {HttpErrorRequest} request @param {RouteResponse} response @param {HttpErrorOptions} [options] @returns {void} */
function sendApiError(request, response, options = {}) {
  const statusCode = normalizeStatusCode(options.statusCode);
  response.status(statusCode).json(apiErrorPayload(request, {
    ...options,
    statusCode,
  }));
}

/** @param {HttpErrorRequest} request @param {RouteResponse} response @returns {void} */
function apiRouteBoundary(request, response) {
  const statusCode = ["GET", "HEAD"].includes(String(request.method || "").toUpperCase())
    ? 404
    : 405;
  sendApiError(request, response, { statusCode });
}

/** @param {HttpErrorRequest} request @param {RouteResponse} response @returns {void} */
function browserNotFound(request, response) {
  if (!isBrowserDocumentRequest(request)) {
    response.status(404).type("text").send("Not found.");
    return;
  }

  sendBrowserError(request, response, {
    code: "not_found",
    statusCode: 404,
  });
}

/** @param {HttpErrorRequest} request @param {RouteResponse} response @param {HttpErrorOptions} [options] @returns {void} */
function sendBrowserError(request, response, options = {}) {
  const statusCode = normalizeStatusCode(options.statusCode);
  const code = options.code || errorCodeForStatus(statusCode);
  const requestId = getRequestContext(request).requestId;
  const theme = browserThemePreference(request);
  const surface = browserRecoverySurface(statusCode, {
    code,
    message: options.message,
    requestPath: requestPath(request),
  });
  const requestIdMarkup = surface.showRequestId
    ? `<p class="error-page-request-id">Request ID: <code>${escapeHtml(requestId)}</code></p>`
    : "";

  response.status(statusCode);
  response.type("html");
  response.setHeader("Cache-Control", "no-store");
  if (statusCode === 503) {
    response.setHeader("Retry-After", "30");
  }
  response.send(`<!doctype html>
<html lang="en" data-theme-mode="${escapeHtml(theme.themeMode)}" data-theme-auto-source="${escapeHtml(theme.themeAutoSource)}" data-theme="${escapeHtml(theme.theme)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(surface.title)} | Longtail Forge</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      html[data-theme="dark"] { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #f5f7fb; color: #172033; }
      .error-page { width: min(100%, 620px); padding: clamp(28px, 6vw, 52px); border: 1px solid #d8deea; border-radius: 20px; background: #ffffff; box-shadow: 0 20px 60px rgba(22, 34, 58, 0.12); }
      .error-page-brand { margin: 0 0 28px; color: #526079; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(2rem, 8vw, 3.5rem); line-height: 1.05; letter-spacing: -0.04em; }
      .error-page-message { margin: 20px 0 0; color: #526079; font-size: 1.05rem; line-height: 1.65; }
      .error-page-request-id { margin: 20px 0 0; color: #526079; font-size: 0.85rem; overflow-wrap: anywhere; }
      .error-page-request-id code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      .error-page-action { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 30px; padding: 10px 18px; border-radius: 10px; background: #315ee8; color: #ffffff; font-weight: 700; text-decoration: none; }
      .error-page-action:hover { background: #244cc7; }
      .error-page-action:focus-visible { outline: 3px solid #f0b429; outline-offset: 3px; }
      html[data-theme="dark"] body { background: #080b12; color: #f4f7ff; }
      html[data-theme="dark"] .error-page { border-color: #2d374a; background: #111722; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); }
      html[data-theme="dark"] .error-page-brand, html[data-theme="dark"] .error-page-message, html[data-theme="dark"] .error-page-request-id { color: #aebbd0; }
      html[data-theme="dark"] .error-page-action { background: #6d8cff; color: #081022; }
      html[data-theme="dark"] .error-page-action:hover { background: #8ba3ff; }
      @media (prefers-color-scheme: dark) {
        html[data-theme-mode="auto"] { color-scheme: dark; }
        html[data-theme-mode="auto"] body { background: #080b12; color: #f4f7ff; }
        html[data-theme-mode="auto"] .error-page { border-color: #2d374a; background: #111722; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); }
        html[data-theme-mode="auto"] .error-page-brand, html[data-theme-mode="auto"] .error-page-message, html[data-theme-mode="auto"] .error-page-request-id { color: #aebbd0; }
        html[data-theme-mode="auto"] .error-page-action { background: #6d8cff; color: #081022; }
        html[data-theme-mode="auto"] .error-page-action:hover { background: #8ba3ff; }
      }
      @media (max-width: 480px) {
        body { padding: 14px; }
        .error-page { padding: 28px 22px; border-radius: 16px; }
        .error-page-action { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main class="error-page error-page--${escapeHtml(surface.kind)}" data-error-code="${escapeHtml(surface.kind)}" data-recovery-kind="${escapeHtml(surface.kind)}" role="alert" aria-live="assertive" aria-atomic="true">
      <p class="error-page-brand">Longtail Forge</p>
      <h1>${escapeHtml(surface.title)}</h1>
      <p class="error-page-message">${escapeHtml(surface.message)}</p>
      ${requestIdMarkup}
      <a class="error-page-action" href="${escapeHtml(surface.actionHref)}" autofocus>${escapeHtml(surface.actionLabel)}</a>
    </main>
  </body>
</html>`);
}

/** @param {HttpErrorRequest} request @returns {boolean} */
function isApiRequest(request) {
  const pathname = requestPath(request);
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** @param {HttpErrorRequest} request @returns {boolean} */
function isPublicApiRequest(request) {
  const pathname = requestPath(request);
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

/** @param {HttpErrorRequest} request @returns {boolean} */
function isBrowserDocumentRequest(request) {
  if (!["GET", "HEAD"].includes(String(request.method || "").toUpperCase())) {
    return false;
  }

  const pathname = requestPath(request);
  const accept = String(request.get?.("accept") || request.headers?.accept || "").toLowerCase();
  return accept.includes("text/html")
    || pathname === "/"
    || pathname.endsWith(".html")
    || !/\.[a-z0-9]{1,12}$/i.test(pathname);
}

/** @param {HttpErrorRequest} request @returns {string} */
function requestPath(request) {
  const rawPath = String(request.originalUrl || request.url || request.path || "/");
  try {
    return new URL(rawPath, "http://localhost").pathname;
  } catch {
    return String(request.path || "/");
  }
}

/** @param {unknown} value @returns {number} */
function normalizeStatusCode(value) {
  const statusCode = Number.parseInt(String(value), 10);
  return statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

/** @param {HttpErrorRequest} request */
function browserThemePreference(request) {
  const themeMode = normalizeThemeMode(readRequestCookie(request, THEME_COOKIE_NAME));
  return {
    theme: themeMode === "dark" ? "dark" : "light",
    themeAutoSource: "system",
    themeMode,
  };
}

/** @param {unknown} value @returns {"light" | "auto" | "dark"} */
function normalizeThemeMode(value) {
  return value === "light" || value === "auto" || value === "dark" ? value : "light";
}

/** @param {HttpErrorRequest} request @param {string} name @returns {string} */
function readRequestCookie(request, name) {
  const cookieHeader = String(request.headers?.cookie || "");
  const encodedValue = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!encodedValue) {
    return "";
  }

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return "";
  }
}

/** @param {number} statusCode @param {BrowserRecoveryOptions} [options] @returns {BrowserRecoverySurface} */
function browserRecoverySurface(statusCode, options = {}) {
  if (statusCode === 401) {
    return {
      actionHref: "/login.html",
      actionLabel: "Sign in",
      kind: "login-required",
      message: "Your session is no longer available. Sign in again to continue.",
      showRequestId: false,
      title: "Sign in required",
    };
  }

  if (statusCode === 403 || statusCode === 404) {
    return {
      actionHref: "/dashboard.html",
      actionLabel: "Return to Dashboard",
      kind: "unavailable",
      message: "This page is unavailable or you may not have access to it.",
      showRequestId: false,
      title: "Page unavailable",
    };
  }

  if (statusCode === 409) {
    return {
      actionHref: safeRetryPath(options.requestPath),
      actionLabel: "Reload page",
      kind: "conflict",
      message: options.message || "This page changed since it was loaded. Reload it before continuing.",
      showRequestId: false,
      title: "That changed",
    };
  }

  if (statusCode === 502 || statusCode === 503) {
    return {
      actionHref: safeRetryPath(options.requestPath),
      actionLabel: "Try again",
      kind: "dependency-unavailable",
      message: options.message || "A required service is temporarily unavailable. Wait a moment, then try again.",
      showRequestId: false,
      title: "Temporarily unavailable",
    };
  }

  return {
    actionHref: "/dashboard.html",
    actionLabel: "Return to Dashboard",
    kind: "unexpected",
    message: "Longtail Forge could not complete this page safely. Return to the Dashboard and try again.",
    showRequestId: true,
    title: "Something went wrong",
  };
}

/** @param {unknown} value @returns {string} */
function safeRetryPath(value) {
  const pathname = String(value || "");
  return pathname.startsWith("/") && !pathname.startsWith("//")
    ? pathname
    : "/dashboard.html";
}

/** @param {unknown} value @returns {string} */
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export {
  apiErrorPayload,
  apiRouteBoundary,
  browserRecoverySurface,
  browserNotFound,
  errorCodeForStatus,
  isApiRequest,
  isBrowserDocumentRequest,
  isPublicApiRequest,
  safeMessageForStatus,
  sendApiError,
  sendBrowserError,
};
