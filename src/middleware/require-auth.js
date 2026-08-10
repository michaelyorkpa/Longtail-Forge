// @ts-check
import { getRequestSession } from "../security/sessions.js";
import { buildExpiredSessionCookie, buildSessionCookie } from "../security/cookies.js";
import { staticService } from "../services/static.service.js";
import {
  isBrowserDocumentRequest,
  sendApiError,
  sendBrowserError,
} from "../core/http-error-contract.js";

/** @typedef {import("../types/http-contracts.js").HttpIdentityRequest} HttpIdentityRequest */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */

/** @param {HttpIdentityRequest} request */
async function requireAuth(request, response, next) {
  /** @type {RequestSession | null} */
  let session = null;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    next(error);
    return;
  }

  if (request.sessionRotation) {
    response.append("Set-Cookie", buildSessionCookie(
      request.sessionRotation.sessionId,
      request.sessionRotation.maxAgeSeconds,
      request,
    ));
  } else if (request.sessionInvalidated) {
    response.append("Set-Cookie", buildExpiredSessionCookie(request));
  }

  if (!session) {
    handleUnauthenticatedRequest(request, response, request.path).catch(next);
    return;
  }

  request.session = session;
  if (session.session_mode === "account_export_recovery" && enforceAccountExportRecovery(request, response)) {
    return;
  }
  if (session.password_change_required && enforceRequiredPasswordChange(request, response)) {
    return;
  }
  next();
}

/** @param {HttpIdentityRequest} request */
function enforceAccountExportRecovery(request, response) {
  const pathname = request.path;
  if (request.method === "GET" && (
    pathname === "/account-recovery.html" ||
    pathname === "/api/user/portable-account-export"
  )) {
    return false;
  }
  if (pathname.startsWith("/api/")) {
    sendApiError(request, response, {
      code: "account_export_recovery_only",
      message: "Only account export and logout are available in recovery mode.",
      statusCode: 403,
    });
    return true;
  }
  if (request.method === "GET") {
    response.writeHead(302, { Location: "/account-recovery.html", "Cache-Control": "no-store" });
    response.end();
    return true;
  }
  sendApiError(request, response, {
    code: "account_export_recovery_only",
    message: "Only account export and logout are available in recovery mode.",
    statusCode: 403,
  });
  return true;
}

/** @param {HttpIdentityRequest} request */
function enforceRequiredPasswordChange(request, response) {
  const pathname = request.path;

  if (request.method === "PUT" && pathname === "/api/user/password") {
    return false;
  }

  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    return false;
  }

  if (pathname.startsWith("/api/")) {
    sendApiError(request, response, {
      code: "password_change_required",
      message: "Change your password before continuing.",
      statusCode: 403,
    });
    return true;
  }

  if (request.method === "GET") {
    response.writeHead(302, {
      Location: "/login.html?passwordChangeRequired=1",
      "Cache-Control": "no-store",
    });
    response.end();
    return true;
  }

  sendApiError(request, response, {
    code: "password_change_required",
    message: "Change your password before continuing.",
    statusCode: 403,
  });
  return true;
}

/** @param {HttpIdentityRequest} request */
async function handleUnauthenticatedRequest(request, response, pathname) {
  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    const result = await staticService.read(request.url);

    response.writeHead(result.statusCode, {
      "Content-Type": result.contentType,
      ...(result.headers || {}),
    });
    response.end(result.contents);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendApiError(request, response, {
      message: "Login required.",
      statusCode: 401,
    });
    return;
  }

  if (isBrowserDocumentRequest(request)) {
    sendBrowserError(request, response, {
      code: "authentication_required",
      statusCode: 401,
    });
    return;
  }

  sendApiError(request, response, {
    message: "Login required.",
    statusCode: 401,
  });
}

function isLoginAssetPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login.html" ||
    pathname === "/terms.html" ||
    pathname === "/privacy.html" ||
    pathname === "/js/footer.js" ||
    pathname === "/js/login.js" ||
    pathname === "/js/theme-init.js" ||
    pathname === "/css/longtail-forge.css"
  );
}

export { requireAuth };
