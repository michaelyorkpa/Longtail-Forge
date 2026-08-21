# Telemetry Planning and Privacy Contract

Status: implementation plan for roadmap version `0.33.34`; no telemetry is implemented or enabled by this document.

This document turns the `0.33.34` product direction into a closed planning contract. It is intentionally question-first. Storage, event emission, reports, and deployment must remain subordinate to the questions and privacy rules here.

> **Collect answers, not data.**

## Planning evidence and Lean Core assumption

The planning pass inspected the current pre-closeout `0.33.33` tree and found the seams that telemetry should consume after Lean Core finishes:

- `src/core/events/event-bus.js` isolates hook failure from the mutation that emitted an internal event, but its current `InternalEvent` shape deliberately contains application IDs, previous/new values, session context, exact timestamps, and open metadata. It is a source fact seam, never a telemetry payload.
- `src/core/modules/modules.service.js` registers validated module event hooks and owns the canonical module, navigation, view-surface, event-type, and contribution catalogs.
- `src/types/framework-contracts.d.ts` and module-owned `*.contracts.js` files establish the checked-JavaScript/JSDoc, strict TypeScript, discriminated contract, and Zod edge-validation direction.
- `src/core/jobs/` provides typed job payload registration, activation, retries, leases, and worker lifecycle, but the current application Jobs store is workspace-scoped inside the hourly-reset application database. Raw telemetry identity must not be placed in that Jobs payload/store.
- `src/services/app-shell.service.js`, shared navigation/module-action helpers, and the registered view/module catalogs are the canonical browser sources for stable module, surface, and Quick Capture vocabulary.
- `src/core/public-demo-*`, `src/config.js`, `compose.yaml`, and the reset/operator assets own the exact-demo fail-closed configuration and hourly database-and-Files replacement boundary. `outbound.analytics` is currently disabled and should remain disabled while `.34` uses a local sink.
- Existing responsive breakpoints are mobile through 700 px, tablet from 701 through 1024 px, and desktop above 1024 px.
- Audit/security, Notifications, Search, Work Resume State, Files, Settings, and permissions each already have separate owners. Telemetry must be another safe projection, not a replacement or copy of any of them.

`0.33.33` is still active at planning time. Before `.34` implementation begins, checkpoint `0.33.34.1` must re-run this compatibility probe against the merged `0.33.33.48` tree and update names/owners that legitimately moved. It must adapt telemetry to the final Lean Core contract; it must not weaken Lean Core or restore retired patterns.

## Decisions now settled

- Telemetry is a framework-owned, install-level, intrinsically cross-module concern.
- Telemetry is disabled by default. Disabled means no identities, browser storage, event persistence, maintenance, or transmission.
- The public demo is the first explicitly enabled installation.
- The initial public-demo sink is local and separate from the application database and hourly-reset data paths.
- Every event is a discriminated closed schema. There is no `track(name, object)`, `metadata`, passthrough object, arbitrary property bag, generic module contribution, or unknown-key acceptance path.
- Existing internal/domain events may supply the fact that something happened, but a named telemetry projector constructs a new safe object from the smallest required primitives. A projector never spreads or serializes an `InternalEvent`, audit row, request/session object, domain record, API body, or browser state object.
- Telemetry and audit/security are separate projections with separate stores, retention, failure behavior, and access. Telemetry failure never becomes an audit/security failure and never fails product work.
- Installation, participant, and telemetry-session identities are independent random values. None is derived from an application user, workspace, record, domain, host, network, license, hardware, or device signal.
- Cross-device reconciliation and per-entity telemetry identity are not goals.
- Browser-local device class is the only device characteristic: `mobile | tablet | desktop | unknown`. Width, resolution, make/model, OS, browser, and user agent are forbidden.
- Server receipt time is truncated to a UTC minute. Client timestamps and exact event/action timestamps are not accepted.
- Raw pseudonymous events expire after 30 days. Durable aggregates contain no participant/session ID or stable participant hash.
- The strict 30-day raw limit means durable retention answers are D1/D7/D14/D30 and rolling-30-day/cohort trends. The system will not retain a hidden long-lived participant token merely to calculate multi-month per-person return.
- The initial internal reporting surface is an aggregate-only operator CLI/export. `.34` does not add a telemetry BI dashboard or browser admin page.
- Separate SQLite is the initial sink. JSONL and CSV are rejected for the public-demo operational requirements.
- A hosted collector is unnecessary before `0.40`; `telemetry.longtailforge.com` belongs with the `0.60` SaaS wrapper after the database/integration foundations.
- Full **Settings -> Privacy & Telemetry** administration belongs in the `0.50` broader self-hosting work, not `.34`.
- Personally identifiable interest capture remains on Raymond Tec WordPress/MailPoet. Longtail Forge sends no telemetry identity or behavior to that system.
- The future dedicated Longtail Forge WordPress site is a separate marketing migration. Raymond Tec WordPress will not be converted to Multisite for it.

