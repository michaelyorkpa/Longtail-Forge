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
  next();
}

async function handleUnauthenticatedRequest(request, response, pathname) {
  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    const result = await staticService.read(request.url);

    response.writeHead(result.statusCode, {
      "Content-Type": result.contentType,
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
    pathname === "/footer.js" ||
    pathname === "/login.js" ||
    pathname === "/theme-init.js" ||
    pathname === "/styles/longtail-forge.css"
  );
}

export { requireAuth };
