# HTTP Error and Recovery Contract

This document is the canonical development and support contract for HTTP failures in Longtail Forge. It covers failures handled while the Node application is running. Proxy-owned maintenance, upstream-outage behavior, and the stock-Caddy extreme-body rejection belong to the operator-maintenance contract; those edge responses carry the edge request UUID but do not claim that Node handled the request.

## Route Classes and Response Formats

The route class determines the failure format. Content negotiation does not change it.

| Route class | Paths | Failure format |
| --- | --- | --- |
| Versioned public API | `/api/v1` and descendants | Versioned JSON |
| Authenticated browser API | `/api` and descendants | Internal JSON |
| Browser document | HTML navigation requests | Self-contained branded HTML |
| Operational probe | `/healthz`, `/readyz`, `/api/app-info` | Minimal machine-readable JSON |
| Sessionless public resource | Explicit public routes such as private calendar feeds | The route's reviewed, generic resource contract |

Internal API errors use:

```json
{
  "error": {
    "code": "not_found",
    "message": "The requested resource was not found.",
    "requestId": "server-generated-request-id"
  }
}
```

The versioned public API keeps the same error object inside its versioned envelope:

```json
{
  "apiVersion": "v1",
  "error": {
    "code": "not_found",
    "message": "The requested resource was not found.",
    "requestId": "server-generated-request-id"
  }
}
```

API paths always return JSON, including authentication failures, unknown routes, unsupported methods, and requests advertising `text/html`. Browser document failures always return HTML. Operational probes retain their documented probe payloads.

Support View uses `support_view_read_only` with HTTP 403 for every centrally denied mutation. Sensitive or undeclared reads deliberately use the ordinary 404 `not_found` response so the boundary does not enumerate protected routes or records. These responses are server policy; hiding or disabling browser controls is not authorization.

The explicit **End Support View** and **Log Out** POSTs are the only lifecycle exceptions mounted before that central mutation deny. Both still require the authenticated support session and the normal browser CSRF boundary; End atomically rotates back to the actor, while Log Out atomically ends support state and expires authentication without restoring an actor session. Modules cannot register another exception. The target catalog, audit review, and audit export are classified sensitive so requests made from Support View receive the same ordinary 404 shape.

## Registered Error Codes

`src/core/http-error-contract.js` owns the default status registry:

| Status | Default code |
| --- | --- |
| 400 | `bad_request` |
| 401 | `authentication_required` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 405 | `method_not_allowed` |
| 409 | `conflict` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 429 | `rate_limited` |
| 500 | `internal_server_error` |
| 502 | `bad_gateway` |
| 503 | `service_unavailable` |

Prefer the default code when the HTTP status is sufficient. A workflow may add a more specific code only when callers have a real behavior to distinguish. New custom codes must be stable lowercase `snake_case`, documented in the owning module or API contract, and pinned by a focused regression. Published legacy codes remain compatibility contracts even when they predate this naming rule.

Expected `AppError` instances may also carry a reviewed `fields` array for safe structured recovery hints. The final API error middleware forwards it only for exposed expected failures; unexpected and hidden failures never receive fields. Public-demo budgets use `public_demo_budget_exceeded` (429), `public_demo_input_limit` (400), `public_demo_query_limit` (400), and `public_demo_budget_undeclared` (403), with only fixed field classes and the hourly-reset hint. Never place submitted values, arbitrary field names, record IDs, counters, limits remaining, paths, SQL, credentials, or private operational details in this array.

## Expected and Unexpected Failures

Use `AppError` for an expected request failure:

```js
throw new AppError("The record changed before it could be saved.", 409, {
  code: "conflict",
});
```

Client-error messages are exposed only when they are deliberately approved as safe. A 500-class message is generic unless a dependency-unavailable `503` is deliberately marked both safe and actionable with `expose: true`. Unexpected errors must reach the final framework error middleware; routes must not return an exception message, stack, SQL, path, body, credential, identifier, or hand-built production diagnostic.

Asynchronous route work uses the shared `asyncRoute` boundary unless a reviewed framework change deliberately relies on Express 5 forwarding. A failure reaches the final error middleware exactly once and no route writes a second response afterward.

## Framework and Module Responsibilities

Modules own workflow meaning:

- Validate and normalize untrusted input in their service or contract boundary.
- Choose the expected status and a user-safe message.
- Use `AppError` and a registered default or documented workflow code.
- Preserve existing permission, workspace-isolation, and non-enumeration behavior.
- Keep field-level validation presentation module-owned.

