import { apiKeysService } from "../services/api-keys.service.js";
import { sendJson } from "../utils/http.js";

function requireApiKey(requiredScope) {
  return async (request, response, next) => {
    try {
      const rawKey = readApiKey(request);

      if (!rawKey) {
        sendPublicApiError(response, 401, "api_key_required", "API key required.");
        return;
      }

      const apiKey = await apiKeysService.readActiveKey(rawKey);

      if (!apiKey) {
        sendPublicApiError(response, 401, "api_key_invalid", "API key is invalid or revoked.");
        return;
      }

      if (requiredScope && !apiKeysService.hasScope(apiKey, requiredScope)) {
        sendPublicApiError(response, 403, "scope_required", `API key requires ${requiredScope}.`);
        return;
      }

      await apiKeysService.markUsed(apiKey);
      request.apiKey = apiKey;
      request.apiSession = {
        organization_id: apiKey.organization_id,
        user_id: apiKey.created_by_user_id,
        username: `api:${apiKey.key_prefix}`,
        api_key_id: apiKey.api_key_id,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function readApiKey(request) {
  const authorization = String(request.headers.authorization || "").trim();

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return String(request.headers["x-api-key"] || "").trim();
}

function sendPublicApiError(response, status, code, message) {
  sendJson(response, status, {
    apiVersion: "v1",
    error: {
      code,
      message,
    },
  });
}

export { requireApiKey, sendPublicApiError };
