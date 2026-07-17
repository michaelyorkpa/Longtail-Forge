import { getRequestSession } from "../security/sessions.js";
import { sendJson } from "../utils/http.js";
import { staticService } from "../services/static.service.js";

async function requireAuth(request, response, next) {
  let session = null;

  try {
    session = await getRequestSession(request);
  } catch (error) {
    next(error);
    return;
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

function enforceAccountExportRecovery(request, response) {
  const pathname = request.path;
  if (request.method === "GET" && (
    pathname === "/account-recovery.html" ||
    pathname === "/api/user/portable-account-export"
  )) {
    return false;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(response, 403, {
      code: "ACCOUNT_EXPORT_RECOVERY_ONLY",
      error: "Only account export and logout are available in recovery mode.",
    });
    return true;
  }
  if (request.method === "GET") {
    response.writeHead(302, { Location: "/account-recovery.html", "Cache-Control": "no-store" });
    response.end();
    return true;
  }
  sendJson(response, 403, {
    code: "ACCOUNT_EXPORT_RECOVERY_ONLY",
    error: "Only account export and logout are available in recovery mode.",
  });
  return true;
}

function enforceRequiredPasswordChange(request, response) {
  const pathname = request.path;

  if (request.method === "PUT" && pathname === "/api/user/password") {
    return false;
  }

  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    return false;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 403, {
      code: "PASSWORD_CHANGE_REQUIRED",
      error: "Change your password before continuing.",
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

  sendJson(response, 403, {
    code: "PASSWORD_CHANGE_REQUIRED",
    error: "Change your password before continuing.",
  });
  return true;
}

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
    sendJson(response, 401, { error: "Login required." });
    return;
  }

  if (request.method === "GET") {
    response.writeHead(302, {
      Location: "/login.html",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  sendJson(response, 401, { error: "Login required." });
}

function isLoginAssetPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login.html" ||
    pathname === "/js/footer.js" ||
    pathname === "/js/login.js" ||
    pathname === "/js/theme-init.js" ||
    pathname === "/css/longtail-forge.css"
  );
}

export { requireAuth };
