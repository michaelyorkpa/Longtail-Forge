import { AppError } from "./app-error.js";

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

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
        const payload = JSON.parse(body);
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