## Decisions still requiring Mike's approval

These are approval gates, not unresolved architecture work:

1. Select the legal/privacy review path for the public-demo notice and decide whether the approved posture requires an affirmative participant consent gate before the persistent browser identifier is created, or whether the explicit demo notice plus operator opt-in is sufficient.
2. Approve the final plain-language notice copy and exact placements. Recommendation: the public-demo account chooser before login, a persistent footer Privacy link, and the hosted Privacy page; do not bury the disclosure only in legal terms.
3. Approve a small-cohort export threshold. Recommendation: suppress cross-dimensional/co-occurrence/retention cells with fewer than five participants while allowing total event/participant counts to remain visible.
4. Approve the exact Raymond Tec Longtail Forge destination URLs, CTA labels/placements, and coarse `utm_campaign` values.
5. Decide whether anonymous `interest.cta_opened` counts are useful. Recommendation: include the coarse event with only `cta_class`; it is not a conversion pixel and is never passed to WordPress. Omitting it does not affect interest capture.

No other broad planning decision should be required before implementation. The first checkpoint records these answers; only public-demo enablement and CTA work are blocked by the relevant approvals.

## Product questions and minimum evidence

| Product question | Minimum telemetry evidence | Deliberately not collected |
| --- | --- | --- |
| Which modules and surfaces are used most? | `module.opened`, `surface.viewed` | URL, page title, record ID, DOM text |
| Which surfaces lead to actual work? | Session-scoped sequence of surface/module events followed by typed create/complete/start/stop events | Clickstream coordinates, arbitrary action names |
| Workbench versus direct navigation? | `surface.viewed` plus `entry_source`; domain-event `source` | Referrer URL or navigation history |
| Quick Capture versus dedicated creation? | `quick_capture.opened`, `quick_capture.completed`, and mutation `source` | Form content or record ID |
| Which features are used together? | Participant/event-family co-occurrence inside the raw 30-day window, then identity-free pair counts | Durable participant feature profile |
| Do Note-heavy participants use tagging? | `note.created|edited|accessed` plus `tag.assigned`; aggregate participant buckets | Note/tag IDs, titles, tag values |
| Do Task-heavy participants use Files? | Task lifecycle plus file action families | Task/file identity or attachment relation |
| How common are recurring Tasks and recurrence classes? | `task.created`, `task.recurrence_changed`, `recurrence_type` | Recurrence expression, dates, task identity |
| Are secure Notes/Catalogs used and revisited? | `note.created|accessed`, `security_mode`, `catalog_class` within 30 days | Note/Catalog identity, title/body, encryption metadata |
| Tasks created versus completed? | `task.created`, `task.completed` counts and session/cohort ratios | Exact task lifecycle linkage |
| Business/personal/family and coarse-role differences? | Server-derived `workspace_type` and `role_class` | Workspace/user/role assignment IDs or names |
| Which demo personas/features are explored? | Server-validated `demo_persona`, module/surface/action families | Shared username/password or application user ID |
| Which workflows are opened but rarely completed? | Typed open/completed funnels in a telemetry session | Raw action parameters or entity correlation |
| Which workflows repeatedly refuse or fail? | `workflow.outcome` with closed workflow/outcome/reason enums | Error messages, status bodies, request IDs, stack traces |
| Adoption by Longtail Forge version? | Server-derived canonical `app_version` | branch, commit, artifact hash, hostname/domain |
| Anonymous retention over time? | first-seen/return within D1/D7/D14/D30 and rolling-30 aggregates | Multi-month participant identity or cross-device reconciliation |
| Is Search useful? | `search.performed` and result-count bucket | query, snippets, result IDs/titles |
| Is a Raymond Tec CTA used? | Optional `interest.cta_opened` count | email, form content, destination query beyond approved UTM, telemetry-to-lead linkage |

## Closed telemetry object model

The conceptual API accepts a discriminated flat object:

```text
recordTelemetryEvent({
  name: "task.created",
  source: "quick_capture",
  recurrence_type: "weekly",
  has_tags: true,
  tag_count_bucket: "2-4"
})
```

This is illustrative, not permission for an object bag. `name` selects one exact compile-time/runtime schema, and excess keys fail. The policy layer adds the safe envelope after validation; an emitter cannot set or override it.

### Server-owned envelope

Every persisted event has only these envelope columns plus its discriminator-specific fields:

| Field | Contract |
| --- | --- |
| `name` | One exact catalog discriminator below. |
| `schema_version` | Small integer assigned by the event catalog. |
| `installation_id` | Random enabled-installation identity from the telemetry store. |
| `participant_id` | Random browser-local identity for interactive events. Never derived from application identity. |
| `telemetry_session_id` | Random short-lived browser/session identity. Never the security session. |
| `occurred_at_minute_utc` | Server receipt time truncated to the UTC minute. |
| `app_version` | Canonical Longtail Forge version from runtime config; never branch/commit/artifact identity. |
| `device_class` | `mobile | tablet | desktop | unknown`, derived locally and validated. |
| `workspace_type` | `business | personal | family | unknown`, server-derived. |
| `role_class` | `installation_admin | workspace_admin | scoped_admin | member | external | unknown`, server-derived from effective role without IDs. |
| `demo_persona` | `workspace_admin | client_admin | project_admin | client_user | project_user | client_external_user | none`, server-validated only on the exact demo. |
| `traffic_class` | `human_or_unknown | first_party_automation`, set only through explicit reviewed runtime/test controls. Health/readiness traffic produces no event. |

