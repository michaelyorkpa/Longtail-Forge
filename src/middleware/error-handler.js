import { AppError } from "../utils/app-error.js";

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    if (request.path.startsWith("/api/v1/")) {
      response.status(error.statusCode).json({
        apiVersion: "v1",
        error: {
          code: "request_error",
          message: error.message,
        },
      });
      return;
    }

    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  if (request.path.startsWith("/api/v1/")) {
    response.status(500).json({
      apiVersion: "v1",
      error: {
        code: "internal_server_error",
        message: "Internal server error",
      },
    });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
}

export { errorHandler };
