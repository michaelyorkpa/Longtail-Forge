// Shared narrowing for HTTP fixture response bodies in regression owners.
//
// `JSON.parse` resolves `any`, so a probe that reads straight off a parsed body
// makes a claim the compiler never checks: a renamed field, a moved envelope,
// or a route that stopped answering all read the same to TypeScript. The
// fixture contracts therefore publish `body` as `unknown`, and this is how an
// owner crosses that boundary on purpose.
//
// The narrowing is not a cast. It proves the body is a JSON object rather than
// a string, an array, or `null`, and proves each named key is actually present,
// so a route that stops publishing an envelope fails here with the key it
// dropped instead of comparing `undefined` somewhere further down.
//
// The shape defaults to an open record. A caller that wants its envelopes named
// annotates the receiving binding, which is honest because the keys it passes
// are proven present on the line above.

import assert from "node:assert/strict";

/**
 * Narrow a fixture response body to the envelopes an assertion depends on.
 *
 * The parameter is deliberately the open response rather than the shape, so the
 * annotation on the binding decides the result instead of being overridden by
 * whatever the client happens to declare.
 * @template {object} [PayloadShape=Record<string, unknown>]
 * @param {{ body: unknown }} response
 * @param {ReadonlyArray<string>} keys the top-level envelopes this read requires
 * @param {string} [label]
 * @returns {PayloadShape}
 */
function readPayload(response, keys, label = "response") {
  const body = response.body;
  assert.ok(
    body && typeof body === "object" && !Array.isArray(body),
    `${label} payload should be a JSON object: ${JSON.stringify(body)}`,
  );
  const record = /** @type {Record<string, unknown>} */ (body);
  for (const key of keys) {
    assert.ok(key in record, `${label} payload should carry ${key}: ${JSON.stringify(Object.keys(record))}`);
  }
  return /** @type {PayloadShape} */ (/** @type {unknown} */ (record));
}

export { readPayload };
