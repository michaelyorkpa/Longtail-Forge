// @ts-check

/** @typedef {{ cause?: unknown, code?: string, expose?: boolean, fields?: unknown[] }} AppErrorOptions */

class AppError extends Error {
  /** @param {string} message @param {number} [statusCode] @param {AppErrorOptions} [options] */
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || "";
    this.expose = options.expose ?? statusCode < 500;
    this.fields = Array.isArray(options.fields) ? options.fields : [];
  }
}

export { AppError };
