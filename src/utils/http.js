// @ts-check
import { AppError } from "./app-error.js";

/** @typedef {import("../types/http-contracts.js").JsonBodyRequest} JsonBodyRequest */
/** @typedef {import("../types/http-contracts.js").ReadJsonBodyOptions} ReadJsonBodyOptions */

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * @param {JsonBodyRequest} request
 * @param {ReadJsonBodyOptions} [options]
 * @returns {Promise<unknown>}
 */
function readJsonBody(request, options = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;
    const maxBytes = options.maxBytes || 100000;

    request.on("data", (chunk) => {
      body += chunk;
      bodyBytes += Buffer.byteLength(chunk);

      if (bodyBytes > maxBytes) {
        request.destroy();
        reject(new AppError("Request body is too large.", 413));
      }
    });

    request.on("end", async () => {
      try {
        const payload = /** @type {unknown} */ (JSON.parse(body));
        if (typeof request.publicDemoBudgetPayloadValidator === "function") {
          await request.publicDemoBudgetPayloadValidator(payload);
        }
        resolve(payload);
      } catch (error) {
        if (error instanceof AppError) {
          reject(error);
          return;
        }
        reject(new AppError("Request body must contain valid JSON.", 400));
      }
    });
  });
}

export { asyncRoute, readJsonBody };
