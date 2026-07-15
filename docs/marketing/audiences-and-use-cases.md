# Audiences and Use Cases

This document describes who Longtail Forge is for and what jobs it helps them do. It defines an audience model without pretending every audience needs identical emphasis at launch, and without inventing demographic precision (no fabricated firm sizes, revenue, or counts).

Status labels follow the [hub vocabulary](README.md#status-vocabulary-used-throughout): **Current**, **Private preview**, **Planned**, **Commercial hypothesis**, **Idea**.

## Audience model at a glance

| Audience | Role at launch | Primary hook |
| --- | --- | --- |
| A. Freelancers & small service businesses | **Initial acquisition wedge** | Resume interrupted client work without rebuilding context. |
| B. Support & operations teams | Committed roadmap workflow (Support Tickets) | Move requests to resolution while preserving internal/client context. |
| C. Creators & authors | Committed roadmap workflow (Creator Studio) | Move ideas through drafting, production, publishing, repurposing. |
| D. Self-hosters & privacy-conscious users | Cross-cutting | Own your data on your own server, transparent AGPL core. |

The wedge is A. B and C are committed directions used to show where the product is going, clearly labeled planned until their modules ship.

---

## A. Initial acquisition wedge — freelancers and small service businesses

Approximately one to ten internal users. Examples:

- web / IT consultants
- small agencies
- technical support providers
- managed-service businesses
- solo consultants
- service firms handling several active clients

### Service-business personas

These personas are **illustrative composites** for messaging and demo design, not real people or customers.

- **Solo web/IT consultant** — several small retainer and project clients at once, constantly interrupted by "quick" requests, bills by tracked time, loses momentum every time a task is dropped mid-stream.
- **Two-to-five person agency** — a couple of people sharing clients and projects; work gets handed between them, and handoffs lose context. Needs shared tasks, notes, and time that stay attached to the client/project.
- **Managed-service / technical support provider** — reactive work all day; today it lives in email and memory. Wants requests to become trackable work with time and a preserved resolution. (Best served once **Support Tickets** ships — Planned.)

### Jobs to be done

- When I sit down, help me see what needs attention and pick one useful thing to start. **(Current — Dashboard, Workbench)**
- When I come back to a job I dropped, let me resume without re-reading everything. **(Current — Workbench Task Focus, resume notes, next actions)**
- Keep the task, its notes, files, and time in one connected place per client/project. **(Current)**
- Let me track time where the work actually happens, not in a separate app. **(Current — task timers, manual entry)**
- Turn an incoming request into tracked work and preserve how it was resolved. **(Planned — Support Tickets 0.34, Knowledge Base 0.35)**

### Pains

- frequent interruptions
- many small concurrent clients/projects
- work left half-finished for valid reasons
- details spread across tasks, notes, email, files, and timers
- difficulty reconstructing context after a switch
- time tracking disconnected from the actual work

### Desired outcomes

- lower reconstruction tax when resuming
- a trustworthy "what's next" without decision fatigue
- time history captured where work happens, ready for billing/reporting
- knowledge preserved so the same problem is not re-solved from scratch

### Objections (and honest responses)

- *"Is this just another task manager?"* — No; Tasks are one module. The point is connected context and resuming, with Workbench as the resume surface. See [positioning](positioning-and-messaging.md#differentiation).
- *"Is it production-ready / safe on the internet?"* — Not yet for public internet use. It is in private preview; internet-exposure hardening and preview readiness are active roadmap work (0.33.16, 0.33.17).
- *"Do I have to self-host?"* — Today, yes. A hosted option is planned later (no date, no price).
- *"Will it replace my ticketing / content tools today?"* — No. Those modules are planned, not shipped.

### Relevant features (current vs planned)

Current: Workspaces, Clients/Projects, Tasks, Time Tracking, Notes, Lists, Files, Search, Notifications, Reporting, Dashboard, Workbench. Planned: Support Tickets, Knowledge Base, Creator Studio, Calendar.

---

## B. Support and operations

**Support Tickets is a committed first-party core module — Planned (roadmap 0.34), not shipped.** Do not describe it as a future optional experiment contingent on outside demand; label it as a committed roadmap workflow until it ships.

### Use cases (Planned)

- internal requests
- client support
- technical support
- service follow-up
- customer issue tracking
- turning ticket work into tasks
- attaching internal notes and client-visible replies
- tracking time against a ticket
- preserving resolutions in Knowledge Base (Planned — 0.35)

### Jobs to be done (Planned)

- Capture a request and move it through resolution without losing internal context.
- Keep internal notes separate from client-visible replies.
- Track the time a request actually cost.
- Turn a resolved request into a reusable knowledge article.

### Pains

- requests scattered across email and memory
- no connection between a request, the work it created, and the time it took
- resolutions not preserved, so the same issue is re-diagnosed later

### Desired outcomes (Planned)

- requests become trackable, time-attributed work
- resolutions become durable reference material
- client-facing and internal context stay correctly separated

### Honest status line for this audience

> Support Tickets is a committed first-party module on the roadmap (targeted at 0.34), not yet available. The support workflow above describes where the product is going.

---

## C. Creators and authors

**Creator Studio is a committed first-party core module — Planned (roadmap 0.39), not shipped.**

### Audience examples

- YouTube creators
- TikTok / Shorts / Reels creators
- bloggers
- newsletter publishers
- small content teams
- aspiring and working authors
- agencies managing client content

Keep creator and author language distinct — do not force aspiring authors into social-video terminology, and do not force video creators into manuscript terminology.

### Use cases (Planned)

Shared: ideas, research, review, publication history, repurposing, derivative content.
Creator-leaning: scripts, production/revision tasks, assets, publishing calendar.
Author-leaning: outlines, chapters, drafts, manuscript revision.

### Jobs to be done (Planned)

- Move an idea through drafting, production, publishing, and repurposing without it falling out of view.
- Keep research, drafts, assets, and production tasks connected to the piece.
- See a publishing calendar and a history of what shipped.

### Pains

- ideas and drafts scattered across notes apps, docs, and folders
- no throughline from idea to published to repurposed
- production tasks disconnected from the content they belong to

### Desired outcomes (Planned)

- a connected pipeline from idea to publication to repurpose
- research and assets preserved with the work
- less lost context between production sessions

### Honest status line for this audience

> Creator Studio is a committed first-party module on the roadmap (targeted at 0.39), not yet available. Today, creators and authors can already use Notes, Tasks, Files, Lists, and Time to organize content work; Creator Studio adds the dedicated pipeline later.

---

## D. Self-hosters and privacy-conscious users

This is a cross-cutting audience that overlaps with A, B, and C.

### What to explain

- **Public AGPL core** — the app is open-source under AGPL-3.0-only; you can study, modify, and run it.
- **Self-hosting** — run it on your own server; migrations run on start; data lives in your `data/` directory.
- **Data control** — your workspace data stays on infrastructure you control.
- **Official hosted service planned later** — for people who do not want to run a server (Commercial hypothesis; no date/price).
- **Managed private instances planned later** — higher-touch hosted deployments (Commercial hypothesis).
- **Operator responsibility** — with self-hosting, the operator owns the server, TLS, backups, updates, and access.
- **Current preview limitations** — internet-exposure hardening and tested backup/restore are active roadmap work (0.33.16, 0.33.17); until then internet use is private preview, not production-ready.

### Honest guardrail

> Self-hosting does not automatically make an installation secure. A safe deployment still requires following the documented setup (reverse proxy, TLS, backups, access control). Do not imply otherwise.

### Jobs to be done

- Keep client/business data on my own infrastructure. **(Current)**
- Understand exactly what data the app stores and where. **(Current — see [FAQ](faq-draft.md))**
- Have a supported, tested upgrade and backup path. **(Private preview — 0.33.17 backup/restore and packaging)**

### Desired outcomes

- data sovereignty and transparency
- a path to hosted convenience later without giving up the self-host option

---

## Cross-audience notes

- The connective tissue — resuming interrupted work and preserving knowledge — is what all four audiences share. Lead with that, then show the audience-specific workflow.
- Supportive-of, not clinical: for users who struggle with context switching or working memory, frame Longtail Forge as helpful for recovery and momentum, never as a treatment.
- When any audience's headline capability is Planned, say so in the same breath.