The storage adapter uses typed columns/event constraints. It does not persist an arbitrary `properties`, `metadata`, or `context` JSON object. If canonical serialization is needed for sink transport, it occurs only after the exact event schema has constructed and frozen the complete flat object.

### Shared closed enums

- `entry_source`: `direct | navigation | dashboard | workbench | quick_capture | search | notification | linked_context | unknown`
- `action_source`: `dedicated_surface | quick_capture | workbench | dashboard | search | attachment_panel | files_browse | unknown`
- `recurrence_type`: `none | daily | weekly | monthly | custom`
- `tag_count_bucket`: `0 | 1 | 2-4 | 5+`
- `result_count_bucket`: `0 | 1-5 | 6-20 | 21+`
- `security_mode`: `normal | secure`
- `catalog_class`: `none | standard | secure`
- `file_kind`: `image | text | markdown | pdf | office | archive | other | unknown`
- `target_family`: `task | note | list | project | file | other_first_party`
- `workflow_id`: `task_create | task_complete | task_recurrence | note_create | note_edit | note_access | list_create | list_item_complete | tag_assign | file_upload | file_download | file_preview | timer_start | timer_stop | project_create | quick_capture | search`
- `workflow_outcome`: `refused | failed`
- `reason_class`: `permission | public_demo_policy | validation | module_disabled | dependency | conflict | storage | worker | unavailable | unknown`

Module and surface values are accepted only when they resolve through the canonical bundled-module, navigation, view-surface, framework-surface, or module-action catalogs. A future module does not get arbitrary telemetry fields. Adding a new event or property requires a catalog/schema version, typed projector, question mapping, denylist review, compile/runtime negatives, aggregation disposition, and report disposition.

## Recommended initial event catalog

The table lists every event-specific property in addition to the server-owned envelope. No unlisted property is accepted.

| Event | Exact event-specific properties | Question/notes |
| --- | --- | --- |
| `session.started` | none | Participant/session/role/workspace/device/version dimensions are already in the envelope. |
| `surface.viewed` | `surface_id`, `surface_class`, `entry_source` | `surface_id` is a canonical registered safe ID; `surface_class = overview | work | recovery | settings | admin | auth | other`. |
| `module.opened` | `module_id`, `entry_source` | `module_id` must exist in the bundled/active canonical registry; no module label/path. |
| `quick_capture.opened` | `capture_type` | `capture_type = task | note | list | timer | file | reporting | search`. |
| `quick_capture.completed` | `capture_type`, `outcome` | `outcome = completed | canceled | fallback_opened`; completed means the canonical module action reported success. |
| `workflow.outcome` | `workflow_id`, `workflow_outcome`, `reason_class`, `action_source` | Only refused/failed outcomes; no message, status, exception, request, or target. |
| `task.created` | `action_source`, `recurrence_type`, `has_tags`, `tag_count_bucket` | `recurrence_type=none` represents non-recurring. |
| `task.completed` | `action_source`, `recurring`, `series_outcome` | `series_outcome = not_recurring | next_scheduled | series_ended | pending | unknown`. No Task correlation. |
| `task.recurrence_changed` | `change`, `recurrence_type`, `action_source` | `change = added | changed | removed`; no schedule expression/date. |
| `project.created` | `action_source` | Client/Project hierarchy and identity are absent. |
| `timer.started` | `action_source`, `timer_source` | `timer_source = manual | task | other`; no duration/billing/record ID. |
| `timer.stopped` | `action_source`, `timer_source`, `stop_outcome` | `stop_outcome = paused | finalized | removed`; no duration/time-entry identity. |
| `note.created` | `action_source`, `security_mode`, `catalog_class`, `has_tags`, `tag_count_bucket` | Secure use is a class only. |
| `note.edited` | `action_source`, `security_mode`, `catalog_class`, `has_tags`, `tag_count_bucket` | No changed-field list because titles/body/context can leak. |
| `note.accessed` | `action_source`, `security_mode`, `catalog_class` | Supports revisit analysis inside 30 days without a Note ID. |
| `list.created` | `action_source`, `list_class` | `list_class = checklist | procedure | supplies | custom | unknown`; no title/item content. |
| `list.item_completed` | `action_source`, `list_class` | No List/item identity or text. |
| `tag.assigned` | `action_source`, `target_family`, `tag_count_bucket` | Count bucket is effective count after assignment; no tag value/ID. |
| `file.uploaded` | `action_source`, `file_kind` | No filename, extension, MIME string, size, hash, path, target, or scanner state. |
| `file.downloaded` | `action_source`, `file_kind` | Counts successful permission-checked downloads only. |
| `file.previewed` | `action_source`, `file_kind` | Counts successful route-backed previews only. |
| `search.performed` | `action_source`, `result_count_bucket` | Query and result identity/text are forbidden. |
| `demo.persona_selected` | `persona` | `persona` uses the six exact public-demo role classes and must match server-known demo context after authentication; credentials are absent. |
| `interest.cta_opened` | `cta_class` | **Approval required.** `cta_class = learn_more | self_host_interest | saas_interest | early_access | product_news`; no URL, UTM value, or lead identity. |

