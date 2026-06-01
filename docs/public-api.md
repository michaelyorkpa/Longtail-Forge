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

API keys are scoped to the active workspace. During the 0.30.x workspace migration, responses include `workspace_id` aliases while legacy `organization_id` fields may still appear for backward compatibility.

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

Time-entry timestamps should be sent as ISO 8601 UTC strings, such as `2026-05-29T13:00:00.000Z`. Values with an explicit offset are normalized to UTC before storage.

`POST /api/v1/time-entries` requires `project_id`. `client_id` is optional in version 0.30.3 and later; when the project is linked to a client, the API uses that client automatically. Workspace-level projects can create time entries without a client.

## Workspace Compatibility

Version 0.30.0 begins the public language shift from organizations to workspaces. Version 0.30.3 adds active workspace sessions and project-first time entry creation. New integrations should read `workspace_id` when it is present. Existing `organization_id` fields remain temporarily available until the deeper storage rename work in later 0.30.x releases is complete.
