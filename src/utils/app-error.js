class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || "";
    this.expose = options.expose ?? statusCode < 500;
  }
}

export { AppError };
