// Shared type contracts for the raw HTTP fixtures regression owners build by
// hand. This module is type-only by design: it declares the request options,
// response records, JSON clients, and server handles those fixtures already
// resolve, so each owner can describe its helper through one named contract
// instead of a private redeclaration.
//
// It deliberately exports no runtime helper. Consolidating the request bodies
// themselves would change request construction, status handling, or timing in
// owners that prove exact transport behavior, so the fixtures stay local and
// only their shapes are shared.
//
// The response record is split rather than flattened because the fixtures
// genuinely differ: some resolve a parsed JSON body, some the raw text, and
// some both. Declaring one union with optional fields would let an owner claim
// a field its helper never resolves.

/**
 * What every raw `node:http` fixture response carries. `status` follows
 * `IncomingMessage.statusCode`, which Node types as possibly undefined.
 * @typedef {{ headers: import("node:http").IncomingHttpHeaders, status: number | undefined }} HttpFixtureResponseBase
 */

/**
 * A fixture response whose body was parsed as JSON.
 * @template [Body=unknown]
 * @typedef {HttpFixtureResponseBase & { body: Body }} HttpFixtureJsonResponse
 */

/**
 * A fixture response captured as raw text, for owners proving rendered HTML or
 * non-JSON payloads.
 * @typedef {HttpFixtureResponseBase & { text: string }} HttpFixtureTextResponse
 */

/**
 * A fixture response carrying both the parsed body and the raw text, for owners
 * that assert on the envelope and on what was actually sent.
 * @template [Body=unknown]
 * @typedef {HttpFixtureJsonResponse<Body> & { text: string }} HttpFixtureJsonTextResponse
 */

/**
 * Some fixtures name the status field `statusCode`, mirroring
 * `IncomingMessage`, rather than `status`. Both are declared because renaming
 * one to match the other would change what those owners resolve.
 * @typedef {{ headers: import("node:http").IncomingHttpHeaders, statusCode: number | undefined }} HttpFixtureStatusCodeResponseBase
 */

/**
 * A `statusCode`-shaped fixture response captured as raw text.
 * @typedef {HttpFixtureStatusCodeResponseBase & { body: string }} HttpFixtureStatusCodeTextResponse
 */

/**
 * Per-request overrides a raw `node:http` fixture accepts. `headers` allows
 * numbers because `Content-Length` is set from `Buffer.byteLength`.
 * @typedef {{ body?: string, headers?: Record<string, string | number>, method?: string }} HttpFixtureRequestOptions
 */

/**
 * Per-request overrides a `fetch`-based JSON client accepts, including the
 * session cookie value these fixtures thread through by hand.
 * @typedef {{ cookie?: string, headers?: Record<string, string>, session?: string }} HttpFixtureClientOptions
 */

/**
 * One `fetch`-based JSON client response. `headers` is the `fetch` `Headers`
 * instance rather than Node's incoming-header record.
 * @template [Body=unknown]
 * @typedef {{ body: Body, headers: Headers, status: number }} HttpFixtureFetchResponse
 */

/**
 * A JSON client that also drives `put`.
 * @template [Body=unknown]
 * @typedef {HttpFixtureJsonClient<Body> & { put: (url: string, body?: unknown, options?: HttpFixtureClientOptions) => Promise<HttpFixtureFetchResponse<Body>> }} HttpFixtureWritingJsonClient
 */

/**
 * The session-carrying JSON client these fixtures build over `fetch`. `put` is
 * optional because not every owner drives it, and requiring it would force a
 * method the fixture never calls.
 * @template [Body=unknown]
 * @typedef {{
 *   get: (url: string, options?: HttpFixtureClientOptions) => Promise<HttpFixtureFetchResponse<Body>>,
 *   post: (url: string, body?: unknown, options?: HttpFixtureClientOptions) => Promise<HttpFixtureFetchResponse<Body>>,
 *   put?: (url: string, body?: unknown, options?: HttpFixtureClientOptions) => Promise<HttpFixtureFetchResponse<Body>>,
 * }} HttpFixtureJsonClient
 */

/** The listening server a fixture starts and later closes. */
/** @typedef {import("node:http").Server} HttpFixtureServer */

/**
 * The Express application a fixture mounts. It is callable as a request
 * listener at runtime; owners passing it to `http.createServer` bridge the
 * narrower typed request and response parameters at that call.
 * @typedef {import("express").Application} HttpFixtureApp
 */

export {};