Events deliberately excluded from the first catalog include raw clicks, hover/scroll/input, page dwell, arbitrary errors, settings values, permission/audit/security events, login failures, record-level lifecycle correlation, comments, notification bodies, search content, and any event whose only purpose is collecting data for possible future questions.

Public API calls, scheduled recurrence generation, workers, imports, webhooks, and other background/server-only mutations are also excluded from the initial participant catalog. A server/domain projector records an interactive mutation only when the request carries a valid telemetry-only browser context created under the approved gate. It must not synthesize a participant from an application user, workspace, API key, security session, job, request, or audit record. Adding non-interactive operational measurement later requires a separate product question and an identity-free event/aggregation design; it cannot reuse this participant envelope implicitly.

## Explicit forbidden-field and content policy

The denylist applies to event keys, aliases, nested keys, serialized output, storage columns, aggregate dimensions, diagnostics, operational telemetry logs, reports, and CTA URLs. Case, snake/camel/kebab variants, common abbreviations, pluralization, and nested placement do not bypass it.

Telemetry must never accept or persist:

- application user ID, username, display/human name, email/alternate email, phone, address, location, birthdate, or other direct identity;
- IP address, forwarded/client IP headers, proxy/network identity, hostname, domain, origin/referrer, or DNS/network metadata;
- user agent, browser, OS, device make/model, screen resolution, exact viewport width/height, language fingerprint, font/canvas/device signals, or a combined fingerprint;
- application workspace ID/name, Client ID/name, Project ID/name, Task ID/title/description/next action/handoff note, Note ID/title/body/content/excerpt/rendered HTML, List or Catalog ID/name/title/item text, tag ID/value/name/slug, File ID/attachment ID/filename/original filename/extension/MIME string/upload/storage path/storage key/hash/size, Search query/result ID/result title/snippet, comment, or any arbitrary application database identifier;
- secure-note plaintext, ciphertext, encrypted payload, key/wrapping/version/nonce/tag metadata, Catalog hierarchy/name/counts, Secure Notes health/key state, or a hint that exposes an inaccessible record;
- free-form text, form values, DOM text, arbitrary labels, arbitrary source/action/reason strings, raw URL/path/query string, raw JSON, arbitrary arrays/objects, `metadata`, `properties`, `context`, `payload`, or a passthrough bag;
- application/security session ID, cookie, authorization header, API key/token, CSRF token, password/hash/reset token, telemetry IDs inside security/audit records, or any credential/secret;
- request ID, trace/correlation ID, audit event/log ID, security event ID, job ID/dedupe key, notification ID, search-index ID, storage operation ID, deployment operation ID, release commit/artifact hash, or other join key;
- exact client timestamp, millisecond/second timestamp, audit/request time copied from another subsystem, duration tied to one participant action, or IP-derived time;
- raw error message, stack trace, exception object, response body, HTTP header set, status payload, scanner/provider output, database path, filesystem path, or runtime secret/config value;
- per-Task/Note/File/Project/List/etc. telemetry ID, hashed/HMAC application record ID, or any stable entity pseudonym;
- a hash/HMAC/encryption of any forbidden identifier or content. Transforming identity is not removal of identity.

The compile-time contract rejects known forbidden keys as excess properties. Runtime schemas reject unknown keys rather than stripping them and pretending collection was safe. A recursive denylist scan runs after schema construction and before sink dispatch as defense in depth; hitting it drops the event, increments a content-free failure class, and cannot fail the product workflow.

## Telemetry identity lifecycle

### Installation identity

- Generate a random UUIDv4-equivalent value from the platform CSPRNG only after telemetry is explicitly enabled and the sink is ready.
- Store it in sink-owned metadata, not the application database/config file, host/domain name, license, or deployment record.
- Disabled startup does not generate it.
- An explicit operator reset rotates it. Reset does not touch Longtail Forge installation/workspace/user IDs and cannot be used as an application restore marker.
- Reset closes future linkage. Existing raw/aggregate retention follows the disclosed reset/deletion decision unless the administrator explicitly chooses the future supported purge operation.

### Participant identity

