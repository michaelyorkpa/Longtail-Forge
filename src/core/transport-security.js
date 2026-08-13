// @ts-check
import { config } from "../config.js";
import { getRequestContext } from "./request-context.js";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "geolocation=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

/** @param {{ hsts?: typeof config.security.hsts }} [options] */
function createTransportSecurityMiddleware(options = {}) {
  const hsts = options.hsts || config.security.hsts;

  return function transportSecurity(/** @type {import("./request-context.js").RequestContextRequest} */ request, /** @type {{ setHeader: (arg0: string, arg1: string) => void; }} */ response, /** @type {() => void} */ next) {
    const requestContext = getRequestContext(request);

    response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    response.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");

    if (shouldDisableCaching(request)) {
      response.setHeader("Cache-Control", "no-store");
    }

    if (hsts.enabled && requestContext.isSecure) {
      response.setHeader("Strict-Transport-Security", `max-age=${hsts.maxAgeSeconds}`);
    }

    next();
  };
}

/** @param {import("./request-context.js").RequestContextRequest} request */
function shouldDisableCaching(request) {
  const requestPath = String(request.path || "");
  return requestPath === "/"
    || requestPath.startsWith("/api/")
    || requestPath.toLowerCase().endsWith(".html");
}

export {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  createTransportSecurityMiddleware,
};
