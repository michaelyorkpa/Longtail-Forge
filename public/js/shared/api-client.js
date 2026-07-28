(function () {
  const namespace = window.LongtailForge || {};

  async function requestJson(url, options = {}) {
    const method = options.method || "GET";
    const headers = {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    };
    const response = await fetch(url, {
      cache: options.cache,
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      const error = createApiError(body, `Request failed: ${response.status}`, response.status);
      error.method = method;
      throw error;
    }

    return body;
  }

  function createApiError(body, fallback, status) {
    if (namespace.errors?.createError) {
      return namespace.errors.createError(body, fallback, status);
    }

    const envelope = body?.error && typeof body.error === "object" ? body.error : null;
    const error = new Error(
      envelope?.message
      || (typeof body?.error === "string" ? body.error : "")
      || body?.message
      || fallback,
    );
    error.body = body;
    error.code = envelope?.code || "";
    error.requestId = envelope?.requestId || "";
    error.status = status;
    return error;
  }

  async function parseJsonResponse(response) {
    if (response.status === 204) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      if (!response.ok) {
        return { error: text || response.statusText };
      }

      throw new Error(`Expected JSON response from ${response.url}: ${error.message}`);
    }
  }

  namespace.api = {
    getJson: (url, options = {}) => requestJson(url, { ...options, method: "GET" }),
    postJson: (url, body, options = {}) => requestJson(url, { ...options, method: "POST", body }),
    putJson: (url, body, options = {}) => requestJson(url, { ...options, method: "PUT", body }),
    patchJson: (url, body, options = {}) => requestJson(url, { ...options, method: "PATCH", body }),
    deleteJson: (url, options = {}) => requestJson(url, { ...options, method: "DELETE" }),
  };
  window.LongtailForge = namespace;
}());
