# FAQ Draft

Draft answers for a public FAQ. Answers stay truthful about current-versus-planned status, link to authoritative technical/legal docs rather than duplicating them, and avoid security absolutes and invented dates/prices.

---

### What is Longtail Forge?

Longtail Forge is a self-hosted, open-source work hub for freelancers and small service teams. It connects your projects, tasks, notes, files, lists, and time so work that gets interrupted is easy to pick back up. The idea in one line: *pick up the work without rebuilding the context.* See the [product overview](../../README.md).

### How is Dashboard different from Workbench?

**Dashboard tells you what's happening; Workbench helps you begin.** Dashboard is orientation — what needs attention, today/upcoming context, and useful summaries. Workbench is momentum — it helps you choose a focus, resume interrupted work, see the connected context, and pick a useful next action. See [product-notes](../product-notes.md).

### Is it a task manager?

Tasks are one part of it, not the whole point. Plenty of tools give you a task list; Longtail Forge focuses on keeping tasks connected to their notes, files, time, and context so you can **resume** work, not just list it. If all you need is a checklist, it's more than you need.

### Is it for teams or individuals?

Both, at a small scale. It works for a solo consultant and for a small team (roughly one to ten internal users) sharing clients and projects, with workspace-scoped, permission-aware access. It is not currently aimed at large organizations.

### Is it self-hosted?

Yes. Today Longtail Forge runs as a self-hosted app on your own server; your workspace data lives in a directory you control. Self-hosting means you're responsible for the server, TLS, backups, updates, and access — the app and docs help, but a safe deployment depends on following the [setup](../../README.md#getting-started). Self-hosting alone does not make an install secure.

### Is there a hosted version?

Not yet. An official hosted (SaaS) version and managed private instances are **planned for later**, for people who'd rather not run a server. There's no date and no pricing committed. See the [launch plan](launch-plan.md).

### What data does it store?

Your workspace data: clients/projects, tasks, notes, lists, files you attach, time entries, and audit logs of security-relevant actions. On a self-hosted install, all of it lives on your server. See [architecture.md](../architecture.md) for how data and modules are structured.

### What is currently available?

Today (through version 0.33.13.5): workspaces with roles and permissions; clients and projects; time tracking; Tasks (with next actions, resume notes, checklists, reminders, recurrence, task timers); Notes (with Markdown, links, revisions, tags, files, and encrypted-at-rest secure notes); Lists; Files; Search; Notifications; Reporting; and the Dashboard and Workbench surfaces. See the [feature-outcome map](feature-outcome-map.md) for details and status.

### Are Tickets, Knowledge Base, and Creator Studio available yet?

No. **Support Tickets, Knowledge Base, and Creator Studio are committed first-party modules on the roadmap, not shipped yet** (targeted at 0.34, 0.35, and 0.39 respectively). They describe where the product is going. Today you can already organize similar work with Tasks, Notes, Files, and Lists. See the [ROADMAP](../../ROADMAP.md).

### What does AGPL mean at a high level?

Longtail Forge Core is licensed under AGPL-3.0-only. In plain terms: you can use, study, modify, and self-host it for free, including commercially. If you modify it and offer the modified app to others over a network, the AGPL requires you to make that modified source available. This is a high-level summary, not legal advice — see [licensing.md](../licensing.md) and the [software license](../licensing/software-license.md).

### Can a business use it?

Yes. Commercial use of the AGPL version is allowed, subject to the AGPL. Separate commercial licenses, hosted services, support plans, and managed deployments may be offered later by Michael York d/b/a Raymond Tec. For organizations that can't comply with AGPL obligations, commercial license exceptions are part of the [commercial model](../licensing/commercial-viability-plan.md).

### Is it secure?

Longtail Forge is built with permission-aware, workspace-scoped access and audit logging, and internet-exposure security hardening is active near-term roadmap work (0.33.16). We don't make absolute security claims: no product is "unhackable," and we don't claim external audits, penetration tests, or compliance certifications we haven't done. Until the hardening and preview-readiness work ships, treat internet use as a **private/technical preview**, and if you self-host, follow the documented secure-deployment setup. See [accessibility.md](../accessibility.md) and the roadmap security sections.

### Are Secure Notes zero-knowledge?

**No.** Secure notes are encrypted at rest: each note body is encrypted with a per-note key, wrapped by a server-managed key that lives outside the database. But a configured app server can decrypt secure note bodies, and note titles remain plaintext metadata — so it is **not** zero-knowledge and shouldn't be treated as a vault for critical secrets. Operators must back up the server-side key outside the database; losing it can make encrypted content unrecoverable. See the Secure Notes model in [architecture.md](../architecture.md).

### Can it replace a full enterprise ticketing / ERP / content platform today?

No. Longtail Forge is designed for freelancers and small service teams, not as a replacement for enterprise ticketing, ERP, or large content platforms. The support and content modules are planned, not shipped, and even when they ship they target small-team workflows. It is deliberately not an "all-in-one" that replaces every tool.

### What are the current preview limitations?

- Internet-exposure hardening and tested backup/restore are still being finalized (roadmap 0.33.16 / 0.33.17); until then, internet use is a private/technical preview, not production.
- Supported scale is small-office: SQLite for roughly 50 total users and about 5–15 concurrent, on one server. PostgreSQL is required before any shared hosted or larger-scale use.
- No hosted version yet; self-hosting only.
- Support Tickets, Knowledge Base, and Creator Studio are planned, not available.
- Notifications are in-app only today (no email/push/Slack yet).
- No uptime, backup, security, or compliance guarantees — this is early software.

See the [ROADMAP](../../ROADMAP.md) for the current plan and the [claims register](claims-and-proof-register.md) for how these statements are kept honest.
