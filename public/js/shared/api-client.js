// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserApiError} ClientBrowserApiError */
/** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */
/** @typedef {import("../../../src/types/browser-contracts.js").BrowserJsonRequestOptions} BrowserJsonRequestOptions */

(function () {
  const namespace = window.LongtailForge || {};
  const createErrorFromContract = requireErrorContract(namespace.errors?.createError);

  /**
   * @param {BrowserErrorContract["createError"] | undefined} createError
   * @returns {BrowserErrorContract["createError"]}
   */
  function requireErrorContract(createError) {
    if (typeof createError !== "function") {
      throw new Error("Longtail Forge API client requires the shared error contract.");
    }

    return createError;
  }

  /**
   * @param {string} url
   * @param {BrowserJsonRequestOptions} [options]
   * @returns {Promise<unknown>}
   */
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

  /**
   * @param {unknown} body
   * @param {string} fallback
   * @param {number} status
   * @returns {ClientBrowserApiError}
   */
  function createApiError(body, fallback, status) {
    return createErrorFromContract(body, fallback, status);
  }

  /**
   * @param {Response} response
   * @returns {Promise<unknown>}
   */
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

      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Expected JSON response from ${response.url}: ${detail}`);
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
