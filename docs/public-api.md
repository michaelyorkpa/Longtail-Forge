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

API keys are created from the protected API Keys settings page while the intended workspace is active. Raw keys are shown once at creation time; after that, only the key prefix is displayed.

API keys are scoped to the workspace that was active when the key was created. Public API requests run inside that workspace, even if the user later switches workspaces in the browser.

Version 0.30.16.1 completes the workspace storage migration. Public API responses use `workspace_id` as the workspace context field. Version 0.30.17 makes client endpoints Business-workspace-only; Personal and Family workspace integrations should use project endpoints without client records.

## Response Shape

Single-record responses:

```json
{
  "apiVersion": "v1",
  "workspace_id": "workspace-id",
  "data": {}
}
```

List responses:

```json
{
  "apiVersion": "v1",
  "workspace_id": "workspace-id",
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

## Endpoints By Module

### Clients and Projects

- `GET /api/v1/clients` requires `clients:read`
- `GET /api/v1/clients/:clientId` requires `clients:read`
- `GET /api/v1/projects` requires `projects:read`
- `GET /api/v1/projects/:projectId` requires `projects:read`

Client endpoints are available only for Business workspaces. Project endpoints remain available for Business, Personal, and Family workspaces.

### Time Tracking

- `GET /api/v1/time-entries` requires `time_entries:read`
- `POST /api/v1/time-entries` requires `time_entries:write`

List endpoints accept `limit` and `offset`. `limit` defaults to `50` and is capped at `100`.

The Time Tracking public API routes are owned by the Time Tracking module. Disabled Time Tracking keeps historical read-only browser access; public API write behavior remains controlled by API key scope and the module route contract.

Time-entry timestamps should be sent as ISO 8601 UTC strings, such as `2026-05-29T13:00:00.000Z`. Values with an explicit offset are normalized to UTC before storage.

`POST /api/v1/time-entries` requires `project_id`. `client_id` is optional in version 0.30.3 and later; when the project is linked to a client, the API uses that client automatically. Workspace-level projects can create time entries without a client.

Version 0.30.15 adds adjacency-list nesting metadata to client and project records. Client payloads may include `parent_client_id`; project payloads may include `parent_project_id`. Parent relationships are single-parent trees, and server validation rejects self-parenting, cross-scope project parents, and descendant cycles.

## Workspace Context

Version 0.30.0 begins the public language shift to workspaces. Version 0.30.3 adds active workspace sessions and project-first time entry creation. Version 0.30.5 scopes API keys and public API envelopes to workspaces. Version 0.30.16.1 completes the workspace-native storage migration documented in `docs/storage-rename-plan.md`. Version 0.30.17 enforces Business-only client reads while keeping project reads workspace-type neutral.

Integrations should use `workspace_id` for workspace context.

API audit log records include the workspace context for key creation, revocation, and public API writes.
