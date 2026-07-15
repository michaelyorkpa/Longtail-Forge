# Positioning and Messaging

This is the **canonical message hierarchy** for Longtail Forge. Other marketing documents defer to it. Refine wording here only where it materially improves clarity, and keep every capability claim consistent with [claims-and-proof-register.md](claims-and-proof-register.md).

## Canonical headline

> **Pick up the work without rebuilding the context.**

## Supporting statement

> Longtail Forge connects projects, tasks, notes, files, lists, time, support requests, and publishing work so the next useful action stays close at hand.

Note on honesty: support requests (Support Tickets) and publishing work (Creator Studio) are **committed planned modules**, not shipped. The supporting statement describes the connected product direction; in any surface where the reader could mistake it for a current feature list, pair it with the current-product status wording below.

## Existing brand line (preserve)

> **Plan the project. Track the work. Preserve the knowledge.**

## One-sentence description

> Longtail Forge is a self-hosted work hub that keeps your projects, tasks, notes, files, lists, and time connected, so interrupted work is easy to resume.

## 50-word description

> Longtail Forge is a self-hosted work hub for freelancers and small service teams. It connects projects, tasks, notes, files, lists, and time tracking so work that gets interrupted stays easy to resume. Dashboard shows what is happening; Workbench helps you begin. Support Tickets, Knowledge Base, and Creator Studio are planned.

## 100-word description

> Longtail Forge is a self-hosted work hub built for work that is frequently interrupted, spread across several clients, and hard to resume after a context switch. It connects projects, tasks, notes, files, lists, and time tracking so the details of a job stay in one connected place instead of scattered across tabs, folders, and memory. Dashboard tells you what is happening; Workbench helps you choose a focus, resume what was interrupted, and leave a handoff to your future self. It is open-source under AGPL and runs on your own server. Support Tickets, Knowledge Base, and Creator Studio are committed planned modules.

## Elevator pitch

> Most work tools assume you finish what you start. Real client work gets interrupted constantly, and the expensive part is not doing the task — it is rebuilding the context every time you come back to it. Longtail Forge keeps projects, tasks, notes, files, lists, and time connected around the actual work, so you can put something down and pick it back up without re-reading twenty separate lists. Dashboard shows what needs attention; Workbench helps you begin and leaves a trail for the next time. It is self-hosted and open-source, with support-desk and content-publishing modules on the roadmap.

## Problem statement

Work in a small service business rarely happens start-to-finish. A consultant juggles several clients at once, gets pulled away mid-task, and comes back hours or days later. By then the context — what was in progress, what the next step was, why something was blocked, where the file is, how much time was already logged — has scattered across tasks, notes, email, folders, and memory.

The costly part is not the work itself. It is the **reconstruction tax**: the minutes (or the abandoned thread) every time someone tries to figure out where they were. Tools that optimize for capturing more things, or for a prettier task list, do not reduce that tax. Reducing it requires keeping enough connected context that a person can orient, choose a focus, and resume — without a full re-read.

## Differentiation

Longtail Forge's differentiation is **not** that it has the most features, and it should not be marketed as "all-in-one."

Its differentiation is that it keeps enough work context connected to help a user:

- understand what is happening;
- choose a useful focus;
- begin without reviewing twenty separate lists;
- resume interrupted work;
- leave a handoff to their future self;
- preserve useful knowledge after the work is complete.

The product philosophy behind this (from the [README](../../README.md)):

- Never make the user rebuild context from memory.
- Never show twenty choices when one next action will do.
- Never punish drift; help the user recover.
- Make work visible, startable, and resumable.

### Dashboard vs Workbench (use consistently)

> **Dashboard tells me what is happening. Workbench helps me begin.**

- **Dashboard** — orientation: workspace pulse, what needs attention, today/upcoming context, calendar context, useful summaries, and a clear entry into active work. It is an orientation surface, not a giant analytics cockpit.
- **Workbench** — momentum: focus selection, resuming interrupted work, choosing a useful next action, Task Focus, connected context, timers, next actions, and resume notes / handoff to future self. It is a work surface, not merely another task list.

Public demonstration and the first public screenshots should be **Workbench-first**.

## Current product status wording

Use plain, current-tense language for what ships today, and label everything else.

> Longtail Forge is in active development and is currently used privately. Today it runs as a self-hosted app with workspaces, clients and projects, tasks, time tracking, notes, lists, files, search, notifications, and reporting. A friends-and-family private internet preview is planned once security-hardening and preview-readiness work is complete; until then, describe internet use as **private preview**, not production-ready.

Do **not** call the app production-ready for public internet use until the roadmap's required security and preview-closeout work (0.33.16 hardening and 0.33.17 preview readiness) has actually shipped. Use "private preview" or "technical preview."

## Self-hosted wording

> Longtail Forge Core is open-source under AGPL-3.0-only. You can run it on your own server and keep your data under your control. Self-hosting means you are responsible for your deployment — the server, TLS, backups, updates, and access. Self-hosting does not by itself make an installation secure; a safe deployment still requires the operator to follow the documented setup.

See [../licensing.md](../licensing.md) and the self-hosting setup in the [README](../../README.md#getting-started).

## Planned hosted-service wording

> An official hosted (SaaS) version and managed private instances are planned for later, so people who like the product but do not want to run a server can use it without self-hosting. These are not available yet, no pricing is committed, and no launch date is promised.

See the [launch plan](launch-plan.md) and [pricing hypotheses](pricing-and-packaging-hypotheses.md).

## Language to use

- interruption-resistant; context recovery; resume work; next useful action
- connected work context; preserve knowledge
- self-hosted; transparent; open-source (under AGPL)
- first-party modules; private preview; technical preview
- designed for freelancers and small service teams
- useful for creators and authors (with Creator Studio labeled planned)

## Language to use carefully (only when true and qualified)

- open source — correct for the AGPL core; do not imply the hosted/commercial layer is open.
- secure / private — describe specific, real behaviors; never as an absolute guarantee.
- enterprise-ready, scalable — avoid for the current preview; supported scale is small-office (see status wording).
- all-in-one, productivity, intelligent, recommendation, automation — avoid leading with these; they invite feature-list and hype framing.

## Language to avoid (unless independently proven and narrowly qualified)

unhackable; military-grade; zero-knowledge; fully compliant; enterprise-grade security; guaranteed; automatic backup protection; AI-powered; replaces every tool; eliminates context switching; cures or treats ADHD; built for everyone; production-ready; unlimited scale.

## Positioning guardrails

- Do not lead with "all-in-one."
- Do not market Longtail Forge primarily as an ADHD or medical product. It may be **supportive** of people who struggle with context switching, drift, working memory, or executive function, but public positioning stays broadly useful and makes no clinical claims.
- Do not describe planned modules (Tickets, Knowledge Base, Creator Studio) as available.
- Do not state or imply Secure Notes is zero-knowledge (see [architecture.md](../architecture.md) — a configured app server can decrypt secure bodies).
- Do not invent customers, testimonials, numbers, audits, certifications, uptime, guarantees, dates, prices, or benchmarks.
- Do not attack competitors or publish competitor prices/claims.
