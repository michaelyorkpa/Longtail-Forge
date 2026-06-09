# Longtail Forge Product Notes

Longtail Forge started as a time tracker and is becoming a small-project operations hub for freelancers, small agencies, self-hosted teams, and personal/family workspaces.

## Product Shape

- Framework services provide shared infrastructure: workspaces, users, permissions, settings, module lifecycle, audit logging, public API foundations, events, accessibility expectations, notifications, tags, and search.
- First-party modules provide workflow tools: Clients and Projects, Tasks, Time Tracking, and future modules such as Notes, Support Tickets, Calendars, Messaging, Lists, and Creator Studio.
- Workbench is the daily live-work surface. Dashboard remains the overview surface.
- Business workspaces support clients and client-linked projects. Personal and Family workspaces use workspace projects without client records.

## Current Branch Focus

The 0.31.x branch completed the core Tasks and module-readiness work needed before shared framework services expand. The 0.32.x roadmap starts notifications, tags, and search as framework-owned services rather than module-owned one-offs.

## Documentation Split

- `README.md` stays short and navigable.
- `ROADMAP.md` is the active detailed plan.
- `CHANGELOG.md` records completed release notes.
- `DECISIONS.md` records settled product and architecture decisions.
- `docs/architecture.md` and `docs/module-contract.md` explain the current framework/module direction.

## Product Rules To Preserve

- Disabled modules preserve data and block normal writes.
- Historical reads are allowed only when a module explicitly permits them.
- Tags must not become the source of truth for security, billing, visibility, workflow status, or archival state.
- Direct tags are tags a user assigns on the current record. Propagated tags are inherited from related records such as clients, projects, or tasks and can be hidden from the current record without deleting the parent tag. Effective tags are the combined direct, propagated, and system tags used for simple tag filters and discovery.
- Search is for discovery, not accounting/reporting truth.
- Audit log is the authoritative admin/security history; activity feeds and notifications are user-facing summaries built from safer contracts.