- Generate a random UUIDv4-equivalent value with the browser CSPRNG only after the server reports telemetry enabled and the approved notice/consent gate permits creation.
- Persist in a telemetry-specific first-party `localStorage` key scoped to the Longtail Forge origin. Do not use an authentication cookie or derive it from login.
- Reuse across visits on that browser/profile/origin. Clearing site data or activating the telemetry reset control creates a new participant.
- Never sync across browsers/devices, restore from application account data, or HMAC `user_id`.
- Never return it in a URL, CTA, normal API response, audit/security entry, access-log field, diagnostic payload, or report.

### Telemetry session identity

- Generate independently in telemetry-specific `sessionStorage`.
- Rotate on logout, 30 minutes of inactivity, or 24-hour absolute lifetime. Tabs/top-level browsing contexts remain separate.
- Preserve the same telemetry session through the public-demo persona choice and successful login only when the approved notice gate already permits it; otherwise create it immediately after the approved gate. It is never the Longtail Forge security session.
- A successful event submission may carry the participant/session IDs only through the dedicated telemetry ingestion contract or explicitly named telemetry-only request context. Any request-local context must be stripped/redacted before generic request, audit, security, and error logging and must never be copied into the application session.

### Server-derived context

The server may use the authenticated request only to derive the coarse `workspace_type`, `role_class`, exact-demo `demo_persona`, and canonical app version. It discards application IDs and names before constructing the event. There is no persistent mapping table from participant to user/workspace. A projector API accepts the telemetry request context plus named safe facts, not the full application session.

### Device class

The browser uses existing responsive semantics:

- `mobile`: viewport at or below 700 px;
- `tablet`: above 700 px through 1024 px;
- `desktop`: above 1024 px;
- `unknown`: unavailable or invalid.

Only the enum is sent. The raw width and every other device characteristic remain local and are discarded.

## Lean Core reuse map

| Lean Core/current owner | Telemetry reuse | Boundary that must remain |
| --- | --- | --- |
| Strict TypeScript/JSDoc programs and `src/types/` | Discriminated event/envelope/sink/metric contracts and excess-property negatives | No `any`, broad records, double casts, runtime `.ts` imports, or new unchecked files |
| Zod/module contract pattern | Runtime validation for untrusted ingest/config and exact schema outputs | Unknown keys rejected; trusted internal safe objects are not repeatedly parsed |
| Internal event bus/module hooks | Observe that a successful domain fact occurred when a safe request-local telemetry context exists | Never pass or spread full `InternalEvent`; hook failure remains isolated |
| Module public entries/services | Module-owned safe projector facts and classifications | Framework does not import module repositories or interpret domain content |
| Module/navigation/view-surface/action catalogs | Closed safe IDs for `module.opened`, `surface.viewed`, and Quick Capture | No raw path/label/URL or speculative telemetry manifest bag |
| App-shell/browser contracts | Enablement bootstrap, canonical version, shared browser helper placement | No user/workspace IDs in telemetry bootstrap; browser state remains module-owned |
| Runtime configuration/readiness | Install-level Off/On, sink selection, safe health classification | No workspace setting; no secrets/paths/identities in diagnostics |
| Permissions/session services | Server-derived coarse role/workspace classes only | No role assignment/user/workspace IDs or persistent mapping |
| Public-demo config/capability/perimeter | Exact-demo opt-in, allowlist, traffic budgets, bot/health exclusion | Local telemetry is not `outbound.analytics`; other outbound capabilities stay disabled |
| Worker/app activation lifecycle | Own one maintenance process and startup/shutdown behavior | Raw identity/leases stay in telemetry store, not workspace Jobs payloads |
| Existing Jobs implementation | Pattern for typed payloads, leasing, retry, idempotency, and observability | Do not use app Jobs storage for participant events because it resets and is workspace-scoped |
| Existing responsive CSS/navigation | Device-class breakpoints | Never transmit width or fingerprint characteristics |
| Audit/security | Independent projection from the same domain fact where needed | No payload/store/identity/failure or reporting coupling |
| Notifications/Search/Resume/Files/Settings | Continue as separate framework projections/services | Telemetry does not query their stores or copy their user-facing/sensitive payloads |

The intended projection shape is:

```text
application/domain fact
    |-- audit/security projection (identifiable, authoritative, separate retention)
    |-- telemetry-safe named projector (pseudonymous, closed, failure-isolated)
    |-- notification/Search/resume projection (permission-shaped, existing owners)
    `-- other module behavior
