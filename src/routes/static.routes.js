import { Router } from "express";
import {
  isBrowserDocumentRequest,
  sendBrowserError,
} from "../core/http-error-contract.js";
import { staticService } from "../services/static.service.js";
import { asyncRoute } from "../utils/http.js";

const staticRoutes = Router();

staticRoutes.get("/{*staticPath}", asyncRoute(async (request, response, next) => {
  const result = await staticService.read(request.url, request.session);

  if (result.statusCode === 404) {
    next();
    return;
  }

  if (result.statusCode >= 400 && isBrowserDocumentRequest(request)) {
    sendBrowserError(request, response, {
      message: result.message,
      statusCode: result.statusCode,
    });
    return;
  }

  response.writeHead(result.statusCode, {
    "Content-Type": result.contentType,
    ...(result.headers || {}),
  });
  response.end(result.contents);
}));

export { staticRoutes };
