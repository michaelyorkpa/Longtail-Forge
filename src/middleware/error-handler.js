import { AppError } from "../utils/app-error.js";

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
}

export { errorHandler };
