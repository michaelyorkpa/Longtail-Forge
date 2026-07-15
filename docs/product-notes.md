# Longtail Forge Product Notes

Longtail Forge started as a time tracker and is becoming a small-project operations hub for freelancers, small agencies, self-hosted teams, and personal/family workspaces. This is the short product-shape companion to `ROADMAP.md`; keep it shorter than the roadmap and let the roadmap own version-level detail.

## Core Positioning: Context Recovery

The product promise is: **pick up the work without rebuilding the context.** Longtail Forge is designed for work that is frequently interrupted, spread across several clients/projects, or hard to resume after a context switch. Its differentiation is not the largest feature count; it is keeping enough connected work context that a user can understand what is happening, choose a useful focus, begin without reviewing twenty lists, resume interrupted work, leave a handoff to their future self, and preserve useful knowledge afterward.

The detailed messaging, audience, and claim discipline live in the marketing hub ([marketing/README.md](marketing/README.md)); this file records the product shape those documents describe.

## Product Shape

- Framework services provide shared infrastructure: workspaces, users, permissions, settings, module lifecycle, audit logging, public API foundations, events, accessibility expectations, notifications, tags, and search.
- First-party modules provide workflow tools. Current shipped modules are Clients and Projects, Tasks, Time Tracking, Notes, and Lists. Support Tickets, Knowledge Base, and Creator Studio are committed future public-core first-party modules; Calendars and other roadmap modules follow their active plans.
- Longtail Forge is a product first. Its framework exists to support the product and official modules, not to grow generic extension points for their own sake.
- Business workspaces support clients and client-linked projects. Personal and Family workspaces use workspace projects without client records.

## Dashboard and Workbench

Use the distinction consistently: **Dashboard tells me what is happening; Workbench helps me begin.**

- **Dashboard** is the permission-safe orientation and summary surface: workspace pulse, attention, today/upcoming and calendar context, and useful summaries with a clear entry into active work. It should not become an analytics cockpit or the place every detailed action must happen.
- **Workbench** is the daily momentum surface: focus selection, resuming interrupted work, choosing a useful next action, Task Focus, connected context, timers, next actions, and resume notes as a handoff to the user's future self. It is not merely another task list.

## Audiences and Use Cases (summary)

The initial acquisition wedge is freelancers and small service businesses (roughly one to ten internal users): consultants, small agencies, technical-support and managed-service providers handling several active clients. Support and operations teams are served by the planned Support Tickets module; creators and authors by the planned Creator Studio module; self-hosters and privacy-conscious users by the public AGPL core and (later) hosted/managed options. Full personas, jobs-to-be-done, pains, and objections are in [marketing/audiences-and-use-cases.md](marketing/audiences-and-use-cases.md).

## Current vs Planned Status

- **Shipped (through 0.33.13.5):** Workspaces/roles/permissions, Clients/Projects, Time Tracking, Tasks, Notes, Lists, Files, Search, Notifications, Reporting, Dashboard, Workbench.
- **Preview-readiness (near-term roadmap):** internet-exposure security hardening (0.33.16) and reproducible preview packaging with tested backup/restore and CI (0.33.17). Until these ship, internet use is a private/technical preview, not production.
- **Planned first-party modules:** Support Tickets (0.34), Knowledge Base (0.35), Calendar (0.36), Creator Studio (0.39). Do not describe these as available.
- **Later commercial/hosted:** official hosted SaaS and managed private instances (require PostgreSQL and the commercial prerequisites first).

The latest completed major roadmap version is 0.33.13 (Lists UI/UX), and the active cursor is 0.33.14.1 (the narrow editable-field primitive), followed by contributed Settings, security hardening, preview packaging/backup/CI, maintainability cleanup, and then Support Tickets and Knowledge Base.

## Documentation Split

- `README.md` stays short and navigable.
- `ROADMAP.md` is the active detailed plan.
- `CHANGELOG.md` records completed release notes.
- `DECISIONS.md` records settled product and architecture decisions.
- `docs/architecture.md` and `docs/module-contract.md` explain the current framework/module direction.
- `docs/marketing/` holds the product-marketing foundation (positioning, audiences, demos, preview/launch plans, and the claims-and-proof register); it describes the product truthfully and defers to `ROADMAP.md` for version detail.

## Product Rules To Preserve

- Apply the Two-Module Rule to new generalized framework facilities: normally require two real first-party consumers with materially similar behavioral contracts, do not invent a second consumer, keep one-module needs module-owned, and document intrinsically framework-wide exceptions. The planned 0.33.14 field primitive qualifies through the current renderer, Reporting, and Settings.
- Disabled modules preserve data and block normal writes.
- Historical reads are allowed only when a module explicitly permits them.
- Tags must not become the source of truth for security, billing, visibility, workflow status, or archival state.
- Direct tags are tags a user assigns on the current record. Propagated tags are inherited from related records such as clients, projects, or tasks and can be hidden from the current record without deleting the parent tag. Effective tags are the combined direct, propagated, and system tags used for simple tag filters and discovery.
- Search is for discovery, not accounting/reporting truth.
- Audit log is the authoritative admin/security history; activity feeds and notifications are user-facing summaries built from safer contracts.