```

The tree is conceptual. It does not authorize one projection to consume another projection's payload.

## Failure isolation contract

- Disabled telemetry returns immediately without identity, queue, sink, file, or network activity.
- Validation/projector failure drops only that telemetry event and increments an enum-only count such as `invalid_event` or `forbidden_field`; the source data is not logged.
- The bounded in-process delivery queue drops the newest telemetry item when full and increments `queue_full`. It does not block or apply backpressure to business mutations.
- Sink unavailable/busy/corrupt/collector unavailable increments a safe health/error class. Product routes and module transactions still return their normal success/failure.
- Aggregation/pruning failure preserves raw data only until the hard retention enforcement path can safely prune it; it never permits raw retention to grow without an alert/health failure. Recovery is idempotent.
- Operational logs contain aggregate counts and health classes only. They never contain participant/session/installation IDs, event payloads, property values, application IDs, or source error objects.
- Telemetry problems are not audit/security events merely because telemetry failed. Security logs may record a real abuse/security condition independently without telemetry IDs.

## Persistence options and recommendation

| Criterion | Separate SQLite | Append-only JSONL/NDJSON | CSV |
| --- | --- | --- | --- |
| Concurrent writes | WAL, busy timeout, transactions, one clear writer contract | Requires an explicit lock/append discipline; partial lines need recovery | Requires a lock; quoting/newline damage is easy |
| Crash/corruption handling | Atomic transactions, integrity check, WAL recovery | Tail repair and whole-file validation required | Row boundary/quoting recovery is weak |
| Closed schema evolution | Sink-owned schema versions, typed columns/checks | Every reader must understand mixed versions | Column evolution and older rows are awkward |
| 30-day pruning | Indexed transactional delete/checkpoint | Requires file rotation/rewrite/compaction | Requires rewrite/rotation |
| Aggregation/co-occurrence | Indexed SQL and idempotent aggregate transactions | Repeated full scans or a second derived store | Weak querying and type fidelity |
| Atomic aggregate checkpoint | Natural transaction | Separate checkpoint protocol required | Separate checkpoint protocol required |
| Operational visibility | Bounded CLI queries, health, `integrity_check` | Human-readable but easy to misuse as raw log | Human-readable but privacy/error prone |
| Reset isolation/export | Separate file/volume; safe SQLite backup/aggregate export | Separate volume and file copies | Separate volume and file copies |

Recommendation: use a separate SQLite database. It is already an operationally understood dependency, best satisfies concurrency, pruning, aggregation, idempotency, integrity, and export needs, and avoids inventing a log-compaction system. The sink owns its own schema lifecycle; it does not add migrations/tables to `longtail-forge.db`.

For the public demo, mount a second owner-only named volume at a dedicated non-public telemetry root. The hourly reset continues replacing only `/var/lib/longtail-forge` application database/Files state. Deployment, rollback, reset, and backup helpers must explicitly prove which volume each operation may touch. Raw telemetry is not included in workspace exports or normal application backups. Aggregate backup/recovery, if retained, is a separately documented operator action.

The raw store should use typed common/event columns with constraints and catalog/schema versioning. It must not start from or fall back to `telemetry_events(metadata_json)`.

## Retention and aggregate contract

### Raw events

- Hard maximum age: 30 days from `occurred_at_minute_utc`.
- Required maintenance order: validate closed period, compute/recompute aggregate transaction idempotently, verify aggregate checkpoint, prune eligible raw rows, checkpoint safely, and record content-free status.
- Raw reads are available only to the sink-local aggregation/retention owner. There is no raw browser/API/Support View/Runtime Diagnostics/report route.
- No routine report or export includes installation, participant, or telemetry-session identity.

### Durable metrics

Use a closed metric catalog, not arbitrary group-by requests. Durable records may contain a period, metric ID, one approved dimension/dimension value (or one approved pair), numerator, denominator, count, and suppression state. They never contain participant/session identity or a stable hash.

Minimum durable families:

- daily active participants, installations, sessions, and event counts;
- module/surface usage and Quick Capture funnels;
- work-event counts and created/completed ratios;
- feature-pair co-occurrence counts calculated while raw identities exist;
- recurrence, secure-feature, tagging, Files, timer, Search, and demo-persona adoption;
- workspace-type, coarse-role, device-class, app-version, and traffic-class distributions;
- reviewed workflow refusal/failure counts;
- D1/D7/D14/D30 cohort counts and rolling-30-day trends.

"Monthly" outputs are calendar sums/averages of daily metrics plus approved rolling-30-day snapshots. They must not claim unique monthly participants when strict 30-day retention makes that calculation impossible for a 31-day calendar month. The report labels must distinguish `participant_days`, `average_daily_active_participants`, and `rolling_30_day_active_participants` from a unique monthly participant count.

Cross-dimensional, co-occurrence, funnel, and retention exports apply the approved small-cell threshold. Do not add a free-form cube or allow an operator to combine role + workspace + device + persona + event until a single participant is exposed.

## Reporting recommendation

`.34` should add a local operator CLI/package script that reads only the aggregate query service and emits one versioned aggregate JSON or CSV report. It should answer the product-question matrix and expose a safe content-free health summary.

It should not add:

- a telemetry page to Dashboard, Reporting, Settings, Audit, Support View, or Runtime Diagnostics;
- raw-event browsing/export;
- arbitrary SQL, event filters, or group-by dimensions;
- participant/session lookup;
- a remote reporting endpoint;
- a general BI platform.

The post-`0.40` **Settings -> Privacy & Telemetry** surface may later show the catalog, destination, identity reset, retention, safe health, and a bounded typed payload preview. It still must not become a participant browser.

## Public-demo enablement and notice

The exact demo explicitly opts into the local SQLite sink after the privacy/legal gate. Ordinary development, Friends-and-Family Preview, self-host production, and future SaaS remain Off unless their own administrator/deployment enables telemetry.

The exact-demo plan must:

- add reviewed telemetry environment keys to the fail-closed public-demo allowlist and redacted profile;
- keep `outbound.analytics` disabled because no remote collector is used;
- mount telemetry outside the application data volume and prove hourly reset does not erase or replace it;
- keep normal security/access logs server-local and separately retained; do not claim telemetry disables security logging;
- exclude `/healthz`, `/readyz`, `/api/app-info`, reset probes, and known first-party automation through explicit route/runtime/test classification rather than user-agent/device fingerprinting;
- preserve public-demo request/body budgets and apply a bounded telemetry-ingest budget;
- publish the approved disclosure before any participant storage/event creation;
- prove application deploy/rollback/reset and telemetry retention/aggregation are independently recoverable.

Recommended plain-language notice content:

> This public demo uses a random browser identifier to collect privacy-preserving product-usage telemetry across visits, including which features are used, how features are used together, broad device class, and anonymous return patterns. It does not collect names, email addresses, IP addresses, browser or operating-system details, filenames, task or note content, Catalog/Client/Project names, search queries, or other text you enter. Demo interest links go to Raymond Tec; any email you submit there is not connected to prior demo telemetry.

Final wording and consent posture require the approval gate above. The notice belongs at the pre-login public-demo chooser, on the hosted Privacy page, and behind a persistent footer Privacy link. A reset/clear explanation should tell visitors that clearing site data creates a new anonymous participant.

## Interest-capture boundary

Current ownership:

```text
longtailforge.com
    -> Raymond Tec Longtail Forge pages

