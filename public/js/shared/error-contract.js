(function initializeErrorContract(global) {
  const namespace = global.LongtailForge || {};

  function read(body, fallback = "Request failed.") {
    const envelope = body?.error && typeof body.error === "object"
      ? body.error
      : null;
    const message = String(
      envelope?.message
      || (typeof body?.error === "string" ? body.error : "")
      || body?.message
      || fallback,
    ).trim() || fallback;

    return {
      code: String(envelope?.code || "").trim(),
      message,
      requestId: String(envelope?.requestId || "").trim(),
    };
  }

  function createError(body, fallback, status = 0) {
    const details = read(body, fallback);
    const error = new Error(details.message);
    error.body = body;
    error.code = details.code;
    error.requestId = details.requestId;
    error.status = Number.parseInt(status, 10) || 0;
    return error;
  }

  namespace.errors = Object.freeze({
    createError,
    read,
  });
  global.LongtailForge = namespace;
}(window));
