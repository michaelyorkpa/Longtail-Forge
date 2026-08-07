import { createOpaqueId } from "./identifiers.js";

function configureTrustedProxy(app, trustedProxies = []) {
  app.set("trust proxy", trustedProxies.length ? [...trustedProxies] : false);
}

function attachRequestContext(request, response, next) {
  const context = getRequestContext(request);
  response.setHeader("X-Request-ID", context.requestId);
  next();
}

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

function normalizeText(value) {
  return String(value || "").trim();
}

export { attachRequestContext, configureTrustedProxy, getRequestContext };
