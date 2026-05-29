# Public API

Longtail Forge public API routes are versioned under `/api/v1`. Browser UI routes remain under `/api` and should not be treated as stable integration contracts.

## Authentication

Send an active API key with either header:

```http
Authorization: Bearer ltf_live_...
```

```http
X-API-Key: ltf_live_...
```

API keys are created from the protected API Keys settings page. Raw keys are shown once at creation time; after that, only the key prefix is displayed.

## Response Shape

Single-record responses:

```json
{
  "apiVersion": "v1",
  "data": {}
}
```

List responses:

```json
{
  "apiVersion": "v1",
  "data": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 0,
    "has_more": false
  }
}
```

Error responses:

```json
{
  "apiVersion": "v1",
  "error": {
    "code": "request_error",
    "message": "A readable error message."
  }
}
```

## Endpoints

- `GET /api/v1/clients` requires `clients:read`
- `GET /api/v1/clients/:clientId` requires `clients:read`
- `GET /api/v1/projects` requires `projects:read`
- `GET /api/v1/projects/:projectId` requires `projects:read`
- `GET /api/v1/time-entries` requires `time_entries:read`
- `POST /api/v1/time-entries` requires `time_entries:write`

List endpoints accept `limit` and `offset`. `limit` defaults to `50` and is capped at `100`.
