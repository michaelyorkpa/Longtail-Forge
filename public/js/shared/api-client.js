(function () {
  const namespace = window.LongtailForge || {};

  async function requestJson(url, options = {}) {
    const headers = {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    };
    const response = await fetch(url, {
      cache: options.cache,
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await parseJsonResponse(response);

    if (!response.ok) {
      const message = body?.error || body?.message || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
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
