# Module Contract

Longtail Forge modules are static ESM records registered from `src/core/modules/registry.js`. The contract stays plain JavaScript while the framework boundary is still settling.

Each module definition should include:

- `id`: stable kebab-case identifier used in storage, settings, and checks.
- `name` and `displayName`: database/module label and UI label.
- `description`, `category`, and `version`: registry metadata stored in `modules`.
- `enabledByDefault`: whether new workspaces should start with the module enabled.
- `historicalReadAccess`: whether disabled modules still allow read-only access to old records. The default decision is yes for data modules and no for admin modules.
- `browserApiRoutes`: Express routers mounted under `/api` for signed-in browser use.
- `publicApiRoutes`: module-owned public API routers mounted under `/api/v1` after the core public routes.
- `protectedViewsDir` and `browserAssetsDir`: ownership hints for module pages and browser scripts.
- `migrationsDir`: module-owned migration folder. Core migrations still run first.
- `seedHooks` and `repairHooks`: reserved arrays for future startup work after migrations.
- `navigation`: links the app shell can consume when navigation becomes fully module-driven.
- `dashboard`: panel descriptors the Dashboard can consume when it becomes fully module-driven.
- `publicApiEndpoints`: stable endpoint descriptors used by documentation and future API discovery.
- `requiredPermissions`: permissions the module expects roles to provide.
- `settings`: module-owned settings descriptors that Workspace Settings can render. A setting with `moduleStatus: true` controls the module enablement row; related sub-options can use `moduleStatus: false`.
- `workspaceCapabilityRequirements`: workspace capability keys that make the module relevant.

Disabled-module policy:

- Disabled modules should block create, update, delete, and other write paths through shared framework helpers.
- Disabled data modules may keep historical read-only access when `historicalReadAccess` is true.
- Navigation should hide disabled-module links from ordinary app chrome, but server-side checks remain authoritative.

The Time Tracking module is the reference implementation for the 0.30.x cleanup path.

The Tasks module is the reference implementation for a workflow module that spans browser routes, public API routes, Dashboard metadata, scoped permissions, lifecycle audit records, reminder/recurrence helpers, and optional timer linkage into another module. Task public API routes intentionally reuse the browser task service so assignment eligibility, recurrence completion, archive/restore, module-disabled write blocking, and audit behavior stay centralized.

Modules that link to records owned by another module should validate both module enablement states before writing. Task Timers demonstrate this pattern: they require Tasks, Time Tracking, and the Tasks sub-option to be enabled, but active timer state is stored through Time Tracking's unified active timer service with Tasks source metadata. Finalized task timers write completed work into Time Tracking with a durable `task_id` link for reporting.

The 0.31.9 Workbench page is framework-owned and currently uses pragmatic first-party bootstrap wiring. Later registry work should replace that wiring with declared Workbench cards, timer sources, and workbench item sources.