demo.longtailforge.com
    -> existing Proxmox public-demo host

demo CTA
    -> approved Raymond Tec HTTPS page
       -> WordPress/MailPoet owns identity, consent, lists, and email
```

Only these coarse campaign parameters are permitted:

```text
utm_source=ltf_demo
utm_medium=product
utm_campaign=<approved coarse campaign>
```

No installation, participant, telemetry-session, application-user, role/persona, workspace, device, version, event, or behavior identifier may enter the URL, referrer decoration, form, callback, pixel, or MailPoet record. Longtail Forge does not embed the form or receive a post-submission callback. An optional `interest.cta_opened` event counts only the coarse CTA class before navigation and cannot be joined to the submitted email.

Raymond Tec WordPress owns self-host, SaaS, early-access, and product-news interest plus marketing consent. It is not a telemetry sink. Feedback/free-form submissions remain outside `.34` telemetry for the same reason.

## Future marketing site

Do not convert Raymond Tec WordPress to Multisite.

The future roadmap architecture is:

```text
longtailforge.com
    -> dedicated WordPress installation on raytec-nyc3-01

WordPress database
    -> raytec-nyc3-02

existing Raymond Tec Longtail Forge pages
    -> CTA/migration entry points to the dedicated site
```

That work belongs to the `0.50` public self-host/marketing transition. It is not a telemetry schema, sink, migration, or `.34` implementation prerequisite.

## Hosted collector recommendation

Recommendation: Option C, post-`0.40`, in the `0.60` SaaS wrapper.

The separate local SQLite sink can fully prove:

- opt-in/default-Off behavior;
- identity and closed schemas;
- public-demo longitudinal use;
- 30-day retention and identity-free aggregates;
- failure isolation;
- reporting and reset isolation;
- sink replaceability.

A pre-`0.40` remote collector would add authentication, rate limiting, abuse handling, retry/batching, schema negotiation, network failure, multi-install aggregation, operational hosting, and a new privacy/security perimeter without answering a product question the local demo cannot answer. That is avoidable complexity before the database/integration foundations and SaaS operation exist.

The `0.60` collector plan covers `telemetry.longtailforge.com`, installation authentication without user identity, bounded batching/retry, rate limiting, schema/version negotiation, replay/idempotency, hosted aggregation, multi-install processing, SaaS analytics, isolation/deletion, and incident response. Event emitters remain unchanged behind the sink interface. The public demo should stay local unless later operational evidence and privacy review justify moving it.

## Privacy threat review

| Threat | Prevention and proof |
| --- | --- |
| A projector spreads raw `InternalEvent.metadata`, previous/new values, session, or audit payload | Projector accepts named primitives only; no spread/clone/serialize; source guardrail plus seeded forbidden data snapshots |
| Application IDs are hashed and treated as anonymous | IDs and hashes/HMACs of IDs are both forbidden; random identity only; negative compile/runtime fixtures |
| Participant is mapped to login identity | No mapping table or application ID field; request-local derivation returns only coarse classes; source/storage scans and audit inspection |
| Telemetry IDs leak through logs/errors/audit/security | IDs accepted only at the telemetry boundary/request-local context and redacted before generic logging; failing-sink tests inspect all stores/logs |
| Exact event time allows joining to audit/access logs | Server truncates to UTC minute; no request/audit/trace IDs; no client timestamp; telemetry operational logs omit IDs/payloads |
| URLs/search/referrers leak record IDs or text | Raw URLs, paths, referrers, and queries forbidden; canonical surface/module/action IDs only; browser request inspection |
| Device fields become a fingerprint | One breakpoint enum only; width/resolution/UA/browser/OS/model absent; boundary tests and payload scans |
| Rare role/persona/feature cells identify a participant | Coarse role classes, approved small-cell suppression, no free-form dimension drill-down |
| Secure Notes/Catalogs reveal existence/content | Boolean/class only, no entity identity/count/title/body/encryption data; explicit/inherited secure negative fixtures |
| File event reveals a unique file | Coarse file kind only; no name/extension/MIME/size/hash/path/target; seeded file metadata cannot change output |
| Long-term aggregates secretly retain participant hashes | Schema and row scans reject participant/session columns/values in durable tables; no stable daily pseudonym |
| Raw retention silently exceeds 30 days after maintenance failure | Hard-cutoff verification/alert health, idempotent aggregation-before-prune, clock/failure recovery tests |
| Public-demo reset erases or accidentally backs up telemetry with app state | Separate volume/path and explicit helper allowlists; two-reset survival plus restore-isolation proof |
| A hosted sink silently activates outbound traffic | Default Off, destination allowlist, local `.34` sink only, `outbound.analytics` remains disabled, no-network tests |
| CTA or WordPress submission deanonymizes prior behavior | Fixed URL/query allowlist; no IDs/behavior/referrer decoration; no callback/pixel; seeded URL inspection |
| Bots/health checks distort usage or trigger browser identity | Health routes produce no telemetry; known owned automation uses explicit runtime/test classification; no UA fingerprint |
| Future module adds arbitrary telemetry fields | Central catalog/schema/projector/question/denylist/aggregation/report checklist and excess-property/runtime failure |
| Operator CLI becomes a raw participant browser | Aggregate query service only, no raw connection/filter/SQL, no IDs, small-cell suppression, output schema scan |
| Telemetry failure affects product work | Non-blocking bounded queue, sink exceptions contained, product transaction/response assertions under failure/full/corrupt sinks |

## Required negative-control suite

At minimum, implementation and closeout must prove:

- default Off, no identity generation, no browser storage, no file/database creation, no event persistence, and no network activity;
- exact-demo enablement is explicit and ordinary/self-host defaults remain Off across fresh install and upgrade;
- unknown event types, unknown properties, wrong-discriminator properties, nested unknowns, and arbitrary metadata/property/context/payload bags are rejected;
- every forbidden-field alias and seeded user-entered text value is absent from accepted events, raw rows, aggregates, logs, diagnostics, reports, and CTA URLs;
- IP/forwarded IP, user agent/browser/OS/device details, application user/workspace/record IDs, request/audit/trace/security IDs, raw URL/search query, and raw viewport width are absent;
- only the coarse device enum survives at the 700/701/1024/1025 boundaries;
- server time is minute-level UTC and client/exact source times cannot override it;
- participant persists across visits as designed, telemetry session rotates as designed, site-data/reset creates a new participant, and no cross-device/app-user derivation exists;
- no per-entity telemetry identifier is created or inferred;
- failing/slow/full/corrupt sinks, malformed events, queue overflow, and aggregation/prune failure never break normal application workflows;
- raw events expire at 30 days after idempotent aggregation and no durable aggregate table contains participant/session identity or stable hashes;
- aggregate/report math matches seeded funnels, co-occurrence, recurrence, secure-use, version, workspace/role/device/persona, and D1/D7/D14/D30 fixtures;
- approved small cohorts are suppressed and no free-form dimension combination can bypass suppression;
- demo reset preserves telemetry while application restore/reset does not copy, erase, or ingest it;
- interest redirects carry only approved origin/path/UTM values and cannot receive telemetry/application identity or behavioral identifiers;
- security/audit logging remains operationally unchanged and separate, with no telemetry IDs/payloads;
- future module catalog additions fail closed until their typed event/projector/privacy/aggregation/report dispositions exist;
- source scans reject telemetry imports of audit/security repositories and reject spreading/serializing raw internal events, requests, sessions, or domain records.

## Implementation checkpoint map

The roadmap deliberately uses thirteen protected checkpoints because the real blast radii are distinct: policy, typed schemas, runtime/sink policy, identity/ingestion, durable storage, retention/aggregation, two module-projection cohorts, browser surfaces, reporting, demo operations/privacy, interest handoff, and final privacy closeout. Combining these would cross security/storage/browser/deployment boundaries; splitting them further would create ceremony without additional isolation value.