The framework owns:

- API and browser response envelopes.
- Request-ID generation and response correlation.
- Final API, browser-not-found, and error middleware.
- Safe structured production diagnostics.
- The shared browser error parser and recovery boundary.
- The generic mutation-permission dialog.

Module routers must not install a terminal error handler, hand-roll framework error JSON or HTML, or emit raw error values. The only current literal route responses are reviewed sessionless resource contracts, including the private calendar feed's indistinguishable plain-text `404` and throttled `429`.

## Final Middleware Order

`src/core/app.js` preserves this order:

1. Mount all versioned public API routes, then the final `/api/v1` boundary.
2. Install browser-session authentication.
3. Mount authenticated browser API routes, then the final `/api` boundary.
4. Resolve registered static and browser-document routes.
5. Install the browser not-found handler.
6. Install the framework error middleware last.

This keeps API failures JSON-only, browser failures HTML-only, and async failures on one terminal path.

## Non-Enumeration

Do not use failure detail to confirm whether a protected record exists. Where the owning permission contract intentionally hides existence:

- Forbidden and missing responses use the same approved message.
- Browser `403` and `404` bodies use the same unavailable surface.
- Logs classify actor and workspace presence but omit user IDs, workspace IDs, record IDs, URLs, route parameters, and private labels.
- Support must not ask a user to supply protected IDs or private content merely to correlate a failure.

A route-specific permission contract may retain a deliberate `403`; this shared formatter does not weaken or rewrite that decision.

## Browser Recovery Boundary

Every repository-owned browser entry lives under `views/`, contains a `<head>` element, and is served through `staticService`. The service injects the shared error parser and recovery boundary before page-owned scripts.

The boundary provides one accessible recovery action, assertive announcement, heading focus, saved Light/Dark theme continuity, and Auto-only system theme selection. It may replace failed rendering or present a generic mutation-permission dialog, but it must not automatically replay a write. New browser entries must use this path rather than bypassing the shared document service.

## Request-ID Support Workflow

When a user reports an unexpected error:

1. Ask for the displayed Request ID, approximate time, and the action they attempted. Treat the ID as opaque. In the supported proxy topology Caddy generates it and Node accepts it only from the allowlisted immediate peer; direct client values are never trusted.
2. Do not ask for passwords, bearer URLs, cookies, request bodies, private record text, raw record IDs, database paths, or screenshots containing secrets.
3. Search protected application logs for an exact `requestId` match and the `http.request.failed` event.
4. Expect exactly one failure diagnostic for that failed request. A separate `http.request.completed` record may exist in production and is not a second diagnostic.
5. Use only the recorded classifications: method, status, route class, safe error type, sanitized function-name frames, and actor/workspace presence.
6. If no failure diagnostic exists, first check whether the response was an expected client error, whether retention or service routing excludes the time window, and whether the request reached this application instance.

Log access remains operator-only. Exported logs remain protected operational data even though the application allowlist omits request paths and parameters, headers, cookies, bodies, credentials, raw messages and stacks, SQL, filesystem paths, private content, and raw user/workspace/record identifiers.

## In-Process 503 Versus Proxy Maintenance

An in-process `503` means Node is alive, accepted the request, and deliberately classified a dependency as temporarily unavailable. It uses the shared API or browser format, may include `Retry-After`, and exposes only reviewed actionable copy.

Planned maintenance, deployment restarts, and upstream failure when Node is stopped cannot be implemented by application middleware. Those cases belong to the proxy-owned maintenance curtain in [Reference Internet Deployment](internet-deployment.md#proxy-configuration). Either fixed marker makes ordinary requests return the reviewed HTML `503`, and a connection-level Node failure does the same without a marker. The exact `/healthz`, `/readyz`, and `/api/app-info` paths bypass markers: they preserve real Node responses while it runs and become generic JSON `503` when Node is unreachable, never a decorative page or false success.

## Development Checklist

Before adding or changing a route or browser entry:

- Use `AppError` for expected failures and the registered default code unless a documented workflow code is necessary.
- Preserve the owning route's permission and non-enumeration behavior.
- Let unexpected failures reach the final framework handler exactly once.
- Never send or log raw exception values or private request data.
- Keep new browser HTML under `views/`, include `<head>`, and serve it through `staticService`.
- Add focused regression coverage for any new status, code, exposure, or recovery behavior.
- Run `npm run docs:suggest` and record the documentation disposition.
- Finish the slice with `npm run verify:slice`.
