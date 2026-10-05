import { createOpaqueId } from "./identifiers.js";

/** @typedef {import("express").Application} Application */
/** @typedef {import("../types/http-contracts.js").RequestContext} RequestContext */
/** @typedef {import("../types/route-contracts.js").RouteNext} RouteNext */
/** @typedef {import("../types/route-contracts.js").RouteResponse} RouteResponse */
/** @typedef {{ app?: { get?: (name: string) => unknown }, connection?: { remoteAddress?: string }, get?: (name: string) => string | undefined, headers?: Record<string, string | string[] | undefined>, hostname?: unknown, ip?: unknown, path?: string, protocol?: unknown, requestContext?: RequestContext, socket?: { remoteAddress?: string } }} RequestContextRequest */

/** @param {Application} app @param {readonly string[]} [trustedProxies] @returns {void} */
function configureTrustedProxy(app, trustedProxies = []) {
  app.set("trust proxy", trustedProxies.length ? [...trustedProxies] : false);
}

/** @param {RequestContextRequest} request @param {RouteResponse} response @param {RouteNext} next @returns {void} */
function attachRequestContext(request, response, next) {
  const context = getRequestContext(request);
  response.setHeader("X-Request-ID", context.requestId);
  next();
}

/** @param {RequestContextRequest} request @returns {RequestContext} */
function getRequestContext(request) {
  if (request.requestContext) {
    return request.requestContext;
  }

  const socketPeerAddress = normalizeText(
    request.socket?.remoteAddress || request.connection?.remoteAddress,
  );
  const protocol = normalizeText(request.protocol).toLowerCase() || "http";
  const hostname = normalizeText(request.hostname);
  const upstreamRequestId = trustedUpstreamRequestId(request, socketPeerAddress);
  const context = Object.freeze({
    hostname,
    ipAddress: normalizeText(request.ip) || socketPeerAddress,
    isSecure: protocol === "https",
    origin: resolveRequestOrigin(request, protocol, hostname),
    protocol,
    requestId: upstreamRequestId || createOpaqueId(),
    socketPeerAddress,
  });

  request.requestContext = context;
  return context;
}

/** @param {RequestContextRequest} request @param {string} socketPeerAddress @returns {string} */
function trustedUpstreamRequestId(request, socketPeerAddress) {
  const trustProxy = request.app?.get?.("trust proxy fn");
  if (typeof trustProxy !== "function" || !trustProxy(socketPeerAddress, 0)) {
    return "";
  }

  const candidate = normalizeText(request.get?.("x-request-id") || request.headers?.["x-request-id"]);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase()
    : "";
}

/** @param {RequestContextRequest} request @param {string} protocol @param {string} hostname @returns {string} */
function resolveRequestOrigin(request, protocol, hostname) {
  if (!hostname) {
    return "";
  }

  const hostHeader = normalizeText(request.get?.("host"));
  if (hostHeader) {
    try {
      const candidate = new URL(`${protocol}://${hostHeader}`);
      if (candidate.hostname === hostname) {
        return candidate.origin;
      }
    } catch {
      // Fall back to the trusted hostname resolved by Express.
    }
  }

  const formattedHostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  return new URL(`${protocol}://${formattedHostname}`).origin;
}

/** @param {unknown} value @returns {string} */
function normalizeText(value) {
  return String(value || "").trim();
}

export { attachRequestContext, configureTrustedProxy, getRequestContext };
