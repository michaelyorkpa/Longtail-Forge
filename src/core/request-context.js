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
  const context = Object.freeze({
    hostname,
    ipAddress: normalizeText(request.ip) || socketPeerAddress,
    isSecure: protocol === "https",
    origin: resolveRequestOrigin(request, protocol, hostname),
    protocol,
    requestId: createOpaqueId(),
    socketPeerAddress,
  });

  request.requestContext = context;
  return context;
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
